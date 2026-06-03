import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';

let io: Server;

export function initSocket(httpServer: HttpServer): Server {
  io = new Server(httpServer, {
    cors: {
      origin: (process.env.ALLOWED_ORIGINS || 'http://localhost:5173')
        .split(',')
        .map((o) => o.trim()),
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  io.on('connection', (socket: Socket) => {
    console.log(`[Socket.io] Client connected: ${socket.id}`);

    // Clients join a room based on their role
    socket.on('join:room', (room: 'admin' | 'employees') => {
      socket.join(room);
      console.log(`[Socket.io] ${socket.id} joined room: ${room}`);
    });

    socket.on('disconnect', () => {
      console.log(`[Socket.io] Client disconnected: ${socket.id}`);
    });
  });

  return io;
}

/** Get the shared Socket.io instance (throws if not yet initialized) */
export function getIO(): Server {
  if (!io) {
    throw new Error('Socket.io not initialized. Call initSocket() first.');
  }
  return io;
}

/** Emit a new submission event to all admin clients */
export function emitNewSubmission(
  type: 'invoice' | 'expense',
  record: Record<string, unknown>
): void {
  getIO().to('admin').emit('submission:new', { type, record });
}

/** Notify the submitting employee that their record was approved */
export function emitApproved(
  submittedByUserId: string,
  type: 'invoice' | 'expense',
  recordId: string
): void {
  getIO().to(`user:${submittedByUserId}`).emit('submission:approved', { type, record_id: recordId });
}

/** Notify the submitting employee that their record was rejected */
export function emitRejected(
  submittedByUserId: string,
  type: 'invoice' | 'expense',
  recordId: string,
  reason: string
): void {
  getIO()
    .to(`user:${submittedByUserId}`)
    .emit('submission:rejected', { type, record_id: recordId, reason });
}

/** Broadcast cashbook update to all clients */
export function emitCashbookUpdated(entry: Record<string, unknown>): void {
  getIO().emit('cashbook:updated', { entry });
}
