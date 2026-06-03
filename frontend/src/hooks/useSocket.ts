import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '../stores/authStore';
import { toast } from '../stores/toastStore';
import { useQueryClient } from '@tanstack/react-query';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

let socket: Socket | null = null;

export function useSocket() {
  const { user, isAuthenticated } = useAuthStore();
  const queryClient = useQueryClient();
  const connected = useRef(false);

  useEffect(() => {
    if (!isAuthenticated || connected.current) return;

    socket = io(API_URL, {
      transports: ['websocket'],
      autoConnect: true,
    });

    socket.on('connect', () => {
      connected.current = true;
      // Join role-based room
      const room = user?.role === 'admin' ? 'admin' : 'employees';
      socket!.emit('join:room', room);
      // Also join personal user room for approval notifications
      socket!.emit('join:room', `user:${user?.id}`);
    });

    socket.on('disconnect', () => {
      connected.current = false;
    });

    // ─── Real-time event handlers ────────────────────────────────

    socket.on('submission:new', ({ type }: { type: string }) => {
      // Admin: refresh approval queue
      queryClient.invalidateQueries({ queryKey: ['approvals'] });
      toast.info(`New ${type} submission awaiting approval`);
    });

    socket.on('submission:approved', ({ type }: { type: string }) => {
      queryClient.invalidateQueries({ queryKey: [type + 's'] });
      toast.success(`Your ${type} was approved!`);
    });

    socket.on('submission:rejected', ({ type, reason }: { type: string; reason: string }) => {
      queryClient.invalidateQueries({ queryKey: [type + 's'] });
      toast.error(`Your ${type} was rejected: ${reason}`);
    });

    socket.on('cashbook:updated', () => {
      queryClient.invalidateQueries({ queryKey: ['cashbook'] });
    });

    return () => {
      socket?.disconnect();
      socket = null;
      connected.current = false;
    };
  }, [isAuthenticated, user?.id, user?.role, queryClient]);

  return { isConnected: connected.current };
}

export function getSocket(): Socket | null {
  return socket;
}
