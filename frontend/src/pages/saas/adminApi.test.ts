import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../api/client";
import { adminGet, adminRequest, useAdminSession } from "./adminApi";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  useAdminSession.setState({ token: null });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const headersOf = (call: number) => fetchMock.mock.calls[call][1].headers as Record<string, string>;

describe("adminApi", () => {
  it("yönetici yoluna token'la gider ve JSON döner", async () => {
    useAdminSession.getState().setToken("yonetici");
    fetchMock.mockResolvedValue(Response.json([{ type: "BOUNCED" }]));

    await expect(adminGet("/mail-events")).resolves.toEqual([{ type: "BOUNCED" }]);

    expect(fetchMock.mock.calls[0][0]).toBe("/api/v1/admin/mail-events");
    expect(headersOf(0).Authorization).toBe("Bearer yonetici");
    expect(headersOf(0)["Content-Type"]).toBeUndefined();
  });

  it("gövdeyi JSON gönderir, 204'te boş döner", async () => {
    useAdminSession.getState().setToken("yonetici");
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    await expect(
      adminRequest("POST", "/tenants/t1/extend-trial", { days: 7 }),
    ).resolves.toBeUndefined();

    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({ days: 7 }),
    });
    expect(headersOf(0)["Content-Type"]).toBe("application/json");
  });

  it("401'de bellekteki token'ı siler; yönetici yeniden giriş yapar", async () => {
    useAdminSession.getState().setToken("suresi-dolmus");
    fetchMock.mockResolvedValue(
      Response.json(
        { code: "UNAUTHENTICATED", message: "Oturum geçersiz.", details: [], traceId: null },
        { status: 401 },
      ),
    );

    const error = await adminGet("/health").catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(401);
    expect(useAdminSession.getState().token).toBeNull();
  });

  it("token'sız istekte Authorization göndermez; diğer hatalarda token kalır", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({}, { status: 401 }));
    await expect(adminGet("/health")).rejects.toBeInstanceOf(ApiError);
    expect(headersOf(0).Authorization).toBeUndefined();

    useAdminSession.getState().setToken("yonetici");
    fetchMock.mockResolvedValueOnce(
      Response.json(
        { code: "PLAN_IN_USE", message: "Plan kullanımda.", details: [], traceId: "t" },
        { status: 409 },
      ),
    );
    await expect(adminRequest("DELETE", "/plans/p1")).rejects.toMatchObject({
      status: 409,
      body: { code: "PLAN_IN_USE" },
    });
    expect(useAdminSession.getState().token).toBe("yonetici");
  });
});
