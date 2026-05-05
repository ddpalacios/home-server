/**
 * Inline AI Editor — highlight + Ask AI to rewrite.
 *
 * Drop into any page that has fields annotated with
 *   <textarea data-ai-editable="true" data-ai-field-type="..." />
 *   <input    data-ai-editable="true" data-ai-field-type="..." />
 *   <div contenteditable data-ai-editable="true" data-ai-field-type="..." />
 *
 * The script auto-mounts on DOMContentLoaded — no per-page wiring needed.
 *
 * Endpoint: POST /api/ai/rewrite-selection
 *   body: { selected_text, prompt, context: { field_type, surrounding_text_before, surrounding_text_after } }
 *   resp: { rewritten_text, elapsed_ms }
 */
(function () {
  "use strict";

  if (window.__aiRewriteInstalled) return;
  window.__aiRewriteInstalled = true;

  // ── Disable toggle (read once, sessionStorage controls it) ─────────
  function isEnabled() {
    try {
      return localStorage.getItem("ai-rewrite.disabled") !== "1";
    } catch (_) { return true; }
  }
  window.aiRewriteSetEnabled = function (on) {
    try {
      if (on) localStorage.removeItem("ai-rewrite.disabled");
      else    localStorage.setItem("ai-rewrite.disabled", "1");
    } catch (_) {}
  };

  // ── Styles ─────────────────────────────────────────────────────────
  var CSS = (
    '.ai-rw-btn{position:fixed;z-index:9998;display:none;align-items:center;'
    + 'gap:6px;padding:7px 12px;font:500 13px/1 -apple-system,BlinkMacSystemFont,'
    + '"Segoe UI",Roboto,Helvetica,Arial,sans-serif;background:#fff;color:#0a66c2;'
    + 'border:1px solid #e3e6e8;border-radius:999px;cursor:pointer;'
    + 'box-shadow:0 4px 12px rgba(0,0,0,.10);transition:transform .12s,box-shadow .12s;'
    + 'pointer-events:auto;user-select:none}'
    + '.ai-rw-btn:hover{transform:translateY(-1px);box-shadow:0 6px 18px rgba(0,0,0,.15)}'
    + '.ai-rw-btn[hidden]{display:none !important}'
    + '.ai-rw-btn.is-visible{display:inline-flex}'
    + '.ai-rw-btn-spark{font-size:14px;line-height:1}'
    + '.ai-rw-overlay{position:fixed;inset:0;z-index:9999;background:transparent}'
    + '.ai-rw-overlay[hidden]{display:none !important}'
    + '.ai-rw-pop{position:fixed;z-index:10000;width:min(440px,calc(100vw - 24px));'
    + 'background:#fff;border:1px solid #e3e6e8;border-radius:14px;'
    + 'box-shadow:0 24px 60px rgba(0,0,0,.18);padding:16px;'
    + 'font:14px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;'
    + 'animation:airwfade .2s ease-out}'
    + '.ai-rw-pop[hidden]{display:none !important}'
    + '@keyframes airwfade{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}'
    + '.ai-rw-pop-h{display:flex;align-items:center;gap:6px;font-weight:600;'
    + 'color:#0a0a0a;margin-bottom:10px}'
    + '.ai-rw-pop-input{width:100%;padding:9px 12px;border:1px solid #e3e6e8;'
    + 'border-radius:8px;font:inherit;outline:none}'
    + '.ai-rw-pop-input:focus{border-color:#0a66c2;box-shadow:0 0 0 2px rgba(10,102,194,.15)}'
    + '.ai-rw-pop-sel{margin:8px 0;color:#5a6168;font-size:12.5px;'
    + 'background:#f5f6f7;padding:6px 10px;border-radius:6px;'
    + 'white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'
    + '.ai-rw-pop-chips{display:flex;flex-wrap:wrap;gap:6px;margin:10px 0 12px}'
    + '.ai-rw-pop-chip{padding:5px 10px;border:1px solid #e3e6e8;border-radius:999px;'
    + 'background:#fff;color:#0a0a0a;font:inherit;font-size:12.5px;cursor:pointer}'
    + '.ai-rw-pop-chip:hover{background:#f5f6f7;border-color:#c8cdd1}'
    + '.ai-rw-pop-foot{display:flex;gap:8px;justify-content:flex-end}'
    + '.ai-rw-pop-btn{padding:7px 14px;border:1px solid #e3e6e8;background:#fff;'
    + 'border-radius:999px;cursor:pointer;font:inherit;font-weight:500;color:#0a0a0a}'
    + '.ai-rw-pop-btn-primary{background:#0a66c2;color:#fff;border-color:#0a66c2}'
    + '.ai-rw-pop-btn-primary:hover{background:#084c95;border-color:#084c95}'
    + '.ai-rw-pop-btn:disabled{opacity:.55;cursor:not-allowed}'
    + '.ai-rw-pop-loading{display:flex;align-items:center;gap:8px;color:#5a6168;font-size:13px}'
    + '.ai-rw-pop-loading::before{content:"";display:inline-block;width:12px;height:12px;'
    + 'border:2px solid #c8cdd1;border-top-color:#0a66c2;border-radius:50%;'
    + 'animation:airwspin .8s linear infinite}'
    + '@keyframes airwspin{to{transform:rotate(360deg)}}'
    + '.ai-rw-pop-err{color:#991b1b;font-size:13px;background:rgba(239,68,68,.08);'
    + 'border:1px solid rgba(239,68,68,.3);padding:8px 10px;border-radius:8px;margin-top:8px}'
    + '@media(max-width:560px){'
    + '.ai-rw-pop{position:fixed;left:0;right:0;bottom:0;width:100%;'
    + 'border-radius:14px 14px 0 0;animation:airwslide .2s ease-out}'
    + '@keyframes airwslide{from{transform:translateY(100%)}to{transform:none}}}'
  );
  var styleEl = document.createElement("style");
  styleEl.textContent = CSS;
  document.head.appendChild(styleEl);

  // ── Floating button DOM ────────────────────────────────────────────
  var btnEl = document.createElement("button");
  btnEl.type = "button";
  btnEl.className = "ai-rw-btn";
  btnEl.setAttribute("aria-label", "Open AI rewrite tool for selected text");
  btnEl.innerHTML = '<span class="ai-rw-btn-spark" aria-hidden="true">✨</span><span>Ask AI</span>';
  document.body.appendChild(btnEl);

  // ── Popover DOM (built on demand) ──────────────────────────────────
  var overlayEl = document.createElement("div");
  overlayEl.className = "ai-rw-overlay";
  overlayEl.hidden = true;
  document.body.appendChild(overlayEl);

  var popEl = document.createElement("div");
  popEl.className = "ai-rw-pop";
  popEl.hidden = true;
  popEl.setAttribute("role", "dialog");
  popEl.setAttribute("aria-label", "AI rewrite tool");
  document.body.appendChild(popEl);

  // ── Selection state ────────────────────────────────────────────────
  var selectionState = null;  // { el, start, end, text, rect, fieldType }

  function clearSelection() {
    selectionState = null;
    btnEl.classList.remove("is-visible");
  }

  function isElEditable(el) {
    if (!el) return false;
    if (el.dataset && el.dataset.aiEditable === "true") return true;
    // Also accept descendants of [data-ai-editable]:
    var p = el.closest && el.closest('[data-ai-editable="true"]');
    return !!p;
  }

  function getEditableTarget(el) {
    if (!el) return null;
    if (el.dataset && el.dataset.aiEditable === "true") return el;
    return el.closest && el.closest('[data-ai-editable="true"]');
  }

  function getFieldType(el) {
    return (el && el.dataset && el.dataset.aiFieldType) || "general";
  }

  // Get the currently-active selection inside an input/textarea OR
  // contenteditable. Returns { el, start, end, text } or null.
  function readSelection() {
    var ae = document.activeElement;
    if (!ae) return null;
    var target = getEditableTarget(ae);
    if (!target) return null;
    var tag = (target.tagName || "").toLowerCase();
    if (tag === "textarea" || tag === "input") {
      var s = target.selectionStart, e = target.selectionEnd;
      if (s == null || e == null || s === e) return null;
      var txt = (target.value || "").slice(s, e);
      if ((txt || "").trim().length < 3) return null;
      return { el: target, start: s, end: e, text: txt,
                ceditable: false, fieldType: getFieldType(target) };
    }
    // contenteditable
    if (target.isContentEditable) {
      var sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return null;
      var r = sel.getRangeAt(0);
      if (sel.isCollapsed) return null;
      var txt2 = sel.toString();
      if ((txt2 || "").trim().length < 3) return null;
      return { el: target, range: r.cloneRange(), text: txt2,
                ceditable: true, fieldType: getFieldType(target) };
    }
    return null;
  }

  // Position the floating button above the selection. The button uses
  // `position: fixed`, so coordinates are viewport-relative — DON'T add
  // window.scroll{X,Y} here or the button drifts down/right by the
  // current scroll amount on every scrolled page (visible as "the
  // button shows up at the far bottom").
  function positionButtonAbove(rect) {
    var top  = rect.top - 38;                       // 38px above the selection
    var left = rect.left + (rect.width / 2);
    if (top < 8) top = rect.bottom + 8;             // flip below if no room above
    if (top > window.innerHeight - 40) top = window.innerHeight - 40;
    btnEl.style.top  = Math.max(8, top) + "px";
    btnEl.style.left = left + "px";
    btnEl.style.transform = "translateX(-50%)";
  }

  // For inputs/textareas the browser doesn't expose the selection's
  // pixel rect natively, so we render a hidden mirror element that
  // copies the field's text-layout-affecting styles, set its content to
  // the value up to selectionEnd, and read the marker span's bounding
  // rect. That gives a real cursor position, so the floating button
  // anchors next to the highlight instead of at the top of the field.
  // Falls back to the field's top edge if the mirror approach fails.
  var MIRROR_PROPS = [
    "boxSizing", "width", "height",
    "borderTopWidth", "borderRightWidth",
    "borderBottomWidth", "borderLeftWidth",
    "paddingTop", "paddingRight", "paddingBottom", "paddingLeft",
    "fontStyle", "fontVariant", "fontWeight", "fontStretch", "fontSize",
    "fontSizeAdjust", "lineHeight", "fontFamily",
    "textAlign", "textTransform", "textIndent", "textDecoration",
    "letterSpacing", "wordSpacing", "tabSize",
    "whiteSpace", "wordWrap", "wordBreak", "overflowWrap",
    "direction"
  ];
  function _mirrorSelectionRect(el, selPos) {
    try {
      var tag = (el.tagName || "").toLowerCase();
      if (tag !== "textarea" && tag !== "input") return null;
      var cs = window.getComputedStyle(el);
      var mirror = document.createElement("div");
      MIRROR_PROPS.forEach(function (p) { mirror.style[p] = cs[p]; });
      mirror.style.position = "absolute";
      mirror.style.visibility = "hidden";
      mirror.style.top = "0";
      mirror.style.left = "-9999px";
      mirror.style.overflow = "hidden";
      // Inputs render single-line; textareas wrap.
      if (tag === "input") {
        mirror.style.whiteSpace = "pre";
      } else {
        mirror.style.whiteSpace = "pre-wrap";
        mirror.style.wordWrap = "break-word";
      }
      var value = (el.value != null ? String(el.value) : "");
      var before = value.substring(0, selPos);
      // Replace trailing newline so the marker doesn't collapse.
      mirror.textContent = before.replace(/\n$/, "\n ");
      var marker = document.createElement("span");
      marker.textContent = "."; // any zero-width-ish glyph would also work
      mirror.appendChild(marker);
      mirror.appendChild(document.createTextNode(value.substring(selPos) || "."));
      document.body.appendChild(mirror);
      var mRect = marker.getBoundingClientRect();
      var bRect = mirror.getBoundingClientRect();
      var elRect = el.getBoundingClientRect();
      // Marker's offset within the mirror, mapped back to the textarea's
      // viewport position (minus the textarea's scroll).
      var top  = elRect.top  + (mRect.top  - bRect.top)  - el.scrollTop;
      var left = elRect.left + (mRect.left - bRect.left) - el.scrollLeft;
      var height = mRect.height || parseFloat(cs.lineHeight) || 18;
      document.body.removeChild(mirror);
      // Clamp to field bounds so the button never floats outside.
      if (top  < elRect.top)    top  = elRect.top;
      if (top  > elRect.bottom) top  = elRect.bottom - height;
      if (left < elRect.left)   left = elRect.left;
      if (left > elRect.right)  left = elRect.right;
      return { top: top, bottom: top + height, left: left, width: 0 };
    } catch (_) {
      return null;
    }
  }

  function rectForFieldSelection(el) {
    // Prefer the END of the selection so the button sits where the
    // user's cursor finished dragging — feels more natural than the start.
    var selPos = (el.selectionEnd != null ? el.selectionEnd
                 : (el.selectionStart != null ? el.selectionStart : 0));
    var r = _mirrorSelectionRect(el, selPos);
    if (r) return r;
    // Fallback: place above the field's top-center.
    var br = el.getBoundingClientRect();
    return {
      top:    br.top,
      bottom: br.top + 8,
      left:   br.left + (br.width / 2),
      width:  0,
    };
  }

  function rectForCEditable(range) {
    // For multi-line selections, anchor next to the end of the
    // selection (where the cursor naturally sits after dragging) rather
    // than the first line — feels more like the button is following
    // the user's cursor.
    var rects = range.getClientRects();
    if (rects && rects.length) return rects[rects.length - 1];
    return range.getBoundingClientRect();
  }

  // ── Selection change watcher ───────────────────────────────────────
  var rafId = 0;
  function onSelectionChange() {
    if (!isEnabled()) return;
    if (rafId) return;
    rafId = requestAnimationFrame(function () {
      rafId = 0;
      // Don't recompute while popover is open.
      if (!popEl.hidden) return;
      var s = readSelection();
      if (!s) { clearSelection(); return; }
      selectionState = s;
      var rect = s.ceditable ? rectForCEditable(s.range) : rectForFieldSelection(s.el);
      positionButtonAbove(rect);
      btnEl.classList.add("is-visible");
    });
  }
  document.addEventListener("selectionchange", onSelectionChange);
  document.addEventListener("mouseup",         onSelectionChange);
  document.addEventListener("keyup",           onSelectionChange);
  window.addEventListener("scroll", function () {
    if (selectionState && popEl.hidden) {
      // Re-anchor the button.
      var rect = selectionState.ceditable
        ? rectForCEditable(selectionState.range)
        : rectForFieldSelection(selectionState.el);
      positionButtonAbove(rect);
    }
  }, true);

  // Hide button when the user clicks outside an editable.
  document.addEventListener("mousedown", function (e) {
    if (e.target === btnEl || btnEl.contains(e.target)) return;
    if (popEl.contains(e.target)) return;
    if (!getEditableTarget(e.target)) {
      // Will be re-evaluated on the next selectionchange.
      setTimeout(function () {
        if (!readSelection()) clearSelection();
      }, 0);
    }
  }, true);

  // ── Popover ────────────────────────────────────────────────────────
  var QUICK_ACTIONS = [
    "Make shorter", "Make longer", "More casual", "More professional",
    "Fix grammar", "Make it stronger", "Rewrite as a question", "Remove jargon",
  ];

  function openPopover() {
    if (!selectionState) return;
    btnEl.classList.remove("is-visible");
    var preview = selectionState.text;
    if (preview.length > 60) preview = preview.slice(0, 60) + "…";

    popEl.innerHTML =
        '<div class="ai-rw-pop-h"><span aria-hidden="true">✨</span><span>Ask AI</span></div>'
      + '<input class="ai-rw-pop-input" type="text" placeholder="What should I do with this?" maxlength="200"/>'
      + '<div class="ai-rw-pop-sel">Selected: ' + escapeHtml(preview) + '</div>'
      + '<div class="ai-rw-pop-chips">'
      +   QUICK_ACTIONS.map(function(q){
            return '<button type="button" class="ai-rw-pop-chip">' + escapeHtml(q) + '</button>';
          }).join("")
      + '</div>'
      + '<div class="ai-rw-pop-foot">'
      +   '<button type="button" class="ai-rw-pop-btn ai-rw-cancel">Cancel</button>'
      +   '<button type="button" class="ai-rw-pop-btn ai-rw-pop-btn-primary ai-rw-submit">Rewrite</button>'
      + '</div>';
    // Position near the button.
    var br = btnEl.getBoundingClientRect();
    var top  = br.bottom + 8;
    var left = br.left + (br.width / 2) - 220;  // pop is 440 wide, center it
    if (left < 8) left = 8;
    if (left + 440 > window.innerWidth - 8) left = window.innerWidth - 448;
    if (top + 240 > window.innerHeight) top = Math.max(8, br.top - 240);
    popEl.style.top  = top + "px";
    popEl.style.left = left + "px";
    popEl.hidden = overlayEl.hidden = false;

    var input = popEl.querySelector(".ai-rw-pop-input");
    input.focus();
    input.addEventListener("keydown", function(e){
      if (e.key === "Enter") { e.preventDefault(); doSubmit(input.value); }
      else if (e.key === "Escape") { e.preventDefault(); closePopover(); }
    });
    popEl.querySelectorAll(".ai-rw-pop-chip").forEach(function(c){
      c.addEventListener("click", function(){ doSubmit(c.textContent); });
    });
    popEl.querySelector(".ai-rw-cancel").addEventListener("click", closePopover);
    popEl.querySelector(".ai-rw-submit").addEventListener("click", function(){
      doSubmit(input.value);
    });
  }

  function closePopover() {
    popEl.hidden = overlayEl.hidden = true;
    popEl.innerHTML = "";
  }

  // Click on overlay closes popover.
  overlayEl.addEventListener("mousedown", closePopover);

  // Global Escape.
  document.addEventListener("keydown", function(e){
    if (e.key === "Escape" && !popEl.hidden) closePopover();
  });

  btnEl.addEventListener("mousedown", function(e){
    e.preventDefault();  // don't lose the active selection
  });
  btnEl.addEventListener("click", function(){ openPopover(); });

  // ── Submit ─────────────────────────────────────────────────────────
  async function doSubmit(prompt) {
    var p = (prompt || "").trim();
    if (!p) return;
    if (!selectionState) return closePopover();
    var s = selectionState;
    // Render loading state inside popover.
    popEl.innerHTML =
        '<div class="ai-rw-pop-h"><span aria-hidden="true">✨</span><span>Thinking…</span></div>'
      + '<div class="ai-rw-pop-loading">Rewriting your text…</div>';
    var before = "", after = "";
    try {
      if (!s.ceditable) {
        before = (s.el.value || "").slice(Math.max(0, s.start - 200), s.start);
        after  = (s.el.value || "").slice(s.end, s.end + 200);
      } else {
        var fullText = s.el.innerText || s.el.textContent || "";
        var i = fullText.indexOf(s.text);
        if (i >= 0) {
          before = fullText.slice(Math.max(0, i - 200), i);
          after  = fullText.slice(i + s.text.length, i + s.text.length + 200);
        }
      }
      var resp = await fetch("/api/ai/rewrite-selection", {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          selected_text: s.text, prompt: p,
          context: {
            field_type: s.fieldType,
            surrounding_text_before: before,
            surrounding_text_after:  after,
          },
        }),
      });
      var data = await resp.json().catch(function(){ return {}; });
      if (!resp.ok) {
        showPopoverError(data.detail || data.error || ("HTTP " + resp.status));
        return;
      }
      var rewritten = data.rewritten_text || "";
      if (!rewritten) {
        showPopoverError("The AI didn't return anything — try again.");
        return;
      }
      replaceSelection(s, rewritten);
      closePopover();
    } catch (e) {
      showPopoverError("Couldn't reach the AI — check your connection.");
    }
  }

  function showPopoverError(msg) {
    popEl.innerHTML =
        '<div class="ai-rw-pop-h"><span aria-hidden="true">✨</span><span>Ask AI</span></div>'
      + '<div class="ai-rw-pop-err">' + escapeHtml(msg) + '</div>'
      + '<div class="ai-rw-pop-foot" style="margin-top:10px">'
      +   '<button type="button" class="ai-rw-pop-btn ai-rw-cancel">Close</button>'
      +   '<button type="button" class="ai-rw-pop-btn ai-rw-pop-btn-primary ai-rw-retry">Try again</button>'
      + '</div>';
    popEl.querySelector(".ai-rw-cancel").addEventListener("click", closePopover);
    popEl.querySelector(".ai-rw-retry").addEventListener("click", openPopover);
  }

  // Replace the selected text in place. For inputs/textareas, prefer
  // execCommand('insertText') so the change goes through the native
  // undo stack (Cmd+Z restores). Falls back to direct value mutation.
  function replaceSelection(state, newText) {
    if (state.ceditable) {
      state.el.focus();
      try {
        var sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(state.range);
        document.execCommand("insertText", false, newText);
        flashElement(state.el);
        return;
      } catch (_) { /* fall back below */ }
    }
    var el = state.el;
    el.focus();
    el.setSelectionRange(state.start, state.end);
    var ok = false;
    try {
      ok = document.execCommand("insertText", false, newText);
    } catch (_) { ok = false; }
    if (!ok) {
      // Direct mutation fallback (loses native undo).
      var v = el.value || "";
      el.value = v.slice(0, state.start) + newText + v.slice(state.end);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }
    el.setSelectionRange(state.start, state.start + newText.length);
    flashElement(el);
  }

  // Brief highlight flash after replace.
  function flashElement(el) {
    var orig = el.style.transition;
    var origBg = el.style.backgroundColor;
    el.style.transition = "background-color .2s ease";
    el.style.backgroundColor = "rgba(10,102,194,.15)";
    setTimeout(function () {
      el.style.backgroundColor = origBg;
      setTimeout(function () { el.style.transition = orig; }, 220);
    }, 200);
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]);
    });
  }
})();
