import express from 'express';

export const kotakNeoRouter = express.Router();

// Get available indices
kotakNeoRouter.get('/indices', async (req, res) => {
  try {
    const indices = req.kotakService.getAvailableIndices();
    res.json({ success: true, data: indices });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get option chain
kotakNeoRouter.post('/option-chain', async (req, res) => {
  try {
    const { symbol, expiryDate } = req.body;
    const optionChain = await req.kotakService.getOptionChain(symbol, expiryDate);
    res.json({ success: true, data: optionChain });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get positions
kotakNeoRouter.get('/positions', async (req, res) => {
  try {
    const positions = await req.kotakService.getPositions();
    res.json({ success: true, data: positions });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get orders
kotakNeoRouter.get('/orders', async (req, res) => {
  try {
    const orders = await req.kotakService.getOrders();
    res.json({ success: true, data: orders });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get wallet balance
kotakNeoRouter.get('/wallet', async (req, res) => {
  try {
    const wallet = await req.kotakService.getWalletBalance();
    res.json({ success: true, data: wallet });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get market data for symbol
kotakNeoRouter.get('/market-data/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const marketData = req.kotakService.getMarketDataForSymbol(symbol);
    res.json({ success: true, data: marketData });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Place order
kotakNeoRouter.post('/orders', async (req, res) => {
  try {
    const orderResult = await req.kotakService.placeOrder(req.body);
    res.json({ success: true, data: orderResult });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Subscribe to market data
kotakNeoRouter.post('/subscribe', async (req, res) => {
  try {
    const { tokens } = req.body;
    await req.kotakService.subscribeToTokens(tokens);
    res.json({ success: true, message: `Subscribed to ${tokens.length} tokens` });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get authentication status
kotakNeoRouter.get('/auth-status', (req, res) => {
  const isAuthenticated = req.kotakService.isAuthenticated();
  const canTrade = req.kotakService.canTrade();
  const otpStatus = req.kotakService.getOTPStatus();
  
  res.json({ 
    success: true, 
    authenticated: isAuthenticated,
    canTrade: canTrade,
    otpStatus: otpStatus,
    timestamp: new Date().toISOString()
  });
});

// Validate OTP
kotakNeoRouter.post('/validate-otp', async (req, res) => {
  try {
    const { otp } = req.body;
    
    if (!otp) {
      return res.status(400).json({ 
        success: false, 
        error: 'OTP is required' 
      });
    }

    const result = await req.kotakService.validateOTP(otp);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// Regenerate OTP
kotakNeoRouter.post('/regenerate-otp', async (req, res) => {
  try {
    const result = await req.kotakService.regenerateOTP();
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get OTP status
kotakNeoRouter.get('/otp-status', (req, res) => {
  try {
    const otpStatus = req.kotakService.getOTPStatus();
    res.json({ success: true, data: otpStatus });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Refresh tokens manually
kotakNeoRouter.post('/refresh-tokens', async (req, res) => {
  try {
    await req.kotakService.refreshTokens();
    res.json({ 
      success: true, 
      message: 'Tokens refreshed successfully' 
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});