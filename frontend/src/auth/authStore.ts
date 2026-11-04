import { create } from "zustand";

/** Yer tutucu: gerçek giriş akışı Faz 1'de eklenecek. */
interface AuthState {
  isAuthenticated: boolean;
}

export const useAuthStore = create<AuthState>(() => ({ isAuthenticated: false }));
