const IDB_NAME = "game-bola-saves";
const STORE = "saves";
const META_PREFIX = "game-bola-meta-";
export const MAX_SLOTS = 3;

export interface SaveMeta {
  slot: number;
  playerName: string;
  clubName: string;
  season: number;
  currentDay: number;
  savedAt: number;
  mode: string;
}

function slotKey(slot: number) {
  return `slot${slot}`;
}

function openIDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function persistSave(data: unknown, slot = 0): Promise<void> {
  const idb = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(data, slotKey(slot));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function readSave(slot = 0): Promise<unknown | null> {
  const idb = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(slotKey(slot));
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteSlot(slot: number): Promise<void> {
  const idb = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(slotKey(slot));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export function saveMeta(meta: SaveMeta): void {
  localStorage.setItem(`${META_PREFIX}${meta.slot}`, JSON.stringify(meta));
}

export function loadMeta(slot = 0): SaveMeta | null {
  const raw = localStorage.getItem(`${META_PREFIX}${slot}`);
  return raw ? (JSON.parse(raw) as SaveMeta) : null;
}

export function loadAllMeta(): (SaveMeta | null)[] {
  return Array.from({ length: MAX_SLOTS }, (_, i) => loadMeta(i));
}

export function clearMeta(slot = 0): void {
  localStorage.removeItem(`${META_PREFIX}${slot}`);
}

export function clearAllMeta(): void {
  for (let i = 0; i < MAX_SLOTS; i++) clearMeta(i);
}
