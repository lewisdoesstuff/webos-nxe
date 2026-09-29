/**
 * Baked pane art, kept between launches in IndexedDB so a cold start draws
 * from it instead of baking again.
 *
 * Tolerant like `storage.ts`: a store that is missing, refused or corrupt reads
 * as empty and ignores writes, and the art is baked as if it had never been.
 */

const DB_NAME = "ooo.lew.xne.art";
const STORE = "art";

export interface StoredArt {
  /** The source URL, or a fixed name for art that has no source. */
  key: string;
  /** `artCache.ts`'s bake version; a record of another is ignored. */
  version: number;
  /** A hash of the source as scaled, to tell when an icon has changed. */
  hash: number;
  images: Record<string, Blob>;
}

let opened: Promise<IDBDatabase | null> | null = null;

function open(): Promise<IDBDatabase | null> {
  opened ??= new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, 1);
      request.addEventListener("upgradeneeded", () =>
        request.result.createObjectStore(STORE, { keyPath: "key" }),
      );
      request.addEventListener("success", () => resolve(request.result));
      request.addEventListener("error", () => resolve(null));
    } catch {
      resolve(null);
    }
  });
  return opened;
}

/** Every stored record, by key. */
export async function readAllArt(): Promise<Map<string, StoredArt>> {
  const db = await open();
  if (!db) return new Map();
  return new Promise((resolve) => {
    try {
      const request = db.transaction(STORE, "readonly").objectStore(STORE).getAll();
      request.addEventListener("success", () =>
        resolve(new Map((request.result as StoredArt[]).map((record) => [record.key, record]))),
      );
      request.addEventListener("error", () => resolve(new Map()));
    } catch {
      resolve(new Map());
    }
  });
}

export async function writeArt(record: StoredArt): Promise<void> {
  const db = await open();
  if (!db) return;
  try {
    db.transaction(STORE, "readwrite").objectStore(STORE).put(record);
  } catch {
    // The baked art is already in memory for this session.
  }
}
