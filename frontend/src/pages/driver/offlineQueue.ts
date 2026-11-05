import { ApiError } from "../../api/client";
import { TripStatus } from "./types";

export type OpKind = "EVENT" | "POD" | "EXPENSE";

/**
 * Sürücü işlemi önce cihaza yazılır, sonra gönderilir. İşlem anahtarı sunucuda tekilleştirme
 * sağlar: yanıt kaybolup aynı işlem tekrar gitse de ikinci kayıt oluşmaz.
 */
export interface QueuedOp {
  clientId: string;
  owner: string;
  kind: OpKind;
  tripId: string;
  label: string;
  fields: Record<string, string>;
  files: Record<string, Blob>;
  createdAt: number;
  failure: string | null;
}

export interface QueueStore {
  put(op: QueuedOp): Promise<void>;
  remove(clientId: string): Promise<void>;
  list(owner: string): Promise<QueuedOp[]>;
  saveCache(owner: string, value: unknown): Promise<void>;
  readCache(owner: string): Promise<unknown>;
  clearCache(owner: string): Promise<void>;
}

export function createMemoryStore(): QueueStore {
  const ops = new Map<string, QueuedOp>();
  const cache = new Map<string, unknown>();
  return {
    put: async (op) => void ops.set(op.clientId, op),
    remove: async (id) => void ops.delete(id),
    list: async (owner) =>
      [...ops.values()]
        .filter((op) => op.owner === owner)
        .sort((a, b) => a.createdAt - b.createdAt),
    saveCache: async (owner, value) => void cache.set(owner, value),
    readCache: async (owner) => cache.get(owner),
    clearCache: async (owner) => void cache.delete(owner),
  };
}

const DB_NAME = "blackrose-driver";
const OPS = "ops";
const CACHE = "cache";

/** Tek işlemli küçük sarmalayıcı; her çağrı kendi işlemini açar. */
function withStore<T>(
  store: string,
  mode: IDBTransactionMode,
  run: (objects: IDBObjectStore) => IDBRequest<T>,
) {
  return new Promise<T>((resolve, reject) => {
    const open = indexedDB.open(DB_NAME, 1);
    open.onupgradeneeded = () => {
      open.result.createObjectStore(OPS, { keyPath: "clientId" });
      open.result.createObjectStore(CACHE);
    };
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction(store, mode);
      const result = run(tx.objectStore(store));
      tx.oncomplete = () => {
        db.close();
        resolve(result.result);
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    };
  });
}

export function createIndexedDbStore(): QueueStore {
  return {
    put: async (op) => void (await withStore(OPS, "readwrite", (s) => s.put(op))),
    remove: async (id) => void (await withStore(OPS, "readwrite", (s) => s.delete(id))),
    list: async (owner) => {
      const all = await withStore<QueuedOp[]>(OPS, "readonly", (s) => s.getAll());
      return all.filter((op) => op.owner === owner).sort((a, b) => a.createdAt - b.createdAt);
    },
    saveCache: async (owner, value) =>
      void (await withStore(CACHE, "readwrite", (s) => s.put(value, owner))),
    readCache: (owner) => withStore<unknown>(CACHE, "readonly", (s) => s.get(owner)),
    clearCache: async (owner) => void (await withStore(CACHE, "readwrite", (s) => s.delete(owner))),
  };
}

/** Ağ hatası ve sunucu hatası geçicidir; iş kuralı reddi tekrar denemekle düzelmez. */
export function isRetryable(error: unknown) {
  if (error instanceof ApiError) {
    return (
      error.status >= 500 || error.status === 408 || error.status === 429 || error.status === 401
    );
  }
  return true;
}

export interface SyncResult {
  sent: number;
  failed: number;
  stopped: boolean;
}

/**
 * Sırayla gönderir, çünkü "yola çıktı" "yüklendi"den önce gidemez. Geçici hatada durur ve sırayı
 * korur. Reddedilen işlem silinmez: sürücü nedenini görür, tekrar dener veya kaldırır.
 */
export async function syncQueue(
  store: QueueStore,
  owner: string,
  send: (op: QueuedOp) => Promise<unknown>,
): Promise<SyncResult> {
  const result: SyncResult = { sent: 0, failed: 0, stopped: false };
  for (const op of await store.list(owner)) {
    if (op.failure) {
      continue;
    }
    try {
      await send(op);
      await store.remove(op.clientId);
      result.sent++;
    } catch (error) {
      if (isRetryable(error)) {
        result.stopped = true;
        return result;
      }
      await store.put({ ...op, failure: (error as Error).message });
      result.failed++;
    }
  }
  return result;
}

/** Henüz gönderilmemiş işlemler ekranda yapılmış gibi görünür; sürücü aynı işi tekrarlamaz. */
export function effectiveStatus(status: TripStatus, tripId: string, ops: QueuedOp[]): TripStatus {
  let current = status;
  for (const op of ops) {
    if (op.tripId !== tripId || op.failure) {
      continue;
    }
    if (op.kind === "POD") {
      current = "DELIVERED";
    } else if (op.kind === "EVENT" && op.fields.kind === "LOADED") {
      current = "LOADED";
    } else if (op.kind === "EVENT" && op.fields.kind === "IN_TRANSIT") {
      current = "IN_TRANSIT";
    }
  }
  return current;
}

export function nextActions(status: TripStatus) {
  return {
    load: status === "PLANNED",
    depart: status === "LOADED",
    pause: status === "LOADED" || status === "IN_TRANSIT",
    unload: status === "IN_TRANSIT",
    deliver: status === "IN_TRANSIT",
    expense: status !== "DELIVERED",
  };
}
