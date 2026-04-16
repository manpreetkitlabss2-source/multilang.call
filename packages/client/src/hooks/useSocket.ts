import { useEffect, useState } from "react";
import { io, type Socket } from "socket.io-client";

const socketUrl = import.meta.env.VITE_SOCKET_URL ?? "http://localhost:4000";

export const useSocket = () => {
  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    const nextSocket = io(socketUrl, {
      autoConnect: true
    });
    setSocket(nextSocket);

    return () => {
      nextSocket.disconnect();
    };
  }, []);

  return socket;
};
