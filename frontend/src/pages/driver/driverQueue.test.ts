import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiRequest, apiUpload, ApiError } from "../../api/client";
import {
  currentPosition,
  locationEnabled,
  sendOp,
  setLocationEnabled,
  useDriverQueue,
} from "./driverQueue";
import { createMemoryStore, QueuedOp } from "./offlineQueue";

vi.mock("../../api/client", async (original) => ({
  ...(await original<typeof import("../../api/client")>()),
  apiRequest: vi.fn(),
  apiUpload: vi.fn(),
}));

const request = vi.mocked(apiRequest);
const upload = vi.mocked(apiUpload);
const OWNER = "acme|u1";

const op = (over: Partial<QueuedOp> = {}): QueuedOp => ({
  clientId: "c1",
  owner: OWNER,
  kind: "EVENT",
  tripId: "t1",
  label: "Yüklendi",
  fields: { kind: "LOADED" },
  files: {},
  createdAt: 1,
  failure: null,
  ...over,
});

const rejected = (status: number, message = "Reddedildi") =>
  new ApiError(status, { code: "X", message, details: [], traceId: null });

beforeEach(() => {
  request.mockReset().mockResolvedValue(undefined);
  upload.mockReset().mockResolvedValue(undefined);
  useDriverQueue.setState({
    store: createMemoryStore(),
    owner: null,
    ops: [],
    syncing: false,
    sentCount: 0,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("sendOp", () => {
  it("olayı işlem anahtarıyla JSON gönderir, boş konumu ve notu null yapar", async () => {
    await sendOp(op({ fields: { kind: "LOADED", latitude: "", longitude: "", note: "" } }));

    expect(request).toHaveBeenCalledWith("POST", "/driver/trips/t1/events", {
      kind: "LOADED",
      clientId: "c1",
      latitude: null,
      longitude: null,
      note: null,
    });
  });

  it("konum ve notu olduğu gibi iletir", async () => {
    await sendOp(
      op({ fields: { kind: "BREAK", latitude: "41.0", longitude: "29.0", note: "Mola" } }),
    );

    expect(request.mock.calls[0][2]).toMatchObject({
      latitude: "41.0",
      longitude: "29.0",
      note: "Mola",
    });
  });

  it("teslim belgesini dosya adlarıyla form olarak gönderir, boş alanları atlar", async () => {
    const signature = new Blob(["imza"], { type: "image/png" });
    await sendOp(
      op({
        kind: "POD",
        fields: { receiverName: "Ayşe", note: "" },
        files: { signature, other: new Blob(["x"]) },
      }),
    );

    const [path, form] = upload.mock.calls[0];
    expect(path).toBe("/driver/trips/t1/pod");
    expect(form.get("clientId")).toBe("c1");
    expect(form.get("receiverName")).toBe("Ayşe");
    expect(form.has("note")).toBe(false);
    expect((form.get("signature") as File).name).toBe("imza.png");
    expect((form.get("other") as File).name).toBe("other");
  });

  it("masrafı masraf ucuna gönderir", async () => {
    await sendOp(
      op({ kind: "EXPENSE", fields: { amount: "250" }, files: { receipt: new Blob() } }),
    );

    expect(upload.mock.calls[0][0]).toBe("/driver/trips/t1/expenses");
    expect((upload.mock.calls[0][1].get("receipt") as File).name).toBe("fis.jpg");
  });
});

describe("useDriverQueue", () => {
  it("oturum hazır değilken işlem eklenemez", async () => {
    await expect(
      useDriverQueue.getState().enqueue({ kind: "EVENT", tripId: "t1", label: "x", fields: {} }),
    ).rejects.toThrow("Sürücü oturumu hazır değil.");
  });

  it("açılışta bekleyen işlemleri gönderir ve sayacı artırır", async () => {
    const store = useDriverQueue.getState().store;
    await store.put(op({ clientId: "a", createdAt: 1 }));
    await store.put(op({ clientId: "b", createdAt: 2 }));

    await useDriverQueue.getState().init(OWNER);

    const state = useDriverQueue.getState();
    expect(request).toHaveBeenCalledTimes(2);
    expect(state.sentCount).toBe(2);
    expect(state.ops).toEqual([]);
    expect(state.syncing).toBe(false);
  });

  it("çevrimdışıyken eklenen işlem cihazda kalır, bağlantı gelince gider", async () => {
    await useDriverQueue.getState().init(OWNER);
    request.mockRejectedValueOnce(new TypeError("Failed to fetch"));

    await useDriverQueue.getState().enqueue({
      kind: "EVENT",
      tripId: "t1",
      label: "Yola çıktı",
      fields: { kind: "IN_TRANSIT" },
    });

    let state = useDriverQueue.getState();
    expect(state.ops).toHaveLength(1);
    expect(state.ops[0].failure).toBeNull();
    expect(state.ops[0].clientId).toMatch(/^[0-9a-f-]{36}$/);
    expect(state.sentCount).toBe(0);

    await useDriverQueue.getState().sync();

    state = useDriverQueue.getState();
    expect(state.ops).toEqual([]);
    expect(state.sentCount).toBe(1);
    // Aynı işlem anahtarıyla tekrar gönderildi; sunucu ikinci kayıt açmaz.
    const keys = request.mock.calls.map((call) => (call[2] as { clientId: string }).clientId);
    expect(keys).toHaveLength(2);
    expect(keys[1]).toBe(keys[0]);
  });

  it("gönderim sürerken ikinci eşitleme başlamaz", async () => {
    const store = useDriverQueue.getState().store;
    await store.put(op());
    let release: () => void = () => {};
    request.mockImplementationOnce(
      () => new Promise((resolve) => (release = () => resolve(undefined))),
    );
    useDriverQueue.setState({ owner: OWNER });

    const first = useDriverQueue.getState().sync();
    await useDriverQueue.getState().sync();
    release();
    await first;

    expect(request).toHaveBeenCalledTimes(1);
    expect(useDriverQueue.getState().sentCount).toBe(1);
  });

  it("reddedilen işlem nedeniyle kalır; yeniden denenince gider, kaldırılınca silinir", async () => {
    await useDriverQueue.getState().init(OWNER);
    request.mockRejectedValueOnce(rejected(409, "Sefer teslim edilmiş."));
    await useDriverQueue
      .getState()
      .enqueue({ kind: "EVENT", tripId: "t1", label: "Yüklendi", fields: { kind: "LOADED" } });

    const failed = useDriverQueue.getState().ops[0];
    expect(failed.failure).toBe("Sefer teslim edilmiş.");

    await useDriverQueue.getState().retry(failed.clientId);
    expect(useDriverQueue.getState().ops).toEqual([]);
    expect(useDriverQueue.getState().sentCount).toBe(1);

    request.mockRejectedValueOnce(rejected(422));
    await useDriverQueue
      .getState()
      .enqueue({ kind: "EVENT", tripId: "t1", label: "Mola", fields: { kind: "BREAK" } });
    const second = useDriverQueue.getState().ops[0];
    await useDriverQueue.getState().discard(second.clientId);
    expect(useDriverQueue.getState().ops).toEqual([]);

    // Bilinmeyen işlem için bir şey yapılmaz.
    await useDriverQueue.getState().retry("yok");
    expect(request).toHaveBeenCalledTimes(3);
  });
});

describe("konum", () => {
  const storage = new Map<string, string>();

  beforeEach(() => {
    storage.clear();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    });
  });

  it("sürücü açmadıkça kapalıdır ve okunmaz", async () => {
    const getCurrentPosition = vi.fn();
    vi.stubGlobal("navigator", { geolocation: { getCurrentPosition } });

    expect(locationEnabled()).toBe(false);
    await expect(currentPosition()).resolves.toBeNull();
    expect(getCurrentPosition).not.toHaveBeenCalled();
  });

  it("açıkken konumu altı basamakla verir, izin yoksa konumsuz devam eder", async () => {
    setLocationEnabled(true);
    expect(locationEnabled()).toBe(true);
    vi.stubGlobal("navigator", {
      geolocation: {
        getCurrentPosition: (ok: PositionCallback) =>
          ok({ coords: { latitude: 41.0082376, longitude: 28.9783589 } } as GeolocationPosition),
      },
    });
    await expect(currentPosition()).resolves.toEqual({
      latitude: "41.008238",
      longitude: "28.978359",
    });

    vi.stubGlobal("navigator", {
      geolocation: {
        getCurrentPosition: (_: PositionCallback, fail: PositionErrorCallback) =>
          fail({ code: 1 } as GeolocationPositionError),
      },
    });
    await expect(currentPosition()).resolves.toBeNull();

    setLocationEnabled(false);
    expect(locationEnabled()).toBe(false);
  });

  it("depolama kapalıysa konum kapalı sayılır ve hata vermez", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("engelli");
      },
      setItem: () => {
        throw new Error("engelli");
      },
    });

    expect(() => setLocationEnabled(true)).not.toThrow();
    expect(locationEnabled()).toBe(false);
  });
});
