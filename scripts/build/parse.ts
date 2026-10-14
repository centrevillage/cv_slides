import { parse as parseYamlDefault } from 'yaml';

// ---------------------------------------------------------------------------
// Diagnostics
// ---------------------------------------------------------------------------

export type Level = 'error' | 'warning';

export interface Location {
  /** 1-based line number in the source file. */
  line?: number;
  /** 0-based index of the slide among the non-empty source slides. */
  slide?: number;
}

export interface Message extends Location {
  level: Level;
  text: string;
}

export class Reporter {
  readonly file: string;
  readonly messages: Message[] = [];
  /** Added to `slide` when formatting (1 when an auto title page is inserted). */
  pageOffset = 0;

  constructor(file: string) {
    this.file = file;
  }

  error(text: string, loc: Location = {}): void {
    this.messages.push({ level: 'error', text, ...loc });
  }

  warn(text: string, loc: Location = {}): void {
    this.messages.push({ level: 'warning', text, ...loc });
  }

  get errorCount(): number {
    return this.messages.filter((m) => m.level === 'error').length;
  }

  get warningCount(): number {
    return this.messages.filter((m) => m.level === 'warning').length;
  }

  /** Messages ordered by source line (stable; messages without a line come first). */
  sorted(): Message[] {
    return [...this.messages].sort((a, b) => (a.line ?? 0) - (b.line ?? 0));
  }

  format(m: Message): string {
    const where = m.line === undefined ? this.file : `${this.file}:${m.line}`;
    const label = m.level === 'error' ? 'エラー' : '警告';
    const page = m.slide === undefined ? '' : `[スライド ${m.slide + this.pageOffset + 1}] `;
    return `${where}: ${label}: ${page}${m.text}`;
  }
}

// ---------------------------------------------------------------------------
// Source normalization
// ---------------------------------------------------------------------------

export function normalizeSource(text: string): string {
  return text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
}

// ---------------------------------------------------------------------------
// Front matter
// ---------------------------------------------------------------------------

export interface FrontMatter {
  title?: string;
  subtitle?: string;
  author?: string;
  date?: string;
  event?: string;
  icon?: string;
  design?: string;
  page_number: boolean;
}

const STRING_KEYS = ['title', 'subtitle', 'author', 'date', 'event', 'icon', 'design'] as const;
const BOOLEAN_KEYS = ['page_number'] as const;
const KNOWN_KEYS: ReadonlySet<string> = new Set<string>([...STRING_KEYS, ...BOOLEAN_KEYS]);

const FENCE_LINE = /^---[ \t]*$/;

export interface SplitFrontMatter {
  /** YAML text between the delimiters, or null when there is no front matter. */
  yaml: string | null;
  /** Text after the front matter. */
  body: string;
  /** 1-based line number of the first body line. */
  bodyLine: number;
}

export function splitFrontMatter(src: string, reporter: Reporter): SplitFrontMatter {
  const lines = src.split('\n');
  if (!FENCE_LINE.test(lines[0] ?? '')) {
    return { yaml: null, body: src, bodyLine: 1 };
  }
  for (let i = 1; i < lines.length; i++) {
    if (FENCE_LINE.test(lines[i] ?? '')) {
      return {
        yaml: lines.slice(1, i).join('\n'),
        body: lines.slice(i + 1).join('\n'),
        bodyLine: i + 2,
      };
    }
  }
  reporter.error('フロントマターが閉じていません(終わりの --- 行がありません)', { line: 1 });
  return { yaml: null, body: '', bodyLine: lines.length + 1 };
}

export type YamlParser = (text: string) => unknown;

