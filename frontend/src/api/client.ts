import { session } from "../auth/session";

export interface ApiErrorBody {
  code: string;
  message: string;
  details: string[];
  traceId: string | null;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: ApiErrorBody,
  ) {
    super(body.message);
    this.name = "ApiError";
  }
}

export interface TokenResponse {
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
}

type Method = "GET" | "POST" | "PUT" | "DELETE";

const AUTH_PREFIX = "/auth/";
const PUBLIC_AUTH_PATHS = ["/auth/login", "/auth/refresh", "/auth/password-reset/"];

let sessionExpiredListener: () => void = () => {};
let refreshInFlight: Promise<boolean> | null = null;

export function onSessionExpired(listener: () => void) {
  sessionExpiredListener = listener;
}

function isPublic(path: string) {
  return PUBLIC_AUTH_PATHS.some((prefix) => path.startsWith(prefix));
}

async function send(
  method: Method,
  path: string,
  body?: unknown,
  extraHeaders?: Record<string, string>,
): Promise<Response> {
  const headers: Record<string, string> = { Accept: "application/json", ...extraHeaders };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  const token = session.getAccessToken();
  if (token && !isPublic(path)) {
    headers.Authorization = `Bearer ${token}`;
  }
  const tenantCode = session.getTenantCode();
  if (tenantCode && path.startsWith(AUTH_PREFIX)) {
    headers["X-Tenant-Code"] = tenantCode;
  }
  return fetch(`/api/v1${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/** Aynı anda gelen 401'ler tek yenileme isteğini paylaşır; aksi halde token yeniden kullanılmış sayılır. */
export function refreshSession(): Promise<boolean> {
  refreshInFlight ??= (async () => {
    const refreshToken = session.getRefreshToken();
    if (!refreshToken) {
      return false;
    }
    try {
      const response = await send("POST", "/auth/refresh", { refreshToken });
      if (!response.ok) {
        return false;
      }
      const tokens = (await response.json()) as TokenResponse;
      session.setTokens(tokens.accessToken, tokens.refreshToken);
      return true;
    } catch {
      return false;
    }
  })().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

export async function apiRequest<T>(
  method: Method,
  path: string,
  body?: unknown,
  headers?: Record<string, string>,
): Promise<T> {
  let response = await send(method, path, body, headers);
  if (response.status === 401 && !isPublic(path) && session.getRefreshToken()) {
    if (await refreshSession()) {
      response = await send(method, path, body, headers);
    } else {
      session.clear();
      sessionExpiredListener();
    }
  }
  if (!response.ok) {
    throw new ApiError(response.status, await readErrorBody(response));
  }
  if (response.status === 204 || response.status === 202) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

export const apiGet = <T>(path: string) => apiRequest<T>("GET", path);

async function readErrorBody(response: Response): Promise<ApiErrorBody> {
  try {
    return (await response.json()) as ApiErrorBody;
  } catch {
    return {
      code: `HTTP_${response.status}`,
      message: response.statusText || `HTTP ${response.status}`,
      details: [],
      traceId: response.headers.get("X-Trace-Id"),
    };
  }
}
