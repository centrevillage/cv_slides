import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { Design } from './render.ts';

// ---------------------------------------------------------------------------
// Design templates on disk (DETAILED_SPEC.md 8.1)
// ---------------------------------------------------------------------------

/** Thrown when a text file is not valid UTF-8. */
export class Utf8Error extends Error {}

/** Reads a UTF-8 text file strictly (invalid bytes throw Utf8Error; `label` names the file). */
export function readUtf8(file: string, label: string = file): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(readFileSync(file));
  } catch (e) {
    if (e instanceof TypeError) throw new Utf8Error(`UTF-8 として読めません: ${label}`);
    throw e;
  }
}

/**
 * Loads designs/<id>/ from `designsDir`. Returns null when design.json does not exist; throws
 * (with a Japanese message) when the design is broken. `label` turns paths into message text.
 */
export function loadDesignFrom(
  designsDir: string,
  id: string,
  label: (file: string) => string = (file) => file,
): Design | null {
  const dir = path.join(designsDir, id);
  const jsonFile = path.join(dir, 'design.json');
  if (!existsSync(jsonFile)) return null;
  let meta: unknown;
  try {
    meta = JSON.parse(readUtf8(jsonFile, label(jsonFile)));
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
  const highlightTheme = (meta as { highlightTheme?: unknown }).highlightTheme ?? 'github-light';
  if (typeof highlightTheme !== 'string') throw new Error('design.json の highlightTheme は文字列にしてください');
  const cssFile = path.join(dir, 'design.css');
  if (!existsSync(cssFile)) throw new Error(`design.css がありません(${label(cssFile)})`);
  return { id, css: readUtf8(cssFile, label(cssFile)), classes, highlightTheme };
}
