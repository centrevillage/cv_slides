import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { buildDeck, type Design, type Runtime } from './build/render.ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

const USAGE = `使い方:
  ./gen_slide.sh <slide> [オプション]   スライドを生成
  ./gen_slide.sh --all [オプション]     slides/ 以下のスライドをすべて生成
  ./gen_slide.sh <slide> --watch        ファイル変更を監視して自動再生成(未実装)
  ./gen_slide.sh new <name>             slides/<name>/ に雛形を作成(未実装)

<slide> には md ファイルのパス(slides/foo/foo.md)か、スライド名(foo → slides/foo/foo.md)を指定します。

オプション:
  -o, --out <path>      出力先(既定: md と同じ場所・同じ名前の .html)
  -d, --design <name>   デザインテンプレート(フロントマターの design より優先)
      --strict          警告をエラーとして扱う(終了コード 1)
      --all             slides/ 以下のスライドをすべて生成
  -h, --help            この説明を表示`;

class CliError extends Error {}

function readText(file: string): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(readFileSync(file));
  } catch (e) {
    if (e instanceof TypeError) throw new CliError(`UTF-8 として読めません: ${rel(file)}`);
    throw e;
  }
}

function rel(file: string): string {
  const r = path.relative(process.cwd(), file);
  return r === '' ? '.' : r;
}

function loadRuntime(): Runtime {
  const read = (name: string): string => {
    const file = path.join(ROOT, 'scripts', 'runtime', name);
    if (!existsSync(file)) throw new CliError(`ビューアのファイルが見つかりません: ${rel(file)}`);
    return readText(file);
  };
  return { css: read('viewer.css'), js: read('viewer.js') };
}

function loadDesign(id: string): Design | null {
  const dir = path.join(ROOT, 'designs', id);
  const jsonFile = path.join(dir, 'design.json');
  if (!existsSync(jsonFile)) return null;
  let meta: unknown;
  try {
    meta = JSON.parse(readText(jsonFile));
  } catch (e) {
    throw new Error(`design.json が不正です(${e instanceof Error ? e.message : String(e)})`);
  }
  if (typeof meta !== 'object' || meta === null || Array.isArray(meta)) {
    throw new Error('design.json はオブジェクトにしてください');
  }
  const classes = (meta as { classes?: unknown }).classes ?? [];
  if (!Array.isArray(classes) || !classes.every((c): c is string => typeof c === 'string')) {
    throw new Error('design.json の classes は文字列の配列にしてください');
  }
  const cssFile = path.join(dir, 'design.css');
  if (!existsSync(cssFile)) throw new Error(`design.css がありません(${rel(cssFile)})`);
  return { id, css: readText(cssFile), classes };
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

/** Builds one slide file. Returns true on success. */
function buildFile(mdFile: string, runtime: Runtime, opts: Options): boolean {
  const outFile = opts.out !== undefined ? path.resolve(opts.out) : defaultOutPath(mdFile);
  if (outFile === mdFile) throw new CliError(`出力先が入力ファイルと同じです: ${rel(outFile)}`);

  const result = buildDeck(readText(mdFile), {
    file: rel(mdFile),
    baseName: path.parse(mdFile).name,
    ...(opts.design !== undefined ? { design: opts.design } : {}),
    loadDesign,
    runtime,
  });
  const { reporter } = result;
  for (const m of reporter.sorted()) console.error(reporter.format(m));

  const counts = `エラー ${reporter.errorCount} 件、警告 ${reporter.warningCount} 件`;
  if (result.html === null) {
    console.error(`生成を中止しました: ${rel(mdFile)}(${counts})`);
    return false;
  }
  if (opts.strict && reporter.warningCount > 0) {
    console.error(`--strict のため警告をエラーとして扱い、生成を中止しました: ${rel(mdFile)}(${counts})`);
    return false;
  }
  mkdirSync(path.dirname(outFile), { recursive: true });
  writeFileSync(outFile, result.html);
  console.log(`生成しました: ${rel(outFile)}(スライド ${result.slideCount} 枚、警告 ${reporter.warningCount} 件)`);
  return true;
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

function main(argv: string[]): number {
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
  if (positionals[0] === 'new') {
    console.error('new コマンドは未実装です');
    return 1;
  }
  if (values.watch) {
    console.error('--watch は未実装です');
    return 1;
  }

  const opts: Options = { out: values.out, design: values.design, strict: values.strict };
  try {
    if (values.all) {
      if (positionals.length > 0) throw new CliError('--all とスライドの指定は同時に使えません');
      if (opts.out !== undefined) throw new CliError('--all と --out は同時に使えません');
      const files = listAllSlides();
      if (files.length === 0) throw new CliError('slides/ にスライドがありません');
      const runtime = loadRuntime();
      let failed = 0;
      for (const file of files) if (!buildFile(file, runtime, opts)) failed++;
      console.log(`全 ${files.length} 件: 成功 ${files.length - failed} 件、失敗 ${failed} 件`);
      return failed > 0 ? 1 : 0;
    }

    if (positionals.length !== 1) {
      console.error(positionals.length === 0 ? USAGE : `スライドは1つだけ指定してください\n\n${USAGE}`);
      return 1;
    }
    const mdFile = resolveSlidePath(positionals[0] ?? '');
    return buildFile(mdFile, loadRuntime(), opts) ? 0 : 1;
  } catch (e) {
    if (e instanceof CliError) {
      console.error(`エラー: ${e.message}`);
      return 1;
    }
    throw e;
  }
}

process.exitCode = main(process.argv.slice(2));
