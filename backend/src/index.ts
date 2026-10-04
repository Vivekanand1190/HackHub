import { config } from './config';
import { server } from './app';

const PORT = parseInt(config.port, 10);
server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n=============================================`);
  console.log(`🚀 HackHub Backend is LIVE on port ${PORT}`);
  console.log(`🌐 API Endpoint: http://localhost:${PORT}/api`);
  console.log(`🔒 Allowed origins: ${config.corsOrigins.join(', ')}`);
  console.log(`=============================================\n`);
});
