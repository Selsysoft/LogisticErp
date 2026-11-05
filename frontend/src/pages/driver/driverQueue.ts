import { create } from "zustand";
import { apiRequest, apiUpload } from "../../api/client";
import { createIndexedDbStore, OpKind, QueuedOp, QueueStore, syncQueue } from "./offlineQueue";

const FILE_NAMES: Record<string, string> = {
  signature: "imza.png",
  photo: "foto.jpg",
  receipt: "fis.jpg",
};

export function sendOp(op: QueuedOp) {
  if (op.kind === "EVENT") {
    const { latitude, longitude, note, ...rest } = op.fields;
    return apiRequest("POST", `/driver/trips/${op.tripId}/events`, {
      ...rest,
      clientId: op.clientId,
      latitude: latitude || null,
      longitude: longitude || null,
      note: note || null,
    });
  }
  const form = new FormData();
  form.set("clientId", op.clientId);
  Object.entries(op.fields).forEach(([key, value]) => {
    if (value !== "") {
      form.set(key, value);
    }
  });
  Object.entries(op.files).forEach(([key, blob]) => {
    form.set(key, blob, FILE_NAMES[key] ?? key);
  });
  const path = op.kind === "POD" ? "pod" : "expenses";
  return apiUpload(`/driver/trips/${op.tripId}/${path}`, form);
}

interface QueueState {
  store: QueueStore;
  owner: string | null;
  ops: QueuedOp[];
  syncing: boolean;
  /** Her başarılı gönderimde artar; ekran listeyi yeniler. */
  sentCount: number;
  init: (owner: string) => Promise<void>;
  enqueue: (input: {
    kind: OpKind;
    tripId: string;
    label: string;
    fields: Record<string, string>;
    files?: Record<string, Blob>;
  }) => Promise<void>;
  sync: () => Promise<void>;
  retry: (clientId: string) => Promise<void>;
  discard: (clientId: string) => Promise<void>;
}

export const useDriverQueue = create<QueueState>((set, get) => ({
  store: createIndexedDbStore(),
  owner: null,
  ops: [],
  syncing: false,
  sentCount: 0,

  async init(owner) {
    set({ owner, ops: await get().store.list(owner) });
    await get().sync();
  },

  async enqueue({ kind, tripId, label, fields, files }) {
    const { store, owner } = get();
    if (!owner) {
      throw new Error("Sürücü oturumu hazır değil.");
    }
    await store.put({
      clientId: crypto.randomUUID(),
      owner,
      kind,
      tripId,
      label,
      fields,
      files: files ?? {},
      createdAt: Date.now(),
      failure: null,
    });
    set({ ops: await store.list(owner) });
    await get().sync();
  },

  async sync() {
    const { store, owner, syncing } = get();
    if (!owner || syncing) {
      return;
    }
    set({ syncing: true });
    try {
      const result = await syncQueue(store, owner, sendOp);
      set((state) => ({ sentCount: state.sentCount + result.sent }));
    } finally {
      set({ syncing: false, ops: await store.list(owner) });
    }
  },

  async retry(clientId) {
    const { store, owner, ops } = get();
    const op = ops.find((item) => item.clientId === clientId);
    if (op && owner) {
      await store.put({ ...op, failure: null });
      set({ ops: await store.list(owner) });
      await get().sync();
    }
  },

  async discard(clientId) {
    const { store, owner } = get();
    if (owner) {
      await store.remove(clientId);
      set({ ops: await store.list(owner) });
    }
  },
}));

const LOCATION_KEY = "blackrose.driver.location";

export function locationEnabled() {
  try {
    return localStorage.getItem(LOCATION_KEY) === "on";
  } catch {
    return false;
  }
}

export function setLocationEnabled(enabled: boolean) {
  try {
    localStorage.setItem(LOCATION_KEY, enabled ? "on" : "off");
  } catch {
    // Tercih saklanamazsa konum kapalı kalır.
  }
}

const LOCATION_TIMEOUT_MILLIS = 4000;

/** Sürücü açmadıysa konum okunmaz. İzin yoksa işlem konumsuz kaydedilir. */
export function currentPosition(): Promise<{ latitude: string; longitude: string } | null> {
  if (!locationEnabled() || !navigator.geolocation) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          latitude: position.coords.latitude.toFixed(6),
          longitude: position.coords.longitude.toFixed(6),
        }),
      () => resolve(null),
      { timeout: LOCATION_TIMEOUT_MILLIS, maximumAge: 60_000 },
    );
  });
}

const MAX_IMAGE_SIDE = 1600;
const JPEG_QUALITY = 0.8;

/** Telefon fotoğrafını küçültür ve sunucunun kabul ettiği JPEG'e çevirir. */
export async function shrinkImage(file: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Fotoğraf işlenemedi."))),
      "image/jpeg",
      JPEG_QUALITY,
    ),
  );
}
