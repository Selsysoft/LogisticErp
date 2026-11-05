import { create } from "zustand";
import { apiGet, apiRequest, onSessionExpired, refreshSession, TokenResponse } from "../api/client";
import { session, tenantFromHost } from "./session";

export interface Me {
  id: string;
  email: string;
  fullName: string;
  tenant: string;
  permissions: string[];
  roles: string[];
  landingPath: string;
  twoFactorEnabled: boolean;
}

export interface LoginInput {
  tenantCode?: string;
  email: string;
  password: string;
  totpCode?: string;
}

interface AuthState {
  status: "loading" | "anonymous" | "authenticated";
  me: Me | null;
  bootstrap: () => Promise<void>;
  login: (input: LoginInput) => Promise<void>;
  logout: () => Promise<void>;
  reloadMe: () => Promise<void>;
}

const ME_KEY = "blackrose.me";

function cachedMe(): Me | null {
  try {
    const value = localStorage.getItem(ME_KEY);
    return value ? (JSON.parse(value) as Me) : null;
  } catch {
    return null;
  }
}

function rememberMe(me: Me | null) {
  try {
    if (me) {
      localStorage.setItem(ME_KEY, JSON.stringify(me));
    } else {
      localStorage.removeItem(ME_KEY);
    }
  } catch {
    // Saklanamazsa yalnız çevrimdışı açılış etkilenir.
  }
}

export const useAuthStore = create<AuthState>((set, get) => ({
  status: "loading",
  me: null,

  async bootstrap() {
    const refreshed = session.getRefreshToken() ? await refreshSession() : "rejected";
    if (refreshed === "rejected") {
      session.clear();
      rememberMe(null);
      set({ status: "anonymous", me: null });
      return;
    }
    if (refreshed === "unreachable") {
      // Çevrimdışı açılış: son bilinen kullanıcıyla devam edilir, token silinmez.
      const me = cachedMe();
      set(me ? { status: "authenticated", me } : { status: "anonymous", me: null });
      return;
    }
    try {
      await get().reloadMe();
    } catch {
      const me = cachedMe();
      set(me ? { status: "authenticated", me } : { status: "anonymous", me: null });
    }
  },

  async login({ tenantCode, email, password, totpCode }) {
    // Subdomain varsa firma oradan çözülür; form kodu yalnız tek domain kullanımında gönderilir.
    session.setTenantCode(tenantFromHost() ? null : (tenantCode?.trim().toLowerCase() ?? null));
    const tokens = await apiRequest<TokenResponse>("POST", "/auth/login", {
      email,
      password,
      totpCode: totpCode || undefined,
    });
    session.setTokens(tokens.accessToken, tokens.refreshToken);
    await get().reloadMe();
  },

  async logout() {
    const refreshToken = session.getRefreshToken();
    try {
      await apiRequest("POST", "/auth/logout", { refreshToken });
    } finally {
      session.clear();
      rememberMe(null);
      set({ status: "anonymous", me: null });
    }
  },

  async reloadMe() {
    const me = await apiGet<Me>("/auth/me");
    rememberMe(me);
    set({ status: "authenticated", me });
  },
}));

onSessionExpired(() => {
  rememberMe(null);
  useAuthStore.setState({ status: "anonymous", me: null });
});

export function hasPermission(me: Me | null, permission?: string) {
  return !permission || (me?.permissions.includes(permission) ?? false);
}
