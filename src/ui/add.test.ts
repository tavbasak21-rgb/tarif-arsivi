import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_MODEL, MAX_FRAMES } from "../config";
import { db, listQueue, setSetting } from "../db/db";
import { estimateCostUsd } from "../extract/cost";
import { renderAdd } from "./add";
import { formatUsd } from "./dom";

function pick(input: HTMLInputElement, files: File[]) {
  Object.defineProperty(input, "files", { value: files, configurable: true });
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function q<T extends Element>(root: HTMLElement, sel: string): T {
  const e = root.querySelector<T>(sel);
  if (!e) throw new Error(`bulunamadı: ${sel}`);
  return e;
}

const video = () => new File([new Uint8Array([1, 2])], "reel.mp4", { type: "video/mp4" });
const photo = () => new File([new Uint8Array([3])], "tarif.jpg", { type: "image/jpeg" });

let root: HTMLElement;

beforeEach(async () => {
  await db.queue.clear();
  await db.recipes.clear();
  await db.settings.clear();
  document.body.replaceChildren();
  root = document.createElement("div");
  document.body.append(root);
});

describe("ekle ekranı", () => {
  it("seçimden önce maliyet ve başlat düğmesi görünmez", async () => {
    await renderAdd(root);
    expect(q<HTMLElement>(root, '[data-role="cost"]').hidden).toBe(true);
    expect(q<HTMLButtonElement>(root, '[data-role="start"]').hidden).toBe(true);
  });

  it("1 video + 1 fotoğraf seçilince toplam tahmini maliyeti gösterir", async () => {
    await renderAdd(root);
    pick(q<HTMLInputElement>(root, 'input[type="file"]'), [video(), photo()]);

    const expected = estimateCostUsd(MAX_FRAMES, DEFAULT_MODEL) + estimateCostUsd(1, DEFAULT_MODEL);
    const cost = q<HTMLElement>(root, '[data-role="cost"]');
    expect(cost.hidden).toBe(false);
    expect(cost.textContent).toBe(`2 öğe, tahmini maliyet ≈ ${formatUsd(expected)}`);
    expect(q<HTMLButtonElement>(root, '[data-role="start"]').hidden).toBe(false);
  });

  it("seçili modelin fiyatını ve yapıştırılan metni hesaba katar", async () => {
    await setSetting("model", "claude-haiku-5-5");
    await renderAdd(root);
    pick(q<HTMLInputElement>(root, 'input[type="file"]'), [video()]);
    const text = q<HTMLTextAreaElement>(root, '[data-role="text"]');
    text.value = "Malzemeler: 2 yumurta";
    text.dispatchEvent(new Event("input", { bubbles: true }));

    const m = "claude-haiku-5-5";
    const expected = estimateCostUsd(MAX_FRAMES, m) + estimateCostUsd(0, m);
    expect(q<HTMLElement>(root, '[data-role="cost"]').textContent).toBe(
      `2 öğe, tahmini maliyet ≈ ${formatUsd(expected)}`,
    );
  });

  it("Okumayı başlat öğeleri sıraya ekler ve sahte işleyiciyi çağırır", async () => {
    const process = vi.fn(async (deps: { onProgress?: (d: number, t: number) => void }) => {
      deps.onProgress?.(1, 2);
      return { drafted: 2, failed: 0, paused: false };
    });
    await renderAdd(root, { process });
    pick(q<HTMLInputElement>(root, 'input[type="file"]'), [video(), photo()]);
    q<HTMLButtonElement>(root, '[data-role="start"]').click();

    await vi.waitFor(() => expect(root.textContent).toContain("2 taslak onay bekliyor"));
    expect(process).toHaveBeenCalledTimes(1);
    expect(await listQueue()).toHaveLength(2);
  });

  it("anahtar sorununda okuma durunca Türkçe neden ve Ayarlar bağlantısı görünür", async () => {
    const process = vi.fn(async () => ({ drafted: 0, failed: 0, paused: true }));
    await renderAdd(root, { process });
    pick(q<HTMLInputElement>(root, 'input[type="file"]'), [photo()]);
    q<HTMLButtonElement>(root, '[data-role="start"]').click();

    await vi.waitFor(() => expect(root.textContent).toContain("API anahtarı"));
    expect(root.querySelector('a[href="#/ayarlar"]')).not.toBeNull();
  });
});
