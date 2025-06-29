import React, { createContext, useContext, useReducer, useEffect, ReactNode } from 'react';
import { useSocket } from './SocketContext';
import { useApi } from './ApiContext';

interface TradingState {
  selectedIndex: string;
  isTrading: boolean;
  isTestMode: boolean;
  gptProvider: 'openai' | 'openrouter';
  gptInterval: number;
  positions: any[];
  orders: any[];
  pnl: number;
  wallet: {
    available: number;
    used: number;
    total: number;
  };
  trades: any[];
  logs: string[];
}

interface TradingContextType {
  state: TradingState;
  dispatch: React.Dispatch<any>;
}

const initialState: TradingState = {
  selectedIndex: 'NIFTY',
  isTrading: false,
  isTestMode: true,
  gptProvider: 'openai',
  gptInterval: 8,
  positions: [],
  orders: [],
  pnl: 0,
  wallet: {
    available: 0,
    used: 0,
    total: 0
  },
  trades: [],
  logs: []
};

const TradingContext = createContext<TradingContextType | undefined>(undefined);

export const useTrading = () => {
  const context = useContext(TradingContext);
  if (!context) {
    throw new Error('useTrading must be used within a TradingProvider');
  }
  return context;
};

function tradingReducer(state: TradingState, action: any): TradingState {
  switch (action.type) {
    case 'SET_SELECTED_INDEX':
      return { ...state, selectedIndex: action.payload };
    case 'SET_TRADING_STATUS':
      return { ...state, isTrading: action.payload };
    case 'SET_TEST_MODE':
      return { ...state, isTestMode: action.payload };
    case 'SET_GPT_PROVIDER':
      return { ...state, gptProvider: action.payload };
    case 'SET_GPT_INTERVAL':
      return { ...state, gptInterval: action.payload };
    case 'UPDATE_POSITIONS':
      return { ...state, positions: action.payload };
    case 'UPDATE_ORDERS':
      return { ...state, orders: action.payload };
    case 'UPDATE_PNL':
      return { ...state, pnl: action.payload };
    case 'UPDATE_WALLET':
      return { ...state, wallet: action.payload };
    case 'ADD_TRADE':
      return { ...state, trades: [...state.trades, action.payload] };
    case 'ADD_LOG':
      return { ...state, logs: [...state.logs, action.payload] };
    case 'CLEAR_TRADES':
      return { ...state, trades: [] };
    case 'CLEAR_LOGS':
      return { ...state, logs: [] };
    default:
      return state;
  }
}

interface TradingProviderProps {
  children: ReactNode;
}

export const TradingProvider: React.FC<TradingProviderProps> = ({ children }) => {
  const [state, dispatch] = useReducer(tradingReducer, initialState);
  const { socket } = useSocket();
  const { api } = useApi();

  // Listen for data updates from WebSocket
  useEffect(() => {
    if (!socket) return;

    const handleDataUpdate = (data: any) => {
      if (data.positions) {
        dispatch({ type: 'UPDATE_POSITIONS', payload: data.positions });
        
        // Calculate P&L from positions
        const totalPnl = data.positions.reduce((sum: number, pos: any) => {
          return sum + (parseFloat(pos.pnl) || 0);
        }, 0);
        dispatch({ type: 'UPDATE_PNL', payload: totalPnl });
      }
      
      if (data.orders) {
        dispatch({ type: 'UPDATE_ORDERS', payload: data.orders });
      }
    };

    const handleOrderUpdate = (data: any) => {
      dispatch({ type: 'ADD_LOG', payload: `Order update: ${data.status}` });
    };

    socket.on('data_update', handleDataUpdate);
    socket.on('order_update', handleOrderUpdate);

    return () => {
      socket.off('data_update', handleDataUpdate);
      socket.off('order_update', handleOrderUpdate);
    };
  }, [socket]);

  // Fetch initial data and wallet balance
  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        // Fetch positions
        const positionsResponse = await api.get('/kotak/positions');
        if (positionsResponse.data.success) {
          dispatch({ type: 'UPDATE_POSITIONS', payload: positionsResponse.data.data });
        }

        // Fetch orders
        const ordersResponse = await api.get('/kotak/orders');
        if (ordersResponse.data.success) {
          dispatch({ type: 'UPDATE_ORDERS', payload: ordersResponse.data.data });
        }

        // Fetch wallet balance
        const walletResponse = await api.get('/kotak/wallet');
        if (walletResponse.data.success) {
          dispatch({ type: 'UPDATE_WALLET', payload: walletResponse.data.data });
        }
      } catch (error) {
        console.error('Failed to fetch initial data:', error);
      }
    };

    fetchInitialData();
    
    // Refresh data every 10 seconds
    const interval = setInterval(fetchInitialData, 10000);
    
    return () => clearInterval(interval);
  }, [api]);

  return (
    <TradingContext.Provider value={{ state, dispatch }}>
      {children}
    </TradingContext.Provider>
  );
};