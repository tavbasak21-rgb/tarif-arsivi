import { exportArchive, importArchive } from "../backup/backup";
import { DEFAULT_MODEL, MODELS } from "../config";
import { getSetting, listQueue, setSetting } from "../db/db";
import { estimateCostUsd } from "../extract/cost";
import { band, button, errorText, formatDate, formatUsd, frag, h, header, isoDay } from "./dom";

const MODEL_LABELS: Record<string, string> = {
  "claude-opus-5-5": "Opus 5.5 (daha iyi okur)",
  "claude-haiku-5-5": "Haiku 5.5 (daha ucuz)",
};

/** Ayarlar ekranında gösterilen örnek: 20 karelik bir video. */
const SAMPLE_FRAMES = 20;

export async function renderSettings(root: HTMLElement): Promise<void> {
  const [savedKey, savedModel, lastRaw] = await Promise.all([
    getSetting("apiKey"),
    getSetting("model"),
    getSetting("lastBackupAt"),
  ]);
  const model = savedModel && MODELS[savedModel] ? savedModel : DEFAULT_MODEL;

  // --- API anahtarı (değer DOM'a geri yazılmaz, hiçbir yere loglanmaz) ---
  const keyInput = h("input", {
    type: "password",
    id: "f-key",
    autocomplete: "off",
    autocapitalize: "off",
    spellcheck: "false",
    placeholder: savedKey ? "•••••••• (kayıtlı)" : "sk-ant-…",
  });
  const keyStatus = h("p", { class: "form-status", role: "status" }, savedKey ? "Kayıtlı bir anahtar var." : "Anahtar girilmemiş.");
  const keySave = button("Anahtarı kaydet", () => void saveKey(), { class: "primary" });

  async function saveKey() {
    const v = keyInput.value.trim();
    if (!v) {
      keyStatus.textContent = "Önce anahtarı yapıştır.";
      return;
    }
    try {
      await setSetting("apiKey", v);
      keyInput.value = "";
      keyInput.placeholder = "•••••••• (kayıtlı)";
      const paused = (await listQueue("paused")).length;
      keyStatus.replaceChildren(
        "Anahtar kaydedildi.",
        paused > 0 ? frag(" Duran okumalar var: ", h("a", { href: "#/onay" }, "Okumaya devam et")) : "",
      );
    } catch (e) {
      keyStatus.textContent = `Kaydedilemedi: ${errorText(e)}`;
    }
  }

  // --- Model ---
  const modelSelect = h("select", { id: "f-model" });
  for (const id of Object.keys(MODELS)) {
    const opt = h(
      "option",
      { value: id },
      `${MODEL_LABELS[id] ?? id} — tarif başına ≈ ${formatUsd(estimateCostUsd(SAMPLE_FRAMES, id))}`,
    );
    opt.selected = id === model;
    modelSelect.append(opt);
  }
  const modelStatus = h("p", { class: "muted" }, `Maliyet ${SAMPLE_FRAMES} karelik bir video için tahmindir.`);
  modelSelect.addEventListener("change", () => {
    void setSetting("model", modelSelect.value).then(() => {
      modelStatus.textContent = "Model kaydedildi.";
    });
  });

  // --- Yedek ---
  const lastText = h("p", { class: "muted", "data-role": "last-backup" });
  const showLast = (ms: number | null) => {
    lastText.textContent = ms ? `Son yedek: ${formatDate(ms)}` : "Henüz yedek alınmadı.";
  };
  showLast(lastRaw ? Number(lastRaw) : null);
  const backupStatus = h("p", { class: "form-status", role: "status" });

  async function download() {
    try {
      const blob = await exportArchive();
      const url = URL.createObjectURL(blob);
      const now = Date.now();
      const a = h("a", { href: url, download: `tarif-arsivi-${isoDay(now)}.json`, hidden: true });
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      await setSetting("lastBackupAt", String(now));
      showLast(now);
      backupStatus.textContent = "Yedek indirildi. Dosyayı iCloud Drive gibi güvenli bir yere kaydet.";
    } catch (e) {
      backupStatus.textContent = `Yedek alınamadı: ${errorText(e)}`;
    }
  }

  const importInput = h("input", {
    type: "file",
    id: "f-import",
    accept: "application/json,.json",
    class: "visually-hidden",
  });
  importInput.addEventListener("change", () => {
    const f = importInput.files?.[0];
    if (!f) return;
    backupStatus.textContent = "Yükleniyor…";
    importArchive(f)
      .then(({ added, skipped }) => {
        backupStatus.textContent =
          `${added} tarif eklendi.` + (skipped ? ` ${skipped} tarif zaten vardı, atlandı.` : "");
      })
      .catch((e: unknown) => {
        backupStatus.textContent = errorText(e);
      })
      .finally(() => {
        importInput.value = "";
      });
  });

  root.replaceChildren(frag(
    header("Ayarlar"),
    h(
      "section",
      { class: "card" },
      h("h2", {}, "Claude API anahtarı"),
      h("p", { class: "muted" }, "Anahtar yalnız bu telefonda saklanır, yedek dosyasına yazılmaz."),
      h("label", { for: "f-key", class: "field-label" }, "Anahtar"),
      keyInput,
      keySave,
      keyStatus,
    ),
    h(
      "section",
      { class: "card" },
      h("h2", {}, "Model"),
      h("label", { for: "f-model", class: "field-label" }, "Okuma modeli"),
      modelSelect,
      modelStatus,
    ),
    h(
      "section",
      { class: "card" },
      h("h2", {}, "Yedek"),
      lastText,
      button("Yedeği indir", () => void download(), { class: "primary" }),
      h("label", { for: "f-import", class: "button secondary" }, "Yedekten yükle"),
      importInput,
      backupStatus,
    ),
    lastRaw ? null : band("Telefon bazen uygulama verisini silebilir. Düzenli yedek al.", "info"),
  ));
}
