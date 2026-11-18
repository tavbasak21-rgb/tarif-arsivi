import { deleteQueueItem, getQueueItem, listQueue, saveRecipe } from "../db/db";
import { processQueue, resumePaused, retry, type ProcessDeps, type ProcessResult } from "../queue/queue";
import type { Line, QueueItem, Recipe, RecipeContent } from "../types";
import { band, button, errorText, frameStrip, h, header, objectUrl } from "./dom";

// ---------------------------------------------------------------------------
// Ortak düzenleyici (onay ekranı ve tarif düzenleme)
// ---------------------------------------------------------------------------

export type EditorValues = {
  title: string;
  sourceUrl: string | null;
  note: string;
  content: RecipeContent;
};

export type EditorOptions = {
  frames: Blob[];
  onSave: (v: EditorValues) => Promise<void>;
  onDelete: () => Promise<void>;
  deleteQuestion: string;
  onCancel?: () => void;
};

type Tab = "tr" | "orig";
type Kind = "ingredients" | "steps";

const copy = (ls: Line[] | null): Line[] => (ls ?? []).map((l) => ({ ...l }));
const filled = (ls: Line[]): Line[] =>
  ls.map((l) => ({ text: l.text.trim(), uncertain: l.uncertain })).filter((l) => l.text !== "");

/** Ad, malzeme/adım satırları, çeviri sekmesi, not ve kaynak düzenleyicisi. */
export function renderEditor(root: HTMLElement, init: EditorValues, opts: EditorOptions): void {
  const c = init.content;
  const hasTr = c.ingredientsTr !== null || c.stepsTr !== null;
  const lines: Record<Tab, Record<Kind, Line[]>> = {
    orig: { ingredients: copy(c.ingredients), steps: copy(c.steps) },
    tr: { ingredients: copy(c.ingredientsTr), steps: copy(c.stepsTr) },
  };
  let tab: Tab = hasTr ? "tr" : "orig";

  const title = h("input", {
    type: "text",
    id: "f-title",
    "data-role": "title",
    required: true,
    autocomplete: "off",
    placeholder: "Örn. Mercimek çorbası",
  });
  title.value = init.title;

  const sourceUrl = h("input", {
    type: "url",
    id: "f-source",
    "data-role": "source",
    inputmode: "url",
    placeholder: "https://…",
  });
  sourceUrl.value = init.sourceUrl ?? "";

  const note = h("textarea", { id: "f-note", "data-role": "note", rows: 3 });
  note.value = init.note;

  const emptyNotice = h(
    "p",
    { class: "band band-warn", "data-role": "empty-notice", role: "status" },
    "Bu kayıtta tarif bulunamadı. Malzeme ya da adım eklersen kaydedebilirsin.",
  );

  const saveBtn = button("Kaydet", () => void save(), { class: "primary", "data-role": "save" });
  const deleteBtn = button("Sil", () => void remove(), { class: "danger", "data-role": "delete" });
  const status = h("p", { class: "form-status", role: "status" });

  const sections: Record<Kind, HTMLElement> = {
    ingredients: h("section", { class: "lines", "data-role": "ingredients" }),
    steps: h("section", { class: "lines", "data-role": "steps" }),
  };

  function hasContent(): boolean {
    return (["orig", "tr"] as Tab[]).some(
      (t) => filled(lines[t].ingredients).length > 0 || filled(lines[t].steps).length > 0,
    );
  }

  function refresh() {
    const ok = hasContent();
    emptyNotice.hidden = ok;
    saveBtn.disabled = title.value.trim() === "" || !ok;
  }

  function renderSection(kind: Kind) {
    const list = lines[tab][kind];
    const ol = h("ol", { class: "line-list" });
    list.forEach((line, i) => ol.append(renderRow(kind, line, i)));
    const label = kind === "ingredients" ? "Malzemeler" : "Adımlar";
    const add = button(
      kind === "ingredients" ? "+ Malzeme ekle" : "+ Adım ekle",
      () => {
        list.push({ text: "", uncertain: false });
        renderSection(kind);
        const inputs = sections[kind].querySelectorAll<HTMLElement>(".line-text");
        inputs[inputs.length - 1]?.focus();
        refresh();
      },
      { class: "secondary", "data-role": kind === "ingredients" ? "add-ingredient" : "add-step" },
    );
    sections[kind].replaceChildren(h("h2", {}, label), ol, add);
  }

  function renderRow(kind: Kind, line: Line, i: number): HTMLElement {
    const list = lines[tab][kind];
    const field =
      kind === "steps"
        ? h("textarea", { class: "line-text", rows: 2, "aria-label": `Adım ${i + 1}` })
        : h("input", { type: "text", class: "line-text", "aria-label": `Malzeme ${i + 1}` });
    field.value = line.text;
    field.addEventListener("input", () => {
      line.text = field.value;
      refresh();
    });
    const row = h("li", { class: line.uncertain ? "line-row uncertain" : "line-row" }, field);
    if (line.uncertain) {
      row.append(
        button(
          "emin değilim",
          () => {
            line.uncertain = false;
            renderSection(kind);
          },
          { class: "tag", title: "Doğruysa dokun, işaret kalksın" },
        ),
      );
    }
    row.append(
      button(
        "×",
        () => {
          list.splice(i, 1);
          renderSection(kind);
          refresh();
        },
        { class: "icon", "aria-label": "Satırı sil" },
      ),
    );
    return row;
  }

  function tabs(): HTMLElement | null {
    if (!hasTr) return null;
    const bar = h("div", { class: "tabs", role: "tablist" });
    const make = (t: Tab, label: string) => {
      const b = button(label, () => {
        tab = t;
        for (const x of bar.querySelectorAll("button")) x.setAttribute("aria-selected", "false");
        b.setAttribute("aria-selected", "true");
        renderSection("ingredients");
        renderSection("steps");
      }, { role: "tab", "aria-selected": t === tab ? "true" : "false" });
      return b;
    };
    bar.append(make("tr", "Türkçe"), make("orig", "Asıl"));
    return bar;
  }

  async function save() {
    if (saveBtn.disabled) return;
    saveBtn.disabled = true;
    status.textContent = "Kaydediliyor…";
    try {
      await opts.onSave({
        title: title.value.trim(),
        sourceUrl: sourceUrl.value.trim() || null,
        note: note.value.trim(),
        content: {
          sourceLanguage: c.sourceLanguage,
          rawText: c.rawText,
          ingredients: filled(lines.orig.ingredients),
          steps: filled(lines.orig.steps),
          ingredientsTr: hasTr ? filled(lines.tr.ingredients) : null,
          stepsTr: hasTr ? filled(lines.tr.steps) : null,
        },
      });
      status.textContent = "";
    } catch (e) {
      status.textContent = `Kaydedilemedi: ${errorText(e)}`;
      refresh();
    }
  }

  async function remove() {
    if (!confirm(opts.deleteQuestion)) return;
    try {
      await opts.onDelete();
    } catch (e) {
      status.textContent = `Silinemedi: ${errorText(e)}`;
    }
  }

  title.addEventListener("input", refresh);
  renderSection("ingredients");
  renderSection("steps");

  root.replaceChildren(
    h(
      "form",
      { class: "editor", novalidate: true },
      frameStrip(opts.frames),
      h("label", { for: "f-title", class: "field-label" }, "Ad (zorunlu)"),
      title,
      emptyNotice,
      tabs(),
      sections.ingredients,
      sections.steps,
      h("label", { for: "f-note", class: "field-label" }, "Not"),
      note,
      h("label", { for: "f-source", class: "field-label" }, "Kaynak bağlantısı (isteğe bağlı)"),
      sourceUrl,
      status,
      h(
        "div",
        { class: "actions" },
        saveBtn,
        opts.onCancel ? button("Vazgeç", opts.onCancel, { class: "secondary" }) : null,
        deleteBtn,
      ),
    ),
  );
  root.querySelector("form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    void save();
  });
  refresh();
}

