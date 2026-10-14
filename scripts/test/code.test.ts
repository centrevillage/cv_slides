import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDeck, escapeScriptJson, type BuildOptions } from '../build/render.ts';
import { loadRunAsset, runAssetType, type ReadFile } from '../build/assets.ts';

const files: Record<string, Uint8Array> = {
  '/d/worklet/biquad.js': new TextEncoder().encode('registerProcessor("x", class {});'),
  '/d/wasm/add.wasm': new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0xff]),
  '/d/data.json': new TextEncoder().encode('{"a":1}'),
  '/d/a.mjs': new TextEncoder().encode('export {}'),
  '/d/note.txt': new TextEncoder().encode('日本語'),
  '/d/raw.bin': new Uint8Array([1, 2, 3]),
  '/d/big.js': new Uint8Array(2 * 1024 * 1024 + 1),
  '/outside.js': new TextEncoder().encode('x'),
};

const readFile: ReadFile = (p) => files[p] ?? null;

const options: BuildOptions = {
  file: 't.md',
  baseName: 'deck',
  loadDesign: (id) => (id === 'default' ? { id, css: '', classes: [] } : null),
  runtime: { css: '', js: '', runner: '' },
  baseDir: '/d',
  readFile,
};

interface RunnerData {
  source: string | null;
  assets: Record<string, { type: string; data: string }>;
}

async function build(src: string) {
  const result = await buildDeck(src, options);
  const html = result.html ?? '';
  const json = /<script type="application\/json" class="runner__data">(.*?)<\/script>/s.exec(html)?.[1];
  const data = json === undefined ? null : (JSON.parse(json) as RunnerData);
  const source = data?.source == null ? null : Buffer.from(data.source, 'base64').toString('utf8');
  return {
    ...result,
    html,
    json,
    data,
    source,
    texts: result.reporter.messages.map((m) => `${m.level}:${m.text}`),
  };
}

const page = (body: string): string => `<!-- page: code -->\n${body}`;
const fence = (info: string, code: string): string => `\`\`\`${info}\n${code}\n\`\`\`\n`;

test('code page: markup follows the contract (js display block is run)', async () => {
  const { html, texts, data, source } = await build(
    page(`## サイン波\n\n短い説明\n\n${fence('js title="sine.js"', 'const a = 1;\nconsole.log(a);')}`),
  );
  assert.deepEqual(texts, []);
  assert.match(
    html,
    /<section class="slide slide--code" data-index="0">\n<div class="slide__inner">\n<h2 class="slide__heading">サイン波<\/h2>\n<p class="code__description">短い説明<\/p>\n<div class="runner" data-runnable="true">\n<figure class="figure figure--code runner__code" data-lang="javascript">\n<figcaption class="figure__caption">sine\.js<\/figcaption>\n<pre class="shiki github-light"/,
  );
  assert.match(
    html,
    /<\/figure>\n<div class="runner__panel">\n<div class="runner__frame-slot"><\/div>\n<div class="runner__console-bar"><button type="button" class="runner__clear">Clear<\/button><\/div>\n<div class="runner__console" role="log" aria-live="polite"><\/div>\n<\/div>\n<script type="application\/json" class="runner__data">\{[^<]*\}<\/script>\n<\/div>\n<\/div>\n<\/section>/,
  );
  assert.doesNotMatch(html, /<iframe/);
  assert.equal(source, 'const a = 1;\nconsole.log(a);\n');
  assert.deepEqual(data?.assets, {});
});

test('code page: heading and description are optional', async () => {
  const { html, texts } = await build(page(fence('js', 'x()')));
  assert.deepEqual(texts, []);
  assert.doesNotMatch(html, /slide__heading|code__description/);
  assert.match(html, /<div class="slide__inner">\n<div class="runner" data-runnable="true">\n<figure/);
});

