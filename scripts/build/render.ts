import type { Env, MarkdownIt, Token } from 'markdown-it';
import {
  Reporter,
  analyzeSlide,
  frontMatterKeyLine,
  normalizeSource,
  parseFrontMatter,
  splitFrontMatter,
  splitSlides,
  type FrontMatter,
  type Slide,
} from './parse.ts';
import {
  createMarkdown,
  imgTag,
  isImageOnly,
  makeEnv,
  missingFigure,
  renderBlockInline,
  resolveImage,
  splitBlocks,
  type Block,
} from './markdown.ts';
import { ImageEmbedder, type ReadFile } from './assets.ts';
import { sharedCodeHighlighter, type CodeHighlighter } from './highlight.ts';

export interface Design {
  /** Directory name under designs/ (used for the design-<id> class). */
  id: string;
  css: string;
  classes: string[];
  /** Shiki theme for code blocks (design.json `highlightTheme`, default github-light). */
  highlightTheme?: string;
}

export interface Runtime {
  css: string;
  js: string;
}

export interface BuildOptions {
  /** File label used in messages (usually a path relative to the cwd). */
  file: string;
  /** Fallback for <title> when the front matter has no title. */
  baseName: string;
  /** Design name from the CLI (overrides the front matter). */
  design?: string;
  /** Returns the design, or null when it does not exist. May throw on a broken design. */
  loadDesign: (name: string) => Design | null;
  runtime: Runtime;
  /** Directory that image paths are relative to (the .md file's directory). Default: cwd. */
  baseDir?: string;
  /** File reader for images (for tests). Default: the file system. */
  readFile?: ReadFile;
  /** Code highlighter; created once and shared when omitted. */
  highlighter?: CodeHighlighter;
}

export interface BuildResult {
  /** The output HTML, or null when an error occurred. */
  html: string | null;
  reporter: Reporter;
  slideCount: number;
}

type RenderedType = 'title' | 'content' | 'takahashi' | 'image';

interface Page {
  type: RenderedType;
  classes: string[];
  inner: string;
  /** False for pages without the .slide__inner wrapper (full-screen image). */
  wrap?: boolean;
  /** Extra data-* attributes on <section>. */
  data?: Record<string, string>;
}

const DESIGN_NAME = /^[A-Za-z0-9_-]+$/;

// ---------------------------------------------------------------------------
// Escaping
// ---------------------------------------------------------------------------

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Prevents inlined JS from closing its <script> element early. */
export function escapeInlineScript(js: string): string {
  return js.replace(/<\/(script)/gi, '<\\/$1');
}

/** Prevents inlined CSS from closing its <style> element early. */
export function escapeInlineStyle(css: string): string {
  return css.replace(/<\/(style)/gi, '<\\/$1');
}

// ---------------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------------

interface Context {
  md: MarkdownIt;
  reporter: Reporter;
  fm: FrontMatter;
  theme: string;
  embedder: ImageEmbedder;
  /** Embedded title page icon (front matter `icon`), or null. */
  icon: string | null;
}

function loc(slide: Slide, block?: Block): { line: number; slide: number } {
  return { line: slide.line + (block?.map?.[0] ?? 0), slide: slide.index };
}

/** markdown-it env for one slide: reports with file lines, embeds images, selects the theme. */
function slideEnv(ctx: Context, slide: Slide): Env {
  return makeEnv({
    report: (level, text, line) => {
      const where = { line: slide.line + (line ?? 0), slide: slide.index };
      if (level === 'error') ctx.reporter.error(text, where);
      else ctx.reporter.warn(text, where);
    },
    embedImage: (src) => ctx.embedder.embed(src),
    theme: ctx.theme,
  });
}

function isIgnorableHtml(block: Block): boolean {
  if (block.head.type !== 'html_block') return false;
  const html = block.head.content.trim();
  return html === '' || (html.startsWith('<!--') && html.endsWith('-->'));
}

function titleInner(fields: {
  title: string;
  subtitle: string;
  icon?: string | null | undefined;
  author?: string | undefined;
  event?: string | undefined;
  date?: string | undefined;
}): string {
  const out: string[] = [];
  if (fields.title !== '') out.push(`<h1 class="title__main">${fields.title}</h1>`);
  if (fields.subtitle !== '') out.push(`<p class="title__sub">${fields.subtitle}</p>`);
  const meta: string[] = [];
  if (fields.icon) meta.push(`<img class="title__icon" src="${escapeHtml(fields.icon)}" alt="">`);
  if (fields.author) meta.push(`<span class="title__author">${escapeHtml(fields.author)}</span>`);
  const eventDate: string[] = [];
  if (fields.event) eventDate.push(`<span class="title__event">${escapeHtml(fields.event)}</span>`);
  if (fields.date) eventDate.push(`<span class="title__date">${escapeHtml(fields.date)}</span>`);
  if (eventDate.length > 0) meta.push(eventDate.join(' '));
  if (meta.length > 0) out.push(`<div class="title__meta">\n${meta.join('\n')}\n</div>`);
  return out.join('\n');
}

