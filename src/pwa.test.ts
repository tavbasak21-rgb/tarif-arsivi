// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import { build } from "vite";

// Projede @types/node yok; Node modüllerini dar bir tiple dinamik yüklüyoruz.
type NodeFs = {
  existsSync(p: URL): boolean;
  readFileSync(p: URL, enc: "utf8"): string;
};
type NodeUrl = { fileURLToPath(u: URL): string };

const rootUrl = new URL("../", import.meta.url);
const distUrl = new URL("dist/", rootUrl);

let fs: NodeFs;

function readDist(name: string): string {
  return fs.readFileSync(new URL(name, distUrl), "utf8");
}

describe("PWA derlemesi", () => {
  beforeAll(async () => {
    fs = (await import("node:fs" as string)) as NodeFs;
    const url = (await import("node:url" as string)) as NodeUrl;
    const root = url.fileURLToPath(rootUrl);
    await build({
      root,
      configFile: url.fileURLToPath(new URL("vite.config.ts", rootUrl)),
      logLevel: "silent",
      build: { outDir: "dist", emptyOutDir: true },
    });
  }, 120_000);

  it("manifest uygulama adını, tam ekran görünümü ve başlangıç adresini içerir", () => {
    const manifest = JSON.parse(readDist("manifest.webmanifest")) as Record<string, unknown>;
    expect(manifest.name).toBe("Tarif Arşivi");
    expect(manifest.short_name).toBe("Tarifler");
    expect(manifest.lang).toBe("tr");
    expect(manifest.display).toBe("standalone");
    expect(manifest.start_url).toBe("/tarif-arsivi/");
    expect(manifest.scope).toBe("/tarif-arsivi/");
    const icons = manifest.icons as { src: string; sizes: string; purpose?: string }[];
    expect(icons.map((i) => i.sizes)).toEqual(expect.arrayContaining(["192x192", "512x512"]));
    expect(icons.some((i) => (i.purpose ?? "").includes("maskable"))).toBe(true);
  });

  it("simge dosyaları dist içinde var", () => {
    for (const name of ["icon-192.png", "icon-512.png", "apple-touch-icon.png"]) {
      expect(fs.existsSync(new URL(name, distUrl)), name).toBe(true);
    }
  });

  it("index.html iPhone ana ekran etiketlerini ve manifest bağlantısını içerir", () => {
    const html = readDist("index.html");
    expect(html).toMatch(/<html lang="tr"/);
    expect(html).toMatch(/<meta name="apple-mobile-web-app-capable" content="yes"/);
    expect(html).toMatch(/<meta name="apple-mobile-web-app-title" content="Tarif Arşivi"/);
    expect(html).toMatch(/<link rel="apple-touch-icon" href="\/tarif-arsivi\/apple-touch-icon.png"/);
    expect(html).toMatch(/<link rel="manifest" href="\/tarif-arsivi\/manifest.webmanifest"/);
    expect(html).toContain('id="app"');
  });

  it("service worker var, uygulama dosyalarını önbelleğe alır ama Claude API'sini almaz", () => {
    expect(fs.existsSync(new URL("sw.js", distUrl))).toBe(true);
    const sw = readDist("sw.js");
    expect(sw).toContain("index.html");
    expect(sw).toContain("manifest.webmanifest");
    expect(sw.toLowerCase()).not.toContain("anthropic");
  });
});
