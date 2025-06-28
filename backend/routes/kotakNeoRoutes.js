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
  res.json({ 
    success: true, 
    authenticated: isAuthenticated,
    timestamp: new Date().toISOString()
  });
});