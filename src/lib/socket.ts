import { io, Socket } from 'socket.io-client';

// Derive restaurantId from the stored Staff JWT (trusted source)
function getRestaurantIdFromToken(): string {
  try {
    const token = localStorage.getItem('flowup_staff_token');
    if (!token) return '';
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.restaurantId || '';
  } catch {
    return '';
  }
}

// In dev: VITE_SOCKET_URL = http://localhost:5000
// In prod: set VITE_SOCKET_URL on Netlify to your backend URL
const SOCKET_URL =
  (import.meta.env.VITE_SOCKET_URL as string) || '';

const socket: Socket = io(SOCKET_URL, {
  autoConnect: false,
  reconnection: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 2000,
  query: { get restaurantId() { return getRestaurantIdFromToken(); } },
  auth: {
    get token() {
      return localStorage.getItem('flowup_staff_token') || '';
    },
  },
});

export function connectSocket(): void {
  if (!socket.connected) socket.connect();
}

export function disconnectSocket(): void {
  if (socket.connected) socket.disconnect();
}

export default socket;
