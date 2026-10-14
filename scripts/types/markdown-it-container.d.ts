// markdown-it-container 4.0.0 ships no type declarations.
declare module 'markdown-it-container' {
  import type { Env, MarkdownIt, MarkdownItOptions, Renderer, Token } from 'markdown-it';

  interface ContainerOptions {
    validate?: (params: string, markup: string) => boolean;
    render?: (
      tokens: Token[],
      idx: number,
      options: Required<MarkdownItOptions>,
      env: Env | undefined,
      self: Renderer,
    ) => string;
    marker?: string;
  }

  export default function container(md: MarkdownIt, name: string, options?: ContainerOptions): void;
}
