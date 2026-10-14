import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';
import { createCodeHighlighter, parseFenceInfo, resolveLanguage, LANGUAGES } from '../build/highlight.ts';

const highlighter = await createCodeHighlighter();

test('language names and aliases resolve (case-insensitive); others do not', () => {
  assert.equal(resolveLanguage('cpp'), 'cpp');
  assert.equal(resolveLanguage('c++'), 'cpp');
  assert.equal(resolveLanguage('JS'), 'javascript');
  assert.equal(resolveLanguage('mts'), 'typescript');
  assert.equal(resolveLanguage('c#'), 'csharp');
  assert.equal(resolveLanguage('rs'), 'rust');
  assert.equal(resolveLanguage('sclang'), 'supercollider');
  assert.equal(resolveLanguage('scd'), 'supercollider');
  assert.equal(resolveLanguage('dsp'), 'faust');
  assert.equal(resolveLanguage('onsalang'), 'onsa');
  assert.equal(resolveLanguage('sql'), null); // embedded by the cpp grammar, but not a supported language
  assert.equal(resolveLanguage('zig'), null);
  assert.equal(Object.keys(LANGUAGES).length, 14);
});

test('fence info: title syntaxes, line numbers, highlight ranges', () => {
  const a = parseFenceInfo('cpp title="biquad filter.cpp" showLineNumbers {2,4-5}');
  assert.equal(a.lang, 'cpp');
  assert.equal(a.title, 'biquad filter.cpp');
  assert.equal(a.lineNumbers, true);
  assert.deepEqual([...a.highlight], [2, 4, 5]);
  assert.deepEqual(a.problems, []);

  const b = parseFenceInfo('cpp:biquad.cpp');
  assert.equal(b.lang, 'cpp');
  assert.equal(b.title, 'biquad.cpp');
  assert.equal(b.lineNumbers, false);

  assert.equal(parseFenceInfo("js title='a.js'").title, 'a.js');
  assert.deepEqual(parseFenceInfo('js run assets="w.js"').rest, ['run', 'assets="w.js"']);
  assert.equal(parseFenceInfo('').lang, '');
  assert.equal(parseFenceInfo('{1}').lang, '');
  assert.equal(parseFenceInfo('js {3-1}').problems.length, 1);
  assert.equal(parseFenceInfo('js {a}').problems.length, 1);
});

test('render: figure markup with caption, line numbers and highlighted lines', () => {
  const { html, warnings } = highlighter.render('int a;\nint b;\n', 'c++ title="x.cpp" showLineNumbers {2}', 'github-light');
  assert.deepEqual(warnings, []);
  assert.match(html, /^<figure class="figure figure--code figure--line-numbers" data-lang="cpp">\n<figcaption class="figure__caption">x\.cpp<\/figcaption>\n<pre class="shiki github-light" style="[^"]*"><code>/);
  const lines = [...html.matchAll(/<span class="(line[^"]*)">/g)].map((m) => m[1]);
  assert.deepEqual(lines, ['line', 'line is-highlighted']);
  assert.doesNotMatch(html, /tabindex/);
  assert.match(html, /<\/code><\/pre>\n<\/figure>$/);
});

test('render: github-dark theme', () => {
  const { html } = highlighter.render('x = 1', 'py', 'github-dark');
  assert.match(html, /<pre class="shiki github-dark"/);
});

test('render: unknown language warns and falls back to escaped plain text', () => {
  const { html, warnings } = highlighter.render('<b>&\n', 'zig {1}', 'github-light');
  assert.equal(warnings.length, 1);
  assert.match(warnings[0] ?? '', /zig/);
  assert.equal(
    html,
    '<figure class="figure figure--code" data-lang="zig">\n<pre class="shiki plain"><code><span class="line is-highlighted">&lt;b&gt;&amp;</span></code></pre>\n</figure>',
  );
});

test('render: no language is plain without a warning', () => {
  const { html, warnings } = highlighter.render('a\nb\n', '', 'github-light');
  assert.deepEqual(warnings, []);
  assert.match(html, /^<figure class="figure figure--code">\n<pre class="shiki plain"><code><span class="line">a<\/span>\n<span class="line">b<\/span><\/code><\/pre>/);
});

test('render: unknown options warn unless allowed', () => {
  assert.equal(highlighter.render('x', 'js showLineNumber', 'github-light').warnings.length, 1);
  assert.equal(highlighter.render('x', 'js run', 'github-light', { allowRest: ['run'] }).warnings.length, 0);
});

/** Collects every regex in a TextMate grammar. */
function grammarPatterns(node: unknown, out: string[] = []): string[] {
  if (Array.isArray(node)) {
    for (const item of node) grammarPatterns(item, out);
  } else if (typeof node === 'object' && node !== null) {
    for (const [key, value] of Object.entries(node)) {
      if (['match', 'begin', 'end', 'while'].includes(key) && typeof value === 'string') out.push(value);
      else grammarPatterns(value, out);
    }
  }
  return out;
}

for (const id of ['onsa', 'supercollider', 'faust']) {
  test(`custom grammar ${id}: every pattern compiles with the strict JS engine`, () => {
    const grammar: unknown = JSON.parse(readFileSync(new URL(`../languages/${id}.tmLanguage.json`, import.meta.url), 'utf8'));
    const engine = createJavaScriptRegexEngine({ forgiving: false });
    const patterns = grammarPatterns(grammar);
    assert.ok(patterns.length > 5);
    for (const p of patterns) {
      assert.doesNotThrow(() => engine.createScanner([p]).findNextMatchSync('x', 0, 0), `pattern: ${p}`);
    }
  });
}

const SAMPLES: Record<string, { code: string; scope: RegExp }> = {
  onsa: { code: '// comment\nfn tick(x: f32) -> f32 at sample {\n  let y = x * 0.5;\n  y\n}', scope: /6A737D/i },
  supercollider: { code: '// comment\n(\n~osc = { |freq=440| SinOsc.ar(freq, 0, 0.1) }.play;\n)', scope: /6A737D/i },
  faust: { code: 'import("stdfaust.lib");\n// comment\nprocess = os.osc(440) : *(0.5) <: _,_;', scope: /6A737D/i },
};

for (const [lang, sample] of Object.entries(SAMPLES)) {
  test(`custom grammar ${lang}: tokenizes a sample`, () => {
    const { html, warnings } = highlighter.render(sample.code, lang, 'github-light');
    assert.deepEqual(warnings, []);
    assert.match(html, /<pre class="shiki github-light"/);
    assert.match(html, sample.scope); // comments are colored
    assert.ok((html.match(/style="color:/g) ?? []).length > 5, 'several colored tokens');
  });
}

test('very long lines are not tokenized (tokenizeMaxLineLength)', () => {
  const long = `const a = "${'x'.repeat(2000)}";`;
  const { html } = highlighter.render(long, 'js', 'github-light');
  assert.match(html, /x{2000}/);
});
