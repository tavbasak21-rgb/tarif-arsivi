import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db, getQueueItem, listQueue, putQueueItem, setSetting } from "../db/db";
import type { ExtractResult, extractRecipe } from "../extract/claude";
import type { extractVideoFrames } from "../media/frames";
import type { preparePhoto } from "../media/image";
import type { RecipeContent } from "../types";
import { enqueueFiles, enqueueText, processQueue, resetStuck, resumePaused, retry } from "./queue";

const content: RecipeContent = {
  sourceLanguage: "tr",
  ingredients: [{ text: "1 su bardağı mercimek", uncertain: false }],
  steps: [{ text: "Haşla", uncertain: false }],
  ingredientsTr: null,
  stepsTr: null,
  rawText: "mercimek haşla",
};

const ok: ExtractResult = { ok: true, content, usage: { input: 10, output: 5 } };

function jpeg(n: number): Blob {
  return new Blob([new Uint8Array([n])], { type: "image/jpeg" });
}

function fakes() {
  return {
    extract: vi.fn<typeof extractRecipe>(async () => ok),
    frames: vi.fn<typeof extractVideoFrames>(async () => ({ frames: [jpeg(1), jpeg(2)], cover: jpeg(1) })),
    photo: vi.fn<typeof preparePhoto>(async () => jpeg(9)),
  };
}

async function enqueueThree() {
  const [video, photo] = await enqueueFiles([
    new File([new Uint8Array([1, 2, 3])], "a.mp4", { type: "video/mp4" }),
    new File([new Uint8Array([4])], "b.jpg", { type: "image/jpeg" }),
  ]);
  const text = await enqueueText("mercimek çorbası tarifi");
  return { video, photo, text };
}

beforeEach(async () => {
  await db.queue.clear();
  await db.settings.clear();
  await db.recipes.clear();
  await setSetting("apiKey", "test-anahtar");
});

describe("enqueue", () => {
  it("enqueueFiles türleri doğru ayırır, diğerlerini atlar", async () => {
    const items = await enqueueFiles(
      [
        new File([new Uint8Array([1])], "a.mp4", { type: "video/mp4" }),
        new File([new Uint8Array([2])], "b.png", { type: "image/png" }),
        new File([new Uint8Array([3])], "c.pdf", { type: "application/pdf" }),
      ],
      "https://ornek.com/x",
    );
    expect(items.map((i) => i.kind)).toEqual(["video", "photo"]);
    expect(items.every((i) => i.status === "pending")).toBe(true);
    expect(items[0].sourceUrl).toBe("https://ornek.com/x");
    const stored = await listQueue();
    expect(stored).toHaveLength(2);
    expect(stored[0].file).not.toBeNull();
    expect(stored[0].createdAt).toBeLessThan(stored[1].createdAt);
  });

  it("enqueueText metin öğesi oluşturur", async () => {
    const item = await enqueueText("tarif metni");
    expect(item.kind).toBe("text");
    expect(item.pastedText).toBe("tarif metni");
    expect(item.status).toBe("pending");
    expect(item.sourceUrl).toBeNull();
    expect(await getQueueItem(item.id)).toBeDefined();
  });
});

