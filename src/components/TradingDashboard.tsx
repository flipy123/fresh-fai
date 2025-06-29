import React, { useState, useEffect } from 'react';
import { Header } from './Header';
import { ControlPanel } from './ControlPanel';
import { MainDashboard } from './MainDashboard';
import { ChatPanel } from './ChatPanel';
import { useApi } from '../contexts/ApiContext';

export const TradingDashboard: React.FC = () => {
  const [authStatus, setAuthStatus] = useState<any>(null);
  const { api } = useApi();

  useEffect(() => {
    const checkAuthStatus = async () => {
      try {
        const response = await api.get('/kotak/auth-status');
        if (response.data.success) {
          setAuthStatus(response.data);
          console.log('🔐 Dashboard Auth Status:', response.data);
        }
      } catch (error) {
        console.error('Failed to fetch auth status:', error);
      }
    };

    // Check immediately
    checkAuthStatus();
    
    // Check every 10 seconds
    const interval = setInterval(checkAuthStatus, 10000);
    
    return () => clearInterval(interval);
  }, [api]);

  const handleTestConnection = async () => {
    try {
      const response = await api.get('/kotak/test-connection');
      console.log('🔗 Connection test result:', response.data);
    } catch (error) {
      console.error('❌ Connection test failed:', error);
    }
  };

  return (
    <div className="h-screen flex flex-col bg-gray-900">
      <Header />
      <ControlPanel />
      <div className="flex-1 flex overflow-hidden">
        <MainDashboard />
        <ChatPanel />
      </div>
      
      {/* OAuth2 Status Indicator */}
      {authStatus && (
        <div className="fixed bottom-4 left-4 z-40">
          <div className={`px-3 py-2 rounded-lg text-sm ${
            authStatus.authenticated 
              ? 'bg-green-600/20 border border-green-600/30 text-green-400'
              : 'bg-red-600/20 border border-red-600/30 text-red-400'
          }`}>
            <div className="flex items-center space-x-2">
              <div className={`w-2 h-2 rounded-full ${
                authStatus.authenticated ? 'bg-green-400' : 'bg-red-400'
              }`}></div>
              <span>
                {authStatus.authenticated ? 'OAuth2 Active' : 'OAuth2 Inactive'}
              </span>
            </div>
            <div className="text-xs opacity-75">
              Method: {authStatus.authMethod || 'OAuth2'}
            </div>
          </div>
        </div>
      )}
      
      {/* Test Connection Button - for debugging */}
      <div className="fixed bottom-4 right-4 z-40">
        <button
          onClick={handleTestConnection}
          className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg shadow-lg text-sm"
        >
          🔗 Test API
        </button>
      </div>
    </div>
  );
};