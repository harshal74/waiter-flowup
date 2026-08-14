import React, { createContext, useContext, useEffect, useState } from 'react';
import socket, { connectSocket, disconnectSocket } from '../lib/socket';
import { useAuth } from './AuthContext';

interface SocketContextType {
  isConnected: boolean;
}

const SocketContext = createContext<SocketContextType>({ isConnected: false });

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  const [isConnected, setIsConnected] = useState(false);
  const [retryCount,  setRetryCount]  = useState(0);

  useEffect(() => {
    if (!isAuthenticated) {
      disconnectSocket();
      return;
    }

    connectSocket();

    const onConnect    = () => { setIsConnected(true);  setRetryCount(0); };
    const onDisconnect = () => setIsConnected(false);
    const onError      = () => setRetryCount(c => c + 1);

    socket.on('connect',       onConnect);
    socket.on('disconnect',    onDisconnect);
    socket.on('connect_error', onError);

    setIsConnected(socket.connected);

    return () => {
      socket.off('connect',       onConnect);
      socket.off('disconnect',    onDisconnect);
      socket.off('connect_error', onError);
      disconnectSocket();
    };
  }, [isAuthenticated]);

  return (
    <SocketContext.Provider value={{ isConnected }}>
      {children}
      {/* Show persistent error banner after 10 failed reconnects */}
      {retryCount >= 10 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-red-600 text-white rounded-xl text-sm font-medium shadow-xl">
          Connection lost — please refresh the page
        </div>
      )}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  return useContext(SocketContext);
}

export { socket };
