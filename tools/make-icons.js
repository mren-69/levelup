// アプリのアイコン(PNG)を生成する: 黒地に青い光の輪と、金の上向き矢印(レベルアップ)。
// 使い方: node tools/make-icons.js
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, pixel) {
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b] = pixel(x / size, y / size);
      const i = y * (size * 3 + 1) + 1 + x * 3;
      raw[i] = r; raw[i + 1] = g; raw[i + 2] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * Math.max(0, Math.min(1, t))));
const smooth = (d, w) => Math.max(0, Math.min(1, 0.5 - d / w));

// 上向きの山形(シェブロン)までの距離: 2本の線分の太さで判定
function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
const chevron = (x, y, top) => Math.min(segDist(x, y, 0.28, top + 0.2, 0.5, top), segDist(x, y, 0.5, top, 0.72, top + 0.2));

function pixel(x, y) {
  const r = Math.hypot(x - 0.5, y - 0.5);
  let c = mix([22, 52, 104], [3, 5, 11], r / 0.6); // 背景
  const ring = Math.abs(r - 0.4);
  c = mix(c, [79, 209, 255], Math.exp(-ring * ring / 0.0009) * 0.9); // 青い輪の光
  const s = 1 / 400;
  for (const [top, gold] of [[0.25, [255, 236, 170]], [0.45, [246, 196, 83]]]) {
    const d = chevron(x, y, top) - 0.055;
    c = mix(c, [246, 196, 83], Math.exp(-Math.max(0, d) * 60) * 0.35); // 金の光
    c = mix(c, mix(gold, [184, 134, 11], (y - top) / 0.25), smooth(d, s * 1.5));
  }
  return c;
}

mkdirSync(new URL('../icons/', import.meta.url), { recursive: true });
for (const size of [180, 512]) {
  writeFileSync(new URL(`../icons/icon-${size}.png`, import.meta.url), png(size, pixel));
}
console.log('icons written');
