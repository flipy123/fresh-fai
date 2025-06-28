import React, { useEffect, useRef } from 'react';
import { useTrading } from '../contexts/TradingContext';

export const TradeLogs: React.FC = () => {
  const { state } = useTrading();
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [state.logs]);

  return (
    <div className="bg-gray-800 rounded-lg p-6">
      <h3 className="text-lg font-semibold text-white mb-4">Trade Logs</h3>
      <div className="h-64 overflow-y-auto bg-gray-900 rounded border border-gray-700 p-3">
        {state.logs.length === 0 ? (
          <div className="text-center text-gray-400 py-8">
            No logs yet. Start trading to see activity.
          </div>
        ) : (
          <div className="space-y-1">
            {state.logs.map((log, index) => (
              <div key={index} className="text-sm text-gray-300 font-mono">
                <span className="text-gray-500">
                  [{new Date().toLocaleTimeString()}]
                </span>{' '}
                {log}
              </div>
            ))}
            <div ref={logsEndRef} />
          </div>
        )}
      </div>
    </div>
  );
};