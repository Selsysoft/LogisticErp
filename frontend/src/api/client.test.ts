import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { session } from "../auth/session";
import { ApiError, apiGet, onSessionExpired } from "./client";

const store = new Map<string, string>();

beforeEach(() => {
  store.clear();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
    removeItem: (key: string) => store.delete(key),
  });
  session.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const tokens = { accessToken: "yeni-erisim", refreshToken: "yeni-yenileme", expiresInSeconds: 900 };

describe("apiGet", () => {
  it("başarılı yanıtın gövdesini döner", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ status: "ok" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(apiGet("/ping")).resolves.toEqual({ status: "ok" });
    expect(fetchMock.mock.calls[0][0]).toBe("/api/v1/ping");
  });

  it("standart hata gövdesini ApiError olarak fırlatır", async () => {
    const body = {
      code: "TENANT_NOT_FOUND",
      message: "Firma bulunamadı.",
      details: [],
      traceId: "t1",
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(body, { status: 404 })));

    const error = await apiGet("/ping").catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(404);
    expect((error as ApiError).body.code).toBe("TENANT_NOT_FOUND");
  });

  it("JSON olmayan hata yanıtını da ApiError'a çevirir", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("Bad Gateway", { status: 502 })));

    const error = await apiGet("/ping").catch((e: unknown) => e);

    expect((error as ApiError).body.code).toBe("HTTP_502");
  });
});

describe("oturum yenileme", () => {
  it("401 sonrası token yeniler ve isteği yeni token ile tekrarlar", async () => {
    session.setTokens("eski-erisim", "eski-yenileme");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(Response.json(tokens))
      .mockResolvedValueOnce(Response.json({ id: 1 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(apiGet("/identity/users")).resolves.toEqual({ id: 1 });

    expect(fetchMock.mock.calls[1][0]).toBe("/api/v1/auth/refresh");
    expect(fetchMock.mock.calls[2][1].headers.Authorization).toBe("Bearer yeni-erisim");
    expect(session.getRefreshToken()).toBe("yeni-yenileme");
  });

  it("aynı anda gelen 401'ler tek yenileme isteği yapar", async () => {
    session.setTokens("eski-erisim", "eski-yenileme");
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      if (url.endsWith("/auth/refresh")) {
        return Response.json(tokens);
      }
      const headers = init.headers as Record<string, string>;
      return headers.Authorization === "Bearer yeni-erisim"
        ? Response.json({ ok: true })
        : new Response(null, { status: 401 });
    });
    vi.stubGlobal("fetch", fetchMock);

    await Promise.all([apiGet("/a"), apiGet("/b"), apiGet("/c")]);

    const refreshCalls = fetchMock.mock.calls.filter(([url]) => url.endsWith("/auth/refresh"));
    expect(refreshCalls).toHaveLength(1);
  });

  it("kilidi bekleyen sekme, başka sekmenin yenilediği güncel token'ı kullanır", async () => {
    session.setTokens("eski-erisim", "eski-yenileme");
    vi.stubGlobal("navigator", {
      locks: {
        request: async (_name: string, task: () => Promise<unknown>) => {
          // Kilidi önce başka sekme aldı ve token'ı döndürdü.
          store.set("blackrose.refreshToken", "diger-sekmenin-tokeni");
          return task();
        },
      },
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(Response.json(tokens))
      .mockResolvedValueOnce(Response.json({ id: 1 }));
    vi.stubGlobal("fetch", fetchMock);

    await apiGet("/identity/users");

    expect(JSON.parse(fetchMock.mock.calls[1][1].body as string)).toEqual({
      refreshToken: "diger-sekmenin-tokeni",
    });
  });

  it("yenileme başarısızsa oturumu temizler ve haber verir", async () => {
    session.setTokens("eski-erisim", "eski-yenileme");
    const expired = vi.fn();
    onSessionExpired(expired);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async () => new Response(null, { status: 401 })),
    );

    await expect(apiGet("/identity/users")).rejects.toBeInstanceOf(ApiError);

    expect(expired).toHaveBeenCalledOnce();
    expect(session.getRefreshToken()).toBeNull();
  });

  it("bellekte token yoksa isteği göndermeden önce yeniler", async () => {
    store.set("blackrose.refreshToken", "kayitli-yenileme");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json(tokens))
      .mockResolvedValueOnce(Response.json({ id: 1 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(apiGet("/driver/trips")).resolves.toEqual({ id: 1 });

    expect(fetchMock.mock.calls[0][0]).toBe("/api/v1/auth/refresh");
    expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe("Bearer yeni-erisim");
  });

  it.each([
    ["ağ hatası", () => Promise.reject(new TypeError("Failed to fetch"))],
    ["sunucu hatası", () => Promise.resolve(new Response(null, { status: 502 }))],
  ])("%s oturumu silmez ve geçici hata verir", async (_name, respond) => {
    store.set("blackrose.refreshToken", "kayitli-yenileme");
    const expired = vi.fn();
    onSessionExpired(expired);
    const fetchMock = vi.fn().mockImplementation(respond);
    vi.stubGlobal("fetch", fetchMock);

    const error = await apiGet("/driver/trips").catch((e: unknown) => e);

    expect((error as ApiError).status).toBe(503);
    expect(expired).not.toHaveBeenCalled();
    expect(session.getRefreshToken()).toBe("kayitli-yenileme");
    // Token'sız istek hiç gönderilmemiştir.
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
