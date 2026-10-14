import { readFileSync } from 'node:fs';
import { createHighlighterCore, type HighlighterCore, type LanguageRegistration, type ShikiTransformer } from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';
import { bundledLanguages, type BundledLanguage } from 'shiki/langs';
import { bundledThemes, type BundledTheme } from 'shiki/themes';

// ---------------------------------------------------------------------------
// Languages and themes (DETAILED_SPEC.md 4.8)
// ---------------------------------------------------------------------------

/** Language ids accepted in info strings, with their aliases. Only these are highlighted. */
export const LANGUAGES: Readonly<Record<string, readonly string[]>> = {
  c: [],
  cpp: ['c++'],
  rust: ['rs'],
  javascript: ['js', 'cjs', 'mjs'],
  typescript: ['ts', 'cts', 'mts'],
  csharp: ['c#', 'cs'],
  java: [],
  scala: [],
  ruby: ['rb'],
  python: ['py'],
  go: [],
  supercollider: ['sclang', 'scd'],
  faust: ['dsp'],
  onsa: ['onsalang'],
};

const ALIASES: ReadonlyMap<string, string> = new Map(
  Object.entries(LANGUAGES).flatMap(([id, aliases]) => [id, ...aliases].map((name) => [name, id] as const)),
);

/** Resolves a language name or alias (case-insensitive) to its id, or null when unsupported. */
export function resolveLanguage(name: string): string | null {
  return ALIASES.get(name.toLowerCase()) ?? null;
}

/** Third-party / first-party grammars that Shiki does not bundle (scripts/languages/). */
const CUSTOM_GRAMMARS: readonly { id: string; file: string }[] = [
  { id: 'onsa', file: 'onsa.tmLanguage.json' },
  { id: 'supercollider', file: 'supercollider.tmLanguage.json' },
  { id: 'faust', file: 'faust.tmLanguage.json' },
];

/** Shiki-bundled languages that are loaded (only these; never the full bundle). */
const BUNDLED_LANGUAGES: readonly BundledLanguage[] = [
  'c',
  'cpp',
  'rust',
  'javascript',
  'typescript',
  'csharp',
  'java',
  'scala',
  'ruby',
  'python',
  'go',
];

const BUNDLED_THEMES: readonly BundledTheme[] = ['github-light', 'github-dark'];
export const THEMES: readonly string[] = BUNDLED_THEMES;

/** Maximum line length that is tokenized; longer lines are left uncolored. */
const MAX_LINE_LENGTH = 1000;

/** Reads a custom grammar as data (never imported as a JS module; DETAILED_SPEC.md 2.4.3). */
export function loadCustomGrammar(id: string, file: string): LanguageRegistration {
  const url = new URL(`../languages/${file}`, import.meta.url);
  const json: unknown = JSON.parse(readFileSync(url, 'utf8'));
  if (typeof json !== 'object' || json === null || Array.isArray(json)) {
    throw new Error(`文法ファイルが不正です: scripts/languages/${file}`);
  }
  // Shiki uses `name` as the language id; the aliases are resolved by resolveLanguage().
  return { ...(json as LanguageRegistration), name: id, aliases: [] };
}

// ---------------------------------------------------------------------------
// Fence info strings
// ---------------------------------------------------------------------------

export interface FenceInfo {
  /** Language as written (empty when not specified). */
  lang: string;
  title?: string;
  lineNumbers: boolean;
  /** 1-based line numbers to highlight. */
  highlight: Set<number>;
  /** Other words (e.g. `run`, `assets="..."` used by code pages). */
  rest: string[];
  /** Problems found while parsing (reported as warnings). */
  problems: string[];
}

const INFO_TOKEN = /\{[^}]*\}|[A-Za-z][\w-]*=(?:"[^"]*"|'[^']*'|[^\s"']*)|\S+/g;
const RANGE = /^(\d+)(?:-(\d+))?$/;

