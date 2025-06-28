import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { io, Socket } from 'socket.io-client';

interface SocketContextType {
  socket: Socket | null;
  connected: boolean;
  marketData: any;
}

const SocketContext = createContext<SocketContextType | undefined>(undefined);

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
};

interface SocketProviderProps {
  children: ReactNode;
}

export const SocketProvider: React.FC<SocketProviderProps> = ({ children }) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [marketData, setMarketData] = useState<any>(null);

  useEffect(() => {
    const newSocket = io('http://localhost:3001');
    
    newSocket.on('connect', () => {
      console.log('✅ Socket connected');
      setConnected(true);
    });

    newSocket.on('disconnect', () => {
      console.log('⚠️ Socket disconnected');
      setConnected(false);
    });

    newSocket.on('market_data', (data) => {
      setMarketData(data);
    });

    newSocket.on('system_update', (data) => {
      console.log('📢 System update:', data);
    });

    setSocket(newSocket);

    return () => {
      newSocket.close();
    };
  }, []);

  return (
    <SocketContext.Provider value={{ socket, connected, marketData }}>
      {children}
    </SocketContext.Provider>
  );
};