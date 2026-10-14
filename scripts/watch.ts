import path from 'node:path';

// ---------------------------------------------------------------------------
// --watch (DETAILED_SPEC.md 3.1, Q48): rebuild on change, no browser reload.
// The file system and the clock are injected so the loop can be unit-tested.
// ---------------------------------------------------------------------------

/** What one build depends on. Paths are absolute and may not exist yet. */
export interface WatchSet {
  /** Files whose change triggers a rebuild. */
  files: readonly string[];
  /** Directories in which any change (recursively) triggers a rebuild. */
  dirs: readonly string[];
  /** Paths whose changes are ignored (the output HTML). */
  ignore?: readonly string[];
}

/** One fs.watch call: a directory, optionally filtered by entry name. */
export interface WatchTarget {
  dir: string;
  recursive: boolean;
  /** Entry names (direct children of `dir`) that count, or null for any change. */
  names: string[] | null;
}

export type PathKind = 'file' | 'dir' | null;

/** Returns 'file', 'dir', or null when the path does not exist. */
export type StatFn = (p: string) => PathKind;

/**
 * Turns a watch set into directory watches. Files are watched through their parent directory
 * (so editors that save by renaming still trigger), and a missing path is watched through its
 * nearest existing ancestor, filtered by the name of the child that leads to it.
 */
export function planWatch(set: WatchSet, stat: StatFn): WatchTarget[] {
  const byDir = new Map<string, WatchTarget>();
  const add = (dir: string, recursive: boolean, name: string | null): void => {
    const t = byDir.get(dir) ?? { dir, recursive: false, names: [] };
    t.recursive ||= recursive;
    if (name === null) t.names = null;
    else if (t.names !== null && !t.names.includes(name)) t.names.push(name);
    byDir.set(dir, t);
  };
  const addViaAncestor = (p: string): void => {
    let child = p;
    let parent = path.dirname(p);
    while (stat(parent) !== 'dir') {
      if (path.dirname(parent) === parent) return;
      child = parent;
      parent = path.dirname(parent);
    }
    if (parent === child) return;
    add(parent, false, path.basename(child));
  };
  for (const dir of set.dirs) {
    if (stat(dir) === 'dir') add(dir, true, null);
    else addViaAncestor(dir);
  }
  for (const file of set.files) addViaAncestor(file);
  return [...byDir.values()]
    .map((t) => ({ ...t, names: t.names === null ? null : [...t.names].sort() }))
    .sort((a, b) => (a.dir < b.dir ? -1 : a.dir > b.dir ? 1 : 0));
}

export interface Closable {
  close(): void;
}

/** Starts watching a directory. `filename` is relative to `dir` (null when the OS does not say). */
export type WatchFn = (
  dir: string,
  recursive: boolean,
  onChange: (filename: string | null) => void,
  onError: (error: unknown) => void,
) => Closable;

export interface Timers {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface WatchLoopOptions {
  /** Builds once. `changed` lists the paths that triggered it (empty for the first build). */
  build: (changed: string[]) => Promise<WatchSet>;
  watch: WatchFn;
  stat: StatFn;
  timers?: Timers;
  /** Debounce delay. Default 200 ms. */
  delayMs?: number;
  /** Unexpected errors (a throwing build, a watcher that fails). Watching continues. */
  onError?: (error: unknown) => void;
}

interface ActiveWatch {
  target: WatchTarget;
  handle: Closable;
}

const realTimers: Timers = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

function targetKey(t: WatchTarget): string {
  return `${t.recursive ? 'r' : 'n'}:${t.dir}`;
}

export class WatchLoop {
  readonly #opts: WatchLoopOptions;
  readonly #timers: Timers;
  readonly #delay: number;
  readonly #active = new Map<string, ActiveWatch>();
  #set: WatchSet = { files: [], dirs: [] };
  #ignore = new Set<string>();
  #changed = new Set<string>();
  #timer: unknown = null;
  #building: Promise<void> | null = null;
  #dirty = false;
  #stopped = false;

