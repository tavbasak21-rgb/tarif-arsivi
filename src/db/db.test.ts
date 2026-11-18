import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import type { QueueItem, Recipe } from "../types";
import {
  blobToBytes,
  db,
  deleteQueueItem,
  deleteRecipe,
  getQueueItem,
  getRecipe,
  getSetting,
  listQueue,
  listRecipes,
  putQueueItem,
  saveRecipe,
  setSetting,
} from "./db";

function makeRecipe(id: string, extra: Partial<Recipe> = {}): Recipe {
  return {
    id,
    title: `Tarif ${id}`,
    sourceUrl: null,
    note: "not",
    coverJpeg: new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" }),
    frames: [
      new Blob([new Uint8Array([4, 5])], { type: "image/jpeg" }),
      new Blob([new Uint8Array([6])], { type: "image/jpeg" }),
    ],
    sourceLanguage: "tr",
    ingredients: [{ text: "2 su bardağı un", uncertain: false }],
    steps: [{ text: "Karıştır", uncertain: true }],
    ingredientsTr: null,
    stepsTr: null,
    rawText: "ham metin",
    createdAt: 1000,
    updatedAt: 2000,
    ...extra,
  };
}

function makeQueue(id: string, status: QueueItem["status"], createdAt: number): QueueItem {
  return {
    id,
    kind: "photo",
    file: new Blob([new Uint8Array([9, 9])], { type: "image/png" }),
    pastedText: null,
    sourceUrl: null,
    status,
    error: null,
    frames: [],
    draft: null,
    createdAt,
  };
}

async function bytes(b: Blob | null): Promise<number[]> {
  if (!b) return [];
  return Array.from(await blobToBytes(b));
}

beforeEach(async () => {
  await Promise.all([db.recipes.clear(), db.queue.clear(), db.settings.clear()]);
});

describe("tarifler", () => {
  it("kaydet → listele aynı alanları ve Blob içeriklerini verir", async () => {
    const r = makeRecipe("a");
    await saveRecipe(r);
    const list = await listRecipes();
    expect(list).toHaveLength(1);
    const { coverJpeg, frames, ...rest } = list[0];
    const { coverJpeg: expCover, frames: expFrames, ...expRest } = r;
    expect(rest).toEqual(expRest);
    expect(coverJpeg).toBeInstanceOf(Blob);
    expect(coverJpeg!.type).toBe(expCover!.type);
    expect(await bytes(coverJpeg)).toEqual([1, 2, 3]);
    expect(frames).toHaveLength(expFrames.length);
    expect(await bytes(frames[0])).toEqual([4, 5]);
    expect(await bytes(frames[1])).toEqual([6]);
  });

  it("kapaksız tarif null kapakla döner", async () => {
    await saveRecipe(makeRecipe("b", { coverJpeg: null, frames: [] }));
    const got = await getRecipe("b");
    expect(got?.coverJpeg).toBeNull();
    expect(got?.frames).toEqual([]);
  });

  it("getRecipe ve deleteRecipe", async () => {
    await saveRecipe(makeRecipe("a"));
    expect((await getRecipe("a"))?.title).toBe("Tarif a");
    await deleteRecipe("a");
    expect(await getRecipe("a")).toBeUndefined();
  });
});

describe("sıra", () => {
  it("listQueue(status) yalnız o durumdakileri createdAt sırasıyla döner", async () => {
    await putQueueItem(makeQueue("q3", "pending", 30));
    await putQueueItem(makeQueue("q1", "pending", 10));
    await putQueueItem(makeQueue("q2", "failed", 20));
    const pending = await listQueue("pending");
    expect(pending.map((q) => q.id)).toEqual(["q1", "q3"]);
    expect(pending.every((q) => q.status === "pending")).toBe(true);
    const all = await listQueue();
    expect(all.map((q) => q.id)).toEqual(["q1", "q2", "q3"]);
  });

  it("öğenin dosyası geri gelir, silinebilir", async () => {
    await putQueueItem(makeQueue("q1", "pending", 1));
    const got = await getQueueItem("q1");
    expect(got?.file).toBeInstanceOf(Blob);
    expect(got?.file?.type).toBe("image/png");
    expect(await bytes(got!.file)).toEqual([9, 9]);
    await deleteQueueItem("q1");
    expect(await getQueueItem("q1")).toBeUndefined();
  });
});

describe("ayarlar", () => {
  it("setSetting / getSetting", async () => {
    expect(await getSetting("model")).toBeUndefined();
    await setSetting("model", "claude-haiku-5-5");
    expect(await getSetting("model")).toBe("claude-haiku-5-5");
  });
});