/** Parses `cpp title="a.cpp" showLineNumbers {2,4-5}` and the Zenn/Qiita style `cpp:a.cpp`. */
export function parseFenceInfo(info: string): FenceInfo {
  const result: FenceInfo = { lang: '', lineNumbers: false, highlight: new Set(), rest: [], problems: [] };
  const words = info.trim().match(INFO_TOKEN) ?? [];
  let first = true;
  for (const word of words) {
    if (first && !word.startsWith('{') && !word.includes('=')) {
      first = false;
      const colon = word.indexOf(':');
      if (colon >= 0) {
        result.lang = word.slice(0, colon);
        const title = word.slice(colon + 1);
        if (title !== '') result.title = title;
      } else {
        result.lang = word;
      }
      continue;
    }
    first = false;
    if (word.startsWith('{')) {
      if (!word.endsWith('}')) {
        result.problems.push(`行ハイライトの書式が不正です: ${word}`);
        continue;
      }
      for (const part of word.slice(1, -1).split(',')) {
        const m = RANGE.exec(part.trim());
        const from = Number(m?.[1]);
        const to = m?.[2] !== undefined ? Number(m[2]) : from;
        if (!m || from < 1 || to < from || to - from > 10000) {
          result.problems.push(`行ハイライトの書式が不正です: ${word}({2,4-5} の形式で書きます)`);
          break;
        }
        for (let n = from; n <= to; n++) result.highlight.add(n);
      }
    } else if (word === 'showLineNumbers') {
      result.lineNumbers = true;
    } else if (word.startsWith('title=')) {
      const value = word.slice('title='.length);
      const quoted = /^"(.*)"$|^'(.*)'$/.exec(value);
      result.title = quoted ? (quoted[1] ?? quoted[2] ?? '') : value;
    } else {
      result.rest.push(word);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Highlighting
// ---------------------------------------------------------------------------

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Adds `is-highlighted` to the selected lines (a minimal replacement for @shikijs/transformers). */
function lineHighlightTransformer(lines: ReadonlySet<number>): ShikiTransformer {
  return {
    name: 'cv-slides:line-highlight',
    line(node, line) {
      if (lines.has(line)) this.addClassToHast(node, 'is-highlighted');
    },
  };
}

export interface HighlightResult {
  /** The <figure class="figure figure--code"> markup. */
  html: string;
  /** Warnings to report (unknown language, malformed options). */
  warnings: string[];
}

export interface CodeHighlighter {
  readonly themes: readonly string[];
  /** Renders a fenced code block. `theme` must be one of `themes`. */
  render(code: string, info: string, theme: string, options?: { allowRest?: readonly string[] }): HighlightResult;
}

function plainPre(code: string, highlight: ReadonlySet<number>): string {
  const lines = code.split('\n').map((line, i) => {
    const cls = highlight.has(i + 1) ? 'line is-highlighted' : 'line';
    return `<span class="${cls}">${escapeHtml(line)}</span>`;
  });
  return `<pre class="shiki plain"><code>${lines.join('\n')}</code></pre>`;
}

class ShikiCodeHighlighter implements CodeHighlighter {
  readonly themes: readonly string[] = THEMES;
  readonly #shiki: HighlighterCore;

  constructor(shiki: HighlighterCore) {
    this.#shiki = shiki;
  }

  render(code: string, info: string, theme: string, options: { allowRest?: readonly string[] } = {}): HighlightResult {
    const parsed = parseFenceInfo(info);
    const warnings = [...parsed.problems];
    const allowRest = options.allowRest ?? [];
    for (const word of parsed.rest) {
      const key = word.split('=')[0] ?? word;
      if (!allowRest.includes(key)) warnings.push(`コード片の未知のオプションを無視しました: ${word}`);
    }
    const text = code.replace(/\n$/, '');
    const langId = parsed.lang === '' ? null : resolveLanguage(parsed.lang);
    if (parsed.lang !== '' && langId === null) {
      warnings.push(`ハイライトできない言語です: ${parsed.lang}(ハイライトせずに表示します)`);
    }

    let pre: string;
    if (langId === null) {
      pre = plainPre(text, parsed.highlight);
    } else {
      pre = this.#shiki.codeToHtml(text, {
        lang: langId,
        theme,
        tabindex: false,
        tokenizeMaxLineLength: MAX_LINE_LENGTH,
        transformers: [lineHighlightTransformer(parsed.highlight)],
      });
    }

    const classes = ['figure', 'figure--code'];
    if (parsed.lineNumbers) classes.push('figure--line-numbers');
    const dataLang = langId ?? (parsed.lang === '' ? null : parsed.lang);
    const out: string[] = [
      `<figure class="${classes.join(' ')}"${dataLang === null ? '' : ` data-lang="${escapeHtml(dataLang)}"`}>`,
    ];
    if (parsed.title !== undefined && parsed.title !== '') {
      out.push(`<figcaption class="figure__caption">${escapeHtml(parsed.title)}</figcaption>`);
    }
    out.push(pre, '</figure>');
    return { html: out.join('\n'), warnings };
  }
}

/** Creates the highlighter (slow: create once per CLI run and reuse it). */
export async function createCodeHighlighter(): Promise<CodeHighlighter> {
  const shiki = await createHighlighterCore({
    // Strict mode: patterns that cannot be converted to JS regexes are errors.
    engine: createJavaScriptRegexEngine({ forgiving: false }),
    // Lazy imports from shiki's public exports: only the listed modules are loaded.
    themes: await Promise.all(BUNDLED_THEMES.map(async (id) => (await bundledThemes[id]()).default)),
    langs: [
      ...(await Promise.all(BUNDLED_LANGUAGES.map(async (id) => (await bundledLanguages[id]()).default))),
      ...CUSTOM_GRAMMARS.map((g) => loadCustomGrammar(g.id, g.file)),
    ],
  });
  return new ShikiCodeHighlighter(shiki);
}

let shared: Promise<CodeHighlighter> | null = null;

/** Returns a highlighter shared by all builds in this process. */
export function sharedCodeHighlighter(): Promise<CodeHighlighter> {
  shared ??= createCodeHighlighter();
  return shared;
}
