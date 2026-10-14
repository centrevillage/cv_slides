import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  Reporter,
  analyzeSlide,
  isH1Only,
  normalizeSource,
  parseDirective,
  parseFrontMatter,
  splitFrontMatter,
  splitSlides,
  type RawSlide,
} from '../build/parse.ts';

function fm(text: string, parser?: (t: string) => unknown) {
  const reporter = new Reporter('t.md');
  const src = normalizeSource(text);
  const split = splitFrontMatter(src, reporter);
  const data = parseFrontMatter(split.yaml, reporter, parser);
  return { reporter, split, data };
}

function raw(source: string, line = 1, index = 0): RawSlide {
  return { index, line, source };
}

test('normalizeSource strips BOM and normalizes CRLF', () => {
  assert.equal(normalizeSource('\uFEFFa\r\nb\rc\n'), 'a\nb\nc\n');
});

test('front matter: valid keys, dates stay strings, defaults', () => {
  const { reporter, data, split } = fm(
    '---\ntitle: T\nsubtitle: S\nauthor: A\ndate: 2026-11-03\nevent: E\nicon: img/me.png\ndesign: dark\n---\n## x\n',
  );
  assert.equal(reporter.messages.length, 0);
  assert.deepEqual(data, {
    page_number: true,
    title: 'T',
    subtitle: 'S',
    author: 'A',
    date: '2026-11-03',
    event: 'E',
    icon: 'img/me.png',
    design: 'dark',
  });
  assert.equal(split.body, '## x\n');
  assert.equal(split.bodyLine, 10);
});

test('front matter: page_number false', () => {
  const { reporter, data } = fm('---\npage_number: false\n---\n');
  assert.equal(reporter.errorCount, 0);
  assert.equal(data.page_number, false);
});

test('front matter: only when line 1 is ---', () => {
  const { split } = fm('\n---\ntitle: T\n---\n');
  assert.equal(split.yaml, null);
});

test('front matter: invalid YAML is an error', () => {
  const { reporter } = fm('---\ntitle: [unclosed\n---\n');
  assert.equal(reporter.errorCount, 1);
  assert.match(reporter.messages[0]?.text ?? '', /YAMLが不正/);
  assert.equal(reporter.messages[0]?.line, 1);
});

test('front matter: deeply nested YAML is an error, not a crash', () => {
  const n = 100000;
  const { reporter } = fm(`---\na: ${'['.repeat(n)}${']'.repeat(n)}\n---\n`);
  assert.equal(reporter.errorCount, 1);
  assert.match(reporter.messages[0]?.text ?? '', /YAMLが不正/);
});

test('front matter: RangeError thrown by the parser is an error', () => {
  const { reporter } = fm('---\na: 1\n---\n', () => {
    throw new RangeError('Maximum call stack size exceeded');
  });
  assert.equal(reporter.errorCount, 1);
  assert.match(reporter.messages[0]?.text ?? '', /RangeError/);
});

test('front matter: unclosed block is an error', () => {
  const { reporter } = fm('---\ntitle: T\n## slide\n');
  assert.equal(reporter.errorCount, 1);
  assert.match(reporter.messages[0]?.text ?? '', /閉じていません/);
});

test('front matter: wrong types are errors with the key line', () => {
  const { reporter, data } = fm('---\ntitle: T\ndate: 2026\npage_number: "no"\n---\n');
  assert.equal(reporter.errorCount, 2);
  assert.deepEqual(
    reporter.messages.map((m) => m.line),
    [3, 4],
  );
  assert.equal(data.date, undefined);
  assert.equal(data.page_number, true);
});

test('front matter: non-object result is an error', () => {
  assert.equal(fm('---\n- a\n- b\n---\n').reporter.errorCount, 1);
  assert.equal(fm('---\njust a string\n---\n').reporter.errorCount, 1);
});

test('front matter: empty block is allowed', () => {
  const { reporter, data } = fm('---\n---\n## x\n');
  assert.equal(reporter.messages.length, 0);
  assert.equal(data.page_number, true);
});

test('front matter: unknown keys are warnings', () => {
  const { reporter } = fm('---\ntitle: T\ntheme: x\n---\n');
  assert.equal(reporter.errorCount, 0);
  assert.equal(reporter.warningCount, 1);
  assert.match(reporter.messages[0]?.text ?? '', /theme/);
  assert.equal(reporter.messages[0]?.line, 3);
});

test('splitSlides: separators and line numbers', () => {
  const reporter = new Reporter('t.md');
  const slides = splitSlides('## a\n\n---\n## b\n  -----  \n## c', 5, reporter);
  assert.deepEqual(
    slides.map((s) => [s.index, s.line, s.source.trim()]),
    [
      [0, 5, '## a'],
      [1, 8, '## b'],
      [2, 10, '## c'],
    ],
  );
  assert.equal(reporter.messages.length, 0);
});

