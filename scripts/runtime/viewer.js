/* cv_slides viewer: modes, input handling and scaling. No dependencies, no build step. */
(function () {
  "use strict";

  var CANVAS_W = 1920;
  var CANVAS_H = 1080;
  var LONG_PRESS_MS = 1000; // keep in sync with the viewer-press animation in viewer.css
  var LONG_PRESS_SLOP_PX = 10;
  var CURSOR_IDLE_MS = 2000;
  var TAKAHASHI_MAX_DEFAULT = 360;
  var WHEEL_LINE_PX = 40;
  var WHEEL_PAGE_PX = 800;

  // Clicks on these act on the element itself instead of turning the page (5.4, 5.5).
  var NO_CLICK_TURN =
    "a[href], button, input, select, textarea, label, summary, iframe, [contenteditable], .runner, [data-viewer-interactive]";
  // Wheel over these scrolls the element instead of turning the page (5.5).
  var NO_WHEEL_TURN = "textarea, select, .runner, [data-viewer-interactive]";

  /* ---------- Pure logic (tested by scripts/runtime/dev/viewer-logic.test.mjs) ---------- */

  function clampIndex(index, count) {
    if (!(count > 0)) return 0;
    index = Math.floor(Number(index));
    if (!isFinite(index) || index < 0) return 0;
    return index >= count ? count - 1 : index;
  }

  // "#5" -> 4 (clamped to the deck). Returns null when the hash is not a slide number.
  function parseHash(hash, count) {
    var m = /^#?(\d+)$/.exec(String(hash || ""));
    if (!m) return null;
    return clampIndex(parseInt(m[1], 10) - 1, count);
  }

  function formatHash(index) {
    return "#" + (index + 1);
  }

  // Largest uniform scale that fits content into box, centered (letterbox).
  function computeFit(boxW, boxH, contentW, contentH) {
    if (!(boxW > 0 && boxH > 0 && contentW > 0 && contentH > 0)) return { scale: 0, x: 0, y: 0 };
    var scale = Math.min(boxW / contentW, boxH / contentH);
    return { scale: scale, x: (boxW - contentW * scale) / 2, y: (boxH - contentH * scale) / 2 };
  }

  // Largest integer n in [lo, hi] with fits(n) true, assuming fits is monotonic. Returns lo if nothing fits.
  function fitLargest(fits, lo, hi) {
    lo = Math.floor(lo);
    hi = Math.floor(hi);
    if (hi <= lo || fits(hi)) return Math.max(lo, hi);
    while (hi - lo > 1) {
      var mid = (lo + hi) >> 1;
      if (fits(mid)) lo = mid;
      else hi = mid;
    }
    return lo;
  }

  // Wheel delta in px along the dominant axis (positive = down/right = next).
  function normalizeWheelDelta(dx, dy, deltaMode) {
    var d = Math.abs(dy) >= Math.abs(dx) ? dy : dx;
    if (deltaMode === 1) d *= WHEEL_LINE_PX;
    else if (deltaMode === 2) d *= WHEEL_PAGE_PX;
    return d || 0;
  }

  // One page per scroll gesture. Deltas accumulate up to a threshold; after a page turn the
  // gesture is locked until wheel events pause (idleMs), the direction reverses, or the deltas
  // grow again after having decayed (a new swipe during trackpad inertia).
  function createWheelGesture(options) {
    options = options || {};
    var threshold = options.threshold || 40;
    var idleMs = options.idleMs || 200;
    var ACCEL_STEPS = 3;
    var ACCEL_MIN = 10;
    var ACCEL_RATIO = 1.5;
    var DECAY_RATIO = 0.7;
    var REVERSE_MIN = 4;

    var acc = 0;
    var lastTime = -Infinity;
    var locked = false;
    var lockDir = 0;
    var prevAbs = 0;
    var peak = 0;
    var trough = 0;
    var decayed = false;
    var rises = 0;

    function lock(dir, abs) {
      locked = true;
      lockDir = dir;
      acc = 0;
      prevAbs = peak = trough = abs;
      decayed = false;
      rises = 0;
    }

    function releases(dir, abs) {
      if (dir !== lockDir) return abs >= REVERSE_MIN;
      rises = abs > prevAbs ? rises + 1 : 0;
      prevAbs = abs;
      if (!decayed) {
        if (abs > peak) peak = abs;
        else if (abs <= peak * DECAY_RATIO) {
          decayed = true;
          trough = abs;
        }
        return false;
      }
      if (abs < trough) trough = abs;
      return rises >= ACCEL_STEPS && abs >= ACCEL_MIN && abs >= trough * ACCEL_RATIO;
    }

    // Returns +1 (next), -1 (previous) or 0.
    function feed(delta, time) {
      var abs = Math.abs(delta);
      if (time - lastTime > idleMs) {
        acc = 0;
        locked = false;
      }
      lastTime = time;
      if (!abs) return 0;
      var dir = delta > 0 ? 1 : -1;
      if (locked) {
        if (!releases(dir, abs)) return 0;
        locked = false;
        acc = 0;
      }
      if (acc && (acc > 0) !== (dir > 0)) acc = 0;
      acc += delta;
      if (Math.abs(acc) >= threshold) {
        lock(dir, abs);
        return dir;
      }
      return 0;
    }

    function reset() {
      acc = 0;
      locked = false;
      lastTime = -Infinity;
    }

    return { feed: feed, reset: reset };
  }

  // Maps KeyboardEvent.key to an action for the given mode (5.3, 5.5).
  function keyAction(mode, key) {
    switch (key) {
      case "ArrowDown":
      case "ArrowRight":
      case "Down":
      case "Right":
        return "next";
      case "ArrowUp":
      case "ArrowLeft":
      case "Up":
      case "Left":
        return "prev";
      case "Home":
        return "first";
      case "End":
        return "last";
      case "Tab":
        return mode === "present" ? "nav" : "present";
    }
    if (mode !== "present") return key === "Enter" ? "present" : null;
    switch (key) {
      case " ":
      case "Spacebar":
      case "PageDown":
      case "Enter":
        return "next";
      case "PageUp":
      case "Backspace":
        return "prev";
      case "Escape":
      case "Esc":
        return "nav";
    }
    return null;
  }

  var internals = {
    clampIndex: clampIndex,
    parseHash: parseHash,
    formatHash: formatHash,
    computeFit: computeFit,
    fitLargest: fitLargest,
    normalizeWheelDelta: normalizeWheelDelta,
    createWheelGesture: createWheelGesture,
    keyAction: keyAction
  };

  if (typeof document === "undefined") {
    globalThis.__cvSlidesViewerInternals = internals;
    return;
  }

  /* ---------- DOM helpers ---------- */

  function el(tag, className) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    return node;
  }

  function each(nodes, fn) {
    Array.prototype.forEach.call(nodes, fn);
  }

  function px(value) {
    return parseFloat(value) || 0;
  }

  function elementOf(target) {
    return target && target.nodeType === 1 ? target : target && target.parentElement;
  }

  function matchesClosest(target, selector) {
    var node = elementOf(target);
    return !!(node && node.closest && node.closest(selector));
  }

  function isEditable(target) {
    var node = elementOf(target);
    return !!(node && (node.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(node.tagName)));
  }

  function fullscreenElement() {
    return document.fullscreenElement || document.webkitFullscreenElement || null;
  }

  function swallow(result) {
    if (result && typeof result.catch === "function") result.catch(function () {});
  }

  // Must run synchronously inside a user-activated event handler (or within the transient
  // activation window, as for the mouse long press). Returns false when unsupported.
  function requestFullscreen() {
    var root = document.documentElement;
    try {
      if (root.requestFullscreen) swallow(root.requestFullscreen({ navigationUI: "hide" }));
      else if (root.webkitRequestFullscreen) root.webkitRequestFullscreen();
      else return false;
      return true;
    } catch (e) {
      return false;
    }
  }

  function exitFullscreen() {
    try {
      if (document.exitFullscreen) swallow(document.exitFullscreen());
      else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
    } catch (e) {
      /* already leaving fullscreen */
    }
  }

  function whenFontsReady() {
    if (document.fonts && document.fonts.ready) {
      return document.fonts.ready.then(
        function () {},
        function () {}
      );
    }
    return Promise.resolve();
  }

  function whenLoaded() {
    if (document.readyState === "complete") return Promise.resolve();
    return new Promise(function (resolve) {
      window.addEventListener("load", resolve, { once: true });
    });
  }

  /* ---------- Viewer ---------- */

  function boot() {
    var deck = document.getElementById("deck");
    if (!deck || deck.hasAttribute("data-viewer-ready")) return;
    deck.setAttribute("data-viewer-ready", "");

    var slides = [];
    for (var c = deck.firstElementChild; c; c = c.nextElementSibling) {
      if (c.classList.contains("slide")) slides.push(c);
    }
    var count = slides.length;
    var state = { index: -1, mode: "nav" };
    var suppressClick = false;
    var lastPointerType = "mouse";
    var pressState = null;
    var cursorTimer = 0;
    var lastScreenX = null;
    var lastScreenY = null;
    var wheel = createWheelGesture();

    injectPageNumbers();

    // Layout: the deck is moved once into the stage; afterwards slides are never moved, only
    // shown/hidden, and modes only change classes on the root (5.2).
    var root = el("div", "viewer viewer--nav");
    var main = el("div", "viewer__main");
    var stage = el("div", "viewer__stage");
    var list = el("div", "viewer__list");
    var press = createPressIndicator();
    list.setAttribute("role", "listbox");
    list.setAttribute("aria-label", "スライド一覧");
    // Let designs scoped by the deck's design class also apply to thumbnail clones.
    each(deck.classList, function (cls) {
      if (cls.indexOf("design-") === 0) list.classList.add(cls);
    });
    deck.parentNode.insertBefore(root, deck);
    stage.appendChild(deck);
    main.appendChild(stage);
    main.appendChild(press);
    // The list comes after the main pane in DOM order so getElementById() finds the original
    // slide content before any (id-preserving) thumbnail clone.
    root.appendChild(main);
    root.appendChild(list);

    var thumbs = [];
    var fragment = document.createDocumentFragment();
    slides.forEach(function (slide, i) {
      var thumb = makeThumb(slide, i);
      thumbs.push(thumb);
      fragment.appendChild(thumb.item);
    });
    list.appendChild(fragment);

    var initial = parseHash(location.hash, count);
    go(initial === null ? 0 : initial);
    layout();
    bindEvents();

    // Measure after fonts are ready (4.10, 5.7). Force style/layout first so font loads start.
    void list.offsetHeight;
    whenFontsReady().then(fitAllTakahashi);
    Promise.all([whenFontsReady(), whenLoaded()]).then(checkOverflow);

    window.cvSlidesViewer = {
      go: go,
      next: next,
      prev: prev,
      enterPresentation: enterPresentation,
      exitPresentation: exitPresentation,
      slides: slides,
      internals: internals,
      get index() {
        return state.index;
      },
      get mode() {
        return state.mode;
      }
    };

    /* --- construction --- */

    function injectPageNumbers() {
      if (deck.getAttribute("data-page-number") !== "true") return;
      slides.forEach(function (slide, i) {
        if (slide.classList.contains("slide--title")) return;
        var num = el("div", "slide__page-number");
        num.textContent = i + 1 + " / " + count;
        slide.appendChild(num);
      });
    }

    function makeThumb(slide, i) {
      var item = el("div", "viewer__thumb");
      var num = el("span", "viewer__thumb-num");
      var frame = el("div", "viewer__thumb-frame");
      var canvas = el("div", "viewer__thumb-canvas");
      var clone = cloneForThumb(slide);
      item.setAttribute("role", "option");
      item.setAttribute("aria-selected", "false");
      item.setAttribute("aria-label", "スライド " + (i + 1));
      item.setAttribute("data-index", String(i));
      num.textContent = String(i + 1);
      canvas.setAttribute("aria-hidden", "true");
      canvas.inert = true;
      canvas.appendChild(clone);
      frame.appendChild(canvas);
      item.appendChild(num);
      item.appendChild(frame);
      return { item: item, frame: frame, clone: clone };
    }

    function cloneForThumb(slide) {
      var clone = slide.cloneNode(true);
      clone.classList.remove("is-current", "is-measuring");
      clone.setAttribute("data-viewer-clone", "");
      // Embedded documents and media must not run twice; keep a box with the same classes.
      each(clone.querySelectorAll("iframe, video, audio, object, embed"), function (node) {
        var ph = el("div", (node.getAttribute("class") || "") + " viewer__placeholder");
        if (node.hasAttribute("style")) ph.setAttribute("style", node.getAttribute("style"));
        node.parentNode.replaceChild(ph, node);
      });
      each(clone.querySelectorAll("script"), function (node) {
        node.parentNode.removeChild(node);
      });
      each(clone.querySelectorAll("img"), function (img) {
        img.decoding = "async";
      });
      return clone;
    }

    function createPressIndicator() {
      var ns = "http://www.w3.org/2000/svg";
      var wrap = el("div", "viewer__press");
      var svg = document.createElementNS(ns, "svg");
      wrap.setAttribute("aria-hidden", "true");
      svg.setAttribute("viewBox", "0 0 64 64");
      ["viewer__press-track", "viewer__press-bar"].forEach(function (cls) {
        var circle = document.createElementNS(ns, "circle");
        circle.setAttribute("cx", "32");
        circle.setAttribute("cy", "32");
        circle.setAttribute("r", "26");
        circle.setAttribute("class", cls);
        svg.appendChild(circle);
      });
      wrap.appendChild(svg);
      return wrap;
    }

    /* --- state --- */

    function go(index) {
      if (!count) return;
      index = clampIndex(index, count);
      if (index === state.index) return;
      var previous = state.index;
      if (previous >= 0) {
        slides[previous].classList.remove("is-current");
        thumbs[previous].item.classList.remove("is-selected");
        thumbs[previous].item.setAttribute("aria-selected", "false");
      }
      state.index = index;
      slides[index].classList.add("is-current");
      thumbs[index].item.classList.add("is-selected");
      thumbs[index].item.setAttribute("aria-selected", "true");
      if (state.mode === "nav") scrollThumbIntoView(index);
      writeHash(index);
      emit("viewer:slidechange", { index: index, previousIndex: previous, mode: state.mode });
    }

    function next() {
      go(state.index + 1);
    }

    function prev() {
      go(state.index - 1);
    }

    function setMode(mode) {
      if (state.mode === mode) return false;
      state.mode = mode;
      root.classList.toggle("viewer--nav", mode === "nav");
      root.classList.toggle("viewer--present", mode === "present");
      layout();
      emit("viewer:modechange", { mode: mode, index: state.index });
      return true;
    }

    function enterPresentation() {
      if (!count || state.mode === "present") return;
      cancelLongPress();
      // Request first, while the user activation is certainly still valid. If the request is
      // unsupported or rejected, the CSS already fills the window (5.2).
      requestFullscreen();
      setMode("present");
      wheel.reset();
      armCursorTimer();
    }

    function exitPresentation() {
      if (state.mode !== "present") return;
      setMode("nav");
      clearTimeout(cursorTimer);
      root.classList.remove("viewer--cursor-hidden");
      if (fullscreenElement()) exitFullscreen();
      scrollThumbIntoView(state.index);
    }

    function emit(name, detail) {
      try {
        deck.dispatchEvent(new CustomEvent(name, { detail: detail }));
      } catch (e) {
        /* CustomEvent unsupported */
      }
    }

    function writeHash(index) {
      var hash = formatHash(index);
      if (location.hash === hash) return;
      try {
        history.replaceState(history.state, "", hash);
      } catch (e) {
        try {
          location.replace(hash);
        } catch (e2) {
          /* ignore */
        }
      }
    }

    /* --- layout --- */

    function layout() {
      var box = stage.getBoundingClientRect();
      var fit = computeFit(box.width, box.height, CANVAS_W, CANVAS_H);
      deck.style.transform = "translate(" + fit.x + "px, " + fit.y + "px) scale(" + fit.scale + ")";
      if (thumbs.length) {
        var w = thumbs[0].frame.getBoundingClientRect().width;
        if (w > 0) list.style.setProperty("--thumb-scale", String(w / CANVAS_W));
      }
    }

    function scrollThumbIntoView(index) {
      var item = thumbs[index] && thumbs[index].item;
      if (!item) return;
      var pad = 8;
      var lr = list.getBoundingClientRect();
      var ir = item.getBoundingClientRect();
      if (ir.top < lr.top + pad) list.scrollTop += ir.top - lr.top - pad;
      else if (ir.bottom > lr.bottom - pad) list.scrollTop += ir.bottom - lr.bottom + pad;
      if (ir.left < lr.left + pad) list.scrollLeft += ir.left - lr.left - pad;
      else if (ir.right > lr.right - pad) list.scrollLeft += ir.right - lr.right + pad;
    }

    /* --- measurement (after fonts are ready) --- */

    function withMeasuring(targets, fn) {
      targets.forEach(function (s) {
        s.classList.add("is-measuring");
      });
      try {
        fn();
      } finally {
        targets.forEach(function (s) {
          s.classList.remove("is-measuring");
        });
      }
    }

    function fitTakahashi(slide) {
      var text = slide.querySelector(".takahashi__text");
      if (!text) return 0;
      var box = text.parentElement;
      var bs = getComputedStyle(box);
      var availW = box.clientWidth - px(bs.paddingLeft) - px(bs.paddingRight);
      var availH = box.clientHeight - px(bs.paddingTop) - px(bs.paddingBottom);
      var max = px(getComputedStyle(slide).getPropertyValue("--takahashi-max")) || TAKAHASHI_MAX_DEFAULT;
      text.classList.add("is-fitting");
      var ts = getComputedStyle(text);
      var size = fitLargest(
        function (n) {
          text.style.fontSize = n + "px";
          return (
            text.offsetWidth + px(ts.marginLeft) + px(ts.marginRight) <= availW &&
            text.offsetHeight + px(ts.marginTop) + px(ts.marginBottom) <= availH
          );
        },
        1,
        max
      );
      text.style.fontSize = size + "px";
      text.classList.remove("is-fitting");
      return size;
    }

    function fitAllTakahashi() {
      slides.forEach(function (slide, i) {
        if (!slide.classList.contains("slide--takahashi")) return;
        var size = 0;
        withMeasuring([slide], function () {
          size = fitTakahashi(slide);
        });
        var cloneText = size && thumbs[i].clone.querySelector(".takahashi__text");
        if (cloneText) cloneText.style.fontSize = size + "px";
      });
    }

    function checkOverflow() {
      var found = [];
      withMeasuring(slides, function () {
        slides.forEach(function (slide, i) {
          if (slide.classList.contains("slide--takahashi")) return;
          var body = slide.querySelector(".slide__body");
          if (!body) return;
          var dy = body.scrollHeight - body.clientHeight;
          var dx = body.scrollWidth - body.clientWidth;
          if (dy > 1 || dx > 1) found.push({ index: i, dy: Math.max(dy, 0), dx: Math.max(dx, 0) });
        });
      });
      found.forEach(function (f) {
        var thumb = thumbs[f.index];
        var mark = el("span", "viewer__thumb-warn");
        mark.textContent = "⚠︎";
        mark.title = "内容がはみ出しています";
        thumb.item.classList.add("is-overflow");
        thumb.frame.appendChild(mark);
        console.warn(
          "[cv_slides] スライド " + (f.index + 1) + ": 内容が本文領域からはみ出しています" +
            "(縦 " + f.dy + "px / 横 " + f.dx + "px)"
        );
      });
    }

    /* --- input --- */

    function bindEvents() {
      window.addEventListener("keydown", onKeyDown);
      window.addEventListener("hashchange", function () {
        var index = parseHash(location.hash, count);
        if (index !== null) go(index);
      });
      window.addEventListener("resize", layout);
      if (window.ResizeObserver) {
        var ro = new ResizeObserver(layout);
        ro.observe(stage);
        if (thumbs.length) ro.observe(thumbs[0].frame);
      }
      document.addEventListener("fullscreenchange", onFullscreenChange);
      document.addEventListener("webkitfullscreenchange", onFullscreenChange);

      list.addEventListener("click", function (e) {
        var node = elementOf(e.target);
        var item = node && node.closest(".viewer__thumb");
        if (item && state.mode === "nav") go(Number(item.getAttribute("data-index")));
      });

      main.addEventListener("pointerdown", onMainPointerDown);
      window.addEventListener("pointermove", onPointerMove, { passive: true });
      window.addEventListener("pointerup", onPointerEnd);
      window.addEventListener("pointercancel", onPointerEnd);
      window.addEventListener("blur", cancelLongPress);
      main.addEventListener("click", onMainClick, true);
      main.addEventListener("dblclick", onMainDblClick);
      main.addEventListener("wheel", onWheel, { passive: false });
      main.addEventListener("contextmenu", function (e) {
        if (pressState || lastPointerType !== "mouse") e.preventDefault();
      });
      main.addEventListener("dragstart", function (e) {
        e.preventDefault();
      });
    }

    function onKeyDown(e) {
      if (e.defaultPrevented || e.isComposing || e.altKey || e.ctrlKey || e.metaKey) return;
      if (isEditable(e.target)) return;
      var action = keyAction(state.mode, e.key);
      if (!action) return;
      e.preventDefault();
      switch (action) {
        case "next":
          next();
          break;
        case "prev":
          prev();
          break;
        case "first":
          go(0);
          break;
        case "last":
          go(count - 1);
          break;
        case "present":
          if (!e.repeat) enterPresentation();
          break;
        case "nav":
          if (!e.repeat) exitPresentation();
          break;
      }
    }

    function onFullscreenChange() {
      if (fullscreenElement()) {
        // Fullscreen arrived after the user already went back to navigation mode.
        if (state.mode !== "present") exitFullscreen();
      } else if (state.mode === "present") {
        // ESC/F11 handled by the browser; the keydown may never reach the page (5.2).
        exitPresentation();
      }
    }

    function onMainPointerDown(e) {
      suppressClick = false;
      lastPointerType = e.pointerType || "mouse";
      if (state.mode !== "nav" || e.button !== 0) return;
      // Touch long press (start on release, 5.3/Q27) belongs to the touch input block.
      if (lastPointerType !== "mouse") return;
      if (matchesClosest(e.target, NO_CLICK_TURN)) return;
      startLongPress(e);
    }

    function startLongPress(e) {
      cancelLongPress();
      var r = main.getBoundingClientRect();
      press.style.left = e.clientX - r.left + "px";
      press.style.top = e.clientY - r.top + "px";
      press.classList.remove("is-active");
      void press.offsetWidth; // restart the progress animation
      press.classList.add("is-active");
      pressState = {
        id: e.pointerId,
        x: e.clientX,
        y: e.clientY,
        timer: setTimeout(function () {
          pressState = null;
          press.classList.remove("is-active");
          suppressClick = true; // the release that follows must not turn the page
          enterPresentation();
        }, LONG_PRESS_MS)
      };
    }

    function cancelLongPress() {
      if (!pressState) return;
      clearTimeout(pressState.timer);
      pressState = null;
      press.classList.remove("is-active");
    }

    function onPointerMove(e) {
      if (pressState && e.pointerId === pressState.id) {
        var dx = e.clientX - pressState.x;
        var dy = e.clientY - pressState.y;
        if (dx * dx + dy * dy >= LONG_PRESS_SLOP_PX * LONG_PRESS_SLOP_PX) cancelLongPress();
      }
      if (e.pointerType === "mouse") {
        // Browsers send synthetic moves after layout changes; only real movement counts.
        if (e.screenX === lastScreenX && e.screenY === lastScreenY) return;
        lastScreenX = e.screenX;
        lastScreenY = e.screenY;
        if (state.mode === "present") armCursorTimer();
      }
    }

    function onPointerEnd(e) {
      if (pressState && e.pointerId === pressState.id) cancelLongPress();
    }

    function onMainClick(e) {
      if (suppressClick) {
        suppressClick = false;
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (state.mode !== "present" || matchesClosest(e.target, NO_CLICK_TURN)) return;
      next();
    }

    function onMainDblClick(e) {
      if (state.mode !== "nav" || matchesClosest(e.target, NO_CLICK_TURN)) return;
      var sel = window.getSelection && window.getSelection();
      if (sel && sel.removeAllRanges) sel.removeAllRanges();
      enterPresentation();
    }

    function onWheel(e) {
      if (state.mode !== "present" || e.ctrlKey) return;
      if (matchesClosest(e.target, NO_WHEEL_TURN)) return;
      e.preventDefault();
      var dir = wheel.feed(normalizeWheelDelta(e.deltaX, e.deltaY, e.deltaMode), e.timeStamp);
      if (dir > 0) next();
      else if (dir < 0) prev();
    }

    function armCursorTimer() {
      clearTimeout(cursorTimer);
      root.classList.remove("viewer--cursor-hidden");
      if (state.mode !== "present") return;
      cursorTimer = setTimeout(function () {
        if (state.mode === "present") root.classList.add("viewer--cursor-hidden");
      }, CURSOR_IDLE_MS);
    }
  }

  if (document.getElementById("deck")) boot();
  else document.addEventListener("DOMContentLoaded", boot);
})();
