import { create } from "zustand";
import { ApiError, readErrorBody } from "../../api/client";

interface AdminSession {
  token: string | null;
  setToken: (token: string | null) => void;
}

/** Yönetici token'ı yalnız bellekte tutulur: sayfa yenilenince yeniden giriş gerekir. */
export const useAdminSession = create<AdminSession>((set) => ({
  token: null,
  setToken: (token) => set({ token }),
}));

async function send(method: string, path: string, body?: unknown) {
  const { token, setToken } = useAdminSession.getState();
  const headers: Record<string, string> = { Accept: "application/json" };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const response = await fetch(`/api/v1/admin${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (response.status === 401 && token) {
    setToken(null);
  }
  if (!response.ok) {
    throw new ApiError(response.status, await readErrorBody(response));
  }
  return response;
}

export async function adminRequest<T>(method: string, path: string, body?: unknown): Promise<T> {
  const response = await send(method, path, body);
  return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
}

export const adminGet = <T>(path: string) => adminRequest<T>("GET", path);

export async function adminDownload(path: string, fileName: string) {
  const response = await send("GET", path);
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}
