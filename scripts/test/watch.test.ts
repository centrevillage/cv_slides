import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WatchLoop, clockTime, planWatch, type PathKind, type Timers, type WatchSet } from '../watch.ts';

// --- fakes -------------------------------------------------------------------

function fakeStat(entries: Record<string, 'file' | 'dir'>): (p: string) => PathKind {
  return (p) => entries[p] ?? null;
}

const FS: Record<string, 'file' | 'dir'> = {
  '/': 'dir',
  '/p': 'dir',
  '/p/slides': 'dir',
  '/p/slides/a': 'dir',
  '/p/slides/a/a.md': 'file',
  '/p/slides/a/img': 'dir',
  '/p/slides/a/img/x.png': 'file',
  '/p/designs': 'dir',
  '/p/designs/default': 'dir',
  '/p/runtime': 'dir',
  '/p/runtime/viewer.js': 'file',
};

class FakeTimers implements Timers {
  #next = 1;
  readonly pending = new Map<number, { fn: () => void; ms: number }>();
  setTimeout(fn: () => void, ms: number): unknown {
    const id = this.#next++;
    this.pending.set(id, { fn, ms });
    return id;
  }
  clearTimeout(handle: unknown): void {
    this.pending.delete(handle as number);
  }
  /** Fires every pending timer. */
  flush(): void {
    const due = [...this.pending.values()];
    this.pending.clear();
    for (const t of due) t.fn();
  }
}

interface FakeWatcher {
  dir: string;
  recursive: boolean;
  closed: boolean;
  emit: (filename: string | null) => void;
  fail: (error: unknown) => void;
}

function setup(sets: WatchSet[], opts: { throwOn?: number } = {}) {
  const timers = new FakeTimers();
  const watchers: FakeWatcher[] = [];
  const builds: string[][] = [];
  const errors: unknown[] = [];
  let release: (() => void) | null = null;
  let hold = false;
  const loop = new WatchLoop({
    build: async (changed) => {
      builds.push(changed);
      if (hold) await new Promise<void>((r) => (release = r));
      if (builds.length === opts.throwOn) throw new Error('boom');
      return sets[Math.min(builds.length - 1, sets.length - 1)] ?? { files: [], dirs: [] };
    },
    watch: (dir, recursive, onChange, onError) => {
      const w: FakeWatcher = { dir, recursive, closed: false, emit: onChange, fail: onError };
      watchers.push(w);
      return { close: () => void (w.closed = true) };
    },
    stat: fakeStat(FS),
    timers,
    onError: (e) => errors.push(e),
  });
  const open = () => watchers.filter((w) => !w.closed);
  const find = (dir: string) => {
    const w = open().find((x) => x.dir === dir);
    assert.ok(w, `no watcher for ${dir}`);
    return w;
  };
  return {
    loop,
    timers,
    builds,
    errors,
    open,
    find,
    holdBuilds: (on: boolean) => void (hold = on),
    release: () => release?.(),
  };
}

const SET_A: WatchSet = {
  files: ['/p/slides/a/a.md', '/p/runtime/viewer.js', '/p/slides/a/img/x.png'],
  dirs: ['/p/slides/a/img', '/p/designs/default'],
  ignore: ['/p/slides/a/a.html'],
};

// --- planWatch ---------------------------------------------------------------

test('planWatch: files are watched through their parent, directories recursively', () => {
  assert.deepEqual(planWatch(SET_A, fakeStat(FS)), [
    { dir: '/p/designs/default', recursive: true, names: null },
    { dir: '/p/runtime', recursive: false, names: ['viewer.js'] },
    { dir: '/p/slides/a', recursive: false, names: ['a.md'] },
    // x.png is inside the recursively watched img/: the merged target matches any change.
    { dir: '/p/slides/a/img', recursive: true, names: null },
  ]);
});

test('planWatch: missing paths are watched through the nearest existing ancestor', () => {
  const plan = planWatch(
    {
      files: ['/p/slides/a/a.md', '/p/slides/a/pics/new/y.png', '/p/slides/a/missing.png'],
      dirs: ['/p/designs/dark'],
    },
    fakeStat(FS),
  );
  assert.deepEqual(plan, [
    { dir: '/p/designs', recursive: false, names: ['dark'] },
    { dir: '/p/slides/a', recursive: false, names: ['a.md', 'missing.png', 'pics'] },
  ]);
});

test('planWatch: nothing to watch for the root itself', () => {
  assert.deepEqual(planWatch({ files: ['/'], dirs: [] }, fakeStat(FS)), []);
});

// --- WatchLoop ---------------------------------------------------------------

test('start builds once and watches the planned directories', async () => {
  const t = setup([SET_A]);
  await t.loop.start();
  assert.deepEqual(t.builds, [[]]);
  assert.deepEqual(
    t.open().map((w) => `${w.dir}:${w.recursive}`),
    ['/p/designs/default:true', '/p/runtime:false', '/p/slides/a:false', '/p/slides/a/img:true'],
  );
  assert.equal(t.timers.pending.size, 0);
});

