import { existsSync, mkdirSync, readdirSync, statSync, watch, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { DESIGN_NAME, buildDeck, type Design, type Runtime } from './build/render.ts';
import { createCodeHighlighter, type CodeHighlighter } from './build/highlight.ts';
import { Utf8Error, loadDesignFrom, readUtf8 } from './build/design.ts';
import { createSlide } from './new_slide.ts';
import { WatchLoop, clockTime, type PathKind, type WatchFn, type WatchSet } from './watch.ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

const USAGE = `使い方:
  ./gen_slide.sh <slide> [オプション]   スライドを生成
  ./gen_slide.sh --all [オプション]     slides/ 以下のスライドをすべて生成
  ./gen_slide.sh <slide> --watch        ファイル変更を監視して自動再生成(Ctrl+C で終了)
  ./gen_slide.sh new <name>             slides/<name>/ に雛形を作成

<slide> には md ファイルのパス(slides/foo/foo.md)か、スライド名(foo → slides/foo/foo.md)を指定します。

オプション:
  -o, --out <path>      出力先(既定: md と同じ場所・同じ名前の .html)
  -d, --design <name>   デザインテンプレート(フロントマターの design より優先)
      --strict          警告をエラーとして扱う(終了コード 1)
      --all             slides/ 以下のスライドをすべて生成
      --watch           md・画像・デザイン・ビューアの変更を監視して再生成(ブラウザは手動で再読み込み)
  -h, --help            この説明を表示`;

class CliError extends Error {}

function readText(file: string): string {
  try {
    return readUtf8(file, rel(file));
  } catch (e) {
    if (e instanceof Utf8Error) throw new CliError(e.message);
    throw e;
  }
}

function rel(file: string): string {
  const r = path.relative(process.cwd(), file);
  return r === '' ? '.' : r;
}

const RUNTIME_FILES = ['viewer.css', 'viewer.js', 'runner.js'] as const;

function runtimePath(name: string): string {
  return path.join(ROOT, 'scripts', 'runtime', name);
}

function loadRuntime(): Runtime {
  const read = (name: (typeof RUNTIME_FILES)[number]): string => {
    const file = runtimePath(name);
    if (!existsSync(file)) throw new CliError(`ビューアのファイルが見つかりません: ${rel(file)}`);
    return readText(file);
  };
  return { css: read('viewer.css'), js: read('viewer.js'), runner: read('runner.js') };
}

function loadDesign(id: string): Design | null {
  return loadDesignFrom(path.join(ROOT, 'designs'), id, rel);
}

function resolveSlidePath(arg: string): string {
  const isPath = arg.endsWith('.md') || arg.includes('/') || arg.includes(path.sep);
  let file = isPath ? path.resolve(arg) : path.join(ROOT, 'slides', arg, `${arg}.md`);
  if (isPath && existsSync(file) && statSync(file).isDirectory()) {
    file = path.join(file, `${path.basename(file)}.md`);
  }
  if (!existsSync(file) || !statSync(file).isFile()) {
    throw new CliError(`md ファイルが見つかりません: ${rel(file)}`);
  }
  return file;
}

function defaultOutPath(mdFile: string): string {
  const p = path.parse(mdFile);
  return path.join(p.dir, `${p.name}.html`);
}

interface Options {
  out?: string | undefined;
  design?: string | undefined;
  strict: boolean;
}

function outPathFor(mdFile: string, opts: Options): string {
  return opts.out !== undefined ? path.resolve(opts.out) : defaultOutPath(mdFile);
}

interface FileBuild {
  ok: boolean;
  /** Local files the build read (see BuildResult.dependencies). */
  dependencies: string[];
  designName: string;
}

/** Builds one slide file. `stamp` prefixes the result line (used by --watch). */
async function buildFile(
  mdFile: string,
  runtime: Runtime,
  highlighter: CodeHighlighter,
  opts: Options,
  stamp = '',
): Promise<FileBuild> {
  const outFile = outPathFor(mdFile, opts);
  if (outFile === mdFile) throw new CliError(`出力先が入力ファイルと同じです: ${rel(outFile)}`);

  const result = await buildDeck(readText(mdFile), {
    file: rel(mdFile),
    baseName: path.parse(mdFile).name,
    baseDir: path.dirname(mdFile),
    highlighter,
    ...(opts.design !== undefined ? { design: opts.design } : {}),
    loadDesign,
    runtime,
  });
  const { reporter } = result;
  for (const m of reporter.sorted()) console.error(reporter.format(m));

  const counts = `エラー ${reporter.errorCount} 件、警告 ${reporter.warningCount} 件`;
  const done = (ok: boolean): FileBuild => ({ ok, dependencies: result.dependencies, designName: result.designName });
  if (result.html === null) {
    console.error(`${stamp}生成を中止しました: ${rel(mdFile)}(${counts})`);
    return done(false);
  }
  if (opts.strict && reporter.warningCount > 0) {
    console.error(`${stamp}--strict のため警告をエラーとして扱い、生成を中止しました: ${rel(mdFile)}(${counts})`);
    return done(false);
  }
  mkdirSync(path.dirname(outFile), { recursive: true });
  writeFileSync(outFile, result.html);
  console.log(`${stamp}生成しました: ${rel(outFile)}(スライド ${result.slideCount} 枚、警告 ${reporter.warningCount} 件)`);
  return done(true);
}

// ---------------------------------------------------------------------------
// --watch
// ---------------------------------------------------------------------------

/** Files and directories one build of `mdFile` depends on. */
function watchSetFor(mdFile: string, opts: Options, build: FileBuild | null): WatchSet {
  const designName = build?.designName ?? opts.design ?? 'default';
  return {
    files: [mdFile, ...RUNTIME_FILES.map(runtimePath), ...(build?.dependencies ?? [])],
    dirs: [
      path.join(path.dirname(mdFile), 'img'),
      ...(DESIGN_NAME.test(designName) ? [path.join(ROOT, 'designs', designName)] : []),
    ],
    ignore: [outPathFor(mdFile, opts)],
  };
}

function statKind(p: string): PathKind {
  try {
    return statSync(p).isDirectory() ? 'dir' : 'file';
  } catch {
    return null;
  }
}

const watchDir: WatchFn = (dir, recursive, onChange, onError) => {
  const listener = (_event: string, filename: string | null): void => onChange(filename);
  let watcher;
  try {
    watcher = watch(dir, { recursive }, listener);
  } catch (e) {
    // Recursive watching is unavailable on some platforms: fall back to the top level.
    if (!recursive || (e as { code?: unknown }).code !== 'ERR_FEATURE_UNAVAILABLE_ON_PLATFORM') throw e;
    watcher = watch(dir, listener);
  }
  watcher.on('error', onError);
  return watcher;
};

function errorText(e: unknown): string {
  if (e instanceof CliError) return e.message;
  return e instanceof Error ? (e.stack ?? e.message) : String(e);
}

/** Builds, then rebuilds on every change until Ctrl+C. Always returns 0. */
async function watchSlide(mdFile: string, opts: Options): Promise<number> {
  const highlighter = await createCodeHighlighter();
  let last: WatchSet | null = null;
  const build = async (changed: string[]): Promise<WatchSet> => {
    const stamp = `[${clockTime(new Date())}] `;
    if (changed.length > 0) {
      const more = changed.length > 1 ? ` ほか ${changed.length - 1} 件` : '';
      console.log(`\n${stamp}変更を検知しました: ${rel(changed[0] ?? '')}${more}`);
    }
    try {
      last = watchSetFor(mdFile, opts, await buildFile(mdFile, loadRuntime(), highlighter, opts, stamp));
    } catch (e) {
      // A build that throws (unreadable md, missing viewer file) keeps the previous watch set.
      console.error(`${stamp}エラー: ${errorText(e)}`);
    }
    return last ?? watchSetFor(mdFile, opts, null);
  };
  const loop = new WatchLoop({
    build,
    watch: watchDir,
    stat: statKind,
    onError: (e) => console.error(`[${clockTime(new Date())}] 監視でエラーが発生しました: ${errorText(e)}`),
  });
  const stopped = new Promise<void>((resolve) => {
    const stop = (): void => {
      loop.stop();
      console.log('\n監視を終了しました');
      resolve();
    };
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
  });
  await loop.start();
  console.log(`監視しています: ${rel(mdFile)}(Ctrl+C で終了。ブラウザは手動で再読み込みしてください)`);
  await stopped;
  return 0;
}

// ---------------------------------------------------------------------------
// new <name>
// ---------------------------------------------------------------------------

function newSlide(name: string): number {
  const template = readText(path.join(ROOT, 'scripts', 'templates', 'new_slide.md'));
  const result = createSlide(path.join(ROOT, 'slides'), name, template, rel);
  if ('error' in result) throw new CliError(result.error);
  console.log(`作成しました: ${rel(result.mdFile)}(画像は ${rel(path.join(result.dir, 'img'))}/ に置きます)`);
  console.log(`\n次のコマンドで生成します:\n  ./gen_slide.sh ${name}\n  ./gen_slide.sh ${name} --watch   # 保存するたびに再生成`);
  return 0;
}

function listAllSlides(): string[] {
  const dir = path.join(ROOT, 'slides');
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => path.join(dir, e.name, `${e.name}.md`))
    .filter((f) => existsSync(f))
    .sort();
}

