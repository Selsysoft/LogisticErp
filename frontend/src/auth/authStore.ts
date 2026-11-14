import { create } from "zustand";
import { apiGet, apiRequest, onSessionExpired, refreshSession, TokenResponse } from "../api/client";
import { queryClient } from "../api/queryClient";
import type { MeCompany } from "../pages/organization/types";
import { useCompanyStore } from "./companyStore";
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
  // 12.1a (§5.3): önbellekteki eski "blackrose.me" kaydında bulunmayabilir, bu yüzden isteğe bağlı.
  branchScope?: "ALL" | "LIMITED";
  /** ALL kapsamda null. */
  allowedBranchIds?: string[] | null;
  defaultBranchId?: string | null;
  /** Görünür şirketler; pasifler active=false ile, sıra: varsayılan, sonra shortName. */
  companies?: MeCompany[];
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

/** Oturum açık: aktif şirket seçimi kullanıcının saklı tercihine göre kurulur (12.1a §6.3). */
function signedIn(me: Me) {
  useCompanyStore.getState().hydrate(me);
  return { status: "authenticated" as const, me };
}

/**
 * Oturum kapandı: aktif şirket bellekten, sorgu önbelleği tümüyle silinir; önceki kullanıcının
 * listeleri ve iş yeri ağacı aynı sekmede açılan yeni oturuma taşınmaz (12.1a §6.13).
 */
function signedOut() {
  rememberMe(null);
  useCompanyStore.getState().clear();
  queryClient.clear();
  return { status: "anonymous" as const, me: null };
}

export const useAuthStore = create<AuthState>((set, get) => ({
  status: "loading",
  me: null,

  async bootstrap() {
    const refreshed = session.hasSession() ? await refreshSession() : "rejected";
    if (refreshed === "rejected") {
      session.clear();
      set(signedOut());
      return;
    }
    if (refreshed === "unreachable") {
      // Çevrimdışı açılış: son bilinen kullanıcıyla devam edilir, token silinmez.
      const me = cachedMe();
      set(me ? signedIn(me) : { status: "anonymous", me: null });
      return;
    }
    try {
      await get().reloadMe();
    } catch {
      const me = cachedMe();
      set(me ? signedIn(me) : { status: "anonymous", me: null });
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
    session.setAccessToken(tokens.accessToken);
    await get().reloadMe();
  },

  async logout() {
    try {
      // Yenileme token'ı çerezle gider; sunucu iptal edip çerezi siler.
      await apiRequest("POST", "/auth/logout");
    } finally {
      session.clear();
      set(signedOut());
    }
  },

  async reloadMe() {
    const me = await apiGet<Me>("/auth/me");
    rememberMe(me);
    set(signedIn(me));
  },
}));

onSessionExpired(() => {
  useAuthStore.setState(signedOut());
});

export function hasPermission(me: Me | null, permission?: string) {
  return !permission || (me?.permissions.includes(permission) ?? false);
}
