import React, { useState, useEffect } from 'react';
import { Play, Square, Settings, RotateCcw } from 'lucide-react';
import { useTrading } from '../contexts/TradingContext';
import { useApi } from '../contexts/ApiContext';

export const ControlPanel: React.FC = () => {
  const { state, dispatch } = useTrading();
  const { api } = useApi();
  const [availableIndices, setAvailableIndices] = useState<any[]>([]);

  useEffect(() => {
    const fetchAvailableIndices = async () => {
      try {
        const response = await api.get('/kotak/indices');
        if (response.data.success) {
          setAvailableIndices(response.data.data);
          console.log('📊 Available indices:', response.data.data);
        }
      } catch (error) {
        console.error('Failed to fetch available indices:', error);
      }
    };

    fetchAvailableIndices();
  }, [api]);

  const handleToggleTrading = () => {
    dispatch({ type: 'SET_TRADING_STATUS', payload: !state.isTrading });
    
    if (!state.isTrading) {
      dispatch({ 
        type: 'ADD_LOG', 
        payload: `Trading started for ${state.selectedIndex} in ${state.isTestMode ? 'TEST' : 'LIVE'} mode`
      });
    } else {
      dispatch({ 
        type: 'ADD_LOG', 
        payload: 'Trading stopped'
      });
    }
  };

  const handleResetTrades = async () => {
    try {
      await api.post('/gpt/clear-memory', { index: state.selectedIndex });
      dispatch({ type: 'CLEAR_TRADES' });
      dispatch({ type: 'CLEAR_LOGS' });
      dispatch({ 
        type: 'ADD_LOG', 
        payload: `Trade history cleared for ${state.selectedIndex}`
      });
    } catch (error) {
      console.error('Failed to reset trades:', error);
    }
  };

  const handleIndexChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const newIndex = event.target.value;
    dispatch({ type: 'SET_SELECTED_INDEX', payload: newIndex });
    dispatch({ 
      type: 'ADD_LOG', 
      payload: `Index changed to ${newIndex}`
    });
  };

  const handleGptIntervalChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const interval = Math.max(1, Math.min(600, parseInt(event.target.value) || 8));
    dispatch({ type: 'SET_GPT_INTERVAL', payload: interval });
  };

  return (
    <div className="bg-gray-800 border-b border-gray-700 px-6 py-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <label className="text-sm text-gray-300">Index:</label>
            <select
              value={state.selectedIndex}
              onChange={handleIndexChange}
              disabled={state.isTrading}
              className="bg-gray-700 text-white px-3 py-1 rounded border border-gray-600 focus:border-blue-400 focus:outline-none"
            >
              {availableIndices.length > 0 ? (
                availableIndices.map((index) => (
                  <option key={index.symbol} value={index.symbol}>
                    {index.displayName}
                  </option>
                ))
              ) : (
                <>
                  <option value="NIFTY">NIFTY 50</option>
                  <option value="BANKNIFTY">BANK NIFTY</option>
                  <option value="FINNIFTY">FIN NIFTY</option>
                  <option value="MIDCPNIFTY">MIDCAP NIFTY</option>
                </>
              )}
            </select>
          </div>

          <div className="flex items-center space-x-2">
            <label className="text-sm text-gray-300">Mode:</label>
            <button
              onClick={() => dispatch({ type: 'SET_TEST_MODE', payload: !state.isTestMode })}
              disabled={state.isTrading}
              className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                state.isTestMode
                  ? 'bg-blue-600 text-white'
                  : 'bg-green-600 text-white'
              }`}
            >
              {state.isTestMode ? 'TEST' : 'LIVE'}
            </button>
          </div>

          <div className="flex items-center space-x-2">
            <label className="text-sm text-gray-300">Brain:</label>
            <select
              value={state.gptProvider}
              onChange={(e) => dispatch({ type: 'SET_GPT_PROVIDER', payload: e.target.value })}
              className="bg-gray-700 text-white px-3 py-1 rounded border border-gray-600 focus:border-blue-400 focus:outline-none"
            >
              <option value="openai">OpenAI GPT-4o</option>
              <option value="openrouter">OpenRouter GPT-4o</option>
            </select>
          </div>

          <div className="flex items-center space-x-2">
            <label className="text-sm text-gray-300">Interval (s):</label>
            <input
              type="number"
              min="1"
              max="600"
              value={state.gptInterval}
              onChange={handleGptIntervalChange}
              className="bg-gray-700 text-white px-3 py-1 rounded border border-gray-600 focus:border-blue-400 focus:outline-none w-20"
            />
          </div>
        </div>

        <div className="flex items-center space-x-4">
          <button
            onClick={handleResetTrades}
            className="flex items-center space-x-2 px-4 py-2 bg-gray-600 hover:bg-gray-500 text-white rounded transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            <span>Reset</span>
          </button>

          <button
            onClick={handleToggleTrading}
            className={`flex items-center space-x-2 px-6 py-2 rounded font-medium transition-colors ${
              state.isTrading
                ? 'bg-red-600 hover:bg-red-700 text-white'
                : 'bg-green-600 hover:bg-green-700 text-white'
            }`}
          >
            {state.isTrading ? (
              <>
                <Square className="w-4 h-4" />
                <span>Stop Trading</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                <span>Start Trading</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};