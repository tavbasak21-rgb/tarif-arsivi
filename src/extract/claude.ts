import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { RecipeContent } from "../types";
import { buildUserText, SYSTEM_PROMPT } from "./prompt";
import { RecipeContentSchema } from "./schema";

export type ExtractFailureReason = "auth" | "credit" | "refusal" | "network" | "invalid" | "other";

export type ExtractResult =
  | { ok: true; content: RecipeContent; usage: { input: number; output: number } }
  | { ok: false; reason: ExtractFailureReason; message: string };

export type ExtractInput = { images: Blob[]; pastedText: string | null };
export type ExtractOptions = { apiKey: string; model: string; client?: Anthropic };

/** Sunucu tarafı ret yedeği yalnız bu modellerde açılır (Haiku'da yok). */
const FALLBACK_MODELS = new Set(["claude-opus-5-5", "claude-sonnet-5-5"]);
const FALLBACK_BETA = "server-side-fallback-2026-07-01";

const MESSAGES = {
  auth: "API anahtarı geçersiz ya da bu işlem için yetkisi yok. Ayarlardan anahtarı kontrol et.",
  credit: "Claude hesabındaki kredi bitti. Anthropic Console'dan kredi yükleyip tekrar dene.",
  rateLimit: "Şu an çok fazla istek gönderildi. Biraz sonra tekrar dene.",
  network: "Claude'a ulaşılamadı: internet bağlantısı yok ya da kesildi. Bağlantını kontrol edip tekrar dene.",
  refusal: "Claude bu içeriği işlemeyi reddetti. Başka bir kayıtla dene.",
  invalid: "Claude'un cevabı okunamadı. Tekrar dene.",
  other: "Beklenmeyen bir hata oluştu. Biraz sonra tekrar dene.",
} as const;

/** Blob → base64; tarayıcıda ve jsdom'da çalışır. Büyük dosyalar parça parça çevrilir. */
async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await readBlob(blob));
  const CHUNK = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

function readBlob(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === "function") return blob.arrayBuffer();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

function fail(reason: ExtractFailureReason, message: string): ExtractResult {
  return { ok: false, reason, message };
}

/** SDK hatasını kullanıcıya gösterilecek Türkçe sonuca çevirir. Anahtar ya da ham hata metni mesaja konmaz. */
/** Sunucunun hata kodu ve kısa açıklaması; anahtara benzeyen her şey silinir. Teşhis için mesaja eklenir. */
function serverDetail(err: InstanceType<typeof Anthropic.APIError>): string {
  const body = err.error as { error?: { type?: unknown; message?: unknown } } | undefined;
  const type = typeof body?.error?.type === "string" ? body.error.type : "";
  const msg = typeof body?.error?.message === "string" ? body.error.message : "";
  const clean = `${type}${type && msg ? ": " : ""}${msg}`.replace(/sk-ant-\S+/g, "sk-ant-…").slice(0, 200);
  return ` (Kod ${err.status ?? "?"}${clean ? ` · ${clean}` : ""})`;
}

function mapError(err: unknown): ExtractResult {
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
    return fail("auth", MESSAGES.auth + serverDetail(err));
  }
  if (err instanceof Anthropic.RateLimitError) return fail("other", MESSAGES.rateLimit);
  if (err instanceof Anthropic.APIConnectionError) return fail("network", MESSAGES.network);
  if (err instanceof Anthropic.APIError && err.status !== undefined) {
    const text = `${err.message} ${err.apiMessage ?? ""}`;
    if (err.status === 402 || /credit|billing/i.test(text)) return fail("credit", MESSAGES.credit);
    return fail("other", MESSAGES.other);
  }
  if (err instanceof Anthropic.AnthropicError && /structured output/i.test(err.message)) {
    return fail("invalid", MESSAGES.invalid);
  }
  return fail("other", MESSAGES.other);
}

export async function extractRecipe(input: ExtractInput, opts: ExtractOptions): Promise<ExtractResult> {
  try {
    const client = opts.client ?? new Anthropic({ apiKey: opts.apiKey, dangerouslyAllowBrowser: true });

    const images: Anthropic.Beta.BetaImageBlockParam[] = [];
    for (const blob of input.images) {
      images.push({
        type: "image",
        source: { type: "base64", media_type: "image/jpeg", data: await blobToBase64(blob) },
      });
    }

    const fallback = FALLBACK_MODELS.has(opts.model)
      ? { fallbacks: "default" as const, betas: [FALLBACK_BETA] }
      : {};

    const response = await client.beta.messages.parse({
      model: opts.model,
      max_tokens: 16000,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [...images, { type: "text", text: buildUserText(images.length, input.pastedText) }],
        },
      ],
      output_config: { effort: "medium", format: zodOutputFormat(RecipeContentSchema) },
      ...fallback,
    });

    if (response.stop_reason === "refusal") return fail("refusal", MESSAGES.refusal);
    if (response.parsed_output == null) return fail("invalid", MESSAGES.invalid);

    return {
      ok: true,
      content: response.parsed_output,
      usage: { input: response.usage.input_tokens, output: response.usage.output_tokens },
    };
  } catch (err) {
    return mapError(err);
  }
}
