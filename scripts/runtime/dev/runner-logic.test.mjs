// Unit tests for the pure logic in scripts/runtime/runner.js (console formatter, limiter).
// Run: node --test scripts/runtime/dev/runner-logic.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../runner.js", import.meta.url), "utf8");
const context = vm.createContext({});
vm.runInContext(source, context, { filename: "runner.js" });
const r = context.__cvSlidesRunnerInternals;
// Values must come from the same realm as the formatter (instanceof checks).
const inRealm = (code) => vm.runInContext(code, context);
const fmt = (code, options) => r.formatConsoleArgs(inRealm(code), options);

test("the runner source can be inlined into <script> and exposes internals without a DOM", () => {
  assert.ok(!/<\/script/i.test(source));
  assert.ok(!/<\/style/i.test(source));
  assert.equal(typeof r.formatConsoleArgs, "function");
  assert.equal(typeof r.createLimiterCore, "function");
});

test("formatter: primitives, strings at top level vs nested", () => {
  assert.equal(fmt(`["hello", 42, true, null, undefined, -0, 10n, NaN]`), "hello 42 true null undefined -0 10n NaN");
  assert.equal(fmt(`[["a", "b\\n"]]`), '[ "a", "b\\n" ]');
  assert.equal(fmt(`[Symbol("s")]`), "Symbol(s)");
  assert.equal(fmt(`[[]]`), "[]");
  assert.equal(fmt(`[{}]`), "{}");
});

test("formatter: objects, keys, class instances, functions", () => {
  assert.equal(fmt(`[{ a: 1, "b-c": "x", nested: { ok: [1, 2] } }]`), '{ a: 1, "b-c": "x", nested: { ok: [ 1, 2 ] } }');
  assert.equal(fmt(`class Voice { constructor() { this.f = 440; } }; [new Voice()]`), "Voice { f: 440 }");
  assert.equal(fmt(`[function foo() {}, () => 1, class Bar {}]`), "[Function foo] [Function (anonymous)] [class Bar]");
  assert.equal(fmt(`[Object.create(null)]`), "[Object: null prototype] {}");
});

test("formatter: cycles and depth limit", () => {
  assert.equal(fmt(`const o = { name: "o" }; o.self = o; [o]`), '{ name: "o", self: [Circular] }');
  assert.equal(fmt(`const a = [1]; a.push(a); [a]`), "[ 1, [Circular] ]");
  // A shared (non-cyclic) reference is printed twice.
  assert.equal(fmt(`const s = { v: 1 }; [{ a: s, b: s }]`), "{ a: { v: 1 }, b: { v: 1 } }");
  assert.equal(fmt(`[{ a: { b: { c: { d: 1 } } } }]`), "{ a: { b: { c: [Object] } } }");
  assert.equal(fmt(`[[[[[1]]]]]`), "[ [ [ [Array(1)] ] ] ]");
  assert.equal(fmt(`[{ a: { b: 1 } }]`, { maxDepth: 0 }), "{ a: [Object] }");
});

test("formatter: errors, dates, regexps, collections, typed arrays", () => {
  assert.equal(fmt(`[new TypeError("bad")]`), "TypeError: bad");
  assert.equal(fmt(`[{ e: new Error("x") }]`), "{ e: Error: x }");
  assert.equal(fmt(`[new Date(0), /a+/g]`), "1970-01-01T00:00:00.000Z /a+/g");
  assert.equal(fmt(`[new Map([["k", { v: 1 }]]), new Set([1, "2"])]`), 'Map(1) { "k" => { v: 1 } } Set(2) { 1, "2" }');
  assert.equal(fmt(`[new Float32Array([0.5, 1]), new ArrayBuffer(8)]`), "Float32Array(2) [ 0.5, 1 ] ArrayBuffer { byteLength: 8 }");
});

