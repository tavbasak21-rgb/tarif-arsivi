import { z } from "zod";
import { blobToBytes, db, type StoredBlob, type StoredRecipe } from "../db/db";

/**
 * Yedek dosyası: `{ version: 1, exportedAt, recipes: [...] }`.
 * Blob'lar `{ type, base64 }` olarak yazılır. Ayarlar (API anahtarı dahil) hiç yazılmaz.
 */

const blobSchema = z.object({ type: z.string(), base64: z.string() });
const lineSchema = z.object({ text: z.string(), uncertain: z.boolean() });

const recipeSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  sourceUrl: z.string().nullable(),
  note: z.string(),
  coverJpeg: blobSchema.nullable(),
  frames: z.array(blobSchema),
  sourceLanguage: z.string(),
  ingredients: z.array(lineSchema),
  steps: z.array(lineSchema),
  ingredientsTr: z.array(lineSchema).nullable(),
  stepsTr: z.array(lineSchema).nullable(),
  rawText: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

const archiveSchema = z.object({
  version: z.literal(1),
  exportedAt: z.number(),
  recipes: z.array(recipeSchema),
});

type ArchiveBlob = z.infer<typeof blobSchema>;
type ArchiveRecipe = z.infer<typeof recipeSchema>;

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

function base64ToBuffer(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const buf = new ArrayBuffer(bin.length);
  const view = new Uint8Array(buf);
  for (let i = 0; i < bin.length; i++) view[i] = bin.charCodeAt(i);
  return buf;
}

function storedToArchiveBlob(s: StoredBlob): ArchiveBlob {
  return { type: s.type, base64: bytesToBase64(new Uint8Array(s.data)) };
}

function archiveToStoredBlob(a: ArchiveBlob): StoredBlob {
  return { type: a.type, data: base64ToBuffer(a.base64) };
}

function toArchiveRecipe(s: StoredRecipe): ArchiveRecipe {
  return {
    id: s.id,
    title: s.title,
    sourceUrl: s.sourceUrl,
    note: s.note,
    coverJpeg: s.coverJpeg ? storedToArchiveBlob(s.coverJpeg) : null,
    frames: s.frames.map(storedToArchiveBlob),
    sourceLanguage: s.sourceLanguage,
    ingredients: s.ingredients,
    steps: s.steps,
    ingredientsTr: s.ingredientsTr,
    stepsTr: s.stepsTr,
    rawText: s.rawText,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  };
}

function fromArchiveRecipe(a: ArchiveRecipe): StoredRecipe {
  return {
    ...a,
    coverJpeg: a.coverJpeg ? archiveToStoredBlob(a.coverJpeg) : null,
    frames: a.frames.map(archiveToStoredBlob),
  };
}

/** Bütün tarifleri tek bir JSON dosyasına yazar. Ayarlar tablosu okunmaz. */
export async function exportArchive(): Promise<Blob> {
  const recipes = (await db.recipes.toArray()).map(toArchiveRecipe);
  const archive = { version: 1 as const, exportedAt: Date.now(), recipes };
  return new Blob([JSON.stringify(archive)], { type: "application/json" });
}

/**
 * Yedek dosyasını geri yükler. Aynı `id`'li tarif varsa atlanır.
 * Önce bütün dosya doğrulanır; hata varsa hiçbir şey yazılmaz.
 */
export async function importArchive(file: Blob): Promise<{ added: number; skipped: number }> {
  let raw: unknown;
  try {
    raw = JSON.parse(new TextDecoder().decode(await blobToBytes(file)));
  } catch {
    throw new Error("Yedek dosyası okunamadı: dosya bozuk ya da bir yedek dosyası değil.");
  }

  if (raw && typeof raw === "object" && "version" in raw && raw.version !== 1) {
    throw new Error(
      `Yedek dosyası bu uygulamanın tanımadığı bir sürümde (${String(raw.version)}).`,
    );
  }

  const parsed = archiveSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error("Yedek dosyası geçersiz: içindeki tarif bilgileri beklenen biçimde değil.");
  }

  let stored: StoredRecipe[];
  try {
    stored = parsed.data.recipes.map(fromArchiveRecipe);
  } catch {
    throw new Error("Yedek dosyası geçersiz: resim verisi bozuk.");
  }

  // Dosya içinde aynı id iki kez geçerse ilki alınır.
  const unique = new Map<string, StoredRecipe>();
  for (const r of stored) if (!unique.has(r.id)) unique.set(r.id, r);

  let added = 0;
  await db.transaction("rw", db.recipes, async () => {
    const ids = [...unique.keys()];
    const existing = await db.recipes.bulkGet(ids);
    const toAdd = ids.filter((_, i) => existing[i] === undefined).map((id) => unique.get(id)!);
    await db.recipes.bulkAdd(toAdd);
    added = toAdd.length;
  });

  return { added, skipped: stored.length - added };
}
