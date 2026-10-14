import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDeck, escapeHtml, escapeInlineScript, escapeInlineStyle, type BuildOptions } from '../build/render.ts';

const options: BuildOptions = {
  file: 't.md',
  baseName: 'my_deck',
  loadDesign: (id) => (id === 'default' ? { id, css: '.slide{}', classes: ['inverse'] } : null),
  runtime: { css: '#deck{}', js: 'console.log(1)', runner: 'console.log(2)' },
};

async function build(src: string, extra: Partial<BuildOptions> = {}) {
  const result = await buildDeck(src, { ...options, ...extra });
  return { ...result, texts: result.reporter.messages.map((m) => `${m.level}:${m.text}`) };
}

function sections(html: string | null): string[] {
  return [...(html ?? '').matchAll(/<section class="([^"]*)" data-index="(\d+)">/g)].map((m) => `${m[2]}:${m[1]}`);
}

test('output skeleton follows the contract', async () => {
  const { html, texts } = await build('## a\n');
  assert.deepEqual(texts, []);
  assert.ok(html);
  assert.ok(html.startsWith('<!doctype html>\n<html lang="ja">\n<head>\n<meta charset="utf-8">\n'));
  assert.match(html, /<meta name="generator" content="cv_slides">/);
  assert.match(html, /<title>my_deck<\/title>/);
  assert.match(html, /<style id="viewer-css">\n#deck\{\}\n<\/style>\n<style id="design-css">\n\.slide\{\}\n<\/style>/);
  assert.match(
    html,
    /<main id="deck" class="deck design-default" data-design="default" data-page-number="true">\n<section/,
  );
  assert.match(
    html,
    /<\/main>\n<script id="viewer-js">\nconsole\.log\(1\)\n<\/script>\n<script id="runner-js">\nconsole\.log\(2\)\n<\/script>\n<\/body>\n<\/html>\n$/,
  );
});

test('output is deterministic', async () => {
  const src = '---\ntitle: T\n---\n## a\n---\n# b\n';
  assert.equal((await build(src)).html, (await build(src)).html);
});

test('auto title page is inserted from the front matter', async () => {
  const { html } = await build('---\ntitle: T\nsubtitle: S\nauthor: A\nevent: E\ndate: 2026-11-03\n---\n## a\n');
  assert.deepEqual(sections(html), ['0:slide slide--title', '1:slide slide--content']);
  assert.match(
    html ?? '',
    /<div class="slide__inner">\n<h1 class="title__main">T<\/h1>\n<p class="title__sub">S<\/p>\n<div class="title__meta">\n<span class="title__author">A<\/span>\n<span class="title__event">E<\/span> <span class="title__date">2026-11-03<\/span>\n<\/div>\n<\/div>/,
  );
});

test('no auto title page without a title', async () => {
  const { html } = await build('---\nauthor: A\n---\n## a\n');
  assert.deepEqual(sections(html), ['0:slide slide--content']);
});

test('explicit first title page replaces the auto one and shows meta', async () => {
  const { html } = await build('---\ntitle: T\nauthor: A\n---\n<!-- page: title -->\n# 本当のタイトル\nサブ\n---\n## a\n');
  assert.deepEqual(sections(html), ['0:slide slide--title', '1:slide slide--content']);
  assert.match(html ?? '', /<h1 class="title__main">本当のタイトル<\/h1>\n<p class="title__sub">サブ<\/p>/);
  assert.match(html ?? '', /title__author">A</);
});

test('explicit section title page later in the deck has no meta', async () => {
  const { html } = await build('---\ntitle: T\nauthor: A\n---\n## a\n---\n<!-- page: title -->\n# 第2部\nサブ\n');
  assert.deepEqual(sections(html), ['0:slide slide--title', '1:slide slide--content', '2:slide slide--title']);
  const last = (html ?? '').split('<section').at(-1) ?? '';
  assert.match(last, /<h1 class="title__main">第2部<\/h1>/);
  assert.doesNotMatch(last, /title__meta/);
});

test('content page: H2 heading and body', async () => {
  const { html } = await build('## 見出し\n\n- a\n- b\n');
  assert.match(
    html ?? '',
    /<h2 class="slide__heading">見出し<\/h2>\n<div class="slide__body">\n<ul>\n<li>a<\/li>\n<li>b<\/li>\n<\/ul>\n<\/div>/,
  );
});

test('content page: H1 mixed with content is treated like H2', async () => {
  const { html } = await build('# 見出し\n\nbody\n\n# more\n');
  assert.match(html ?? '', /<h2 class="slide__heading">見出し<\/h2>/);
  assert.match(html ?? '', /<h2>more<\/h2>/);
  assert.doesNotMatch(html ?? '', /<h1/);
});

test('content page: links open in a new tab, breaks are kept', async () => {
  const { html } = await build('## a\n\n[x](https://example.com)\nnext\n');
  assert.match(html ?? '', /<a href="https:\/\/example\.com" target="_blank" rel="noopener">x<\/a><br>\nnext/);
});

test('markdown-it-attrs only allows width', async () => {
  const { html } = await build('## a\n\nhello {onclick=alert(1) width=10 .cls}\n');
  assert.doesNotMatch(html ?? '', /onclick/);
  assert.doesNotMatch(html ?? '', /class="cls"/);
});

test('javascript: links are not rendered as links', async () => {
  const { html } = await build('## a\n\n[x](javascript:alert(1))\n');
  assert.doesNotMatch(html ?? '', /href="javascript/);
});

test('speaker notes are not output', async () => {
  const { html } = await build('## a\n\n<!-- note: secret -->\n\ntext\n');
  assert.doesNotMatch(html ?? '', /secret/);
});

test('takahashi via directive', async () => {
  const { html, texts } = await build('<!-- page: takahashi -->\n音を\n**書く**\n');
  assert.deepEqual(texts, []);
  assert.deepEqual(sections(html), ['0:slide slide--takahashi']);
  assert.match(html ?? '', /<p class="takahashi__text">音を<br>\n<strong>書く<\/strong><\/p>/);
});

test('takahashi via H1 shorthand', async () => {
  const { html } = await build('# 音を\n# 書く\n');
  assert.deepEqual(sections(html), ['0:slide slide--takahashi']);
  assert.match(html ?? '', /<p class="takahashi__text">音を<br>\n書く<\/p>/);
});

test('takahashi ignores lists and code with a warning', async () => {
  const { html, texts } = await build('<!-- page: takahashi -->\n音\n\n- list\n\n```\ncode\n```\n');
  assert.equal(texts.length, 1);
  assert.match(texts[0] ?? '', /^warning:/);
  assert.doesNotMatch(html ?? '', /list|code/);
});

test('class directive adds slide--class-* and is validated against design.json', async () => {
  const ok = await build('<!-- page: content, class: inverse -->\n## a\n');
  assert.deepEqual(ok.texts, []);
  assert.deepEqual(sections(ok.html), ['0:slide slide--content slide--class-inverse']);

  const ng = await build('<!-- class: rainbow -->\n## a\n');
  assert.equal(ng.texts.length, 1);
  assert.match(ng.texts[0] ?? '', /^warning:.*rainbow/);
  assert.deepEqual(sections(ng.html), ['0:slide slide--content slide--class-rainbow']);
});

test('missing design is an error and produces no output', async () => {
  const { html, reporter } = await build('---\ndesign: nope\n---\n## a\n');
  assert.equal(html, null);
  assert.equal(reporter.errorCount, 1);
  assert.match(reporter.messages[0]?.text ?? '', /デザインが見つかりません/);
});

test('CLI design overrides the front matter', async () => {
  const { html } = await build('---\ndesign: nope\n---\n## a\n', { design: 'default' });
  assert.match(html ?? '', /data-design="default"/);
});

test('invalid design names are rejected', async () => {
  const { html, reporter } = await build('## a\n', { design: '../x' });
  assert.equal(html, null);
  assert.equal(reporter.errorCount, 1);
});

test('unknown page type stops generation', async () => {
  const { html, reporter } = await build('<!-- page: chart -->\n## a\n');
  assert.equal(html, null);
  assert.equal(reporter.errorCount, 1);
});

test('page_number false is reflected on #deck', async () => {
  const { html } = await build('---\npage_number: false\n---\n## a\n');
  assert.match(html ?? '', /data-page-number="false"/);
});

test('title is HTML-escaped in <title> and on the title page', async () => {
  const { html } = await build('---\ntitle: "<script>alert(1)</script> & \\"q\\""\n---\n## a\n');
  assert.match(html ?? '', /<title>&lt;script&gt;alert\(1\)&lt;\/script&gt; &amp; &quot;q&quot;<\/title>/);
  assert.match(html ?? '', /<h1 class="title__main">&lt;script&gt;alert\(1\)&lt;\/script&gt; &amp; &quot;q&quot;<\/h1>/);
  assert.equal(escapeHtml(`<a href='x'>&</a>`), '&lt;a href=&#39;x&#39;&gt;&amp;&lt;/a&gt;');
});

test('</script and </style are escaped when inlining', async () => {
  assert.equal(escapeInlineScript('a="</script>";b="</SCRIPT >"'), 'a="<\\/script>";b="<\\/SCRIPT >"');
  assert.equal(escapeInlineStyle('/* </style> </Style> */'), '/* <\\/style> <\\/Style> */');
  const { html } = await build('## a\n', {
    runtime: {
      css: 'a::after{content:"</style>"}',
      js: 'const s = "</script><script>alert(1)";',
      runner: 'const r = "</SCRIPT>";',
    },
  });
  assert.equal((html ?? '').match(/<\/script>/gi)?.length, 2);
  assert.match(html ?? '', /<script id="runner-js">\nconst r = "<\\\/SCRIPT>";\n<\/script>/);
  assert.equal((html ?? '').match(/<\/style>/g)?.length, 2);
  assert.match(html ?? '', /const s = "<\\\/script><script>alert\(1\)";/);
});

test('an empty deck is an error', async () => {
  const { html, reporter } = await build('\n\n');
  assert.equal(html, null);
  assert.equal(reporter.errorCount, 1);
});

test('messages carry the deck page number (auto title page shifts by one)', async () => {
  const { reporter } = await build('---\ntitle: T\n---\n## a\n---\n<!-- page: code -->\n## b\n');
  assert.equal(reporter.messages.length, 1);
  const m = reporter.messages[0]!;
  assert.equal(reporter.format(m), 't.md:6: 警告: [スライド 3] コードサンプルページにコードブロックがありません');
});

test('empty title does not create a title page', async () => {
  const { html } = await build('---\ntitle: ""\n---\n## a\n');
  assert.deepEqual(sections(html), ['0:slide slide--content']);
  assert.match(html ?? '', /<title>my_deck<\/title>/);
});