// ---------------------------------------------------------------------------
// #/onay/:id — tek taslak
// ---------------------------------------------------------------------------

/** Taslağı gösterir; Cano kaydedene kadar `recipes`'e hiçbir şey yazılmaz. */
export async function renderReview(root: HTMLElement, id: string): Promise<void> {
  const item = await getQueueItem(id);
  if (!item || item.status !== "draft" || !item.draft) {
    root.replaceChildren(
      header("Taslak"),
      band("Bu taslak bulunamadı. Kaydedilmiş ya da silinmiş olabilir.", "warn"),
      h("p", {}, h("a", { href: "#/onay" }, "Onay bekleyenlere dön")),
    );
    return;
  }
  const draft = item.draft;
  const body = h("div");
  root.replaceChildren(header("Taslağı onayla"), body);

  renderEditor(
    body,
    { title: "", sourceUrl: item.sourceUrl, note: "", content: draft },
    {
      frames: item.frames,
      deleteQuestion: "Bu taslak silinsin mi? Geri alınamaz.",
      onSave: async (v) => {
        const now = Date.now();
        const recipe: Recipe = {
          ...v.content,
          id: crypto.randomUUID(),
          title: v.title,
          sourceUrl: v.sourceUrl,
          note: v.note,
          coverJpeg: item.frames[0] ?? null,
          frames: item.frames,
          createdAt: now,
          updatedAt: now,
        };
        await saveRecipe(recipe);
        await deleteQueueItem(item.id);
        location.hash = `#/tarif/${recipe.id}`;
      },
      onDelete: async () => {
        await deleteQueueItem(item.id);
        location.hash = "#/onay";
      },
    },
  );
}

