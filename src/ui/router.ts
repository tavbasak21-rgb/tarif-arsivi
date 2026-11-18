import { renderAdd } from "./add";
import { band, errorText, h, revokeObjectUrls } from "./dom";
import { renderList } from "./list";
import { renderRecipe } from "./recipe";
import { renderReview, renderReviewList } from "./review";
import { renderSettings } from "./settings";

export type Route =
  | { name: "list" }
  | { name: "add" }
  | { name: "reviewList" }
  | { name: "review"; id: string }
  | { name: "recipe"; id: string }
  | { name: "settings" }
  | { name: "notFound" };

export function parseRoute(hash: string): Route {
  const path = hash.replace(/^#/, "") || "/";
  const parts = path.split("/").filter(Boolean).map(decodeURIComponent);
  if (parts.length === 0) return { name: "list" };
  const [a, b] = parts;
  if (a === "ekle" && !b) return { name: "add" };
  if (a === "ayarlar" && !b) return { name: "settings" };
  if (a === "onay") return b ? { name: "review", id: b } : { name: "reviewList" };
  if (a === "tarif" && b) return { name: "recipe", id: b };
  return { name: "notFound" };
}

const NAV: { href: string; label: string; icon: string; match: Route["name"][] }[] = [
  { href: "#/", label: "Tarifler", icon: "📖", match: ["list", "recipe"] },
  { href: "#/ekle", label: "Ekle", icon: "➕", match: ["add"] },
  { href: "#/onay", label: "Onay", icon: "✅", match: ["reviewList", "review"] },
  { href: "#/ayarlar", label: "Ayarlar", icon: "⚙️", match: ["settings"] },
];

export function renderRoute(view: HTMLElement, route: Route): Promise<void> {
  switch (route.name) {
    case "list":
      return renderList(view);
    case "add":
      return renderAdd(view);
    case "reviewList":
      return renderReviewList(view);
    case "review":
      return renderReview(view, route.id);
    case "recipe":
      return renderRecipe(view, route.id);
    case "settings":
      return renderSettings(view);
    case "notFound":
      view.replaceChildren(band("Sayfa bulunamadı.", "warn"), h("p", {}, h("a", { href: "#/" }, "Tariflere dön")));
      return Promise.resolve();
  }
}

/** Ana ekranı ve alt gezinme çubuğunu kurar, hash değişince ilgili ekranı çizer. */
export function startRouter(app: HTMLElement): void {
  const main = h("main", { class: "screen" });
  const links = NAV.map((n) =>
    h("a", { href: n.href, class: "nav-link" }, h("span", { class: "nav-icon", "aria-hidden": "true" }, n.icon), h("span", {}, n.label)),
  );
  const nav = h("nav", { class: "tabbar", "aria-label": "Ana gezinme" }, ...links);
  app.replaceChildren(main, nav);

  const draw = async () => {
    const route = parseRoute(location.hash);
    NAV.forEach((n, i) => {
      if (n.match.includes(route.name)) links[i].setAttribute("aria-current", "page");
      else links[i].removeAttribute("aria-current");
    });
    revokeObjectUrls();
    // Her geçişte yeni bir kap: geç biten eski çizim ekrana yazamaz.
    const view = h("div", { class: "view" });
    main.replaceChildren(view);
    window.scrollTo(0, 0);
    try {
      await renderRoute(view, route);
    } catch (e) {
      view.replaceChildren(band(`Bir sorun oldu: ${errorText(e)}`, "error"));
    }
  };

  window.addEventListener("hashchange", () => void draw());
  void draw();
}
