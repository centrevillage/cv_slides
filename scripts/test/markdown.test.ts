import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDeck, type BuildOptions } from '../build/render.ts';
import { renderTex } from '../build/markdown.ts';

const FILES: Record<string, Uint8Array> = {
  '/deck/img/a.png': new Uint8Array([1, 2, 3]),
  '/deck/img/b.svg': new TextEncoder().encode('<svg/>'),
  '/deck/img/写真.png': new Uint8Array([9]),
};

const options: BuildOptions = {
  file: 't.md',
  baseName: 't',
  baseDir: '/deck',
  readFile: (p) => FILES[p] ?? null,
  loadDesign: (id) => (id === 'default' ? { id, css: '', classes: [], highlightTheme: 'github-light' } : null),
  runtime: { css: '', js: '', runner: '' },
};

async function build(src: string, extra: Partial<BuildOptions> = {}) {
  const result = await buildDeck(src, { ...options, ...extra });
  const html = result.html ?? '';
  const sections = html.split('<section').slice(1).map((s) => `<section${s.split('</section>')[0]}</section>`);
  const texts = result.reporter.messages.map((m) => `${m.level}:${m.line}:${m.text}`);
  return { ...result, html, sections, texts };
}

// --- images ----------------------------------------------------------------

test('image-only paragraph becomes a figure with caption and width', async () => {
  const { html, texts } = await build('## a\n\n![猫](img/a.png "Rev.2 基板"){width=60%}\n');
  assert.deepEqual(texts, []);
  assert.match(
    html,
    /<figure class="figure figure--image">\n<img src="data:image\/png;base64,AQID" alt="猫" style="width: 60%">\n<figcaption class="figure__caption">Rev\.2 基板<\/figcaption>\n<\/figure>/,
  );
});

test('figure without title has no figcaption; px width; non-ASCII path', async () => {
  const { html, texts } = await build('## a\n\n![x](img/写真.png){width=800px}\n');
  assert.deepEqual(texts, []);
  assert.match(html, /<figure class="figure figure--image">\n<img src="data:image\/png;base64,CQ==" alt="x" style="width: 800px">\n<\/figure>/);
});

test('invalid width is ignored with a warning', async () => {
  const { html, texts } = await build('## a\n\n![x](img/a.png){width=big}\n');
  assert.equal(texts.length, 1);
  assert.match(texts[0] ?? '', /^warning:3:画像の width が不正です/);
  assert.match(html, /<img src="data:image\/png;base64,AQID" alt="x">/);
});

