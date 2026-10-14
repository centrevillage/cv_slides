import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDeck, type BuildOptions, type Runtime } from '../build/render.ts';
import { loadDesignFrom } from '../build/design.ts';
import { createSlide } from '../new_slide.ts';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const CLI = path.join(ROOT, 'scripts', 'cli.ts');
const DESIGNS = path.join(ROOT, 'designs');
const TEMPLATE = readFileSync(path.join(ROOT, 'scripts', 'templates', 'new_slide.md'), 'utf8');
const RUNTIME: Runtime = { css: '', js: '', runner: '' };

function tempDir(): string {
  return mkdtempSync(path.join(os.tmpdir(), 'cv_slides-test-'));
}

function cli(...args: string[]) {
  const r = spawnSync(process.execPath, [CLI, ...args], { cwd: ROOT, encoding: 'utf8' });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

function hasDesign(id: string): boolean {
  return existsSync(path.join(DESIGNS, id, 'design.json')) && existsSync(path.join(DESIGNS, id, 'design.css'));
}

async function buildWith(src: string, designsDir: string, extra: Partial<BuildOptions> = {}) {
  return buildDeck(src, {
    file: 't.md',
    baseName: 't',
    loadDesign: (id) => loadDesignFrom(designsDir, id),
    runtime: RUNTIME,
    ...extra,
  });
}

// --- new <name> ----------------------------------------------------------------

test('createSlide makes <name>/<name>.md from the template and an empty img/', () => {
  const dir = tempDir();
  try {
    const slides = path.join(dir, 'slides'); // created on demand
    const r = createSlide(slides, 'my-talk_2', TEMPLATE);
    assert.ok(!('error' in r));
    assert.equal(r.mdFile, path.join(slides, 'my-talk_2', 'my-talk_2.md'));
    assert.equal(readFileSync(r.mdFile, 'utf8'), TEMPLATE);
    assert.deepEqual(readdirSync(path.join(slides, 'my-talk_2', 'img')), ['.gitkeep']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('createSlide refuses an existing directory and leaves it untouched', () => {
  const dir = tempDir();
  try {
    mkdirSync(path.join(dir, 'taken'));
    writeFileSync(path.join(dir, 'taken', 'keep.txt'), 'x');
    const r = createSlide(dir, 'taken', TEMPLATE, (p) => path.relative(dir, p));
    assert.deepEqual(r, { error: 'すでに存在します: taken(別の名前を指定してください)' });
    assert.deepEqual(readdirSync(path.join(dir, 'taken')), ['keep.txt']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('createSlide refuses names outside [A-Za-z0-9_-]', () => {
  const dir = tempDir();
  try {
    for (const name of ['', '../x', 'a b', 'a/b', '.', 'スライド', 'a.md']) {
      const r = createSlide(dir, name, TEMPLATE);
      assert.ok('error' in r, name);
      assert.match(r.error, /スライド名が不正です/);
    }
    assert.deepEqual(readdirSync(dir), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the new-slide template builds with the default design without warnings', async () => {
  const result = await buildWith(TEMPLATE, DESIGNS);
  assert.deepEqual(result.reporter.messages, []);
  assert.ok(result.html);
  assert.equal(result.slideCount, 4); // auto title page + 3
  assert.match(result.html, /<span class="title__date">2026-01-01<\/span>/);
  assert.match(result.html, /slide--takahashi/);
  assert.match(result.html, /<pre class="shiki github-light"/);
});

// --- dark design (DETAILED_SPEC.md 8.5) -------------------------------------------

test('a design with highlightTheme github-dark produces github-dark code blocks', async () => {
  const dir = tempDir();
  try {
    mkdirSync(path.join(dir, 'night'));
    writeFileSync(
      path.join(dir, 'night', 'design.json'),
      JSON.stringify({ name: 'Night', highlightTheme: 'github-dark', classes: ['inverse'] }),
    );
    writeFileSync(path.join(dir, 'night', 'design.css'), '.design-night{}');
    const result = await buildWith('---\ndesign: night\n---\n## a\n\n```js\nconst x = 1;\n```\n', dir);
    assert.deepEqual(result.reporter.messages, []);
    assert.match(result.html ?? '', /class="deck design-night" data-design="night"/);
    assert.match(result.html ?? '', /<pre class="shiki github-dark" style="background-color:#24292e;color:#e1e4e8"/);
    assert.doesNotMatch(result.html ?? '', /github-light/);
    // The CLI option overrides the front matter in the same way (-d night).
    const viaOption = await buildWith('## a\n\n```js\nx\n```\n', dir, { design: 'night' });
    assert.match(viaOption.html ?? '', /<pre class="shiki github-dark"/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('loadDesignFrom reports broken designs', () => {
  const dir = tempDir();
  try {
    assert.equal(loadDesignFrom(dir, 'none'), null);
    mkdirSync(path.join(dir, 'bad'));
    writeFileSync(path.join(dir, 'bad', 'design.json'), '{"highlightTheme": 1}');
    assert.throws(() => loadDesignFrom(dir, 'bad'), /highlightTheme は文字列/);
    writeFileSync(path.join(dir, 'bad', 'design.json'), '{}');
    assert.throws(() => loadDesignFrom(dir, 'bad'), /design\.css がありません/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the bundled dark design builds the template with github-dark', { skip: !hasDesign('dark') && 'designs/dark がまだありません' }, async () => {
  const result = await buildWith(TEMPLATE, DESIGNS, { design: 'dark' });
  assert.deepEqual(result.reporter.messages.filter((m) => m.level === 'error'), []);
  assert.match(result.html ?? '', /data-design="dark"/);
  assert.match(result.html ?? '', /<pre class="shiki github-dark"/);
});

// --- dependencies (for --watch) ------------------------------------------------------

test('dependencies list the local files the build read, including missing ones', async () => {
  const files: Record<string, Uint8Array> = {
    '/d/img/a.png': new Uint8Array([1]),
    '/d/icon.svg': new TextEncoder().encode('<svg/>'),
    '/d/w.js': new TextEncoder().encode('x'),
  };
  const src = [
    '---',
    'title: T',
    'icon: icon.svg',
    '---',
    '## a',
    '',
    '![a](img/a.png)',
    '',
    '![b](img/missing.png)',
    '',
    '![c](data:image/png;base64,AA==)',
    '',
    '---',
    '<!-- page: code -->',
    '```js assets="w.js"',
    'x',
    '```',
  ].join('\n');
  const result = await buildWith(src, DESIGNS, { baseDir: '/d', readFile: (p) => files[p] ?? null, design: 'default' });
  assert.deepEqual(result.dependencies, ['/d/icon.svg', '/d/img/a.png', '/d/img/missing.png', '/d/w.js']);
  assert.equal(result.designName, 'default');
  const failed = await buildWith('---\ndesign: nope\n---\n## a\n', DESIGNS);
  assert.equal(failed.html, null);
  assert.equal(failed.designName, 'nope');
  assert.deepEqual(failed.dependencies, []);
});

// --- CLI argument errors (nothing is created) -------------------------------------------

test('cli: --watch with --all is an error', () => {
  const r = cli('--all', '--watch');
  assert.equal(r.code, 1);
  assert.match(r.err, /--watch と --all は同時に使えません/);
});

test('cli: new refuses an invalid or existing name', () => {
  const bad = cli('new', '../escape');
  assert.equal(bad.code, 1);
  assert.match(bad.err, /スライド名が不正です/);
  assert.equal(existsSync(path.join(ROOT, 'escape')), false);
  const taken = cli('new', 'test_slide');
  assert.equal(taken.code, 1);
  assert.match(taken.err, /すでに存在します: slides\/test_slide/);
  const missing = cli('new');
  assert.equal(missing.code, 1);
  assert.match(missing.err, /スライド名を1つ指定してください/);
  const withOption = cli('new', 'x', '--watch');
  assert.equal(withOption.code, 1);
  assert.match(withOption.err, /オプションを指定できません/);
});

test('cli: usage no longer marks watch / new as unimplemented', () => {
  const r = cli('--help');
  assert.equal(r.code, 0);
  assert.doesNotMatch(r.out, /未実装/);
  assert.match(r.out, /--watch/);
});
