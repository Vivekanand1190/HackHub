import { io, Socket } from 'socket.io-client';

let socketInstance: Socket | null = null;

export const getSocket = (backendUrl = 'http://localhost:8888'): Socket => {
  if (!socketInstance) {
    socketInstance = io(backendUrl, {
      autoConnect: false,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000
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
