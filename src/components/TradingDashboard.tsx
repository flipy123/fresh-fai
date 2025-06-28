import React from 'react';
import { Header } from './Header';
import { ControlPanel } from './ControlPanel';
import { MainDashboard } from './MainDashboard';
import { ChatPanel } from './ChatPanel';

export const TradingDashboard: React.FC = () => {
  return (
    <div className="h-screen flex flex-col bg-gray-900">
      <Header />
      <ControlPanel />
      <div className="flex-1 flex overflow-hidden">
        <MainDashboard />
        <ChatPanel />
      </div>
    </div>
  );
};