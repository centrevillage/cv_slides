import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inflateSync } from 'node:zlib';
import { ImageEmbedder, bmpToPng, decodeBmp, type ReadFile } from '../build/assets.ts';

function reader(files: Record<string, Uint8Array>): ReadFile & { reads: string[] } {
  const reads: string[] = [];
  const fn = (p: string) => {
    reads.push(p);
    return files[p] ?? null;
  };
  return Object.assign(fn, { reads });
}

test('embeds images as data URIs with the right MIME type', () => {
  const files = {
    '/d/a.png': new Uint8Array([1, 2, 3]),
    '/d/img/b.svg': new TextEncoder().encode('<svg/>'),
    '/d/c.JPG': new Uint8Array([4]),
    '/d/d.webp': new Uint8Array([5]),
    '/d/e.gif': new Uint8Array([6]),
  };
  const e = new ImageEmbedder({ baseDir: '/d', readFile: reader(files) });
  assert.deepEqual(e.embed('a.png'), { uri: 'data:image/png;base64,AQID', warnings: [] });
  assert.equal(e.embed('img/b.svg').uri, 'data:image/svg+xml;base64,PHN2Zy8+');
  assert.equal(e.embed('c.JPG').uri, 'data:image/jpeg;base64,BA==');
  assert.equal(e.embed('d.webp').uri, 'data:image/webp;base64,BQ==');
  assert.equal(e.embed('e.gif').uri, 'data:image/gif;base64,Bg==');
});

test('missing, remote and unsupported images give a warning and no URI', () => {
  const e = new ImageEmbedder({ baseDir: '/d', readFile: reader({ '/d/x.tiff': new Uint8Array([1]) }) });
  const missing = e.embed('img/none.png');
  assert.equal(missing.uri, null);
  assert.match(missing.warnings[0] ?? '', /見つかりません: img\/none\.png/);
  // repeated references repeat the "missing" warning (each reference has its own line)
  assert.equal(e.embed('img/none.png').warnings.length, 1);

  for (const src of ['https://example.com/a.png', 'http://example.com/a.png', '//cdn/a.png']) {
    const r = e.embed(src);
    assert.equal(r.uri, null);
    assert.match(r.warnings[0] ?? '', /URL指定の画像/);
  }
  const tiff = e.embed('x.tiff');
  assert.equal(tiff.uri, null);
  assert.match(tiff.warnings[0] ?? '', /未対応の画像形式/);
  assert.equal(e.embed('file:///etc/passwd.png').uri, null);
});

test('images over the size limit are embedded with a warning (once per file)', () => {
  const read = reader({ '/d/big.png': new Uint8Array(11) });
  const e = new ImageEmbedder({ baseDir: '/d', readFile: read, maxBytes: 10 });
  const first = e.embed('big.png');
  assert.ok(first.uri?.startsWith('data:image/png;base64,'));
  assert.equal(first.warnings.length, 1);
  assert.match(first.warnings[0] ?? '', /を超えています/);
  const second = e.embed('./big.png');
  assert.equal(second.uri, first.uri);
  assert.deepEqual(second.warnings, []);
  assert.equal(read.reads.length, 1); // cached
});

// --- BMP -------------------------------------------------------------------

interface BmpSpec {
  width: number;
  height: number;
  bpp: 24 | 32;
  topDown?: boolean;
  bitfields?: boolean;
  alpha?: boolean;
  compression?: number;
  /** RGBA pixel at (x, y) in top-down order. */
  pixel: (x: number, y: number) => [number, number, number, number];
}

/** Builds a BMP in memory (BITMAPINFOHEADER, or BITMAPV4HEADER for bitfields). */
function makeBmp(spec: BmpSpec): Uint8Array {
  const headerSize = spec.bitfields ? 108 : 40;
  const stride = Math.floor((spec.bpp * spec.width + 31) / 32) * 4;
  const dataOffset = 14 + headerSize;
  const buf = Buffer.alloc(dataOffset + stride * spec.height, 0xcc); // padding bytes are garbage on purpose
  buf.write('BM', 0, 'ascii');
  buf.writeUInt32LE(buf.length, 2);
  buf.writeUInt32LE(0, 6);
  buf.writeUInt32LE(dataOffset, 10);
  buf.fill(0, 14, dataOffset);
  buf.writeUInt32LE(headerSize, 14);
  buf.writeInt32LE(spec.width, 18);
  buf.writeInt32LE(spec.topDown ? -spec.height : spec.height, 22);
  buf.writeUInt16LE(1, 26);
  buf.writeUInt16LE(spec.bpp, 28);
  buf.writeUInt32LE(spec.compression ?? (spec.bitfields ? 3 : 0), 30);
  if (spec.bitfields) {
    buf.writeUInt32LE(0x00ff0000, 54);
    buf.writeUInt32LE(0x0000ff00, 58);
    buf.writeUInt32LE(0x000000ff, 62);
    buf.writeUInt32LE(spec.alpha ? 0xff000000 : 0, 66);
  }
  for (let y = 0; y < spec.height; y++) {
    const row = dataOffset + (spec.topDown ? y : spec.height - 1 - y) * stride;
    for (let x = 0; x < spec.width; x++) {
      const [r, g, b, a] = spec.pixel(x, y);
      const o = row + x * (spec.bpp / 8);
      buf[o] = b;
      buf[o + 1] = g;
      buf[o + 2] = r;
      if (spec.bpp === 32) buf[o + 3] = a;
    }
  }
  return buf;
}

