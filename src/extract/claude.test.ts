import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import type { RecipeContent } from "../types";
import { extractRecipe } from "./claude";
import { RecipeContentSchema } from "./schema";

const FAKE_KEY = "sk-ant-test-gizli-anahtar";

const sample: RecipeContent = {
  sourceLanguage: "en",
  ingredients: [
    { text: "2 cups flour", uncertain: false },
    { text: "1 egg", uncertain: true },
  ],
  steps: [{ text: "Mix everything.", uncertain: false }],
  ingredientsTr: [
    { text: "2 su bardağı un", uncertain: false },
    { text: "1 yumurta", uncertain: true },
  ],
  stepsTr: [{ text: "Hepsini karıştır.", uncertain: false }],
  rawText: "2 cups flour\n1 egg\nMix everything.",
};

function okResponse(parsed: RecipeContent | null, extra: Record<string, unknown> = {}) {
  return {
    id: "msg_1",
    type: "message",
    role: "assistant",
    model: "claude-opus-5-5",
    content: [{ type: "text", text: JSON.stringify(parsed) }],
    stop_reason: "end_turn",
    stop_details: null,
    usage: { input_tokens: 1234, output_tokens: 567 },
    parsed_output: parsed,
    ...extra,
  };
}

function fakeClient(impl: (params: any) => Promise<unknown>) {
  const parse = vi.fn(impl);
  const client = { beta: { messages: { parse } } } as unknown as Anthropic;
  return { client, parse };
}

function jpeg(bytes: number[]): Blob {
  return new Blob([new Uint8Array(bytes)], { type: "image/jpeg" });
}

const opts = (client: Anthropic, model = "claude-opus-5-5") => ({ apiKey: FAKE_KEY, model, client });

describe("RecipeContentSchema", () => {
  it("örnek tarifi kabul eder", () => {
    expect(RecipeContentSchema.parse(sample)).toEqual(sample);
  });
});