function autoTitlePage(fm: FrontMatter, icon: string | null): Page {
  return {
    type: 'title',
    classes: [],
    inner: titleInner({
      title: escapeHtml(fm.title ?? ''),
      subtitle: escapeHtml(fm.subtitle ?? ''),
      icon,
      author: fm.author,
      event: fm.event,
      date: fm.date,
    }),
  };
}

function explicitTitlePage(ctx: Context, slide: Slide, isFirst: boolean): Page {
  const blocks = splitBlocks(ctx.md.parse(slide.source, slideEnv(ctx, slide)));
  let title: string | null = null;
  let subtitle: string | null = null;
  let ignored: Block | null = null;
  for (const block of blocks) {
    if (isIgnorableHtml(block)) continue;
    if (title === null && block.head.type === 'heading_open' && block.head.tag === 'h1') {
      title = renderBlockInline(ctx.md, block, {});
    } else if (title !== null && subtitle === null && block.head.type === 'paragraph_open') {
      subtitle = renderBlockInline(ctx.md, block, {});
    } else {
      ignored ??= block;
    }
  }
  if (ignored) {
    ctx.reporter.warn('タイトルページに合わない要素を無視しました(H1 と、続く段落1つだけを使います)', loc(slide, ignored));
  }
  // The first slide falls back to the front matter when it has no H1.
  if (title === null && isFirst && (ctx.fm.title ?? '') !== '') {
    title = escapeHtml(ctx.fm.title ?? '');
    subtitle ??= ctx.fm.subtitle !== undefined ? escapeHtml(ctx.fm.subtitle) : null;
  }
  if (title === null) ctx.reporter.warn('タイトルページに H1(# タイトル)がありません', loc(slide));
  return {
    type: 'title',
    classes: slide.directive.classes,
    inner: titleInner({
      title: title ?? '',
      subtitle: subtitle ?? '',
      ...(isFirst ? { icon: ctx.icon, author: ctx.fm.author, event: ctx.fm.event, date: ctx.fm.date } : {}),
    }),
  };
}

function warnContentIssues(ctx: Context, slide: Slide, tokens: Token[]): void {
  let depth = 0;
  let deepListWarned = false;
  for (const token of tokens) {
    if (token.type === 'bullet_list_open' || token.type === 'ordered_list_open') {
      depth++;
      if (depth >= 3 && !deepListWarned) {
        deepListWarned = true;
        ctx.reporter.warn('箇条書きの入れ子は2階層までを推奨します', {
          line: slide.line + (token.map?.[0] ?? 0),
          slide: slide.index,
        });
      }
    } else if (token.type === 'bullet_list_close' || token.type === 'ordered_list_close') {
      depth--;
    }
  }
}

function contentPage(ctx: Context, slide: Slide): Page {
  const env = slideEnv(ctx, slide);
  const tokens = ctx.md.parse(slide.source, env);
  warnContentIssues(ctx, slide, tokens);
  const blocks = splitBlocks(tokens);

  let heading: string | null = null;
  const firstReal = blocks.findIndex((b) => !isIgnorableHtml(b));
  const first = blocks[firstReal];
  if (first && first.head.type === 'heading_open' && (first.head.tag === 'h1' || first.head.tag === 'h2')) {
    heading = renderBlockInline(ctx.md, first, env);
    blocks.splice(firstReal, 1);
  }

  const bodyTokens: Token[] = [];
  for (const block of blocks) {
    if (block.head.type === 'heading_open' && block.head.tag === 'h1') {
      // H1 mixed with other content is treated like H2.
      for (const t of block.tokens) if (t.tag === 'h1') t.tag = 'h2';
    }
    bodyTokens.push(...block.tokens);
  }
  const body = ctx.md.renderer.render(bodyTokens, ctx.md.options, env).trimEnd();

  const inner: string[] = [];
  if (heading !== null) inner.push(`<h2 class="slide__heading">${heading}</h2>`);
  inner.push(`<div class="slide__body">${body === '' ? '' : `\n${body}\n`}</div>`);
  return { type: 'content', classes: slide.directive.classes, inner: inner.join('\n') };
}

