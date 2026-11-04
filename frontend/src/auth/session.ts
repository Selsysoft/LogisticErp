/**
 * Erişim token'ı yalnız bellekte tutulur. Yenileme token'ı ve firma kodu, sayfa yenilemesinde oturum
 * korunsun diye localStorage'dadır; depolama kullanılamıyorsa oturum sayfa ömrüyle sınırlı kalır.
 */
const REFRESH_KEY = "blackrose.refreshToken";
const TENANT_KEY = "blackrose.tenantCode";

let accessToken: string | null = null;

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null) {
  try {
    if (value === null) {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, value);
    }
  } catch {
    // Depolama kapalıysa oturum yalnız bellekte sürer.
  }
}

export const session = {
  getAccessToken: () => accessToken,
  getRefreshToken: () => read(REFRESH_KEY),
  getTenantCode: () => read(TENANT_KEY),
  setTenantCode: (code: string | null) => write(TENANT_KEY, code),
  setTokens(access: string, refresh: string) {
    accessToken = access;
    write(REFRESH_KEY, refresh);
  },
  clear() {
    accessToken = null;
    write(REFRESH_KEY, null);
  },
};

/** Tarayıcı firma subdomain'inde açıldıysa firma kodunu döner. */
export function tenantFromHost(
  hostname = window.location.hostname,
  baseDomain: string = import.meta.env.VITE_BASE_DOMAIN ?? "localhost",
): string | null {
  const suffix = `.${baseDomain}`;
  if (!hostname.endsWith(suffix)) {
    return null;
  }
  const label = hostname.slice(0, -suffix.length);
  return label && !label.includes(".") ? label : null;
}