describe("extractRecipe — başarılı", () => {
  it("parsed_output olduğu gibi döner, usage dolu", async () => {
    const { client } = fakeClient(async () => okResponse(sample));
    const r = await extractRecipe({ images: [], pastedText: "metin" }, opts(client));
    expect(r).toEqual({ ok: true, content: sample, usage: { input: 1234, output: 567 } });
  });

  it("her kare base64 jpeg olarak metin bloğundan önce gönderilir; yapıştırılan metin metin bloğunda", async () => {
    const { client, parse } = fakeClient(async () => okResponse(sample));
    const images = [jpeg([1, 2, 3]), jpeg([255, 254, 253, 0])];
    await extractRecipe({ images, pastedText: "Yapıştırılmış TARİF metni" }, opts(client));

    const params = parse.mock.calls[0][0];
    const content = params.messages[0].content;
    expect(params.messages[0].role).toBe("user");
    expect(content).toHaveLength(3);
    expect(content[0]).toEqual({
      type: "image",
      source: { type: "base64", media_type: "image/jpeg", data: btoa(String.fromCharCode(1, 2, 3)) },
    });
    expect(content[1]).toEqual({
      type: "image",
      source: { type: "base64", media_type: "image/jpeg", data: btoa(String.fromCharCode(255, 254, 253, 0)) },
    });
    expect(content[2].type).toBe("text");
    expect(content[2].text).toContain("Yapıştırılmış TARİF metni");
  });

  it("büyük blob doğru base64'e çevrilir (parça parça)", async () => {
    const { client, parse } = fakeClient(async () => okResponse(sample));
    const bytes = Array.from({ length: 100_000 }, (_, i) => i % 256);
    await extractRecipe({ images: [jpeg(bytes)], pastedText: null }, opts(client));
    const data = parse.mock.calls[0][0].messages[0].content[0].source.data as string;
    const decoded = atob(data);
    expect(decoded.length).toBe(bytes.length);
    expect(decoded.charCodeAt(99_999)).toBe(99_999 % 256);
  });

  it("yapıştırılmış metin yoksa yine de son blok metin bloğudur", async () => {
    const { client, parse } = fakeClient(async () => okResponse(sample));
    await extractRecipe({ images: [jpeg([9])], pastedText: null }, opts(client));
    const content = parse.mock.calls[0][0].messages[0].content;
    expect(content[0].type).toBe("image");
    expect(content[content.length - 1].type).toBe("text");
  });

  it("Opus: output_config.format, effort medium, max_tokens 16000, fallbacks default ve beta başlığı", async () => {
    const { client, parse } = fakeClient(async () => okResponse(sample));
    await extractRecipe({ images: [], pastedText: "x" }, opts(client, "claude-opus-5-5"));
    const params = parse.mock.calls[0][0];
    expect(params.model).toBe("claude-opus-5-5");
    expect(params.max_tokens).toBe(16000);
    expect(params.output_config.format).toBeDefined();
    expect(params.output_config.format.type).toBe("json_schema");
    expect(params.output_config.effort).toBe("medium");
    expect(params.fallbacks).toBe("default");
    expect(params.betas).toEqual(["server-side-fallback-2026-07-01"]);
    expect(params.thinking).toBeUndefined();
    expect(typeof params.system === "string" || Array.isArray(params.system)).toBe(true);
  });

  it("Haiku: fallbacks ve betas yok", async () => {
    const { client, parse } = fakeClient(async () => okResponse(sample));
    await extractRecipe({ images: [], pastedText: "x" }, opts(client, "claude-haiku-5-5"));
    const params = parse.mock.calls[0][0];
    expect(params.model).toBe("claude-haiku-5-5");
    expect(params.output_config.format).toBeDefined();
    expect("fallbacks" in params).toBe(false);
    expect("betas" in params).toBe(false);
  });

  it("Boş tarif (Review Focus 1): boş ingredients/steps ile ok:true ve listeler boş kalır", async () => {
    const empty: RecipeContent = {
      sourceLanguage: "tr",
      ingredients: [],
      steps: [],
      ingredientsTr: null,
      stepsTr: null,
      rawText: "Bugün hava çok güzel",
    };
    const { client } = fakeClient(async () => okResponse(empty));
    const r = await extractRecipe({ images: [jpeg([1])], pastedText: null }, opts(client));
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("beklenmedik");
    expect(r.content.ingredients).toEqual([]);
    expect(r.content.steps).toEqual([]);
    expect(r.content.rawText).toBe("Bugün hava çok güzel");
  });
});