// ---------------------------------------------------------------------------
// #/onay — onay bekleyenler ve sorunlu öğeler
// ---------------------------------------------------------------------------

export type ReviewListDeps = { process?: (deps: ProcessDeps) => Promise<ProcessResult> };

const KIND_LABEL: Record<QueueItem["kind"], string> = { video: "Video", photo: "Fotoğraf", text: "Yazı" };

function preview(item: QueueItem): string {
  const first = item.draft?.ingredientsTr?.[0] ?? item.draft?.ingredients[0] ?? item.draft?.steps[0];
  if (first) return first.text;
  if (item.pastedText) return item.pastedText.slice(0, 80);
  return "Tarif bulunamadı";
}

export async function renderReviewList(root: HTMLElement, deps: ReviewListDeps = {}): Promise<void> {
  const process = deps.process ?? processQueue;
  const all = await listQueue();
  const drafts = all.filter((i) => i.status === "draft");
  const problems = all.filter((i) => i.status === "failed" || i.status === "paused");
  const pending = all.filter((i) => i.status === "pending" || i.status === "processing");
  const progress = h("p", { class: "progress", role: "status", hidden: true });

  async function run(before: () => Promise<unknown>) {
    for (const b of root.querySelectorAll<HTMLButtonElement>("button")) b.disabled = true;
    try {
      await before();
      progress.hidden = false;
      progress.textContent = "Okunuyor… Okuma sürerken uygulamayı açık tut.";
      await process({
        onProgress: (d, t) => {
          progress.textContent = `${d} / ${t} okundu. Okuma sürerken uygulamayı açık tut.`;
        },
      });
    } catch (e) {
      progress.hidden = false;
      progress.textContent = `Hata: ${errorText(e)}`;
      return;
    }
    await renderReviewList(root, deps);
  }

  const parts: (HTMLElement | null)[] = [header("Onay bekleyenler"), progress];

  if (pending.length > 0) {
    parts.push(
      h(
        "section",
        { class: "card" },
        h("p", {}, `${pending.length} öğe okunmayı bekliyor.`),
        button("Okumaya devam et", () => void run(async () => {}), { class: "primary" }),
      ),
    );
  }

  if (problems.length > 0) {
    const paused = problems.some((p) => p.status === "paused");
    const section = h("section", { class: "problems" }, h("h2", {}, `Okunamayanlar (${problems.length})`));
    if (paused) {
      section.append(
        h(
          "p",
          { class: "band band-warn" },
          "Okuma durdu: API anahtarı geçersiz ya da kredi bitti. ",
          h("a", { href: "#/ayarlar" }, "Ayarlar'a git"),
        ),
        button("Okumaya devam et", () => void run(resumePaused), { class: "primary" }),
      );
    }
    const ul = h("ul", { class: "items" });
    for (const p of problems) {
      ul.append(
        h(
          "li",
          { class: "item problem" },
          h("div", { class: "item-body" },
            h("strong", {}, KIND_LABEL[p.kind]),
            h("p", { class: "error" }, p.error ?? "Okunamadı."),
          ),
          h("div", { class: "item-actions" },
            button("Tekrar dene", () => void run(() => retry(p.id)), { class: "secondary" }),
            button("Sil", () => {
              if (!confirm("Bu öğe silinsin mi?")) return;
              void deleteQueueItem(p.id).then(() => renderReviewList(root, deps));
            }, { class: "danger" }),
          ),
        ),
      );
    }
    section.append(ul);
    parts.push(section);
  }

  if (drafts.length === 0) {
    parts.push(
      h("p", { class: "empty" }, problems.length || pending.length ? "Onay bekleyen taslak yok." : "Onay bekleyen taslak yok. Yeni tarif eklemek için Ekle'ye dokun."),
    );
  } else {
    const ul = h("ul", { class: "items" });
    for (const d of drafts) {
      const thumb = d.frames[0]
        ? h("img", { class: "thumb", src: objectUrl(d.frames[0]), alt: "" })
        : h("div", { class: "thumb thumb-empty", "aria-hidden": "true" }, "📝");
      ul.append(
        h(
          "li",
          {},
          h("a", { class: "item", href: `#/onay/${encodeURIComponent(d.id)}` },
            thumb,
            h("span", { class: "item-body" },
              h("strong", {}, `${KIND_LABEL[d.kind]} taslağı`),
              h("span", { class: "muted" }, preview(d)),
            ),
          ),
        ),
      );
    }
    parts.push(h("h2", {}, `Taslaklar (${drafts.length})`), ul);
  }

  root.replaceChildren(...parts.filter((p): p is HTMLElement => p !== null));
}
