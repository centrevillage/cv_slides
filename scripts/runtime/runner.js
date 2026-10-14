/* cv_slides code runner: sandboxed iframes for code sample pages (6). No dependencies, no build
   step. Runs after viewer.js and only uses its public hooks (window.cvSlidesViewer and the
   viewer:slidechange event on #deck). Never write the closing script tag literally in this file:
   it is inlined into a <script> element. */
(function () {
  "use strict";

  var LIMITER_PROCESSOR = "cv-slides-limiter";
  var MAX_LINES = 1000;
  var SANDBOX = "allow-scripts"; // 6.7: no allow-same-origin (it breaks Blob URL worklets on file://)
  var FORWARDED_KEYS = [
    "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Up", "Down", "Left", "Right",
    " ", "Spacebar", "PageUp", "PageDown", "Home", "End", "Enter", "Tab", "Escape", "Esc"
  ];

  /* ---------- Pure logic (tested by scripts/runtime/dev/runner-logic.test.mjs) ----------
     formatConsoleArgs, createLimiterCore and limiterWorkletMain are also serialized with
     Function.prototype.toString into the iframe / the AudioWorklet, so they must not use any
     outer variable. */

  // Formats console arguments as one line of text: strings as they are, everything else in a
  // JSON-like notation with cycle detection, a depth limit and size limits.
  function formatConsoleArgs(args, options) {
    options = options || {};
    var maxDepth = options.maxDepth != null ? options.maxDepth : 2;
    var maxItems = options.maxItems != null ? options.maxItems : 100;
    var maxLength = options.maxLength != null ? options.maxLength : 10000;
    var IDENT = /^[A-Za-z_$][\w$]*$/;
    var stack = [];

    function typeName(v) {
      try {
        var proto = Object.getPrototypeOf(v);
        if (proto === null) return "[Object: null prototype]";
        var ctor = proto && proto.constructor;
        return (ctor && typeof ctor.name === "string" && ctor.name) || "Object";
      } catch (e) {
        return "Object";
      }
    }

    function formatError(e) {
      var name = "Error";
      var message = "";
      try {
        name = e.name || typeName(e);
        message = e.message != null ? String(e.message) : "";
      } catch (x) {
        /* exotic error object */
      }
      return message ? name + ": " + message : name;
    }

    function key(k) {
      return IDENT.test(k) ? k : JSON.stringify(k);
    }

    function list(open, items, close, more) {
      if (more > 0) items.push("... " + more + " more");
      return items.length ? open + " " + items.join(", ") + " " + close : open + close;
    }

    function fmt(v, depth, top) {
      var t = typeof v;
      if (t === "string") return top ? v : JSON.stringify(v);
      if (t === "number") return Object.is(v, -0) ? "-0" : String(v);
      if (t === "bigint") return String(v) + "n";
      if (t === "boolean" || v === undefined || v === null) return String(v);
      if (t === "symbol") return v.toString();
      if (t === "function") {
        var src = "";
        try {
          src = Function.prototype.toString.call(v);
        } catch (e) {
          /* revoked proxy etc. */
        }
        var kind = /^class[\s{]/.test(src) ? "class" : "Function";
        return "[" + kind + " " + (v.name || "(anonymous)") + "]";
      }
      if (stack.indexOf(v) >= 0) return "[Circular]";
      if (v instanceof Error) return formatError(v);
      if (v instanceof Date) return isNaN(v.getTime()) ? "Invalid Date" : v.toISOString();
      if (v instanceof RegExp) return String(v);
      var name = typeName(v);
      if (typeof ArrayBuffer !== "undefined") {
        if (v instanceof ArrayBuffer) return "ArrayBuffer { byteLength: " + v.byteLength + " }";
        if (ArrayBuffer.isView(v) && !(v instanceof DataView)) {
          if (depth > maxDepth) return "[" + name + "(" + v.length + ")]";
          var n = Math.min(v.length, maxItems);
          var vals = [];
          for (var i = 0; i < n; i++) vals.push(fmt(v[i], depth + 1, false));
          return name + "(" + v.length + ") " + list("[", vals, "]", v.length - n);
        }
      }
      var isArray = Array.isArray(v);
      var isMap = typeof Map !== "undefined" && v instanceof Map;
      var isSet = typeof Set !== "undefined" && v instanceof Set;
      if (depth > maxDepth) {
        if (isArray) return "[Array(" + v.length + ")]";
        if (isMap || isSet) return "[" + name + "(" + v.size + ")]";
        return name === "Object" ? "[Object]" : "[" + name + "]";
      }
      stack.push(v);
      try {
        var items = [];
        var more = 0;
        if (isArray) {
          var len = Math.min(v.length, maxItems);
          for (var a = 0; a < len; a++) items.push(fmt(v[a], depth + 1, false));
          return list("[", items, "]", v.length - len);
        }
        if (isMap || isSet) {
          v.forEach(function (value, k) {
            if (items.length >= maxItems) more++;
            else items.push(isMap ? fmt(k, depth + 1, false) + " => " + fmt(value, depth + 1, false) : fmt(value, depth + 1, false));
          });
          return name + "(" + v.size + ") " + list("{", items, "}", more);
        }
        var keys = Object.keys(v);
        for (var j = 0; j < keys.length; j++) {
          if (items.length >= maxItems) {
            more = keys.length - j;
            break;
          }
          var value;
          try {
            value = fmt(v[keys[j]], depth + 1, false);
          } catch (e) {
            value = "[Getter error]";
          }
          items.push(key(keys[j]) + ": " + value);
        }
        var body = list("{", items, "}", more);
        return name === "Object" ? body : name + " " + body;
      } finally {
        stack.pop();
      }
    }

    var parts = [];
    for (var p = 0; p < args.length; p++) {
      var s;
      try {
        s = fmt(args[p], 0, true);
      } catch (e) {
        s = "[Unformattable]";
      }
      parts.push(s);
    }
    var out = parts.join(" ");
    return out.length > maxLength ? out.slice(0, maxLength) + "…" : out;
  }

  // Look-ahead peak limiter (6.4). Order: NaN/±Infinity -> 0, peak limiter (threshold,
  // look-ahead, release), hard clip to ±1. The audio is delayed by D = look-ahead samples; the
  // gain is the minimum required gain over the last D+1 samples, smoothed for release
  // (instant down, exponential up) and then averaged over D+1 samples. Every value in that
  // average is <= the gain a peak needs, so the gain has fully reached it when the peak leaves
  // the delay line, and the attack is a smooth ramp instead of a step.
  function createLimiterCore(sampleRate, options) {
    options = options || {};
    var thresholdDb = options.thresholdDb != null ? options.thresholdDb : -1;
    var threshold = Math.pow(10, thresholdDb / 20);
    var lookahead = options.lookahead != null ? options.lookahead : 0.005;
    var release = options.release != null ? options.release : 0.1;
    var channels = options.channels || 2;
    var D = Math.max(1, Math.round(lookahead * sampleRate));
    var W = D + 1;
    var releaseCoef = 1 - Math.exp(-1 / (Math.max(release, 1e-4) * sampleRate));

    var delay = [];
    for (var c = 0; c < channels; c++) delay.push(new Float32Array(D));
    var delayPos = 0;
    var cap = W + 1;
    var dqVal = new Float64Array(cap);
    var dqIdx = new Float64Array(cap);
    var dqHead = 0;
    var dqSize = 0;
    var box = new Float64Array(W).fill(1);
    var boxPos = 0;
    var rel = 1;
    var n = 0;
    var stats = { nan: false, peak: 0, minGain: 1 };
    var xs = new Float64Array(channels);

    function process(input, output, frames) {
      var inCh = input ? input.length : 0;
      var outCh = Math.min(output.length, channels);
      var sum = 0;
      for (var b = 0; b < W; b++) sum += box[b]; // resync the running sum once per block
      stats.nan = false;
      stats.peak = 0;
      stats.minGain = 1;
      for (var i = 0; i < frames; i++) {
        var peak = 0;
        for (var ch = 0; ch < channels; ch++) {
          var src = inCh === 0 ? null : inCh === 1 ? input[0] : input[ch];
          var x = src ? src[i] : 0;
          if (x - x !== 0) {
            // NaN or ±Infinity
            x = 0;
            stats.nan = true;
          }
          xs[ch] = x;
          var ax = x < 0 ? -x : x;
          if (ax > peak) peak = ax;
        }
        if (peak > stats.peak) stats.peak = peak;
        var need = peak > threshold ? threshold / peak : 1;
        // sliding minimum over the last W samples (monotonic deque)
        while (dqSize > 0 && dqVal[(dqHead + dqSize - 1) % cap] >= need) dqSize--;
        var at = (dqHead + dqSize) % cap;
        dqVal[at] = need;
        dqIdx[at] = n;
        dqSize++;
        while (dqIdx[dqHead] <= n - W) {
          dqHead = (dqHead + 1) % cap;
          dqSize--;
        }
        var h = dqVal[dqHead];
        rel = h < rel ? h : rel + (h - rel) * releaseCoef;
        sum += rel - box[boxPos];
        box[boxPos] = rel;
        boxPos = boxPos + 1 === W ? 0 : boxPos + 1;
        var gain = sum / W;
        if (gain > 1) gain = 1;
        if (gain < stats.minGain) stats.minGain = gain;
        for (var oc = 0; oc < channels; oc++) {
          var line = delay[oc];
          var y = line[delayPos] * gain;
          line[delayPos] = xs[oc];
          if (y > 1) y = 1;
          else if (y < -1) y = -1;
          if (oc < outCh) output[oc][i] = y;
        }
        delayPos = delayPos + 1 === D ? 0 : delayPos + 1;
        n++;
      }
      return stats;
    }

    return { process: process, delay: D, threshold: threshold };
  }

  // Runs inside the AudioWorkletGlobalScope (AudioWorkletProcessor, registerProcessor and
  // sampleRate are globals there).
  function limiterWorkletMain(createLimiterCore, name) {
    class CvSlidesLimiter extends AudioWorkletProcessor {
      constructor(options) {
        super();
        var o = (options && options.processorOptions) || {};
        this.core = createLimiterCore(sampleRate, o);
        this.reportEvery = Math.max(1, Math.round(((o.reportInterval || 0.05) * sampleRate) / 128));
        this.blocks = 0;
        this.peak = 0;
        this.minGain = 1;
        this.nanReported = false;
      }
      process(inputs, outputs) {
        var output = outputs[0] || [];
        var frames = output.length ? output[0].length : 128;
        var r = this.core.process(inputs[0] || [], output, frames);
        if (r.nan && !this.nanReported) {
          this.nanReported = true;
          this.port.postMessage({ type: "nan" });
        }
        if (r.peak > this.peak) this.peak = r.peak;
        if (r.minGain < this.minGain) this.minGain = r.minGain;
        if (++this.blocks >= this.reportEvery) {
          this.port.postMessage({ type: "level", peak: this.peak, gr: -20 * Math.log10(Math.max(this.minGain, 1e-9)) });
          this.blocks = 0;
          this.peak = 0;
          this.minGain = 1;
        }
        return true;
      }
    }
    registerProcessor(name, CvSlidesLimiter);
  }

  function limiterModuleSource() {
    return "(" + limiterWorkletMain.toString() + ")(" + createLimiterCore.toString() + ", " +
      JSON.stringify(LIMITER_PROCESSOR) + ");\n";
  }

  // JSON for embedding into an inline script: no "<" so nothing can close the element.
  function jsonForScript(value) {
    return JSON.stringify(value).replace(/</g, "\\u003c");
  }

  function cssValue(value) {
    return String(value || "").replace(/[<>{};]/g, "").trim();
  }

  /* ---------- Code inside the iframe ---------- */

  // The bootstrap of the iframe document. Receives the code through postMessage ("init"),
  // runs it as a module script on ▶ Run and talks to the parent with {cvRunner: 1, type}.
  function frameMain(cfg, formatConsoleArgs, limiterSource) {
    var parentWin = window.parent;
    var runBtn = document.getElementById("run");
    var stopBtn = document.getElementById("stop");
    var statusOut = document.getElementById("out");
    var statusLimit = document.getElementById("limit");
    var resumeBtn = document.getElementById("resume");
    var data = null;
    var running = false;
    var ctx = null;
    var output = null;
    var assetCache = {};
    var lastActive = -1e9;
    var lastLimit = -1e9;
    var nanWarned = false;

    function send(msg) {
      msg.cvRunner = 1;
      parentWin.postMessage(msg, "*");
    }

    function format(args) {
      try {
        return formatConsoleArgs(args, { maxDepth: 2, maxItems: 100, maxLength: 10000 });
      } catch (e) {
        return "[format error]";
      }
    }

    function emit(level, args) {
      send({ type: "console", level: level, text: format(args) });
    }

    ["log", "info", "warn", "error", "debug"].forEach(function (level) {
      var original = console[level];
      console[level] = function () {
        var args = Array.prototype.slice.call(arguments);
        emit(level, args);
        if (original) {
          try {
            original.apply(console, args);
          } catch (e) {
            /* ignore */
          }
        }
      };
    });

    function where(file, line, col) {
      if (!line) return "";
      var name = String(file || "").split(/[\/\\]/).pop() || cfg.name;
      return " (" + name + ":" + line + (col ? ":" + col : "") + ")";
    }

    window.addEventListener("error", function (e) {
      var text = e.error !== undefined && e.error !== null ? format([e.error]) : e.message || "Error";
      if (!/^Uncaught\b/.test(text)) text = "Uncaught " + text;
      send({ type: "console", level: "error", text: text + where(e.filename, e.lineno, e.colno) });
    });

    window.addEventListener("unhandledrejection", function (e) {
      send({ type: "console", level: "error", text: "Uncaught (in promise) " + format([e.reason]) });
    });

    var forwarded = {};
    cfg.keys.forEach(function (k) {
      forwarded[k] = true;
    });
    window.addEventListener("keydown", function (e) {
      if (e.defaultPrevented || e.isComposing || e.altKey || e.ctrlKey || e.metaKey) return;
      if (!forwarded[e.key]) return;
      var t = e.target;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      e.preventDefault();
      send({ type: "key", key: e.key, repeat: !!e.repeat });
    });

    window.addEventListener("pagehide", function () {
      if (ctx && ctx.state !== "closed") ctx.close().catch(function () {});
    });

    /* --- slide API (6.6) --- */

    function decodeBase64(b64) {
      var bin = atob(b64 || "");
      var bytes = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return bytes;
    }

    function assetHandle(path) {
      var assets = (data && data.assets) || {};
      if (typeof path !== "string" || !Object.prototype.hasOwnProperty.call(assets, path)) {
        throw new Error('slide.asset: "' + path + '" は assets に指定されていません');
      }
      var entry = assets[path];
      var cache = assetCache[path] || (assetCache[path] = {});
      function bytes() {
        if (!cache.bytes) cache.bytes = decodeBase64(entry.data);
        return cache.bytes;
      }
      return Object.freeze({
        path: path,
        type: entry.type || "application/octet-stream",
        bytes: function () {
          return bytes().slice().buffer;
        },
        text: function () {
          return new TextDecoder().decode(bytes());
        },
        url: function () {
          if (!cache.url) cache.url = URL.createObjectURL(new Blob([bytes()], { type: entry.type || "application/octet-stream" }));
          return cache.url;
        }
      });
    }

    var LEVELS = { log: 1, info: 1, warn: 1, error: 1, debug: 1 };
    window.slide = Object.freeze({
      audioContext: function () {
        if (!ctx) throw new Error("slide.audioContext: AudioContext を使えません");
        return ctx;
      },
      audioOutput: function () {
        if (!output) throw new Error("slide.audioOutput: AudioContext を使えません");
        return output;
      },
      asset: assetHandle,
      connectPort: function (port) {
        if (!port || typeof port.addEventListener !== "function") throw new TypeError("slide.connectPort: MessagePort を渡してください");
        port.addEventListener("message", function (e) {
          var m = e.data;
          if (!m || m.type !== "log") return;
          emit(LEVELS[m.level] ? m.level : "log", Array.isArray(m.args) ? m.args : [m.args]);
        });
        if (port.start) port.start();
      }
    });

    /* --- audio: limiter in front of the destination (6.4) --- */

    function onLevel(peak, gr) {
      var now = performance.now();
      if (peak > 1e-4) lastActive = now;
      if (gr >= 3) lastLimit = now;
      renderStatus();
    }

    function renderStatus() {
      var now = performance.now();
      var live = !!ctx && ctx.state === "running";
      statusOut.hidden = !(live && now - lastActive < 300);
      statusLimit.hidden = !(live && now - lastLimit < 300);
      resumeBtn.hidden = !(running && ctx && ctx.state === "suspended");
    }

    function warnNaN() {
      if (nanWarned) return;
      nanWarned = true;
      emit("warn", ["[リミッター] NaN / Infinity を検出したため 0 に置き換えました"]);
    }

    function fallbackLimiter(input) {
      var comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -1;
      comp.ratio.value = 20;
      comp.knee.value = 0;
      comp.attack.value = 0;
      comp.release.value = 0.1;
      var clip = ctx.createWaveShaper();
      clip.curve = new Float32Array([-1, 1]);
      var analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      input.connect(comp);
      comp.connect(clip);
      clip.connect(ctx.destination);
      clip.connect(analyser);
      var buf = new Float32Array(analyser.fftSize);
      setInterval(function () {
        analyser.getFloatTimeDomainData(buf);
        var peak = 0;
        for (var i = 0; i < buf.length; i++) {
          var a = Math.abs(buf[i]);
          if (a > peak) peak = a;
        }
        var red = typeof comp.reduction === "number" ? comp.reduction : comp.reduction && comp.reduction.value;
        onLevel(peak, -(red || 0));
      }, 100);
    }

    function setupAudio() {
      try {
        ctx = new AudioContext({ latencyHint: "interactive" });
      } catch (e) {
        ctx = null;
        emit("warn", ["AudioContext を作れません: " + e]);
        return Promise.resolve();
      }
      if (ctx.state !== "running") ctx.resume().catch(function () {});
      ctx.addEventListener("statechange", renderStatus);
      output = ctx.createGain();
      if (!ctx.audioWorklet || typeof AudioWorkletNode !== "function" || cfg.forceFallback) {
        fallbackLimiter(output);
        return Promise.resolve();
      }
      var url = URL.createObjectURL(new Blob([limiterSource], { type: "text/javascript" }));
      return ctx.audioWorklet.addModule(url).then(
        function () {
          var node = new AudioWorkletNode(ctx, cfg.limiterName, {
            numberOfInputs: 1,
            numberOfOutputs: 1,
            outputChannelCount: [2],
            channelCount: 2,
            channelCountMode: "explicit",
            channelInterpretation: "speakers",
            processorOptions: { thresholdDb: -1, lookahead: 0.005, release: 0.1, reportInterval: 0.05 }
          });
          node.port.onmessage = function (e) {
            var m = e.data || {};
            if (m.type === "nan") warnNaN();
            else if (m.type === "level") onLevel(m.peak, m.gr);
          };
          output.connect(node);
          node.connect(ctx.destination);
        },
        function (err) {
          emit("warn", ["[リミッター] AudioWorklet を使えないため DynamicsCompressor で代用します: " + err]);
          fallbackLimiter(output);
        }
      );
    }

    /* --- run --- */

    function decodeSource(b64) {
      return new TextDecoder().decode(decodeBase64(b64));
    }

    function run() {
      if (!data || !data.source || running) return;
      running = true;
      runBtn.classList.add("is-running");
      stopBtn.disabled = false;
      send({ type: "started" });
      var source;
      try {
        source = decodeSource(data.source);
      } catch (e) {
        emit("error", ["コードを読めません: " + e]);
        return;
      }
      setupAudio().then(function () {
        renderStatus();
        var script = document.createElement("script");
        script.type = "module";
        script.textContent = source + "\n//# sourceURL=" + cfg.name + "\n";
        document.body.appendChild(script);
      });
    }

    runBtn.addEventListener("click", function () {
      if (running) send({ type: "rerun" });
      else run();
    });
    stopBtn.addEventListener("click", function () {
      if (running) send({ type: "stop" });
    });
    resumeBtn.addEventListener("click", function () {
      if (ctx) ctx.resume().then(renderStatus, function () {});
    });
    // Any click in the frame may unlock a context that autoplay rules kept suspended.
    document.addEventListener("pointerdown", function () {
      if (running && ctx && ctx.state === "suspended") ctx.resume().then(renderStatus, function () {});
    });
    setInterval(renderStatus, 250);

    window.addEventListener("message", function (e) {
      if (e.source !== parentWin) return;
      var m = e.data;
      if (!m || m.cvRunner !== 1 || m.type !== "init" || data) return;
      data = m.data || {};
      if (m.autorun) run();
    });
  }

  // The srcdoc of a waiting iframe: Run / Stop and the status, styled like the panel.
  function buildSrcdoc(theme, options) {
    var vars = "";
    Object.keys(theme).forEach(function (k) {
      vars += "--" + k + ":" + cssValue(theme[k]) + ";";
    });
    var css =
      ":root{" + vars + "color-scheme:normal}" +
      "html,body{margin:0;height:100%;overflow:hidden;overscroll-behavior:none;background:var(--bg);color:var(--fg)}" +
      "body{box-sizing:border-box;display:flex;align-items:center;gap:.5em;padding:0 var(--pad);" +
      "font:var(--size)/1.2 var(--font-sans);-webkit-user-select:none;user-select:none;cursor:default}" +
      "button{font:inherit;font-weight:700;margin:0;padding:.2em .75em;border:.1em solid var(--fg);border-radius:0;" +
      "background:transparent;color:var(--fg);cursor:pointer;white-space:nowrap}" +
      "button:focus{outline:none}button:focus-visible{outline:.1em solid var(--accent);outline-offset:.1em}" +
      "#run{background:var(--accent);border-color:var(--accent);color:var(--on-accent)}" +
      "button:disabled{opacity:.35;cursor:default}" +
      ".status{margin-left:auto;display:flex;align-items:center;gap:.8em;white-space:nowrap;font-size:.9em}" +
      "#out{color:var(--accent);font-weight:700}#limit{color:var(--error);font-weight:700}" +
      "#resume{font-size:.9em;border-color:var(--accent);color:var(--accent)}" +
      "[hidden]{display:none!important}";
    var body =
      (options.runnable
        ? '<button type="button" id="run">▶ Run</button><button type="button" id="stop" disabled>■ Stop</button>'
        : "") +
      '<span class="status"><button type="button" id="resume" hidden>クリックして音声を開始</button>' +
      '<span id="out" hidden>● 出力中</span><span id="limit" hidden>リミッター作動中</span></span>';
    var cfg = {
      name: options.name || "run.js",
      keys: FORWARDED_KEYS,
      limiterName: LIMITER_PROCESSOR,
      forceFallback: !!options.forceFallback
    };
    var script = options.runnable
      ? "(" + frameMain.toString() + ")(" + jsonForScript(cfg) + ", " + formatConsoleArgs.toString() + ", " +
        jsonForScript(limiterModuleSource()) + ");"
      : "";
    var end = "<" + "/script>";
    return (
      '<!doctype html><html lang="ja"><head><meta charset="utf-8"><style>' + css + "<" + "/style></head><body>" +
      body + (script ? "<script>" + script + end : "") + "</body></html>"
    );
  }

  var internals = {
    formatConsoleArgs: formatConsoleArgs,
    createLimiterCore: createLimiterCore,
    limiterModuleSource: limiterModuleSource,
    buildSrcdoc: buildSrcdoc,
    jsonForScript: jsonForScript
  };

  if (typeof document === "undefined") {
    globalThis.__cvSlidesRunnerInternals = internals;
    return;
  }

  /* ---------- Parent page ---------- */

  function init() {
    var viewer = window.cvSlidesViewer;
    var deck = document.getElementById("deck");
    if (!viewer || !deck || deck.hasAttribute("data-runner-ready")) return;
    deck.setAttribute("data-runner-ready", "");

    var runners = [];
    var current = null; // the runner whose slide is current (and has an iframe)

    viewer.slides.forEach(function (slide, index) {
      if (!slide.classList.contains("slide--code")) return;
      var root = slide.querySelector(".runner");
      if (!root) return;
      var r = {
        index: index,
        slide: slide,
        root: root,
        slot: root.querySelector(".runner__frame-slot"),
        console: root.querySelector(".runner__console"),
        runnable: root.getAttribute("data-runnable") !== "false",
        data: undefined,
        frame: null,
        running: false,
        queue: [],
        flushPending: false
      };
      if (!r.slot || !r.console) return;
      var clear = root.querySelector(".runner__clear");
      if (clear) {
        clear.addEventListener("click", function () {
          clearConsole(r);
        });
      }
      runners[index] = r;
    });

    deck.addEventListener("viewer:slidechange", function (e) {
      activate(e.detail.index);
    });
    // Mode switches do not touch the iframe (5.2): nothing listens to viewer:modechange.
    window.addEventListener("message", onMessage);
    activate(viewer.index);

    viewer.runner = {
      stop: function () {
        if (current) stop(current, true);
      },
      internals: internals
    };

    function activate(index) {
      var next = runners[index] || null;
      if (current && current !== next) {
        destroy(current, current.running ? "■ 停止" : null);
        current = null;
      }
      if (next && next !== current) {
        current = next;
        createFrame(next, false);
      }
    }

    function payload(r) {
      if (r.data === undefined) {
        r.data = null;
        var node = r.root.querySelector("script.runner__data");
        try {
          r.data = node ? JSON.parse(node.textContent) : null;
        } catch (e) {
          appendLine(r, "error", "実行データを読めません: " + e.message);
        }
      }
      return r.data;
    }

    function theme(r) {
      var cs = getComputedStyle(r.slot);
      function v(name, fallback) {
        return cs.getPropertyValue(name).trim() || (fallback ? cs.getPropertyValue(fallback).trim() : "");
      }
      return {
        fg: v("--runner-fg") || cs.color,
        bg: v("--runner-bg") || backgroundOf(r.slot),
        accent: v("--runner-accent", "--color-accent") || "#e8590c",
        "on-accent": v("--runner-on-accent") || "#ffffff",
        muted: v("--runner-muted", "--color-muted") || "#707070",
        error: v("--runner-error") || "#d1242f",
        "font-sans": v("--font-sans") || "sans-serif",
        "font-mono": v("--font-mono") || "monospace",
        size: cs.fontSize || "28px",
        pad: v("--runner-pad") || "0.6em"
      };
    }

    function backgroundOf(node) {
      for (var n = node; n && n.nodeType === 1; n = n.parentElement) {
        var bg = getComputedStyle(n).backgroundColor;
        if (bg && bg !== "transparent" && !/rgba\(.*,\s*0\)$/.test(bg)) return bg;
        if (n === node.closest(".slide")) break;
      }
      return "#ffffff";
    }

    function createFrame(r, autorun) {
      var data = payload(r);
      var runnable = r.runnable && !!(data && data.source);
      if (!runnable) return; // nothing to run: the slot stays empty (the design may label it)
      var frame = document.createElement("iframe");
      frame.className = "runner__frame";
      frame.setAttribute("sandbox", SANDBOX);
      frame.setAttribute("allow", "autoplay");
      frame.setAttribute("title", "コードの実行(▶ Run / ■ Stop)");
      frame.srcdoc = buildSrcdoc(theme(r), { runnable: true, name: data.name || "run.js" });
      frame.addEventListener("load", function () {
        if (r.frame !== frame || !frame.contentWindow) return;
        frame.contentWindow.postMessage({ cvRunner: 1, type: "init", data: data, autorun: autorun }, "*");
      });
      r.frame = frame;
      r.running = false;
      r.slot.appendChild(frame);
    }

    function destroy(r, systemLine) {
      if (r.frame) {
        var frame = r.frame;
        r.frame = null;
        if (frame.parentNode) frame.parentNode.removeChild(frame);
      }
      if (systemLine) appendLine(r, "system", systemLine);
      r.running = false;
    }

    function stop(r, recreate) {
      destroy(r, r.running ? "■ 停止" : null);
      if (recreate && r === current) createFrame(r, false);
    }

    function onMessage(e) {
      var r = current;
      if (!r || !r.frame || e.source !== r.frame.contentWindow) return;
      var m = e.data;
      if (!m || m.cvRunner !== 1) return;
      switch (m.type) {
        case "started":
          clearConsole(r);
          r.running = true;
          appendLine(r, "system", "▶ 実行開始");
          break;
        case "stop":
          stop(r, true);
          break;
        case "rerun":
          destroy(r, null);
          createFrame(r, true);
          break;
        case "console":
          appendLine(r, m.level, String(m.text));
          break;
        case "key":
          if (typeof viewer.handleKey === "function") viewer.handleKey(String(m.key), !!m.repeat);
          break;
      }
    }

    /* --- console (6.3) --- */

    var LEVEL_CLASS = { log: 1, info: 1, warn: 1, error: 1, debug: 1, system: 1 };

    function appendLine(r, level, text) {
      r.queue.push({ level: LEVEL_CLASS[level] ? level : "log", text: text });
      if (r.queue.length > MAX_LINES) r.queue.splice(0, r.queue.length - MAX_LINES);
      if (!r.flushPending) {
        r.flushPending = true;
        (window.requestAnimationFrame || setTimeout)(function () {
          flush(r);
        });
      }
    }

    function flush(r) {
      r.flushPending = false;
      if (!r.queue.length) return;
      var box = r.console;
      var stick = box.scrollHeight - box.scrollTop - box.clientHeight < 8;
      var fragment = document.createDocumentFragment();
      r.queue.forEach(function (item) {
        var line = document.createElement("div");
        line.className = "runner__line runner__line--" + item.level;
        line.textContent = item.text;
        fragment.appendChild(line);
      });
      r.queue = [];
      box.appendChild(fragment);
      while (box.childElementCount > MAX_LINES) box.removeChild(box.firstElementChild);
      if (stick) box.scrollTop = box.scrollHeight;
    }

    function clearConsole(r) {
      r.queue = [];
      while (r.console.firstChild) r.console.removeChild(r.console.firstChild);
    }
  }

  if (window.cvSlidesViewer) init();
  else document.addEventListener("DOMContentLoaded", init);
})();
