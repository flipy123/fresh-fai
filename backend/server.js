import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import dotenv from 'dotenv';
import { kotakNeoRouter } from './routes/kotakNeoRoutes.js';
import { gptRouter } from './routes/gptRoutes.js';
import { KotakNeoService } from './services/KotakNeoService.js';
import { WebSocketManager } from './services/WebSocketManager.js';

dotenv.config();

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: "http://localhost:5173",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Initialize services
const kotakService = new KotakNeoService();
const wsManager = new WebSocketManager(io, kotakService);

// Make services available to routes
app.use((req, res, next) => {
  req.kotakService = kotakService;
  req.wsManager = wsManager;
  next();
});

// Routes
app.use('/api/kotak', kotakNeoRouter);
app.use('/api/gpt', gptRouter);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    kotak_status: kotakService.isAuthenticated() ? 'connected' : 'disconnected'
  });
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });

  socket.on('subscribe_data', (data) => {
    wsManager.subscribeToData(socket, data);
  });

  socket.on('unsubscribe_data', (data) => {
    wsManager.unsubscribeFromData(socket, data);
  });
});

// Start server
server.listen(PORT, () => {
  console.log(`🚀 FAi-3.0 Server running on port ${PORT}`);
  console.log(`📊 Dashboard: http://localhost:5173`);
});

// Initialize Kotak Neo Service
kotakService.initialize().catch(console.error);