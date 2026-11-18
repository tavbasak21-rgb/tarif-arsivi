// Tarif Arşivi simgelerini (tencere) paket kullanmadan çizer ve PNG olarak yazar.
// Kullanım: node scripts/make-icons.mjs
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const BG = [0xc2, 0x41, 0x0c]; // turuncu-kiremit arka plan (tema rengi)
const POT = [0xff, 0xf7, 0xed]; // krem tencere
const STEAM = [0xfd, 0xba, 0x74]; // açık turuncu buhar

// CRC32 (PNG parçaları için)
const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function encodePng(size, rgb) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit derinliği
  ihdr[9] = 2; // RGB
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0; // filtre yok
    rgb.copy(raw, y * (size * 3 + 1) + 1, y * size * 3, (y + 1) * size * 3);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// Koordinatlar 0–1 aralığında; tencere, maskable güvenli alan (ortadaki %80) içinde kalır.
function colorAt(x, y) {
  // Gövde: yuvarlatılmış alt köşeli dikdörtgen
  const bodyL = 0.25, bodyR = 0.75, bodyT = 0.45, bodyB = 0.72, r = 0.08;
  const inBody = (() => {
    if (x < bodyL || x > bodyR || y < bodyT || y > bodyB) return false;
    if (y > bodyB - r) {
      const cx = x < bodyL + r ? bodyL + r : x > bodyR - r ? bodyR - r : x;
      return (x - cx) ** 2 + (y - (bodyB - r)) ** 2 <= r * r;
    }
    return true;
  })();
  // Kenar (ağız) şeridi
  const inRim = x >= 0.21 && x <= 0.79 && y >= 0.405 && y <= 0.45;
  // Kulplar
  const inHandles = y >= 0.48 && y <= 0.53 && ((x >= 0.17 && x < 0.25) || (x > 0.75 && x <= 0.83));
  // Kapak tutamağı
  const inKnob = x >= 0.46 && x <= 0.54 && y >= 0.37 && y < 0.405;
  if (inBody || inRim || inHandles || inKnob) return POT;
  // Buhar: üç dalgalı çizgi
  for (const sx of [0.38, 0.5, 0.62]) {
    if (y >= 0.2 && y <= 0.33) {
      const wx = sx + 0.02 * Math.sin((y - 0.2) * 48);
      if (Math.abs(x - wx) <= 0.014) return STEAM;
    }
  }
  return BG;
}

function drawIcon(size) {
  const rgb = Buffer.alloc(size * size * 3);
  const ss = 4; // kenar yumuşatma için alt örnekleme
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let rs = 0, gs = 0, bs = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const c = colorAt((px + (sx + 0.5) / ss) / size, (py + (sy + 0.5) / ss) / size);
          rs += c[0]; gs += c[1]; bs += c[2];
        }
      }
      const i = (py * size + px) * 3;
      rgb[i] = Math.round(rs / (ss * ss));
      rgb[i + 1] = Math.round(gs / (ss * ss));
      rgb[i + 2] = Math.round(bs / (ss * ss));
    }
  }
  return encodePng(size, rgb);
}

const publicDir = fileURLToPath(new URL("../public/", import.meta.url));
mkdirSync(publicDir, { recursive: true });
for (const [name, size] of [["icon-192.png", 192], ["icon-512.png", 512], ["apple-touch-icon.png", 180]]) {
  writeFileSync(publicDir + name, drawIcon(size));
  console.log(`yazıldı: public/${name} (${size}×${size})`);
}
