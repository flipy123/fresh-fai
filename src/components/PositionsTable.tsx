import React from 'react';
import { useTrading } from '../contexts/TradingContext';

export const PositionsTable: React.FC = () => {
  const { state } = useTrading();

  if (state.positions.length === 0) {
    return (
      <div className="bg-gray-800 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Open Positions</h3>
        <div className="text-center text-gray-400 py-8">
          No open positions
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-800 rounded-lg p-6">
      <h3 className="text-lg font-semibold text-white mb-4">Open Positions</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-700">
              <th className="text-left text-gray-400 py-2">Symbol</th>
              <th className="text-right text-gray-400 py-2">Qty</th>
              <th className="text-right text-gray-400 py-2">Avg Price</th>
              <th className="text-right text-gray-400 py-2">LTP</th>
              <th className="text-right text-gray-400 py-2">P&L</th>
            </tr>
          </thead>
          <tbody>
            {state.positions.map((position, index) => (
              <tr key={index} className="border-b border-gray-700/50">
                <td className="text-white py-2">{position.symbol}</td>
                <td className="text-right text-white py-2">{position.quantity}</td>
                <td className="text-right text-white py-2">₹{position.avgPrice}</td>
                <td className="text-right text-white py-2">₹{position.ltp}</td>
                <td className={`text-right py-2 ${position.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  ₹{position.pnl}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};