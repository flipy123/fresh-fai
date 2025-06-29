import fetch from 'node-fetch';
import WebSocket from 'ws';
import { EventEmitter } from 'events';

export class KotakNeoService extends EventEmitter {
  constructor() {
    super();
    this.baseUrl = 'https://gw-napi.kotaksecurities.com';
    this.wsUrl = 'wss://mlhsm.kotaksecurities.com';
    this.hsiUrl = 'wss://mis.kotaksecurities.com/realtime';
    this.accessToken = null;
    this.sid = null;
    this.rid = null;
    this.hsServerId = null;
    this.websocket = null;
    this.hsiWebsocket = null;
    this.masterData = [];
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
    this.oauthAccessToken = null;
    this.dataCenter = 'gdc';
    
    // OTP Management
    this.otpGenerated = false;
    this.otpGeneratedAt = null;
    this.otpExpiry = 5 * 60 * 1000;
    this.pendingOTPValidation = false;
    this.tokenExpiry = 86400 * 1000;
    this.tokenGeneratedAt = null;
    
    // Auto-refresh timer
    this.tokenRefreshTimer = null;
    this.heartbeatInterval = null;
    this.hsiHeartbeatInterval = null;
    
    // Connection retry
    this.maxRetries = 5;
    this.retryCount = 0;
    this.retryDelay = 5000;
    
    // Data refresh intervals
    this.dataRefreshInterval = null;
    
    // Market data storage
    this.marketDataCache = new Map();
    this.lastPriceUpdate = new Map();
  }

  async initialize() {
    try {
      if (!process.env.KOTAK_CONSUMER_KEY || !process.env.KOTAK_MOBILE_NUMBER || !process.env.KOTAK_PASSWORD || !process.env.KOTAK_ACCESS_TOKEN) {
        console.log('⚠️ Kotak Neo credentials not configured. Please update your .env file with valid credentials.');
        return;
      }

      this.consumerKey = process.env.KOTAK_CONSUMER_KEY;
      this.consumerSecret = process.env.KOTAK_CONSUMER_SECRET;
      this.mobileNumber = process.env.KOTAK_MOBILE_NUMBER;
      this.password = process.env.KOTAK_PASSWORD;
      this.mpin = process.env.KOTAK_MPIN;
      this.ucc = process.env.KOTAK_UCC;
      this.neoFinkey = process.env.KOTAK_NEO_FINKEY;
      this.oauthAccessToken = process.env.KOTAK_ACCESS_TOKEN;

      if (!this.mobileNumber.startsWith('+91')) {
        this.mobileNumber = '+91' + this.mobileNumber;
      }

      await this.startLoginProcess();
      await this.downloadMasterData();
      this.startDataRefreshInterval();
      console.log('✅ Kotak Neo Service initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize Kotak Neo Service:', error.message);
    }
  }

  async startLoginProcess() {
    try {
      console.log('🔐 Starting Kotak Neo login process...');
      
      const viewToken = await this.getViewToken();
      if (!viewToken) {
        throw new Error('Failed to get view token');
      }

      console.log('📱 Generating OTP...');
      const otpGenerated = await this.generateOTP();
      
      if (otpGenerated) {
        console.log('✅ OTP sent successfully!');
        this.pendingOTPValidation = true;
        this.emit('otp_required', {
          message: 'OTP sent to your registered mobile and email',
          expiresIn: this.otpExpiry / 1000
        });
      } else {
        console.log('⚠️ OTP generation failed. Continuing with view token only...');
        this.accessToken = this.viewToken;
        this.isLoggedIn = true;
        this.tokenGeneratedAt = Date.now();
        this.connectWebSockets();
      }

      return true;
    } catch (error) {
      console.error('❌ Login process failed:', error);
      throw error;
    }
  }

