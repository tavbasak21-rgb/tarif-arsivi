import Dexie, { type EntityTable } from "dexie";
import type { QueueItem, QueueStatus, Recipe } from "../types";

/**
 * Blob'lar IndexedDB'de `{ type, data: ArrayBuffer }` olarak saklanır.
 * Sebep: iOS Safari'de ve jsdom + fake-indexeddb ortamında Blob'un structured
 * clone'u güvenilir değil. Dışarıya her zaman yine `Blob` verilir.
 */
export type StoredBlob = { type: string; data: ArrayBuffer };

export type StoredRecipe = Omit<Recipe, "coverJpeg" | "frames"> & {
  coverJpeg: StoredBlob | null;
  frames: StoredBlob[];
};

export type StoredQueueItem = Omit<QueueItem, "file" | "frames"> & {
  file: StoredBlob | null;
  frames: StoredBlob[];
};

export type SettingKey = "apiKey" | "model" | "lastBackupAt";
type SettingRow = { key: SettingKey; value: string };

export const db = new Dexie("tarif-arsivi") as Dexie & {
  recipes: EntityTable<StoredRecipe, "id">;
  queue: EntityTable<StoredQueueItem, "id">;
  settings: EntityTable<SettingRow, "key">;
};

db.version(1).stores({
  recipes: "id",
  queue: "id, status",
  settings: "key",
});

/** Blob içeriğini bayt dizisi olarak okur (jsdom'da `arrayBuffer` yoksa yedek yollar). */
export async function blobToBytes(b: Blob): Promise<Uint8Array> {
  if (typeof b.arrayBuffer === "function") {
    return new Uint8Array(await b.arrayBuffer());
  }
  if (typeof FileReader !== "undefined") {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(new Uint8Array(fr.result as ArrayBuffer));
      fr.onerror = () => reject(fr.error ?? new Error("Dosya okunamadı."));
      fr.readAsArrayBuffer(b);
    });
  }
  return new Uint8Array(await new Response(b).arrayBuffer());
}

export async function toStoredBlob(b: Blob): Promise<StoredBlob> {
  const bytes = await blobToBytes(b);
  const data = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  return { type: b.type, data };
}

export function fromStoredBlob(s: StoredBlob): Blob {
  return new Blob([s.data], { type: s.type });
}

async function toStoredBlobOrNull(b: Blob | null): Promise<StoredBlob | null> {
  return b ? toStoredBlob(b) : null;
}

export async function toStoredRecipe(r: Recipe): Promise<StoredRecipe> {
  return {
    ...r,
    coverJpeg: await toStoredBlobOrNull(r.coverJpeg),
    frames: await Promise.all(r.frames.map(toStoredBlob)),
  };
}

export function fromStoredRecipe(s: StoredRecipe): Recipe {
  return {
    ...s,
    coverJpeg: s.coverJpeg ? fromStoredBlob(s.coverJpeg) : null,
    frames: s.frames.map(fromStoredBlob),
  };
}

async function toStoredQueueItem(q: QueueItem): Promise<StoredQueueItem> {
  return {
    ...q,
    file: await toStoredBlobOrNull(q.file),
    frames: await Promise.all(q.frames.map(toStoredBlob)),
  };
}

function fromStoredQueueItem(s: StoredQueueItem): QueueItem {
  return {
    ...s,
    file: s.file ? fromStoredBlob(s.file) : null,
    frames: s.frames.map(fromStoredBlob),
  };
}

// --- Tarifler ---

export async function saveRecipe(r: Recipe): Promise<void> {
  await db.recipes.put(await toStoredRecipe(r));
}

export async function listRecipes(): Promise<Recipe[]> {
  return (await db.recipes.toArray()).map(fromStoredRecipe);
}

export async function getRecipe(id: string): Promise<Recipe | undefined> {
  const s = await db.recipes.get(id);
  return s ? fromStoredRecipe(s) : undefined;
}

export async function deleteRecipe(id: string): Promise<void> {
  await db.recipes.delete(id);
}

// --- Sıra ---

export async function putQueueItem(q: QueueItem): Promise<void> {
  await db.queue.put(await toStoredQueueItem(q));
}

/** Öğeleri `createdAt` artan sırayla döner; `status` verilirse yalnız o durumdakiler. */
export async function listQueue(status?: QueueStatus): Promise<QueueItem[]> {
  const rows = status
    ? await db.queue.where("status").equals(status).toArray()
    : await db.queue.toArray();
  return rows.sort((a, b) => a.createdAt - b.createdAt).map(fromStoredQueueItem);
}

export async function getQueueItem(id: string): Promise<QueueItem | undefined> {
  const s = await db.queue.get(id);
  return s ? fromStoredQueueItem(s) : undefined;
}

export async function deleteQueueItem(id: string): Promise<void> {
  await db.queue.delete(id);
}

// --- Ayarlar ---

export async function getSetting(key: SettingKey): Promise<string | undefined> {
  return (await db.settings.get(key))?.value;
}

export async function setSetting(key: SettingKey, value: string): Promise<void> {
  await db.settings.put({ key, value });
}