test('missing and remote images show a placeholder with a warning', async () => {
  const { html, texts } = await build('## a\n\n![x](img/none.png)\n\n![y](https://example.com/y.png)\n');
  assert.equal(texts.length, 2);
  assert.match(texts[0] ?? '', /^warning:3:画像ファイルが見つかりません/);
  assert.match(texts[1] ?? '', /^warning:5:URL指定の画像/);
  assert.match(html, /<figure class="figure figure--image figure--missing">\n<div class="figure__missing">画像なし: img\/none\.png<\/div>\n<\/figure>/);
  assert.doesNotMatch(html, /src="https:/);
});

test('inline image warns but is embedded inline', async () => {
  const { html, texts } = await build('## a\n\ntext ![x](img/b.svg) more\n');
  assert.equal(texts.length, 1);
  assert.match(texts[0] ?? '', /^warning:3:.*行内画像/);
  assert.match(html, /<p>text <img src="data:image\/svg\+xml;base64,PHN2Zy8\+" alt="x"> more<\/p>/);
});

test('two images in one paragraph become two figures', async () => {
  const { html } = await build('## a\n\n![x](img/a.png)\n![y](img/b.svg)\n');
  assert.equal(html.match(/<figure class="figure figure--image">/g)?.length, 2);
  assert.doesNotMatch(html, /<br>/);
});

// --- code ------------------------------------------------------------------

test('fenced code is highlighted with title syntaxes and line highlight', async () => {
  const { html, texts } = await build('## a\n\n```cpp:biquad.cpp showLineNumbers {2}\nint a;\nint b;\n```\n');
  assert.deepEqual(texts, []);
  assert.match(html, /<figure class="figure figure--code figure--line-numbers" data-lang="cpp">\n<figcaption class="figure__caption">biquad\.cpp<\/figcaption>\n<pre class="shiki github-light"/);
  assert.match(html, /<span class="line is-highlighted">/);
});

test('unknown language: warning with the fence line, plain output', async () => {
  const { html, texts } = await build('## a\n\n```zig\nconst x = 1;\n```\n');
  assert.equal(texts.length, 1);
  assert.match(texts[0] ?? '', /^warning:3:ハイライトできない言語です: zig/);
  assert.match(html, /<pre class="shiki plain"><code><span class="line">const x = 1;<\/span><\/code><\/pre>/);
});

test('the design highlight theme is used; unsupported themes are an error', async () => {
  const dark = await build('## a\n\n```js\nx\n```\n', {
    loadDesign: (id) => ({ id, css: '', classes: [], highlightTheme: 'github-dark' }),
  });
  assert.match(dark.html, /<pre class="shiki github-dark"/);
  const bad = await build('## a\n', { loadDesign: (id) => ({ id, css: '', classes: [], highlightTheme: 'monokai' }) });
  assert.equal(bad.html, '');
  assert.equal(bad.reporter.errorCount, 1);
  assert.match(bad.reporter.messages[0]?.text ?? '', /monokai/);
});

// --- columns ---------------------------------------------------------------

test('consecutive col blocks form one columns element with ratios', async () => {
  const src = '## a\n\nbefore\n\n::: col\n### Before\n- x\n:::\n\n::: col 2\n![a](img/a.png)\n:::\n\nafter\n';
  const { html, texts } = await build(src);
  assert.deepEqual(texts, []);
  assert.match(
    html,
    /<p>before<\/p>\n<div class="columns columns--2">\n<div class="column" style="--col-ratio: 1">\n<h3>Before<\/h3>\n<ul>\n<li>x<\/li>\n<\/ul>\n<\/div>\n<div class="column" style="--col-ratio: 2">\n<figure class="figure figure--image">\n<img src="data:image\/png;base64,AQID" alt="a">\n<\/figure>\n<\/div>\n<\/div>\n<p>after<\/p>/,
  );
});

test('three columns, decimal ratio, code and tables inside', async () => {
  const src =
    '::: col 1.5\n```js\nx\n```\n:::\n::: col\n| a |\n| - |\n| 1 |\n:::\n\n::: col\n$x$\n:::\n';
  const { html, texts } = await build(src);
  assert.deepEqual(texts, []);
  assert.match(html, /<div class="columns columns--3">\n<div class="column" style="--col-ratio: 1\.5">\n<figure class="figure figure--code"/);
  assert.match(html, /<table>/);
});

test('col blocks separated by other content are separate groups', async () => {
  const { texts } = await build('::: col\na\n:::\n\ntext\n\n::: col\nb\n:::\n');
  assert.equal(texts.filter((t) => /列が1つしかありません/.test(t)).length, 2);
});

test('a single column warns and renders as normal content', async () => {
  const { html, texts } = await build('## a\n\n::: col 2\nonly\n:::\n');
  assert.equal(texts.length, 1);
  assert.match(texts[0] ?? '', /^warning:3:列が1つしかありません/);
  assert.match(html, /<div class="slide__body">\n<p>only<\/p>\n<\/div>/);
  assert.doesNotMatch(html, /class="column/);
});

test('invalid ratio warns and uses 1', async () => {
  const { html, texts } = await build('::: col abc\na\n:::\n::: col 0\nb\n:::\n');
  assert.equal(texts.length, 2);
  assert.equal(html.match(/--col-ratio: 1"/g)?.length, 2);
});

test('four or more columns is an error', async () => {
  const { html, reporter } = await build('::: col\na\n:::\n::: col\nb\n:::\n::: col\nc\n:::\n::: col\nd\n:::\n');
  assert.equal(html, '');
  assert.equal(reporter.errorCount, 1);
  assert.match(reporter.messages[0]?.text ?? '', /3 列までです/);
});

test('a col inside a col is an error', async () => {
  const { html, reporter } = await build('## a\n\n::: col\nx\n::: col\ny\n:::\n:::\n');
  assert.equal(html, '');
  assert.equal(reporter.errorCount, 1);
  assert.match(reporter.messages[0]?.text ?? '', /入れ子/);
  assert.equal(reporter.messages[0]?.line, 5);
});

// --- math ------------------------------------------------------------------

test('inline math renders to MathML inside span.math--inline', async () => {
  const { html, texts } = await build('## a\n\nEuler $e^{i\\pi}+1=0$ done\n');
  assert.deepEqual(texts, []);
  assert.match(html, /Euler <span class="math math--inline"><math xmlns="http:\/\/www\.w3\.org\/1998\/Math\/MathML"><semantics>.*<\/math><\/span> done/);
  assert.doesNotMatch(html, /class="katex/);
});

test('block math ($$ on their own lines and single-line $$...$$)', async () => {
  const { html, texts } = await build('## a\n\n$$\n\\frac{1}{2}\n$$\n\n$$\\sqrt{2}$$\n');
  assert.deepEqual(texts, []);
  const blocks = html.match(/<div class="math math--block"><math [^>]*display="block">/g) ?? [];
  assert.equal(blocks.length, 2);
  assert.match(html, /<mfrac>/);
  assert.match(html, /<msqrt>/);
});

test('dollar rules: \\$ is literal, spaces and digits do not open/close math', async () => {
  const { html } = await build('## a\n\ncosts \\$5 and $ x $ and $5 or $10\n');
  assert.doesNotMatch(html, /class="math/);
  assert.match(html, /costs \$5 and \$ x \$ and \$5 or \$10/);
});

test('math inside code spans and fences is untouched', async () => {
  const { html } = await build('## a\n\n`$x$` here\n\n```\n$y$\n$$\nz\n$$\n```\n');
  assert.doesNotMatch(html, /class="math/);
  assert.match(html, /<code>\$x\$<\/code>/);
  assert.match(html, /\$y\$/);
});

test('KaTeX errors warn and output code.math-error with escaped TeX', async () => {
  const { html, texts } = await build('## a\n\nbad $\\frac{<$ end\n');
  assert.equal(texts.length, 1);
  assert.match(texts[0] ?? '', /^warning:3:数式を変換できません: KaTeX parse error/);
  assert.match(html, /<span class="math math--inline"><code class="math-error">\\frac\{&lt;<\/code><\/span>/);
});

test('renderTex: trust is off (\\href etc. are rejected or inert)', () => {
  const result = renderTex('\\href{javascript:alert(1)}{x}', false);
  // With trust: false KaTeX renders the command as inert red text; the URL only appears in the annotation.
  if ('html' in result) assert.doesNotMatch(result.html, /href=|<a[\s>]/);
  else assert.match(result.error, /KaTeX/);
  const unsafe = renderTex('\\htmlClass{evil}{y}', false);
  assert.ok(!('html' in unsafe) || !/class="evil"/.test(unsafe.html));
});

// --- full-screen image page -------------------------------------------------

test('image page: image + caption in one paragraph (spec example), no slide__inner', async () => {
  const { sections, texts } = await build('<!-- page: image, fit: cover -->\n![ライブの様子](img/a.png)\n2026.08 下北沢\n');
  assert.deepEqual(texts, []);
  assert.equal(
    sections[0],
    '<section class="slide slide--image" data-index="0" data-fit="cover">\n<img class="image__img" src="data:image/png;base64,AQID" alt="ライブの様子">\n<p class="image__caption">2026.08 下北沢</p>\n</section>',
  );
});

test('image page: default fit is cover; caption as a following paragraph; contain', async () => {
  const a = await build('<!-- page: image -->\n![x](img/a.png)\n\n**caption**\n');
  assert.match(a.sections[0] ?? '', /data-fit="cover">\n<img class="image__img"[^>]*>\n<p class="image__caption"><strong>caption<\/strong><\/p>/);
  const b = await build('<!-- page: image, fit: contain -->\n![x](img/a.png)\n');
  assert.match(b.sections[0] ?? '', /data-fit="contain">\n<img class="image__img"[^>]*>\n<\/section>/);
});

test('image page: title, extra images and other blocks are ignored with warnings', async () => {
  const { sections, texts } = await build(
    '<!-- page: image -->\n## heading\n\n![x](img/a.png "title")\n\ncap\n\n![y](img/b.svg)\n\n- list\n',
  );
  assert.equal(texts.length, 3);
  assert.ok(texts.some((t) => /タイトルは使いません/.test(t)));
  assert.ok(texts.some((t) => /2枚目以降/.test(t)));
  assert.ok(texts.some((t) => /合わない要素/.test(t)));
  assert.doesNotMatch(sections[0] ?? '', /heading|list|svg/);
  assert.match(sections[0] ?? '', /<p class="image__caption">cap<\/p>/);
});

test('image page: missing image shows the placeholder; no image warns', async () => {
  const a = await build('<!-- page: image -->\n![x](img/none.png)\n');
  assert.match(a.sections[0] ?? '', /<div class="figure__missing">画像なし: img\/none\.png<\/div>/);
  const b = await build('<!-- page: image -->\ntext only\n');
  assert.ok(b.texts.some((t) => /画像がありません/.test(t)));
});

// --- title icon ------------------------------------------------------------

test('title icon is the first child of .title__meta', async () => {
  const { html, texts } = await build('---\ntitle: T\nauthor: A\nicon: img/b.svg\n---\n## a\n');
  assert.deepEqual(texts, []);
  assert.match(
    html,
    /<div class="title__meta">\n<img class="title__icon" src="data:image\/svg\+xml;base64,PHN2Zy8\+" alt="">\n<span class="title__author">A<\/span>/,
  );
});

test('missing title icon warns at the front matter line and is omitted', async () => {
  const { html, texts } = await build('---\ntitle: T\nauthor: A\nicon: img/none.png\n---\n## a\n');
  assert.equal(texts.length, 1);
  assert.match(texts[0] ?? '', /^warning:4:アイコン: 画像ファイルが見つかりません/);
  assert.doesNotMatch(html, /title__icon/);
});
