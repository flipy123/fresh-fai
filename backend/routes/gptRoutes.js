import express from 'express';
import { GPTService } from '../services/GPTService.js';

export const gptRouter = express.Router();
const gptService = new GPTService();

// Send market data to GPT for analysis
gptRouter.post('/analyze', async (req, res) => {
  try {
    const { marketData, provider = 'openai' } = req.body;
    const decision = await gptService.sendToGPT(marketData, provider);
    res.json({ success: true, data: decision });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Chat with GPT
gptRouter.post('/chat', async (req, res) => {
  try {
    const { message, context, provider = 'openai' } = req.body;
    const response = await gptService.chatWithGPT(message, context, provider);
    res.json({ success: true, data: { message: response } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Clear trade memory
gptRouter.post('/clear-memory', async (req, res) => {
  try {
    const { index } = req.body;
    gptService.clearTradeMemory(index);
    res.json({ success: true, message: 'Trade memory cleared' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get trade history
gptRouter.get('/trade-history/:index', (req, res) => {
  try {
    const { index } = req.params;
    const history = gptService.getTradeHistory(index);
    res.json({ success: true, data: history });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});