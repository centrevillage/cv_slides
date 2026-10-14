import markdownit from 'markdown-it';
import type { Env, MarkdownIt, Token, RendererRule, StateBlock, StateCore, StateInline } from 'markdown-it';
import markdownItAttrs from 'markdown-it-attrs';
import markdownItContainer from 'markdown-it-container';
import katex from 'katex';
import { shortRef, type EmbedResult } from './assets.ts';
import type { CodeHighlighter } from './highlight.ts';

const NOTE_COMMENT = /^\s*<!--\s*note\s*:[\s\S]*-->\s*$/;

// ---------------------------------------------------------------------------
// Per-slide environment
// ---------------------------------------------------------------------------

export type ReportLevel = 'error' | 'warning';

/** Per-slide context passed through markdown-it's `env` (as `env.slide`). */
export interface SlideEnv {
  /** Reports a problem. `line` is 0-based within the slide source, or null when unknown. */
  report?: (level: ReportLevel, text: string, line: number | null) => void;
  /** Embeds an image reference (URL-decoded path as written). */
  embedImage?: (src: string) => EmbedResult;
  /** Shiki theme for code blocks. */
  theme?: string;
}

export function makeEnv(slide: SlideEnv): Env {
  return { slide };
}

function slideEnv(env: Env | undefined): SlideEnv {
  const value = env?.['slide'];
  return typeof value === 'object' && value !== null ? (value as SlideEnv) : {};
}

