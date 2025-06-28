import React, { useState, useRef, useEffect } from 'react';
import { Send, MessageCircle } from 'lucide-react';
import { useApi } from '../contexts/ApiContext';
import { useTrading } from '../contexts/TradingContext';

interface ChatMessage {
  id: string;
  type: 'user' | 'fai';
  content: string;
  timestamp: Date;
}

export const ChatPanel: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: '1',
      type: 'fai',
      content: 'Hey! I\'m FAi-3.0, your trading assistant. Ask me anything about the market or trading decisions!',
      timestamp: new Date()
    }
  ]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { api } = useApi();
  const { state } = useTrading();

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async () => {
    if (!inputMessage.trim() || isLoading) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      type: 'user',
      content: inputMessage,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputMessage('');
    setIsLoading(true);

    try {
      const response = await api.post('/gpt/chat', {
        message: inputMessage,
        context: {
          selectedIndex: state.selectedIndex,
          isTrading: state.isTrading,
          isTestMode: state.isTestMode,
          positions: state.positions,
          orders: state.orders,
          pnl: state.pnl
        },
        provider: state.gptProvider
      });

      const faiMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        type: 'fai',
        content: response.data.data.message,
        timestamp: new Date()
      };

      setMessages(prev => [...prev, faiMessage]);
    } catch (error) {
      console.error('Chat error:', error);
      const errorMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        type: 'fai',
        content: 'Sorry, I encountered an error. Please try again.',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="w-96 bg-gray-800 border-l border-gray-700 flex flex-col">
      <div className="p-4 border-b border-gray-700">
        <div className="flex items-center space-x-2">
          <MessageCircle className="w-5 h-5 text-blue-400" />
          <h3 className="text-lg font-semibold text-white">Ask FAi</h3>
          <span className="text-xs bg-blue-600 text-white px-2 py-1 rounded">
            {state.gptProvider.toUpperCase()}
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message) => (
          <div key={message.id} className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] p-3 rounded-lg ${
              message.type === 'user'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-700 text-gray-100'
            }`}>
              <p className="text-sm whitespace-pre-wrap">{message.content}</p>
              <p className="text-xs mt-1 opacity-70">
                {message.timestamp.toLocaleTimeString()}
              </p>
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-gray-700 text-gray-100 p-3 rounded-lg">
              <div className="flex space-x-1">
                <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce"></div>
                <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 border-t border-gray-700">
        <div className="flex space-x-2">
          <textarea
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Ask FAi about trading decisions..."
            className="flex-1 bg-gray-700 text-white px-3 py-2 rounded border border-gray-600 focus:border-blue-400 focus:outline-none resize-none"
            rows={2}
            disabled={isLoading}
          />
          <button
            onClick={handleSendMessage}
            disabled={!inputMessage.trim() || isLoading}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white rounded transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};