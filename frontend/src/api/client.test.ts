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

// Yenileme token'ı gövdede gelmez; tarayıcı HttpOnly çerezi kendisi saklar ve gönderir.
const tokens = { accessToken: "yeni-erisim", refreshToken: null, expiresInSeconds: 900 };

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
    session.setAccessToken("eski-erisim");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(Response.json(tokens))
      .mockResolvedValueOnce(Response.json({ id: 1 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(apiGet("/identity/users")).resolves.toEqual({ id: 1 });

    expect(fetchMock.mock.calls[1][0]).toBe("/api/v1/auth/refresh");
    expect(fetchMock.mock.calls[2][1].headers.Authorization).toBe("Bearer yeni-erisim");
    expect(session.hasSession()).toBe(true);
  });

  it("aynı anda gelen 401'ler tek yenileme isteği yapar", async () => {
    session.setAccessToken("eski-erisim");
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

  it("yenileme kilit içinde, gövdesiz ve erişim token'ı olmadan gönderilir", async () => {
    session.setAccessToken("eski-erisim");
    const locked = vi.fn(async (_name: string, task: () => Promise<unknown>) => task());
    vi.stubGlobal("navigator", { locks: { request: locked } });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(Response.json(tokens))
      .mockResolvedValueOnce(Response.json({ id: 1 }));
    vi.stubGlobal("fetch", fetchMock);

    await apiGet("/identity/users");

    expect(locked).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[1][1].body).toBeUndefined();
    expect(fetchMock.mock.calls[1][1].headers.Authorization).toBeUndefined();
  });

  it("yenileme başarısızsa oturumu temizler ve haber verir", async () => {
    session.setAccessToken("eski-erisim");
    const expired = vi.fn();
    onSessionExpired(expired);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async () => new Response(null, { status: 401 })),
    );

    await expect(apiGet("/identity/users")).rejects.toBeInstanceOf(ApiError);

    expect(expired).toHaveBeenCalledOnce();
    expect(session.hasSession()).toBe(false);
  });

  it("bellekte token yoksa isteği göndermeden önce yeniler", async () => {
    store.set("blackrose.session", "1");
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
    ["istek sınırı", () => Promise.resolve(new Response(null, { status: 429 }))],
  ])("%s oturumu silmez ve geçici hata verir", async (_name, respond) => {
    store.set("blackrose.session", "1");
    const expired = vi.fn();
    onSessionExpired(expired);
    const fetchMock = vi.fn().mockImplementation(respond);
    vi.stubGlobal("fetch", fetchMock);

    const error = await apiGet("/driver/trips").catch((e: unknown) => e);

    expect((error as ApiError).status).toBe(503);
    expect(expired).not.toHaveBeenCalled();
    expect(session.hasSession()).toBe(true);
    // Token'sız istek hiç gönderilmemiştir.
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
