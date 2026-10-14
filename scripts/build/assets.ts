import { readFileSync } from 'node:fs';
import path from 'node:path';
import { crc32, deflateSync } from 'node:zlib';

// ---------------------------------------------------------------------------
// Image embedding (DETAILED_SPEC.md 3.2, 4.7)
// ---------------------------------------------------------------------------

/** Images larger than this (after BMP conversion) produce a warning. */
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

const MIME_TYPES: Readonly<Record<string, string>> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
};

/** Reads a file; returns null when it does not exist. */
export type ReadFile = (absPath: string) => Uint8Array | null;

export function readFileOrNull(absPath: string): Uint8Array | null {
  try {
    return readFileSync(absPath);
  } catch (e) {
    const code = (e as { code?: unknown }).code;
    if (code === 'ENOENT' || code === 'ENOTDIR' || code === 'EISDIR') return null;
    throw e;
  }
}

export interface EmbedResult {
  /** data: URI, or null when the image cannot be embedded (show a placeholder). */
  uri: string | null;
  /** Warnings to report at the reference. */
  warnings: string[];
}

export interface ImageEmbedderOptions {
  /** Directory of the .md file; image paths are relative to it. */
  baseDir: string;
  readFile?: ReadFile;
  maxBytes?: number;
}

export function formatBytes(n: number): string {
  return `${(n / 1024 / 1024).toFixed(1)}MB`;
}

export class ImageEmbedder {
  readonly #baseDir: string;
  readonly #readFile: ReadFile;
  readonly #maxBytes: number;
  readonly #cache = new Map<string, EmbedResult>();

  constructor(opts: ImageEmbedderOptions) {
    this.#baseDir = opts.baseDir;
    this.#readFile = opts.readFile ?? readFileOrNull;
    this.#maxBytes = opts.maxBytes ?? MAX_IMAGE_BYTES;
  }

  /** Resolves an image reference (as written in the Markdown, already URL-decoded). */
  embed(src: string): EmbedResult {
    const ref = src.trim();
    if (ref === '') return { uri: null, warnings: ['画像のパスが空です'] };
    if (/^data:image\//i.test(ref)) return { uri: ref, warnings: [] };
    if (/^(https?:)?\/\//i.test(ref)) {
      return { uri: null, warnings: [`URL指定の画像は使えません(出力HTMLは外部リソースを参照しません): ${ref}`] };
    }
    if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(ref) && !/^[A-Za-z]:[\\/]/.test(ref)) {
      return { uri: null, warnings: [`画像のパスにはファイルの相対パスを指定してください: ${ref}`] };
    }
    const file = path.resolve(this.#baseDir, ref.replace(/[?#].*$/, ''));
    const cached = this.#cache.get(file);
    // Later references reuse the result; only "missing" warnings are repeated per reference.
    if (cached) return cached.uri === null ? cached : { uri: cached.uri, warnings: [] };
    const result = this.#load(file, ref);
    this.#cache.set(file, result);
    return result;
  }

  #load(file: string, ref: string): EmbedResult {
    const ext = path.extname(file).toLowerCase();
    let mime = MIME_TYPES[ext];
    if (mime === undefined) {
      return {
        uri: null,
        warnings: [`未対応の画像形式です: ${ref}(jpg / jpeg / png / gif / svg / webp / bmp を使えます)`],
      };
    }
    const data = this.#readFile(file);
    if (data === null) return { uri: null, warnings: [`画像ファイルが見つかりません: ${ref}`] };

    const warnings: string[] = [];
    let bytes: Uint8Array = data;
    if (ext === '.bmp') {
      try {
        bytes = bmpToPng(data);
        mime = 'image/png';
      } catch (e) {
        const reason = e instanceof Error ? e.message : String(e);
        warnings.push(`BMP を PNG に変換できないため、そのまま埋め込みます: ${ref}(${reason})`);
      }
    }
    if (bytes.length > this.#maxBytes) {
      warnings.push(
        `画像が ${formatBytes(this.#maxBytes)} を超えています(${formatBytes(bytes.length)}): ${ref}。事前に縮小してください(例: sips -Z 1920 ${path.basename(file)})`,
      );
    }
    return { uri: `data:${mime};base64,${Buffer.from(bytes).toString('base64')}`, warnings };
  }
}

// ---------------------------------------------------------------------------
// BMP -> PNG (DETAILED_SPEC.md 4.7, Q18): uncompressed 24/32-bit only, no dependency
// ---------------------------------------------------------------------------

