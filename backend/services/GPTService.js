import fetch from 'node-fetch';

export class GPTService {
  constructor() {
    this.openaiApiKey = process.env.OPENAI_API_KEY;
    this.openrouterApiKey = process.env.OPENROUTER_API_KEY;
    this.tradeMemory = new Map(); // Store per-index trade history
  }

  async sendToGPT(marketData, provider = 'openai') {
    try {
      const messages = this.buildGPTMessages(marketData);
      let response;

      if (provider === 'openrouter') {
        response = await this.callOpenRouter(messages);
      } else {
        response = await this.callOpenAI(messages);
      }

      // Parse GPT response and update trade memory
      const decision = this.parseGPTResponse(response);
      this.updateTradeMemory(marketData.index, decision);
      
      return decision;
    } catch (error) {
      console.error('❌ GPT Service error:', error);
      throw error;
    }
  }

  async callOpenAI(messages) {
    if (!this.openaiApiKey) {
      throw new Error('OpenAI API key not configured. Please set OPENAI_API_KEY in your .env file.');
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.openaiApiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-2024-08-06',
        messages: messages,
        temperature: 0.3,
        max_tokens: 500
      })
    });

    const data = await response.json();
    
    // Check if the response contains the expected structure
    if (!data.choices || !Array.isArray(data.choices) || data.choices.length === 0) {
      console.error('❌ OpenAI API Error Response:', data);
      throw new Error(`OpenAI API Error: ${data.error?.message || 'Invalid response format'}`);
    }
    
    return data.choices[0].message.content;
  }

  async callOpenRouter(messages) {
    if (!this.openrouterApiKey) {
      throw new Error('OpenRouter API key not configured. Please set OPENROUTER_API_KEY in your .env file.');
    }

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.openrouterApiKey}`,
        'HTTP-Referer': 'https://localhost:3001',
        'X-Title': 'FAi-3.0 Trading System'
      },
      body: JSON.stringify({
        model: 'openai/gpt-4o-2024-08-06',
        messages: messages,
        temperature: 0.3,
        max_tokens: 500
      })
    });

    const data = await response.json();
    
    // Check if the response contains the expected structure
    if (!data.choices || !Array.isArray(data.choices) || data.choices.length === 0) {
      console.error('❌ OpenRouter API Error Response:', data);
      throw new Error(`OpenRouter API Error: ${data.error?.message || 'Invalid response format'}`);
    }
    
    return data.choices[0].message.content;
  }

  buildGPTMessages(marketData) {
    const { index, ltp, optionChain, indicators, positions } = marketData;
    
    const systemPrompt = `You are FAi-3.0, an expert options trading AI for Indian indices. 
    
Your role:
- Analyze market data and make precise trading decisions
- Focus on ${index} options trading
- Remember previous trades and learn from them
- Provide clear entry/exit signals with strike prices
- Act like a professional trader with risk management

Current market context:
- Index: ${index}
- LTP: ${ltp}
- Open Positions: ${positions ? positions.length : 0}

Previous trades for ${index}: ${this.getTradeHistory(index)}

Respond in JSON format:
{
  "action": "BUY_CE|BUY_PE|SELL_CE|SELL_PE|HOLD|EXIT",
  "strike": "strike_price_if_action_is_buy_or_sell",
  "quantity": "lot_size",
  "reason": "brief_explanation",
  "stopLoss": "sl_price",
  "target": "target_price",
  "confidence": "percentage"
}`;

    const userMessage = `Market Data:
LTP: ${ltp}
Indicators: ${JSON.stringify(indicators)}
Option Chain: ${JSON.stringify(optionChain, null, 2)}
Current Positions: ${JSON.stringify(positions)}

Please analyze and provide trading decision.`;

    return [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage }
    ];
  }

  parseGPTResponse(response) {
    try {
      // Extract JSON from response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      
      // Fallback parsing
      return {
        action: 'HOLD',
        reason: 'Failed to parse GPT response',
        confidence: '50'
      };
    } catch (error) {
      console.error('❌ Failed to parse GPT response:', error);
      return {
        action: 'HOLD',
        reason: 'Parse error',
        confidence: '0'
      };
    }
  }

  updateTradeMemory(index, decision) {
    if (!this.tradeMemory.has(index)) {
      this.tradeMemory.set(index, []);
    }
    
    const history = this.tradeMemory.get(index);
    history.push({
      timestamp: new Date().toISOString(),
      decision: decision
    });
    
    // Keep only last 50 trades per index
    if (history.length > 50) {
      history.shift();
    }
  }

  getTradeHistory(index) {
    const history = this.tradeMemory.get(index) || [];
    return history.slice(-5).map(trade => 
      `${trade.timestamp}: ${trade.decision.action} - ${trade.decision.reason}`
    ).join('\n');
  }

  clearTradeMemory(index = null) {
    if (index) {
      this.tradeMemory.delete(index);
    } else {
      this.tradeMemory.clear();
    }
  }

  async chatWithGPT(message, context, provider = 'openai') {
    try {
      // Check if API keys are configured
      if (provider === 'openrouter' && !this.openrouterApiKey) {
        return 'OpenRouter API key not configured. Please set OPENROUTER_API_KEY in your .env file to use this provider.';
      }
      
      if (provider === 'openai' && !this.openaiApiKey) {
        return 'OpenAI API key not configured. Please set OPENAI_API_KEY in your .env file to use this provider.';
      }

      const messages = [
        {
          role: 'system',
          content: `You are FAi-3.0, a friendly AI trading assistant. You help users understand trading decisions and market analysis. Be conversational and helpful. Current context: ${JSON.stringify(context)}`
        },
        {
          role: 'user',
          content: message
        }
      ];

      if (provider === 'openrouter') {
        return await this.callOpenRouter(messages);
      } else {
        return await this.callOpenAI(messages);
      }
    } catch (error) {
      console.error('❌ Chat GPT error:', error);
      return 'Sorry, I encountered an error. Please check your API configuration and try again.';
    }
  }
}