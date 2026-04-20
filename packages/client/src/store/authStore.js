import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
export const useAuthStore = create()(persist((set) => ({
    user: null,
    token: null,
    isLoading: false,
    error: null,
    setAuth: (user, token) => set({
        user,
        token,
        isLoading: false,
        error: null
    }),
    clearAuth: () => set({
        user: null,
        token: null,
        isLoading: false,
        error: null
    }),
    setLoading: (isLoading) => set({ isLoading }),
    setError: (error) => set({ error })
}), {
    name: "mlc_token",
    storage: createJSONStorage(() => localStorage),
    partialize: (state) => ({ token: state.token })
}));
