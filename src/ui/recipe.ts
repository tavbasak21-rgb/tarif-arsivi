import { deleteRecipe, getRecipe, saveRecipe } from "../db/db";
import type { Line, Recipe } from "../types";
import { band, button, frag, frameStrip, h, header, sourceLink } from "./dom";
import { renderEditor } from "./review";

function lineList(tag: "ul" | "ol", lines: Line[]): HTMLElement {
  if (lines.length === 0) return h("p", { class: "muted" }, "—");
  return h(
    tag,
    { class: "view-lines" },
    ...lines.map((l) =>
      h("li", { class: l.uncertain ? "uncertain" : "" }, l.text, l.uncertain ? h("span", { class: "tag" }, "emin değilim") : null),
    ),
  );
}

function contentView(r: Recipe): HTMLElement {
  const hasTr = r.ingredientsTr !== null || r.stepsTr !== null;
  const box = h("div");
  const draw = (tr: boolean) =>
    box.replaceChildren(
      h("h2", {}, "Malzemeler"),
      lineList("ul", tr ? (r.ingredientsTr ?? []) : r.ingredients),
      h("h2", {}, "Adımlar"),
      lineList("ol", tr ? (r.stepsTr ?? []) : r.steps),
    );
  draw(hasTr);
  if (!hasTr) return box;

  const bar = h("div", { class: "tabs", role: "tablist" });
  const make = (tr: boolean, label: string) => {
    const b = button(label, () => {
      for (const x of bar.querySelectorAll("button")) x.setAttribute("aria-selected", "false");
      b.setAttribute("aria-selected", "true");
      draw(tr);
    }, { role: "tab", "aria-selected": tr ? "true" : "false" });
    return b;
  };
  bar.append(make(true, "Türkçe"), make(false, "Asıl"));
  return h("div", {}, bar, box);
}

export async function renderRecipe(root: HTMLElement, id: string): Promise<void> {
  const r = await getRecipe(id);
  if (!r) {
    root.replaceChildren(
      header("Tarif"),
      band("Bu tarif bulunamadı. Silinmiş olabilir.", "warn"),
      h("p", {}, h("a", { href: "#/" }, "Tariflere dön")),
    );
    return;
  }
  const recipe = r;

  async function remove() {
    if (!confirm(`"${recipe.title}" silinsin mi? Geri alınamaz.`)) return;
    await deleteRecipe(recipe.id);
    location.hash = "#/";
  }

  function edit() {
    const body = h("div");
    root.replaceChildren(header("Tarifi düzenle"), body);
    renderEditor(
      body,
      { title: recipe.title, sourceUrl: recipe.sourceUrl, note: recipe.note, content: recipe },
      {
        frames: recipe.frames,
        deleteQuestion: `"${recipe.title}" silinsin mi? Geri alınamaz.`,
        onCancel: () => void renderRecipe(root, recipe.id),
        onSave: async (v) => {
          await saveRecipe({
            ...recipe,
            ...v.content,
            title: v.title,
            sourceUrl: v.sourceUrl,
            note: v.note,
            createdAt: recipe.createdAt,
            updatedAt: Date.now(),
          });
          await renderRecipe(root, recipe.id);
        },
        onDelete: async () => {
          await deleteRecipe(recipe.id);
          location.hash = "#/";
        },
      },
    );
  }

  root.replaceChildren(
    frag(
      header(recipe.title),
      frameStrip(recipe.frames),
      contentView(recipe),
      recipe.note ? h("section", { class: "note" }, h("h2", {}, "Not"), h("p", {}, recipe.note)) : null,
      sourceLink(recipe.sourceUrl),
      h(
        "div",
        { class: "actions" },
        button("Düzenle", edit, { class: "primary" }),
        button("Sil", () => void remove(), { class: "danger" }),
      ),
    ),
  );
}
