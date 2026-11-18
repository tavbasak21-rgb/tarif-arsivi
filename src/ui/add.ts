import { DEFAULT_MODEL, MAX_FRAMES } from "../config";
import { getSetting, listQueue } from "../db/db";
import { estimateCostUsd } from "../extract/cost";
import { enqueueFiles, enqueueText, processQueue, type ProcessDeps, type ProcessResult } from "../queue/queue";
import { band, button, errorText, formatUsd, frag, h, header } from "./dom";

export type AddDeps = { process?: (deps: ProcessDeps) => Promise<ProcessResult> };

function kindOf(f: File): "video" | "photo" | null {
  if (f.type.startsWith("video/")) return "video";
  if (f.type.startsWith("image/")) return "photo";
  return null;
}

/** Gönderimden önce gösterilen toplam tahmini maliyet: video MAX_FRAMES, fotoğraf 1, metin 0 kare. */
export function estimateTotal(files: File[], hasText: boolean, model: string): { count: number; usd: number } {
  let count = 0;
  let usd = 0;
  for (const f of files) {
    const k = kindOf(f);
    if (!k) continue;
    count++;
    usd += estimateCostUsd(k === "video" ? MAX_FRAMES : 1, model);
  }
  if (hasText) {
    count++;
    usd += estimateCostUsd(0, model);
  }
  return { count, usd };
}

export async function renderAdd(root: HTMLElement, deps: AddDeps = {}): Promise<void> {
  const process = deps.process ?? processQueue;
  const model = (await getSetting("model")) ?? DEFAULT_MODEL;
  const hasKey = !!(await getSetting("apiKey"));

  let files: File[] = [];

  const fileInput = h("input", {
    type: "file",
    id: "f-files",
    accept: "image/*,video/*",
    multiple: true,
    class: "visually-hidden",
  });
  const fileLabel = h("label", { for: "f-files", class: "button primary big" }, "Fotoğraf / video seç");
  const fileInfo = h("p", { class: "muted", "data-role": "file-info" });

  const text = h("textarea", {
    id: "f-text",
    "data-role": "text",
    rows: 5,
    placeholder: "Gönderi açıklamasındaki tarifi buraya yapıştır",
  });
  const url = h("input", {
    type: "url",
    id: "f-url",
    "data-role": "url",
    inputmode: "url",
    placeholder: "https://…",
  });

  const cost = h("p", { class: "cost", "data-role": "cost", hidden: true });
  const start = button("Okumayı başlat", () => void begin(), {
    class: "primary big",
    "data-role": "start",
    hidden: true,
  });
  const progress = h("div", { class: "progress-box", hidden: true, role: "status" });
  const result = h("div", { class: "result", hidden: true });

  function update() {
    const { count, usd } = estimateTotal(files, text.value.trim() !== "", model);
    const supported = files.filter((f) => kindOf(f)).length;
    const skipped = files.length - supported;
    fileInfo.textContent =
      files.length === 0
        ? ""
        : `${supported} dosya seçildi${skipped ? ` (${skipped} dosya desteklenmiyor, atlanacak)` : ""}.`;
    cost.hidden = count === 0;
    start.hidden = count === 0;
    cost.textContent = count === 0 ? "" : `${count} öğe, tahmini maliyet ≈ ${formatUsd(usd)}`;
  }

  fileInput.addEventListener("change", () => {
    files = Array.from(fileInput.files ?? []);
    update();
  });
  text.addEventListener("input", update);

  async function begin() {
    start.disabled = true;
    fileInput.disabled = true;
    text.disabled = true;
    url.disabled = true;
    result.hidden = true;
    const counter = h("p", { class: "progress-count" }, "Sıraya ekleniyor…");
    progress.replaceChildren(
      counter,
      h("p", { class: "band band-warn" }, "Okuma sürerken uygulamayı açık tut. Ekranı kilitleme."),
    );
    progress.hidden = false;
    try {
      const sourceUrl = url.value.trim() || undefined;
      await enqueueFiles(files, sourceUrl);
      if (text.value.trim()) await enqueueText(text.value.trim(), sourceUrl);
      counter.textContent = "Okunuyor…";
      const r = await process({
        onProgress: (done, total) => {
          counter.textContent = `${done} / ${total}`;
        },
      });
      await showResult(r);
    } catch (e) {
      result.replaceChildren(band(`Okuma başlatılamadı: ${errorText(e)}`, "error"));
      result.hidden = false;
    } finally {
      progress.hidden = true;
      files = [];
      fileInput.value = "";
      text.value = "";
      for (const x of [fileInput, text, url]) x.disabled = false;
      start.disabled = false;
      update();
    }
  }

  async function showResult(r: ProcessResult) {
    const parts: HTMLElement[] = [];
    if (r.drafted > 0) {
      parts.push(
        h("p", { class: "band band-info" }, `${r.drafted} taslak onay bekliyor. `, h("a", { href: "#/onay" }, "Onayla")),
      );
    }
    if (r.failed > 0) {
      parts.push(
        h("p", { class: "band band-error" }, `${r.failed} öğe okunamadı. `, h("a", { href: "#/onay" }, "Tekrar dene")),
      );
    }
    if (r.paused) {
      const key = await getSetting("apiKey");
      const pausedItem = (await listQueue("paused"))[0];
      const reason = !key
        ? "API anahtarı girilmemiş, okuma başlamadı. Öğeler sırada bekliyor."
        : (pausedItem?.error ?? "Okuma durdu: API anahtarı geçersiz ya da kredi bitti.");
      parts.push(
        h("p", { class: "band band-warn" }, `${reason} `, h("a", { href: "#/ayarlar" }, "Ayarlar'a git")),
      );
    }
    if (parts.length === 0) parts.push(h("p", { class: "band band-info" }, "Okunacak yeni öğe yoktu."));
    result.replaceChildren(...parts);
    result.hidden = false;
  }

  root.replaceChildren(frag(
    header("Tarif ekle"),
    hasKey
      ? null
      : h("p", { class: "band band-warn" }, "Okuma için API anahtarı gerekli. ", h("a", { href: "#/ayarlar" }, "Ayarlar'a git")),
    h("section", { class: "card" }, fileLabel, fileInput, fileInfo),
    h("label", { for: "f-text", class: "field-label" }, "Yazı yapıştır"),
    text,
    h("label", { for: "f-url", class: "field-label" }, "Kaynak bağlantısı (isteğe bağlı)"),
    url,
    cost,
    start,
    progress,
    result,
  ));
}
