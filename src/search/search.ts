import type { Line, Recipe } from "../types";
import { normalizeTr } from "./normalize";

const joinLines = (ls: Line[] | null): string => (ls ? ls.map((l) => l.text).join("\n") : "");

function contentText(r: Recipe): string {
  return normalizeTr(
    [r.note, joinLines(r.ingredients), joinLines(r.steps), joinLines(r.ingredientsTr), joinLines(r.stepsTr), r.rawText].join("\n"),
  );
}

const byUpdatedDesc = (a: Recipe, b: Recipe) => b.updatedAt - a.updatedAt;

/**
 * Tarifleri Türkçe karakter ve harf büyüklüğü duyarsız arar.
 * Sorgudaki her kelime adda ya da içerikte geçmelidir. Adında daha çok kelime
 * eşleşen önce gelir; eşitlikte `updatedAt` azalan sıra. Boş sorgu hepsini döner.
 */
export function searchRecipes(recipes: Recipe[], query: string): Recipe[] {
  const terms = normalizeTr(query).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [...recipes].sort(byUpdatedDesc);

  const hits: { recipe: Recipe; titleScore: number }[] = [];
  for (const recipe of recipes) {
    const title = normalizeTr(recipe.title);
    const content = contentText(recipe);
    let titleScore = 0;
    let all = true;
    for (const t of terms) {
      if (title.includes(t)) titleScore += 1;
      else if (!content.includes(t)) {
        all = false;
        break;
      }
    }
    if (all) hits.push({ recipe, titleScore });
  }
  hits.sort((a, b) => b.titleScore - a.titleScore || byUpdatedDesc(a.recipe, b.recipe));
  return hits.map((h) => h.recipe);
}
