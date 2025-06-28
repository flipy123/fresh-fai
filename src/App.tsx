import React from 'react';
import { TradingDashboard } from './components/TradingDashboard';
import { ApiProvider } from './contexts/ApiContext';
import { SocketProvider } from './contexts/SocketContext';
import { TradingProvider } from './contexts/TradingContext';

function App() {
  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <ApiProvider>
        <SocketProvider>
          <TradingProvider>
            <TradingDashboard />
          </TradingProvider>
        </SocketProvider>
      </ApiProvider>
    </div>
  );
}

export default App;