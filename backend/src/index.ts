import 'dotenv/config';
import http from 'http';
import app from './app';
import { initSocket } from './socket';

const PORT = parseInt(process.env.PORT || '3001', 10);

const httpServer = http.createServer(app);
initSocket(httpServer);

httpServer.listen(PORT, () => {
  console.log(`\n🚀 MCT BMS Backend running on http://localhost:${PORT}`);
  console.log(`📡 Socket.io gateway active`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}\n`);
});

export default httpServer;
