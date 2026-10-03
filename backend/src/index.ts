import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import session from 'express-session';
import path from 'path';
import fs from 'fs';
import { config } from './config';
import passportSetup from './passport';
import apiRouter from './routes/api';
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

// Session — only used during the Google OAuth handshake, NOT for app auth
app.use(
  session({
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: { secure: config.nodeEnv === 'production', maxAge: 5 * 60 * 1000 },
  })
);

// Passport (must come after session)
app.use(passportSetup.initialize());
app.use(passportSetup.session());

// Serve uploads folder as static
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use('/uploads', express.static(uploadsDir));

// Rate limiting on the API surface
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests — please slow down.' },
});
app.use('/api', apiLimiter);

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

// Start server
const PORT = parseInt(config.port, 10);
server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n=============================================`);
  console.log(`🚀 HackHub Backend is LIVE on port ${PORT}`);
  console.log(`🌐 API Endpoint: http://localhost:${PORT}/api`);
  console.log(`🔒 Allowed origins: ${config.corsOrigins.join(', ')}`);
  console.log(`=============================================\n`);
});
