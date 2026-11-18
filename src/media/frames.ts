import { DEDUPE_THRESHOLD, FRAME_INTERVAL_SEC, FRAME_MAX_SIDE, MAX_FRAMES } from "../config";
import { canvasToJpeg, fitSize } from "./image";

/** Parmak izinin kenar uzunluğu (32×32 gri). */
export const FINGERPRINT_SIZE = 32;

const METADATA_TIMEOUT_MS = 15_000;
const SEEK_TIMEOUT_MS = 10_000;

/**
 * Videodan alınacak kare zamanlarını (saniye) verir.
 * Aralık sayısı n = ceil(süre / aralık). n ≤ max ise her aralığın ortası
 * (son yarım aralık süreyle kırpılır); n > max ise süre max eşit parçaya
 * bölünüp parça ortaları verilir. Geçersiz süre için boş dizi.
 */
export function pickTimestamps(
  durationSec: number,
  intervalSec = FRAME_INTERVAL_SEC,
  max = MAX_FRAMES,
): number[] {
  if (!Number.isFinite(durationSec) || durationSec <= 0) return [];
  if (!Number.isFinite(intervalSec) || intervalSec <= 0 || !(max >= 1)) return [];
  const n = Math.ceil(durationSec / intervalSec);
  const out: number[] = [];
  if (n <= max) {
    for (let i = 0; i < n; i++) {
      const start = i * intervalSec;
      const end = Math.min(start + intervalSec, durationSec);
      out.push((start + end) / 2);
    }
  } else {
    const count = Math.floor(max);
    const seg = durationSec / count;
    for (let i = 0; i < count; i++) out.push((i + 0.5) * seg);
  }
  return out;
}

/**
 * RGBA piksel dizisini `size`×`size` (varsayılan 32×32) gri parmak izine
 * indirger (alan ortalaması). `rgba` uzunluğu `width * height * 4` olmalıdır.
 */
export function grayFingerprint(
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  size = FINGERPRINT_SIZE,
): Uint8Array {
  const out = new Uint8Array(size * size);
  for (let cy = 0; cy < size; cy++) {
    const y0 = Math.floor((cy * height) / size);
    const y1 = Math.min(height, Math.max(y0 + 1, Math.floor(((cy + 1) * height) / size)));
    for (let cx = 0; cx < size; cx++) {
      const x0 = Math.floor((cx * width) / size);
      const x1 = Math.min(width, Math.max(x0 + 1, Math.floor(((cx + 1) * width) / size)));
      let sum = 0;
      let count = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const o = (y * width + x) * 4;
          sum += 0.299 * rgba[o] + 0.587 * rgba[o + 1] + 0.114 * rgba[o + 2];
          count++;
        }
      }
      out[cy * size + cx] = count ? Math.round(sum / count) : 0;
    }
  }
  return out;
}

/** İki parmak izinin ortalama mutlak farkı / 255 ≤ eşik ise true. */
export function isNearDuplicate(a: Uint8Array, b: Uint8Array, threshold = DEDUPE_THRESHOLD): boolean {
  if (a.length === 0 || a.length !== b.length) return false;
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i]);
  return sum / a.length / 255 <= threshold;
}

function waitForEvent(
  video: HTMLVideoElement,
  event: "loadedmetadata" | "seeked",
  timeoutMs: number,
  timeoutMsg: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      video.removeEventListener(event, onOk);
      video.removeEventListener("error", onErr);
    };
    const onOk = () => {
      cleanup();
      resolve();
    };
    const onErr = () => {
      cleanup();
      reject(new Error("Video açılamadı. Dosya bozuk ya da desteklenmeyen bir biçimde olabilir."));
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(timeoutMsg));
    }, timeoutMs);
    video.addEventListener(event, onOk);
    video.addEventListener("error", onErr);
  });
}

function context2d(canvas: HTMLCanvasElement, willReadFrequently = false): CanvasRenderingContext2D {
  const ctx = canvas.getContext("2d", { willReadFrequently });
  if (!ctx) throw new Error("Tarayıcı görüntü çizmeyi desteklemiyor.");
  return ctx;
}

/**
 * Videodan kareler çıkarır (yalnız tarayıcı; jsdom'da test edilmez).
 * Önceki kabul edilen kareyle neredeyse aynı olan kareler atlanır.
 * Kapak, ilk kabul edilen karedir.
 */
export async function extractVideoFrames(file: Blob): Promise<{ frames: Blob[]; cover: Blob }> {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.setAttribute("muted", "");
  video.setAttribute("playsinline", "");
  video.preload = "auto";
  try {
    const loaded = waitForEvent(
      video,
      "loadedmetadata",
      METADATA_TIMEOUT_MS,
      "Video yüklenirken zaman aşımı oldu. Lütfen tekrar deneyin.",
    );
    video.src = url;
    video.load();
    await loaded;

    const times = pickTimestamps(video.duration);
    if (times.length === 0) throw new Error("Videonun süresi okunamadı.");
    if (!video.videoWidth || !video.videoHeight) throw new Error("Videonun görüntü boyutu okunamadı.");

    const { w, h } = fitSize(video.videoWidth, video.videoHeight, FRAME_MAX_SIDE);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = context2d(canvas);

    const fpCanvas = document.createElement("canvas");
    fpCanvas.width = FINGERPRINT_SIZE;
    fpCanvas.height = FINGERPRINT_SIZE;
    const fpCtx = context2d(fpCanvas, true);

    const frames: Blob[] = [];
    let lastFp: Uint8Array | null = null;

    for (const t of times) {
      const seeked = waitForEvent(
        video,
        "seeked",
        SEEK_TIMEOUT_MS,
        "Videoda ilerlerken zaman aşımı oldu. Lütfen tekrar deneyin.",
      );
      video.currentTime = t;
      await seeked;

      ctx.drawImage(video, 0, 0, w, h);
      fpCtx.drawImage(canvas, 0, 0, FINGERPRINT_SIZE, FINGERPRINT_SIZE);
      const fp = grayFingerprint(
        fpCtx.getImageData(0, 0, FINGERPRINT_SIZE, FINGERPRINT_SIZE).data,
        FINGERPRINT_SIZE,
        FINGERPRINT_SIZE,
      );
      if (lastFp && isNearDuplicate(lastFp, fp)) continue;
      lastFp = fp;
      frames.push(await canvasToJpeg(canvas));
    }

    if (frames.length === 0) throw new Error("Videodan kare alınamadı.");
    return { frames, cover: frames[0] };
  } finally {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}
