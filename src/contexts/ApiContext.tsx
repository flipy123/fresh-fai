import React, { createContext, useContext, ReactNode } from 'react';
import axios from 'axios';

interface ApiContextType {
  api: typeof axios;
}

const ApiContext = createContext<ApiContextType | undefined>(undefined);

export const useApi = () => {
  const context = useContext(ApiContext);
  if (!context) {
    throw new Error('useApi must be used within an ApiProvider');
  }
  return context;
};

interface ApiProviderProps {
  children: ReactNode;
}

export const ApiProvider: React.FC<ApiProviderProps> = ({ children }) => {
  const api = axios.create({
    baseURL: 'http://localhost:3001/api',
    timeout: 10000,
  });

  // Request interceptor
  api.interceptors.request.use(
    (config) => {
      console.log('🔄 API Request:', config.method?.toUpperCase(), config.url);
      return config;
    },
    (error) => {
      console.error('❌ API Request Error:', error);
      return Promise.reject(error);
    }
  );

  // Response interceptor
  api.interceptors.response.use(
    (response) => {
      console.log('✅ API Response:', response.status, response.config.url);
      return response;
    },
    (error) => {
      console.error('❌ API Response Error:', error.response?.status, error.config?.url);
      return Promise.reject(error);
    }
  );

  return (
    <ApiContext.Provider value={{ api }}>
      {children}
    </ApiContext.Provider>
  );
};