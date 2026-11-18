import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db, getQueueItem, listRecipes, putQueueItem } from "../db/db";
import type { QueueItem, RecipeContent } from "../types";
import { renderReview } from "./review";

function jpeg(n: number): Blob {
  return new Blob([new Uint8Array([n])], { type: "image/jpeg" });
}

function draftItem(draft: RecipeContent): QueueItem {
  return {
    id: "taslak-1",
    kind: "video",
    file: null,
    pastedText: null,
    sourceUrl: "https://ornek.com/reel",
    status: "draft",
    error: null,
    frames: [jpeg(1), jpeg(2)],
    draft,
    createdAt: 1,
  };
}

const full: RecipeContent = {
  sourceLanguage: "tr",
  ingredients: [
    { text: "1 su bardağı mercimek", uncertain: false },
    { text: "2 havuç", uncertain: true },
  ],
  steps: [{ text: "Haşla", uncertain: false }],
  ingredientsTr: null,
  stepsTr: null,
  rawText: "mercimek havuç haşla",
};

const empty: RecipeContent = {
  sourceLanguage: "tr",
  ingredients: [],
  steps: [],
  ingredientsTr: null,
  stepsTr: null,
  rawText: "",
};

function type(input: HTMLInputElement | HTMLTextAreaElement, value: string) {
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function q<T extends Element>(root: HTMLElement, sel: string): T {
  const e = root.querySelector<T>(sel);
  if (!e) throw new Error(`bulunamadı: ${sel}`);
  return e;
}

let root: HTMLElement;

beforeEach(async () => {
  await db.queue.clear();
  await db.recipes.clear();
  await db.settings.clear();
  URL.createObjectURL = vi.fn(() => "blob:sahte");
  URL.revokeObjectURL = vi.fn();
  document.body.replaceChildren();
  root = document.createElement("div");
  document.body.append(root);
  location.hash = "#/onay/taslak-1";
});

describe("onay ekranı", () => {
  it("ad boşken Kaydet pasif, ad yazılınca aktif", async () => {
    await putQueueItem(draftItem(full));
    await renderReview(root, "taslak-1");

    const title = q<HTMLInputElement>(root, '[data-role="title"]');
    const save = q<HTMLButtonElement>(root, '[data-role="save"]');
    expect(title.value).toBe("");
    expect(save.disabled).toBe(true);

    type(title, "Mercimek çorbası");
    expect(save.disabled).toBe(false);

    type(title, "   ");
    expect(save.disabled).toBe(true);
  });

  it("emin olunmayan satır işaretli görünür", async () => {
    await putQueueItem(draftItem(full));
    await renderReview(root, "taslak-1");
    const uncertain = root.querySelectorAll(".line-row.uncertain");
    expect(uncertain.length).toBe(1);
    expect(uncertain[0].textContent).toContain("emin değilim");
  });

  it("malzeme ve adım boşsa ad yazılsa da Kaydet pasif; satır eklenip yazılınca aktif", async () => {
    await putQueueItem(draftItem(empty));
    await renderReview(root, "taslak-1");

    const notice = q<HTMLElement>(root, '[data-role="empty-notice"]');
    expect(notice.textContent).toContain("Bu kayıtta tarif bulunamadı");
    expect(notice.hidden).toBe(false);
    const save = q<HTMLButtonElement>(root, '[data-role="save"]');
    type(q<HTMLInputElement>(root, '[data-role="title"]'), "Boş tarif");
    expect(save.disabled).toBe(true);

    q<HTMLButtonElement>(root, '[data-role="add-ingredient"]').click();
    const row = q<HTMLInputElement>(root, '[data-role="ingredients"] .line-row .line-text');
    expect(save.disabled).toBe(true); // boş metinli satır sayılmaz
    type(row, "3 yumurta");
    expect(save.disabled).toBe(false);
    expect(notice.hidden).toBe(true);
  });

  it("Kaydet tarifi yazar ve taslağı kuyruktan siler", async () => {
    await putQueueItem(draftItem(full));
    await renderReview(root, "taslak-1");

    type(q<HTMLInputElement>(root, '[data-role="title"]'), "  Mercimek çorbası ");
    const stepInputs = root.querySelectorAll<HTMLInputElement>('[data-role="steps"] .line-row .line-text');
    type(stepInputs[0], "Kısık ateşte haşla");
    q<HTMLButtonElement>(root, '[data-role="add-step"]').click();
    // Boş bırakılan yeni satır kaydedilmez.
    type(q<HTMLTextAreaElement>(root, '[data-role="note"]'), "Limonla ye");
    q<HTMLButtonElement>(root, '[data-role="save"]').click();

    await vi.waitFor(async () => {
      expect(await listRecipes()).toHaveLength(1);
      expect(await getQueueItem("taslak-1")).toBeUndefined();
    });

    const [r] = await listRecipes();
    expect(r.title).toBe("Mercimek çorbası");
    expect(r.ingredients).toEqual(full.ingredients);
    expect(r.steps).toEqual([{ text: "Kısık ateşte haşla", uncertain: false }]);
    expect(r.note).toBe("Limonla ye");
    expect(r.sourceUrl).toBe("https://ornek.com/reel");
    expect(r.frames).toHaveLength(2);
    expect(r.coverJpeg).not.toBeNull();
    expect(r.ingredientsTr).toBeNull();
    expect(r.createdAt).toBe(r.updatedAt);
    expect(r.id).not.toBe("taslak-1");
    await vi.waitFor(() => expect(location.hash).toBe(`#/tarif/${r.id}`));
  });

  it("çeviri varsa Türkçe / Asıl sekmeleri ikisini de kaydeder", async () => {
    await putQueueItem(
      draftItem({
        sourceLanguage: "en",
        ingredients: [{ text: "2 eggs", uncertain: false }],
        steps: [{ text: "Whisk", uncertain: false }],
        ingredientsTr: [{ text: "2 yumurta", uncertain: false }],
        stepsTr: [{ text: "Çırp", uncertain: false }],
        rawText: "2 eggs whisk",
      }),
    );
    await renderReview(root, "taslak-1");
    const tabs = root.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    expect([...tabs].map((t) => t.textContent)).toEqual(["Türkçe", "Asıl"]);

    type(q<HTMLInputElement>(root, '[data-role="ingredients"] .line-row .line-text'), "3 yumurta");
    tabs[1].click();
    type(q<HTMLInputElement>(root, '[data-role="ingredients"] .line-row .line-text'), "3 eggs");
    type(q<HTMLInputElement>(root, '[data-role="title"]'), "Omlet");
    q<HTMLButtonElement>(root, '[data-role="save"]').click();

    await vi.waitFor(async () => expect(await listRecipes()).toHaveLength(1));
    const [r] = await listRecipes();
    expect(r.ingredientsTr).toEqual([{ text: "3 yumurta", uncertain: false }]);
    expect(r.ingredients).toEqual([{ text: "3 eggs", uncertain: false }]);
    expect(r.stepsTr).toEqual([{ text: "Çırp", uncertain: false }]);
  });
});
