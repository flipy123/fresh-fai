export class IndicatorService {
  static calculateRSI(prices, period = 14) {
    if (prices.length < period + 1) return null;
    
    let gains = 0;
    let losses = 0;
    
    // Calculate initial average gain/loss
    for (let i = 1; i <= period; i++) {
      const change = prices[i] - prices[i - 1];
      if (change > 0) gains += change;
      else losses -= change;
    }
    
    let avgGain = gains / period;
    let avgLoss = losses / period;
    
    // Calculate RSI for the latest point
    for (let i = period + 1; i < prices.length; i++) {
      const change = prices[i] - prices[i - 1];
      const gain = change > 0 ? change : 0;
      const loss = change < 0 ? -change : 0;
      
      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;
    }
    
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  }

  static calculateMACD(prices, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
    if (prices.length < slowPeriod) return null;
    
    const fastEMA = this.calculateEMA(prices, fastPeriod);
    const slowEMA = this.calculateEMA(prices, slowPeriod);
    
    if (!fastEMA || !slowEMA) return null;
    
    const macdLine = fastEMA - slowEMA;
    const macdHistory = [macdLine]; // In real implementation, you'd need more history
    const signalLine = this.calculateEMA(macdHistory, signalPeriod);
    
    return {
      macd: macdLine,
      signal: signalLine,
      histogram: macdLine - (signalLine || 0)
    };
  }

  static calculateEMA(prices, period) {
    if (prices.length < period) return null;
    
    const multiplier = 2 / (period + 1);
    let ema = prices.slice(0, period).reduce((sum, price) => sum + price, 0) / period;
    
    for (let i = period; i < prices.length; i++) {
      ema = (prices[i] * multiplier) + (ema * (1 - multiplier));
    }
    
    return ema;
  }

  static calculateSMA(prices, period) {
    if (prices.length < period) return null;
    
    const sum = prices.slice(-period).reduce((acc, price) => acc + price, 0);
    return sum / period;
  }

  static calculateBollingerBands(prices, period = 20, stdDev = 2) {
    if (prices.length < period) return null;
    
    const sma = this.calculateSMA(prices.slice(-period), period);
    const squaredDeviations = prices.slice(-period).map(price => Math.pow(price - sma, 2));
    const variance = squaredDeviations.reduce((sum, dev) => sum + dev, 0) / period;
    const standardDeviation = Math.sqrt(variance);
    
    return {
      middle: sma,
      upper: sma + (standardDeviation * stdDev),
      lower: sma - (standardDeviation * stdDev)
    };
  }

  static calculateSupertrendIndicator(highs, lows, closes, period = 7, multiplier = 3) {
    if (highs.length < period || lows.length < period || closes.length < period) {
      return null;
    }
    
    const hl2 = highs.map((high, i) => (high + lows[i]) / 2);
    const atr = this.calculateATR(highs, lows, closes, period);
    
    if (!atr) return null;
    
    const basicUpperBand = hl2[hl2.length - 1] + (multiplier * atr);
    const basicLowerBand = hl2[hl2.length - 1] - (multiplier * atr);
    
    // Simplified supertrend calculation (full implementation would need more history)
    const close = closes[closes.length - 1];
    const trend = close <= basicLowerBand ? 'DOWN' : close >= basicUpperBand ? 'UP' : 'NEUTRAL';
    
    return {
      value: trend === 'UP' ? basicLowerBand : basicUpperBand,
      trend: trend
    };
  }

  static calculateATR(highs, lows, closes, period = 14) {
    if (highs.length < period + 1) return null;
    
    const trueRanges = [];
    
    for (let i = 1; i < highs.length; i++) {
      const tr1 = highs[i] - lows[i];
      const tr2 = Math.abs(highs[i] - closes[i - 1]);
      const tr3 = Math.abs(lows[i] - closes[i - 1]);
      trueRanges.push(Math.max(tr1, tr2, tr3));
    }
    
    return this.calculateSMA(trueRanges.slice(-period), period);
  }

  static analyzeAllIndicators(ohlcData) {
    const { opens, highs, lows, closes, volumes } = ohlcData;
    
    return {
      rsi: this.calculateRSI(closes),
      macd: this.calculateMACD(closes),
      sma20: this.calculateSMA(closes, 20),
      sma50: this.calculateSMA(closes, 50),
      ema12: this.calculateEMA(closes, 12),
      ema26: this.calculateEMA(closes, 26),
      bollingerBands: this.calculateBollingerBands(closes),
      supertrend: this.calculateSupertrendIndicator(highs, lows, closes),
      atr: this.calculateATR(highs, lows, closes),
      currentPrice: closes[closes.length - 1],
      volume: volumes[volumes.length - 1]
    };
  }
}