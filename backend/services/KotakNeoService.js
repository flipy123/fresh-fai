import fetch from 'node-fetch';
import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { authenticator } from 'otplib';

export class KotakNeoService extends EventEmitter {
  constructor() {
    super();
    this.baseUrl = 'https://gw-napi.kotaksecurities.com';
    this.wsUrl = 'wss://mlhsi.kotaksecurities.com';
    this.accessToken = null;
    this.sid = null;
    this.rid = null;
    this.hsServerId = null;
    this.websocket = null;
    this.masterData = null;
    this.subscribedTokens = new Set();
    this.userId = null;
    this.mobileNumber = null;
    this.password = null;
    this.consumerKey = null;
    this.consumerSecret = null;
    this.totpSecret = null;
    this.ucc = null;
    this.viewToken = null;
    this.tradeToken = null;
  }

  async initialize() {
    try {
      if (!process.env.KOTAK_CONSUMER_KEY || !process.env.KOTAK_MOBILE_NUMBER || !process.env.KOTAK_PASSWORD) {
        console.log('⚠️ Kotak Neo credentials not configured. Please update your .env file with valid credentials.');
        console.log('Required: KOTAK_CONSUMER_KEY, KOTAK_CONSUMER_SECRET, KOTAK_MOBILE_NUMBER, KOTAK_PASSWORD');
        return;
      }

      this.consumerKey = process.env.KOTAK_CONSUMER_KEY;
      this.consumerSecret = process.env.KOTAK_CONSUMER_SECRET;
      this.mobileNumber = process.env.KOTAK_MOBILE_NUMBER;
      this.password = process.env.KOTAK_PASSWORD;
      this.totpSecret = process.env.KOTAK_TOTP_SECRET;

      await this.login();
      await this.downloadMasterData();
      this.connectWebSocket();
      console.log('✅ Kotak Neo Service initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize Kotak Neo Service:', error.message);
      console.log('💡 Please check your Kotak Neo credentials in the .env file');
    }
  }

  async login() {
    try {
      // Step 1: Initial Login
      console.log('🔐 Attempting Kotak Neo login...');
      
      const loginPayload = {
        mobileNumber: this.mobileNumber,
        password: this.password
      };

      const loginResponse = await fetch(`${this.baseUrl}/login/1.0/login/v2/validate`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'consumerKey': this.consumerKey
        },
        body: JSON.stringify(loginPayload)
      });

      const loginData = await loginResponse.json();
      console.log('📋 Login response status:', loginResponse.status);
      console.log('📋 Login response:', JSON.stringify(loginData, null, 2));

      if (!loginData.Success && !loginData.success && loginData.fault) {
        throw new Error(`Login failed: ${loginData.fault.message || 'Authentication failed'}`);
      }

      // Extract session details
      this.userId = loginData.data?.userId || loginData.userId;
      this.ucc = loginData.data?.ucc;
      this.sid = loginData.data?.sid;
      this.rid = loginData.data?.rid;

      if (!this.userId) {
        throw new Error('User ID not found in login response');
      }

      // Step 2: Generate View Token (for market data)
      console.log('🔑 Generating View token...');
      await this.generateViewToken();

      // Step 3: Generate Trade Token (for order placement)
      console.log('🔑 Generating Trade token...');
      await this.generateTradeToken();

