import React, { useState, useEffect } from 'react';
import { Brain, Wifi, WifiOff, Activity, Key, CheckCircle, AlertCircle } from 'lucide-react';
import { useSocket } from '../contexts/SocketContext';
import { useTrading } from '../contexts/TradingContext';
import { useApi } from '../contexts/ApiContext';
import { OTPModal } from './OTPModal';

export const Header: React.FC = () => {
  const { connected, marketData } = useSocket();
  const { state } = useTrading();
  const { api } = useApi();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [gptTimer, setGptTimer] = useState(state.gptInterval);
  const [authStatus, setAuthStatus] = useState<any>(null);
  const [showOTPModal, setShowOTPModal] = useState(false);

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
          
          // Show OTP modal if OTP is required
          if (response.data.otpStatus?.otpRequired && !response.data.canTrade) {
            setShowOTPModal(true);
          }
        }
      } catch (error) {
        console.error('Failed to fetch auth status:', error);
      }
    };

    fetchAuthStatus();
    const interval = setInterval(fetchAuthStatus, 5000);
    return () => clearInterval(interval);
  }, [api]);

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

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-IN', {
      hour12: false,
      timeZone: 'Asia/Kolkata'
    });
  };

  const getLTPDisplay = () => {
    if (marketData && marketData.token) {
      return {
        price: marketData.ltp || 0,
        change: marketData.change || 0,
        changePercent: marketData.changePercent || 0
      };
    }
    return { price: 0, change: 0, changePercent: 0 };
  };

  const getAuthStatusIcon = () => {
    if (!authStatus) return <AlertCircle className="w-5 h-5 text-gray-400" />;
    
    if (authStatus.canTrade) {
      return <CheckCircle className="w-5 h-5 text-green-400" />;
    } else if (authStatus.authenticated) {
      return <Key className="w-5 h-5 text-yellow-400" />;
    } else {
      return <AlertCircle className="w-5 h-5 text-red-400" />;
    }
  };

  const getAuthStatusText = () => {
    if (!authStatus) return 'Checking...';
    
    if (authStatus.canTrade) {
      return 'Trading Enabled';
    } else if (authStatus.otpStatus?.otpRequired) {
      return 'OTP Required';
    } else if (authStatus.authenticated) {
      return 'View Only';
    } else {
      return 'Not Connected';
    }
  };

  const handleOTPSuccess = () => {
    setShowOTPModal(false);
    // Refresh auth status
    setTimeout(async () => {
      try {
        const response = await api.get('/kotak/auth-status');
        if (response.data.success) {
          setAuthStatus(response.data);
        }
      } catch (error) {
        console.error('Failed to refresh auth status:', error);
      }
    }, 1000);
  };

  const { price, change, changePercent } = getLTPDisplay();
  const isPositive = change >= 0;

  return (
    <>
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
                  {connected ? 'Connected' : 'Disconnected'}
                </span>
              </div>

              <div className="flex items-center space-x-2">
                {getAuthStatusIcon()}
                <span className="text-sm text-gray-300">
                  {getAuthStatusText()}
                </span>
                {authStatus?.otpStatus?.otpRequired && !authStatus.canTrade && (
                  <button
                    onClick={() => setShowOTPModal(true)}
                    className="ml-2 px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded"
                  >
                    Enter OTP
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
                  {price.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
                <span className={`text-sm ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
                  {isPositive ? '+' : ''}{change.toFixed(2)} ({changePercent.toFixed(2)}%)
                </span>
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
                ₹{state.wallet.toLocaleString('en-IN')}
              </div>
            </div>
          </div>
        </div>
      </header>

      <OTPModal
        isOpen={showOTPModal}
        onClose={() => setShowOTPModal(false)}
        onSuccess={handleOTPSuccess}
      />
    </>
  );
};