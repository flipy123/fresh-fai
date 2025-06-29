import fetch from 'node-fetch';
import WebSocket from 'ws';
import { EventEmitter } from 'events';

export class KotakNeoService extends EventEmitter {
  constructor() {
    super();
    this.baseUrl = 'https://napi.kotaksecurities.com';
    this.wsUrl = 'wss://gw-napi.kotaksecurities.com:443/realtime/1.0';
    this.accessToken = null;
    this.websocket = null;
    this.masterData = [];
    this.subscribedTokens = new Set();
    this.userId = null;
    this.password = null;
    this.pan = null;
    this.mobileNumber = null;
    this.isLoggedIn = false;
    this.dataCenter = 'gdc';
    
    // Connection retry
    this.maxRetries = 5;
    this.retryCount = 0;
    this.retryDelay = 5000;
    
    // Data refresh intervals
    this.dataRefreshInterval = null;
    
    // Market data storage
    this.marketDataCache = new Map();
    this.lastPriceUpdate = new Map();
    
    // Heartbeat
    this.heartbeatInterval = null;
  }

  async initialize() {
    try {
      if (!process.env.KOTAK_ACCESS_TOKEN) {
        console.log('⚠️ Kotak Neo OAuth2 access token not configured. Please update your .env file.');
        console.log('📝 Required: KOTAK_ACCESS_TOKEN=your_oauth2_access_token');
        return;
      }

      this.accessToken = process.env.KOTAK_ACCESS_TOKEN;
      this.userId = process.env.KOTAK_USER_ID || 'client7327';
      this.password = process.env.KOTAK_PASSWORD;
      this.pan = process.env.KOTAK_PAN;
      this.mobileNumber = process.env.KOTAK_MOBILE_NUMBER;

      console.log('🔐 Using OAuth2 access token for authentication...');
      
      // Test the access token
      const isValid = await this.validateAccessToken();
      if (isValid) {
        this.isLoggedIn = true;
        console.log('✅ OAuth2 access token is valid');
        
        await this.downloadMasterData();
        this.connectWebSocket();
        this.startDataRefreshInterval();
        console.log('✅ Kotak Neo Service initialized successfully');
      } else {
        console.log('❌ OAuth2 access token is invalid or expired');
        await this.refreshAccessToken();
      }
    } catch (error) {
      console.error('❌ Failed to initialize Kotak Neo Service:', error.message);
    }
  }

  async validateAccessToken() {
    try {
      const response = await fetch(`${this.baseUrl}/Accounts/1.0/wallets`, {
        method: 'GET',
        headers: this.getAuthHeaders()
      });

      if (response.ok) {
        const data = await response.json();
        return !data.fault;
      }
      return false;
    } catch (error) {
      console.error('❌ Token validation failed:', error);
      return false;
    }
  }

