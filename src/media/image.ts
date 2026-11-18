import { FRAME_MAX_SIDE } from "../config";

/** JPEG kalitesi (kareler ve fotoğraflar için ortak). */
export const JPEG_QUALITY = 0.8;

/**
 * Uzun kenarı `maxSide`'ı aşmayacak şekilde en-boy oranını koruyarak küçültür.
 * Küçük görüntüleri büyütmez. Küçültülen sonuç tam sayıdır ve en az 1 pikseldir.
 */
export function fitSize(w: number, h: number, maxSide = FRAME_MAX_SIDE): { w: number; h: number } {
  const long = Math.max(w, h);
  if (!(long > maxSide)) return { w, h };
  const scale = maxSide / long;
  return {
    w: Math.max(1, Math.round(w * scale)),
    h: Math.max(1, Math.round(h * scale)),
  };
}

/** Canvas içeriğini JPEG Blob'a çevirir. */
export function canvasToJpeg(canvas: HTMLCanvasElement, quality = JPEG_QUALITY): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Görüntü JPEG biçimine dönüştürülemedi."))),
      "image/jpeg",
      quality,
    );
  });
}

type Drawable = { source: CanvasImageSource; width: number; height: number; close(): void };

async function loadDrawable(file: Blob): Promise<Drawable> {
  if (typeof createImageBitmap === "function") {
    try {
      const bmp = await createImageBitmap(file);
      return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() };
    } catch {
      // Bazı biçimlerde createImageBitmap başarısız olabilir; <img> ile dene.
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () =>
        reject(new Error("Fotoğraf açılamadı. Dosya bozuk ya da desteklenmeyen bir biçimde olabilir."));
      img.src = url;
    });
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => {} };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Fotoğrafı uzun kenarı `FRAME_MAX_SIDE`'ı aşmayan JPEG'e çevirir (yalnız tarayıcı). */
export async function preparePhoto(file: Blob): Promise<Blob> {
  const img = await loadDrawable(file);
  try {
    if (!img.width || !img.height) throw new Error("Fotoğrafın boyutu okunamadı.");
    const { w, h } = fitSize(img.width, img.height);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Tarayıcı görüntü çizmeyi desteklemiyor.");
    ctx.drawImage(img.source, 0, 0, w, h);
    return await canvasToJpeg(canvas);
  } finally {
    img.close();
  }
}
