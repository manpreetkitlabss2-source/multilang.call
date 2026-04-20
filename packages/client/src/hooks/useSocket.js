import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { useAuthStore } from "../store/authStore";
const socketUrl = import.meta.env.VITE_SOCKET_URL ?? "http://localhost:4000";
const MAX_RETRIES = 5;
const RETRY_DELAY = 1000; // 1 second
export const useSocket = () => {
    const token = useAuthStore((state) => state.token);
    const [socket, setSocket] = useState(null);
    const [retryCount, setRetryCount] = useState(0);
    const tokenRef = useRef(null);
    const retryTimeoutRef = useRef(null);
    useEffect(() => {
        // Reset retry count if token has changed
        if (token !== tokenRef.current) {
            setRetryCount(0);
            tokenRef.current = token;
        }
        // If token is null, disconnect and skip
        if (!token) {
            setSocket((prev) => {
                prev?.disconnect();
                return null;
            });
            return;
        }
        // Skip if already at max retries
        if (retryCount >= MAX_RETRIES) {
            console.warn("Max retries reached, not attempting connection");
            return;
        }
        const nextSocket = io(socketUrl, {
            autoConnect: true,
            auth: { token },
            reconnection: true,
            reconnectionAttempts: 5,
            reconnectionDelay: 1000,
        });
        nextSocket.on("connect", () => {
            console.log("✅ CONNECTED:", nextSocket.id);
            setRetryCount(0); // Reset on success
        });
        nextSocket.on("disconnect", (reason) => {
            console.log("⚠️ DISCONNECTED:", reason);
        });
        nextSocket.onAny((event, ...args) => {
            console.log("📩 EVENT:", event, args);
        });
        nextSocket.on("connect_error", (err) => {
            console.log("❌ CONNECT ERROR:", err.message, err);
            if (err.message === "AUTH_EXPIRED" || err.message === "Invalid token") {
                useAuthStore.getState().clearAuth();
                localStorage.removeItem("mlc_token");
                return;
            }
            // Retry if under max attempts
            if (retryCount < MAX_RETRIES) {
                console.log(`Retrying connection in ${RETRY_DELAY}ms (attempt ${retryCount + 1}/${MAX_RETRIES})`);
                retryTimeoutRef.current = setTimeout(() => {
                    setRetryCount((prev) => prev + 1);
                }, RETRY_DELAY);
            }
        });
        setSocket((prev) => {
            prev?.disconnect();
            return nextSocket;
        });
        return () => {
            nextSocket.disconnect();
            if (retryTimeoutRef.current) {
                clearTimeout(retryTimeoutRef.current);
            }
        };
    }, [token, retryCount]); // Added retryCount to dependencies
    return socket;
};
