import { describe, expect, it } from "vitest";
import { FINGERPRINT_SIZE, grayFingerprint, isNearDuplicate, pickTimestamps } from "./frames";
import { fitSize } from "./image";

describe("pickTimestamps", () => {
  it("30 sn için 1,5 sn aralıkların ortalarını verir (20 kare)", () => {
    const t = pickTimestamps(30);
    expect(t).toHaveLength(20);
    expect(t[0]).toBeCloseTo(0.75);
    expect(t[1]).toBeCloseTo(2.25);
    expect(t[19]).toBeCloseTo(29.25);
  });

  it("uzun kayıtta (300 sn) en fazla 40 kare verir, süreye yayılmış ve artan sırada", () => {
    const t = pickTimestamps(300);
    expect(t).toHaveLength(40);
    expect(t[0]).toBeLessThan(8);
    expect(t[t.length - 1]).toBeGreaterThan(292);
    for (let i = 1; i < t.length; i++) expect(t[i]).toBeGreaterThan(t[i - 1]);
    for (const x of t) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(300);
    }
  });

  it("çok uzun kayıtta da 40'ı aşmaz", () => {
    expect(pickTimestamps(3600)).toHaveLength(40);
  });

  it("kısa video için tek kare (ortası)", () => {
    expect(pickTimestamps(0.5)).toEqual([0.25]);
  });

  it("son yarım aralığın ortası süreyi aşmaz", () => {
    const t = pickTimestamps(2);
    expect(t).toHaveLength(2);
    expect(t[0]).toBeCloseTo(0.75);
    expect(t[1]).toBeCloseTo(1.75);
  });

  it("geçersiz süre için boş dizi", () => {
    expect(pickTimestamps(0)).toEqual([]);
    expect(pickTimestamps(NaN)).toEqual([]);
    expect(pickTimestamps(-5)).toEqual([]);
    expect(pickTimestamps(Infinity)).toEqual([]);
  });
});

describe("isNearDuplicate", () => {
  const N = FINGERPRINT_SIZE * FINGERPRINT_SIZE;

  it("aynı dizi için true", () => {
    const a = new Uint8Array(N).map((_, i) => i % 256);
    expect(isNearDuplicate(a, a.slice())).toBe(true);
  });

  it("tamamen farklı diziler için false", () => {
    expect(isNearDuplicate(new Uint8Array(N), new Uint8Array(N).fill(255))).toBe(false);
  });

  it("eşiğin hemen altı true, hemen üstü false", () => {
    const a = new Uint8Array(N);
    // 5/255 ≈ 0.0196 ≤ 0.02 ; 6/255 ≈ 0.0235 > 0.02
    expect(isNearDuplicate(a, new Uint8Array(N).fill(5))).toBe(true);
    expect(isNearDuplicate(a, new Uint8Array(N).fill(6))).toBe(false);
  });

  it("özel eşik kullanılabilir", () => {
    const a = new Uint8Array(N);
    expect(isNearDuplicate(a, new Uint8Array(N).fill(6), 0.05)).toBe(true);
  });

  it("uzunlukları farklı ya da boş diziler eş sayılmaz", () => {
    expect(isNearDuplicate(new Uint8Array(N), new Uint8Array(N - 1))).toBe(false);
    expect(isNearDuplicate(new Uint8Array(0), new Uint8Array(0))).toBe(false);
  });
});

describe("grayFingerprint", () => {
  it("RGBA görüntüyü 32×32 gri parmak izine indirger", () => {
    const w = 64;
    const h = 64;
    const rgba = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      rgba[i * 4] = 255;
      rgba[i * 4 + 1] = 255;
      rgba[i * 4 + 2] = 255;
      rgba[i * 4 + 3] = 255;
    }
    const fp = grayFingerprint(rgba, w, h);
    expect(fp).toHaveLength(32 * 32);
    expect(fp.every((v) => v === 255)).toBe(true);
  });

  it("sol yarı siyah, sağ yarı beyaz görüntüyü korur", () => {
    const w = 100;
    const h = 50;
    const rgba = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const v = x < w / 2 ? 0 : 255;
        const o = (y * w + x) * 4;
        rgba[o] = rgba[o + 1] = rgba[o + 2] = v;
        rgba[o + 3] = 255;
      }
    const fp = grayFingerprint(rgba, w, h);
    expect(fp[0]).toBe(0);
    expect(fp[31]).toBe(255);
    expect(fp[31 * 32]).toBe(0);
  });
});

describe("fitSize", () => {
  it("dikey 1080×1920 videoyu uzun kenar 768 olacak şekilde küçültür", () => {
    expect(fitSize(1080, 1920)).toEqual({ w: 432, h: 768 });
  });

  it("yatay görüntüyü de küçültür", () => {
    expect(fitSize(1920, 1080)).toEqual({ w: 768, h: 432 });
  });

  it("küçük resmi büyütmez", () => {
    expect(fitSize(300, 200)).toEqual({ w: 300, h: 200 });
    expect(fitSize(768, 500)).toEqual({ w: 768, h: 500 });
  });

  it("özel sınır kabul eder", () => {
    expect(fitSize(1000, 500, 100)).toEqual({ w: 100, h: 50 });
  });
});
