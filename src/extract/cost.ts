import { DEFAULT_MODEL, MODELS } from "../config";

/** Görüntü başına yaklaşık giriş tokenı (Claude görsel formülü). */
export function imageTokens(w: number, h: number): number {
  return Math.ceil((w * h) / 750);
}

/** Kare başına token: 432×768 boyutlu kare ≈ 443. */
const FRAME_TOKENS = imageTokens(432, 768);
/** Sistem istemi + talimat metni için tahmini giriş tokenı. */
const PROMPT_TOKENS = 1_000;
/** Tahmini çıktı tokenı. */
const OUTPUT_TOKENS = 3_000;

/** Gönderimden önce gösterilecek tahmini maliyet (USD). Bilinmeyen model varsayılan modelin fiyatını kullanır. */
export function estimateCostUsd(imageCount: number, model: string): number {
  const price = MODELS[model] ?? MODELS[DEFAULT_MODEL];
  const inputTokens = imageCount * FRAME_TOKENS + PROMPT_TOKENS;
  return (inputTokens * price.in + OUTPUT_TOKENS * price.out) / 1_000_000;
}
