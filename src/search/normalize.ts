const TR_MAP: Record<string, string> = { ı: "i", ş: "s", ç: "c", ğ: "g", ö: "o", ü: "u" };

/** Türkçe harf ve büyük/küçük harf duyarsız karşılaştırma için metni düzleştirir. */
export function normalizeTr(s: string): string {
  return s
    .toLocaleLowerCase("tr")
    .replace(/[ışçğöü]/g, (ch) => TR_MAP[ch] ?? ch)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}
