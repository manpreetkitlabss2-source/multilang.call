import { useEffect, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { useAuthStore } from "../store/authStore";

const socketUrl = import.meta.env.VITE_SOCKET_URL ?? "http://localhost:4000";

export const useSocket = () => {
  const token = useAuthStore((state) => state.token);
  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    const nextSocket = io(socketUrl, {
      autoConnect: true,
      auth: {
        token: token ?? ""
      }
    });
    setSocket(nextSocket);

    return () => {
      nextSocket.disconnect();
    };
  }, [token]);

  return socket;
};