test("formatter: size limits and throwing getters", () => {
  assert.equal(fmt(`[[1, 2, 3, 4, 5]]`, { maxItems: 2 }), "[ 1, 2, ... 3 more ]");
  assert.equal(fmt(`[{ a: 1, b: 2, c: 3 }]`, { maxItems: 1 }), "{ a: 1, ... 2 more }");
  const long = fmt(`["x".repeat(50)]`, { maxLength: 10 });
  assert.equal(long, "xxxxxxxxxx…");
  assert.equal(fmt(`[{ get bad() { throw new Error("no"); }, ok: 1 }]`), "{ bad: [Getter error], ok: 1 }");
});

/* ---- limiter ---- */

const SR = 48000;

function run(core, signal, channels = 2) {
  const out = [];
  let nan = false;
  let minGain = 1;
  for (let pos = 0; pos < signal.length; pos += 128) {
    const frames = Math.min(128, signal.length - pos);
    const input = [];
    for (let c = 0; c < channels; c++) input.push(Float32Array.from(signal.slice(pos, pos + frames)));
    const output = [new Float32Array(frames), new Float32Array(frames)];
    const stats = core.process(input, output, frames);
    nan = nan || stats.nan;
    minGain = Math.min(minGain, stats.minGain);
    out.push(...output[0]);
  }
  return { out, nan, minGain };
}

const sine = (amp, freq, seconds) => Array.from({ length: Math.round(seconds * SR) }, (_, i) => amp * Math.sin((2 * Math.PI * freq * i) / SR));
const peakOf = (xs) => xs.reduce((m, v) => Math.max(m, Math.abs(v)), 0);

test("limiter: quiet signal passes unchanged, delayed by the 5 ms look-ahead", () => {
  const core = r.createLimiterCore(SR, {});
  assert.equal(core.delay, 240);
  const input = sine(0.5, 440, 0.1);
  const { out, minGain } = run(core, input);
  assert.equal(minGain, 1);
  for (let i = 240; i < out.length; i++) assert.ok(Math.abs(out[i] - Math.fround(input[i - 240])) < 1e-6);
  for (let i = 0; i < 240; i++) assert.equal(out[i], 0);
});

test("limiter: +12 dB sine never exceeds -1 dBFS (not even at the attack) and reports gain reduction", () => {
  const core = r.createLimiterCore(SR, {});
  const threshold = Math.pow(10, -1 / 20);
  const { out, minGain } = run(core, sine(3.98, 220, 0.5));
  assert.ok(peakOf(out) <= threshold + 1e-6, `peak ${peakOf(out)}`);
  assert.ok(peakOf(out.slice(SR * 0.1)) > threshold - 0.01); // limited, not silenced
  const grDb = -20 * Math.log10(minGain);
  assert.ok(grDb > 12 && grDb < 13.5, `gr ${grDb}`);
});

test("limiter: a single-sample spike is caught by the look-ahead", () => {
  const core = r.createLimiterCore(SR, {});
  const signal = new Array(4800).fill(0);
  signal[1000] = 100;
  const { out } = run(core, signal);
  assert.ok(peakOf(out) <= Math.pow(10, -1 / 20) + 1e-6);
  assert.ok(peakOf(out) > 0.8);
});

test("limiter: release recovers the gain over ~100 ms", () => {
  const core = r.createLimiterCore(SR, {});
  // loud burst, then a quiet steady tone; measure the gain on the quiet part
  const signal = [...sine(4, 1000, 0.05), ...sine(0.1, 1000, 0.6)];
  const { out } = run(core, signal);
  const gainAt = (t) => peakOf(out.slice(Math.round(t * SR), Math.round(t * SR) + 480)) / 0.1;
  assert.ok(gainAt(0.06) < 0.5); // still reduced right after the burst
  const g1 = gainAt(0.05 + 0.005 + 0.1); // one time constant later: ~63% recovered
  assert.ok(g1 > 0.55 && g1 < 0.85, `g1 ${g1}`);
  assert.ok(gainAt(0.6) > 0.98); // fully recovered
});

