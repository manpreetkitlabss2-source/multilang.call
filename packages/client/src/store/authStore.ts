import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { AuthUser } from "@multilang-call/shared";

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  error: string | null;
  setAuth: (user: AuthUser, token: string) => void;
  clearAuth: () => void;
  setLoading: (value: boolean) => void;
  setError: (message: string | null) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      isLoading: false,
      error: null,
      setAuth: (user, token) =>
        set({
          user,
          token,
          isLoading: false,
          error: null
        }),
      clearAuth: () =>
        set({
          user: null,
          token: null,
          isLoading: false,
          error: null
        }),
      setLoading: (isLoading) => set({ isLoading }),
      setError: (error) => set({ error })
    }),
    {
      name: "mlc_token",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ token: state.token })
    }
  )
);
