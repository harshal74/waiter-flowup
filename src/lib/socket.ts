import { io, Socket } from 'socket.io-client';

export const RESTAURANT_ID =
  (import.meta.env.VITE_RESTAURANT_ID as string) || 'FLOWUP001';

// In dev: VITE_SOCKET_URL = http://localhost:5000
// In prod: VITE_SOCKET_URL = https://flowup-backend-1.onrender.com
const SOCKET_URL =
  (import.meta.env.VITE_SOCKET_URL as string) || 'https://flowup-backend-1.onrender.com';

const socket: Socket = io(SOCKET_URL, {
  autoConnect: false,
  reconnection: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 2000,
  query: { restaurantId: RESTAURANT_ID },
});

export function connectSocket(): void {
  if (!socket.connected) socket.connect();
}

export function disconnectSocket(): void {
  if (socket.connected) socket.disconnect();
}

export default socket;
