/** Videodan kare alma aralığı (saniye). */
export const FRAME_INTERVAL_SEC = 1.5;
/** Bir öğe için Claude'a gönderilecek en fazla kare. */
export const MAX_FRAMES = 40;
/** Saklanan ve gönderilen JPEG karelerin uzun kenarı (piksel). */
export const FRAME_MAX_SIDE = 768;
/** Ardışık iki karenin "aynı" sayılması için ortalama mutlak fark eşiği (0–1). */
export const DEDUPE_THRESHOLD = 0.02;

/** USD / 1M token, 2026-11-03 fiyat tablosu. */
export const MODELS: Record<string, { in: number; out: number }> = {
  "claude-opus-5-5": { in: 4.0, out: 20.0 },
  "claude-haiku-5-5": { in: 0.1, out: 0.5 },
};

export const DEFAULT_MODEL = "claude-opus-5-5";