  async refreshAccessToken() {
    try {
      console.log('🔄 Refreshing OAuth2 access token...');
      
      if (!this.userId || !this.password) {
        throw new Error('Username and password required for token refresh');
      }

      const body = new URLSearchParams({
        grant_type: 'password',
        scope: 'all',
        username: this.userId,
        password: this.password
      });

      if (this.pan) {
        body.append('pan', this.pan);
      }

      const response = await fetch(`${this.baseUrl}/oauth2/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'accept': 'application/json'
        },
        body: body.toString()
      });

      const data = await response.json();

      if (!response.ok || data.fault) {
        throw new Error(`OAuth2 token refresh failed: ${data.fault?.message || response.statusText}`);
      }

      if (data.access_token) {
        this.accessToken = data.access_token;
        this.isLoggedIn = true;
        console.log('✅ OAuth2 access token refreshed successfully');
        
        // Update environment variable (for this session)
        process.env.KOTAK_ACCESS_TOKEN = this.accessToken;
        
        this.connectWebSocket();
        return true;
      } else {
        throw new Error('No access token in response');
      }
    } catch (error) {
      console.error('❌ Token refresh failed:', error);
      throw error;
    }
  }

  connectWebSocket() {
    if (!this.accessToken) {
      console.log('⚠️ Cannot connect WebSocket: Missing access token');
      return;
    }

    console.log('🔌 Connecting to Kotak Neo WebSocket...');
    
    if (this.websocket) {
      this.websocket.close();
    }

    this.websocket = new WebSocket(this.wsUrl);

    this.websocket.on('open', () => {
      console.log('✅ WebSocket connected to Kotak Neo');
      
      // Authenticate WebSocket
      const authMessage = {
        type: 'authenticate',
        token: this.accessToken
      };
      
      this.websocket.send(JSON.stringify(authMessage));
      
      // Start heartbeat
      this.heartbeatInterval = setInterval(() => {
        if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
          this.websocket.send(JSON.stringify({ type: 'ping' }));
        }
      }, 30000);
      
      this.emit('websocket_connected');
      this.subscribeToDefaultIndices();
      this.retryCount = 0;
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
      console.log(`⚠️ WebSocket disconnected. Code: ${code}, Reason: ${reason}`);
      if (this.heartbeatInterval) {
        clearInterval(this.heartbeatInterval);
      }
      
      if (this.retryCount < this.maxRetries && this.isLoggedIn) {
        setTimeout(() => {
          this.retryCount++;
          console.log(`🔄 Retrying WebSocket connection (${this.retryCount}/${this.maxRetries})...`);
          this.connectWebSocket();
        }, this.retryDelay);
      }
    });

    this.websocket.on('error', (error) => {
      console.error('❌ WebSocket error:', error);
    });
  }

  subscribeToDefaultIndices() {
    try {
      const defaultInstruments = [
        'NSE_INDEX|Nifty 50',
        'NSE_INDEX|Nifty Bank',
        'NSE_INDEX|Nifty Fin Service',
        'NSE_INDEX|NIFTY MIDCAP 100'
      ];
      
      const subscribeMessage = {
        type: 'subscribe',
        mode: 'full',
        instrumentKeys: defaultInstruments
      };
      
      if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
        this.websocket.send(JSON.stringify(subscribeMessage));
        console.log('📡 Subscribed to default indices via WebSocket');
      }
    } catch (error) {
      console.error('❌ Failed to subscribe to default indices:', error);
    }
  }

  handleWebSocketMessage(message) {
    try {
      console.log('📊 WebSocket message received:', JSON.stringify(message));
      
      if (message.type === 'authenticated') {
        console.log('✅ WebSocket authenticated successfully');
        return;
      }
      
      if (message.type === 'subscribed') {
        console.log('✅ WebSocket subscription confirmed');
        return;
      }
      
      // Handle market data updates
      if (message.type === 'feed' && message.data) {
        const feedData = message.data;
        
        const marketData = {
          token: feedData.instrument_token || feedData.tk,
          symbol: this.getSymbolFromToken(feedData.instrument_token || feedData.tk),
          ltp: parseFloat(feedData.last_price || feedData.lp) || 0,
          change: parseFloat(feedData.change || feedData.c) || 0,
          changePercent: parseFloat(feedData.change_percent || feedData.cp) || 0,
          volume: parseInt(feedData.volume || feedData.v) || 0,
          timestamp: feedData.timestamp || new Date().toISOString(),
          high: parseFloat(feedData.high || feedData.h) || 0,
          low: parseFloat(feedData.low || feedData.l) || 0,
          open: parseFloat(feedData.open || feedData.o) || 0,
          close: parseFloat(feedData.prev_close || feedData.pc) || 0
        };
        
        // Store in cache
        this.marketDataCache.set(marketData.token, marketData);
        this.lastPriceUpdate.set(marketData.token, Date.now());
        
        console.log(`📈 Market Data - ${marketData.symbol}: LTP=${marketData.ltp}, Change=${marketData.change}`);
        
        this.emit('market_data', marketData);
      }
    } catch (error) {
      console.error('❌ Error handling WebSocket message:', error);
    }
  }

  getSymbolFromToken(token) {
    const tokenMap = {
      'NSE_INDEX|Nifty 50': 'NIFTY',
      'NSE_INDEX|Nifty Bank': 'BANKNIFTY',
      'NSE_INDEX|Nifty Fin Service': 'FINNIFTY',
      'NSE_INDEX|NIFTY MIDCAP 100': 'MIDCPNIFTY'
    };
    
    return tokenMap[token] || token;
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
      const instrumentKeys = newTokens.map(token => `NSE_INDEX|${token}`);
      
      const subscribeMessage = {
        type: 'subscribe',
        mode: 'full',
        instrumentKeys: instrumentKeys
      };

      this.websocket.send(JSON.stringify(subscribeMessage));
      newTokens.forEach(token => this.subscribedTokens.add(token));
      
      console.log(`📡 Subscribed to ${newTokens.length} tokens:`, newTokens);
    } catch (error) {
      console.error('❌ Failed to subscribe to tokens:', error);
    }
  }

  async downloadMasterData() {
    try {
      console.log('📊 Downloading master data...');
      
      const response = await fetch(`${this.baseUrl}/Files/1.0/masterscrip/v2/file-paths`, {
        method: 'GET',
        headers: this.getAuthHeaders()
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      
      if (data.fault) {
        throw new Error(`Master data API error: ${data.fault.message || data.fault.description}`);
      }
      
      if (data.data && data.data.filesPaths && Array.isArray(data.data.filesPaths)) {
        console.log(`📊 Found ${data.data.filesPaths.length} master data files`);
        
        // Download NSE CM data
        const nseCmPath = data.data.filesPaths.find(path => path.includes('nse_cm'));
        if (nseCmPath) {
          console.log('📥 Downloading NSE CM data...');
          await this.downloadAndParseMasterFile(nseCmPath);
        }
        
        // Download NSE FO data
        const nseFoPath = data.data.filesPaths.find(path => path.includes('nse_fo'));
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
      
      const lines = csvData.split('\n').filter(line => line.trim());
      if (lines.length === 0) {
        console.log('⚠️ Empty CSV file');
        return;
      }
      
      const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
      
      const instruments = [];
      for (let i = 1; i < lines.length; i++) {
        if (lines[i].trim()) {
          const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
          const instrument = {};
          
          headers.forEach((header, index) => {
            instrument[header] = values[index] || '';
          });
          
          // Filter for indices and options
          if (instrument.pSymbolName && (
            instrument.pSymbolName.includes('NIFTY') || 
            instrument.pSymbolName.includes('BANKNIFTY') ||
            instrument.pSymbolName.includes('FINNIFTY') ||
            instrument.pSymbolName.includes('MIDCPNIFTY') ||
            instrument.pInstrumentName === 'INDEX' ||
            instrument.pInstrumentName === 'OPTIDX'
          )) {
            if (instrument.dStrikePrice) {
              instrument.strikePrice = parseFloat(instrument.dStrikePrice) / 100;
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

  async getPositions() {
    try {
      const response = await fetch(`${this.baseUrl}/Positions/2.0/positions`, {
        method: 'GET',
        headers: this.getAuthHeaders()
      });

      const data = await response.json();
      
      if (data.fault) {
        console.error('❌ Positions API error:', data.fault.message || data.fault.description);
        return [];
      }
      
      console.log('📊 Positions fetched:', data.data?.length || 0);
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
      
      console.log('📋 Orders fetched:', data.data?.length || 0);
      return data.data || [];
    } catch (error) {
      console.error('❌ Failed to get orders:', error);
      return [];
    }
  }

  async getWalletBalance() {
    try {
      const response = await fetch(`${this.baseUrl}/Accounts/1.0/wallets`, {
        method: 'GET',
        headers: this.getAuthHeaders()
      });

      const data = await response.json();
      
      if (data.fault) {
        console.error('❌ Wallet API error:', data.fault.message || data.fault.description);
        return { available: 0, used: 0, total: 0 };
      }
      
      const walletData = data.data || {};
      const result = {
        available: parseFloat(walletData.availableMargin || walletData.available || 0),
        used: parseFloat(walletData.usedMargin || walletData.used || 0),
        total: parseFloat(walletData.totalMargin || walletData.total || 0)
      };
      
      console.log('💰 Wallet balance fetched:', result);
      return result;
    } catch (error) {
      console.error('❌ Failed to get wallet balance:', error);
      return { available: 0, used: 0, total: 0 };
    }
  }

  async placeOrder(orderDetails) {
    try {
      if (!this.accessToken) {
        throw new Error('Access token not available. Please authenticate first.');
      }

      const kotakOrder = {
        am: orderDetails.am || "NO",
        dq: orderDetails.dq || "0",
        es: orderDetails.es || "nse_fo",
        mp: orderDetails.mp || "0",
        pc: orderDetails.pc || "MIS",
        pf: orderDetails.pf || "N",
        pr: orderDetails.pr || orderDetails.price?.toString(),
        pt: orderDetails.pt || "L",
        qt: orderDetails.qt || orderDetails.quantity?.toString(),
        rt: orderDetails.rt || "DAY",
        tp: orderDetails.tp || "0",
        ts: orderDetails.ts || orderDetails.instrumentToken,
        tt: orderDetails.tt || orderDetails.transactionType
      };

      const response = await fetch(`${this.baseUrl}/Orders/2.0/quick/order/rule/ms/place`, {
        method: 'POST',
        headers: this.getAuthHeaders(),
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

  getAuthHeaders() {
    const headers = {
      'Content-Type': 'application/json',
      'accept': 'application/json'
    };

    if (this.accessToken) {
      headers['Authorization'] = `Bearer ${this.accessToken}`;
    }

    return headers;
  }

  startDataRefreshInterval() {
    this.dataRefreshInterval = setInterval(async () => {
      try {
        if (this.isAuthenticated()) {
          const [positions, orders, wallet] = await Promise.all([
            this.getPositions(),
            this.getOrders(),
            this.getWalletBalance()
          ]);
          
          this.emit('data_update', {
            positions,
            orders,
            wallet,
            timestamp: new Date().toISOString()
          });
        }
      } catch (error) {
        console.error('❌ Failed to refresh data:', error);
      }
    }, 5000);
  }

  getAvailableIndices() {
    const predefinedIndices = [
      { symbol: 'NIFTY', token: 'NSE_INDEX|Nifty 50', displayName: 'NIFTY 50', exchange: 'NSE_INDEX' },
      { symbol: 'BANKNIFTY', token: 'NSE_INDEX|Nifty Bank', displayName: 'BANK NIFTY', exchange: 'NSE_INDEX' },
      { symbol: 'FINNIFTY', token: 'NSE_INDEX|Nifty Fin Service', displayName: 'FIN NIFTY', exchange: 'NSE_INDEX' },
      { symbol: 'MIDCPNIFTY', token: 'NSE_INDEX|NIFTY MIDCAP 100', displayName: 'MIDCAP NIFTY', exchange: 'NSE_INDEX' }
    ];
    
    if (!this.masterData || this.masterData.length === 0) {
      return predefinedIndices;
    }
    
    const indices = this.masterData
      .filter(item => item.pInstrumentName === 'INDEX')
      .map(item => ({
        symbol: item.pSymbolName,
        token: `NSE_INDEX|${item.pSymbolName}`,
        displayName: item.pDisplaySymbol || item.pSymbolName,
        exchange: item.pExchange || 'NSE_INDEX'
      }));
    
    // Merge predefined with master data, avoiding duplicates
    const allIndices = [...predefinedIndices];
    indices.forEach(index => {
      if (!allIndices.find(existing => existing.symbol === index.symbol)) {
        allIndices.push(index);
      }
    });
    
    return allIndices;
  }

  isAuthenticated() {
    return this.isLoggedIn && !!this.accessToken;
  }

  canTrade() {
    return this.isAuthenticated();
  }

  getMarketDataForSymbol(symbol) {
    const token = this.getInstrumentToken(symbol);
    if (!token) return null;
    
    return this.marketDataCache.get(token) || null;
  }

  getInstrumentToken(symbol) {
    const indexTokens = {
      'NIFTY': 'NSE_INDEX|Nifty 50',
      'BANKNIFTY': 'NSE_INDEX|Nifty Bank',
      'FINNIFTY': 'NSE_INDEX|Nifty Fin Service',
      'MIDCPNIFTY': 'NSE_INDEX|NIFTY MIDCAP 100'
    };
    
    return indexTokens[symbol] || null;
  }

  // Legacy methods for compatibility
  getOTPStatus() {
    return {
      otpRequired: false,
      otpGenerated: false,
      otpExpired: false,
      timeRemaining: 0,
      canTrade: this.canTrade()
    };
  }

  async validateOTP(otp) {
    throw new Error('OTP validation not required for OAuth2 flow');
  }

  async regenerateOTP() {
    throw new Error('OTP regeneration not required for OAuth2 flow');
  }

  async refreshTokens() {
    return await this.refreshAccessToken();
  }

  cleanup() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
    if (this.dataRefreshInterval) {
      clearInterval(this.dataRefreshInterval);
    }
    if (this.websocket) {
      this.websocket.close();
    }
  }
}