/** Minimal PNG decoder for the encoder's output (8-bit RGB/RGBA, filter 0, single IDAT). */
function decodePng(png: Uint8Array): { width: number; height: number; colorType: number; pixels: number[][] } {
  const buf = Buffer.from(png);
  assert.deepEqual([...buf.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  let pos = 8;
  let width = 0;
  let height = 0;
  let colorType = 0;
  const idat: Buffer[] = [];
  const types: string[] = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    types.push(type);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      assert.equal(data[8], 8);
      colorType = data[9] ?? 0;
    } else if (type === 'IDAT') {
      idat.push(data);
    }
    pos += 12 + len;
  }
  assert.deepEqual(types, ['IHDR', 'IDAT', 'IEND']);
  const raw = inflateSync(Buffer.concat(idat));
  const channels = colorType === 6 ? 4 : 3;
  const pixels: number[][] = [];
  for (let y = 0; y < height; y++) {
    const o = y * (width * channels + 1);
    assert.equal(raw[o], 0);
    for (let x = 0; x < width; x++) {
      const p = [...raw.subarray(o + 1 + x * channels, o + 1 + (x + 1) * channels)];
      pixels.push(channels === 3 ? [...p, 255] : p);
    }
  }
  return { width, height, colorType, pixels };
}

const pattern = (x: number, y: number): [number, number, number, number] => [
  (x * 40) & 255,
  (y * 60) & 255,
  (x * y * 7 + 3) & 255,
  (x + y) % 2 === 0 ? 255 : 128,
];

function expected(width: number, height: number, alpha: boolean): number[][] {
  const out: number[][] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = pattern(x, y);
      out.push([r, g, b, alpha ? a : 255]);
    }
  }
  return out;
}

test('BMP -> PNG: 24-bit bottom-up with row padding', () => {
  const bmp = makeBmp({ width: 3, height: 2, bpp: 24, pixel: pattern });
  const png = decodePng(bmpToPng(bmp));
  assert.equal(png.width, 3);
  assert.equal(png.height, 2);
  assert.equal(png.colorType, 2);
  assert.deepEqual(png.pixels, expected(3, 2, false));
});

test('BMP -> PNG: 24-bit top-down', () => {
  const bmp = makeBmp({ width: 5, height: 4, bpp: 24, topDown: true, pixel: pattern });
  assert.deepEqual(decodePng(bmpToPng(bmp)).pixels, expected(5, 4, false));
});

test('BMP -> PNG: 32-bit BI_RGB ignores the unused byte', () => {
  const bmp = makeBmp({ width: 4, height: 3, bpp: 32, pixel: pattern });
  const png = decodePng(bmpToPng(bmp));
  assert.equal(png.colorType, 2);
  assert.deepEqual(png.pixels, expected(4, 3, false));
});

test('BMP -> PNG: 32-bit BI_BITFIELDS with alpha, top-down', () => {
  const bmp = makeBmp({ width: 4, height: 3, bpp: 32, bitfields: true, alpha: true, topDown: true, pixel: pattern });
  const png = decodePng(bmpToPng(bmp));
  assert.equal(png.colorType, 6);
  assert.deepEqual(png.pixels, expected(4, 3, true));
});

test('BMP -> PNG output is deterministic', () => {
  const bmp = makeBmp({ width: 7, height: 5, bpp: 24, pixel: pattern });
  assert.deepEqual(bmpToPng(bmp), bmpToPng(bmp));
});

test('unsupported BMP variants throw; the embedder embeds them as-is with a warning', () => {
  const rle = makeBmp({ width: 2, height: 2, bpp: 24, compression: 1, pixel: pattern });
  assert.throws(() => decodeBmp(rle), /圧縮形式/);
  const truncated = makeBmp({ width: 2, height: 2, bpp: 24, pixel: pattern }).subarray(0, 60);
  assert.throws(() => decodeBmp(truncated), /途中で切れています/);
  assert.throws(() => decodeBmp(new Uint8Array(60)), /BMP ではありません/);

  const e = new ImageEmbedder({ baseDir: '/d', readFile: reader({ '/d/rle.bmp': rle, '/d/ok.bmp': makeBmp({ width: 1, height: 1, bpp: 24, pixel: pattern }) }) });
  const r = e.embed('rle.bmp');
  assert.ok(r.uri?.startsWith('data:image/bmp;base64,'));
  assert.equal(r.warnings.length, 1);
  assert.match(r.warnings[0] ?? '', /そのまま埋め込みます/);
  const ok = e.embed('ok.bmp');
  assert.ok(ok.uri?.startsWith('data:image/png;base64,iVBORw0KGgo'));
  assert.deepEqual(ok.warnings, []);
});