test('changes are debounced into one rebuild', async () => {
  const t = setup([SET_A]);
  await t.loop.start();
  t.find('/p/slides/a').emit('a.md');
  t.find('/p/slides/a/img').emit('x.png');
  t.find('/p/designs/default').emit('fonts/a.woff2');
  assert.equal(t.timers.pending.size, 1);
  assert.equal([...t.timers.pending.values()][0]?.ms, 200);
  assert.equal(t.builds.length, 1);
  t.timers.flush();
  await t.loop.idle();
  assert.deepEqual(t.builds, [
    [],
    ['/p/designs/default/fonts/a.woff2', '/p/slides/a/a.md', '/p/slides/a/img/x.png'],
  ]);
});

test('unrelated files and the output HTML are ignored', async () => {
  const t = setup([SET_A]);
  await t.loop.start();
  t.find('/p/slides/a').emit('a.html');
  t.find('/p/slides/a').emit('.a.md.swp');
  t.find('/p/runtime').emit('runner.js.bak');
  assert.equal(t.timers.pending.size, 0);
  t.find('/p/slides/a').emit(null); // unknown filename: rebuild to be safe
  assert.equal(t.timers.pending.size, 1);
});

test('a change during a build schedules another rebuild after it', async () => {
  const t = setup([SET_A]);
  await t.loop.start();
  t.holdBuilds(true);
  t.find('/p/slides/a').emit('a.md');
  t.timers.flush();
  assert.equal(t.builds.length, 2);
  t.find('/p/slides/a').emit('a.md'); // while building
  assert.equal(t.timers.pending.size, 0);
  t.holdBuilds(false);
  t.release();
  await t.loop.idle();
  assert.equal(t.timers.pending.size, 1);
  t.timers.flush();
  await t.loop.idle();
  assert.equal(t.builds.length, 3);
});

test('a failing build is reported and watching continues', async () => {
  const t = setup([SET_A], { throwOn: 2 });
  await t.loop.start();
  t.find('/p/slides/a').emit('a.md');
  t.timers.flush();
  await t.loop.idle();
  assert.equal(t.errors.length, 1);
  assert.equal(t.open().length, 4);
  t.find('/p/slides/a').emit('a.md');
  t.timers.flush();
  await t.loop.idle();
  assert.equal(t.builds.length, 3);
});

test('the watched set is recomputed after each build', async () => {
  const setB: WatchSet = { files: ['/p/slides/a/a.md'], dirs: ['/p/designs/dark'] };
  const t = setup([SET_A, setB]);
  await t.loop.start();
  const mdWatcher = t.find('/p/slides/a');
  mdWatcher.emit('a.md');
  t.timers.flush();
  await t.loop.idle();
  assert.deepEqual(
    t.open().map((w) => w.dir),
    ['/p/slides/a', '/p/designs'],
  );
  assert.equal(t.find('/p/slides/a'), mdWatcher, 'an unchanged directory keeps its watcher');
  assert.deepEqual(t.loop.targets.find((x) => x.dir === '/p/designs')?.names, ['dark']);
  t.find('/p/designs').emit('default'); // filtered: only "dark" counts now
  assert.equal(t.timers.pending.size, 0);
  t.find('/p/designs').emit('dark');
  assert.equal(t.timers.pending.size, 1);
});

test('a failed watcher is dropped and triggers a rebuild that re-plans', async () => {
  const t = setup([SET_A]);
  await t.loop.start();
  const w = t.find('/p/designs/default');
  w.fail(new Error('EPERM'));
  assert.equal(w.closed, true);
  assert.equal(t.errors.length, 1);
  t.timers.flush();
  await t.loop.idle();
  assert.equal(t.open().filter((x) => x.dir === '/p/designs/default').length, 1);
});

test('stop closes the watchers and cancels the pending rebuild', async () => {
  const t = setup([SET_A]);
  await t.loop.start();
  const w = t.find('/p/slides/a');
  w.emit('a.md');
  t.loop.stop();
  assert.equal(t.open().length, 0);
  assert.equal(t.timers.pending.size, 0);
  w.emit('a.md');
  assert.equal(t.timers.pending.size, 0);
  assert.equal(t.builds.length, 1);
});

test('stop during a build does not start new watches', async () => {
  const t = setup([SET_A]);
  await t.loop.start();
  t.holdBuilds(true);
  t.find('/p/slides/a').emit('a.md');
  t.timers.flush();
  t.loop.stop();
  t.release();
  await t.loop.idle();
  assert.equal(t.open().length, 0);
});

test('clockTime formats HH:MM:SS', () => {
  assert.equal(clockTime(new Date(2026, 9, 14, 9, 5, 7)), '09:05:07');
  assert.equal(clockTime(new Date(2026, 9, 14, 23, 59, 0)), '23:59:00');
});
