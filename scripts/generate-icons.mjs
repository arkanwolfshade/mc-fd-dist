// Writes the app icons, with no image dependencies: a white card on a green square.
// Run once with `node scripts/generate-icons.mjs`. The results are committed.
import { mkdirSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

const GREEN = [27, 110, 60];
const WHITE = [255, 255, 255];

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const name = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, crc]);
}

function png(size) {
  const margin = Math.round(size * 0.22);
  const lineHeight = Math.max(2, Math.round(size * 0.05));
  const rows = [];
  for (let y = 0; y < size; y++) {
    const row = [0];
    for (let x = 0; x < size; x++) {
      const onCard = x >= margin && x < size - margin && y >= margin && y < size - margin;
      const lineOffset = y - margin - Math.round(size * 0.12);
      const onLine =
        x >= margin + lineHeight * 2 &&
        x < size - margin - lineHeight * 2 &&
        lineOffset >= 0 &&
        lineOffset % (lineHeight * 3) < lineHeight &&
        y < size - margin - lineHeight * 2;
      row.push(...(onCard && !onLine ? WHITE : GREEN));
    }
    rows.push(Buffer.from(row));
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // RGB

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(Buffer.concat(rows))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

mkdirSync("client/public/icons", { recursive: true });
for (const size of [180, 192, 512]) {
  writeFileSync(`client/public/icons/icon-${size}.png`, png(size));
}
