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

    // Listen to data updates (positions, orders, wallet)
    this.kotakService.on('data_update', (data) => {
      this.broadcastDataUpdate(data);
    });

    // Listen to order updates
    this.kotakService.on('order_update', (data) => {
      this.broadcastOrderUpdate(data);
    });

    // Listen to authentication events
    this.kotakService.on('login_success', (data) => {
      this.broadcastSystemUpdate({ type: 'login_success', data });
    });

    this.kotakService.on('otp_required', (data) => {
      this.broadcastSystemUpdate({ type: 'otp_required', data });
    });

    this.kotakService.on('otp_regenerated', (data) => {
      this.broadcastSystemUpdate({ type: 'otp_regenerated', data });
    });

    this.kotakService.on('websocket_connected', () => {
      this.broadcastSystemUpdate({ type: 'websocket_connected', data: { message: 'WebSocket connected' } });
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

  broadcastDataUpdate(data) {
    // Broadcast positions, orders, and wallet updates
    this.io.emit('data_update', data);
  }

  broadcastOrderUpdate(data) {
    // Broadcast order updates
    this.io.emit('order_update', data);
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