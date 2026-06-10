import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import session from 'express-session';
import path from 'path';
import fs from 'fs';
import { config } from './config';
import passportSetup from './passport';
import apiRouter from './routes/api';
import { registerSocketHandlers } from './sockets/socket.handler';

const app = express();
const server = http.createServer(app);

// CORS config
app.use(cors({
  origin: '*', // Allow frontend development servers to connect
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Session — only used during the Google OAuth handshake, NOT for app auth
app.use(session({
  secret: config.sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 5 * 60 * 1000 } // 5 min — just for the OAuth dance
}));

// Passport (must come after session)
app.use(passportSetup.initialize());
app.use(passportSetup.session());

// Serve uploads folder as static
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use('/uploads', express.static(uploadsDir));

// Mount main api router
app.use('/api', apiRouter);

// Initialize Socket.io Server
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

registerSocketHandlers(io);

// Start server
const PORT = parseInt(config.port, 10);
server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n=============================================`);
  console.log(`🚀 HackHub Backend is LIVE on port ${PORT}`);
  console.log(`🌐 API Endpoint: http://localhost:${PORT}/api`);
  console.log(`=============================================\n`);
});
