import { io, Socket } from 'socket.io-client';
import { getApiBase } from './api';

let socketInstance: Socket | null = null;

export const getSocket = (backendUrl?: string): Socket => {
  const url = backendUrl || getApiBase();
  if (!socketInstance) {
    socketInstance = io(url, {
      autoConnect: false,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      auth: (cb) =>
        cb({
          token: typeof window !== 'undefined' ? window.localStorage.getItem('hackhub_token') : null,
        }),
    });
  }
  return socketInstance;
};

export const disconnectSocket = () => {
  if (socketInstance) {
    socketInstance.disconnect();
    socketInstance = null;
  }
};
