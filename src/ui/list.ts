import { getSetting, listQueue, listRecipes } from "../db/db";
import { searchRecipes } from "../search/search";
import type { Recipe } from "../types";
import { band, frag, h, header, objectUrl } from "./dom";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Yedek hatırlatması gerekir mi: en az 1 tarif var ve son yedek yok ya da 7 günden eski. */
export function needsBackupReminder(recipeCount: number, lastBackupAt: number | null, now = Date.now()): boolean {
  if (recipeCount === 0) return false;
  return lastBackupAt === null || now - lastBackupAt > WEEK_MS;
}

function recipeItem(r: Recipe): HTMLElement {
  const cover = r.coverJpeg ?? r.frames[0];
  const thumb = cover
    ? h("img", { class: "thumb", src: objectUrl(cover), alt: "", loading: "lazy" })
    : h("div", { class: "thumb thumb-empty", "aria-hidden": "true" }, "🍲");
  return h(
    "li",
    {},
    h("a", { class: "item", href: `#/tarif/${encodeURIComponent(r.id)}` }, thumb, h("span", { class: "item-body" }, h("strong", {}, r.title))),
  );
}

export async function renderList(root: HTMLElement): Promise<void> {
  const [recipes, queue, lastRaw] = await Promise.all([listRecipes(), listQueue(), getSetting("lastBackupAt")]);
  const drafts = queue.filter((q) => q.status === "draft").length;
  const problems = queue.filter((q) => q.status === "failed" || q.status === "paused").length;
  const waiting = queue.filter((q) => q.status === "pending" || q.status === "processing").length;
  const last = lastRaw ? Number(lastRaw) : null;

  const search = h("input", {
    type: "search",
    "data-role": "search",
    placeholder: "Ad, malzeme ya da adımda ara",
    "aria-label": "Tariflerde ara",
    autocomplete: "off",
    enterkeyhint: "search",
  });
  const results = h("ul", { class: "items", "data-role": "results" });
  const count = h("p", { class: "muted", role: "status" });

  function show() {
    const hits = searchRecipes(recipes, search.value);
    results.replaceChildren(...hits.map(recipeItem));
    if (recipes.length === 0) count.textContent = "Henüz tarif yok. Eklemek için Ekle'ye dokun.";
    else if (hits.length === 0) count.textContent = "Bu aramayla eşleşen tarif yok.";
    else count.textContent = search.value.trim() ? `${hits.length} tarif bulundu` : `${hits.length} tarif`;
  }
  search.addEventListener("input", show);
  show();

  root.replaceChildren(
    frag(
      header("Tarifler"),
      drafts > 0 ? band(`Onay bekleyen ${drafts} tarif →`, "info", "#/onay") : null,
      problems > 0 ? band(`${problems} öğe okunamadı — tekrar dene →`, "error", "#/onay") : null,
      waiting > 0 ? band(`${waiting} öğe okunmayı bekliyor — devam et →`, "warn", "#/onay") : null,
      needsBackupReminder(recipes.length, last)
        ? band(
            last === null ? "Hiç yedek almadın. Yedeği indir →" : "Son yedek 7 günden eski. Yedeği indir →",
            "warn",
            "#/ayarlar",
          )
        : null,
      h("div", { class: "search" }, search),
      count,
      results,
    ),
  );
}