test('splitSlides: --- inside fenced code is not a separator', () => {
  const reporter = new Reporter('t.md');
  const body = [
    '## a',
    '```yaml',
    '---',
    'key: v',
    '```',
    '~~~~',
    '---',
    '~~~',
    '---',
    '~~~~',
    '````md',
    '```',
    '---',
    '```',
    '````',
    '---',
    '## b',
  ].join('\n');
  const slides = splitSlides(body, 1, reporter);
  assert.equal(slides.length, 2);
  assert.equal(slides[1]?.source, '## b');
  assert.equal(slides[1]?.line, 17);
});

test('splitSlides: empty slides are skipped with a warning', () => {
  const reporter = new Reporter('t.md');
  const slides = splitSlides('## a\n---\n\n---\n## b\n---\n', 1, reporter);
  assert.equal(slides.length, 2);
  assert.deepEqual(
    slides.map((s) => s.index),
    [0, 1],
  );
  assert.equal(reporter.warningCount, 2);
  assert.equal(reporter.messages[0]?.line, 2);
});

test('splitSlides: *** is not a separator', () => {
  const slides = splitSlides('a\n***\nb', 1, new Reporter('t.md'));
  assert.equal(slides.length, 1);
});

test('directive: page, class and removal of the directive line', () => {
  const reporter = new Reporter('t.md');
  const { directive, source } = parseDirective(raw('\n<!-- page: content, class: inverse -->\n## x'), reporter);
  assert.deepEqual(directive, { page: 'content', classes: ['inverse'] });
  assert.equal(source, '\n\n## x');
  assert.equal(reporter.messages.length, 0);
});

test('directive: unknown page type is an error', () => {
  const reporter = new Reporter('t.md');
  parseDirective(raw('<!-- page: chart -->\n## x', 10, 3), reporter);
  assert.equal(reporter.errorCount, 1);
  assert.equal(reporter.messages[0]?.line, 10);
  assert.equal(reporter.messages[0]?.slide, 3);
});

test('directive: unknown key is a warning', () => {
  const reporter = new Reporter('t.md');
  const { directive } = parseDirective(raw('<!-- page: takahashi, color: red -->\nx'), reporter);
  assert.equal(directive.page, 'takahashi');
  assert.equal(reporter.warningCount, 1);
});

test('directive: fit outside an image page is a warning', () => {
  const reporter = new Reporter('t.md');
  parseDirective(raw('<!-- page: content, fit: cover -->\nx'), reporter);
  assert.equal(reporter.warningCount, 1);
});

test('directive: only on the first non-empty line', () => {
  const reporter = new Reporter('t.md');
  const { directive } = parseDirective(raw('## x\n<!-- page: takahashi -->'), reporter);
  assert.equal(directive.page, undefined);
});

test('directive: ordinary comments and notes are not directives', () => {
  const reporter = new Reporter('t.md');
  for (const c of ['<!-- note: hello -->', '<!-- TODO -->', '<!-- see: http://x -->']) {
    const r = parseDirective(raw(`${c}\n## x`), reporter);
    assert.equal(r.directive.page, undefined);
    assert.equal(r.source, `${c}\n## x`);
  }
  assert.equal(reporter.messages.length, 0);
});

test('H1 shorthand: only H1 lines make a takahashi page', () => {
  assert.equal(isH1Only('# 音を書く'), true);
  assert.equal(isH1Only('\n# 音を\n# 書く\n'), true);
  assert.equal(isH1Only('# 音を\ntext'), false);
  assert.equal(isH1Only('## 音を'), false);
  assert.equal(isH1Only('#音を'), false);
  const reporter = new Reporter('t.md');
  assert.equal(analyzeSlide(raw('# a\n# b'), reporter).type, 'takahashi');
  assert.equal(analyzeSlide(raw('# a\n\n- x'), reporter).type, 'content');
  assert.equal(analyzeSlide(raw('<!-- page: content -->\n# a'), reporter).type, 'content');
});

test('code page type warns as not implemented; image page does not', () => {
  const reporter = new Reporter('t.md');
  const slide = analyzeSlide(raw('<!-- page: code -->\n## x'), reporter);
  assert.equal(slide.type, 'code');
  assert.equal(reporter.warningCount, 1);
  assert.match(reporter.messages[0]?.text ?? '', /未実装/);
  const image = analyzeSlide(raw('<!-- page: image -->\n![a](b.png)'), reporter);
  assert.equal(image.type, 'image');
  assert.equal(reporter.warningCount, 1);
});

test('Reporter.format includes file:line and the page number', () => {
  const reporter = new Reporter('slides/a/a.md');
  reporter.warn('x', { line: 12, slide: 0 });
  reporter.pageOffset = 1;
  assert.equal(reporter.format(reporter.messages[0]!), 'slides/a/a.md:12: 警告: [スライド 2] x');
});

test('splitSlides: line points at the first content line', () => {
  const slides = splitSlides('## a\n---\n\n\n<!-- page: code -->\n## b', 1, new Reporter('t.md'));
  assert.equal(slides[1]?.line, 5);
  assert.equal(slides[1]?.source, '<!-- page: code -->\n## b');
});

test('H1 shorthand ignores one-line comments', () => {
  assert.equal(isH1Only('# 音\n<!-- note: x -->'), true);
});
