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
      // Step 1: Login with credentials
      const loginPayload = {
        consumerKey: this.consumerKey,
        ip: '127.0.0.1',
        appId: 'FAi30',
        mobileNumber: this.mobileNumber,
        password: this.password
      };

      console.log('🔐 Attempting Kotak Neo login...');
      
      const loginResponse = await fetch(`${this.baseUrl}/login`, {
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

      if (!loginData.Success && !loginData.success) {
        const errorMessage = loginData.Message || loginData.message || loginData.error || 'Login failed - no specific error message provided by API';
        throw new Error(`Login failed: ${errorMessage}`);
      }

      // Extract user ID from login response
      this.userId = loginData.data?.userId || 
                   loginData.userId || 
                   loginData.data?.user_id || 
                   loginData.user_id ||
                   loginData.data?.id ||
                   loginData.id;
      
      if (!this.userId) {
        console.log('⚠️ User ID not found in login response, trying to proceed without 2FA...');
        this.accessToken = loginData.data?.token || loginData.token || loginData.access_token;
        this.sid = loginData.data?.sid || loginData.sid;
        this.hsServerId = loginData.data?.hsServerId || loginData.hsServerId;
        
        if (this.accessToken) {
          console.log('✅ Kotak Neo authentication successful (without 2FA)');
          return true;
        }
        
        throw new Error('User ID not found in login response and no direct token provided');
      }

      // Step 2: Generate OTP and validate session
      console.log('🔑 Generating session token with 2FA...');
      
      const otp = this.generateTOTP();
      console.log('🔐 Generated OTP:', otp);
      
      const sessionPayload = {
        userId: this.userId,
        otp: otp,
        consumerKey: this.consumerKey
      };

      const sessionResponse = await fetch(`${this.baseUrl}/session/2FA/validate`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'consumerKey': this.consumerKey
        },
        body: JSON.stringify(sessionPayload)
      });

      const sessionData = await sessionResponse.json();
      console.log('📋 Session response status:', sessionResponse.status);
      console.log('📋 Session response:', JSON.stringify(sessionData, null, 2));

      if (!sessionData.Success && !sessionData.success) {
        const errorMessage = sessionData.Message || sessionData.message || sessionData.error || 'Session generation failed - no specific error message provided by API';
        throw new Error(`Session generation failed: ${errorMessage}`);
      }

      // Extract tokens from session response
      this.accessToken = sessionData.data?.token || sessionData.token || sessionData.access_token;
      this.sid = sessionData.data?.sid || sessionData.sid;
      this.hsServerId = sessionData.data?.hsServerId || sessionData.hsServerId;

      if (!this.accessToken) {
        throw new Error('Access token not found in session response');
      }

      console.log('✅ Kotak Neo authentication successful');
      return true;
    } catch (error) {
      console.error('❌ Kotak Neo login failed:', error);
      throw error;
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
      console.log('📊 Downloading master data...');
      
      const response = await fetch(`${this.baseUrl}/InstrumentMaster`, {
        method: 'GET',
        headers: this.getAuthHeaders()
      });

      const data = await response.json();
      console.log('📋 Master data response status:', response.status);
      
      if (data.Success || data.success) {
        this.masterData = (data.Result || data.data || []).filter(item => 
          item.pSymbolName && (
            item.pSymbolName.includes('NIFTY') || 
            item.pSymbolName.includes('BANKNIFTY') ||
            item.pSymbolName.includes('FINNIFTY') ||
            item.pSymbolName.includes('MIDCPNIFTY')
          )
        );
        console.log(`✅ Master data downloaded: ${this.masterData.length} instruments`);
      } else {
        console.log('⚠️ Failed to download master data:', data.Message || data.message || 'Unknown error');
      }
    } catch (error) {
      console.error('❌ Failed to download master data:', error);
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

      const response = await fetch(`${this.baseUrl}/optionchain`, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({
          instrumentToken: instrumentToken,
          expiryDate: expiryDate
        })
      });

      const data = await response.json();
      return (data.Success || data.success) ? (data.Result || data.data) : null;
    } catch (error) {
      console.error('❌ Failed to get option chain:', error);
      return null;
    }
  }

  async getPositions() {
    try {
      const response = await fetch(`${this.baseUrl}/positions`, {
        method: 'GET',
        headers: this.getAuthHeaders()
      });

      const data = await response.json();
      return (data.Success || data.success) ? (data.Result || data.data || []) : [];
    } catch (error) {
      console.error('❌ Failed to get positions:', error);
      return [];
    }
  }

  async getOrders() {
    try {
      const response = await fetch(`${this.baseUrl}/orders`, {
        method: 'GET',
        headers: this.getAuthHeaders()
      });

      const data = await response.json();
      return (data.Success || data.success) ? (data.Result || data.data || []) : [];
    } catch (error) {
      console.error('❌ Failed to get orders:', error);
      return [];
    }
  }

  async placeOrder(orderDetails) {
    try {
      const requiredFields = ['instrumentToken', 'transactionType', 'quantity', 'price', 'product', 'validity'];
      for (const field of requiredFields) {
        if (!orderDetails[field]) {
          throw new Error(`Missing required field: ${field}`);
        }
      }

      const response = await fetch(`${this.baseUrl}/orders/regular`, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify(orderDetails)
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
      const response = await fetch(`${this.baseUrl}/margins`, {
        method: 'GET',
        headers: this.getAuthHeaders()
      });

      const data = await response.json();
      return (data.Success || data.success) ? (data.Result || data.data) : null;
    } catch (error) {
      console.error('❌ Failed to get margins:', error);
      return null;
    }
  }

  async getLimits() {
    try {
      const response = await fetch(`${this.baseUrl}/limits`, {
        method: 'GET',
        headers: this.getAuthHeaders()
      });

      const data = await response.json();
      return (data.Success || data.success) ? (data.Result || data.data) : null;
    } catch (error) {
      console.error('❌ Failed to get limits:', error);
      return null;
    }
  }

  getAuthHeaders() {
    const headers = {
      'Content-Type': 'application/json'
    };

    if (this.accessToken) {
      headers['Authorization'] = `Bearer ${this.accessToken}`;
    }
    
    if (this.sid) {
      headers['sid'] = this.sid;
    }
    
    if (this.consumerKey) {
      headers['consumerKey'] = this.consumerKey;
    }

    return headers;
  }

  getInstrumentToken(symbol) {
    if (!this.masterData) return null;
    const instrument = this.masterData.find(item => 
      item.pSymbolName === symbol || item.pDisplaySymbol === symbol
    );
    return instrument ? instrument.pToken : null;
  }

  getAvailableIndices() {
    if (!this.masterData) return [];
    
    const indices = this.masterData
      .filter(item => item.pInstrumentName === 'INDEX')
      .map(item => ({
        symbol: item.pSymbolName,
        token: item.pToken,
        displayName: item.pDisplaySymbol || item.pSymbolName,
        exchange: item.pExchange
      }));
    
    return indices;
  }

  isAuthenticated() {
    return !!this.accessToken;
  }

  getInstrumentDetails(token) {
    if (!this.masterData) return null;
    return this.masterData.find(item => item.pToken === token);
  }

  searchInstruments(query) {
    if (!this.masterData) return [];
    
    const searchTerm = query.toLowerCase();
    return this.masterData.filter(item => 
      item.pSymbolName.toLowerCase().includes(searchTerm) ||
      (item.pDisplaySymbol && item.pDisplaySymbol.toLowerCase().includes(searchTerm))
    );
  }
}