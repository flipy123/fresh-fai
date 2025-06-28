import React from 'react';
import { StatsCards } from './StatsCards';
import { PositionsTable } from './PositionsTable';
import { OrdersTable } from './OrdersTable';
import { TradeLogs } from './TradeLogs';
import { PriceChart } from './PriceChart';

export const MainDashboard: React.FC = () => {
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="p-6 space-y-6 overflow-auto">
        <StatsCards />
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <PriceChart />
          <TradeLogs />
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <PositionsTable />
          <OrdersTable />
        </div>
      </div>
    </div>
  );
};