export function parseFrontMatter(
  yamlText: string | null,
  reporter: Reporter,
  parseYaml: YamlParser = (text) => parseYamlDefault(text, { version: '1.2', schema: 'core' }),
): FrontMatter {
  const result: FrontMatter = { page_number: true };
  if (yamlText === null) return result;

  // Front matter starts at line 2 (line 1 is the opening ---).
  const keyLine = (key: string): number => {
    const lines = yamlText.split('\n');
    const i = lines.findIndex((l) => l.startsWith(`${key}:`) || l.startsWith(`${key} :`));
    return i < 0 ? 1 : i + 2;
  };

  let data: unknown;
  try {
    data = parseYaml(yamlText);
  } catch (e) {
    // Any exception (YAMLParseError, RangeError from deep nesting, ...) is a YAML error.
    const detail = e instanceof Error ? `${e.name}: ${e.message.split('\n')[0]}` : String(e);
    reporter.error(`フロントマターのYAMLが不正です(${detail})`, { line: 1 });
    return result;
  }

  if (data === null || data === undefined) return result; // empty front matter
  if (typeof data !== 'object' || Array.isArray(data)) {
    reporter.error('フロントマターは「キー: 値」の形式で書いてください', { line: 1 });
    return result;
  }

  const record = data as Record<string, unknown>;
  for (const [key, value] of Object.entries(record)) {
    if (!KNOWN_KEYS.has(key)) {
      reporter.warn(`未知のフロントマターキー: ${key}`, { line: keyLine(key) });
    }
  }
  for (const key of STRING_KEYS) {
    const value = record[key];
    if (value === undefined || value === null) continue;
    if (typeof value !== 'string') {
      reporter.error(
        `フロントマターの ${key} は文字列で書いてください(値: ${JSON.stringify(value)}。数値などは "" で囲みます)`,
        { line: keyLine(key) },
      );
      continue;
    }
    result[key] = value;
  }
  for (const key of BOOLEAN_KEYS) {
    const value = record[key];
    if (value === undefined || value === null) continue;
    if (typeof value !== 'boolean') {
      reporter.error(`フロントマターの ${key} は true / false で書いてください(値: ${JSON.stringify(value)})`, {
        line: keyLine(key),
      });
      continue;
    }
    result[key] = value;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Slide splitting
// ---------------------------------------------------------------------------

export interface RawSlide {
  /** 0-based index among non-empty slides. */
  index: number;
  /** 1-based file line number of the first line of `source`. */
  line: number;
  source: string;
}

const SEPARATOR = /^ {0,3}-{3,}[ \t]*$/;
const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})/;