const BI_RGB = 0;
const BI_BITFIELDS = 3;
const MAX_PIXELS = 64 * 1024 * 1024;

export interface RgbaImage {
  width: number;
  height: number;
  /** Row-major, top-down RGBA. */
  pixels: Uint8Array;
  hasAlpha: boolean;
}

/** Decodes an uncompressed 24-bit or 32-bit BMP. Throws on anything else. */
export function decodeBmp(data: Uint8Array): RgbaImage {
  if (data.length < 54 || data[0] !== 0x42 || data[1] !== 0x4d) throw new Error('BMP ではありません');
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const dataOffset = view.getUint32(10, true);
  const headerSize = view.getUint32(14, true);
  if (headerSize < 40) throw new Error('古い形式の BMP ヘッダには対応していません');
  const width = view.getInt32(18, true);
  const rawHeight = view.getInt32(22, true);
  const bpp = view.getUint16(28, true);
  const compression = view.getUint32(30, true);
  const topDown = rawHeight < 0;
  const height = Math.abs(rawHeight);
  if (width <= 0 || height === 0 || width * height > MAX_PIXELS) throw new Error('画像サイズが不正です');

  let masks: [number, number, number, number] | null = null;
  if (compression === BI_RGB) {
    if (bpp !== 24 && bpp !== 32) throw new Error(`${bpp}bit の BMP には対応していません`);
  } else if (compression === BI_BITFIELDS && bpp === 32) {
    if (data.length < 66) throw new Error('BMP のヘッダが途中で切れています');
    const alphaMask = headerSize >= 56 && data.length >= 70 ? view.getUint32(66, true) : 0;
    masks = [view.getUint32(54, true), view.getUint32(58, true), view.getUint32(62, true), alphaMask];
    const standard = masks[0] === 0x00ff0000 && masks[1] === 0x0000ff00 && masks[2] === 0x000000ff;
    if (!standard || (alphaMask !== 0 && alphaMask !== 0xff000000)) {
      throw new Error('標準以外のビットマスクの BMP には対応していません');
    }
  } else {
    throw new Error('圧縮形式の BMP には対応していません');
  }

  const bytesPerPixel = bpp / 8;
  const stride = Math.floor((bpp * width + 31) / 32) * 4;
  if (dataOffset + stride * height > data.length) throw new Error('BMP の画素データが途中で切れています');

  const hasAlpha = masks !== null && masks[3] === 0xff000000;
  const pixels = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    const srcRow = dataOffset + (topDown ? y : height - 1 - y) * stride;
    for (let x = 0; x < width; x++) {
      const s = srcRow + x * bytesPerPixel;
      const d = (y * width + x) * 4;
      pixels[d] = data[s + 2] ?? 0;
      pixels[d + 1] = data[s + 1] ?? 0;
      pixels[d + 2] = data[s] ?? 0;
      pixels[d + 3] = hasAlpha ? (data[s + 3] ?? 255) : 255;
    }
  }
  return { width, height, pixels, hasAlpha };
}

function pngChunk(type: string, payload: Uint8Array): Buffer {
  const typeBytes = Buffer.from(type, 'ascii');
  const head = Buffer.alloc(8);
  head.writeUInt32BE(payload.length, 0);
  typeBytes.copy(head, 4);
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc32(payload, crc32(typeBytes)), 0);
  return Buffer.concat([head, payload, tail]);
}

/** Encodes RGBA pixels as a PNG (RGB when the image has no alpha). Deterministic. */
export function encodePng(image: RgbaImage): Buffer {
  const channels = image.hasAlpha ? 4 : 3;
  const rowBytes = image.width * channels;
  const raw = Buffer.alloc((rowBytes + 1) * image.height);
  for (let y = 0; y < image.height; y++) {
    let o = y * (rowBytes + 1);
    raw[o++] = 0; // filter: None
    for (let x = 0; x < image.width; x++) {
      const s = (y * image.width + x) * 4;
      for (let c = 0; c < channels; c++) raw[o++] = image.pixels[s + c] ?? 0;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(image.width, 0);
  ihdr.writeUInt32BE(image.height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = image.hasAlpha ? 6 : 2; // color type: RGBA / RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', new Uint8Array(0)),
  ]);
}

export function bmpToPng(data: Uint8Array): Buffer {
  return encodePng(decodeBmp(data));
}
