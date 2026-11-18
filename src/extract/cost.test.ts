import { describe, expect, it } from "vitest";
import { estimateCostUsd, imageTokens } from "./cost";

describe("imageTokens", () => {
  it("w*h/750 yukarı yuvarlanır", () => {
    expect(imageTokens(432, 768)).toBe(Math.ceil((432 * 768) / 750));
    expect(imageTokens(432, 768)).toBe(443);
    expect(imageTokens(750, 1)).toBe(1);
    expect(imageTokens(751, 1)).toBe(2);
  });
});

describe("estimateCostUsd", () => {
  it("Opus'ta 40 kare ≈ 0.13 USD", () => {
    expect(estimateCostUsd(40, "claude-opus-5-5")).toBeCloseTo(0.13, 1);
    expect(Math.abs(estimateCostUsd(40, "claude-opus-5-5") - 0.13)).toBeLessThanOrEqual(0.02);
  });

  it("Haiku'da 40 kare 0.01 USD'den az", () => {
    expect(estimateCostUsd(40, "claude-haiku-5-5")).toBeLessThan(0.01);
  });

  it("bilinmeyen model varsayılan modele düşer", () => {
    expect(estimateCostUsd(40, "bilinmeyen-model")).toBe(estimateCostUsd(40, "claude-opus-5-5"));
  });

  it("kare yoksa yalnız istem ve çıktı ücreti kalır", () => {
    expect(estimateCostUsd(0, "claude-opus-5-5")).toBeGreaterThan(0);
    expect(estimateCostUsd(0, "claude-opus-5-5")).toBeLessThan(estimateCostUsd(1, "claude-opus-5-5"));
  });
});