async function main(argv: string[]): Promise<number> {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      strict: true,
      options: {
        out: { type: 'string', short: 'o' },
        design: { type: 'string', short: 'd' },
        strict: { type: 'boolean', default: false },
        all: { type: 'boolean', default: false },
        watch: { type: 'boolean', default: false },
        help: { type: 'boolean', short: 'h', default: false },
      },
    });
  } catch (e) {
    console.error(`引数が不正です: ${e instanceof Error ? e.message : String(e)}\n\n${USAGE}`);
    return 1;
  }
  const { values, positionals } = parsed;

  if (values.help) {
    console.log(USAGE);
    return 0;
  }
  const opts: Options = { out: values.out, design: values.design, strict: values.strict };
  try {
    if (positionals[0] === 'new') {
      const extra = values.all || values.watch || values.strict || opts.out !== undefined || opts.design !== undefined;
      if (extra) throw new CliError('new コマンドにはオプションを指定できません');
      if (positionals.length !== 2) throw new CliError('new コマンドにはスライド名を1つ指定してください(例: ./gen_slide.sh new my_talk)');
      return newSlide(positionals[1] ?? '');
    }
    if (values.all) {
      if (values.watch) throw new CliError('--watch と --all は同時に使えません(--watch はスライド1つだけを監視します)');
      if (positionals.length > 0) throw new CliError('--all とスライドの指定は同時に使えません');
      if (opts.out !== undefined) throw new CliError('--all と --out は同時に使えません');
      const files = listAllSlides();
      if (files.length === 0) throw new CliError('slides/ にスライドがありません');
      const runtime = loadRuntime();
      const highlighter = await createCodeHighlighter();
      let failed = 0;
      for (const file of files) if (!(await buildFile(file, runtime, highlighter, opts)).ok) failed++;
      console.log(`全 ${files.length} 件: 成功 ${files.length - failed} 件、失敗 ${failed} 件`);
      return failed > 0 ? 1 : 0;
    }

    if (positionals.length !== 1) {
      console.error(positionals.length === 0 ? USAGE : `スライドは1つだけ指定してください\n\n${USAGE}`);
      return 1;
    }
    const mdFile = resolveSlidePath(positionals[0] ?? '');
    if (values.watch) return await watchSlide(mdFile, opts);
    return (await buildFile(mdFile, loadRuntime(), await createCodeHighlighter(), opts)).ok ? 0 : 1;
  } catch (e) {
    if (e instanceof CliError) {
      console.error(`エラー: ${e.message}`);
      return 1;
    }
    throw e;
  }
}

process.exitCode = await main(process.argv.slice(2));
