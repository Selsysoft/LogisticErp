import { describe, expect, it } from "vitest";
import { ApiError } from "../../api/client";
import {
  createMemoryStore,
  effectiveStatus,
  isRetryable,
  nextActions,
  QueuedOp,
  syncQueue,
} from "./offlineQueue";

const op = (id: string, over: Partial<QueuedOp> = {}): QueuedOp => ({
  clientId: id,
  owner: "acme|u1",
  kind: "EVENT",
  tripId: "t1",
  label: id,
  fields: {},
  files: {},
  createdAt: Number(id),
  failure: null,
  ...over,
});

const rejected = (status: number) =>
  new ApiError(status, { code: "X", message: "Reddedildi", details: [], traceId: null });

describe("syncQueue", () => {
  it("sırayla gönderir ve başarılıları siler", async () => {
    const store = createMemoryStore();
    await store.put(op("2"));
    await store.put(op("1"));
    const sent: string[] = [];

    const result = await syncQueue(store, "acme|u1", async (item) => {
      sent.push(item.clientId);
    });

    expect(sent).toEqual(["1", "2"]);
    expect(result).toEqual({ sent: 2, failed: 0, stopped: false });
    expect(await store.list("acme|u1")).toEqual([]);
  });

  it("ağ hatasında durur, sırayı ve işlemleri korur", async () => {
    const store = createMemoryStore();
    await store.put(op("1"));
    await store.put(op("2"));
    const sent: string[] = [];

    const result = await syncQueue(store, "acme|u1", async (item) => {
      sent.push(item.clientId);
      throw new TypeError("Failed to fetch");
    });

    expect(sent).toEqual(["1"]);
    expect(result.stopped).toBe(true);
    expect(await store.list("acme|u1")).toHaveLength(2);
  });

  it("sunucu hatasını geçici sayar", async () => {
    const store = createMemoryStore();
    await store.put(op("1"));

    const result = await syncQueue(store, "acme|u1", async () => {
      throw rejected(502);
    });

    expect(result.stopped).toBe(true);
    expect((await store.list("acme|u1"))[0].failure).toBeNull();
  });

  it("reddedilen işlemi nedeniyle saklar ve sıradakine geçer", async () => {
    const store = createMemoryStore();
    await store.put(op("1"));
    await store.put(op("2"));

    const result = await syncQueue(store, "acme|u1", async (item) => {
      if (item.clientId === "1") {
        throw rejected(409);
      }
    });

    expect(result).toEqual({ sent: 1, failed: 1, stopped: false });
    const left = await store.list("acme|u1");
    expect(left).toHaveLength(1);
    expect(left[0].failure).toBe("Reddedildi");
  });

  it("reddedilmiş işlemi kendiliğinden tekrar göndermez", async () => {
    const store = createMemoryStore();
    await store.put(op("1", { failure: "Reddedildi" }));
    let calls = 0;

    await syncQueue(store, "acme|u1", async () => {
      calls++;
    });

    expect(calls).toBe(0);
  });

  it("başka kullanıcının işlemini göndermez", async () => {
    const store = createMemoryStore();
    await store.put(op("1", { owner: "acme|u2" }));
    let calls = 0;

    await syncQueue(store, "acme|u1", async () => {
      calls++;
    });

    expect(calls).toBe(0);
    expect(await store.list("acme|u2")).toHaveLength(1);
  });
});

describe("isRetryable", () => {
  it("oturum ve sunucu hatalarını geçici, iş kurallarını kalıcı sayar", () => {
    expect(isRetryable(new TypeError("x"))).toBe(true);
    expect(isRetryable(rejected(401))).toBe(true);
    expect(isRetryable(rejected(503))).toBe(true);
    expect(isRetryable(rejected(409))).toBe(false);
    expect(isRetryable(rejected(404))).toBe(false);
  });
});

describe("effectiveStatus", () => {
  it("gönderilmemiş işlemi yansıtır, reddedileni ve başka seferi saymaz", () => {
    expect(effectiveStatus("PLANNED", "t1", [])).toBe("PLANNED");
    expect(effectiveStatus("PLANNED", "t1", [op("1", { fields: { kind: "LOADED" } })])).toBe(
      "LOADED",
    );
    expect(effectiveStatus("IN_TRANSIT", "t1", [op("1", { kind: "POD" })])).toBe("DELIVERED");
    expect(
      effectiveStatus("PLANNED", "t1", [op("1", { fields: { kind: "LOADED" }, failure: "x" })]),
    ).toBe("PLANNED");
    expect(
      effectiveStatus("PLANNED", "t1", [op("1", { tripId: "t2", fields: { kind: "LOADED" } })]),
    ).toBe("PLANNED");
    expect(effectiveStatus("LOADED", "t1", [op("1", { fields: { kind: "BREAK" } })])).toBe(
      "LOADED",
    );
  });
});

describe("nextActions", () => {
  it("duruma uygun adımları sunar", () => {
    expect(nextActions("PLANNED").load).toBe(true);
    expect(nextActions("PLANNED").deliver).toBe(false);
    expect(nextActions("LOADED").depart).toBe(true);
    expect(nextActions("IN_TRANSIT").deliver).toBe(true);
    expect(nextActions("DELIVERED").expense).toBe(false);
  });
});
