import { useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { useAuthStore } from "../store/authStore";

const socketUrl = import.meta.env.VITE_SOCKET_URL ?? "http://localhost:4000";

export const useSocket = () => {
  const token = useAuthStore((state) => state.token);
  const [socket, setSocket] = useState<Socket | null>(null);
  const tokenRef = useRef<string | null>(null);

  useEffect(() => {
    if (token === tokenRef.current) return;
    tokenRef.current = token;

    const nextSocket = io(socketUrl, {
      autoConnect: true,
      auth: { token: token ?? "" }
    });

    nextSocket.on("connect_error", (err) => {
      if (err.message === "AUTH_EXPIRED" || err.message === "Invalid token") {
        useAuthStore.getState().clearAuth();
        localStorage.removeItem("mlc_token");
      }
    });

    setSocket((prev) => {
      prev?.disconnect();
      return nextSocket;
    });

    return () => {
      nextSocket.disconnect();
    };
  }, [token]);

  return socket;
};
