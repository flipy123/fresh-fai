import React, { useState, useEffect } from 'react';
import { Brain, Wifi, WifiOff, Activity, Key, CheckCircle, AlertCircle, RefreshCw } from 'lucide-react';
import { useSocket } from '../contexts/SocketContext';
import { useTrading } from '../contexts/TradingContext';
import { useApi } from '../contexts/ApiContext';

export const Header: React.FC = () => {
  const { connected, marketData } = useSocket();
  const { state } = useTrading();
  const { api } = useApi();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [gptTimer, setGptTimer] = useState(state.gptInterval);
  const [authStatus, setAuthStatus] = useState<any>(null);
  const [currentMarketData, setCurrentMarketData] = useState<any>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const fetchAuthStatus = async () => {
      try {
        const response = await api.get('/kotak/auth-status');
        if (response.data.success) {
          setAuthStatus(response.data);
          console.log('🔐 Auth Status:', response.data);
        }
      } catch (error) {
        console.error('Failed to fetch auth status:', error);
      }
    };

    fetchAuthStatus();
    const interval = setInterval(fetchAuthStatus, 10000); // Check every 10 seconds
    return () => clearInterval(interval);
  }, [api]);

  useEffect(() => {
    const fetchMarketData = async () => {
      try {
        const response = await api.get(`/kotak/market-data/${state.selectedIndex}`);
        if (response.data.success && response.data.data) {
          setCurrentMarketData(response.data.data);
          console.log('📈 Market data fetched:', response.data.data);
        }
      } catch (error) {
        console.error('Failed to fetch market data:', error);
      }
    };

    fetchMarketData();
    const interval = setInterval(fetchMarketData, 3000); // Fetch every 3 seconds
    return () => clearInterval(interval);
  }, [api, state.selectedIndex]);

  useEffect(() => {
    if (marketData) {
      console.log('📊 WebSocket market data received:', marketData);
      if (marketData.symbol === state.selectedIndex || 
          (marketData.token && marketData.token.includes(state.selectedIndex))) {
        setCurrentMarketData(marketData);
      }
    }
  }, [marketData, state.selectedIndex]);

  useEffect(() => {
    if (state.isTrading) {
      const gptTimerInterval = setInterval(() => {
        setGptTimer((prev) => {
          if (prev <= 1) {
            return state.gptInterval;
          }
          return prev - 1;
        });
      }, 1000);

      return () => clearInterval(gptTimerInterval);
    }
  }, [state.isTrading, state.gptInterval]);

  const handleRefreshToken = async () => {
    setIsRefreshing(true);
    try {
      const response = await api.post('/kotak/refresh-token');
      if (response.data.success) {
        console.log('✅ Token refreshed successfully');
        // Refresh auth status
        const authResponse = await api.get('/kotak/auth-status');
        if (authResponse.data.success) {
          setAuthStatus(authResponse.data);
        }
      }
    } catch (error) {
      console.error('❌ Failed to refresh token:', error);
    } finally {
      setIsRefreshing(false);
    }
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-IN', {
      hour12: false,
      timeZone: 'Asia/Kolkata'
    });
  };

  const getLTPDisplay = () => {
    if (currentMarketData) {
      return {
        price: currentMarketData.ltp || 0,
        change: currentMarketData.change || 0,
        changePercent: currentMarketData.changePercent || 0
      };
    }
    return { price: 0, change: 0, changePercent: 0 };
  };

  const getAuthStatusIcon = () => {
    if (!authStatus) return <AlertCircle className="w-5 h-5 text-gray-400" />;
    
    if (authStatus.canTrade && authStatus.authenticated) {
      return <CheckCircle className="w-5 h-5 text-green-400" />;
    } else if (authStatus.authenticated) {
      return <Key className="w-5 h-5 text-yellow-400" />;
    } else {
      return <AlertCircle className="w-5 h-5 text-red-400" />;
    }
  };

  const getAuthStatusText = () => {
    if (!authStatus) return 'Checking...';
    
    if (authStatus.canTrade && authStatus.authenticated) {
      return 'OAuth2 Connected';
    } else if (authStatus.authenticated) {
      return 'Connected (View Only)';
    } else {
      return 'Not Connected';
    }
  };

  const { price, change, changePercent } = getLTPDisplay();
  const isPositive = change >= 0;

  return (
    <header className="bg-gray-800 border-b border-gray-700 px-6 py-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-6">
          <div className="flex items-center space-x-2">
            <Brain className="w-8 h-8 text-blue-400" />
            <h1 className="text-2xl font-bold text-white">FAi-3.0</h1>
            <span className="text-sm text-gray-400">Trading System</span>
          </div>
          
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              {connected ? (
                <Wifi className="w-5 h-5 text-green-400" />
              ) : (
                <WifiOff className="w-5 h-5 text-red-400" />
              )}
              <span className="text-sm text-gray-300">
                {connected ? 'WebSocket Connected' : 'WebSocket Disconnected'}
              </span>
            </div>

            <div className="flex items-center space-x-2">
              {getAuthStatusIcon()}
              <span className="text-sm text-gray-300">
                {getAuthStatusText()}
              </span>
              {authStatus && !authStatus.authenticated && (
                <button
                  onClick={handleRefreshToken}
                  disabled={isRefreshing}
                  className="ml-2 p-1 text-blue-400 hover:text-blue-300 disabled:opacity-50"
                  title="Refresh OAuth2 Token"
                >
                  <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                </button>
              )}
            </div>
            
            <div className="text-sm text-gray-300">
              IST: {formatTime(currentTime)}
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-6">
          <div className="text-center">
            <div className="text-sm text-gray-400">LTP</div>
            <div className="flex items-center space-x-2">
              <span className="text-xl font-bold text-white">
                {price > 0 ? price.toLocaleString('en-IN', { minimumFractionDigits: 2 }) : '0.00'}
              </span>
              {price > 0 && (
                <span className={`text-sm ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
                  {isPositive ? '+' : ''}{change.toFixed(2)} ({changePercent.toFixed(2)}%)
                </span>
              )}
            </div>
            <div className="text-xs text-gray-500">{state.selectedIndex}</div>
          </div>

          {state.isTrading && (
            <div className="text-center">
              <div className="text-sm text-gray-400">GPT Analysis</div>
              <div className="flex items-center space-x-2">
                <Activity className="w-4 h-4 text-blue-400" />
                <span className="text-lg font-mono text-blue-400">
                  {gptTimer}s
                </span>
              </div>
              <div className="text-xs text-gray-500">Next Analysis</div>
            </div>
          )}

          <div className="text-center">
            <div className="text-sm text-gray-400">P&L</div>
            <div className={`text-xl font-bold ${state.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              ₹{state.pnl.toLocaleString('en-IN')}
            </div>
          </div>

          <div className="text-center">
            <div className="text-sm text-gray-400">Wallet</div>
            <div className="text-xl font-bold text-white">
              ₹{state.wallet.available.toLocaleString('en-IN')}
            </div>
            <div className="text-xs text-gray-500">
              Total: ₹{state.wallet.total.toLocaleString('en-IN')}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};