  constructor(opts: WatchLoopOptions) {
    this.#opts = opts;
    this.#timers = opts.timers ?? realTimers;
    this.#delay = opts.delayMs ?? 200;
  }

  /** Runs the first build and starts watching. */
  async start(): Promise<void> {
    await this.#runBuild();
  }

  /** Stops watching. A build in progress finishes but does not start new watches. */
  stop(): void {
    this.#stopped = true;
    if (this.#timer !== null) this.#timers.clearTimeout(this.#timer);
    this.#timer = null;
    for (const w of this.#active.values()) this.#close(w);
    this.#active.clear();
  }

  /** The directories currently watched. */
  get targets(): WatchTarget[] {
    return [...this.#active.values()].map((w) => w.target);
  }

  /** Resolves when the running build (if any) has finished. */
  async idle(): Promise<void> {
    while (this.#building) await this.#building;
  }

  #close(w: ActiveWatch): void {
    try {
      w.handle.close();
    } catch (e) {
      this.#opts.onError?.(e);
    }
  }

  #onChange(target: WatchTarget, filename: string | null): void {
    if (this.#stopped) return;
    const full = filename === null ? target.dir : path.join(target.dir, filename);
    if (filename !== null) {
      if (this.#ignore.has(full)) return;
      const first = filename.split(/[\\/]/)[0] ?? '';
      if (target.names !== null && !target.names.includes(first)) return;
    }
    this.#changed.add(full);
    this.#schedule();
  }

  #schedule(): void {
    if (this.#stopped) return;
    if (this.#building) {
      this.#dirty = true;
      return;
    }
    if (this.#timer !== null) this.#timers.clearTimeout(this.#timer);
    this.#timer = this.#timers.setTimeout(() => {
      this.#timer = null;
      void this.#runBuild();
    }, this.#delay);
  }

  #runBuild(): Promise<void> {
    const changed = [...this.#changed].sort();
    this.#changed.clear();
    this.#dirty = false;
    const run = (async () => {
      try {
        this.#set = await this.#opts.build(changed);
      } catch (e) {
        this.#opts.onError?.(e);
      }
    })();
    this.#building = run.finally(() => {
      this.#building = null;
      if (this.#stopped) return;
      this.#apply();
      if (this.#dirty) this.#schedule();
    });
    return this.#building;
  }

  /** Re-plans the watches for the current set; unchanged directories keep their watcher. */
  #apply(): void {
    this.#ignore = new Set(this.#set.ignore ?? []);
    const next = new Map(planWatch(this.#set, this.#opts.stat).map((t) => [targetKey(t), t]));
    for (const [key, w] of this.#active) {
      if (!next.has(key)) {
        this.#close(w);
        this.#active.delete(key);
      }
    }
    for (const [key, target] of next) {
      const existing = this.#active.get(key);
      if (existing) {
        existing.target.names = target.names;
        continue;
      }
      try {
        const entry: ActiveWatch = { target, handle: { close() {} } };
        entry.handle = this.#opts.watch(
          target.dir,
          target.recursive,
          (filename) => this.#onChange(entry.target, filename),
          (error) => this.#onWatchError(key, entry, error),
        );
        this.#active.set(key, entry);
      } catch (e) {
        this.#opts.onError?.(e);
      }
    }
  }

  /** A failed watcher is dropped; a rebuild re-plans the watches (e.g. the directory was removed). */
  #onWatchError(key: string, entry: ActiveWatch, error: unknown): void {
    if (this.#active.get(key) === entry) {
      this.#active.delete(key);
      this.#close(entry);
    }
    if (this.#stopped) return;
    this.#opts.onError?.(error);
    this.#changed.add(entry.target.dir);
    this.#schedule();
  }
}

/** HH:MM:SS in local time. */
export function clockTime(date: Date): string {
  return [date.getHours(), date.getMinutes(), date.getSeconds()].map((n) => String(n).padStart(2, '0')).join(':');
}
