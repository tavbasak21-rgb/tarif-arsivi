import { describe, expect, it } from "vitest";
import { DEFAULT_MODEL, MAX_FRAMES, MODELS } from "./config";
import type { QueueItem } from "./types";

describe("ortak ayarlar", () => {
  it("varsayılan modelin fiyatı tanımlı", () => {
    expect(MODELS[DEFAULT_MODEL]).toBeDefined();
  });

  it("en fazla 40 kare", () => {
    expect(MAX_FRAMES).toBe(40);
  });

  it("QueueItem tipi kurulabiliyor", () => {
    const q: QueueItem = {
      id: "1", kind: "text", file: null, pastedText: "x", sourceUrl: null,
      status: "pending", error: null, frames: [], draft: null, createdAt: 0,
    };
    expect(q.status).toBe("pending");
  });
});