describe("processQueue", () => {
  it("3 öğe sırayla işlenir, hepsi draft olur, kareler saklanır", async () => {
    const { video, photo, text } = await enqueueThree();
    const f = fakes();
    const progress: Array<[number, number]> = [];
    const res = await processQueue({ ...f, onProgress: (d, t) => progress.push([d, t]) });

    expect(res).toEqual({ drafted: 3, failed: 0, paused: false });
    expect(progress).toEqual([
      [1, 3],
      [2, 3],
      [3, 3],
    ]);
    const v = (await getQueueItem(video.id))!;
    const p = (await getQueueItem(photo.id))!;
    const t = (await getQueueItem(text.id))!;
    for (const it of [v, p, t]) {
      expect(it.status).toBe("draft");
      expect(it.draft).toEqual(content);
      expect(it.error).toBeNull();
    }
    expect(v.frames).toHaveLength(2);
    expect(v.file).toBeNull();
    expect(p.frames).toHaveLength(1);
    expect(p.file).toBeNull();
    expect(t.frames).toHaveLength(0);
    // sıra: video, foto, metin
    expect(f.extract.mock.calls.map((c) => c[0].pastedText)).toEqual([
      null,
      null,
      "mercimek çorbası tarifi",
    ]);
    expect(f.extract.mock.calls[0][1].model).toBe("claude-opus-5-5");
  });

  it("ikinci öğede network hatası: o öğe failed, üçüncü yine işlenir", async () => {
    const { video, photo, text } = await enqueueThree();
    const f = fakes();
    f.extract
      .mockResolvedValueOnce(ok)
      .mockResolvedValueOnce({ ok: false, reason: "network", message: "İnternet bağlantısı yok." })
      .mockResolvedValueOnce(ok);
    const res = await processQueue(f);
    expect(res).toEqual({ drafted: 2, failed: 1, paused: false });
    expect((await getQueueItem(video.id))!.status).toBe("draft");
    const p = (await getQueueItem(photo.id))!;
    expect(p.status).toBe("failed");
    expect(p.error).toBe("İnternet bağlantısı yok.");
    expect((await getQueueItem(text.id))!.status).toBe("draft");
  });

  it.each(["auth", "credit"] as const)("%s hatasında işlenen öğe ve kalanlar paused olur", async (reason) => {
    const { video, photo, text } = await enqueueThree();
    const f = fakes();
    f.extract
      .mockResolvedValueOnce(ok)
      .mockResolvedValueOnce({ ok: false, reason, message: "Anahtar sorunu." });
    const res = await processQueue(f);
    expect(res.paused).toBe(true);
    expect(res.failed).toBe(0);
    expect(res.drafted).toBe(1);
    expect(f.extract).toHaveBeenCalledTimes(2);
    expect((await getQueueItem(video.id))!.status).toBe("draft");
    const p = (await getQueueItem(photo.id))!;
    const t = (await getQueueItem(text.id))!;
    expect(p.status).toBe("paused");
    expect(t.status).toBe("paused");
    expect(p.error).toBeTruthy();
    expect(t.error).toBeTruthy();
    expect(await listQueue("failed")).toHaveLength(0);

    // anahtar düzeltilince devam
    expect(await resumePaused()).toBe(2);
    const res2 = await processQueue(f);
    expect(res2).toEqual({ drafted: 2, failed: 0, paused: false });
    // kareler yeniden çıkarılmaz
    expect(f.photo).toHaveBeenCalledTimes(1);
  });

  it("processing'de kalmış öğe resetStuck sonrası pending olur ve işlenir", async () => {
    const item = await enqueueText("yarım kalan");
    await putQueueItem({ ...item, status: "processing" });
    const f = fakes();
    expect((await processQueue(f)).drafted).toBe(0);
    expect(await resetStuck()).toBe(1);
    expect((await getQueueItem(item.id))!.status).toBe("pending");
    const res = await processQueue(f);
    expect(res.drafted).toBe(1);
    expect((await getQueueItem(item.id))!.status).toBe("draft");
  });

  it("failed öğe retry sonrası tekrar işlenir, kareler yeniden çıkarılmaz", async () => {
    const [video] = await enqueueFiles([new File([new Uint8Array([1])], "a.mp4", { type: "video/mp4" })]);
    const f = fakes();
    f.extract.mockResolvedValueOnce({ ok: false, reason: "invalid", message: "Yanıt okunamadı." });
    expect(await processQueue(f)).toEqual({ drafted: 0, failed: 1, paused: false });
    expect((await getQueueItem(video.id))!.frames).toHaveLength(2);

    await retry(video.id);
    const r = (await getQueueItem(video.id))!;
    expect(r.status).toBe("pending");
    expect(r.error).toBeNull();

    expect(await processQueue(f)).toEqual({ drafted: 1, failed: 0, paused: false });
    expect(f.frames).toHaveBeenCalledTimes(1);
    expect(f.extract.mock.calls[1][0].images).toHaveLength(2);
  });

  it("kare çıkarma hatasında öğe failed olur ve dosya korunur", async () => {
    const [video] = await enqueueFiles([new File([new Uint8Array([1])], "a.mp4", { type: "video/mp4" })]);
    const f = fakes();
    f.frames.mockRejectedValueOnce(new Error("bozuk video"));
    expect(await processQueue(f)).toEqual({ drafted: 0, failed: 1, paused: false });
    const v = (await getQueueItem(video.id))!;
    expect(v.status).toBe("failed");
    expect(v.error).toMatch(/kare/i);
    expect(v.file).not.toBeNull();
    expect(f.extract).not.toHaveBeenCalled();
  });

  it("beklenmeyen istisna öğeyi failed yapar, processing'de bırakmaz", async () => {
    const item = await enqueueText("metin");
    const f = fakes();
    f.extract.mockRejectedValueOnce(new Error("beklenmedik"));
    expect(await processQueue(f)).toEqual({ drafted: 0, failed: 1, paused: false });
    const s = (await getQueueItem(item.id))!;
    expect(s.status).toBe("failed");
    expect(s.error).toBeTruthy();
  });

  it("aynı anda iki processQueue aynı öğeyi iki kez işlemez", async () => {
    await enqueueThree();
    const f = fakes();
    const [a, b] = await Promise.all([processQueue(f), processQueue(f)]);
    expect(f.extract).toHaveBeenCalledTimes(3);
    expect(a).toEqual(b);
    expect(a.drafted).toBe(3);
  });

  it("API anahtarı yoksa hiçbir öğe işlenmez", async () => {
    await db.settings.clear();
    const { video } = await enqueueThree();
    const f = fakes();
    expect(await processQueue(f)).toEqual({ drafted: 0, failed: 0, paused: true });
    expect(f.extract).not.toHaveBeenCalled();
    expect(f.frames).not.toHaveBeenCalled();
    expect((await getQueueItem(video.id))!.status).toBe("pending");
    expect(await listQueue("pending")).toHaveLength(3);
  });

  it("ayardaki model kullanılır", async () => {
    await setSetting("model", "claude-haiku-5-5");
    await enqueueText("metin");
    const f = fakes();
    await processQueue(f);
    expect(f.extract.mock.calls[0][1]).toMatchObject({
      model: "claude-haiku-5-5",
      apiKey: "test-anahtar",
    });
  });
});

