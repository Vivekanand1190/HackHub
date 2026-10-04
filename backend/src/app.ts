import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import fs from 'fs';
import { config } from './config';
import { apiRouter } from './routes/api';
import { registerSocketHandlers } from './sockets/socket.handler';

const app = express();
const server = http.createServer(app);

// Behind a reverse proxy (Render/Railway/Fly), trust the first proxy hop so
// secure cookies and client IPs resolve correctly.
app.set('trust proxy', 1);

// Security headers
app.use(
  helmet({
    // Allow the frontend (a different origin) to embed uploaded files.
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

// CORS — restrict to known frontend origins instead of '*'
app.use(
  cors({
    origin: config.corsOrigins,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

app.use(express.json({ limit: '2mb' }));

// Serve uploads folder as static
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use('/uploads', express.static(uploadsDir));

// Rate limiting on the API surface (skip in test environment)
if (process.env.NODE_ENV !== 'test') {
  const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests — please slow down.' },
  });
  app.use('/api', apiLimiter);
}

// Mount main api router
app.use('/api', apiRouter);

// Initialize Socket.io Server
const io = new Server(server, {
  cors: {
    origin: config.corsOrigins,
    methods: ['GET', 'POST'],
  },
});

registerSocketHandlers(io);

export { app, server, io };
