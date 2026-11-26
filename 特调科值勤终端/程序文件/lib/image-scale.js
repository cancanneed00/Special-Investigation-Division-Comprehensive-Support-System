// 轻量 PNG 裁剪 + 最近邻放大，用于把游戏里的小字号数字局部放大后交给 OCR，
// 显著提升 det/rec 对小字的识别置信度。仅支持 MAA 后台截图格式：8-bit RGB、非隔行。
const zlib = require("zlib");

// ---- CRC32 (PNG chunk 校验必需) ----
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const head = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(head), 0);
  return Buffer.concat([len, head, crc]);
}

// 解码 8-bit RGB 非隔行 PNG，返回 { width, height, data(RGB), bpp }
function decodePNG(buf) {
  if (buf.length < 24 || buf.toString("ascii", 1, 4) !== "PNG") throw new Error("不是有效 PNG");
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  const bitDepth = buf[24];
  const colorType = buf[25];
  const interlace = buf[28];
  if (interlace !== 0) throw new Error("不支持隔行扫描 PNG");
  if (bitDepth !== 8 || colorType !== 2) throw new Error(`不支持的 PNG 格式 ${colorType}/${bitDepth}`);

  const bpp = 3; // RGB
  const idat = [];
  let pos = 8;
  while (pos + 8 <= buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString("ascii", pos + 4, pos + 8);
    const data = buf.slice(pos + 8, pos + 8 + len);
    if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    pos += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * bpp;
  const out = Buffer.alloc(height * stride);
  let src = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[src++];
    const rowStart = y * stride;
    for (let x = 0; x < stride; x++) {
      const cur = raw[src++];
      const left = x >= bpp ? out[rowStart + x - bpp] : 0;
      const up = y > 0 ? out[rowStart - stride + x] : 0;
      const ul = y > 0 && x >= bpp ? out[rowStart - stride + x - bpp] : 0;
      let val;
      switch (filter) {
        case 0: val = cur; break;
        case 1: val = cur + left; break;
        case 2: val = cur + up; break;
        case 3: val = cur + ((left + up) >> 1); break;
        case 4: val = cur + paeth(left, up, ul); break;
        default: throw new Error(`非法 filter ${filter}`);
      }
      out[rowStart + x] = val & 0xff;
    }
  }
  return { width, height, data: out, bpp };
}

// 编码 8-bit RGB 非隔行 PNG（filter 0），返回 Buffer
function encodePNG(img) {
  const { width, height, data, bpp } = img;
  const stride = width * bpp;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    data.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 2;   // color type RGB
  ihdr[10] = 0;  // compression
  ihdr[11] = 0;  // filter
  ihdr[12] = 0;  // interlace
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/**
 * 从整帧 PNG 中裁出 roi=[x,y,w,h] 区域并最近邻放大 scale 倍。
 * @param {Buffer} pngBuffer 整帧 PNG
 * @param {number[]} roi [x, y, w, h]
 * @param {number} scale 放大倍数（正整数）
 * @returns {{ buffer: Buffer, width: number, height: number }} 放大后的 PNG 及尺寸
 */
function cropScale(pngBuffer, roi, scale) {
  const src = decodePNG(pngBuffer);
  let [rx, ry, rw, rh] = roi;
  rx = Math.max(0, Math.floor(rx));
  ry = Math.max(0, Math.floor(ry));
  rw = Math.max(1, Math.min(Math.ceil(rw), src.width - rx));
  rh = Math.max(1, Math.min(Math.ceil(rh), src.height - ry));
  const sw = rw * scale;
  const sh = rh * scale;
  const out = Buffer.alloc(sw * sh * src.bpp);
  for (let y = 0; y < sh; y++) {
    const sy = ry + ((y / scale) | 0);
    const srcRow = sy * src.width * src.bpp;
    const dstRow = y * sw * src.bpp;
    for (let x = 0; x < sw; x++) {
      const sx = rx + ((x / scale) | 0);
      const si = srcRow + sx * src.bpp;
      const di = dstRow + x * src.bpp;
      out[di] = src.data[si];
      out[di + 1] = src.data[si + 1];
      out[di + 2] = src.data[si + 2];
    }
  }
  const img = { width: sw, height: sh, data: out, bpp: src.bpp };
  return { buffer: encodePNG(img), width: sw, height: sh };
}

module.exports = { cropScale, decodePNG, encodePNG };