      console.log('✅ Kotak Neo authentication successful');
      return true;
    } catch (error) {
      console.error('❌ Kotak Neo login failed:', error);
      throw error;
    }
  }

  async generateViewToken() {
    try {
      const otp = this.generateTOTP();
      
      const viewTokenPayload = {
        userId: this.userId,
        otp: otp
      };

      const viewTokenResponse = await fetch(`${this.baseUrl}/session/1.0/session/validate`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'consumerKey': this.consumerKey
        },
        body: JSON.stringify(viewTokenPayload)
      });

      const viewTokenData = await viewTokenResponse.json();
      console.log('📋 View token response:', JSON.stringify(viewTokenData, null, 2));

      if (viewTokenData.Success || viewTokenData.success) {
        this.viewToken = viewTokenData.data?.token;
        this.accessToken = this.viewToken; // Use view token as default
        console.log('✅ View token generated successfully');
      } else {
        throw new Error(`View token generation failed: ${viewTokenData.fault?.message || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('❌ View token generation failed:', error);
      throw error;
    }
  }

  async generateTradeToken() {
    try {
      const otp = this.generateTOTP();
      
      const tradeTokenPayload = {
        userId: this.userId,
        otp: otp
      };

      const tradeTokenResponse = await fetch(`${this.baseUrl}/session/1.0/session/2FA/validate`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'consumerKey': this.consumerKey
        },
        body: JSON.stringify(tradeTokenPayload)
      });

      const tradeTokenData = await tradeTokenResponse.json();
      console.log('📋 Trade token response:', JSON.stringify(tradeTokenData, null, 2));

      if (tradeTokenData.Success || tradeTokenData.success) {
        this.tradeToken = tradeTokenData.data?.token;
        this.hsServerId = tradeTokenData.data?.hsServerId || '';
        console.log('✅ Trade token generated successfully');
      } else {
        console.log('⚠️ Trade token generation failed, continuing with view token only');
      }
    } catch (error) {
      console.error('❌ Trade token generation failed:', error);
      // Don't throw error, continue with view token only
    }
  }

  generateTOTP() {
    try {
      if (!this.totpSecret) {
        console.log('⚠️ TOTP secret not configured, using placeholder');
        return '123456';
      }

      const token = authenticator.generate(this.totpSecret);
      console.log('🔐 Generated TOTP token:', token);
      return token;
    } catch (error) {
      console.error('❌ TOTP generation failed:', error);
      return '123456';
    }
  }

  async downloadMasterData() {
    try {
      console.log('📊 Downloading master data file paths...');
      
      const response = await fetch(`${this.baseUrl}/Files/1.0/masterscrip/v2/file-paths`, {
        method: 'GET',
        headers: this.getAuthHeaders()
      });

      const data = await response.json();
      console.log('📋 Master data paths response status:', response.status);
      
      if (data.data && data.data.filesPaths) {
        // Download NSE CM data for indices
        const nseCmPath = data.data.filesPaths.find(path => path.includes('nse_cm-v1.csv'));
        if (nseCmPath) {
          await this.downloadAndParseMasterFile(nseCmPath);
        }
        
        // Download NSE FO data for options
        const nseFoPath = data.data.filesPaths.find(path => path.includes('nse_fo.csv'));
        if (nseFoPath) {
          await this.downloadAndParseMasterFile(nseFoPath);
        }
        
        console.log(`✅ Master data downloaded successfully`);
      } else {
        console.log('⚠️ Failed to get master data file paths:', data.fault?.message || 'Unknown error');
      }
    } catch (error) {
      console.error('❌ Failed to download master data:', error);
    }
  }

  async downloadAndParseMasterFile(fileUrl) {
    try {
      const response = await fetch(fileUrl);
      const csvData = await response.text();
      
      // Parse CSV data (simplified parsing)
      const lines = csvData.split('\n');
      const headers = lines[0].split(',');
      
      const instruments = [];
      for (let i = 1; i < lines.length; i++) {
        if (lines[i].trim()) {
          const values = lines[i].split(',');
          const instrument = {};
          headers.forEach((header, index) => {
            instrument[header.trim()] = values[index]?.trim() || '';
          });
          
          // Filter for relevant instruments
          if (instrument.pSymbolName && (
            instrument.pSymbolName.includes('NIFTY') || 
            instrument.pSymbolName.includes('BANKNIFTY') ||
            instrument.pSymbolName.includes('FINNIFTY') ||
            instrument.pSymbolName.includes('MIDCPNIFTY') ||
            instrument.pInstrumentName === 'INDEX'
          )) {
            instruments.push(instrument);
          }
        }
      }
      
      if (!this.masterData) {
        this.masterData = [];
      }
      this.masterData = this.masterData.concat(instruments);
      
      console.log(`📊 Parsed ${instruments.length} instruments from ${fileUrl}`);
    } catch (error) {
      console.error('❌ Failed to download/parse master file:', error);
    }
  }

  connectWebSocket() {
    if (!this.sid || !this.hsServerId) {
      console.log('⚠️ Cannot connect WebSocket: Missing SID or hsServerId');
      return;
    }

    if (this.websocket) {
      this.websocket.close();
    }

    const wsUrl = `${this.wsUrl}/?sid=${this.sid}&hsServerId=${this.hsServerId}`;
    console.log('🔌 Connecting to WebSocket:', wsUrl);

    this.websocket = new WebSocket(wsUrl);

    this.websocket.on('open', () => {
      console.log('✅ WebSocket connected to Kotak Neo');
      this.emit('websocket_connected');
    });

    this.websocket.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        this.handleWebSocketMessage(message);
      } catch (error) {
        console.error('❌ WebSocket message parse error:', error);
      }
    });

    this.websocket.on('close', () => {
      console.log('⚠️ WebSocket disconnected from Kotak Neo');
      setTimeout(() => this.connectWebSocket(), 5000);
    });

    this.websocket.on('error', (error) => {
      console.error('❌ WebSocket error:', error);
    });
  }

  handleWebSocketMessage(message) {
    if (message.type === 'mf' || message.type === 'sf') {
      this.emit('market_data', {
        token: message.tk,
        ltp: message.lp,
        change: message.c,
        changePercent: message.cp,
        volume: message.v,
        timestamp: message.ft,
        high: message.h,
        low: message.l,
        open: message.o,
        close: message.pc
      });
    }
  }

  async subscribeToTokens(tokens) {
    if (!this.websocket || this.websocket.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected');
    }

    const newTokens = tokens.filter(token => !this.subscribedTokens.has(token));
    if (newTokens.length === 0) return;

    const subscribeMessage = {
      a: 'subscribe',
      v: newTokens,
      m: 'mf'
    };

    this.websocket.send(JSON.stringify(subscribeMessage));
    newTokens.forEach(token => this.subscribedTokens.add(token));
    
    console.log(`📡 Subscribed to ${newTokens.length} tokens`);
  }

  async getOptionChain(symbol, expiryDate) {
    try {
      const instrumentToken = this.getInstrumentToken(symbol);
      if (!instrumentToken) {
        throw new Error(`Instrument token not found for symbol: ${symbol}`);
      }

      const response = await fetch(`${this.baseUrl}/optionchain/1.0/optionchain/optionchain`, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({
          instrumentToken: instrumentToken,
          expiryDate: expiryDate
        })
      });

      const data = await response.json();
      return (data.Success || data.success) ? (data.data || data.Result) : null;
    } catch (error) {
      console.error('❌ Failed to get option chain:', error);
      return null;
    }
  }

  async getPositions() {
    try {
      const response = await fetch(`${this.baseUrl}/Positions/2.0/positions/todays`, {
        method: 'GET',
        headers: this.getAuthHeaders()
      });

      const data = await response.json();
      return (data.Success || data.success) ? (data.data || data.Result || []) : [];
    } catch (error) {
      console.error('❌ Failed to get positions:', error);
      return [];
    }
  }

  async getOrders() {
    try {
      const response = await fetch(`${this.baseUrl}/Orders/2.0/quick/user/orders`, {
        method: 'GET',
        headers: this.getAuthHeaders()
      });

      const data = await response.json();
      return (data.Success || data.success) ? (data.data || data.Result || []) : [];
    } catch (error) {
      console.error('❌ Failed to get orders:', error);
      return [];
    }
  }

  async placeOrder(orderDetails) {
    try {
      // Use trade token for order placement
      const headers = this.getAuthHeaders(true);
      
      // Map order details to Kotak Neo format
      const kotakOrder = {
        am: orderDetails.am || "NO",
        dq: orderDetails.dq || "0",
        es: orderDetails.es || "nse_cm",
        mp: orderDetails.mp || "0",
        pc: orderDetails.pc || "CNC",
        pf: orderDetails.pf || "N",
        pr: orderDetails.pr || orderDetails.price,
        pt: orderDetails.pt || "L",
        qt: orderDetails.qt || orderDetails.quantity,
        rt: orderDetails.rt || "DAY",
        tp: orderDetails.tp || "0",
        ts: orderDetails.ts || orderDetails.instrumentToken,
        tt: orderDetails.tt || orderDetails.transactionType
      };

      const response = await fetch(`${this.baseUrl}/Orders/2.0/quick/order/rule/ms/place`, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(kotakOrder)
      });

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('❌ Failed to place order:', error);
      throw error;
    }
  }

  async getMargins() {
    try {
      const response = await fetch(`${this.baseUrl}/Margins/2.0/margins/equity`, {
        method: 'GET',
        headers: this.getAuthHeaders()
      });

      const data = await response.json();
      return (data.Success || data.success) ? (data.data || data.Result) : null;
    } catch (error) {
      console.error('❌ Failed to get margins:', error);
      return null;
    }
  }

  async getLimits() {
    try {
      const response = await fetch(`${this.baseUrl}/Limits/1.0/limits/rms-limits`, {
        method: 'GET',
        headers: this.getAuthHeaders()
      });

      const data = await response.json();
      return (data.Success || data.success) ? (data.data || data.Result) : null;
    } catch (error) {
      console.error('❌ Failed to get limits:', error);
      return null;
    }
  }

  getAuthHeaders(useTradeToken = false) {
    const headers = {
      'Content-Type': 'application/json',
      'accept': '*/*'
    };

    // Use trade token for trading operations, view token for market data
    const token = useTradeToken && this.tradeToken ? this.tradeToken : this.accessToken;
    
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    if (this.consumerKey) {
      headers['consumerKey'] = this.consumerKey;
    }

    return headers;
  }

  getInstrumentToken(symbol) {
    if (!this.masterData) return null;
    
    // For indices, use predefined tokens
    const indexTokens = {
      'NIFTY': 'Nifty 50',
      'BANKNIFTY': 'Nifty Bank',
      'FINNIFTY': 'Nifty Fin Service',
      'MIDCPNIFTY': 'NIFTY MIDCAP 100'
    };
    
    if (indexTokens[symbol]) {
      return indexTokens[symbol];
    }
    
    const instrument = this.masterData.find(item => 
      item.pSymbolName === symbol || 
      item.pDisplaySymbol === symbol ||
      item.pTrdSymbol === symbol
    );
    return instrument ? (instrument.pToken || instrument.pTrdSymbol) : null;
  }

  getAvailableIndices() {
    const predefinedIndices = [
      { symbol: 'NIFTY', token: 'Nifty 50', displayName: 'NIFTY 50', exchange: 'nse_cm' },
      { symbol: 'BANKNIFTY', token: 'Nifty Bank', displayName: 'BANK NIFTY', exchange: 'nse_cm' },
      { symbol: 'FINNIFTY', token: 'Nifty Fin Service', displayName: 'FIN NIFTY', exchange: 'nse_cm' },
      { symbol: 'MIDCPNIFTY', token: 'NIFTY MIDCAP 100', displayName: 'MIDCAP NIFTY', exchange: 'nse_cm' }
    ];
    
    if (!this.masterData) return predefinedIndices;
    
    const indices = this.masterData
      .filter(item => item.pInstrumentName === 'INDEX')
      .map(item => ({
        symbol: item.pSymbolName,
        token: item.pToken || item.pTrdSymbol,
        displayName: item.pDisplaySymbol || item.pSymbolName,
        exchange: item.pExchange
      }));
    
    return [...predefinedIndices, ...indices];
  }

  isAuthenticated() {
    return !!(this.accessToken || this.viewToken);
  }

  getInstrumentDetails(token) {
    if (!this.masterData) return null;
    return this.masterData.find(item => 
      item.pToken === token || 
      item.pTrdSymbol === token
    );
  }

  searchInstruments(query) {
    if (!this.masterData) return [];
    
    const searchTerm = query.toLowerCase();
    return this.masterData.filter(item => 
      item.pSymbolName?.toLowerCase().includes(searchTerm) ||
      item.pDisplaySymbol?.toLowerCase().includes(searchTerm) ||
      item.pTrdSymbol?.toLowerCase().includes(searchTerm)
    );
  }
}