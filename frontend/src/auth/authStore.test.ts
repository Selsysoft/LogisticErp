// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiGet, apiRequest, onSessionExpired, refreshSession } from "../api/client";
import { hasPermission, Me, useAuthStore } from "./authStore";
import { session } from "./session";

vi.mock("../api/client", async (original) => ({
  ...(await original<typeof import("../api/client")>()),
  apiGet: vi.fn(),
  apiRequest: vi.fn(),
  refreshSession: vi.fn(),
  onSessionExpired: vi.fn(),
}));

const get = vi.mocked(apiGet);
const request = vi.mocked(apiRequest);
const refresh = vi.mocked(refreshSession);
// Modül yüklenirken kaydedilen dinleyici; mockReset'ten önce alınır.
const sessionExpired = vi.mocked(onSessionExpired).mock.calls[0][0];

const storage = new Map<string, string>();
const ME: Me = {
  id: "u1",
  email: "ali@acme.test",
  fullName: "Ali",
  tenant: "acme",
  permissions: ["FINANCE_VIEW"],
  roles: ["MUHASEBE"],
  landingPath: "/finance",
  twoFactorEnabled: false,
};

beforeEach(() => {
  storage.clear();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  });
  get.mockReset();
  request.mockReset();
  refresh.mockReset();
  session.clear();
  useAuthStore.setState({ status: "loading", me: null });
});

const rememberedMe = () => JSON.parse(storage.get("blackrose.me") ?? "null");

describe("bootstrap", () => {
  it("oturum işareti yoksa sunucuya gitmeden anonim açılır", async () => {
    await useAuthStore.getState().bootstrap();

    expect(refresh).not.toHaveBeenCalled();
    expect(useAuthStore.getState().status).toBe("anonymous");
  });

  it("yenileme reddedilirse oturumu ve saklı kullanıcıyı siler", async () => {
    session.setAccessToken("eski");
    storage.set("blackrose.me", JSON.stringify(ME));
    refresh.mockResolvedValue("rejected");

    await useAuthStore.getState().bootstrap();

    expect(useAuthStore.getState()).toMatchObject({ status: "anonymous", me: null });
    expect(session.hasSession()).toBe(false);
    expect(rememberedMe()).toBeNull();
  });

  it("çevrimdışı açılışta son bilinen kullanıcıyla devam eder, oturumu silmez", async () => {
    session.setAccessToken("eski");
    storage.set("blackrose.me", JSON.stringify(ME));
    refresh.mockResolvedValue("unreachable");

    await useAuthStore.getState().bootstrap();

    expect(useAuthStore.getState()).toMatchObject({ status: "authenticated", me: ME });
    expect(session.hasSession()).toBe(true);
    expect(get).not.toHaveBeenCalled();
  });

  it("çevrimdışı ve saklı kullanıcı yoksa ya da bozuksa anonim açılır", async () => {
    session.setAccessToken("eski");
    refresh.mockResolvedValue("unreachable");
    await useAuthStore.getState().bootstrap();
    expect(useAuthStore.getState().status).toBe("anonymous");

    storage.set("blackrose.me", "{bozuk");
    await useAuthStore.getState().bootstrap();
    expect(useAuthStore.getState().status).toBe("anonymous");
  });

  it("yenileme başarılıysa kullanıcıyı yükler ve saklar", async () => {
    session.setAccessToken("eski");
    refresh.mockResolvedValue("ok");
    get.mockResolvedValue(ME);

    await useAuthStore.getState().bootstrap();

    expect(get).toHaveBeenCalledWith("/auth/me");
    expect(useAuthStore.getState()).toMatchObject({ status: "authenticated", me: ME });
    expect(rememberedMe()).toEqual(ME);
  });

  it("yenileme sonrası kullanıcı okunamazsa saklı kullanıcıya düşer", async () => {
    session.setAccessToken("eski");
    storage.set("blackrose.me", JSON.stringify(ME));
    refresh.mockResolvedValue("ok");
    get.mockRejectedValue(new TypeError("Failed to fetch"));

    await useAuthStore.getState().bootstrap();

    expect(useAuthStore.getState()).toMatchObject({ status: "authenticated", me: ME });
  });
});

describe("login ve logout", () => {
  it("firma kodunu küçültüp saklar, token'ı alır, kullanıcıyı yükler", async () => {
    request.mockResolvedValue({ accessToken: "erisim", refreshToken: null, expiresInSeconds: 900 });
    get.mockResolvedValue(ME);

    await useAuthStore
      .getState()
      .login({ tenantCode: "  ACME ", email: "ali@acme.test", password: "sifre", totpCode: "" });

    expect(session.getTenantCode()).toBe("acme");
    expect(request).toHaveBeenCalledWith("POST", "/auth/login", {
      email: "ali@acme.test",
      password: "sifre",
      totpCode: undefined,
    });
    expect(session.getAccessToken()).toBe("erisim");
    expect(useAuthStore.getState()).toMatchObject({ status: "authenticated", me: ME });
  });

  it("iki adımlı doğrulama kodunu gönderir; hatalı girişte oturum açılmaz", async () => {
    request.mockRejectedValue(new Error("Doğrulama kodu hatalı."));

    await expect(
      useAuthStore
        .getState()
        .login({ tenantCode: "acme", email: "a@b.test", password: "x", totpCode: "123456" }),
    ).rejects.toThrow("Doğrulama kodu hatalı.");

    expect(request.mock.calls[0][2]).toMatchObject({ totpCode: "123456" });
    expect(session.getAccessToken()).toBeNull();
    expect(get).not.toHaveBeenCalled();
  });

  it("çıkış istek başarısız olsa da yerel oturumu kapatır", async () => {
    session.setAccessToken("erisim");
    storage.set("blackrose.me", JSON.stringify(ME));
    useAuthStore.setState({ status: "authenticated", me: ME });
    request.mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(useAuthStore.getState().logout()).rejects.toThrow();

    expect(request).toHaveBeenCalledWith("POST", "/auth/logout");
    expect(useAuthStore.getState()).toMatchObject({ status: "anonymous", me: null });
    expect(session.hasSession()).toBe(false);
    expect(rememberedMe()).toBeNull();
  });

  it("oturum sunucuda düşünce kullanıcı anonim olur", () => {
    storage.set("blackrose.me", JSON.stringify(ME));
    useAuthStore.setState({ status: "authenticated", me: ME });

    sessionExpired();

    expect(useAuthStore.getState()).toMatchObject({ status: "anonymous", me: null });
    expect(rememberedMe()).toBeNull();
  });
});

describe("hasPermission", () => {
  it("izin istenmeyen sayfa herkese açıktır; oturumsuz kullanıcının izni yoktur", () => {
    expect(hasPermission(null)).toBe(true);
    expect(hasPermission(null, "FINANCE_VIEW")).toBe(false);
    expect(hasPermission(ME, "FINANCE_VIEW")).toBe(true);
    expect(hasPermission(ME, "USER_MANAGE")).toBe(false);
  });
});