test('code page: hidden run block is executed, display block is shown', async () => {
  const { html, texts, source } = await build(
    page(`## Biquad\n\n${fence('cpp title="biquad.cpp" showLineNumbers {2}', 'float y;\nreturn y;')}\n${fence('js run', 'run();')}`),
  );
  assert.deepEqual(texts, []);
  assert.match(html, /<figure class="figure figure--code figure--line-numbers runner__code" data-lang="cpp">/);
  assert.match(html, /<figcaption class="figure__caption">biquad\.cpp<\/figcaption>/);
  assert.match(html, /is-highlighted/);
  assert.equal(source, 'run();\n');
  // the run block is not displayed
  assert.equal(html.match(/<figure/g)?.length, 1);
  assert.doesNotMatch(html, /run\(\)/);
});

test('code page: the run block may come before the display block', async () => {
  const { texts, source, html } = await build(page(`${fence('javascript run', 'go();')}\n${fence('onsa', 'fn f() {}')}`));
  assert.deepEqual(texts, []);
  assert.equal(source, 'go();\n');
  assert.match(html, /data-lang="onsa"/);
});

test('code page: a js display block with a separate run block is only displayed', async () => {
  const { source } = await build(page(`${fence('js', 'shown();')}\n${fence('js run', 'hidden();')}`));
  assert.equal(source, 'hidden();\n');
});

test('code page: nothing to run gives a warning and data-runnable="false"', async () => {
  const { html, texts, data } = await build(page(`## C++\n\n${fence('cpp', 'int x;')}`));
  assert.equal(texts.length, 1);
  assert.match(texts[0] ?? '', /^warning:実行するコードがありません/);
  assert.match(html, /<div class="runner" data-runnable="false">\n<figure class="figure figure--code runner__code" data-lang="cpp">/);
  assert.deepEqual(data, { source: null, assets: {} });
});

test('code page: only js / javascript can run (mjs, ts and run on other languages are not)', async () => {
  const ts = await build(page(fence('ts', 'let x = 1;')));
  assert.equal(ts.data?.source, null);
  const cppRun = await build(page(`${fence('cpp', 'int x;')}\n${fence('cpp run', 'int y;')}`));
  assert.equal(cppRun.data?.source, null);
  assert.ok(cppRun.texts.some((t) => /^warning:run は js \/ javascript/.test(t)));
  assert.ok(cppRun.texts.some((t) => /^warning:実行するコードがありません/.test(t)));
  const upper = await build(page(fence('JS', 'ok();')));
  assert.equal(upper.source, 'ok();\n');
});

test('code page: no code block at all, or only a run block', async () => {
  const none = await build(page('## a\n\ntext\n'));
  assert.deepEqual(none.texts, ['warning:コードサンプルページにコードブロックがありません']);
  assert.match(none.html, /data-runnable="false"/);
  assert.doesNotMatch(none.html, /<figure/);

  const runOnly = await build(page(fence('js run', 'go();')));
  assert.equal(runOnly.texts.length, 1);
  assert.match(runOnly.texts[0] ?? '', /^warning:表示するコードブロックがありません/);
  assert.equal(runOnly.source, 'go();\n');
  assert.doesNotMatch(runOnly.html, /<figure/);
});

test('code page: extra paragraphs, code blocks and other elements are ignored with warnings', async () => {
  const { html, texts, source } = await build(
    page(
      `## a\n\n説明1\n\n説明2\n\n${fence('js', 'one();')}\n${fence('js', 'two();')}\n${fence('js run', 'r1();')}\n${fence('js run', 'r2();')}\n- list\n\nafter\n`,
    ),
  );
  assert.deepEqual(texts.sort(), [
    'warning:2つ目以降のコードブロックを無視しました(表示するのは最初のコードブロックだけです)',
    'warning:コードサンプルページに合わない要素を無視しました(見出し・説明文1段落・コードブロックだけを使います)',
    'warning:実行ブロック(run)が複数あります(2つ目以降を無視しました)',
    'warning:説明文は1段落までです(2段落目以降を無視しました)',
  ]);
  assert.match(html, /<p class="code__description">説明1<\/p>/);
  assert.doesNotMatch(html, /説明2|two|list|after/);
  assert.equal(source, 'r1();\n');
});

