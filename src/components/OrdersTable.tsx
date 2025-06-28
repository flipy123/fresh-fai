import React from 'react';
import { useTrading } from '../contexts/TradingContext';

export const OrdersTable: React.FC = () => {
  const { state } = useTrading();

  if (state.orders.length === 0) {
    return (
      <div className="bg-gray-800 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Orders</h3>
        <div className="text-center text-gray-400 py-8">
          No orders
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-800 rounded-lg p-6">
      <h3 className="text-lg font-semibold text-white mb-4">Orders</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-700">
              <th className="text-left text-gray-400 py-2">Symbol</th>
              <th className="text-right text-gray-400 py-2">Type</th>
              <th className="text-right text-gray-400 py-2">Qty</th>
              <th className="text-right text-gray-400 py-2">Price</th>
              <th className="text-right text-gray-400 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {state.orders.map((order, index) => (
              <tr key={index} className="border-b border-gray-700/50">
                <td className="text-white py-2">{order.symbol}</td>
                <td className="text-right text-white py-2">{order.type}</td>
                <td className="text-right text-white py-2">{order.quantity}</td>
                <td className="text-right text-white py-2">₹{order.price}</td>
                <td className={`text-right py-2 ${
                  order.status === 'EXECUTED' ? 'text-green-400' : 
                  order.status === 'REJECTED' ? 'text-red-400' : 'text-yellow-400'
                }`}>
                  {order.status}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};