describe("extractRecipe — hatalar", () => {
  const headers = new Headers();

  async function run(err: unknown) {
    const { client } = fakeClient(async () => {
      throw err;
    });
    return extractRecipe({ images: [], pastedText: "x" }, opts(client));
  }

  function expectNoKey(r: { ok: boolean; message?: string }) {
    expect(JSON.stringify(r)).not.toContain(FAKE_KEY);
  }

  it("AuthenticationError → auth", async () => {
    const r = await run(new Anthropic.AuthenticationError(401, { type: "error" }, `invalid x-api-key ${FAKE_KEY}`, headers));
    expect(r).toMatchObject({ ok: false, reason: "auth" });
    if (r.ok) throw new Error();
    expect(r.message).toContain("API anahtarı geçersiz");
    expectNoKey(r);
  });

  it("auth hatasında sunucunun kodu ve kısa açıklaması mesaja eklenir, anahtar eklenmez", async () => {
    const body = { type: "error", error: { type: "authentication_error", message: `invalid x-api-key ${FAKE_KEY}` } };
    const r = await run(new Anthropic.AuthenticationError(401, body, "401", headers));
    if (r.ok) throw new Error();
    expect(r.message).toContain("401");
    expect(r.message).toContain("authentication_error");
    expect(r.message).toContain("invalid x-api-key");
    expectNoKey(r);
  });

  it("403 izin hatasında sunucunun açıklaması mesajda görünür", async () => {
    const body = { type: "error", error: { type: "permission_error", message: "This model is not available for your organization." } };
    const r = await run(new Anthropic.PermissionDeniedError(403, body, "403", headers));
    if (r.ok) throw new Error();
    expect(r.message).toContain("403");
    expect(r.message).toContain("permission_error");
    expect(r.message).toContain("not available");
  });

  it("PermissionDeniedError → auth", async () => {
    const r = await run(new Anthropic.PermissionDeniedError(403, { type: "error" }, "forbidden", headers));
    expect(r).toMatchObject({ ok: false, reason: "auth" });
  });

  it("mesajında credit geçen BadRequestError → credit", async () => {
    const r = await run(
      new Anthropic.BadRequestError(
        400,
        {
          type: "error",
          error: { type: "invalid_request_error", message: "Your credit balance is too low to access the Anthropic API." },
        },
        undefined,
        headers,
      ),
    );
    expect(r).toMatchObject({ ok: false, reason: "credit" });
    if (r.ok) throw new Error();
    expect(r.message).toMatch(/kredi/i);
    expect(r.message).toMatch(/bitti/i);
  });

  it("402 durum kodlu APIError → credit", async () => {
    const r = await run(Anthropic.APIError.generate(402, { type: "error" }, "payment required", headers));
    expect(r).toMatchObject({ ok: false, reason: "credit" });
    const r2 = await run(new Anthropic.APIError(402, { type: "error" }, "payment required", headers));
    expect(r2).toMatchObject({ ok: false, reason: "credit" });
  });

  it("RateLimitError → other, çok fazla istek mesajı", async () => {
    const r = await run(new Anthropic.RateLimitError(429, { type: "error" }, "rate limited", headers));
    expect(r).toMatchObject({ ok: false, reason: "other" });
    if (r.ok) throw new Error();
    expect(r.message).toMatch(/çok fazla istek/i);
    expect(r.message).toMatch(/biraz sonra tekrar dene/i);
  });

  it("APIConnectionError → network, internet bağlantısı mesajı", async () => {
    const r = await run(new Anthropic.APIConnectionError({ message: "fetch failed" }));
    expect(r).toMatchObject({ ok: false, reason: "network" });
    if (r.ok) throw new Error();
    expect(r.message).toMatch(/internet bağlantısı/i);
  });

  it("diğer APIError (500) → other", async () => {
    const r = await run(new Anthropic.InternalServerError(500, { type: "error" }, "boom", headers));
    expect(r).toMatchObject({ ok: false, reason: "other" });
  });

  it("bilinmeyen hata → other, anahtar sızmaz", async () => {
    const r = await run(new Error(`garip ${FAKE_KEY}`));
    expect(r).toMatchObject({ ok: false, reason: "other" });
    expectNoKey(r);
  });

  it("yapılandırılmış çıktı ayrıştırma hatası → invalid", async () => {
    const r = await run(new Anthropic.AnthropicError("Failed to parse structured output: SyntaxError"));
    expect(r).toMatchObject({ ok: false, reason: "invalid" });
  });

  it("stop_reason refusal → refusal", async () => {
    const { client } = fakeClient(async () => okResponse(null, { stop_reason: "refusal", content: [] }));
    const r = await extractRecipe({ images: [], pastedText: "x" }, opts(client));
    expect(r).toMatchObject({ ok: false, reason: "refusal" });
    if (r.ok) throw new Error();
    expect(r.message.length).toBeGreaterThan(0);
  });

  it("parsed_output null → invalid", async () => {
    const { client } = fakeClient(async () => okResponse(null));
    const r = await extractRecipe({ images: [], pastedText: "x" }, opts(client));
    expect(r).toMatchObject({ ok: false, reason: "invalid" });
  });
});
