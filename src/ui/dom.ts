/**
 * Küçük DOM yardımcıları. Kullanıcı ya da Claude metni her zaman `textContent`
 * ile yazılır; `innerHTML` hiç kullanılmaz.
 */

type Attrs = Record<string, string | number | boolean | null | undefined>;
type Child = Node | string | null | undefined | false;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === "class") e.className = String(v);
    else if (k === "text") e.textContent = String(v);
    else e.setAttribute(k, v === true ? "" : String(v));
  }
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    e.append(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return e;
}

export function button(label: string, onClick: () => void, attrs: Attrs = {}): HTMLButtonElement {
  const b = h("button", { type: "button", ...attrs }, label);
  b.addEventListener("click", onClick);
  return b;
}

/** Ekran üst başlığı. */
export function header(title: string): HTMLElement {
  return h("header", { class: "screen-header" }, h("h1", {}, title));
}

/** Bilgi/uyarı bandı; `href` verilirse bütün band bağlantı olur. */
export function band(text: string, kind: "info" | "warn" | "error", href?: string): HTMLElement {
  return href
    ? h("a", { class: `band band-${kind}`, href }, text)
    : h("p", { class: `band band-${kind}`, role: kind === "error" ? "alert" : "status" }, text);
}

/** Dolar tutarını kısa biçimde yazar: büyük tutarlar 2, küçükler daha çok ondalıkla. */
export function formatUsd(n: number): string {
  if (n >= 1) return `$${n.toFixed(2)}`;
  if (n >= 0.01) return `$${n.toFixed(3)}`;
  return `$${n.toFixed(4)}`;
}

/** Yerel tarihi `YYYY-AA-GG` biçiminde verir. */
export function isoDay(ms: number): string {
  const d = new Date(ms);
  const p = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
}

// --- Blob adresleri: her ekran değişiminde serbest bırakılır. ---

const urls = new Set<string>();

export function objectUrl(b: Blob): string {
  const u = URL.createObjectURL(b);
  urls.add(u);
  return u;
}

export function revokeObjectUrls(): void {
  for (const u of urls) URL.revokeObjectURL(u);
  urls.clear();
}

/** Kareleri yatay şerit olarak gösterir. */
export function frameStrip(frames: Blob[]): HTMLElement | null {
  if (frames.length === 0) return null;
  return h(
    "div",
    { class: "frames", role: "list", "aria-label": "Kareler" },
    ...frames.map((f, i) =>
      h("img", { src: objectUrl(f), alt: `Kare ${i + 1}`, role: "listitem", loading: "lazy" }),
    ),
  );
}

/** Yalnız http(s) bağlantılarına izin verir (javascript: vb. engellenir). */
export function safeHttpUrl(s: string | null): string | null {
  if (!s) return null;
  try {
    const u = new URL(s.trim());
    return u.protocol === "http:" || u.protocol === "https:" ? u.href : null;
  } catch {
    return null;
  }
}

export function sourceLink(url: string | null): HTMLElement | null {
  const safe = safeHttpUrl(url);
  if (!safe) return url ? h("p", { class: "muted" }, `Kaynak: ${url}`) : null;
  return h(
    "p",
    { class: "source" },
    h("a", { href: safe, target: "_blank", rel: "noopener noreferrer" }, "Kaynağı aç"),
  );
}

export function errorText(e: unknown): string {
  return e instanceof Error && e.message ? e.message : String(e);
}

/** Boş (null/false) çocukları atlayarak bir parça oluşturur. */
export function frag(...children: Child[]): DocumentFragment {
  const f = document.createDocumentFragment();
  for (const c of children) if (c !== null && c !== undefined && c !== false) f.append(c);
  return f;
}
