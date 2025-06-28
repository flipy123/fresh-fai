import { EventEmitter } from 'events';

export class WebSocketManager extends EventEmitter {
  constructor(io, kotakService) {
    super();
    this.io = io;
    this.kotakService = kotakService;
    this.clientSubscriptions = new Map();
    
    // Listen to Kotak Neo market data
    this.kotakService.on('market_data', (data) => {
      this.broadcastMarketData(data);
    });
  }

  subscribeToData(socket, data) {
    const { tokens, dataType } = data;
    
    if (!this.clientSubscriptions.has(socket.id)) {
      this.clientSubscriptions.set(socket.id, new Set());
    }
    
    const clientTokens = this.clientSubscriptions.get(socket.id);
    tokens.forEach(token => clientTokens.add(token));
    
    // Subscribe to Kotak Neo WebSocket
    this.kotakService.subscribeToTokens(tokens);
    
    console.log(`📡 Client ${socket.id} subscribed to ${tokens.length} tokens`);
  }

  unsubscribeFromData(socket, data) {
    const { tokens } = data;
    
    if (this.clientSubscriptions.has(socket.id)) {
      const clientTokens = this.clientSubscriptions.get(socket.id);
      tokens.forEach(token => clientTokens.delete(token));
    }
    
    console.log(`📡 Client ${socket.id} unsubscribed from ${tokens.length} tokens`);
  }

  broadcastMarketData(marketData) {
    // Broadcast to all connected clients
    this.io.emit('market_data', marketData);
  }

  broadcastToRoom(room, event, data) {
    this.io.to(room).emit(event, data);
  }

  broadcastSystemUpdate(data) {
    this.io.emit('system_update', data);
  }

  disconnect(socket) {
    this.clientSubscriptions.delete(socket.id);
    console.log(`🔌 Client ${socket.id} disconnected and cleaned up`);
  }
}