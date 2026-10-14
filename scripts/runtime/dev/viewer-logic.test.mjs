// Unit tests for the pure logic in scripts/runtime/viewer.js.
// Run: node --test scripts/runtime/dev/viewer-logic.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../viewer.js", import.meta.url), "utf8");
const context = vm.createContext({});
vm.runInContext(source, context, { filename: "viewer.js" });
const v = context.__cvSlidesViewerInternals;

test("the viewer source can be inlined into <script> and exposes internals without a DOM", () => {
  assert.ok(!/<\/script/i.test(source));
  assert.equal(typeof v.computeFit, "function");
});

test("clampIndex", () => {
  assert.equal(v.clampIndex(3, 10), 3);
  assert.equal(v.clampIndex(-1, 10), 0);
  assert.equal(v.clampIndex(10, 10), 9);
  assert.equal(v.clampIndex(NaN, 10), 0);
  assert.equal(v.clampIndex(2, 0), 0);
});

test("parseHash / formatHash", () => {
  assert.equal(v.parseHash("#5", 10), 4);
  assert.equal(v.parseHash("#1", 10), 0);
  assert.equal(v.parseHash("#99", 10), 9);
  assert.equal(v.parseHash("#0", 10), 0);
  assert.equal(v.parseHash("", 10), null);
  assert.equal(v.parseHash("#abc", 10), null);
  assert.equal(v.parseHash("#-2", 10), null);
  assert.equal(v.formatHash(4), "#5");
});

test("computeFit letterboxes and keeps the aspect ratio", () => {
  const wide = v.computeFit(2000, 900, 1920, 1080);
  assert.equal(wide.scale, 900 / 1080);
  assert.equal(wide.y, 0);
  assert.ok(Math.abs(wide.x - (2000 - 1920 * wide.scale) / 2) < 1e-9);
  const tall = v.computeFit(960, 1000, 1920, 1080);
  assert.equal(tall.scale, 0.5);
  assert.equal(tall.x, 0);
  assert.equal(tall.y, (1000 - 540) / 2);
  assert.equal(v.computeFit(0, 100, 1920, 1080).scale, 0);
});

test("fitLargest finds the largest fitting size", () => {
  assert.equal(v.fitLargest((n) => n <= 237, 1, 360), 237);
  assert.equal(v.fitLargest(() => true, 1, 360), 360);
  assert.equal(v.fitLargest(() => false, 1, 360), 1);
});

test("normalizeWheelDelta", () => {
  assert.equal(v.normalizeWheelDelta(0, 3, 1), 120);
  assert.equal(v.normalizeWheelDelta(0, -1, 2), -800);
  assert.equal(v.normalizeWheelDelta(30, 5, 0), 30);
  assert.equal(v.normalizeWheelDelta(0, 0, 0), 0);
});

function run(gesture, events) {
  return events.map(([delta, time]) => gesture.feed(delta, time)).filter((d) => d !== 0);
}

test("wheel: one mouse notch turns one page; notches after a pause turn again", () => {
  const g = v.createWheelGesture();
  assert.deepEqual(run(g, [[100, 0]]), [1]);
  assert.deepEqual(run(g, [[100, 50], [100, 100], [100, 150]]), []); // same spin
  assert.deepEqual(run(g, [[100, 500]]), [1]); // after a pause
  assert.deepEqual(run(g, [[-100, 1000]]), [-1]);
});

test("wheel: trackpad swipe with inertia turns exactly one page", () => {
  const g = v.createWheelGesture();
  const events = [];
  let t = 0;
  // finger: accelerating, then inertia: exponential decay over ~1.5 s at 60 Hz
  for (const d of [2, 6, 14, 30, 55, 80, 95]) events.push([d, (t += 16)]);
  for (let d = 95; d >= 1; d *= 0.93) events.push([Math.round(d), (t += 16)]);
  assert.deepEqual(run(g, events), [1]);
});

test("wheel: a new swipe during inertia turns another page", () => {
  const g = v.createWheelGesture();
  const events = [];
  let t = 0;
  for (const d of [10, 30, 60, 90]) events.push([d, (t += 16)]);
  for (let d = 90; d >= 30; d *= 0.9) events.push([Math.round(d), (t += 16)]);
  for (const d of [35, 50, 70, 95]) events.push([d, (t += 16)]); // new acceleration
  assert.deepEqual(run(g, events), [1, 1]);
});

test("wheel: reversing direction during a locked gesture turns back", () => {
  const g = v.createWheelGesture();
  assert.deepEqual(run(g, [[60, 0], [50, 16], [-40, 32]]), [1, -1]);
});

test("keyAction", () => {
  assert.equal(v.keyAction("nav", "ArrowDown"), "next");
  assert.equal(v.keyAction("nav", "ArrowLeft"), "prev");
  assert.equal(v.keyAction("nav", "Tab"), "present");
  assert.equal(v.keyAction("nav", "Enter"), "present");
  assert.equal(v.keyAction("nav", " "), null);
  assert.equal(v.keyAction("nav", "Escape"), null);
  assert.equal(v.keyAction("nav", "PageDown"), null);
  assert.equal(v.keyAction("present", "Tab"), "nav");
  assert.equal(v.keyAction("present", "Escape"), "nav");
  assert.equal(v.keyAction("present", " "), "next");
  assert.equal(v.keyAction("present", "Enter"), "next");
  assert.equal(v.keyAction("present", "PageDown"), "next");
  assert.equal(v.keyAction("present", "PageUp"), "prev");
  assert.equal(v.keyAction("present", "Backspace"), "prev");
  assert.equal(v.keyAction("present", "Home"), "first");
  assert.equal(v.keyAction("present", "End"), "last");
});
