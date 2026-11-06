/**
 * Erişim token'ı yalnız bellekte tutulur. Yenileme token'ı sunucunun koyduğu HttpOnly çerezdedir;
 * JavaScript okuyamaz, bu yüzden XSS ile çalınamaz. localStorage'da yalnız "oturum var" işareti ve
 * firma kodu durur; işaret, sayfa yenilemesinde yenileme denenip denenmeyeceğini belirler.
 */
const SESSION_KEY = "blackrose.session";
const TENANT_KEY = "blackrose.tenantCode";
/** Eski sürümlerin yerel depoya yazdığı yenileme token'ı; görülürse silinir. */
const LEGACY_REFRESH_KEY = "blackrose.refreshToken";

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

/** Eski sürümden kalan token çerezle değiştirilemez; kullanıcı bir kez yeniden giriş yapar. */
if (read(LEGACY_REFRESH_KEY) !== null) {
  write(LEGACY_REFRESH_KEY, null);
}

export const session = {
  getAccessToken: () => accessToken,
  hasSession: () => read(SESSION_KEY) !== null,
  getTenantCode: () => read(TENANT_KEY),
  setTenantCode: (code: string | null) => write(TENANT_KEY, code),
  setAccessToken(access: string) {
    accessToken = access;
    write(SESSION_KEY, "1");
  },
  clear() {
    accessToken = null;
    write(SESSION_KEY, null);
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
