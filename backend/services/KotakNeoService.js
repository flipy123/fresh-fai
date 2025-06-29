import fetch from 'node-fetch';
import WebSocket from 'ws';
import { EventEmitter } from 'events';

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
    this.mpin = null;
    this.consumerKey = null;
    this.consumerSecret = null;
    this.ucc = null;
    this.viewToken = null;
    this.tradeToken = null;
    this.isLoggedIn = false;
    this.neoFinkey = null;
  }

  async initialize() {
    try {
      if (!process.env.KOTAK_CONSUMER_KEY || !process.env.KOTAK_MOBILE_NUMBER || !process.env.KOTAK_PASSWORD) {
        console.log('⚠️ Kotak Neo credentials not configured. Please update your .env file with valid credentials.');
        console.log('Required: KOTAK_CONSUMER_KEY, KOTAK_CONSUMER_SECRET, KOTAK_MOBILE_NUMBER, KOTAK_PASSWORD, KOTAK_MPIN');
        return;
      }

      this.consumerKey = process.env.KOTAK_CONSUMER_KEY;
      this.consumerSecret = process.env.KOTAK_CONSUMER_SECRET;
      this.mobileNumber = process.env.KOTAK_MOBILE_NUMBER;
      this.password = process.env.KOTAK_PASSWORD;
      this.mpin = process.env.KOTAK_MPIN;
      this.ucc = process.env.KOTAK_UCC;
      this.neoFinkey = process.env.KOTAK_NEO_FINKEY;

      // Ensure mobile number is in correct format (without +91)
      if (this.mobileNumber.startsWith('+91')) {
        this.mobileNumber = this.mobileNumber.substring(3);
      }

      await this.loginWithoutTOTP();
      await this.downloadMasterData();
      this.connectWebSocket();
      console.log('✅ Kotak Neo Service initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize Kotak Neo Service:', error.message);
      console.log('💡 Please check your Kotak Neo credentials in the .env file');
    }
  }

  async loginWithoutTOTP() {
    try {
      console.log('🔐 Attempting Kotak Neo login without TOTP...');
      
      const loginPayload = {
        mobileNumber: this.mobileNumber,
        password: this.password
      };

      console.log('📤 Login payload:', { mobileNumber: this.mobileNumber, password: '***' });

      const loginResponse = await fetch(`${this.baseUrl}/login/1.0/login/v2/validate`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'apikey': this.consumerKey,
          'accept': '*/*'
        },
        body: JSON.stringify(loginPayload)
      });

      const loginData = await loginResponse.json();
      console.log('📋 Login response status:', loginResponse.status);
      console.log('📋 Login response:', JSON.stringify(loginData, null, 2));

      // Check for HTTP errors first
      if (!loginResponse.ok) {
        throw new Error(`HTTP ${loginResponse.status}: ${loginResponse.statusText}. Response: ${JSON.stringify(loginData)}`);
      }

      // Check for API fault errors
      if (loginData.fault) {
        const errorMessage = loginData.fault.message || loginData.fault.description || 'Authentication failed';
        const errorCode = loginData.fault.code || 'UNKNOWN';
        throw new Error(`Login failed [${errorCode}]: ${errorMessage}`);
      }

      // Check for missing data field
      if (!loginData.data) {
        console.error('❌ Login response structure:', Object.keys(loginData));
        throw new Error(`Login failed: No data in response. Full response: ${JSON.stringify(loginData)}`);
      }

      // Validate required fields in data
      if (!loginData.data.userId) {
        console.error('❌ Missing userId in response data:', Object.keys(loginData.data));
        throw new Error(`Login failed: User ID not found in response data. Available fields: ${Object.keys(loginData.data).join(', ')}`);
      }

      // Extract session details
      this.userId = loginData.data.userId;
      this.ucc = loginData.data.ucc || this.ucc;
      this.sid = loginData.data.sid;
      this.rid = loginData.data.rid;

      console.log(`✅ Login successful. User ID: ${this.userId}, UCC: ${this.ucc}`);

      // Try to generate session token directly with MPIN
      if (this.mpin) {
        console.log('🔑 Attempting to generate session token with MPIN...');
        await this.generateSessionWithMPIN();
      } else {
        console.log('⚠️ MPIN not configured, using basic session');
        this.accessToken = 'basic_session';
        this.viewToken = 'basic_session';
      }

      this.isLoggedIn = true;
      console.log('✅ Kotak Neo authentication completed successfully');
      return true;
    } catch (error) {
      console.error('❌ Kotak Neo login failed:', error);
      
      // Provide specific guidance based on error type
      if (error.message.includes('HTTP 401') || error.message.includes('Unauthorized')) {
        console.log('💡 Authentication failed. Please verify:');
        console.log('   - KOTAK_CONSUMER_KEY is correct');
        console.log('   - KOTAK_MOBILE_NUMBER is correct (without +91 prefix)');
        console.log('   - KOTAK_PASSWORD is correct');
        console.log('   - Your Kotak Neo account is active and has API access');
      } else if (error.message.includes('HTTP 400') || error.message.includes('Bad Request')) {
        console.log('💡 Bad request. Please verify:');
        console.log('   - All required fields are provided');
        console.log('   - Mobile number format is correct (10 digits without +91)');
        console.log('   - Password does not contain special characters that need encoding');
      }
      
      throw error;
    }
  }

  async generateSessionWithMPIN() {
    try {
      const sessionPayload = {
        userId: this.userId,
        mpin: this.mpin
      };

      console.log('📤 Session payload:', { userId: this.userId, mpin: '***' });

      const sessionResponse = await fetch(`${this.baseUrl}/session/1.0/session/2FA/validate`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'apikey': this.consumerKey,
          'accept': '*/*'
        },
        body: JSON.stringify(sessionPayload)
      });

      const sessionData = await sessionResponse.json();
      console.log('📋 Session response status:', sessionResponse.status);
      console.log('📋 Session response:', JSON.stringify(sessionData, null, 2));

      if (!sessionResponse.ok) {
        console.log(`⚠️ Session generation failed: HTTP ${sessionResponse.status}`);
        console.log('⚠️ Continuing with basic session (market data will work, but trading may be limited)');
        this.accessToken = 'basic_session';
        this.viewToken = 'basic_session';
        return;
      }

      if (sessionData.fault) {
        const errorMessage = sessionData.fault.message || sessionData.fault.description;
        console.log(`⚠️ Session generation failed: ${errorMessage}`);
        console.log('⚠️ Continuing with basic session (market data will work, but trading may be limited)');
        this.accessToken = 'basic_session';
        this.viewToken = 'basic_session';
        return;
      }

      if (sessionData.data && sessionData.data.token) {
        this.tradeToken = sessionData.data.token;
        this.accessToken = this.tradeToken;
        this.viewToken = this.tradeToken;
        this.hsServerId = sessionData.data.hsServerId || '';
        this.sid = sessionData.data.sid || this.sid;
        this.rid = sessionData.data.rid || this.rid;
        console.log('✅ Session token generated successfully');
      } else {
        console.log('⚠️ Session token not found in response, using basic session');
        this.accessToken = 'basic_session';
        this.viewToken = 'basic_session';
      }
    } catch (error) {
      console.error('❌ Session generation failed:', error);
      console.log('⚠️ Continuing with basic session');
      this.accessToken = 'basic_session';
      this.viewToken = 'basic_session';
    }
  }

  async downloadMasterData() {
    try {
      console.log('📊 Downloading master data file paths...');
      
      const response = await fetch(`${this.baseUrl}/Files/1.0/masterscrip/v2/file-paths`, {
        method: 'GET',
        headers: this.getAuthHeaders()
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      console.log('📋 Master data paths response status:', response.status);
      
      if (data.fault) {
        throw new Error(`Master data API error: ${data.fault.message || data.fault.description}`);
      }
      
      if (data.data && data.data.filesPaths && Array.isArray(data.data.filesPaths)) {
        console.log(`📊 Found ${data.data.filesPaths.length} master data files`);
        
        // Download NSE CM data for indices
        const nseCmPath = data.data.filesPaths.find(path => path.includes('nse_cm-v1.csv'));
        if (nseCmPath) {
          console.log('📥 Downloading NSE CM data...');
          await this.downloadAndParseMasterFile(nseCmPath);
        }
        
        // Download NSE FO data for options
        const nseFoPath = data.data.filesPaths.find(path => path.includes('nse_fo.csv'));
        if (nseFoPath) {
          console.log('📥 Downloading NSE FO data...');
          await this.downloadAndParseMasterFile(nseFoPath);
        }
        
        console.log(`✅ Master data downloaded successfully. Total instruments: ${this.masterData?.length || 0}`);
      } else {
        console.log('⚠️ No master data file paths found in response');
      }
    } catch (error) {
      console.error('❌ Failed to download master data:', error);
      // Initialize empty master data to prevent crashes
      this.masterData = [];
    }
  }

  async downloadAndParseMasterFile(fileUrl) {
    try {
      console.log(`📥 Downloading: ${fileUrl}`);
      const response = await fetch(fileUrl);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const csvData = await response.text();
      
      // Parse CSV data
      const lines = csvData.split('\n').filter(line => line.trim());
      if (lines.length === 0) {
        console.log('⚠️ Empty CSV file');
        return;
      }
      
      const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
      console.log('📋 CSV Headers:', headers);
      
      const instruments = [];
      for (let i = 1; i < lines.length; i++) {
        if (lines[i].trim()) {
          const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
          const instrument = {};
          
          headers.forEach((header, index) => {
            instrument[header] = values[index] || '';
          });
          
          // Filter for relevant instruments
          if (instrument.pSymbolName && (
            instrument.pSymbolName.includes('NIFTY') || 
            instrument.pSymbolName.includes('BANKNIFTY') ||
            instrument.pSymbolName.includes('FINNIFTY') ||
            instrument.pSymbolName.includes('MIDCPNIFTY') ||
            instrument.pInstrumentName === 'INDEX' ||
            instrument.pInstrumentName === 'OPTIDX'
          )) {
            // Calculate proper strike price for options
            if (instrument.dStrikePrice) {
              instrument.strikePrice = parseFloat(instrument.dStrikePrice) / 100;
            }
            
            // Convert expiry date for NSE FO
            if (instrument.lExpiryDate && fileUrl.includes('nse_fo')) {
              const epochTime = parseInt(instrument.lExpiryDate) + 315513000;
              instrument.expiryDate = new Date(epochTime * 1000);
            }
            
            instruments.push(instrument);
          }
        }
      }
      
      if (!this.masterData) {
        this.masterData = [];
      }
      this.masterData = this.masterData.concat(instruments);
      
      console.log(`📊 Parsed ${instruments.length} relevant instruments from ${fileUrl}`);
    } catch (error) {
      console.error('❌ Failed to download/parse master file:', error);
    }
  }

  connectWebSocket() {
    if (!this.sid) {
      console.log('⚠️ Cannot connect WebSocket: Missing SID');
      return;
    }

    if (this.websocket) {
      this.websocket.close();
    }

    // Use the correct WebSocket URL format
    const wsUrl = `${this.wsUrl}/?sid=${this.sid}${this.hsServerId ? `&hsServerId=${this.hsServerId}` : ''}`;
    console.log('🔌 Connecting to WebSocket:', wsUrl);

    this.websocket = new WebSocket(wsUrl);

    this.websocket.on('open', () => {
      console.log('✅ WebSocket connected to Kotak Neo');
      this.emit('websocket_connected');
      
      // Subscribe to default indices
      this.subscribeToDefaultIndices();
    });

    this.websocket.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        this.handleWebSocketMessage(message);
      } catch (error) {
        console.error('❌ WebSocket message parse error:', error);
      }
    });

    this.websocket.on('close', (code, reason) => {
      console.log(`⚠️ WebSocket disconnected from Kotak Neo. Code: ${code}, Reason: ${reason}`);
      setTimeout(() => this.connectWebSocket(), 5000);
    });

    this.websocket.on('error', (error) => {
      console.error('❌ WebSocket error:', error);
    });
  }

  subscribeToDefaultIndices() {
    try {
      const defaultTokens = ['Nifty 50', 'Nifty Bank', 'Nifty Fin Service', 'NIFTY MIDCAP 100'];
      this.subscribeToTokens(defaultTokens);
    } catch (error) {
      console.error('❌ Failed to subscribe to default indices:', error);
    }
  }

  handleWebSocketMessage(message) {
    try {
      if (message.type === 'mf' || message.type === 'sf') {
        this.emit('market_data', {
          token: message.tk,
          ltp: parseFloat(message.lp) || 0,
          change: parseFloat(message.c) || 0,
          changePercent: parseFloat(message.cp) || 0,
          volume: parseInt(message.v) || 0,
          timestamp: message.ft,
          high: parseFloat(message.h) || 0,
          low: parseFloat(message.l) || 0,
          open: parseFloat(message.o) || 0,
          close: parseFloat(message.pc) || 0
        });
      }
    } catch (error) {
      console.error('❌ Error handling WebSocket message:', error);
    }
  }

  async subscribeToTokens(tokens) {
    if (!this.websocket || this.websocket.readyState !== WebSocket.OPEN) {
      console.log('⚠️ WebSocket not connected, cannot subscribe to tokens');
      return;
    }

    const newTokens = tokens.filter(token => !this.subscribedTokens.has(token));
    if (newTokens.length === 0) {
      console.log('📡 All tokens already subscribed');
      return;
    }

    try {
      const subscribeMessage = {
        a: 'subscribe',
        v: newTokens,
        m: 'mf'
      };

      this.websocket.send(JSON.stringify(subscribeMessage));
      newTokens.forEach(token => this.subscribedTokens.add(token));
      
      console.log(`📡 Subscribed to ${newTokens.length} tokens:`, newTokens);
    } catch (error) {
      console.error('❌ Failed to subscribe to tokens:', error);
    }
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
      
      if (data.fault) {
        throw new Error(`Option chain API error: ${data.fault.message || data.fault.description}`);
      }
      
      return data.data || null;
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
      
      if (data.fault) {
        console.error('❌ Positions API error:', data.fault.message || data.fault.description);
        return [];
      }
      
      return data.data || [];
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
      
      if (data.fault) {
        console.error('❌ Orders API error:', data.fault.message || data.fault.description);
        return [];
      }
      
      return data.data || [];
    } catch (error) {
      console.error('❌ Failed to get orders:', error);
      return [];
    }
  }

  async placeOrder(orderDetails) {
    try {
      if (!this.tradeToken) {
        throw new Error('Trade token not available. Cannot place orders without proper authentication.');
      }

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
        pr: orderDetails.pr || orderDetails.price?.toString(),
        pt: orderDetails.pt || "L",
        qt: orderDetails.qt || orderDetails.quantity?.toString(),
        rt: orderDetails.rt || "DAY",
        tp: orderDetails.tp || "0",
        ts: orderDetails.ts || orderDetails.instrumentToken,
        tt: orderDetails.tt || orderDetails.transactionType
      };

      console.log('📤 Placing order:', JSON.stringify(kotakOrder, null, 2));

      const response = await fetch(`${this.baseUrl}/Orders/2.0/quick/order/rule/ms/place`, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(kotakOrder)
      });

      const data = await response.json();
      
      if (data.fault) {
        throw new Error(`Order placement failed: ${data.fault.message || data.fault.description}`);
      }
      
      console.log('✅ Order placed successfully:', data);
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
      
      if (data.fault) {
        console.error('❌ Margins API error:', data.fault.message || data.fault.description);
        return null;
      }
      
      return data.data || null;
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
      
      if (data.fault) {
        console.error('❌ Limits API error:', data.fault.message || data.fault.description);
        return null;
      }
      
      return data.data || null;
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
    
    if (token && token !== 'basic_session') {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    if (this.consumerKey) {
      headers['apikey'] = this.consumerKey;
    }

    // Add Neo Finkey if available
    if (this.neoFinkey) {
      headers['neo-fin-key'] = this.neoFinkey;
    }

    return headers;
  }

  getInstrumentToken(symbol) {
    // For indices, use predefined tokens as per documentation
    const indexTokens = {
      'NIFTY': 'Nifty 50',
      'BANKNIFTY': 'Nifty Bank',
      'FINNIFTY': 'Nifty Fin Service',
      'MIDCPNIFTY': 'NIFTY MIDCAP 100'
    };
    
    if (indexTokens[symbol]) {
      return indexTokens[symbol];
    }
    
    if (!this.masterData) return null;
    
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
    return this.isLoggedIn && !!(this.accessToken || this.viewToken);
  }

  canTrade() {
    return this.isAuthenticated() && !!this.tradeToken;
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