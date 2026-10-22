/**
 * Content Creator — local run history, kept in THIS browser's IndexedDB.
 *
 * What is stored is exactly what was downloaded: the run's ZIP, plus a small
 * summary row for the list. Reopening a run rebuilds its previews from that
 * ZIP (`viewFromArchive`), so history can never disagree with the archive.
 *
 * It is a convenience, not a record: it lives on one device, the browser may
 * evict it, and private windows may refuse it. Every operation fails SOFT —
 * an unavailable store reports `available: false` and generation is unaffected.
 * Nothing here leaves the browser.
 */

export const HISTORY_DB = "mogzy-content-creator";
export const HISTORY_VERSION = 1;
/** Keep at most this many runs, and at most this many bytes of archives. */
export const HISTORY_MAX_RUNS = 12;
export const HISTORY_MAX_BYTES = 400 * 1024 * 1024;

export type HistoryEntry = {
  id: string;
  createdAt: string;
  title: string;
  mode: string;
  status: string;
  zipFileName: string;
  zipBytes: number;
  captured: number;
  failed: number;
  runIds: string[];
};

type Store = "runs" | "archives";

function openDb(factory: IDBFactory | undefined = globalThis.indexedDB): Promise<IDBDatabase | null> {
  if (!factory) return Promise.resolve(null);
  return new Promise((resolve) => {
    let request: IDBOpenDBRequest;
    try {
      request = factory.open(HISTORY_DB, HISTORY_VERSION);
    } catch {
      resolve(null);
      return;
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("runs")) db.createObjectStore("runs", { keyPath: "id" });
      if (!db.objectStoreNames.contains("archives")) db.createObjectStore("archives");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
}

function tx<T>(db: IDBDatabase, stores: Store[], mode: IDBTransactionMode, work: (t: IDBTransaction) => IDBRequest<T> | void): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const t = db.transaction(stores, mode);
    let result: T | undefined;
    const req = work(t);
    if (req) req.onsuccess = () => (result = req.result);
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error ?? new Error("history transaction failed"));
    t.onabort = () => reject(t.error ?? new Error("history transaction aborted"));
  });
}

export type RunHistory = {
  available: boolean;
  list(): Promise<HistoryEntry[]>;
  save(entry: HistoryEntry, archive: Blob): Promise<boolean>;
  archive(id: string): Promise<Blob | null>;
  remove(id: string): Promise<void>;
  clear(): Promise<void>;
};

const UNAVAILABLE: RunHistory = {
  available: false,
  list: async () => [],
  save: async () => false,
  archive: async () => null,
  remove: async () => {},
  clear: async () => {},
};

/** Open the store; resolves to an inert history when IndexedDB is unusable. */
export async function openRunHistory(factory?: IDBFactory): Promise<RunHistory> {
  let db: IDBDatabase | null = null;
  try {
    db = await openDb(factory ?? globalThis.indexedDB);
  } catch {
    db = null;
  }
  if (!db) return UNAVAILABLE;
  const handle = db;

  const list = async (): Promise<HistoryEntry[]> => {
    try {
      const rows = (await tx<HistoryEntry[]>(handle, ["runs"], "readonly", (t) => t.objectStore("runs").getAll())) ?? [];
      return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    } catch {
      return [];
    }
  };

  const remove = async (id: string) => {
    try {
      await tx(handle, ["runs", "archives"], "readwrite", (t) => {
        t.objectStore("runs").delete(id);
        t.objectStore("archives").delete(id);
      });
    } catch {
      /* soft */
    }
  };

  return {
    available: true,
    list,
    async save(entry, archive) {
      try {
        if (archive.size > HISTORY_MAX_BYTES) return false;
        await tx(handle, ["runs", "archives"], "readwrite", (t) => {
          t.objectStore("runs").put(entry);
          t.objectStore("archives").put(archive, entry.id);
        });
        // Evict oldest beyond the caps.
        const rows = await list();
        let bytes = 0;
        for (let i = 0; i < rows.length; i++) {
          bytes += rows[i].zipBytes;
          if (i >= HISTORY_MAX_RUNS || bytes > HISTORY_MAX_BYTES) await remove(rows[i].id);
        }
        return true;
      } catch {
        return false;
      }
    },
    async archive(id) {
      try {
        const blob = await tx<Blob>(handle, ["archives"], "readonly", (t) => t.objectStore("archives").get(id));
        return blob ?? null;
      } catch {
        return null;
      }
    },
    remove,
    async clear() {
      try {
        await tx(handle, ["runs", "archives"], "readwrite", (t) => {
          t.objectStore("runs").clear();
          t.objectStore("archives").clear();
        });
      } catch {
        /* soft */
      }
    },
  };
}
