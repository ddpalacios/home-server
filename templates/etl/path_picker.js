/* path_picker.js — reusable blob-storage path picker.
 *
 * Public API: window.createPathPicker(options) → { element, getValue,
 * setValue, setError, destroy }.
 *
 * Style and DOM patterns match the rest of the ETL templates: vanilla
 * JS, class-named DOM, no JSX, no build step. The factory wires its
 * own listeners; consumers only see `onChange`.
 *
 * Data shape:
 *   { zone: 'raw' | 'processed', path: 'rel/path/no-leading-slash' }
 *
 * Lazy expansion uses GET /blob-storage/<zone>/<rel_path>, which the
 * home-server returns as { path, entries: [{ name, type }] } for
 * directories. The picker never fetches file contents.
 */
(function () {
  "use strict";

  /* -------- Defaults + small DOM helpers --------------------------- */

  var DEFAULT_ZONES = ["raw", "processed"];
  var ZONE_LABELS   = { raw: "Raw", processed: "Processed" };
  var MAX_VISIBLE_CHILDREN = 250;
  var FILTER_DEBOUNCE_MS   = 250;

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      var v = attrs[k];
      if (k === "class") node.className = v;
      else if (k === "html") node.innerHTML = v;
      else if (k === "text") node.textContent = v;
      else if (k.indexOf("on") === 0 && typeof v === "function") {
        node.addEventListener(k.slice(2).toLowerCase(), v);
      } else if (v === true)  node.setAttribute(k, "");
      else if (v === false || v == null) { /* skip */ }
      else node.setAttribute(k, v);
    });
    (children || []).forEach(function (c) {
      if (c == null) return;
      node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
    return node;
  }

  function debounce(fn, ms) {
    var t = null;
    return function () {
      var args = arguments, ctx = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(ctx, args); }, ms);
    };
  }

  function joinPath(parent, child) {
    if (!parent) return child || "";
    if (!child)  return parent;
    return parent.replace(/\/+$/, "") + "/" + child.replace(/^\/+/, "");
  }

  function basename(p) {
    if (!p) return "";
    var idx = p.lastIndexOf("/");
    return idx < 0 ? p : p.slice(idx + 1);
  }

  function extOf(name) {
    if (!name) return "";
    var idx = name.lastIndexOf(".");
    if (idx < 0) return "";
    return name.slice(idx + 1).toLowerCase();
  }

  function isUnsafeName(name) {
    return !name || name === ".." || name === "." || name.indexOf("\\") >= 0;
  }

  function fmtBreadcrumb(zone, path) {
    var parts = (path || "").split("/").filter(Boolean);
    return [zone].concat(parts).join(" / ");
  }

  /* SVGs — inline so the component is drop-in (no icon dep). */
  var ICON = {
    folder:    '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" d="M3 6.5h6l2 2h10v9.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18z"/></svg>',
    file_json: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" d="M6 3h8l4 4v14H6z"/><text x="9" y="17" font-family="JetBrains Mono,Menlo,monospace" font-size="6" fill="currentColor">{}</text></svg>',
    file_csv:  '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" d="M6 3h8l4 4v14H6z"/><text x="8" y="17" font-family="JetBrains Mono,Menlo,monospace" font-size="6" fill="currentColor">csv</text></svg>',
    file:      '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" d="M6 3h8l4 4v14H6z"/></svg>',
    chevron:   '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M9 6l6 6-6 6"/></svg>',
    warn:      '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M12 3l10 18H2zM12 9v6M12 18h.01"/></svg>',
    clear:     '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M6 6l12 12M18 6L6 18"/></svg>',
  };

  function fileIconFor(name) {
    var e = extOf(name);
    if (e === "json") return ICON.file_json;
    if (e === "csv")  return ICON.file_csv;
    return ICON.file;
  }

  /* -------- Listing fetcher (deduped + cached per picker instance) -- */

  function buildListingUrl(zone, path) {
    var safe = (path || "").split("/").filter(Boolean).map(encodeURIComponent).join("/");
    return "/blob-storage/" + zone + "/" + safe;
  }

  /* -------- Factory ------------------------------------------------- */

  /** @type {(opts: any) => {element:HTMLElement,getValue:Function,setValue:Function,setError:Function,destroy:Function}} */
  function createPathPicker(options) {
    var opts = options || {};
    var rootZones = (Array.isArray(opts.rootZones) && opts.rootZones.length)
      ? opts.rootZones.filter(function (z) { return z === "raw" || z === "processed"; })
      : DEFAULT_ZONES.slice();
    if (!rootZones.length) rootZones = DEFAULT_ZONES.slice();

    var selectMode = opts.selectMode || "either";
    if (selectMode !== "file" && selectMode !== "directory" && selectMode !== "either") {
      selectMode = "either";
    }
    var fileExtensions = Array.isArray(opts.fileExtensions)
      ? opts.fileExtensions.map(function (e) { return String(e).toLowerCase().replace(/^\./, ""); })
      : null;
    var disabled = !!opts.disabled;
    var required = !!opts.required;

    /* committed value (what consumers see), pendingValue (in-popover) */
    var committed = normalizeValue(opts.value);
    var pending   = committed ? { zone: committed.zone, path: committed.path } : null;
    var currentZone = (committed && committed.zone)
      || (opts.initialPath && opts.initialPath.split("/")[0] === "processed" ? "processed" : rootZones[0]);

    /* Per-instance cache of directory listings keyed by `<zone>:<path>` */
    var dirCache    = Object.create(null); // entries[]
    var loadingDirs = Object.create(null); // 'requested' boolean
    var errorDirs   = Object.create(null); // string error
    var expandedDirs = Object.create(null); // booleans, key 'zone:path'
    var inflight = Object.create(null); // pending fetch Promises

    /* DOM (built once, mutated thereafter) */
    var wrapper = el("div", { class: "path-picker" + (disabled ? " is-disabled" : "") });

    if (opts.label) {
      wrapper.appendChild(el("label", { class: "label", text: opts.label }));
    }

    /* --- Trigger --- */
    var triggerWarn = el("span", { class: "path-picker-warn", "aria-hidden": "true", html: ICON.warn });
    var triggerLabel = el("span", { class: "path-picker-trigger-label" });
    var clearBtn = el("button", {
      class: "path-picker-clear",
      type: "button",
      "aria-label": "Clear selection",
      title: "Clear selection",
      html: ICON.clear,
      onclick: function (ev) {
        ev.stopPropagation();
        if (disabled || required) return;
        commit(null);
      },
    });
    var caret = el("span", { class: "path-picker-caret", "aria-hidden": "true", html: ICON.chevron });
    var triggerBtn = el("button", {
      class: "path-picker-trigger",
      type: "button",
      "aria-haspopup": "tree",
      "aria-expanded": "false",
      onclick: function (ev) { ev.stopPropagation(); togglePopover(); },
      onkeydown: function (ev) {
        if (ev.key === "ArrowDown" || ev.key === "Enter" || ev.key === " ") {
          ev.preventDefault();
          openPopover();
        }
      },
    }, [triggerWarn, triggerLabel, clearBtn, caret]);
    wrapper.appendChild(triggerBtn);

    var errorEl = el("div", { class: "path-picker-error", role: "alert" });
    wrapper.appendChild(errorEl);

    /* --- Popover (built lazily on first open so layout is right) --- */
    var popover = null;
    var zoneSelect = null;
    var searchInput = null;
    var treeRoot = null;
    var footerSel = null;
    var selectButton = null;
    var docDismissHandler = null;
    var docKeyHandler = null;

    function buildPopover() {
      var zoneField = el("div", { class: "path-picker-zone" });
      zoneField.appendChild(el("span", { class: "path-picker-zone-label", text: "Zone" }));
      zoneSelect = el("select", { class: "select" });
      rootZones.forEach(function (z) {
        var o = document.createElement("option");
        o.value = z; o.textContent = ZONE_LABELS[z] || z;
        zoneSelect.appendChild(o);
      });
      zoneSelect.value = currentZone;
      zoneSelect.addEventListener("change", function () {
        currentZone = zoneSelect.value;
        // Reset pending when leaving its zone — keeps things unsurprising.
        if (pending && pending.zone !== currentZone) pending = null;
        renderFooter();
        ensureLoaded("");
        renderTree();
      });
      zoneField.appendChild(zoneSelect);

      searchInput = el("input", {
        type: "search",
        class: "input path-picker-search",
        placeholder: "Filter…",
        "aria-label": "Filter files",
      });
      searchInput.addEventListener("input", debounce(function () {
        renderTree();
      }, FILTER_DEBOUNCE_MS));

      var header = el("div", { class: "path-picker-header" }, [zoneField, searchInput]);

      treeRoot = el("div", { class: "path-picker-tree", role: "tree", tabindex: "0" });
      treeRoot.addEventListener("keydown", onTreeKeydown);

      footerSel = el("div", { class: "path-picker-footer-selected" });
      var cancelBtn = el("button", {
        class: "buttons", type: "button", text: "Cancel",
        onclick: function () { closePopover(true); },
      });
      selectButton = el("button", {
        class: "buttons buttons-primary", type: "button", text: "Select",
        onclick: function () { closePopover(false); },
      });
      var footer = el("div", { class: "path-picker-footer" }, [
        footerSel,
        el("span", { class: "path-picker-footer-spacer" }),
        cancelBtn, selectButton,
      ]);

      popover = el("div", {
        class: "path-picker-popover",
        role: "dialog",
        "aria-label": "Choose a path",
        onclick: function (ev) { ev.stopPropagation(); },
      }, [header, treeRoot, footer]);
      document.body.appendChild(popover);
      popover.style.display = "none";
    }

    function positionPopover() {
      if (!popover) return;
      var rect = triggerBtn.getBoundingClientRect();
      var width = Math.max(rect.width, 360);
      popover.style.position = "fixed";
      popover.style.minWidth  = width + "px";
      popover.style.maxWidth  = Math.min(window.innerWidth - 32, 640) + "px";
      var top = rect.bottom + 6;
      var maxH = window.innerHeight - top - 16;
      popover.style.maxHeight = Math.max(280, maxH) + "px";
      popover.style.top  = top + "px";
      popover.style.left = Math.max(8, Math.min(rect.left, window.innerWidth - 8 - width)) + "px";
      popover.style.zIndex = 5000;
    }

    function openPopover() {
      if (disabled) return;
      if (!popover) buildPopover();
      pending = committed ? { zone: committed.zone, path: committed.path } : null;
      currentZone = (pending && pending.zone) || currentZone;
      if (zoneSelect) zoneSelect.value = currentZone;
      if (searchInput) searchInput.value = "";
      positionPopover();
      popover.style.display = "flex";
      triggerBtn.setAttribute("aria-expanded", "true");
      docDismissHandler = function (ev) {
        if (popover && !popover.contains(ev.target) && !triggerBtn.contains(ev.target)) {
          closePopover(true);
        }
      };
      docKeyHandler = function (ev) {
        if (ev.key === "Escape") { closePopover(true); }
      };
      document.addEventListener("mousedown", docDismissHandler, true);
      document.addEventListener("keydown",   docKeyHandler, true);
      window.addEventListener("resize", positionPopover);

      ensureLoaded("");
      // Pre-expand ancestors of pending so it's visible.
      if (pending && pending.path) {
        var parts = pending.path.split("/").filter(Boolean);
        var acc = "";
        for (var i = 0; i < parts.length - 1; i++) {
          acc = acc ? acc + "/" + parts[i] : parts[i];
          expandedDirs[currentZone + ":" + acc] = true;
          ensureLoaded(acc);
        }
      } else if (opts.initialPath) {
        var ip = String(opts.initialPath).replace(/^\/+/, "");
        var ipParts = ip.split("/").filter(Boolean);
        var ipAcc = "";
        for (var j = 0; j < ipParts.length; j++) {
          ipAcc = ipAcc ? ipAcc + "/" + ipParts[j] : ipParts[j];
          expandedDirs[currentZone + ":" + ipAcc] = true;
          ensureLoaded(ipAcc);
        }
      }
      renderTree();
      renderFooter();
      // Focus the search so the user can type immediately.
      if (searchInput) searchInput.focus();
    }

    function closePopover(cancelled) {
      if (!popover) return;
      if (!cancelled) {
        commit(pending);
      }
      popover.style.display = "none";
      triggerBtn.setAttribute("aria-expanded", "false");
      if (docDismissHandler) document.removeEventListener("mousedown", docDismissHandler, true);
      if (docKeyHandler)     document.removeEventListener("keydown",   docKeyHandler, true);
      window.removeEventListener("resize", positionPopover);
      docDismissHandler = null;
      docKeyHandler = null;
    }

    function togglePopover() {
      if (!popover || popover.style.display === "none") openPopover();
      else closePopover(true);
    }

    /* -------- Fetch + cache --------------------------------------- */

    function cacheKey(path) { return currentZone + ":" + (path || ""); }

    function ensureLoaded(path) {
      var k = cacheKey(path);
      if (dirCache[k]) return Promise.resolve(dirCache[k]);
      if (inflight[k]) return inflight[k];
      loadingDirs[k] = true;
      delete errorDirs[k];
      var url = buildListingUrl(currentZone, path);
      var p = fetch(url, {
        method: "GET",
        headers: new Headers({ "Accept": "application/json" }),
      }).then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      }).then(function (body) {
        var entries = (body && Array.isArray(body.entries)) ? body.entries : [];
        // Defensive filter: drop unsafe / hidden meta entries.
        entries = entries.filter(function (e) {
          return e && !isUnsafeName(e.name);
        });
        dirCache[k] = entries;
        delete loadingDirs[k];
        delete inflight[k];
        renderTree();
        return entries;
      }).catch(function (err) {
        delete loadingDirs[k];
        delete inflight[k];
        errorDirs[k] = (err && err.message) || String(err);
        renderTree();
        throw err;
      });
      inflight[k] = p;
      return p;
    }

    /* -------- Rendering ------------------------------------------- */

    function isExtensionAllowed(name) {
      if (!fileExtensions || !fileExtensions.length) return true;
      var e = extOf(name);
      return fileExtensions.indexOf(e) >= 0;
    }

    function setPending(zone, path) {
      pending = { zone: zone, path: path };
      renderFooter();
      // Highlight without re-fetching.
      Array.prototype.forEach.call(
        treeRoot.querySelectorAll(".path-picker-row.is-selected"),
        function (n) { n.classList.remove("is-selected"); });
      var match = treeRoot.querySelector(
        ".path-picker-row[data-path=\"" + cssEscape(path) + "\"]");
      if (match) match.classList.add("is-selected");
    }

    function cssEscape(s) {
      // Minimal escape for selector use.
      return String(s).replace(/(["\\])/g, "\\$1");
    }

    function clearTree() { while (treeRoot.firstChild) treeRoot.removeChild(treeRoot.firstChild); }

    function renderFooter() {
      if (!footerSel) return;
      if (pending) {
        footerSel.innerHTML = "";
        footerSel.appendChild(el("span", { class: "path-picker-footer-prefix", text: "Selected:" }));
        footerSel.appendChild(el("code", { text: fmtBreadcrumb(pending.zone, pending.path) }));
        if (selectButton) selectButton.disabled = !isPendingSelectable();
      } else {
        footerSel.textContent = "Nothing selected";
        if (selectButton) selectButton.disabled = required;
      }
    }

    function isPendingSelectable() {
      if (!pending) return !required;
      if (selectMode === "file" && pending.path) {
        var entries = dirCache[currentZone + ":" + parentOf(pending.path)] || [];
        var leaf = basename(pending.path);
        var entry = entries.find ? entries.find(function (e) { return e.name === leaf; }) : null;
        if (!entry) return true; // unknown — let server decide
        return entry.type === "file";
      }
      if (selectMode === "directory" && pending.path) {
        var pE = dirCache[currentZone + ":" + parentOf(pending.path)] || [];
        var pLeaf = basename(pending.path);
        var pEntry = pE.find ? pE.find(function (e) { return e.name === pLeaf; }) : null;
        if (!pEntry) return true;
        return pEntry.type === "dir";
      }
      return true;
    }

    function parentOf(p) {
      if (!p) return "";
      var i = p.lastIndexOf("/");
      return i < 0 ? "" : p.slice(0, i);
    }

    function renderTree() {
      if (!treeRoot) return;
      clearTree();
      var query = (searchInput && searchInput.value || "").trim().toLowerCase();
      // Always render the (synthetic) zone root entry.
      renderDirContents("", treeRoot, query, 0);
    }

    function renderDirContents(path, parentDom, query, depth) {
      var k = cacheKey(path);
      if (loadingDirs[k] && !dirCache[k]) {
        parentDom.appendChild(el("div", { class: "path-picker-status", text: "Loading…" }));
        return;
      }
      if (errorDirs[k]) {
        var retry = el("button", {
          class: "buttons", type: "button", text: "Retry",
          onclick: function (ev) {
            ev.stopPropagation();
            ensureLoaded(path);
          },
        });
        parentDom.appendChild(el("div", { class: "path-picker-status is-error" },
          [document.createTextNode("Couldn't load: " + errorDirs[k] + "  "), retry]));
        return;
      }
      var entries = dirCache[k] || [];
      if (!entries.length) {
        parentDom.appendChild(el("div", { class: "path-picker-status is-empty",
          text: "(this folder is empty)" }));
        return;
      }
      // Sort: dirs first, then files; alpha within each.
      var sorted = entries.slice().sort(function (a, b) {
        if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
      // Filter: if query, keep only matches OR ancestors of matches.
      var filtered = query
        ? sorted.filter(function (e) {
            return matchesQuery(e, path, query);
          })
        : sorted;
      // Auto-expand ancestors when filtering.
      if (query) {
        filtered.forEach(function (e) {
          if (e.type === "dir") expandedDirs[cacheKey(joinPath(path, e.name))] = true;
        });
      }
      // Cap visible children for sanity.
      var capped = filtered.length > MAX_VISIBLE_CHILDREN
        ? filtered.slice(0, MAX_VISIBLE_CHILDREN) : filtered;
      capped.forEach(function (entry) {
        renderEntry(entry, path, parentDom, query, depth);
      });
      if (filtered.length > MAX_VISIBLE_CHILDREN) {
        parentDom.appendChild(el("div", { class: "path-picker-status",
          text: "Showing " + MAX_VISIBLE_CHILDREN + " of " + filtered.length
            + " — refine search to see more." }));
      }
    }

    function matchesQuery(entry, parentPath, query) {
      var path = joinPath(parentPath, entry.name).toLowerCase();
      if (path.indexOf(query) >= 0) return true;
      if (entry.type === "dir") {
        // Keep dirs that have any matching descendants (we can only know
        // about loaded ones — so we keep dirs by default to allow
        // exploration).
        var k = cacheKey(joinPath(parentPath, entry.name));
        if (!dirCache[k]) return true;
        return dirCache[k].some(function (child) {
          return matchesQuery(child, joinPath(parentPath, entry.name), query);
        });
      }
      return false;
    }

    function renderEntry(entry, parentPath, parentDom, query, depth) {
      var fullPath = joinPath(parentPath, entry.name);
      var isDir = entry.type === "dir";
      var dim = !isDir && !isExtensionAllowed(entry.name);
      var row = el("div", {
        class: "path-picker-row" + (isDir ? " is-dir" : " is-file") + (dim ? " is-dim" : ""),
        role: "treeitem",
        tabindex: "-1",
        "data-path": fullPath,
        "data-depth": String(depth),
        title: fullPath + (dim && fileExtensions ? "  (only ." + fileExtensions.join(", .") + " files selectable)" : ""),
      });
      row.style.paddingLeft = (8 + Math.min(depth, 8) * 14) + "px";

      // Chevron (folders only). Padding still applied to leaves so
      // alignment stays clean.
      if (isDir) {
        var expanded = !!expandedDirs[cacheKey(fullPath)];
        row.setAttribute("aria-expanded", expanded ? "true" : "false");
        var chev = el("span", {
          class: "path-picker-chevron" + (expanded ? " is-open" : ""),
          html: ICON.chevron,
          "aria-hidden": "true",
        });
        row.appendChild(chev);
      } else {
        row.appendChild(el("span", { class: "path-picker-chevron-spacer", "aria-hidden": "true" }));
      }
      row.appendChild(el("span", {
        class: "path-picker-icon",
        "aria-hidden": "true",
        html: isDir ? ICON.folder : fileIconFor(entry.name),
      }));
      row.appendChild(el("span", { class: "path-picker-name", text: entry.name }));

      if (pending && pending.zone === currentZone && pending.path === fullPath) {
        row.classList.add("is-selected");
      }

      var canSelect = isDir ? (selectMode !== "file") : (!dim && selectMode !== "directory");

      row.addEventListener("click", function (ev) {
        ev.stopPropagation();
        if (isDir) {
          var key = cacheKey(fullPath);
          var was = !!expandedDirs[key];
          expandedDirs[key] = !was;
          if (!was) ensureLoaded(fullPath);
          if (canSelect) setPending(currentZone, fullPath);
          renderTree();
          // Keep keyboard focus on the row that was just clicked.
          var fresh = treeRoot.querySelector(
            ".path-picker-row[data-path=\"" + cssEscape(fullPath) + "\"]");
          if (fresh) fresh.focus();
        } else if (canSelect) {
          setPending(currentZone, fullPath);
        }
      });
      row.addEventListener("dblclick", function (ev) {
        ev.stopPropagation();
        if (isDir) {
          if (!expandedDirs[cacheKey(fullPath)]) {
            expandedDirs[cacheKey(fullPath)] = true;
            ensureLoaded(fullPath);
          }
          if (canSelect) {
            setPending(currentZone, fullPath);
            closePopover(false);
          } else {
            renderTree();
          }
        } else if (canSelect) {
          setPending(currentZone, fullPath);
          closePopover(false);
        }
      });

      parentDom.appendChild(row);

      if (isDir && expandedDirs[cacheKey(fullPath)]) {
        var children = el("div", { class: "path-picker-children", role: "group" });
        parentDom.appendChild(children);
        renderDirContents(fullPath, children, query, depth + 1);
      }
    }

    /* -------- Keyboard nav (WAI-ARIA tree pattern) ---------------- */

    function visibleRows() {
      return Array.prototype.slice.call(treeRoot.querySelectorAll(".path-picker-row"));
    }

    function onTreeKeydown(ev) {
      var rows = visibleRows();
      if (!rows.length) return;
      var active = document.activeElement && document.activeElement.classList
                   && document.activeElement.classList.contains("path-picker-row")
        ? document.activeElement : null;
      var idx = active ? rows.indexOf(active) : -1;

      function focusAt(i) {
        if (i < 0 || i >= rows.length) return;
        rows.forEach(function (r) { r.tabIndex = -1; });
        rows[i].tabIndex = 0;
        rows[i].focus();
      }

      if (ev.key === "ArrowDown")  { ev.preventDefault(); focusAt(idx < 0 ? 0 : Math.min(rows.length - 1, idx + 1)); return; }
      if (ev.key === "ArrowUp")    { ev.preventDefault(); focusAt(idx <= 0 ? 0 : idx - 1); return; }
      if (ev.key === "Home")       { ev.preventDefault(); focusAt(0); return; }
      if (ev.key === "End")        { ev.preventDefault(); focusAt(rows.length - 1); return; }
      if (ev.key === "Enter")      {
        if (active) { ev.preventDefault(); active.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true })); }
        return;
      }
      if (ev.key === "ArrowRight") {
        if (active && active.classList.contains("is-dir")) {
          ev.preventDefault();
          var p = active.getAttribute("data-path");
          if (!expandedDirs[cacheKey(p)]) {
            expandedDirs[cacheKey(p)] = true;
            ensureLoaded(p);
            renderTree();
          }
        }
        return;
      }
      if (ev.key === "ArrowLeft") {
        if (active && active.classList.contains("is-dir")
            && expandedDirs[cacheKey(active.getAttribute("data-path"))]) {
          ev.preventDefault();
          delete expandedDirs[cacheKey(active.getAttribute("data-path"))];
          renderTree();
        }
        return;
      }
    }

    /* -------- Public state ---------------------------------------- */

    function commit(value) {
      committed = normalizeValue(value);
      pending = committed ? { zone: committed.zone, path: committed.path } : null;
      renderTrigger();
      if (typeof opts.onChange === "function") {
        try { opts.onChange(committed ? { zone: committed.zone, path: committed.path } : null); }
        catch (e) { console.error("[path-picker] onChange threw:", e); }
      }
    }

    function renderTrigger() {
      if (committed && committed.zone) {
        triggerLabel.textContent = fmtBreadcrumb(committed.zone, committed.path);
        triggerBtn.classList.add("has-value");
        triggerBtn.title = committed.zone + "/" + (committed.path || "");
        clearBtn.style.display = required ? "none" : "";
      } else {
        triggerLabel.textContent = opts.placeholder || "Pick a path…";
        triggerBtn.classList.remove("has-value");
        triggerBtn.title = "";
        clearBtn.style.display = "none";
      }
    }

    function setError(msg) {
      if (msg && String(msg).length) {
        errorEl.textContent = String(msg);
        errorEl.classList.add("is-active");
        triggerBtn.classList.add("has-error");
        triggerWarn.style.display = "";
      } else {
        errorEl.textContent = "";
        errorEl.classList.remove("is-active");
        triggerBtn.classList.remove("has-error");
        triggerWarn.style.display = "none";
      }
    }

    function destroy() {
      closePopover(true);
      if (popover && popover.parentNode) popover.parentNode.removeChild(popover);
      if (wrapper.parentNode) wrapper.parentNode.removeChild(wrapper);
    }

    function normalizeValue(v) {
      if (!v) return null;
      var z = v.zone === "processed" ? "processed" : (v.zone === "raw" ? "raw" : null);
      if (!z) return null;
      var p = String(v.path || "").replace(/^\/+/, "");
      if (p.indexOf("..") >= 0 || p.indexOf("\\") >= 0) return null;
      return { zone: z, path: p };
    }

    /* -------- Init ------------------------------------------------- */

    setError(opts.error || "");
    triggerWarn.style.display = (opts.error ? "" : "none");
    renderTrigger();

    return {
      element: wrapper,
      getValue: function () { return committed ? { zone: committed.zone, path: committed.path } : null; },
      setValue: function (v) { commit(v); },
      setError: setError,
      destroy: destroy,
      /* Power users — expose for tests / advanced consumers. */
      _internal: { invalidateCache: function () {
        Object.keys(dirCache).forEach(function (k) { delete dirCache[k]; });
        Object.keys(expandedDirs).forEach(function (k) { delete expandedDirs[k]; });
        if (popover && popover.style.display !== "none") renderTree();
      } },
    };
  }

  window.createPathPicker = createPathPicker;
})();
