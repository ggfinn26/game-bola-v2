const IDB_NAME = "game-bola-saves";
const STORE = "saves";
const SLOT = "slot0";
const META_KEY = "game-bola-meta";

export interface SaveMeta {
  playerName: string;
  clubName: string;
  season: number;
  currentDay: number;
  savedAt: number;
}

function openIDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function persistSave(data: unknown): Promise<void> {
  const idb = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(data, SLOT);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function readSave(): Promise<unknown | null> {
  const idb = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(SLOT);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

export function saveMeta(meta: SaveMeta): void {
  localStorage.setItem(META_KEY, JSON.stringify(meta));
}

export function loadMeta(): SaveMeta | null {
  const raw = localStorage.getItem(META_KEY);
  return raw ? (JSON.parse(raw) as SaveMeta) : null;
}

export function clearMeta(): void {
  localStorage.removeItem(META_KEY);
}