function report(env: Env | undefined, level: ReportLevel, text: string, map: [number, number] | null): void {
  slideEnv(env).report?.(level, text, map ? map[0] : null);
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ---------------------------------------------------------------------------
// Math (DETAILED_SPEC.md 4.6): $...$ and $$...$$, rendered to MathML by KaTeX
// ---------------------------------------------------------------------------

function isSpace(code: number): boolean {
  return code === 0x20 || code === 0x09 || code === 0x0a || code === 0x0d;
}

function isDigit(code: number): boolean {
  return code >= 0x30 && code <= 0x39;
}

function mathInlineRule(state: StateInline, silent: boolean): boolean {
  const src = state.src;
  const start = state.pos;
  if (src.charCodeAt(start) !== 0x24 /* $ */) return false;
  const double = src.charCodeAt(start + 1) === 0x24;
  const open = double ? 2 : 1;
  const first = src.charCodeAt(start + open);
  if (start + open >= state.posMax || isSpace(first) || first === 0x24) return false;

  let pos = start + open;
  let found = -1;
  while (pos < state.posMax) {
    const ch = src.charCodeAt(pos);
    if (ch === 0x5c /* \ */) {
      pos += 2;
      continue;
    }
    // Inline math never spans lines or code spans.
    if (ch === 0x60 /* ` */ || ch === 0x0a) return false;
    if (ch === 0x24) {
      if (double) {
        if (src.charCodeAt(pos + 1) === 0x24 && !isSpace(src.charCodeAt(pos - 1))) {
          found = pos;
          break;
        }
      } else if (!isSpace(src.charCodeAt(pos - 1)) && !isDigit(src.charCodeAt(pos + 1))) {
        found = pos;
        break;
      }
    }
    pos++;
  }
  if (found < 0) return false;
  if (!silent) {
    const token = state.push('math_inline', 'math', 0);
    token.content = src.slice(start + open, found);
    token.markup = double ? '$$' : '$';
  }
  state.pos = found + open;
  return true;
}

function mathBlockRule(state: StateBlock, startLine: number, endLine: number, silent: boolean): boolean {
  if (state.sCount[startLine]! - state.blkIndent >= 4) return false;
  const lineText = (line: number): string =>
    state.src.slice(state.bMarks[line]! + state.tShift[line]!, state.eMarks[line]!);
  const firstText = lineText(startLine);
  if (!firstText.startsWith('$$')) return false;
  const rest = firstText.slice(2).trimEnd();

  // Single line: $$ ... $$
  if (rest.endsWith('$$')) {
    const tex = rest.slice(0, -2);
    if (tex.trim() === '') return false;
    if (silent) return true;
    const token = state.push('math_block', 'math', 0);
    token.block = true;
    token.content = tex.trim();
    token.markup = '$$';
    token.map = [startLine, startLine + 1];
    state.line = startLine + 1;
    return true;
  }

  // Multiple lines: $$ (tex) ... (tex) $$
  let close = -1;
  for (let line = startLine + 1; line < endLine; line++) {
    const text = lineText(line);
    if (state.sCount[line]! < state.blkIndent && text !== '') return false;
    if (text.trimEnd().endsWith('$$')) {
      close = line;
      break;
    }
  }
  if (close < 0) return false;
  if (silent) return true;
  const closeText = lineText(close).trimEnd().slice(0, -2);
  const middle = close > startLine + 1 ? state.getLines(startLine + 1, close, state.blkIndent, false) : '';
  const tex = [rest, middle.replace(/\n$/, ''), closeText].filter((s) => s.trim() !== '').join('\n');
  const token = state.push('math_block', 'math', 0);
  token.block = true;
  token.content = tex;
  token.markup = '$$';
  token.map = [startLine, close + 1];
  state.line = close + 1;
  return true;
}

/** Renders TeX to MathML; on error reports a warning and returns null. */
export function renderTex(tex: string, displayMode: boolean): { html: string } | { error: string } {
  try {
    const html = katex.renderToString(tex, {
      output: 'mathml',
      trust: false,
      maxSize: 10,
      throwOnError: true,
      displayMode,
    });
    // Drop KaTeX's wrapper spans: the caller provides span.math / div.math.
    const m = /^(?:<span class="katex(?:-display)?">)+(<math[\s\S]*<\/math>)(?:<\/span>)+$/.exec(html);
    return { html: m?.[1] ?? html };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

function mathPlugin(md: MarkdownIt): void {
  md.inline.ruler.after('escape', 'math_inline', mathInlineRule);
  md.block.ruler.after('fence', 'math_block', mathBlockRule, { alt: ['paragraph', 'reference', 'blockquote', 'list'] });

  const renderMath = (token: Token, env: Env | undefined, display: boolean, map: [number, number] | null): string => {
    const result = renderTex(token.content, display);
    if ('error' in result) {
      report(env, 'warning', `数式を変換できません: ${result.error}`, map);
      return `<code class="math-error">${escapeHtml(token.content)}</code>`;
    }
    return result.html;
  };
  md.renderer.rules['math_inline'] = (tokens, idx, _options, env) => {
    const token = tokens[idx]!;
    return `<span class="math math--inline">${renderMath(token, env, false, token.map)}</span>`;
  };
  md.renderer.rules['math_block'] = (tokens, idx, _options, env) => {
    const token = tokens[idx]!;
    return `<div class="math math--block">${renderMath(token, env, true, token.map)}</div>\n`;
  };
}

// ---------------------------------------------------------------------------
// Columns (DETAILED_SPEC.md 4.9): ::: col [ratio] ... :::
// ---------------------------------------------------------------------------

const MAX_COLUMNS = 3;

function parseRatio(info: string, env: Env, map: [number, number] | null): number {
  const arg = info.trim().replace(/^col\b/, '').trim();
  if (arg === '') return 1;
  if (/^\d+(\.\d+)?$/.test(arg) && Number(arg) > 0) return Number(arg);
  report(env, 'warning', `列の比率が不正です: "${arg}"(正の数を書きます。1 として扱います)`, map);
  return 1;
}

/** Groups consecutive `::: col` containers into one columns element (core rule after `block`). */
function columnsRule(state: StateCore): void {
  const tokens = state.tokens;
  let depth = 0;
  let nested = false;
  for (const token of tokens) {
    if (token.type === 'container_col_open') {
      if (depth > 0) {
        nested = true;
        report(state.env, 'error', '列の中に ::: col は書けません(列分割の入れ子)', token.map);
      }
      depth++;
    } else if (token.type === 'container_col_close') {
      depth--;
    }
  }
  if (nested) return;

  const out: Token[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;
    if (token.type !== 'container_col_open') {
      out.push(token);
      continue;
    }
    const group: Token[][] = [];
    let j = i;
    while (tokens[j]?.type === 'container_col_open' && tokens[j]?.level === token.level) {
      const open = tokens[j]!;
      let k = j + 1;
      while (k < tokens.length && tokens[k]!.type !== 'container_col_close') k++;
      open.meta = { ratio: parseRatio(open.info, state.env, open.map) };
      group.push(tokens.slice(j, k + 1));
      j = k + 1;
    }
    i = j - 1;

    if (group.length === 1) {
      report(state.env, 'warning', '列が1つしかありません(通常の本文として表示します)', token.map);
      out.push(...(group[0] ?? []).slice(1, -1));
      continue;
    }
    if (group.length > MAX_COLUMNS) {
      report(state.env, 'error', `列分割は ${MAX_COLUMNS} 列までです(${group.length} 列あります)`, token.map);
    }
    const open = new state.Token('columns_open', 'div', 1);
    open.block = true;
    open.map = token.map;
    open.meta = { count: group.length };
    const close = new state.Token('columns_close', 'div', -1);
    close.block = true;
    out.push(open, ...group.flat(), close);
  }
  state.tokens = out;
}

function columnsPlugin(md: MarkdownIt): void {
  md.use(markdownItContainer, 'col', {
    validate: (params: string) => /^col(\s|$)/.test(params.trim()),
  });
  md.core.ruler.after('block', 'columns', columnsRule);
  md.renderer.rules['container_col_open'] = (tokens, idx) => {
    const ratio = (tokens[idx]?.meta as { ratio?: number } | null)?.ratio ?? 1;
    return `<div class="column" style="--col-ratio: ${ratio}">\n`;
  };
  md.renderer.rules['container_col_close'] = () => '</div>\n';
  md.renderer.rules['columns_open'] = (tokens, idx) => {
    const count = (tokens[idx]?.meta as { count?: number } | null)?.count ?? 2;
    return `<div class="columns columns--${count}">\n`;
  };
  md.renderer.rules['columns_close'] = () => '</div>\n';
}

// ---------------------------------------------------------------------------
// Images (DETAILED_SPEC.md 4.7)
// ---------------------------------------------------------------------------

const WIDTH_VALUE = /^\d+(\.\d+)?(%|px)$/;

/** Returns true when an inline token's children are only images (and whitespace / breaks). */
export function isImageOnly(inline: Token): boolean {
  const children = inline.children ?? [];
  let images = 0;
  for (const child of children) {
    if (child.type === 'image') images++;
    else if (child.type === 'softbreak' || child.type === 'hardbreak') continue;
    else if (child.type === 'text' && child.content.trim() === '') continue;
    else return false;
  }
  return images > 0;
}

/**
 * Turns image-only paragraphs into `figure_image` block tokens (one per image) and marks the
 * remaining images as inline. Image tokens get the line map of their paragraph.
 */
function imagesRule(state: StateCore): void {
  const tokens = state.tokens;
  const out: Token[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;
    const inline = tokens[i + 1];
    if (
      token.type === 'paragraph_open' &&
      inline?.type === 'inline' &&
      tokens[i + 2]?.type === 'paragraph_close' &&
      isImageOnly(inline)
    ) {
      for (const child of inline.children ?? []) {
        if (child.type !== 'image') continue;
        const figure = new state.Token('figure_image', 'figure', 0);
        figure.block = true;
        figure.map = inline.map;
        child.map = inline.map;
        figure.children = [child];
        out.push(figure);
      }
      i += 2;
      continue;
    }
    if (token.type === 'inline') {
      for (const child of token.children ?? []) {
        if (child.type === 'image' || child.type === 'math_inline') child.map = token.map;
        if (child.type === 'image') child.meta = { ...(child.meta as ImageMeta | null), inline: true };
      }
    }
    out.push(token);
  }
  state.tokens = out;
}

/** `meta` of image tokens. */
interface ImageMeta {
  /** In a paragraph with text (set by imagesRule). */
  inline?: boolean;
  /** The source (URL-decoded) when markdown-it's link validation rejects it (set by rejectedUrlsRule). */
  rejected?: string;
}

export interface ImageParts {
  /** Embedded data URI, or null when not embedded (placeholder). */
  uri: string | null;
  /** Path as written (URL-decoded), for the placeholder text. */
  src: string;
  alt: string;
  title: string;
  /** Validated CSS width (e.g. "60%"), or null. */
  width: string | null;
  /** The source itself cannot be used (rejected URL, remote URL, unsupported format), not a missing file. */
  unusable: boolean;
}

/** Resolves an image token: embeds the file and validates `{width=...}`. Reports problems. */
export function resolveImage(md: MarkdownIt, token: Token, env: Env | undefined): ImageParts {
  const attr = (name: string): string | null => {
    const value = token.attrGet(name);
    return value === null ? null : String(value);
  };
  const src = md.normalizeLinkText(attr('src') ?? '');
  const alt = md.renderer.renderInlineAsText(token.children ?? [], md.options, env);
  const title = attr('title') ?? '';
  let width: string | null = null;
  const widthAttr = attr('width');
  if (widthAttr !== null) {
    if (WIDTH_VALUE.test(widthAttr)) width = widthAttr;
    else report(env, 'warning', `画像の width が不正です: "${widthAttr}"(60% や 800px の形式で書きます。無視しました)`, token.map);
  }
  const rejected = (token.meta as ImageMeta | null)?.rejected;
  if (rejected !== undefined) {
    report(env, 'warning', `使えない形式の画像です: ${shortRef(rejected)}`, token.map);
    return { uri: null, src: rejected, alt, title, width, unusable: true };
  }
  const embed = slideEnv(env).embedImage;
  let uri: string | null = null;
  let unusable = false;
  if (embed) {
    const result = embed(src);
    for (const w of result.warnings) report(env, 'warning', w, token.map);
    uri = result.uri;
    unusable = result.unusable === true;
  }
  return { uri, src, alt, title, width, unusable };
}

export function imgTag(parts: ImageParts, className?: string): string {
  const attrs = [
    ...(className ? [`class="${className}"`] : []),
    `src="${escapeHtml(parts.uri ?? '')}"`,
    `alt="${escapeHtml(parts.alt)}"`,
    ...(parts.width ? [`style="width: ${parts.width}"`] : []),
  ];
  return `<img ${attrs.join(' ')}>`;
}

/** Placeholder text for an image that is not embedded. Unusable sources are shortened (data URIs). */
function placeholderText(parts: ImageParts): string {
  return parts.unusable ? `画像を表示できません: ${shortRef(parts.src)}` : `画像なし: ${parts.src}`;
}

export function missingFigure(parts: ImageParts): string {
  return (
    `<figure class="figure figure--image figure--missing">\n` +
    `<div class="figure__missing">${escapeHtml(placeholderText(parts))}</div>\n` +
    `</figure>`
  );
}

function missingInline(parts: ImageParts): string {
  return `<span class="figure__missing">${escapeHtml(placeholderText(parts))}</span>`;
}

function imagesPlugin(md: MarkdownIt): void {
  md.core.ruler.push('images', imagesRule);
  md.renderer.rules['figure_image'] = (tokens, idx, _options, env) => {
    const image = tokens[idx]?.children?.[0];
    if (!image) return '';
    const parts = resolveImage(md, image, env);
    if (parts.uri === null) return `${missingFigure(parts)}\n`;
    const out = [`<figure class="figure figure--image">`, imgTag(parts)];
    if (parts.title !== '') out.push(`<figcaption class="figure__caption">${escapeHtml(parts.title)}</figcaption>`);
    out.push('</figure>');
    return `${out.join('\n')}\n`;
  };
  md.renderer.rules.image = (tokens, idx, _options, env) => {
    const token = tokens[idx]!;
    if ((token.meta as { inline?: boolean } | null)?.inline) {
      report(env, 'warning', '文章と同じ段落にある画像(行内画像)はサポート外です(レイアウトは保証されません)', token.map);
    }
    const parts = resolveImage(md, token, env);
    if (parts.uri === null) return missingInline(parts);
    return imgTag(parts);
  };
}

// ---------------------------------------------------------------------------
// Link and image URLs (DETAILED_SPEC.md 2.4.3, 4.6, 4.7)
// ---------------------------------------------------------------------------

/**
 * Removes URLs that markdown-it's link validation rejects from link and image tokens. A rejected
 * link loses its link_open / link_close tokens (the text stays, with a warning); a rejected image
 * keeps its token with an empty src and the source in `meta.rejected` (resolveImage warns and
 * shows the placeholder). Only the children of block-level tokens are checked: links inside an
 * image's alt text are only ever rendered as text.
 */
function rejectedUrlsRule(md: MarkdownIt, isAllowed: (url: string) => boolean, state: StateCore): void {
  for (const token of state.tokens) {
    if (!token.children) continue;
    const kept: Token[] = [];
    // One entry per open link: true when its link_open was dropped.
    const dropped: boolean[] = [];
    for (const child of token.children) {
      if (child.type === 'link_open') {
        const href = String(child.attrGet('href') ?? '');
        const allowed = isAllowed(href);
        dropped.push(!allowed);
        if (!allowed) {
          report(state.env, 'warning', `使えない形式のリンクです: ${shortRef(md.normalizeLinkText(href))}`, token.map);
          continue;
        }
      } else if (child.type === 'link_close') {
        if (dropped.pop() === true) continue;
      } else if (child.type === 'image') {
        const src = String(child.attrGet('src') ?? '');
        if (!isAllowed(src)) {
          child.attrSet('src', '');
          child.meta = { ...(child.meta as ImageMeta | null), rejected: md.normalizeLinkText(src) };
        }
      }
      kept.push(child);
    }
    token.children = kept;
  }
}

function urlValidationPlugin(md: MarkdownIt): void {
  // markdown-it's default validateLink stays the decision function (javascript:, vbscript:,
  // file: and data: other than png / gif / jpeg / webp images are rejected). It is applied after
  // parsing instead of during it, so a rejected URL still forms a link / image token (warned
  // about) instead of silently staying literal Markdown text; the URL itself is never output.
  const isAllowed = md.validateLink.bind(md);
  md.validateLink = () => true;
  md.core.ruler.push('rejected_urls', (state) => rejectedUrlsRule(md, isAllowed, state));
}

// ---------------------------------------------------------------------------
// Code blocks (DETAILED_SPEC.md 4.8)
// ---------------------------------------------------------------------------

/** Keeps the original info string: markdown-it-attrs strips a trailing `{2,4-5}`. */
function rawFenceInfoRule(state: StateCore): void {
  for (const token of state.tokens) {
    if (token.type === 'fence') token.meta = { ...(token.meta as object | null), rawInfo: token.info };
  }
}

export function fenceInfo(token: Token): string {
  return (token.meta as { rawInfo?: string } | null)?.rawInfo ?? token.info;
}

function codePlugin(md: MarkdownIt, highlighter: CodeHighlighter): void {
  md.core.ruler.after('block', 'raw_fence_info', rawFenceInfoRule);
  const render = (code: string, info: string, env: Env | undefined, map: [number, number] | null): string => {
    const theme = slideEnv(env).theme ?? highlighter.themes[0] ?? 'github-light';
    const result = highlighter.render(code, md.utils.unescapeAll(info), theme, { allowRest: ['run', 'assets'] });
    for (const w of result.warnings) report(env, 'warning', w, map);
    return `${result.html}\n`;
  };
  md.renderer.rules.fence = (tokens, idx, _options, env) => {
    const token = tokens[idx]!;
    return render(token.content, fenceInfo(token), env, token.map);
  };
  md.renderer.rules.code_block = (tokens, idx, _options, env) => {
    const token = tokens[idx]!;
    return render(token.content, '', env, token.map);
  };
}

// ---------------------------------------------------------------------------
// markdown-it instance
// ---------------------------------------------------------------------------

/** Creates the markdown-it instance with the settings required by DETAILED_SPEC.md 2.4.3. */
export function createMarkdown(highlighter: CodeHighlighter): MarkdownIt {
  const md = markdownit({
    html: true,
    linkify: false,
    typographer: false,
    breaks: true,
  });
  md.use(markdownItAttrs, { allowedAttributes: ['width'] });
  md.use(mathPlugin);
  md.use(columnsPlugin);
  md.use(imagesPlugin);
  md.use(codePlugin, highlighter);
  // After imagesPlugin: the rule also checks the images moved into figure_image tokens.
  md.use(urlValidationPlugin);

  const defaultLinkOpen: RendererRule =
    md.renderer.rules.link_open ?? ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));
  md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    if (token) {
      token.attrSet('target', '_blank');
      token.attrSet('rel', 'noopener');
    }
    return defaultLinkOpen(tokens, idx, options, env, self);
  };

  // Speaker notes (<!-- note: ... -->, DETAILED_SPEC.md 4.13) are reserved and never output.
  const defaultHtmlBlock = md.renderer.rules.html_block;
  md.renderer.rules.html_block = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    if (token && NOTE_COMMENT.test(token.content)) return '';
    return defaultHtmlBlock ? defaultHtmlBlock(tokens, idx, options, env, self) : (token?.content ?? '');
  };
  const defaultHtmlInline = md.renderer.rules.html_inline;
  md.renderer.rules.html_inline = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    if (token && NOTE_COMMENT.test(token.content)) return '';
    return defaultHtmlInline ? defaultHtmlInline(tokens, idx, options, env, self) : (token?.content ?? '');
  };

  return md;
}

export function isNoteComment(html: string): boolean {
  return NOTE_COMMENT.test(html);
}

/** A top-level block: tokens from an opening token at nesting level 0 to its matching close. */
export interface Block {
  tokens: Token[];
  /** The first token (e.g. heading_open, paragraph_open, fence). */
  head: Token;
  /** 0-based line range [start, end) within the slide source, when known. */
  map: [number, number] | null;
}

export function splitBlocks(tokens: Token[]): Block[] {
  const blocks: Block[] = [];
  let current: Token[] = [];
  let depth = 0;
  for (const token of tokens) {
    current.push(token);
    depth += token.nesting;
    if (depth === 0) {
      const head = current[0];
      if (head) blocks.push({ tokens: current, head, map: head.map ? [head.map[0], head.map[1]] : null });
      current = [];
    }
  }
  return blocks;
}

/** Renders the inline children of a heading or paragraph block. */
export function renderBlockInline(md: MarkdownIt, block: Block, env: Env = {}): string {
  const inline = block.tokens.find((t) => t.type === 'inline');
  return inline ? md.renderer.renderInline(inline.children ?? [], md.options, env) : '';
}
