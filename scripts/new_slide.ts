import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

// ---------------------------------------------------------------------------
// `new <name>` (DETAILED_SPEC.md 3.1, Q49): slides/<name>/<name>.md and img/
// ---------------------------------------------------------------------------

export const SLIDE_NAME = /^[A-Za-z0-9_-]+$/;

export type NewSlideResult = { dir: string; mdFile: string } | { error: string };

/**
 * Creates `<slidesDir>/<name>/<name>.md` (from `template`) and an empty img/ with a .gitkeep.
 * Refuses an invalid name or an existing directory. `label` turns paths into message text.
 */
export function createSlide(
  slidesDir: string,
  name: string,
  template: string,
  label: (p: string) => string = (p) => p,
): NewSlideResult {
  if (!SLIDE_NAME.test(name)) {
    return { error: `スライド名が不正です: "${name}"(英数字・-・_ だけを使えます)` };
  }
  const dir = path.join(slidesDir, name);
  if (existsSync(dir)) return { error: `すでに存在します: ${label(dir)}(別の名前を指定してください)` };
  mkdirSync(slidesDir, { recursive: true });
  try {
    mkdirSync(dir);
  } catch (e) {
    if ((e as { code?: unknown }).code === 'EEXIST') return { error: `すでに存在します: ${label(dir)}(別の名前を指定してください)` };
    throw e;
  }
  const mdFile = path.join(dir, `${name}.md`);
  mkdirSync(path.join(dir, 'img'));
  writeFileSync(path.join(dir, 'img', '.gitkeep'), '');
  writeFileSync(mdFile, template, { flag: 'wx' });
  return { dir, mdFile };
}
