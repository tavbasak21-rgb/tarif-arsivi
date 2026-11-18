import { DEFAULT_MODEL } from "../config";
import { getQueueItem, getSetting, listQueue, putQueueItem } from "../db/db";
import { extractRecipe } from "../extract/claude";
import { extractVideoFrames } from "../media/frames";
import { preparePhoto } from "../media/image";
import type { QueueItem } from "../types";

export type ProcessDeps = {
  extract?: typeof extractRecipe;
  frames?: typeof extractVideoFrames;
  photo?: typeof preparePhoto;
  onProgress?: (done: number, total: number) => void;
};

export type ProcessResult = { drafted: number; failed: number; paused: boolean };

const PAUSED_MESSAGE =
  "Okuma durduruldu: API anahtarı geçersiz ya da kredi bitti. Ayarlardan anahtarı düzeltince okuma kaldığı yerden devam eder.";

/** Aynı milisaniyede eklenen öğelerin de sırası korunsun diye artan zaman damgası. */
let lastCreatedAt = 0;
function nextCreatedAt(): number {
  lastCreatedAt = Math.max(Date.now(), lastCreatedAt + 1);
  return lastCreatedAt;
}

function newItem(kind: QueueItem["kind"], sourceUrl: string | undefined): QueueItem {
  return {
    id: crypto.randomUUID(),
    kind,
    file: null,
    pastedText: null,
    sourceUrl: sourceUrl?.trim() ? sourceUrl.trim() : null,
    status: "pending",
    error: null,
    frames: [],
    draft: null,
    createdAt: nextCreatedAt(),
  };
}

/** Seçilen dosyaları sıraya ekler; video ve görsel dışındaki türler atlanır. */
export async function enqueueFiles(files: File[], sourceUrl?: string): Promise<QueueItem[]> {
  const added: QueueItem[] = [];
  for (const file of files) {
    const kind = file.type.startsWith("video/") ? "video" : file.type.startsWith("image/") ? "photo" : null;
    if (!kind) continue;
    const item: QueueItem = { ...newItem(kind, sourceUrl), file };
    await putQueueItem(item);
    added.push(item);
  }
  return added;
}

/** Yapıştırılan metni sıraya ekler. */
export async function enqueueText(text: string, sourceUrl?: string): Promise<QueueItem> {
  const item: QueueItem = { ...newItem("text", sourceUrl), pastedText: text };
  await putQueueItem(item);
  return item;
}

/** Açılışta `processing` durumunda kalmış öğeleri `pending` yapar. */
export async function resetStuck(): Promise<number> {
  const stuck = await listQueue("processing");
  for (const item of stuck) await putQueueItem({ ...item, status: "pending" });
  return stuck.length;
}

/** `failed` veya `paused` öğeyi tekrar sıraya alır. */
export async function retry(id: string): Promise<void> {
  const item = await getQueueItem(id);
  if (!item || (item.status !== "failed" && item.status !== "paused")) return;
  await putQueueItem({ ...item, status: "pending", error: null });
}

/** Bütün `paused` öğeleri tekrar sıraya alır (anahtar düzeltilince). */
export async function resumePaused(): Promise<number> {
  const paused = await listQueue("paused");
  for (const item of paused) await putQueueItem({ ...item, status: "pending", error: null });
  return paused.length;
}

function errorText(e: unknown): string {
  return e instanceof Error && e.message ? e.message : String(e);
}

let running: Promise<ProcessResult> | null = null;

/**
 * Bekleyen öğeleri `createdAt` sırasıyla tek tek okur.
 * Aynı anda çağrılırsa ikinci çağrı çalışan işin sonucunu döner (tek kilit).
 */
export function processQueue(deps: ProcessDeps = {}): Promise<ProcessResult> {
  if (running) return running;
  running = run(deps).finally(() => {
    running = null;
  });
  return running;
}

async function run(deps: ProcessDeps): Promise<ProcessResult> {
  const extract = deps.extract ?? extractRecipe;
  const frames = deps.frames ?? extractVideoFrames;
  const photo = deps.photo ?? preparePhoto;

  const apiKey = await getSetting("apiKey");
  if (!apiKey) return { drafted: 0, failed: 0, paused: true };
  const model = (await getSetting("model")) ?? DEFAULT_MODEL;

  const pending = await listQueue("pending");
  const total = pending.length;
  let drafted = 0;
  let failed = 0;
  let done = 0;

  for (const start of pending) {
    // Arada silinmiş ya da durumu değişmiş olabilir.
    const fresh = await getQueueItem(start.id);
    if (!fresh || fresh.status !== "pending") continue;

    let item: QueueItem = { ...fresh, status: "processing" };
    await putQueueItem(item);
    let pause = false;

    try {
      // 1) Kareler (bir kez çıkarılır, öğeye kaydedilir).
      if (item.kind !== "text" && item.frames.length === 0) {
        if (!item.file) throw new Error("Dosya bulunamadı; öğeyi silip yeniden ekleyin.");
        try {
          let blobs: Blob[];
          if (item.kind === "video") {
            const r = await frames(item.file);
            // Kapak ilk kabul edilen karedir; ayrı tutulmaz, frames[0] kapaktır.
            blobs = r.frames.length > 0 ? r.frames : [r.cover];
          } else {
            blobs = [await photo(item.file)];
          }
          item = { ...item, frames: blobs, file: null };
          await putQueueItem(item);
        } catch (e) {
          const what = item.kind === "video" ? "Videodan kareler alınamadı" : "Fotoğraf hazırlanamadı";
          item = { ...item, status: "failed", error: `${what}: ${errorText(e)}` };
          failed++;
          continue;
        }
      }

      // 2) Claude ile okuma.
      const result = await extract({ images: item.frames, pastedText: item.pastedText }, { apiKey, model });
      if (result.ok) {
        item = { ...item, status: "draft", draft: result.content, error: null };
        drafted++;
      } else if (result.reason === "auth" || result.reason === "credit") {
        item = { ...item, status: "paused", error: result.message || PAUSED_MESSAGE };
        pause = true;
      } else {
        item = { ...item, status: "failed", error: result.message || "Tarif okunamadı." };
        failed++;
      }
    } catch (e) {
      item = { ...item, status: "failed", error: `Beklenmeyen hata: ${errorText(e)}` };
      failed++;
    } finally {
      if (item.status === "processing") {
        item = { ...item, status: "failed", error: item.error ?? "Okuma yarıda kaldı." };
        failed++;
      }
      await putQueueItem(item);
      done++;
      deps.onProgress?.(done, total);
    }

    if (pause) {
      for (const rest of await listQueue("pending")) {
        await putQueueItem({ ...rest, status: "paused", error: PAUSED_MESSAGE });
      }
      return { drafted, failed, paused: true };
    }
  }

  return { drafted, failed, paused: false };
}
