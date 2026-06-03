import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User } from '@mct/shared';

interface AuthState {
  user: Omit<User, 'created_at' | 'updated_at'> | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  login: (user: Omit<User, 'created_at' | 'updated_at'>, accessToken: string, refreshToken: string) => void;
  logout: () => void;
  setAccessToken: (token: string) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,

      login: (user, accessToken, refreshToken) =>
        set({ user, accessToken, refreshToken, isAuthenticated: true }),

      logout: () =>
        set({ user: null, accessToken: null, refreshToken: null, isAuthenticated: false }),

      setAccessToken: (token) => set({ accessToken: token }),
    }),
    {
      name: 'mct-auth',
      partialize: (state) => ({
        user: state.user,
        refreshToken: state.refreshToken,
        isAuthenticated: state.isAuthenticated,
        // Do NOT persist accessToken — always refresh from server
      }),
    }
  )
);
