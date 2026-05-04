// Pure rendering engine for the CTA Studio.
//
// Imported by:
//   * studio_render.html  — the headless-screenshot page (no editor UI)
//   * studio_editor.html  — the live editor (renders + adds selection chrome)
//
// Responsible for: turning a design JSON into DOM elements positioned on
// a 1080×1920 stage. All editor-specific behavior (selection, drag,
// undo) lives in studio_editor.js.

(function () {
  "use strict";

  var CANVAS_W = 1080;
  var CANVAS_H = 1920;

  // 9 named zones → anchor pixel coordinates (zone-center).
  var ZONES = {
    "top-left":      { x: 180,  y: 240  },
    "top-center":    { x: 540,  y: 240  },
    "top-right":     { x: 900,  y: 240  },
    "middle-left":   { x: 180,  y: 960  },
    "center":        { x: 540,  y: 960  },
    "middle-right":  { x: 900,  y: 960  },
    "bottom-left":   { x: 180,  y: 1680 },
    "bottom-center": { x: 540,  y: 1680 },
    "bottom-right":  { x: 900,  y: 1680 },
  };

  var FONT_MAP = {
    bold_display: "studio-bold-display",
    clean_sans:   "studio-clean-sans",
    serif:        "studio-serif",
    handwritten:  "studio-handwritten",
    mono:         "studio-mono",
    condensed:    "studio-condensed",
    slab:         "studio-slab",
    rounded:      "studio-rounded",
  };

  var SIZE_MAP = { S: 32, M: 48, L: 80, XL: 128 };

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"})[c];
    });
  }

  // Resolve a color reference. Elements may store either an absolute hex
  // (`color: "#ff0000"`) or a palette role (`color_role: "accent"`) that
  // gets resolved against the design's active palette.
  function resolveColor(el, design) {
    if (el.color) return el.color;
    var palette = design.palette || {};
    if (el.color_role && palette[el.color_role]) return palette[el.color_role];
    return "#000";
  }

  function renderTextElement(el, design) {
    var node = document.createElement("div");
    node.className = "el el-text";
    var fontFamily = FONT_MAP[el.font] || FONT_MAP.clean_sans;
    var fontSize = SIZE_MAP[el.size] || 48;
    node.style.fontFamily = fontFamily + ", system-ui, sans-serif";
    node.style.fontSize = fontSize + "px";
    node.style.fontWeight = el.weight === "bold" ? "700" : "400";
    node.style.fontStyle  = el.italic ? "italic" : "normal";
    node.style.textAlign  = el.align || "center";
    node.style.color      = resolveColor(el, design);
    node.textContent = el.content || "";
    return node;
  }

  var ARROW_SVG = '<svg viewBox="0 0 100 100" preserveAspectRatio="none">'
    + '<path d="M10 50 L80 50 M55 25 L80 50 L55 75" '
    + 'stroke="currentColor" stroke-width="6" fill="none" '
    + 'stroke-linecap="round" stroke-linejoin="round"/></svg>';

  function renderShapeElement(el, design) {
    var node = document.createElement("div");
    var shape = el.shape || "rectangle";
    node.className = "el el-shape" + (
      shape === "rounded"   ? " is-rounded" :
      shape === "circle"    ? " is-circle"  :
      shape === "bar"       ? " is-bar"     :
      shape === "banner"    ? " is-banner"  : "");
    if (shape === "arrow") {
      node.classList.add("el-arrow");
      node.style.color = resolveColor(el, design);
      node.style.background = "transparent";
      node.innerHTML = ARROW_SVG;
    } else {
      node.style.background = resolveColor(el, design);
    }
    if (el.opacity != null) node.style.opacity = String(el.opacity);
    return node;
  }

  function renderImageElement(el) {
    var node = document.createElement("div");
    node.className = "el el-image";
    if (el.src) node.style.backgroundImage = "url('" + el.src + "')";
    if (el.opacity != null) node.style.opacity = String(el.opacity);
    return node;
  }

  function applyPositionAndSize(node, el) {
    var pos = el.position || { zone: "center", offset_x: 0, offset_y: 0 };
    var anchor = ZONES[pos.zone] || ZONES.center;
    var size = el.size_px || { width: 600, height: 200 };
    var x = anchor.x + (pos.offset_x || 0) - size.width / 2;
    var y = anchor.y + (pos.offset_y || 0) - size.height / 2;
    node.style.left   = x + "px";
    node.style.top    = y + "px";
    node.style.width  = size.width + "px";
    node.style.height = size.height + "px";
    if (el.rotation && el.rotation !== 0) {
      node.style.transform = "rotate(" + el.rotation + "deg)";
      node.style.transformOrigin = "center center";
    }
  }

  /**
   * Render an entire design into a stage element.
   * @param {HTMLElement} stage
   * @param {object} design
   * @returns {HTMLElement[]} per-element DOM nodes (in design order)
   */
  function renderDesign(stage, design) {
    var bg = (design.background && design.background.color) ||
             (design.palette && design.palette.bg) || "#1d9e75";
    stage.style.background = bg;
    stage.innerHTML = "";
    var nodes = [];
    (design.elements || []).forEach(function (el) {
      var node;
      if (el.type === "text")        node = renderTextElement(el, design);
      else if (el.type === "shape")  node = renderShapeElement(el, design);
      else if (el.type === "image")  node = renderImageElement(el);
      else return;
      node.dataset.elementId = el.id || "";
      applyPositionAndSize(node, el);
      stage.appendChild(node);
      nodes.push(node);
    });
    return nodes;
  }

  // ── Animation presets ──────────────────────────────────────────────
  //
  // Pure functions of (tSec, appearsAtSec, designDuration) → an object
  // of style overrides applied on top of the element's baseline. The
  // headless renderer calls applyAnimationAt(node, el, t) at each
  // captured frame; the in-editor preview can do the same to drive a
  // play button.
  //
  // FADE:   opacity 0 → 1 over 400 ms
  // SLIDE:  starts 100 px below + opacity 0, slides to final + 1
  //         over 600 ms with ease-out
  // PULSE:  scales 1.0 → 1.08 → 1.0 in a 1.5s cycle, looped
  // BOUNCE: starts at scale 0 + opacity 0, overshoots to 1.05,
  //         settles to 1.0 over 700 ms
  function _easeOutCubic(p){ return 1 - Math.pow(1 - p, 3); }
  function _easeOutBack(p){
    // Standard easeOutBack with a gentler overshoot (s=1.4)
    var s = 1.4;
    var v = p - 1;
    return 1 + v*v*((s + 1)*v + s);
  }

  function computeAnimationStyle(el, tSec, designDur){
    var anim = el.animation || null;
    if (!anim || !anim.type || anim.type === "none") {
      return { opacity: el.opacity != null ? el.opacity : 1, transform_extra: "" };
    }
    var appearsAt = (anim.appears_at_sec == null) ? 0 : Math.max(0, anim.appears_at_sec);
    var localT = tSec - appearsAt;   // seconds since this element should appear
    if (localT < 0) {
      // Hasn't started yet — keep hidden so it pops in cleanly.
      return { opacity: 0, transform_extra: "" };
    }
    var baseOpacity = el.opacity != null ? el.opacity : 1;

    switch (anim.type) {
      case "fade": {
        var p = Math.min(1, localT / 0.4);
        return { opacity: baseOpacity * p, transform_extra: "" };
      }
      case "slide": {
        var dur = 0.6;
        var p = Math.min(1, localT / dur);
        var eased = _easeOutCubic(p);
        var dy = (1 - eased) * 100;  // 100 px upward over the duration
        return {
          opacity: baseOpacity * eased,
          transform_extra: " translateY(" + dy.toFixed(2) + "px)",
        };
      }
      case "pulse": {
        // Continuous loop — start from full visible.
        var cycle = 1.5;   // sec
        var phase = (localT % cycle) / cycle;  // 0..1
        // Sin curve mapped to 1.0 → 1.08 → 1.0
        var scale = 1 + 0.08 * Math.sin(phase * Math.PI * 2 * 0.5 + 0); // half-cycle bump
        // Cleaner: 1 + 0.04*(1 - cos(2πφ))
        scale = 1 + 0.04 * (1 - Math.cos(phase * 2 * Math.PI));
        return {
          opacity: baseOpacity,
          transform_extra: " scale(" + scale.toFixed(4) + ")",
        };
      }
      case "bounce": {
        var dur = 0.7;
        var p = Math.min(1, localT / dur);
        var eased = _easeOutBack(p);
        // Map ease curve from [0..1] to [0..1.05..1] roughly.
        // We want: at p=0 scale=0 + opacity 0; at p=1 scale=1; mid p ~ 1.05.
        // Easiest: scale = eased clamped via min(eased, 1.05)
        var scale = Math.min(eased, 1.05);
        if (p === 1) scale = 1;
        return {
          opacity: baseOpacity * Math.min(1, p * 1.5),
          transform_extra: " scale(" + scale.toFixed(4) + ")",
        };
      }
      default:
        return { opacity: baseOpacity, transform_extra: "" };
    }
  }

  function applyAnimationAt(node, el, tSec, designDur){
    var style = computeAnimationStyle(el, tSec, designDur);
    node.style.opacity = String(style.opacity);
    // Preserve any baseline rotation applied by applyPositionAndSize().
    var base = "";
    if (el.rotation && el.rotation !== 0) {
      base = "rotate(" + el.rotation + "deg)";
    }
    node.style.transform = (base + style.transform_extra).trim();
    node.style.transformOrigin = "center center";
  }

  /**
   * Render the design with each element's animation evaluated at time t.
   * Used by the headless frame-capture loop and by the editor's optional
   * play-preview button.
   */
  function renderDesignAtTime(stage, design, tSec){
    var dur = design.duration_seconds || 3;
    var nodes = renderDesign(stage, design);
    (design.elements || []).forEach(function (el, i) {
      if (i >= nodes.length) return;
      applyAnimationAt(nodes[i], el, tSec, dur);
    });
    return nodes;
  }

  // ── Headless-render plumbing ───────────────────────────────────────
  // The Node script that drives Puppeteer sets `window.__designJson` on
  // the page and then calls `window.__renderForCapture()`. The script
  // resolves a promise once the stage is fully rendered and (for
  // Studio v1) the document is ready for `page.screenshot()`.
  window.__studioRender = renderDesign;
  window.__renderForCapture = function () {
    var design = window.__designJson;
    if (!design) throw new Error("__designJson not set");
    var stage = document.getElementById("stage");
    renderDesign(stage, design);
    // Wait for fonts + images to settle before screenshot.
    return Promise.all([
      document.fonts ? document.fonts.ready : Promise.resolve(),
      // Give one rAF for layout to finalize.
      new Promise(function (r) { requestAnimationFrame(function () { r(); }); }),
    ]);
  };

  // For video render: capture a single frame at time t.
  window.__renderFrameAtTime = function (tSec) {
    var design = window.__designJson;
    if (!design) throw new Error("__designJson not set");
    var stage = document.getElementById("stage");
    renderDesignAtTime(stage, design, tSec);
    return new Promise(function (r) {
      requestAnimationFrame(function () { r(); });
    });
  };

  // Helpers exported for the editor.
  window.__studio = {
    renderDesign:        renderDesign,
    renderDesignAtTime:  renderDesignAtTime,
    applyAnimationAt:    applyAnimationAt,
    computeAnimationStyle: computeAnimationStyle,
    ZONES:               ZONES,
    FONT_MAP:            FONT_MAP,
    SIZE_MAP:            SIZE_MAP,
    CANVAS_W:            CANVAS_W,
    CANVAS_H:            CANVAS_H,
    applyPositionAndSize: applyPositionAndSize,
    resolveColor:        resolveColor,
  };
})();
