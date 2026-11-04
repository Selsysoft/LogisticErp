import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiGet } from "./client";

afterEach(() => {
  vi.unstubAllGlobals();
});

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