export function splitSlides(body: string, bodyLine: number, reporter: Reporter): RawSlide[] {
  const lines = body.split('\n');
  const chunks: { line: number; lines: string[]; separatorLine: number | null }[] = [
    { line: bodyLine, lines: [], separatorLine: null },
  ];
  let fence: { char: string; length: number } | null = null;

  for (let i = 0; i < lines.length; i++) {
    const text = lines[i] ?? '';
    const lineNo = bodyLine + i;
    if (fence) {
      const m = /^ {0,3}(`{3,}|~{3,})[ \t]*$/.exec(text);
      if (m && m[1] !== undefined && m[1][0] === fence.char && m[1].length >= fence.length) fence = null;
    } else if (SEPARATOR.test(text)) {
      chunks.push({ line: lineNo + 1, lines: [], separatorLine: lineNo });
      continue;
    } else {
      const m = FENCE_OPEN.exec(text);
      if (m && m[1] !== undefined) fence = { char: m[1][0] ?? '`', length: m[1].length };
    }
    chunks[chunks.length - 1]?.lines.push(text);
  }

  const slides: RawSlide[] = [];
  for (const chunk of chunks) {
    if (chunk.lines.every((l) => l.trim() === '')) {
      // An empty body without any separator is just an empty deck, not an empty slide.
      if (chunks.length > 1) {
        reporter.warn('空のスライドを無視しました', { line: chunk.separatorLine ?? chunk.line });
      }
      continue;
    }
    // Drop leading blank lines so `line` points at the first content line.
    const lead = chunk.lines.findIndex((l) => l.trim() !== '');
    slides.push({ index: slides.length, line: chunk.line + lead, source: chunk.lines.slice(lead).join('\n') });
  }
  return slides;
}

// ---------------------------------------------------------------------------
// Directives
// ---------------------------------------------------------------------------

export type PageType = 'title' | 'content' | 'takahashi' | 'code' | 'image';
export const PAGE_TYPES: readonly PageType[] = ['title', 'content', 'takahashi', 'code', 'image'];
const DIRECTIVE_KEYS: ReadonlySet<string> = new Set(['page', 'class', 'fit']);
const FIT_VALUES: ReadonlySet<string> = new Set(['cover', 'contain']);

export interface Directive {
  page?: PageType;
  classes: string[];
  fit?: string;
}

export interface Slide extends RawSlide {
  directive: Directive;
  /** Page type after applying the directive and the H1 shorthand. */
  type: PageType;
}

function isPageType(value: string): value is PageType {
  return (PAGE_TYPES as readonly string[]).includes(value);
}

/**
 * Parses a directive comment on the first non-empty line of the slide.
 * The directive line is replaced by an empty line so markdown-it line maps stay aligned.
 */
export function parseDirective(raw: RawSlide, reporter: Reporter): { directive: Directive; source: string } {
  const directive: Directive = { classes: [] };
  const lines = raw.source.split('\n');
  const first = lines.findIndex((l) => l.trim() !== '');
  if (first < 0) return { directive, source: raw.source };

  const m = /^\s*<!--(.*)-->\s*$/.exec(lines[first] ?? '');
  const body = m?.[1]?.trim();
  if (body === undefined) return { directive, source: raw.source };
  const firstKey = /^([A-Za-z_][\w-]*)\s*:/.exec(body)?.[1];
  if (firstKey === undefined || !DIRECTIVE_KEYS.has(firstKey)) {
    return { directive, source: raw.source }; // ordinary comment, e.g. <!-- note: ... -->
  }

  const loc = { line: raw.line + first, slide: raw.index };
  const seen = new Set<string>();
  for (const part of body.split(',')) {
    if (part.trim() === '') continue;
    const colon = part.indexOf(':');
    if (colon < 0) {
      reporter.warn(`ディレクティブの書式が不正です: "${part.trim()}"(key: value の形式で書きます)`, loc);
      continue;
    }
    const key = part.slice(0, colon).trim();
    const value = part.slice(colon + 1).trim();
    if (seen.has(key)) reporter.warn(`ディレクティブ ${key} が重複しています(後の値を使います)`, loc);
    seen.add(key);

    switch (key) {
      case 'page':
        if (isPageType(value)) directive.page = value;
        else reporter.error(`未知のページ種別: "${value}"(${PAGE_TYPES.join(' / ')} のどれかを指定します)`, loc);
        break;
      case 'class': {
        const classes = value.split(/\s+/).filter((c) => c !== '');
        const valid = classes.filter((c) => /^[A-Za-z0-9_-]+$/.test(c));
        if (valid.length !== classes.length || classes.length === 0) {
          reporter.warn(`class の値が不正です: "${value}"(英数字・-・_ だけを使えます)`, loc);
        }
        directive.classes = valid;
        break;
      }
      case 'fit':
        if (FIT_VALUES.has(value)) directive.fit = value;
        else reporter.warn(`fit の値が不正です: "${value}"(cover / contain のどちらかを指定します)`, loc);
        break;
      default:
        reporter.warn(`未知のディレクティブ: ${key}`, loc);
    }
  }
  if (directive.fit !== undefined && directive.page !== 'image') {
    reporter.warn('fit は全面画像ページ(page: image)でのみ使えます', loc);
  }

  lines[first] = '';
  return { directive, source: lines.join('\n') };
}

const H1_LINE = /^ {0,3}#[ \t]+\S/;

/** True when every non-empty line (ignoring one-line HTML comments) is an ATX H1 (`# text`). */
export function isH1Only(source: string): boolean {
  const lines = source.split('\n').filter((l) => l.trim() !== '' && !/^\s*<!--.*-->\s*$/.test(l));
  return lines.length > 0 && lines.every((l) => H1_LINE.test(l));
}

export function analyzeSlide(raw: RawSlide, reporter: Reporter): Slide {
  const { directive, source } = parseDirective(raw, reporter);
  const type: PageType = directive.page ?? (isH1Only(source) ? 'takahashi' : 'content');
  if (type === 'code' || type === 'image') {
    reporter.warn(`未実装のページ種別です(page: ${type})。コンテンツページとして表示します`, {
      line: raw.line,
      slide: raw.index,
    });
  }
  return { ...raw, source, directive, type };
}
