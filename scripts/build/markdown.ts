import markdownit from 'markdown-it';
import type { Env, MarkdownIt, Token, RendererRule } from 'markdown-it';
import markdownItAttrs from 'markdown-it-attrs';

const NOTE_COMMENT = /^\s*<!--\s*note\s*:[\s\S]*-->\s*$/;

/** Creates the markdown-it instance with the settings required by DETAILED_SPEC.md 2.4.3. */
export function createMarkdown(): MarkdownIt {
  const md = markdownit({
    html: true,
    linkify: false,
    typographer: false,
    breaks: true,
  });
  md.use(markdownItAttrs, { allowedAttributes: ['width'] });

  const defaultLinkOpen: RendererRule =
    md.renderer.rules.link_open ?? ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));
  md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    if (token) {
      token.attrSet('target', '_blank');
      token.attrSet('rel', 'noopener');
    }
    return defaultLinkOpen(tokens, idx, options, env, self);
  };

  // Speaker notes (<!-- note: ... -->, DETAILED_SPEC.md 4.13) are reserved and never output.
  const defaultHtmlBlock = md.renderer.rules.html_block;
  md.renderer.rules.html_block = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    if (token && NOTE_COMMENT.test(token.content)) return '';
    return defaultHtmlBlock ? defaultHtmlBlock(tokens, idx, options, env, self) : (token?.content ?? '');
  };
  const defaultHtmlInline = md.renderer.rules.html_inline;
  md.renderer.rules.html_inline = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    if (token && NOTE_COMMENT.test(token.content)) return '';
    return defaultHtmlInline ? defaultHtmlInline(tokens, idx, options, env, self) : (token?.content ?? '');
  };

  return md;
}

export function isNoteComment(html: string): boolean {
  return NOTE_COMMENT.test(html);
}

/** A top-level block: tokens from an opening token at nesting level 0 to its matching close. */
export interface Block {
  tokens: Token[];
  /** The first token (e.g. heading_open, paragraph_open, fence). */
  head: Token;
  /** 0-based line range [start, end) within the slide source, when known. */
  map: [number, number] | null;
}

export function splitBlocks(tokens: Token[]): Block[] {
  const blocks: Block[] = [];
  let current: Token[] = [];
  let depth = 0;
  for (const token of tokens) {
    current.push(token);
    depth += token.nesting;
    if (depth === 0) {
      const head = current[0];
      if (head) blocks.push({ tokens: current, head, map: head.map ? [head.map[0], head.map[1]] : null });
      current = [];
    }
  }
  return blocks;
}

/** Renders the inline children of a heading or paragraph block. */
export function renderBlockInline(md: MarkdownIt, block: Block, env: Env = {}): string {
  const inline = block.tokens.find((t) => t.type === 'inline');
  return inline ? md.renderer.renderInline(inline.children ?? [], md.options, env) : '';
}

/** Returns true when an inline token's children are only images (and whitespace / breaks). */
export function isImageOnly(inline: Token): boolean {
  const children = inline.children ?? [];
  let images = 0;
  for (const child of children) {
    if (child.type === 'image') images++;
    else if (child.type === 'softbreak' || child.type === 'hardbreak') continue;
    else if (child.type === 'text' && child.content.trim() === '') continue;
    else return false;
  }
  return images > 0;
}
