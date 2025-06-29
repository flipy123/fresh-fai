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
    this.oauthAccessToken = null;
    
    // OTP Management
    this.otpGenerated = false;
    this.otpGeneratedAt = null;
    this.otpExpiry = 5 * 60 * 1000; // 5 minutes in milliseconds
    this.pendingOTPValidation = false;
    this.tokenExpiry = 86400 * 1000; // 24 hours in milliseconds
    this.tokenGeneratedAt = null;
    
    // Auto-refresh timer
    this.tokenRefreshTimer = null;
  }

  async initialize() {
    try {
      if (!process.env.KOTAK_CONSUMER_KEY || !process.env.KOTAK_MOBILE_NUMBER || !process.env.KOTAK_PASSWORD || !process.env.KOTAK_ACCESS_TOKEN) {
        console.log('⚠️ Kotak Neo credentials not configured. Please update your .env file with valid credentials.');
        console.log('Required: KOTAK_CONSUMER_KEY, KOTAK_CONSUMER_SECRET, KOTAK_MOBILE_NUMBER, KOTAK_PASSWORD, KOTAK_ACCESS_TOKEN');
        console.log('💡 Get your ACCESS_TOKEN from the Kotak Neo developer portal OAuth2 section');
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

      // Ensure mobile number includes country code
      if (!this.mobileNumber.startsWith('+91')) {
        this.mobileNumber = '+91' + this.mobileNumber;
      }

      await this.startLoginProcess();
      await this.downloadMasterData();
      this.connectWebSocket();
      this.setupTokenRefreshTimer();
      console.log('✅ Kotak Neo Service initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize Kotak Neo Service:', error.message);
      console.log('💡 Please check your Kotak Neo credentials in the .env file');
    }
  }

  async startLoginProcess() {
    try {
      console.log('🔐 Starting Kotak Neo login process...');
      
      // Step 1: Get View Token
      const viewToken = await this.getViewToken();
      if (!viewToken) {
        throw new Error('Failed to get view token');
      }

      // Step 2: Generate OTP
      console.log('📱 Generating OTP...');
      const otpGenerated = await this.generateOTP();
      
      if (otpGenerated) {
        console.log('✅ OTP sent successfully! Please check your mobile and email.');
        console.log('📞 Waiting for OTP input...');
        console.log('💡 Use the API endpoint POST /api/kotak/validate-otp with {"otp": "your_otp"} to complete login');
        
        this.pendingOTPValidation = true;
        this.emit('otp_required', {
          message: 'OTP sent to your registered mobile and email',
          expiresIn: this.otpExpiry / 1000 // seconds
        });
      } else {
        console.log('⚠️ OTP generation failed. Continuing with view token only...');
        this.accessToken = this.viewToken;
        this.isLoggedIn = true;
        this.tokenGeneratedAt = Date.now();
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

      console.log('📤 Login payload:', { mobileNumber: this.mobileNumber, password: '***' });

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
      console.log('📋 Login response status:', loginResponse.status);

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
        throw new Error(`Login failed: No data in response. Full response: ${JSON.stringify(loginData)}`);
      }

      // Extract session details
      this.viewToken = loginData.data.token;
      this.userId = loginData.data.ucc;
      this.ucc = loginData.data.ucc || this.ucc;
      this.sid = loginData.data.sid;
      this.rid = loginData.data.rid;
      this.hsServerId = loginData.data.hsServerId;

      // Decode JWT token to get actual userId
      if (this.viewToken) {
        try {
          const tokenParts = this.viewToken.split('.');
          if (tokenParts.length === 3) {
            const payload = JSON.parse(Buffer.from(tokenParts[1], 'base64').toString());
            this.userId = payload.sub || this.userId;
            console.log('🔍 Decoded user ID from token:', this.userId);
          }
        } catch (decodeError) {
          console.log('⚠️ Could not decode JWT token, using UCC as user ID');
        }
      }

      console.log(`✅ View token obtained. User ID: ${this.userId}, UCC: ${this.ucc}`);
      return this.viewToken;
    } catch (error) {
      console.error('❌ Failed to get view token:', error);
      
      if (error.message.includes('HTTP 401') || error.message.includes('Unauthorized')) {
        console.log('💡 Authentication failed. Please verify your credentials in .env file');
      }
      
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
      console.log('📋 OTP response status:', otpResponse.status);

      if (!otpResponse.ok) {
        console.log(`⚠️ OTP generation failed: HTTP ${otpResponse.status}`);
        return false;
      }

      if (otpData.fault) {
        const errorMessage = otpData.fault.message || otpData.fault.description;
        console.log(`⚠️ OTP generation failed: ${errorMessage}`);
        return false;
      }

      if (otpData.data) {
        console.log(`📱 OTP sent to: ${otpData.data.mobile} and ${otpData.data.email}`);
        this.otpGenerated = true;
        this.otpGeneratedAt = Date.now();
        
        // Set OTP expiry timer
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
      if (!this.pendingOTPValidation) {
        throw new Error('No pending OTP validation. Please generate OTP first.');
      }

      if (!this.otpGenerated) {
        throw new Error('OTP has expired. Please regenerate OTP.');
      }

      // Check if OTP is expired
      if (Date.now() - this.otpGeneratedAt > this.otpExpiry) {
        this.otpGenerated = false;
        this.otpGeneratedAt = null;
        throw new Error('OTP has expired. Please regenerate OTP.');
      }

      if (!this.userId || !this.viewToken || !this.sid) {
        throw new Error('Missing required data for OTP validation');
      }

      const sessionPayload = {
        userId: this.userId,
        otp: otp
      };

      console.log('📤 Validating OTP...');

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
      console.log('📋 OTP validation response status:', sessionResponse.status);

      if (!sessionResponse.ok) {
        throw new Error(`OTP validation failed: HTTP ${sessionResponse.status} - ${JSON.stringify(sessionData)}`);
      }

      if (sessionData.fault) {
        const errorMessage = sessionData.fault.message || sessionData.fault.description;
        throw new Error(`OTP validation failed: ${errorMessage}`);
      }

      if (sessionData.data && sessionData.data.token) {
        this.tradeToken = sessionData.data.token;
        this.accessToken = this.tradeToken;
        this.sid = sessionData.data.sid || this.sid;
        this.rid = sessionData.data.rid || this.rid;
        this.hsServerId = sessionData.data.hsServerId || this.hsServerId;
        
        // Reset OTP flags
        this.pendingOTPValidation = false;
        this.otpGenerated = false;
        this.otpGeneratedAt = null;
        this.isLoggedIn = true;
        this.tokenGeneratedAt = Date.now();
        
        console.log('✅ OTP validated successfully! Trade token generated.');
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
      
      // If OTP is invalid, allow regeneration
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
      
      // Reset OTP flags
      this.otpGenerated = false;
      this.otpGeneratedAt = null;
      this.pendingOTPValidation = false;
      
      // Generate new OTP
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

  setupTokenRefreshTimer() {
    // Clear existing timer
    if (this.tokenRefreshTimer) {
      clearTimeout(this.tokenRefreshTimer);
    }

    // Set timer to refresh token before expiry (refresh 1 hour before expiry)
    const refreshTime = this.tokenExpiry - (60 * 60 * 1000); // 23 hours
    
    this.tokenRefreshTimer = setTimeout(async () => {
      try {
        console.log('🔄 Token expiring soon. Starting refresh process...');
        await this.refreshTokens();
      } catch (error) {
        console.error('❌ Token refresh failed:', error);
        this.emit('token_refresh_failed', error);
      }
    }, refreshTime);

    console.log(`⏰ Token refresh scheduled in ${refreshTime / 1000 / 60 / 60} hours`);
  }

  async refreshTokens() {
    try {
      console.log('🔄 Refreshing authentication tokens...');
      
      // Start fresh login process
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

    const wsUrl = `${this.wsUrl}/?sid=${this.sid}${this.hsServerId ? `&hsServerId=${this.hsServerId}` : ''}`;
    console.log('🔌 Connecting to WebSocket:', wsUrl);

    this.websocket = new WebSocket(wsUrl);

    this.websocket.on('open', () => {
      console.log('✅ WebSocket connected to Kotak Neo');
      this.emit('websocket_connected');
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

  // Cleanup method
  cleanup() {
    if (this.tokenRefreshTimer) {
      clearTimeout(this.tokenRefreshTimer);
    }
    if (this.websocket) {
      this.websocket.close();
    }
  }
}