function takahashiPage(ctx: Context, slide: Slide): Page {
  const env = slideEnv(ctx, slide);
  const blocks = splitBlocks(ctx.md.parse(slide.source, env));
  const lines: string[] = [];
  let ignored: Block | null = null;
  for (const block of blocks) {
    if (isIgnorableHtml(block)) continue;
    const inline = block.tokens.find((t) => t.type === 'inline');
    if ((block.head.type === 'heading_open' || block.head.type === 'paragraph_open') && inline) {
      if (inline.children?.some((c) => c.type === 'image')) {
        ignored ??= block;
        if (isImageOnly(inline)) continue;
        inline.children = inline.children.filter((c) => c.type !== 'image');
      }
      const html = renderBlockInline(ctx.md, block, env).trim();
      if (html !== '') lines.push(html);
    } else {
      ignored ??= block;
    }
  }
  if (ignored) {
    ctx.reporter.warn('高橋メソッドページではリスト・画像・コード片などは使えません(無視しました)', loc(slide, ignored));
  }
  if (lines.length === 0) ctx.reporter.warn('高橋メソッドページに表示するテキストがありません', loc(slide));
  return {
    type: 'takahashi',
    classes: slide.directive.classes,
    inner: `<p class="takahashi__text">${lines.join('<br>\n')}</p>`,
  };
}

/** Drops leading breaks / whitespace from inline children. */
function trimLeadingInline(children: Token[]): Token[] {
  let i = 0;
  while (i < children.length) {
    const c = children[i]!;
    if (c.type === 'softbreak' || c.type === 'hardbreak' || (c.type === 'text' && c.content.trim() === '')) i++;
    else break;
  }
  return children.slice(i);
}

function imagePage(ctx: Context, slide: Slide): Page {
  const env = slideEnv(ctx, slide);
  const blocks = splitBlocks(ctx.md.parse(slide.source, env));
  let image: string | null = null;
  let caption: string | null = null;
  let ignored: Block | null = null;
  let extraImage: Block | null = null;

  const takeImage = (token: Token, block: Block): void => {
    const parts = resolveImage(ctx.md, token, env);
    if (parts.title !== '') {
      ctx.reporter.warn('全面画像ページでは画像のタイトルは使いません(無視しました)', loc(slide, block));
    }
    if (parts.width !== null) {
      ctx.reporter.warn('全面画像ページでは width は使えません(無視しました)', loc(slide, block));
    }
    image = parts.uri === null ? missingFigure(parts.src) : imgTag({ ...parts, width: null }, 'image__img');
  };
  const captionFrom = (children: Token[], block: Block): void => {
    const kept = children.filter((c) => c.type !== 'image');
    if (kept.length !== children.length) extraImage ??= block;
    const html = ctx.md.renderer.renderInline(trimLeadingInline(kept), ctx.md.options, env).trim();
    if (html !== '') caption = html;
  };

  for (const block of blocks) {
    if (isIgnorableHtml(block)) continue;
    const inline = block.tokens.find((t) => t.type === 'inline');
    const children = trimLeadingInline(inline?.children ?? []);
    if (image === null && block.head.type === 'figure_image' && block.head.children?.[0]) {
      takeImage(block.head.children[0], block);
    } else if (image === null && block.head.type === 'paragraph_open' && children[0]?.type === 'image') {
      // `![...](...)` followed by text in the same paragraph: the text is the caption.
      takeImage(children[0], block);
      captionFrom(children.slice(1), block);
    } else if (image !== null && caption === null && block.head.type === 'paragraph_open' && inline) {
      captionFrom(inline.children ?? [], block);
    } else if (image !== null && block.head.type === 'figure_image') {
      extraImage ??= block;
    } else {
      ignored ??= block;
    }
  }
  if (extraImage) {
    ctx.reporter.warn('全面画像ページの2枚目以降の画像を無視しました', loc(slide, extraImage));
  }
  if (ignored) {
    ctx.reporter.warn(
      '全面画像ページに合わない要素を無視しました(画像1枚と、続く段落1つだけを使います)',
      loc(slide, ignored),
    );
  }
  if (image === null) ctx.reporter.warn('全面画像ページに画像がありません', loc(slide));

  const inner: string[] = [];
  if (image !== null) inner.push(image);
  if (caption !== null) inner.push(`<p class="image__caption">${caption}</p>`);
  return {
    type: 'image',
    classes: slide.directive.classes,
    inner: inner.join('\n'),
    wrap: false,
    data: { fit: slide.directive.fit ?? 'cover' },
  };
}