test('code page: warnings carry the file line and the slide number', async () => {
  const { reporter } = await buildDeck(`## a\n---\n${page(`## b\n\n${fence('cpp', 'x')}`)}`, options);
  assert.equal(reporter.messages.length, 1);
  assert.equal(
    reporter.format(reporter.messages[0]!),
    't.md:6: 警告: [スライド 2] 実行するコードがありません(js / javascript のコードブロックか、run を付けた実行ブロックを書きます)。コードの表示だけにします',
  );
});

test('code page: description keeps inline markup and the class directive is applied', async () => {
  const { html } = await build(`<!-- page: code, class: x -->\n## a\n\n**強調** と \`code\`\n\n${fence('js', 'x')}`);
  assert.match(html, /<section class="slide slide--code slide--class-x"/);
  assert.match(html, /<p class="code__description"><strong>強調<\/strong> と <code>code<\/code><\/p>/);
});

// ---------------------------------------------------------------------------
// Assets
// ---------------------------------------------------------------------------

test('assets are embedded as base64 with the MIME type from the extension', async () => {
  const { texts, data } = await build(
    page(
      `${fence('cpp', 'x')}\n${fence('js run assets="worklet/biquad.js wasm/add.wasm  data.json a.mjs note.txt raw.bin"', 'go()')}`,
    ),
  );
  assert.deepEqual(texts, []);
  assert.deepEqual(Object.keys(data?.assets ?? {}), [
    'worklet/biquad.js',
    'wasm/add.wasm',
    'data.json',
    'a.mjs',
    'note.txt',
    'raw.bin',
  ]);
  const types = Object.fromEntries(Object.entries(data?.assets ?? {}).map(([k, v]) => [k, v.type]));
  assert.deepEqual(types, {
    'worklet/biquad.js': 'text/javascript',
    'wasm/add.wasm': 'application/wasm',
    'data.json': 'application/json',
    'a.mjs': 'text/javascript',
    'note.txt': 'text/plain',
    'raw.bin': 'application/octet-stream',
  });
  for (const [ref, asset] of Object.entries(data?.assets ?? {})) {
    assert.deepEqual(new Uint8Array(Buffer.from(asset.data, 'base64')), files[`/d/${ref}`], ref);
  }
});

test('assets on a js display block that is also the run code are embedded', async () => {
  const { texts, data } = await build(page(fence("js assets='wasm/add.wasm'", 'load()')));
  assert.deepEqual(texts, []);
  assert.equal(data?.assets['wasm/add.wasm']?.type, 'application/wasm');
});

test('assets on a block that is not run are ignored with a warning', async () => {
  const { texts, data } = await build(page(`${fence('cpp assets="data.json"', 'x')}\n${fence('js run', 'go()')}`));
  assert.deepEqual(texts, ['warning:assets は実行するコードブロックにだけ指定できます(無視しました)']);
  assert.deepEqual(data?.assets, {});
});

test('a missing asset is an error and stops generation', async () => {
  const { html, reporter } = await build(page(`${fence('cpp', 'x')}\n\n${fence('js run assets="none.js"', 'go()')}`));
  assert.equal(html, '');
  assert.equal(reporter.errorCount, 1);
  assert.equal(
    reporter.format(reporter.messages[0]!),
    't.md:7: エラー: [スライド 1] アセットのファイルが見つかりません: none.js',
  );
});

test('asset paths: URLs, absolute paths and escaping the .md directory are errors', () => {
  const opts = { baseDir: '/d', readFile };
  for (const ref of ['https://example.com/a.js', 'data:text/javascript,1', '//cdn/a.js', 'file:///d/a.mjs']) {
    const r = loadRunAsset(ref, opts);
    assert.ok('error' in r && /URL/.test(r.error), ref);
  }
  for (const ref of ['/d/a.mjs', '/outside.js', 'C:/x.js', 'C:\\x.js']) {
    const r = loadRunAsset(ref, opts);
    assert.ok('error' in r && /絶対パス/.test(r.error), ref);
  }
  for (const ref of ['../outside.js', 'wasm/../../outside.js', '..', '.', 'wasm/..']) {
    const r = loadRunAsset(ref, opts);
    assert.ok('error' in r && /フォルダの中/.test(r.error), ref);
  }
  // `..` that stays inside the directory is fine
  const ok = loadRunAsset('wasm/../data.json', opts);
  assert.ok('asset' in ok);
  assert.equal(ok.asset.type, 'application/json');
});

test('asset paths: invalid paths stop generation', async () => {
  const { html, texts } = await build(page(fence('js assets="../outside.js /outside.js https://x/y.js"', 'x')));
  assert.equal(html, '');
  assert.equal(texts.length, 3);
  assert.ok(texts.every((t) => t.startsWith('error:')));
});

test('assets over 2MB are embedded with a warning', async () => {
  const { html, texts, data } = await build(page(fence('js assets="big.js"', 'x')));
  assert.notEqual(html, '');
  assert.equal(texts.length, 1);
  assert.match(texts[0] ?? '', /^warning:アセットが 2\.0MB を超えています\(2\.0MB\): big\.js/);
  assert.equal(Buffer.from(data?.assets['big.js']?.data ?? '', 'base64').length, 2 * 1024 * 1024 + 1);
  const small = loadRunAsset('note.txt', { baseDir: '/d', readFile, maxBytes: 3 });
  assert.ok('asset' in small && small.warnings.length === 1);
});

test('runAssetType is case-insensitive and falls back to octet-stream', () => {
  assert.equal(runAssetType('A.WASM'), 'application/wasm');
  assert.equal(runAssetType('x.JS'), 'text/javascript');
  assert.equal(runAssetType('noext'), 'application/octet-stream');
  assert.equal(runAssetType('img.png'), 'application/octet-stream');
});

// ---------------------------------------------------------------------------
// Escaping
// ---------------------------------------------------------------------------

test('escapeScriptJson escapes every < and round-trips through JSON.parse', () => {
  const value = { s: '</script><!-- <b>&</b> \u2028', '</script>': 1 };
  const escaped = escapeScriptJson(JSON.stringify(value));
  assert.doesNotMatch(escaped, /</);
  assert.deepEqual(JSON.parse(escaped), value);
});

test('run code and asset keys cannot break out of the data script', async () => {
  const code = 'const s = "</script><script>alert(1)</script>";\n// <!-- <script>\nconsole.log(s);';
  const name = 'x</script><!--.js';
  files[`/d/${name}`] = new TextEncoder().encode('ok');
  files['/d/__proto__'] = new TextEncoder().encode('proto');
  try {
    const { html, json, source, data, texts } = await build(
      page(`${fence('cpp', 'int x; // </script>')}\n${fence(`js run assets="${name} __proto__"`, code)}`),
    );
    assert.deepEqual(texts, []);
    assert.ok(json);
    assert.doesNotMatch(json, /<\/script|<!--|</i);
    assert.equal(source, `${code}\n`);
    assert.deepEqual(Object.keys(data?.assets ?? {}), [name, '__proto__']);
    assert.equal(Buffer.from(data?.assets['__proto__']?.data ?? '', 'base64').toString(), 'proto');
    // exactly one data script, closed where expected (runtime scripts are empty here)
    assert.equal(html.match(/<script type="application\/json"/g)?.length, 1);
    assert.equal(html.match(/<\/script>/g)?.length, 3);
  } finally {
    delete files[`/d/${name}`];
    delete files['/d/__proto__'];
  }
});

test('code pages in the deck keep the output deterministic', async () => {
  const src = page(`## a\n\n${fence('cpp', 'x')}\n${fence('js run assets="data.json"', 'go()')}`);
  assert.equal((await build(src)).html, (await build(src)).html);
});
