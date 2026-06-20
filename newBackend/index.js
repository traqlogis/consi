// backend/server.js
import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import sequelize from './config/db.js';
import trackRoutes from './routes/track.js';
import adminRoutes from './routes/adminauth.js'
import { startPackageSimulator } from './routes/simulator.js';

const app = express();
const server = http.createServer(app);
const allowedOrigin = process.env.ACCESS_ORIGIN;

// Socket.IO configuration setup mapping perfectly to Vite's proxy path handler
const io = new Server(server, {
  path: '/socket.io/',
  cors: {
    origin: process.env.ACCESS_ORIGIN,
    methods: ["GET", "POST"],
    credentials: true
  }
});

startPackageSimulator(io);

app.use(cors({
  origin: allowedOrigin,
  credentials: true 
}));
app.use(express.json());

app.use((req, res, next) => {
  console.log(`Incoming Request: ${req.method} ${req.url}`);
  next();
});

// Routes
app.use('/', trackRoutes);
app.use('/api/admin', adminRoutes);
app.get("/api/ping", (req, res) => {
    console.log("Ping received");
  res.status(200).send("pong");
});

// Socket.IO Listening Channels
io.on('connection', (socket) => {
  console.log(`Client tracking stream connected: ${socket.id}`);

  socket.on('startTracking', (trackingCode) => {
    console.log(`Client subscribed to tracking updates for: ${trackingCode}`);
    socket.join(trackingCode); // Places client into a dedicated room for this package code
  });

  socket.on('stopTracking', (trackingCode) => {
    console.log(`Client unsubscribed from: ${trackingCode}`);
    socket.leave(trackingCode);
  });

  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
  });
});

// Sync Database tables, then initialize port listening
const PORT = process.env.PORT || 4000;
sequelize.sync({ alter: true }).then(() => {
  console.log('db linked and verified.');
  server.listen(PORT, () => {
    console.log(`Engine running smoothly on port ${PORT}`);
  });
}).catch(err => {
  console.error('Failed to connect to db:', err);
});