function renderSection(page: Page, index: number): string {
  const classes = ['slide', `slide--${page.type}`, ...page.classes.map((c) => `slide--class-${c}`)];
  const data = Object.entries(page.data ?? {})
    .map(([k, v]) => ` data-${k}="${escapeHtml(v)}"`)
    .join('');
  const body = page.wrap === false ? (page.inner === '' ? '' : `${page.inner}\n`) : `<div class="slide__inner">\n${page.inner}\n</div>\n`;
  return `<section class="${classes.join(' ')}" data-index="${index}"${data}>\n${body}</section>`;
}

// ---------------------------------------------------------------------------
// Deck
// ---------------------------------------------------------------------------

function resolveDesign(name: string, opts: BuildOptions, reporter: Reporter): Design | null {
  if (!DESIGN_NAME.test(name)) {
    reporter.error(`デザイン名が不正です: "${name}"(英数字・-・_ だけを使えます)`);
    return null;
  }
  try {
    const design = opts.loadDesign(name);
    if (!design) reporter.error(`デザインが見つかりません: ${name}(designs/${name}/design.json)`);
    return design;
  } catch (e) {
    reporter.error(`デザイン ${name} を読み込めません: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

export async function buildDeck(sourceText: string, opts: BuildOptions): Promise<BuildResult> {
  const reporter = new Reporter(opts.file);
  const src = normalizeSource(sourceText);
  const { yaml, body, bodyLine } = splitFrontMatter(src, reporter);
  const fm = parseFrontMatter(yaml, reporter);

  const designName = opts.design ?? fm.design ?? 'default';
  const design = resolveDesign(designName, opts, reporter);

  const slides = splitSlides(body, bodyLine, reporter).map((raw) => analyzeSlide(raw, reporter));
  const autoTitle = (fm.title ?? '') !== '' && slides[0]?.directive.page !== 'title';
  reporter.pageOffset = autoTitle ? 1 : 0;

  const highlighter = opts.highlighter ?? (await sharedCodeHighlighter());
  const theme = design?.highlightTheme ?? 'github-light';
  if (design && !highlighter.themes.includes(theme)) {
    reporter.error(
      `デザイン ${design.id} のハイライトテーマ "${theme}" には対応していません(${highlighter.themes.join(' / ')})`,
    );
  }
  const embedder = new ImageEmbedder({
    baseDir: opts.baseDir ?? process.cwd(),
    ...(opts.readFile ? { readFile: opts.readFile } : {}),
  });
  const ctx: Context = { md: createMarkdown(highlighter), reporter, fm, theme, embedder, icon: null };
  const showsMeta = autoTitle || slides[0]?.directive.page === 'title';
  if (fm.icon !== undefined && fm.icon !== '' && showsMeta) {
    const result = embedder.embed(fm.icon);
    const line = yaml === null ? 1 : frontMatterKeyLine(yaml, 'icon');
    for (const w of result.warnings) reporter.warn(`アイコン: ${w}`, { line });
    ctx.icon = result.uri;
  }
  const pages: Page[] = [];
  if (autoTitle) pages.push(autoTitlePage(fm, ctx.icon));
  for (const slide of slides) {
    if (design) {
      for (const c of slide.directive.classes) {
        if (!design.classes.includes(c)) {
          reporter.warn(`デザイン "${design.id}" で定義されていないクラスです: ${c}`, loc(slide));
        }
      }
    }
    if (slide.type === 'title') pages.push(explicitTitlePage(ctx, slide, pages.length === 0));
    else if (slide.type === 'takahashi') pages.push(takahashiPage(ctx, slide));
    else if (slide.type === 'image') pages.push(imagePage(ctx, slide));
    else pages.push(contentPage(ctx, slide));
  }
  if (pages.length === 0) reporter.error('スライドが1枚もありません');

  if (reporter.errorCount > 0 || !design) {
    return { html: null, reporter, slideCount: pages.length };
  }

  const title = fm.title || opts.baseName;
  const sections = pages.map((page, i) => renderSection(page, i)).join('\n');
  const html = [
    '<!doctype html>',
    '<html lang="ja">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<meta name="generator" content="cv_slides">',
    `<title>${escapeHtml(title)}</title>`,
    `<style id="viewer-css">\n${escapeInlineStyle(opts.runtime.css.trimEnd())}\n</style>`,
    `<style id="design-css">\n${escapeInlineStyle(design.css.trimEnd())}\n</style>`,
    '</head>',
    '<body>',
    `<main id="deck" class="deck design-${design.id}" data-design="${design.id}" data-page-number="${fm.page_number}">`,
    sections,
    '</main>',
    `<script id="viewer-js">\n${escapeInlineScript(opts.runtime.js.trimEnd())}\n</script>`,
    '</body>',
    '</html>',
    '',
  ].join('\n');
  return { html, reporter, slideCount: pages.length };
}