  async getViewToken() {
    try {
      const loginPayload = {
        mobileNumber: this.mobileNumber,
        password: this.password
      };

      const loginResponse = await fetch(`${this.baseUrl}/login/1.0/login/v2/validate`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.oauthAccessToken}`,
          'accept': '*/*'
        },
        body: JSON.stringify(loginPayload)
      });

      const loginData = await loginResponse.json();

      if (!loginResponse.ok || loginData.fault) {
        throw new Error(`Login failed: ${loginData.fault?.message || loginResponse.statusText}`);
      }

      if (!loginData.data) {
        throw new Error('Login failed: No data in response');
      }

      this.viewToken = loginData.data.token;
      this.userId = loginData.data.ucc;
      this.ucc = loginData.data.ucc || this.ucc;
      this.sid = loginData.data.sid;
      this.rid = loginData.data.rid;
      this.hsServerId = loginData.data.hsServerId;
      this.dataCenter = loginData.data.dataCenter || 'gdc';

      if (this.viewToken) {
        try {
          const tokenParts = this.viewToken.split('.');
          if (tokenParts.length === 3) {
            const payload = JSON.parse(Buffer.from(tokenParts[1], 'base64').toString());
            this.userId = payload.sub || this.userId;
          }
        } catch (decodeError) {
          console.log('⚠️ Could not decode JWT token');
        }
      }

      console.log(`✅ View token obtained. User ID: ${this.userId}, Data Center: ${this.dataCenter}`);
      return this.viewToken;
    } catch (error) {
      console.error('❌ Failed to get view token:', error);
      throw error;
    }
  }

  async generateOTP() {
    try {
      if (!this.userId) {
        throw new Error('User ID not available for OTP generation');
      }

      const otpPayload = {
        userId: this.userId,
        sendEmail: true,
        isWhitelisted: true
      };

      const otpResponse = await fetch(`${this.baseUrl}/login/1.0/login/otp/generate`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.oauthAccessToken}`,
          'accept': '*/*'
        },
        body: JSON.stringify(otpPayload)
      });

      const otpData = await otpResponse.json();

      if (!otpResponse.ok || otpData.fault) {
        console.log(`⚠️ OTP generation failed: ${otpData.fault?.message || 'Unknown error'}`);
        return false;
      }

      if (otpData.data) {
        this.otpGenerated = true;
        this.otpGeneratedAt = Date.now();
        
        setTimeout(() => {
          if (this.pendingOTPValidation) {
            console.log('⏰ OTP expired. Please regenerate OTP.');
            this.otpGenerated = false;
            this.otpGeneratedAt = null;
            this.emit('otp_expired');
          }
        }, this.otpExpiry);
        
        return true;
      }

      return false;
    } catch (error) {
      console.error('❌ OTP generation failed:', error);
      return false;
    }
  }

  async validateOTP(otp) {
    try {
      if (!this.pendingOTPValidation || !this.otpGenerated) {
        throw new Error('No pending OTP validation or OTP expired');
      }

      if (Date.now() - this.otpGeneratedAt > this.otpExpiry) {
        this.otpGenerated = false;
        this.otpGeneratedAt = null;
        throw new Error('OTP has expired. Please regenerate OTP.');
      }

      const sessionPayload = {
        userId: this.userId,
        otp: otp
      };

      const sessionResponse = await fetch(`${this.baseUrl}/login/1.0/login/v2/validate`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.oauthAccessToken}`,
          'sid': this.sid,
          'Auth': this.viewToken,
          'accept': '*/*'
        },
        body: JSON.stringify(sessionPayload)
      });

      const sessionData = await sessionResponse.json();

      if (!sessionResponse.ok || sessionData.fault) {
        throw new Error(`OTP validation failed: ${sessionData.fault?.message || 'Unknown error'}`);
      }

      if (sessionData.data && sessionData.data.token) {
        this.tradeToken = sessionData.data.token;
        this.accessToken = this.tradeToken;
        this.sid = sessionData.data.sid || this.sid;
        this.rid = sessionData.data.rid || this.rid;
        this.hsServerId = sessionData.data.hsServerId || this.hsServerId;
        this.dataCenter = sessionData.data.dataCenter || this.dataCenter;
        
        this.pendingOTPValidation = false;
        this.otpGenerated = false;
        this.otpGeneratedAt = null;
        this.isLoggedIn = true;
        this.tokenGeneratedAt = Date.now();
        
        console.log('✅ OTP validated successfully! Trade token generated.');
        
        this.connectWebSockets();
        
        this.emit('login_success', {
          message: 'Login completed successfully',
          canTrade: true
        });
        
        return {
          success: true,
          message: 'OTP validated successfully',
          canTrade: true
        };
      } else {
        throw new Error('Session token not found in response');
      }
    } catch (error) {
      console.error('❌ OTP validation failed:', error);
      
      if (error.message.includes('Invalid OTP') || error.message.includes('OTP')) {
        this.otpGenerated = false;
        this.otpGeneratedAt = null;
      }
      
      throw error;
    }
  }

  async regenerateOTP() {
    try {
      console.log('🔄 Regenerating OTP...');
      
      this.otpGenerated = false;
      this.otpGeneratedAt = null;
      this.pendingOTPValidation = false;
      
      const otpGenerated = await this.generateOTP();
      
      if (otpGenerated) {
        this.pendingOTPValidation = true;
        console.log('✅ New OTP generated successfully!');
        this.emit('otp_regenerated', {
          message: 'New OTP sent to your registered mobile and email',
          expiresIn: this.otpExpiry / 1000
        });
        
        return {
          success: true,
          message: 'New OTP sent successfully',
          expiresIn: this.otpExpiry / 1000
        };
      } else {
        throw new Error('Failed to generate new OTP');
      }
    } catch (error) {
      console.error('❌ OTP regeneration failed:', error);
      throw error;
    }
  }

  connectWebSockets() {
    if (!this.sid || !this.accessToken) {
      console.log('⚠️ Cannot connect WebSocket: Missing SID or token');
      return;
    }

    console.log('🔌 Connecting to WebSockets...');
    this.connectHSM();
    this.connectHSI();
  }

  connectHSM() {
    if (this.websocket) {
      this.websocket.close();
    }

    console.log('🔌 Connecting to HSM WebSocket...');
    this.websocket = new WebSocket(this.wsUrl);

    this.websocket.on('open', () => {
      console.log('✅ HSM WebSocket connected');
      
      const connectionMsg = {
        Authorization: this.accessToken,
        Sid: this.sid,
        type: "cn"
      };
      
      this.websocket.send(JSON.stringify(connectionMsg));
      
      this.heartbeatInterval = setInterval(() => {
        if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
          this.websocket.send(JSON.stringify({type: "ti", scrips: ""}));
        }
      }, 30000);
      
      this.emit('websocket_connected');
      this.subscribeToDefaultIndices();
      this.retryCount = 0;
    });

    this.websocket.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        this.handleHSMMessage(message);
      } catch (error) {
        console.error('❌ HSM WebSocket message parse error:', error);
      }
    });

    this.websocket.on('close', (code, reason) => {
      console.log(`⚠️ HSM WebSocket disconnected. Code: ${code}, Reason: ${reason}`);
      if (this.heartbeatInterval) {
        clearInterval(this.heartbeatInterval);
      }
      
      if (this.retryCount < this.maxRetries) {
        setTimeout(() => {
          this.retryCount++;
          this.connectHSM();
        }, this.retryDelay);
      }
    });

    this.websocket.on('error', (error) => {
      console.error('❌ HSM WebSocket error:', error);
    });
  }

  connectHSI() {
    if (this.hsiWebsocket) {
      this.hsiWebsocket.close();
    }

    let hsiUrl = this.hsiUrl;
    if (this.dataCenter === 'adc') {
      hsiUrl = 'wss://cis.kotaksecurities.com/realtime';
    } else if (this.dataCenter === 'e21') {
      hsiUrl = 'wss://e21.kotaksecurities.com/realtime';
    } else if (this.dataCenter === 'e22') {
      hsiUrl = 'wss://e22.kotaksecurities.com/realtime';
    } else if (this.dataCenter === 'e41') {
      hsiUrl = 'wss://e41.kotaksecurities.com/realtime';
    } else if (this.dataCenter === 'e43') {
      hsiUrl = 'wss://e43.kotaksecurities.com/realtime';
    }

    console.log(`🔌 Connecting to HSI WebSocket: ${hsiUrl}`);
    this.hsiWebsocket = new WebSocket(hsiUrl);

    this.hsiWebsocket.on('open', () => {
      console.log('✅ HSI WebSocket connected');
      
      const connectionMsg = {
        type: "cn",
        Authorization: this.accessToken,
        Sid: this.sid,
        source: "WEB"
      };
      
      this.hsiWebsocket.send(JSON.stringify(connectionMsg));
      
      this.hsiHeartbeatInterval = setInterval(() => {
        if (this.hsiWebsocket && this.hsiWebsocket.readyState === WebSocket.OPEN) {
          this.hsiWebsocket.send(JSON.stringify({type: "hb"}));
        }
      }, 30000);
    });

    this.hsiWebsocket.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        this.handleHSIMessage(message);
      } catch (error) {
        console.error('❌ HSI WebSocket message parse error:', error);
      }
    });

    this.hsiWebsocket.on('close', (code, reason) => {
      console.log(`⚠️ HSI WebSocket disconnected. Code: ${code}, Reason: ${reason}`);
      if (this.hsiHeartbeatInterval) {
        clearInterval(this.hsiHeartbeatInterval);
      }
    });

    this.hsiWebsocket.on('error', (error) => {
      console.error('❌ HSI WebSocket error:', error);
    });
  }

  subscribeToDefaultIndices() {
    try {
      const indicesSubscription = {
        type: "ifs",
        scrips: "nse_cm|Nifty 50&nse_cm|Nifty Bank&nse_cm|Nifty Fin Service&nse_cm|NIFTY MIDCAP 100",
        channelnum: 1
      };
      
      if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
        this.websocket.send(JSON.stringify(indicesSubscription));
        console.log('📡 Subscribed to default indices');
      }
    } catch (error) {
      console.error('❌ Failed to subscribe to default indices:', error);
    }
  }

  handleHSMMessage(message) {
    try {
      console.log('📊 HSM Message received:', JSON.stringify(message));
      
      // Handle market data messages
      if (message.type === 'mf' || message.type === 'sf') {
        const marketData = {
          token: message.tk,
          symbol: message.ts || message.tk,
          ltp: parseFloat(message.lp) || 0,
          change: parseFloat(message.c) || 0,
          changePercent: parseFloat(message.cp) || 0,
          volume: parseInt(message.v) || 0,
          timestamp: message.ft || new Date().toISOString(),
          high: parseFloat(message.h) || 0,
          low: parseFloat(message.l) || 0,
          open: parseFloat(message.o) || 0,
          close: parseFloat(message.pc) || 0
        };
        
        // Store in cache
        this.marketDataCache.set(message.tk, marketData);
        this.lastPriceUpdate.set(message.tk, Date.now());
        
        console.log(`📈 Market Data - ${marketData.symbol}: LTP=${marketData.ltp}, Change=${marketData.change}`);
        
        this.emit('market_data', marketData);
      }
      
      // Handle connection acknowledgment
      if (message.type === 'cn') {
        console.log('✅ HSM Connection acknowledged');
      }
    } catch (error) {
      console.error('❌ Error handling HSM message:', error);
    }
  }

  handleHSIMessage(message) {
    try {
      console.log('📋 HSI Message received:', JSON.stringify(message));
      
      if (message.type === 'order_update') {
        this.emit('order_update', message);
      }
      
      if (message.type === 'cn') {
        console.log('✅ HSI Connection acknowledged');
      }
    } catch (error) {
      console.error('❌ Error handling HSI message:', error);
    }
  }

  async subscribeToTokens(tokens) {
    if (!this.websocket || this.websocket.readyState !== WebSocket.OPEN) {
      console.log('⚠️ HSM WebSocket not connected, cannot subscribe to tokens');
      return;
    }

    const newTokens = tokens.filter(token => !this.subscribedTokens.has(token));
    if (newTokens.length === 0) {
      console.log('📡 All tokens already subscribed');
      return;
    }

    try {
      const scripsString = newTokens.map(token => `nse_cm|${token}`).join('&');
      
      const subscribeMessage = {
        type: "ifs",
        scrips: scripsString,
        channelnum: 1
      };

      this.websocket.send(JSON.stringify(subscribeMessage));
      newTokens.forEach(token => this.subscribedTokens.add(token));
      
      console.log(`📡 Subscribed to ${newTokens.length} tokens:`, newTokens);
    } catch (error) {
      console.error('❌ Failed to subscribe to tokens:', error);
    }
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

  async downloadMasterData() {
    try {
      console.log('📊 Downloading master data file paths...');
      
      const response = await fetch(`${this.baseUrl}/Files/1.0/masterscrip/v2/file-paths`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.oauthAccessToken}`,
          'accept': '*/*'
        }
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
        
        const nseCmPath = data.data.filesPaths.find(path => path.includes('nse_cm-v1.csv'));
        if (nseCmPath) {
          console.log('📥 Downloading NSE CM data...');
          await this.downloadAndParseMasterFile(nseCmPath);
        }
        
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

  async getWalletBalance() {
    try {
      const response = await fetch(`${this.baseUrl}/Limits/1.0/limits`, {
        method: 'GET',
        headers: this.getAuthHeaders()
      });

      const data = await response.json();
      
      if (data.fault) {
        console.error('❌ Wallet API error:', data.fault.message || data.fault.description);
        return { available: 0, used: 0, total: 0 };
      }
      
      const limits = data.data || {};
      return {
        available: parseFloat(limits.availableMargin || 0),
        used: parseFloat(limits.usedMargin || 0),
        total: parseFloat(limits.totalMargin || 0)
      };
    } catch (error) {
      console.error('❌ Failed to get wallet balance:', error);
      return { available: 0, used: 0, total: 0 };
    }
  }

  async placeOrder(orderDetails) {
    try {
      if (!this.tradeToken) {
        throw new Error('Trade token not available. Please complete OTP validation to enable trading.');
      }

      const headers = this.getAuthHeaders(true);
      
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

  getAuthHeaders(useTradeToken = false) {
    const headers = {
      'Content-Type': 'application/json',
      'accept': '*/*'
    };

    const token = useTradeToken && this.tradeToken ? this.tradeToken : this.accessToken;
    
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    if (this.neoFinkey) {
      headers['neo-fin-key'] = this.neoFinkey;
    }

    return headers;
  }

  async refreshTokens() {
    try {
      console.log('🔄 Refreshing authentication tokens...');
      
      this.isLoggedIn = false;
      this.accessToken = null;
      this.viewToken = null;
      this.tradeToken = null;
      
      await this.startLoginProcess();
      
      console.log('✅ Tokens refreshed successfully');
      this.emit('tokens_refreshed');
      
      return true;
    } catch (error) {
      console.error('❌ Token refresh failed:', error);
      throw error;
    }
  }

  getOTPStatus() {
    return {
      otpRequired: this.pendingOTPValidation,
      otpGenerated: this.otpGenerated,
      otpExpired: this.otpGenerated && (Date.now() - this.otpGeneratedAt > this.otpExpiry),
      timeRemaining: this.otpGenerated ? Math.max(0, this.otpExpiry - (Date.now() - this.otpGeneratedAt)) : 0,
      canTrade: this.canTrade()
    };
  }

  getInstrumentToken(symbol) {
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
    
    if (!this.masterData || this.masterData.length === 0) {
      return predefinedIndices;
    }
    
    const indices = this.masterData
      .filter(item => item.pInstrumentName === 'INDEX')
      .map(item => ({
        symbol: item.pSymbolName,
        token: item.pToken || item.pTrdSymbol,
        displayName: item.pDisplaySymbol || item.pSymbolName,
        exchange: item.pExchange
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
    return this.isLoggedIn && !!(this.accessToken || this.viewToken);
  }

  canTrade() {
    return this.isAuthenticated() && !!this.tradeToken;
  }

  getMarketDataForSymbol(symbol) {
    const token = this.getInstrumentToken(symbol);
    if (!token) return null;
    
    return this.marketDataCache.get(token) || null;
  }

  cleanup() {
    if (this.tokenRefreshTimer) {
      clearTimeout(this.tokenRefreshTimer);
    }
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
    if (this.hsiHeartbeatInterval) {
      clearInterval(this.hsiHeartbeatInterval);
    }
    if (this.dataRefreshInterval) {
      clearInterval(this.dataRefreshInterval);
    }
    if (this.websocket) {
      this.websocket.close();
    }
    if (this.hsiWebsocket) {
      this.hsiWebsocket.close();
    }
  }
}