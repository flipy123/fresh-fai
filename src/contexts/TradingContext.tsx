import React, { createContext, useContext, useReducer, ReactNode } from 'react';

interface TradingState {
  selectedIndex: string;
  isTrading: boolean;
  isTestMode: boolean;
  gptProvider: 'openai' | 'openrouter';
  gptInterval: number;
  positions: any[];
  orders: any[];
  pnl: number;
  wallet: number;
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
  wallet: 100000,
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

  return (
    <TradingContext.Provider value={{ state, dispatch }}>
      {children}
    </TradingContext.Provider>
  );
};