test("limiter: NaN / Infinity become 0 and are reported; output stays finite and within ±1", () => {
  const core = r.createLimiterCore(SR, {});
  const signal = sine(0.5, 440, 0.05);
  signal[10] = NaN;
  signal[20] = Infinity;
  signal[30] = -Infinity;
  const { out, nan } = run(core, signal);
  assert.equal(nan, true);
  assert.ok(out.every((v) => Number.isFinite(v) && Math.abs(v) <= 1));
  assert.equal(out[240 + 10], 0);
  // later blocks without NaN report false
  assert.equal(run(core, sine(0.5, 440, 0.01)).nan, false);
});

test("limiter: mono input is applied to both outputs; no input gives silence", () => {
  const core = r.createLimiterCore(SR, {});
  const output = [new Float32Array(128), new Float32Array(128)];
  core.process([Float32Array.from({ length: 128 }, () => 0.5)], output, 128);
  core.process([Float32Array.from({ length: 128 }, () => 0.5)], output, 128);
  assert.ok(output[0][127] === output[1][127] && Math.abs(output[0][127] - 0.5) < 1e-6);
  const silent = [new Float32Array(128), new Float32Array(128)];
  for (let i = 0; i < 4; i++) core.process([], silent, 128);
  assert.ok(silent[0].every((v) => v === 0));
});

test("limiter module source is valid JS and registers the processor", () => {
  const registered = [];
  const scope = vm.createContext({
    AudioWorkletProcessor: class { constructor() { this.port = { postMessage() {} }; } },
    registerProcessor: (name, ctor) => registered.push([name, ctor]),
    sampleRate: SR
  });
  vm.runInContext(r.limiterModuleSource(), scope);
  assert.equal(registered[0][0], "cv-slides-limiter");
  const proc = new registered[0][1]({ processorOptions: {} });
  const outputs = [[new Float32Array(128), new Float32Array(128)]];
  assert.equal(proc.process([[new Float32Array(128).fill(5), new Float32Array(128).fill(5)]], outputs), true);
});

test("srcdoc: Run/Stop only when runnable, no closing tags inside the script, JSON is escaped", () => {
  const theme = { fg: "#111", bg: "#eee", accent: "#e8590c", "font-sans": "x</style><b>" };
  const doc = r.buildSrcdoc(theme, { runnable: true, name: "run.js" });
  assert.match(doc, /id="run"/);
  assert.match(doc, /id="stop" disabled/);
  assert.equal(doc.match(/<\/script/gi).length, 1);
  assert.equal(doc.match(/<\/style/gi).length, 1);
  const none = r.buildSrcdoc(theme, { runnable: false });
  assert.doesNotMatch(none, /id="run"/);
  assert.doesNotMatch(none, /<script/);
  assert.equal(r.jsonForScript({ s: "</script>" }), '{"s":"\\u003c/script>"}');
});

test("srcdoc: the run code name is sanitized and its sourceURL value is encoded", () => {
  assert.equal(r.scriptName("sine.js"), "sine.js");
  assert.equal(r.scriptName(undefined), "run.js");
  assert.equal(r.scriptName(""), "run.js");
  assert.equal(r.scriptName(42), "run.js");
  assert.equal(r.scriptName("x.js\nalert(1) y \r\t\u0000"), "x.jsalert(1)y");
  assert.equal(r.scriptName(" \n "), "run.js");
  // V8 ignores a sourceURL with whitespace or quotes; those are percent-encoded.
  assert.equal(r.sourceUrlFor("sine.js"), "sine.js");
  assert.equal(r.sourceUrlFor("dir/sub/x.js"), "dir/sub/x.js");
  assert.equal(r.sourceUrlFor("my demo's \"x\".js"), "my%20demo%27s%20%22x%22.js");
  assert.equal(r.sourceUrlFor("全角　空白.js"), "全角%E3%80%80空白.js");
  const theme = { fg: "#111", bg: "#eee" };
  const doc = r.buildSrcdoc(theme, { runnable: true, name: "a b\n</script>.js" });
  assert.match(doc, /"name":"a b\\u003c\/script>\.js","sourceUrl":"a%20b\\u003c\/script>\.js"/);
  assert.equal(doc.match(/<\/script/gi).length, 1);
  assert.match(r.buildSrcdoc(theme, { runnable: true }), /"name":"run\.js","sourceUrl":"run\.js"/);
});
