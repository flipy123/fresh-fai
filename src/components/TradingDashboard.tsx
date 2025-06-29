import React, { useState, useEffect } from 'react';
import { Header } from './Header';
import { ControlPanel } from './ControlPanel';
import { MainDashboard } from './MainDashboard';
import { ChatPanel } from './ChatPanel';
import { OTPModal } from './OTPModal';
import { useApi } from '../contexts/ApiContext';

export const TradingDashboard: React.FC = () => {
  const [showOTPModal, setShowOTPModal] = useState(false);
  const [authStatus, setAuthStatus] = useState<any>(null);
  const { api } = useApi();

  useEffect(() => {
    const checkAuthStatus = async () => {
      try {
        const response = await api.get('/kotak/auth-status');
        if (response.data.success) {
          setAuthStatus(response.data);
          
          // Show OTP modal if OTP is required and user can't trade
          if (response.data.otpStatus?.otpRequired && !response.data.canTrade) {
            setShowOTPModal(true);
          }
        }
      } catch (error) {
        console.error('Failed to fetch auth status:', error);
      }
    };

    // Check immediately
    checkAuthStatus();
    
    // Check every 3 seconds
    const interval = setInterval(checkAuthStatus, 3000);
    
    return () => clearInterval(interval);
  }, [api]);

  const handleOTPSuccess = () => {
    setShowOTPModal(false);
    // Refresh auth status after successful OTP validation
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

  return (
    <div className="h-screen flex flex-col bg-gray-900">
      <Header />
      <ControlPanel />
      <div className="flex-1 flex overflow-hidden">
        <MainDashboard />
        <ChatPanel />
      </div>
      
      {/* OTP Modal */}
      <OTPModal
        isOpen={showOTPModal}
        onClose={() => setShowOTPModal(false)}
        onSuccess={handleOTPSuccess}
      />
      
      {/* Manual OTP Trigger Button - for testing */}
      {authStatus?.otpStatus?.otpRequired && !authStatus.canTrade && (
        <div className="fixed bottom-4 right-4 z-40">
          <button
            onClick={() => setShowOTPModal(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg shadow-lg flex items-center space-x-2"
          >
            <span>🔐</span>
            <span>Enter OTP</span>
          </button>
        </div>
      )}
    </div>
  );
};