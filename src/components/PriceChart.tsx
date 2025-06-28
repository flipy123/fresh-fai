import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useSocket } from '../contexts/SocketContext';
import { useTrading } from '../contexts/TradingContext';

export const PriceChart: React.FC = () => {
  const { marketData } = useSocket();
  const { state } = useTrading();
  const [chartData, setChartData] = useState<any[]>([]);

  useEffect(() => {
    if (marketData && marketData.ltp) {
      const now = new Date();
      const newDataPoint = {
        time: now.toLocaleTimeString(),
        price: marketData.ltp,
        timestamp: now.getTime()
      };

      setChartData(prev => {
        const updated = [...prev, newDataPoint];
        // Keep only last 50 data points
        return updated.slice(-50);
      });
    }
  }, [marketData]);

  return (
    <div className="bg-gray-800 rounded-lg p-6">
      <h3 className="text-lg font-semibold text-white mb-4">
        {state.selectedIndex} Live Price
      </h3>
      <div className="h-64">
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis 
                dataKey="time" 
                stroke="#9CA3AF"
                fontSize={12}
                tick={{ fill: '#9CA3AF' }}
              />
              <YAxis 
                stroke="#9CA3AF"
                fontSize={12}
                tick={{ fill: '#9CA3AF' }}
                domain={['dataMin - 10', 'dataMax + 10']}
              />
              <Tooltip 
                contentStyle={{
                  backgroundColor: '#1F2937',
                  border: '1px solid #374151',
                  borderRadius: '6px',
                  color: '#F9FAFB'
                }}
              />
              <Line 
                type="monotone" 
                dataKey="price" 
                stroke="#3B82F6" 
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: '#3B82F6' }}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex items-center justify-center h-full text-gray-400">
            Waiting for market data...
          </div>
        )}
      </div>
    </div>
  );
};