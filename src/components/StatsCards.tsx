import React from 'react';
import { TrendingUp, TrendingDown, DollarSign, FileText } from 'lucide-react';
import { useTrading } from '../contexts/TradingContext';

export const StatsCards: React.FC = () => {
  const { state } = useTrading();

  const cards = [
    {
      title: 'Open Positions',
      value: state.positions.length,
      icon: FileText,
      color: 'blue'
    },
    {
      title: 'Total Orders',
      value: state.orders.length,
      icon: DollarSign,
      color: 'purple'
    },
    {
      title: 'Total Trades',
      value: state.trades.length,
      icon: TrendingUp,
      color: 'green'
    },
    {
      title: 'Live P&L',
      value: `₹${state.pnl.toLocaleString('en-IN')}`,
      icon: state.pnl >= 0 ? TrendingUp : TrendingDown,
      color: state.pnl >= 0 ? 'green' : 'red'
    }
  ];

  const getColorClasses = (color: string) => {
    const colors = {
      blue: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
      purple: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
      green: 'bg-green-500/10 text-green-400 border-green-500/20',
      red: 'bg-red-500/10 text-red-400 border-red-500/20'
    };
    return colors[color as keyof typeof colors] || colors.blue;
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {cards.map((card, index) => (
        <div
          key={index}
          className={`p-6 rounded-lg border ${getColorClasses(card.color)} backdrop-blur-sm`}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-400 mb-1">{card.title}</p>
              <p className="text-2xl font-bold text-white">{card.value}</p>
            </div>
            <card.icon className="w-8 h-8" />
          </div>
        </div>
      ))}
    </div>
  );
};