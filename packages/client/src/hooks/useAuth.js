import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { apiUrl, createAuthHeaders } from "../lib/api";
import { useAuthStore } from "../store/authStore";
const syncAuthStorage = (user, token) => {
    localStorage.setItem("auth_user", JSON.stringify(user));
    localStorage.setItem("auth_token", token);
};
const clearAuthStorage = () => {
    localStorage.removeItem("auth_user");
    localStorage.removeItem("auth_token");
};
export const useAuth = () => {
    const navigate = useNavigate();
    const user = useAuthStore((state) => state.user);
    const token = useAuthStore((state) => state.token);
    const isLoading = useAuthStore((state) => state.isLoading);
    const error = useAuthStore((state) => state.error);
    const setAuth = useAuthStore((state) => state.setAuth);
    const clearAuth = useAuthStore((state) => state.clearAuth);
    const setLoading = useAuthStore((state) => state.setLoading);
    const setError = useAuthStore((state) => state.setError);
    useEffect(() => {
        if (!token || user || isLoading) {
            return;
        }
        setLoading(true);
        fetch(`${apiUrl}/auth/me`, {
            headers: {
                ...createAuthHeaders(token)
            }
        })
            .then(async (response) => {
            if (!response.ok) {
                throw new Error("Unauthorized");
            }
            return (await response.json());
        })
            .then((validatedUser) => {
            setAuth(validatedUser, token);
            syncAuthStorage(validatedUser, token);
        })
            .catch(() => {
            clearAuth();
            localStorage.removeItem("mlc_token");
            clearAuthStorage();
        })
            .finally(() => {
            setLoading(false);
        });
    }, [clearAuth, isLoading, setAuth, setLoading, token, user]);
    const login = async (email, password) => {
        setLoading(true);
        setError(null);
        try {
            const response = await fetch(`${apiUrl}/auth/login`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ email, password })
            });
            const data = (await response.json());
            if (!response.ok || !("user" in data) || !("token" in data)) {
                throw new Error("error" in data ? data.error : "Unable to sign in");
            }
            setAuth(data.user, data.token);
            syncAuthStorage(data.user, data.token);
            return data;
        }
        catch (caughtError) {
            const message = caughtError instanceof Error ? caughtError.message : "Unable to sign in";
            setError(message);
            throw caughtError;
        }
        finally {
            setLoading(false);
        }
    };
    const register = async (email, displayName, password, role) => {
        setLoading(true);
        setError(null);
        try {
            const response = await fetch(`${apiUrl}/auth/register`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ email, displayName, password, role })
            });
            const data = (await response.json());
            if (!response.ok || !("user" in data) || !("token" in data)) {
                throw new Error("error" in data ? data.error : "Unable to create account");
            }
            setAuth(data.user, data.token);
            syncAuthStorage(data.user, data.token);
            return data;
        }
        catch (caughtError) {
            const message = caughtError instanceof Error ? caughtError.message : "Unable to create account";
            setError(message);
            throw caughtError;
        }
        finally {
            setLoading(false);
        }
    };
    const logout = () => {
        clearAuth();
        localStorage.removeItem("mlc_token");
        clearAuthStorage();
        navigate("/");
    };
    return {
        user,
        token,
        isLoading,
        error,
        login,
        register,
        logout
    };
};
