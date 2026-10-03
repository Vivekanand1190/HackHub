import { io, Socket } from 'socket.io-client';
import { API_BASE } from './api';

let socketInstance: Socket | null = null;

export const getSocket = (backendUrl: string = API_BASE): Socket => {
  if (!socketInstance) {
    socketInstance = io(backendUrl, {
      autoConnect: false,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      // Send the JWT on every (re)connect so the server can authenticate the
      // socket — identity is never trusted from the join-team payload.
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
