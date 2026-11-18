import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import type { Recipe } from "../types";
import { blobToBytes, db, listRecipes, saveRecipe, setSetting } from "../db/db";
import { exportArchive, importArchive } from "./backup";

function makeRecipe(id: string): Recipe {
  return {
    id,
    title: `Tarif ${id}`,
    sourceUrl: "https://ornek.com/v",
    note: "",
    coverJpeg: new Blob([new Uint8Array([1, 2, 3, 255])], { type: "image/jpeg" }),
    frames: [new Blob([new Uint8Array([0, 128])], { type: "image/jpeg" })],
    sourceLanguage: "en",
    ingredients: [{ text: "1 cup flour", uncertain: false }],
    steps: [{ text: "Mix", uncertain: false }],
    ingredientsTr: [{ text: "1 su bardağı un", uncertain: false }],
    stepsTr: [{ text: "Karıştır", uncertain: false }],
    rawText: "",
    createdAt: 1,
    updatedAt: 2,
  };
}

async function text(b: Blob): Promise<string> {
  return new TextDecoder().decode(await blobToBytes(b));
}

async function clearAll() {
  await Promise.all([db.recipes.clear(), db.queue.clear(), db.settings.clear()]);
}

beforeEach(clearAll);

describe("yedek", () => {
  it("dışa aktarımda API anahtarı yok", async () => {
    await setSetting("apiKey", "sk-ant-test-gizli");
    await saveRecipe(makeRecipe("a"));
    const out = await text(await exportArchive());
    expect(out).not.toContain("sk-ant-test-gizli");
    expect(out).not.toContain("apiKey");
    const parsed = JSON.parse(out);
    expect(parsed.version).toBe(1);
    expect(typeof parsed.exportedAt).toBe("number");
    expect(parsed.recipes).toHaveLength(1);
  });

  it("export → boş DB'ye import → geri gelir; ikinci import atlar", async () => {
    await saveRecipe(makeRecipe("a"));
    await saveRecipe(makeRecipe("b"));
    const file = await exportArchive();
    await clearAll();

    expect(await importArchive(file)).toEqual({ added: 2, skipped: 0 });
    expect(await importArchive(file)).toEqual({ added: 0, skipped: 2 });

    const list = await listRecipes();
    expect(list.map((r) => r.id).sort()).toEqual(["a", "b"]);
    const a = list.find((r) => r.id === "a")!;
    expect(a.ingredientsTr).toEqual([{ text: "1 su bardağı un", uncertain: false }]);
    expect(a.coverJpeg?.type).toBe("image/jpeg");
    expect(Array.from(await blobToBytes(a.coverJpeg!))).toEqual([1, 2, 3, 255]);
    expect(a.frames).toHaveLength(1);
    expect(Array.from(await blobToBytes(a.frames[0]))).toEqual([0, 128]);
  });

  it("bozuk JSON Türkçe hatayla reddedilir, DB değişmez", async () => {
    await saveRecipe(makeRecipe("a"));
    const bad = new Blob(["{ bu json değil"], { type: "application/json" });
    await expect(importArchive(bad)).rejects.toThrow(/yedek dosyası/i);
    expect((await listRecipes()).map((r) => r.id)).toEqual(["a"]);
  });

  it("yanlış biçimli kayıt varsa hiçbir şey yazılmaz", async () => {
    await saveRecipe(makeRecipe("x"));
    const good = JSON.parse(await text(await exportArchive()));
    await clearAll();
    const okOne = good.recipes[0];
    const archive = {
      ...good,
      recipes: [{ ...okOne, id: "iyi" }, { ...okOne, id: "kotu", steps: "yanlış" }],
    };
    const file = new Blob([JSON.stringify(archive)], { type: "application/json" });
    await expect(importArchive(file)).rejects.toThrow(/yedek dosyası/i);
    expect(await listRecipes()).toEqual([]);
  });

  it("bilinmeyen sürüm reddedilir", async () => {
    const file = new Blob([JSON.stringify({ version: 2, exportedAt: 0, recipes: [] })]);
    await expect(importArchive(file)).rejects.toThrow(/sürüm/i);
  });
});
