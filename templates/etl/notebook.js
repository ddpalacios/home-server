/* Notebook view — sidebar-driven activity that takes over the main canvas. */

(function () {
  "use strict";

  const NB = {
    booted: false,
    current: null,        // { notebook_id, name, cells, dirty, exec_counter }
    list: [],
    inFlight: null,
    runningCellId: null,
    autosaveTimer: null,
    varsVisible: false,
    selectedCellId: null,
    sparkPollTimer: null,
    sparkStatusNode: null,
  };

  NB.runningJobs = NB.runningJobs || new Map();   // job_id -> {notebook_id, notebook_name, cell_id, started_at, last_progress}

  function registerRunningJob(cell, notebook) {
    NB.runningJobs.set(cell.job_id, {
      notebook_id: notebook.notebook_id,
      notebook_name: notebook.name || "Untitled",
      cell_id: cell.id,
      started_at: Date.now(),
      last_progress: null,
    });
    if (typeof renderRunningPanel === "function") renderRunningPanel();
    if (typeof renderSidebarList === "function") renderSidebarList();
  }

  function unregisterRunningJob(job_id) {
    NB.runningJobs.delete(job_id);
    if (typeof renderRunningPanel === "function") renderRunningPanel();
    if (typeof renderSidebarList === "function") renderSidebarList();
  }

  const AUTOSAVE_DEBOUNCE_MS = 5000;
  const SPARK_POLL_INTERVAL_MS = 1500;
  const SPARK_POLL_DELAY_MS = 800;
  const SPARK_HINT_RE = /\b(spark\.|sc\.|%sparksql|\.toPandas\(|\.collect\(|\.show\(|\.write\.|\.read\.|sql\()/;

  function uid(prefix) {
    return prefix + "_" + Math.random().toString(36).slice(2, 10);
  }

  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === "class") node.className = attrs[k];
        else if (k === "text") node.textContent = attrs[k];
        else if (k === "html") node.innerHTML = attrs[k];
        else if (k.startsWith("on") && typeof attrs[k] === "function") {
          node.addEventListener(k.slice(2), attrs[k]);
        } else if (attrs[k] !== null && attrs[k] !== undefined) {
          node.setAttribute(k, attrs[k]);
        }
      });
    }
    (children || []).forEach(function (c) {
      if (c == null) return;
      if (typeof c === "string") node.appendChild(document.createTextNode(c));
      else node.appendChild(c);
    });
    return node;
  }

  function setKernelStatus(text, klass) {
    const node = document.getElementById("nb_kernel_status");
    if (!node) return;
    // While a cell is running, only the runCell flow may overwrite the status —
    // otherwise concurrent operations (save, auto-save, etc.) would clobber the
    // "Running…" indicator and make it look like the kernel went idle.
    if (NB.runningCellId && klass !== "nb-busy" && klass !== "nb-error") {
      return;
    }
    const label = node.querySelector(".nb-status-label");
    if (label) {
      label.textContent = text;
    } else {
      node.textContent = text;
    }
    node.className = "nb-kernel-status" + (klass ? " " + klass : "");
  }

  function setDirtyBadge(dirty) {
    const node = document.getElementById("nb_save");
    if (!node) return;
    const label = node.querySelector(".nb-btn-label");
    if (dirty) {
      node.classList.add("nb-save-dirty");
      if (label) label.textContent = "Save *"; else node.textContent = "Save *";
    } else {
      node.classList.remove("nb-save-dirty");
      if (label) label.textContent = "Save"; else node.textContent = "Save";
    }
  }

  function markDirty() {
    if (!NB.current) return;
    NB.current.dirty = true;
    setDirtyBadge(true);
    scheduleAutoSave();
  }

  function makeBlankCell(type) {
    return {
      id: uid("c"),
      type: type || "code",
      source: "",
      output: null,
      status: "idle",
      exec_count: null,
    };
  }

  function newEmptyNotebook() {
    return {
      notebook_id: uid("nb"),
      name: "Untitled notebook",
      cells: [makeBlankCell("code")],
      dirty: false,
      exec_counter: 0,
    };
  }

  // ---- layout toggle -------------------------------------------------------

  function showNotebookView() {
    document.body.classList.add("notebook-mode");
    const ws = document.getElementById("notebook_workspace");
    if (ws) ws.hidden = false;
  }

  function hideNotebookView() {
    document.body.classList.remove("notebook-mode");
    const ws = document.getElementById("notebook_workspace");
    if (ws) ws.hidden = true;
    stopAutoSave();
  }

  // ---- sidebar list --------------------------------------------------------

  function refreshList() {
    return fetch("/etl/notebook/list")
      .then(function (r) { return r.json(); })
      .then(function (data) {
        NB.list = (data && data.notebooks) || [];
        renderSidebarList();
      })
      .catch(function () { /* ignore */ });
  }

  const NOTEBOOK_ICON_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true">' +
    '<path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3V4z" fill="none" stroke="currentColor" stroke-width="1.6"/>' +
    '<path d="M5 4v13" fill="none" stroke="currentColor" stroke-width="1.6"/>' +
    '<path d="M9 9h6M9 12h6M9 15h4" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>' +
    '</svg>';

  function renderSidebarList() {
    const root = document.getElementById("notebookList");
    if (!root) return;
    root.innerHTML = "";
    NB.list.forEach(function (item) {
      const isCurrent = NB.current && NB.current.notebook_id === item.notebook_id;
      const card = el("div", {
        class: "pipeline-list-item buttons" + (isCurrent ? " is-active" : ""),
        "data-notebook-id": item.notebook_id,
        role: "button",
        tabindex: "0",
        onclick: function () { openNotebook(item.notebook_id); },
        onkeydown: function (ev) {
          if (ev.key === "Enter" || ev.key === " ") {
            ev.preventDefault();
            openNotebook(item.notebook_id);
          }
        },
      }, []);

      const icon = el("span", { class: "activity-icon", "aria-hidden": "true", html: NOTEBOOK_ICON_SVG }, []);
      const label = el("span", { class: "pipeline-list-label", text: item.name || item.notebook_id }, []);
      const delBtn = el("button", {
        class: "pipeline-options-trigger",
        type: "button",
        "aria-label": "Delete notebook",
        title: "Delete",
        html: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
        onclick: function (ev) { ev.stopPropagation(); deleteNotebook(item.notebook_id); },
      }, []);

      card.appendChild(icon);
      card.appendChild(label);
      card.appendChild(delBtn);
      root.appendChild(el("div", { class: "pipeline-list-row" }, [card]));
    });
  }

  // ---- save / load / new ---------------------------------------------------

  function newNotebook() {
    if (NB.current && NB.current.dirty) {
      if (!confirm("Discard unsaved changes in the current notebook?")) return;
    }
    NB.current = newEmptyNotebook();
    document.getElementById("nb_name").value = NB.current.name;
    showNotebookView();
    renderCells();
    renderSidebarList();
    setKernelStatus("Idle");
    setDirtyBadge(false);
    if (NB.varsVisible) refreshVars();
  }

  function openNotebook(notebook_id) {
    return fetch("/etl/notebook/load?notebook_id=" + encodeURIComponent(notebook_id))
      .then(function (r) {
        if (!r.ok) throw new Error("not found");
        return r.json();
      })
      .then(function (doc) {
        const cells = (doc.cells && doc.cells.length) ? doc.cells : [makeBlankCell("code")];
        // Backfill missing fields on older saved notebooks.
        cells.forEach(function (c) {
          if (!c.type) c.type = "code";
          if (c.exec_count === undefined) c.exec_count = null;
        });
        const maxCount = cells.reduce(function (m, c) {
          return (typeof c.exec_count === "number" && c.exec_count > m) ? c.exec_count : m;
        }, 0);
        NB.current = {
          notebook_id: doc.notebook_id,
          name: doc.name || "",
          cells: cells,
          dirty: false,
          exec_counter: maxCount,
        };
        document.getElementById("nb_name").value = NB.current.name;
        showNotebookView();
        renderCells();
        renderSidebarList();
        setDirtyBadge(false);
        setKernelStatus("Idle");
        if (NB.varsVisible) refreshVars();
        // Re-attach to any cell that has a job_id but no recorded final status.
        (NB.current.cells || []).forEach(function (c) {
          if (c.job_id && !(c.output && c.output.status &&
                            c.output.status !== "running")) {
            // Clear the output area; the SSE replay will repopulate it.
            if (c._outputNode) c._outputNode.innerHTML = "";
            registerRunningJob(c, NB.current);
            attachEventStream(c, NB.current, c.job_id, -1, {});
          }
        });
      });
  }

  function saveCurrent() {
    return saveNotebookSnapshot(NB.current).then(function () {
      if (NB.current) {
        NB.current.dirty = false;
        setDirtyBadge(false);
      }
      return refreshList();
    });
  }

  // Save a specific notebook object (not necessarily NB.current). Used when
  // a cell finishes running after the user has navigated away — we persist
  // the result so re-opening the notebook surfaces it.
  function saveNotebookSnapshot(notebook) {
    if (!notebook) return Promise.resolve();
    const payload = {
      notebook_id: notebook.notebook_id,
      name: notebook.name || "Untitled notebook",
      cells: notebook.cells.map(function (c) {
        return {
          id: c.id,
          type: c.type || "code",
          source: c.source,
          output: c.output,
          status: c.status,
          exec_count: c.exec_count,
          job_id: c.job_id || null,
        };
      }),
    };
    return fetch("/etl/notebook/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then(function (r) { return r.json(); }).catch(function () { /* swallow */ });
  }

  function deleteNotebook(notebook_id) {
    if (!confirm("Delete this notebook?")) return;
    fetch("/etl/notebook/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notebook_id: notebook_id }),
    }).then(function () {
      if (NB.current && NB.current.notebook_id === notebook_id) {
        NB.current = null;
        hideNotebookView();
      }
      return refreshList();
    });
  }

  function exportIpynb() {
    if (!NB.current) return;
    if (NB.current.dirty) {
      // Save first so the export reflects on-screen state.
      saveCurrent().then(triggerDownload);
    } else {
      triggerDownload();
    }
    function triggerDownload() {
      const url = "/etl/notebook/export?notebook_id=" + encodeURIComponent(NB.current.notebook_id);
      window.location.href = url;
    }
  }

  // ---- auto-save -----------------------------------------------------------

  function scheduleAutoSave() {
    if (NB.autosaveTimer) clearTimeout(NB.autosaveTimer);
    NB.autosaveTimer = setTimeout(function () {
      NB.autosaveTimer = null;
      if (NB.current && NB.current.dirty) {
        saveCurrent().then(function () { setKernelStatus("Auto-saved"); });
      }
    }, AUTOSAVE_DEBOUNCE_MS);
  }

  function stopAutoSave() {
    if (NB.autosaveTimer) {
      clearTimeout(NB.autosaveTimer);
      NB.autosaveTimer = null;
    }
  }

  // ---- cell rendering ------------------------------------------------------

  function renderCells() {
    const root = document.getElementById("nb_cells");
    if (!root) return;
    root.innerHTML = "";
    NB.current.cells.forEach(function (cell) {
      root.appendChild(renderCell(cell));
    });
    root.appendChild(el("button", {
      class: "nb-add-cell",
      type: "button",
      onclick: function () { addCell(NB.current.cells.length, "code"); },
    }, ["+ Add cell"]));

    if (window.jQuery && jQuery.fn.sortable) {
      jQuery(root).sortable({
        items: ".nb-cell",
        handle: ".nb-drag-handle",
        update: function () {
          const newOrder = [];
          jQuery(root).children(".nb-cell").each(function () {
            const id = this.getAttribute("data-cell-id");
            const existing = NB.current.cells.find(function (c) { return c.id === id; });
            if (existing) newOrder.push(existing);
          });
          NB.current.cells = newOrder;
          markDirty();
        },
      });
    }
  }

  function renderCell(cell) {
    const wrapper = el("div", {
      class: "nb-cell nb-" + (cell.status || "idle") + " nb-cell-type-" + (cell.type || "code"),
      "data-cell-id": cell.id,
    }, []);

    const handle = el("span", { class: "nb-drag-handle", title: "Drag to reorder" }, ["⋮⋮"]);
    const execBadge = el("span", {
      class: "nb-exec-badge",
      text: cell.exec_count != null ? "[" + cell.exec_count + "]" : "[ ]",
    }, []);
    const pillLabel = el("span", { class: "nb-status-label", text: cell.status || "idle" }, []);
    const pill = el("span", { class: "nb-status-pill" }, [
      el("span", { class: "nb-spinner" }, []),
      pillLabel,
    ]);

    const typeSelect = el("select", {
      class: "nb-cell-type-select",
      title: "Cell type",
      onchange: function (ev) {
        cell.type = ev.target.value;
        markDirty();
        renderCells();
      },
    }, []);
    ["code", "markdown"].forEach(function (t) {
      const opt = document.createElement("option");
      opt.value = t;
      opt.textContent = t === "code" ? "Code" : "Markdown";
      if ((cell.type || "code") === t) opt.selected = true;
      typeSelect.appendChild(opt);
    });

    const runBtn = el("button", {
      class: "nb-run", type: "button",
      onclick: function () { runCell(cell.id); },
      title: "Run cell (Shift+Enter)",
      html: '<svg viewBox="0 0 24 24" width="11" height="11" aria-hidden="true"><path d="M7 5l12 7-12 7V5z" fill="currentColor"/></svg><span style="margin-left:6px">Run</span>',
    }, []);
    const delBtn = el("button", {
      type: "button",
      onclick: function () { deleteCell(cell.id); },
    }, ["✕"]);
    const actions = el("div", { class: "nb-cell-actions" }, [typeSelect, runBtn, delBtn]);
    const header = el("div", { class: "nb-cell-header" }, [execBadge, pill, handle, actions]);

    wrapper.appendChild(header);

    if ((cell.type || "code") === "markdown") {
      mountMarkdownEditor(wrapper, cell);
    } else {
      mountCodeEditor(wrapper, cell);
    }

    const output = el("div", { class: "nb-cell-output" }, []);
    wrapper.appendChild(output);

    cell._wrapper = wrapper;
    cell._outputNode = output;
    cell._statusLabel = pillLabel;
    cell._execBadge = execBadge;

    wrapper.addEventListener("mousedown", function () { selectCell(cell.id); }, true);

    if (NB.selectedCellId === cell.id) wrapper.classList.add("nb-selected");
    if (cell.output && (cell.type || "code") === "code") renderOutput(cell._outputNode, cell.output);
    return wrapper;
  }

  function mountCodeEditor(wrapper, cell) {
    const editorHost = el("div", { class: "nb-cell-editor" }, []);
    const textarea = el("textarea", {}, []);
    textarea.value = cell.source || "";
    editorHost.appendChild(textarea);
    wrapper.appendChild(editorHost);

    setTimeout(function () {
      if (typeof CodeMirror === "undefined") return;
      ensurePythonLinter();
      const foldAvailable = !!(CodeMirror.fold && CodeMirror.fold.indent);
      const gutters = ["CodeMirror-linenumbers", "CodeMirror-lint-markers"];
      if (foldAvailable) gutters.push("CodeMirror-foldgutter");
      const cm = CodeMirror.fromTextArea(textarea, {
        mode: { name: "python", version: 3 },
        theme: "eclipse",
        lineNumbers: true,
        indentUnit: 4,
        viewportMargin: Infinity,
        gutters: gutters,
        foldGutter: foldAvailable,
        foldOptions: foldAvailable ? {
          rangeFinder: CodeMirror.fold.indent,
          minFoldSize: 2,
          scanUp: false,
        } : undefined,
        lint: typeof CodeMirror.lint !== "undefined" ? {
          getAnnotations: pythonLintAnnotations,
          async: true,
          delay: 450,
          lintOnChange: true,
        } : false,
        extraKeys: {
          "Shift-Enter":   function () { runCell(cell.id, { advance: true }); },
          "Ctrl-Enter":    function () { runCell(cell.id, { advance: false }); },
          "Esc":           function (cmInstance) { cmInstance.getInputField().blur(); },
          "Ctrl-Q":        function (cmInstance) {
            if (cmInstance.foldCode) cmInstance.foldCode(cmInstance.getCursor());
          },
          "Cmd-Q":         function (cmInstance) {
            if (cmInstance.foldCode) cmInstance.foldCode(cmInstance.getCursor());
          },
          "Shift-Ctrl-[":  function (cmInstance) {
            if (cmInstance.foldCode) cmInstance.foldCode(cmInstance.getCursor());
          },
          "Shift-Ctrl-]":  function (cmInstance) {
            if (cmInstance.foldCode) cmInstance.foldCode(cmInstance.getCursor());
          },
        },
      });
      cm.on("focus", function () { selectCell(cell.id); });
      cm.on("change", function () {
        cell.source = cm.getValue();
        markDirty();
      });
      cell._cm = cm;
    }, 0);
  }

  let _lintInflight = null;
  function pythonLintAnnotations(text, updateLinting, options, cmInstance) {
    if (_lintInflight && typeof _lintInflight.abort === "function") {
      try { _lintInflight.abort(); } catch (e) {}
    }
    if (!text || !text.trim()) {
      updateLinting([]);
      return;
    }
    const controller = (typeof AbortController !== "undefined") ? new AbortController() : null;
    _lintInflight = controller;
    const notebookId = (NB && NB.current && NB.current.notebook_id) ? NB.current.notebook_id : "";
    fetch("/etl/notebook/lint", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: text, notebook_id: notebookId }),
      signal: controller ? controller.signal : undefined,
    }).then(function (r) { return r.json(); })
      .then(function (data) {
        const diags = (data && Array.isArray(data.diagnostics)) ? data.diagnostics : [];
        const annotations = diags.map(function (d) {
          return {
            from: CodeMirror.Pos(d.line | 0, d.col | 0),
            to:   CodeMirror.Pos(d.end_line | 0, Math.max((d.end_col | 0), (d.col | 0) + 1)),
            message: d.message || "issue",
            severity: d.severity === "error" ? "error" : "warning",
          };
        });
        updateLinting(annotations);
      })
      .catch(function () { updateLinting([]); });
  }

  function ensurePythonLinter() {
    if (typeof CodeMirror === "undefined" || typeof CodeMirror.registerHelper !== "function") return;
    if (CodeMirror._nbPyLintRegistered) return;
    CodeMirror.registerHelper("lint", "python", function () { return []; });
    CodeMirror._nbPyLintRegistered = true;
  }

  function mountMarkdownEditor(wrapper, cell) {
    const host = el("div", { class: "nb-md-host" }, []);
    const view = el("div", { class: "nb-md-view" }, []);
    const editor = el("textarea", { class: "nb-md-editor", placeholder: "Markdown…" }, []);
    editor.value = cell.source || "";

    function renderMd() {
      const src = cell.source || "";
      if (!src.trim()) {
        view.innerHTML = '<em class="nb-md-empty">Empty markdown — double-click to edit.</em>';
        return;
      }
      try {
        view.innerHTML = (window.marked && window.marked.parse) ? window.marked.parse(src) : escapeHtml(src);
      } catch (e) {
        view.textContent = src;
      }
    }
    renderMd();

    function enterEditMode() {
      host.classList.add("nb-md-editing");
      editor.style.height = Math.max(80, view.scrollHeight) + "px";
      editor.focus();
    }
    function exitEditMode() {
      host.classList.remove("nb-md-editing");
      cell.source = editor.value;
      renderMd();
      markDirty();
    }

    view.addEventListener("dblclick", enterEditMode);
    editor.addEventListener("blur", exitEditMode);
    editor.addEventListener("input", function () {
      cell.source = editor.value;
      markDirty();
    });
    editor.addEventListener("keydown", function (ev) {
      if (ev.key === "Enter" && ev.shiftKey) {
        ev.preventDefault();
        editor.blur();
      }
    });

    host.appendChild(view);
    host.appendChild(editor);
    wrapper.appendChild(host);

    // Auto-enter edit mode if the cell is freshly created (empty source).
    if (!cell.source) setTimeout(enterEditMode, 0);
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  // Last line of a Python traceback usually has the most useful info.
  function summarizeError(text) {
    if (!text) return "see cell output";
    const lines = String(text).trim().split(/\r?\n/);
    for (let i = lines.length - 1; i >= 0; i--) {
      const t = lines[i].trim();
      if (t && !t.startsWith("File ") && !t.startsWith("at ")) {
        return t.length > 140 ? t.slice(0, 137) + "…" : t;
      }
    }
    return lines[lines.length - 1] || "see cell output";
  }

  function showToast(message, severity, onClick) {
    let layer = document.getElementById("nb_toast_layer");
    if (!layer) {
      layer = document.createElement("div");
      layer.id = "nb_toast_layer";
      layer.className = "nb-toast-layer";
      document.body.appendChild(layer);
    }
    const toast = document.createElement("div");
    toast.className = "nb-toast nb-toast-" + (severity || "info");
    if (typeof onClick === "function") {
      toast.classList.add("nb-toast-clickable");
      toast.addEventListener("click", function (ev) {
        if (ev.target.classList && ev.target.classList.contains("nb-toast-close")) return;
        onClick();
        dismiss();
      });
    }
    const msg = document.createElement("div");
    msg.className = "nb-toast-message";
    msg.textContent = message;
    toast.appendChild(msg);
    const close = document.createElement("button");
    close.className = "nb-toast-close";
    close.type = "button";
    close.setAttribute("aria-label", "Dismiss");
    close.textContent = "×";
    close.addEventListener("click", function (ev) {
      ev.stopPropagation();
      dismiss();
    });
    toast.appendChild(close);
    layer.appendChild(toast);
    function dismiss() {
      toast.classList.add("nb-toast-leaving");
      setTimeout(function () { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 220);
    }
    setTimeout(dismiss, 9000);
    return toast;
  }

  function setCellStatus(cell, status) {
    cell.status = status;
    if (cell._wrapper) {
      cell._wrapper.classList.remove("nb-idle", "nb-running", "nb-success", "nb-error");
      cell._wrapper.classList.add("nb-" + status);
    }
    if (cell._statusLabel) cell._statusLabel.textContent = status;
  }

  function setExecBadge(cell) {
    if (cell._execBadge) {
      cell._execBadge.textContent = cell.exec_count != null ? "[" + cell.exec_count + "]" : "[ ]";
    }
  }

  function addCell(idx, type) {
    NB.current.cells.splice(idx, 0, makeBlankCell(type || "code"));
    markDirty();
    renderCells();
  }

  function deleteCell(cellId) {
    const i = NB.current.cells.findIndex(function (c) { return c.id === cellId; });
    if (i < 0) return;
    NB.current.cells.splice(i, 1);
    if (NB.current.cells.length === 0) NB.current.cells.push(makeBlankCell("code"));
    markDirty();
    renderCells();
  }

  function focusCell(idx) {
    const target = NB.current.cells[idx];
    if (!target) return;
    setTimeout(function () { if (target._cm) target._cm.focus(); }, 0);
  }

  // ---- Spark live status ---------------------------------------------------

  function startSparkPolling(cell) {
    stopSparkPolling();
    if (!cell || !cell._outputNode) return;

    // Skip polling entirely for cells that don't look Spark-related — keeps
    // the network log quiet for plain Python cells.
    const code = (cell._cm ? cell._cm.getValue() : cell.source) || "";
    if (!SPARK_HINT_RE.test(code)) return;

    // Mount the widget at the top of the cell's output area so it sits above
    // any stdout/stderr chunks once the response arrives.
    const widget = el("div", { class: "nb-spark-widget" }, []);
    widget.innerHTML = '<div class="nb-spark-header">' +
      '<span class="nb-spark-dot"></span>' +
      '<span class="nb-spark-title">Spark</span>' +
      '<span class="nb-spark-summary"></span>' +
      '</div>' +
      '<div class="nb-spark-body"></div>';

    cell._outputNode.innerHTML = "";
    cell._outputNode.appendChild(widget);
    NB.sparkStatusNode = widget;

    function poll() {
      fetch("/etl/notebook/spark/status")
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (!NB.sparkStatusNode) return;
          renderSparkWidget(NB.sparkStatusNode, data);
        })
        .catch(function () { /* ignore transient errors */ });
    }
    // Delay the first poll so short-lived cells don't trigger any /spark/status
    // hits at all.
    NB.sparkPollDelay = setTimeout(function () {
      NB.sparkPollDelay = null;
      poll();
      NB.sparkPollTimer = setInterval(poll, SPARK_POLL_INTERVAL_MS);
    }, SPARK_POLL_DELAY_MS);
  }

  function stopSparkPolling() {
    if (NB.sparkPollTimer) {
      clearInterval(NB.sparkPollTimer);
      NB.sparkPollTimer = null;
    }
    if (NB.sparkPollDelay) {
      clearTimeout(NB.sparkPollDelay);
      NB.sparkPollDelay = null;
    }
    NB.sparkStatusNode = null;
  }

  function renderSparkWidget(widget, data) {
    const summary = widget.querySelector(".nb-spark-summary");
    const body = widget.querySelector(".nb-spark-body");
    if (!summary || !body) return;

    if (!data || !data.active) {
      summary.textContent = data && data.error ? "session error" : "session not started";
      body.innerHTML = "";
      widget.classList.remove("nb-spark-running");
      return;
    }

    const jobs = data.jobs || [];
    const totalActive = jobs.reduce(function (sum, job) {
      return sum + (job.stages || []).reduce(function (s, st) { return s + (st.num_active || 0); }, 0);
    }, 0);
    const parallelism = data.default_parallelism || 0;

    if (!jobs.length) {
      summary.textContent = "idle · default parallelism " + parallelism;
      body.innerHTML = "";
      widget.classList.remove("nb-spark-running");
      return;
    }

    widget.classList.add("nb-spark-running");
    summary.textContent = jobs.length + (jobs.length === 1 ? " job" : " jobs") +
      " · " + totalActive + "/" + parallelism + " task slots active";

    // Render jobs and stages.
    body.innerHTML = "";
    jobs.forEach(function (job) {
      const jobEl = el("div", { class: "nb-spark-job" }, []);
      jobEl.appendChild(el("div", {
        class: "nb-spark-job-header",
        text: "Job " + job.job_id + " · " + (job.status || "RUNNING"),
      }, []));

      (job.stages || []).forEach(function (stage) {
        const total = stage.num_tasks || 0;
        const done = stage.num_completed || 0;
        const active = stage.num_active || 0;
        const failed = stage.num_failed || 0;
        const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;

        const stageEl = el("div", { class: "nb-spark-stage" }, []);
        stageEl.appendChild(el("div", { class: "nb-spark-stage-name", text: stage.name || ("Stage " + stage.stage_id) }, []));

        const bar = el("div", { class: "nb-spark-bar" }, []);
        const fill = el("div", { class: "nb-spark-bar-fill", style: "width: " + pct + "%" }, []);
        const activeFill = el("div", {
          class: "nb-spark-bar-active",
          style: "left: " + pct + "%; width: " + (total > 0 ? Math.min(100 - pct, Math.round((active / total) * 100)) : 0) + "%",
        }, []);
        bar.appendChild(fill);
        bar.appendChild(activeFill);
        stageEl.appendChild(bar);

        const stats = el("div", { class: "nb-spark-stats" }, []);
        stats.appendChild(el("span", { text: done + " / " + total + " tasks" }, []));
        if (active) stats.appendChild(el("span", { class: "nb-spark-stat-active", text: active + " active" }, []));
        if (failed) stats.appendChild(el("span", { class: "nb-spark-stat-failed", text: failed + " failed" }, []));
        stats.appendChild(el("span", { class: "nb-spark-stat-pct", text: pct + "%" }, []));
        stageEl.appendChild(stats);

        jobEl.appendChild(stageEl);
      });

      body.appendChild(jobEl);
    });

    // Executor footer (just the count + total running tasks).
    const execs = data.executors || [];
    if (execs.length) {
      const totalRunning = execs.reduce(function (s, e) { return s + (e.running_tasks || 0); }, 0);
      body.appendChild(el("div", {
        class: "nb-spark-execs",
        text: execs.length + (execs.length === 1 ? " executor" : " executors") +
              " · " + totalRunning + " tasks running",
      }, []));
    }
  }

  // ---- run + output --------------------------------------------------------

  async function runCell(cellId, opts) {
    const cell = NB.current.cells.find(function (c) { return c.id === cellId; });
    if (!cell) return { status: "skipped" };
    if ((cell.type || "code") === "markdown") {
      if (cell._wrapper) cell._wrapper.classList.remove("nb-md-editing");
      return { status: "success" };
    }
    const code = (cell._cm ? cell._cm.getValue() : cell.source) || "";
    if (!code.trim()) return { status: "skipped" };
    cell.source = code;

    const owningNotebook = NB.current;
    setCellStatus(cell, "running");
    setKernelStatus("Running…", "nb-busy");
    // Clear any prior output node so streaming chunks render into a clean container.
    if (cell._outputNode) cell._outputNode.innerHTML = "";

    let resp;
    try {
      resp = await fetch("/etl/notebook/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notebook_id: owningNotebook.notebook_id,
          cell_id: cellId,
          code: code,
        }),
      }).then(function (r) { return r.json(); });
    } catch (err) {
      finalizeWithError(cell, owningNotebook, "Failed to submit cell: " + (err && err.message));
      return { status: "error" };
    }
    cell.job_id = resp.job_id;
    registerRunningJob(cell, owningNotebook);
    attachEventStream(cell, owningNotebook, resp.job_id, -1, opts);
    return { status: "submitted", job_id: resp.job_id };
  }

  function finalizeWithError(cell, owningNotebook, message) {
    const errData = {
      status: "error", stderr: message, stdout: "",
      result: { type: "none", value: null }, images: [],
    };
    cell.output = errData;
    cell.status = "error";
    owningNotebook.dirty = true;
    if (typeof renderOutputForCell === "function") renderOutputForCell(cell, errData);
    if (cell.job_id) unregisterRunningJob(cell.job_id);
    if (NB.current === owningNotebook) {
      setCellStatus(cell, "error");
      setKernelStatus("Error", "nb-error");
    }
  }

  function attachEventStream(cell, owningNotebook, job_id, fromSeq, opts) {
    const url = "/etl/notebook/events/" + encodeURIComponent(job_id) + "?from=" + fromSeq;
    const es = new EventSource(url);
    cell._eventSource = es;
    let lastSeq = fromSeq;
    es.onmessage = function (msg) {
      if (!msg.data) return;
      let ev;
      try { ev = JSON.parse(msg.data); } catch (e) { return; }
      if (typeof ev.seq === "number") lastSeq = ev.seq;
      applyEvent(cell, owningNotebook, ev);
      if (ev.type === "complete") {
        es.close();
        cell._eventSource = null;
        finalizeCell(cell, owningNotebook, ev, opts);
      }
    };
    es.onerror = function () {
      if (es.readyState === EventSource.CLOSED) {
        // Reconnect from where we left off.
        setTimeout(function () {
          if (cell.job_id === job_id && !cell._eventSource) {
            attachEventStream(cell, owningNotebook, job_id, lastSeq, opts);
          }
        }, 2000);
      }
    };
  }

  function applyEvent(cell, owningNotebook, ev) {
    const onOwner = NB.current && NB.current.notebook_id === owningNotebook.notebook_id;
    switch (ev.type) {
      case "start":
        if (onOwner && cell._outputNode) cell._outputNode.innerHTML = "";
        break;
      case "stdout_chunk":
        appendChunkToCell(cell, "nb-stdout", ev.text || "");
        break;
      case "stderr_chunk":
        appendChunkToCell(cell, "nb-stderr", ev.text || "");
        break;
      case "spark": {
        const entry = NB.runningJobs.get(cell.job_id);
        if (entry) {
          entry.last_progress = ev;
          if (typeof renderRunningPanel === "function") renderRunningPanel();
        }
        if (onOwner) updateInlineSparkBar(cell, ev);
        break;
      }
      case "result":
        cell.output = cell.output || { stdout: "", stderr: "", images: [] };
        cell.output.result = ev.result;
        cell.output.images = ev.images || cell.output.images || [];
        if (onOwner && cell._outputNode) renderResultInto(cell._outputNode, ev.result, ev.images || []);
        break;
      case "truncated":
        appendChunkToCell(cell, "nb-stderr",
          "[older output truncated — " + (ev.dropped || 0) + " events]\n");
        break;
      case "complete":
        // handled by attachEventStream after this dispatch
        break;
    }
  }

  function appendChunkToCell(cell, klass, text) {
    if (!text) return;
    // Maintain an aggregate string on the cell so reconnect renders match.
    cell.output = cell.output || { stdout: "", stderr: "", images: [], result: { type: "none", value: null } };
    if (klass === "nb-stdout") cell.output.stdout = (cell.output.stdout || "") + text;
    else if (klass === "nb-stderr") cell.output.stderr = (cell.output.stderr || "") + text;
    if (NB.current && cell._outputNode) {
      const node = cell._outputNode;
      if (!node) return;
      let pre = node.querySelector("pre." + klass);
      if (!pre) {
        pre = document.createElement("pre");
        pre.className = klass;
        node.appendChild(pre);
      }
      pre.appendChild(document.createTextNode(text));
    }
  }

  function updateInlineSparkBar(cell, ev) {
    if (!cell._outputNode) return;
    let bar = cell._outputNode.querySelector(".nb-spark-bar");
    if (!bar) {
      bar = document.createElement("div");
      bar.className = "nb-spark-bar";
      bar.innerHTML = '<span class="nb-spark-bar-label"></span>';
      cell._outputNode.insertBefore(bar, cell._outputNode.firstChild);
    }
    const label = bar.querySelector(".nb-spark-bar-label");
    if (label) label.textContent =
      "Spark: " + (ev.active_jobs || 0) + " job" + ((ev.active_jobs === 1) ? "" : "s") +
      " · " + (ev.tasks || "—") + " tasks";
  }

  function renderResultInto(node, result, images) {
    if (!node) return;
    // Reuse existing renderOutput for one-shot result+images render.
    const data = { stdout: "", stderr: "", result: result || { type: "none" }, images: images || [] };
    // Append the result block AFTER any streamed text rather than wiping the node.
    const tmp = document.createElement("div");
    if (typeof renderOutput === "function") renderOutput(tmp, data);
    // Move children of tmp into node.
    while (tmp.firstChild) node.appendChild(tmp.firstChild);
  }

  function finalizeCell(cell, owningNotebook, completeEv, opts) {
    cell.output = cell.output || { stdout: "", stderr: "", images: [], result: { type: "none", value: null } };
    cell.output.status = completeEv.status;
    cell.output.duration_ms = completeEv.duration_ms;
    cell.status = (completeEv.status === "success") ? "success" : "error";
    owningNotebook.dirty = true;
    unregisterRunningJob(cell.job_id);
    if (NB.current && NB.current.notebook_id === owningNotebook.notebook_id) {
      setCellStatus(cell, cell.status);
      setKernelStatus(cell.status === "error" ? "Error" : "Idle",
                      cell.status === "error" ? "nb-error" : null);
      if (opts && opts.advance && cell.status !== "error") {
        const idx = owningNotebook.cells.findIndex(function (c) { return c.id === cell.id; });
        if (idx === owningNotebook.cells.length - 1) addCell(owningNotebook.cells.length, "code");
        focusCell(idx + 1);
      }
      markDirty();
    } else {
      // Persist the result for later viewing.
      if (typeof saveNotebookSnapshot === "function") saveNotebookSnapshot(owningNotebook);
      if (cell.status === "error" && typeof showToast === "function") {
        showToast("Error in '" + (owningNotebook.name || "Untitled") + "': see notebook",
                  "error", function () { openNotebook(owningNotebook.notebook_id); });
      }
    }
  }

  function runAll() {
    if (!NB.current) return;
    const cells = NB.current.cells.slice();
    let idx = 0;
    function next() {
      if (idx >= cells.length) {
        setKernelStatus("Run All complete");
        return;
      }
      const cell = cells[idx++];
      if ((cell.type || "code") === "markdown") return next();
      return runCell(cell.id).then(function (data) {
        if (data && data.status === "error") {
          setKernelStatus("Run All stopped on error", "nb-error");
          return;
        }
        next();
      });
    }
    next();
  }

  function liveOutputNodeForCell(cellId) {
    if (cellId == null) return null;
    const wrapper = document.querySelector('.nb-cell[data-cell-id="' + CSS.escape(String(cellId)) + '"]');
    if (!wrapper) return null;
    return wrapper.querySelector(".nb-cell-output");
  }

  function renderOutputForCell(cell, data) {
    if (!cell || !data) return;
    let node = cell._outputNode;
    // If the captured node is no longer attached (e.g. a re-render happened
    // between starting the cell and the response coming back), look up the
    // current node by data-cell-id so the output isn't silently lost.
    if (!node || !node.isConnected) {
      const live = liveOutputNodeForCell(cell.id);
      if (live) {
        node = live;
        cell._outputNode = live;
      }
    }
    if (!node) {
      // Truly no DOM to write to — log so the failure is visible in DevTools.
      if (data.status === "error") console.warn("[notebook] cell errored but no output node:", data.stderr || data);
      return;
    }
    renderOutput(node, data);
    if (data.status === "error") {
      console.warn("[notebook] cell error:\n" + (data.stderr || "(no stderr)"));
    }
  }

  function renderOutput(node, data) {
    node.innerHTML = "";
    if (!data) return;
    if (data.stderr) {
      node.appendChild(el("pre", { class: "nb-stderr", text: data.stderr }, []));
    }
    if (data.stdout) {
      node.appendChild(el("pre", { class: "nb-stdout", text: data.stdout }, []));
    }
    const result = data.result || { type: "none" };
    if (result.type === "text" && result.value != null) {
      node.appendChild(el("pre", { class: "nb-result", text: result.value }, []));
    } else if (result.type === "dataframe" && result.value) {
      node.appendChild(renderDataFrame(result.value, true));
    }
    (data.images || []).forEach(function (b64) {
      node.appendChild(el("img", {
        class: "nb-image",
        src: "data:image/png;base64," + b64,
        alt: "figure",
      }, []));
    });
    const empty = !data.stderr && !data.stdout
      && (result.type === "none" || result.value == null)
      && (!data.images || !data.images.length);
    if (empty && data.status === "success") {
      node.appendChild(el("div", { class: "nb-no-output", text: "(no output)" }, []));
    }
    if (data.duration_ms != null) {
      node.appendChild(el("div", {
        class: "nb-duration",
        text: data.duration_ms < 1000
          ? data.duration_ms + " ms"
          : (data.duration_ms / 1000).toFixed(2) + " s",
      }, []));
    }
  }

  // ---- modern dataframe table + chart builder -----------------------------

  function renderDataFrame(v, allowDownload) {
    const columns = (v.columns || []).map(String);
    const rows = (v.rows || []).map(function (r) { return r.slice(); });
    const total = v.total_rows;
    const truncated = !!v.truncated;
    const chartable = !!v.chartable;

    const card = el("div", { class: "nb-df-card" }, []);

    // Tabs (Table | Chart) — chart only available for sparksql results.
    let tablePanel = null, chartPanel = null;
    if (chartable) {
      const tabs = el("div", { class: "nb-df-tabs" }, []);
      const tabTable = el("button", { class: "nb-df-tab nb-df-tab-active", type: "button", text: "Table" }, []);
      const tabChart = el("button", { class: "nb-df-tab", type: "button", text: "Chart" }, []);
      tabTable.addEventListener("click", function () {
        tabTable.classList.add("nb-df-tab-active");
        tabChart.classList.remove("nb-df-tab-active");
        tablePanel.hidden = false;
        chartPanel.hidden = true;
      });
      tabChart.addEventListener("click", function () {
        tabChart.classList.add("nb-df-tab-active");
        tabTable.classList.remove("nb-df-tab-active");
        tablePanel.hidden = true;
        chartPanel.hidden = false;
        ensureChartRendered();
      });
      tabs.appendChild(tabTable);
      tabs.appendChild(tabChart);
      card.appendChild(tabs);
    }

    tablePanel = renderDataFrameTable(columns, rows, total, truncated, allowDownload);
    card.appendChild(tablePanel);

    let chartReady = false;
    if (chartable) {
      chartPanel = renderChartBuilder(columns, rows);
      chartPanel.hidden = true;
      card.appendChild(chartPanel);
    }

    function ensureChartRendered() {
      if (chartReady || !chartPanel) return;
      chartReady = true;
      if (chartPanel._draw) chartPanel._draw();
    }

    return card;
  }

  function renderDataFrameTable(columns, rows, total, truncated, allowDownload) {
    const state = { sortCol: -1, sortDir: 1, filter: "" };
    const panel = el("div", { class: "nb-df-table-panel" }, []);

    const toolbar = el("div", { class: "nb-df-toolbar" }, []);
    const filterInput = el("input", {
      class: "nb-df-filter",
      type: "search",
      placeholder: "Filter rows…",
      oninput: function (ev) {
        state.filter = ev.target.value.toLowerCase();
        repaint();
      },
    }, []);
    const countLabel = el("span", { class: "nb-df-count" }, []);
    toolbar.appendChild(filterInput);
    toolbar.appendChild(countLabel);
    if (allowDownload && truncated) {
      toolbar.appendChild(el("button", {
        class: "nb-df-download",
        type: "button",
        title: "Download all " + total + " rows as CSV",
        text: "Download CSV (" + total + " rows)",
        onclick: function () {
          if (!NB.current) return;
          window.location.href = "/etl/notebook/dataframe/csv?notebook_id="
            + encodeURIComponent(NB.current.notebook_id)
            + "&var=_nb_last_df";
        },
      }, []));
    }
    panel.appendChild(toolbar);

    const scroll = el("div", { class: "nb-df-scroll" }, []);
    const table = el("table", { class: "nb-df" }, []);
    const thead = el("thead", {}, []);
    const headRow = el("tr", {}, []);
    columns.forEach(function (c, i) {
      const th = el("th", {
        text: c,
        title: "Click to sort",
        onclick: function () {
          if (state.sortCol === i) state.sortDir = -state.sortDir;
          else { state.sortCol = i; state.sortDir = 1; }
          repaint();
        },
      }, []);
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    const tbody = el("tbody", {}, []);
    table.appendChild(thead);
    table.appendChild(tbody);
    scroll.appendChild(table);
    panel.appendChild(scroll);

    function compareCells(a, b) {
      if (a == null && b == null) return 0;
      if (a == null) return -1;
      if (b == null) return 1;
      const na = Number(a), nb = Number(b);
      if (!isNaN(na) && !isNaN(nb) && a !== "" && b !== "") return na - nb;
      return String(a).localeCompare(String(b));
    }

    function repaint() {
      Array.prototype.forEach.call(thead.querySelectorAll("th"), function (th, i) {
        th.classList.remove("nb-sort-asc", "nb-sort-desc");
        if (i === state.sortCol) th.classList.add(state.sortDir > 0 ? "nb-sort-asc" : "nb-sort-desc");
      });

      let filtered = rows;
      if (state.filter) {
        const f = state.filter;
        filtered = rows.filter(function (r) {
          return r.some(function (v) { return v != null && String(v).toLowerCase().indexOf(f) >= 0; });
        });
      }
      if (state.sortCol >= 0) {
        const dir = state.sortDir, col = state.sortCol;
        filtered = filtered.slice().sort(function (a, b) { return dir * compareCells(a[col], b[col]); });
      }

      tbody.innerHTML = "";
      filtered.forEach(function (r) {
        tbody.appendChild(el("tr", {}, r.map(function (v) {
          return el("td", { text: v == null ? "" : String(v) }, []);
        })));
      });

      const shown = filtered.length;
      countLabel.textContent = truncated
        ? "Showing " + shown + " of " + rows.length + " loaded (" + total + " total)"
        : shown + " of " + total + (total === 1 ? " row" : " rows");
    }

    repaint();
    return panel;
  }

  // ---------- Chart builder ----------

  const CHART_TYPES = [
    { value: "bar",     label: "Bar" },
    { value: "line",    label: "Line" },
    { value: "area",    label: "Area" },
    { value: "pie",     label: "Pie" },
    { value: "doughnut",label: "Doughnut" },
    { value: "scatter", label: "Scatter" },
  ];
  const AGGREGATIONS = [
    { value: "none",  label: "None (raw rows)" },
    { value: "sum",   label: "Sum by X" },
    { value: "avg",   label: "Average by X" },
    { value: "count", label: "Count by X" },
    { value: "min",   label: "Min by X" },
    { value: "max",   label: "Max by X" },
  ];

  // Pleasant qualitative palette (Tableau-ish) for slices/series.
  const CHART_COLORS = [
    "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6",
    "#06b6d4", "#ec4899", "#84cc16", "#f97316", "#6366f1",
    "#14b8a6", "#eab308",
  ];

  function detectNumericColumns(columns, rows) {
    return columns.map(function (_, i) {
      let numericCount = 0, total = 0;
      for (let r = 0; r < Math.min(rows.length, 100); r++) {
        const v = rows[r][i];
        if (v == null || v === "") continue;
        total++;
        if (!isNaN(Number(v))) numericCount++;
      }
      return total > 0 && (numericCount / total) > 0.7;
    });
  }

  function renderChartBuilder(columns, rows) {
    const panel = el("div", { class: "nb-chart-panel" }, []);
    const numericMask = detectNumericColumns(columns, rows);

    // Default selections.
    const defaultX = 0;
    let defaultY = numericMask.findIndex(Boolean);
    if (defaultY < 0) defaultY = columns.length > 1 ? 1 : 0;

    const state = {
      type: "bar",
      xCol: defaultX,
      yCol: defaultY,
      agg: "none",
    };

    const controls = el("div", { class: "nb-chart-controls" }, []);

    function field(labelText, sel) {
      const wrap = el("label", { class: "nb-chart-field" }, [
        el("span", { class: "nb-chart-field-label", text: labelText }, []),
        sel,
      ]);
      return wrap;
    }

    function makeSelect(options, selected, onchange) {
      const sel = el("select", { class: "nb-chart-select", onchange: function (ev) { onchange(ev.target.value); } }, []);
      options.forEach(function (opt) {
        const o = document.createElement("option");
        if (typeof opt === "string") {
          o.value = opt; o.textContent = opt;
        } else {
          o.value = opt.value; o.textContent = opt.label;
        }
        if (String(opt.value !== undefined ? opt.value : opt) === String(selected)) o.selected = true;
        sel.appendChild(o);
      });
      return sel;
    }

    const colOptions = columns.map(function (c, i) { return { value: String(i), label: c }; });

    const typeSel = makeSelect(CHART_TYPES, state.type, function (v) { state.type = v; redraw(); });
    const xSel    = makeSelect(colOptions, String(state.xCol), function (v) { state.xCol = parseInt(v, 10); redraw(); });
    const ySel    = makeSelect(colOptions, String(state.yCol), function (v) { state.yCol = parseInt(v, 10); redraw(); });
    const aggSel  = makeSelect(AGGREGATIONS, state.agg, function (v) { state.agg = v; redraw(); });

    controls.appendChild(field("Type", typeSel));
    controls.appendChild(field("X / label", xSel));
    controls.appendChild(field("Y / value", ySel));
    controls.appendChild(field("Aggregate", aggSel));

    const refreshBtn = el("button", {
      class: "nb-chart-refresh", type: "button", text: "Refresh", onclick: redraw,
    }, []);
    controls.appendChild(refreshBtn);

    panel.appendChild(controls);

    const canvasWrap = el("div", { class: "nb-chart-canvas-wrap" }, []);
    const canvas = el("canvas", { class: "nb-chart-canvas" }, []);
    canvasWrap.appendChild(canvas);
    panel.appendChild(canvasWrap);

    const message = el("div", { class: "nb-chart-message" }, []);
    panel.appendChild(message);

    function buildSeries() {
      const xi = state.xCol, yi = state.yCol;
      const labels = [];
      const values = [];
      if (state.agg === "none") {
        rows.forEach(function (r) {
          labels.push(String(r[xi] == null ? "" : r[xi]));
          const num = Number(r[yi]);
          values.push(isNaN(num) ? 0 : num);
        });
      } else {
        const groups = new Map();
        rows.forEach(function (r) {
          const key = String(r[xi] == null ? "" : r[xi]);
          if (!groups.has(key)) groups.set(key, { sum: 0, count: 0, min: Infinity, max: -Infinity });
          const g = groups.get(key);
          if (state.agg === "count") {
            g.count += 1;
          } else {
            const num = Number(r[yi]);
            if (!isNaN(num)) {
              g.sum += num;
              g.count += 1;
              if (num < g.min) g.min = num;
              if (num > g.max) g.max = num;
            }
          }
        });
        groups.forEach(function (g, key) {
          labels.push(key);
          let v;
          if (state.agg === "sum")        v = g.sum;
          else if (state.agg === "avg")   v = g.count ? g.sum / g.count : 0;
          else if (state.agg === "count") v = g.count;
          else if (state.agg === "min")   v = isFinite(g.min) ? g.min : 0;
          else if (state.agg === "max")   v = isFinite(g.max) ? g.max : 0;
          else                            v = g.sum;
          values.push(v);
        });
      }
      return { labels: labels, values: values };
    }

    function redraw() {
      message.textContent = "";
      if (typeof Chart === "undefined") {
        message.textContent = "Chart.js not loaded.";
        return;
      }
      if (rows.length === 0) {
        message.textContent = "No rows to chart.";
        if (canvas._chart) { canvas._chart.destroy(); canvas._chart = null; }
        return;
      }
      const series = buildSeries();
      if (!series.labels.length) {
        message.textContent = "No data points after grouping.";
        return;
      }

      let chartType = state.type;
      let dataset = { label: columns[state.yCol] || "value", data: series.values };

      if (chartType === "scatter") {
        const xi = state.xCol, yi = state.yCol;
        const points = rows.map(function (r) {
          return { x: Number(r[xi]), y: Number(r[yi]) };
        }).filter(function (p) { return !isNaN(p.x) && !isNaN(p.y); });
        if (!points.length) {
          message.textContent = "Scatter requires both columns to be numeric.";
          if (canvas._chart) { canvas._chart.destroy(); canvas._chart = null; }
          return;
        }
        dataset = {
          label: columns[state.yCol] + " vs " + columns[state.xCol],
          data: points,
          backgroundColor: CHART_COLORS[0],
        };
      } else if (chartType === "area") {
        chartType = "line";
        dataset.fill = true;
        dataset.tension = 0.25;
        dataset.borderColor = CHART_COLORS[0];
        dataset.backgroundColor = CHART_COLORS[0] + "40";
      } else if (chartType === "line") {
        dataset.tension = 0.25;
        dataset.borderColor = CHART_COLORS[0];
        dataset.backgroundColor = CHART_COLORS[0] + "30";
        dataset.pointRadius = 2;
      } else if (chartType === "pie" || chartType === "doughnut") {
        dataset.backgroundColor = series.labels.map(function (_, i) {
          return CHART_COLORS[i % CHART_COLORS.length];
        });
        dataset.borderColor = "#fff";
        dataset.borderWidth = 2;
      } else if (chartType === "bar") {
        dataset.backgroundColor = CHART_COLORS[0];
        dataset.borderRadius = 4;
      }

      const data = chartType === "scatter"
        ? { datasets: [dataset] }
        : { labels: series.labels, datasets: [dataset] };

      if (canvas._chart) { canvas._chart.destroy(); canvas._chart = null; }
      canvas._chart = new Chart(canvas, {
        type: chartType,
        data: data,
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: (chartType === "pie" || chartType === "doughnut") ? "right" : "top",
              labels: { font: { family: "Space Grotesk, system-ui, sans-serif", size: 12 } },
            },
            tooltip: {
              backgroundColor: "rgba(15, 23, 42, 0.95)",
              titleFont: { family: "Space Grotesk, system-ui, sans-serif" },
              bodyFont:  { family: "Space Grotesk, system-ui, sans-serif" },
              padding: 10,
              cornerRadius: 8,
            },
          },
          scales: (chartType === "pie" || chartType === "doughnut") ? {} : {
            x: { ticks: { font: { family: "Space Grotesk, system-ui, sans-serif", size: 11 } } },
            y: { ticks: { font: { family: "Space Grotesk, system-ui, sans-serif", size: 11 } }, beginAtZero: true },
          },
        },
      });
    }

    panel._draw = redraw;
    return panel;
  }

  // ---- variables panel -----------------------------------------------------

  function toggleVarsPanel() {
    NB.varsVisible = !NB.varsVisible;
    const panel = document.getElementById("nb_vars_panel");
    if (!panel) return;
    panel.hidden = !NB.varsVisible;
    const toggle = document.getElementById("nb_toggle_vars");
    if (toggle) {
      toggle.classList.toggle("is-active", !!NB.varsVisible);
      toggle.setAttribute("aria-pressed", NB.varsVisible ? "true" : "false");
    }
    if (NB.varsVisible) refreshVars();
  }

  function refreshVars() {
    if (!NB.current) return;
    fetch("/etl/notebook/variables?notebook_id=" + encodeURIComponent(NB.current.notebook_id))
      .then(function (r) { return r.json(); })
      .then(function (data) { renderVars(data.variables || []); })
      .catch(function () { /* ignore */ });
  }

  function renderVars(items) {
    const root = document.getElementById("nb_vars_list");
    if (!root) return;
    root.innerHTML = "";
    if (!items.length) {
      root.appendChild(el("div", { class: "nb-vars-empty", text: "No variables yet. Run a cell." }, []));
      return;
    }
    items.forEach(function (item) {
      const row = el("div", { class: "nb-vars-row" }, [
        el("span", { class: "nb-vars-name", text: item.name }, []),
        el("span", { class: "nb-vars-type", text: item.type }, []),
        el("span", { class: "nb-vars-repr", text: item.repr, title: item.repr }, []),
      ]);
      root.appendChild(row);
    });
  }

  // ---- restart / kill ------------------------------------------------------

  function restartKernel() {
    if (!NB.current) return;
    fetch("/etl/notebook/restart", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notebook_id: NB.current.notebook_id }),
    }).then(function () {
      setKernelStatus("Restarted");
      // Wipe exec counter so badges go back to [ ].
      NB.current.exec_counter = 0;
      NB.current.cells.forEach(function (c) {
        c.exec_count = null;
        setExecBadge(c);
      });
      if (NB.varsVisible) refreshVars();
    });
  }

  function killCell() {
    if (!NB.current) return;
    fetch("/etl/notebook/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notebook_id: NB.current.notebook_id }),
    }).then(function () { setKernelStatus("Cancelled"); });
  }

  // ---- selection + command-mode keyboard ----------------------------------

  function selectCell(cellId) {
    if (NB.selectedCellId === cellId) return;
    NB.selectedCellId = cellId;
    NB.current.cells.forEach(function (c) {
      if (c._wrapper) c._wrapper.classList.toggle("nb-selected", c.id === cellId);
    });
  }

  function isEditingText() {
    const ae = document.activeElement;
    if (!ae || ae === document.body) return false;
    const tag = ae.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
    if (ae.isContentEditable) return true;
    if (ae.closest && ae.closest(".CodeMirror")) return true;
    return false;
  }

  function addAtRelative(position) {
    if (!NB.current) return;
    let idx;
    if (NB.selectedCellId) {
      const i = NB.current.cells.findIndex(function (c) { return c.id === NB.selectedCellId; });
      idx = i < 0 ? NB.current.cells.length : (position === "above" ? i : i + 1);
    } else {
      idx = NB.current.cells.length;
    }
    const newCell = makeBlankCell("code");
    NB.current.cells.splice(idx, 0, newCell);
    markDirty();
    renderCells();
    NB.selectedCellId = newCell.id;
    setTimeout(function () {
      const created = NB.current.cells.find(function (c) { return c.id === newCell.id; });
      if (created && created._wrapper) created._wrapper.classList.add("nb-selected");
      if (created && created._cm) created._cm.focus();
    }, 0);
  }

  // ---- boot ----------------------------------------------------------------

  function bind(id, evt, fn) {
    const node = document.getElementById(id);
    if (node) node.addEventListener(evt, fn);
  }

  function boot() {
    if (NB.booted) return;
    NB.booted = true;

    bind("newNotebookButton", "click", newNotebook);

    const nameInput = document.getElementById("nb_name");
    if (nameInput) {
      nameInput.addEventListener("input", function (ev) {
        if (NB.current) {
          NB.current.name = ev.target.value;
          markDirty();
        }
      });
    }

    bind("nb_save", "click", function () { saveCurrent().then(function () { setKernelStatus("Saved"); }); });
    bind("nb_run_all", "click", runAll);
    bind("nb_restart", "click", restartKernel);
    bind("nb_kill", "click", killCell);
    bind("nb_export", "click", exportIpynb);
    bind("nb_toggle_vars", "click", toggleVarsPanel);
    bind("nb_vars_refresh", "click", refreshVars);

    document.addEventListener("keydown", function (ev) {
      if (!document.body.classList.contains("notebook-mode")) return;
      if (!NB.current) return;

      // Ctrl/Cmd+S works in any mode.
      if ((ev.ctrlKey || ev.metaKey) && (ev.key === "s" || ev.key === "S")) {
        ev.preventDefault();
        saveCurrent().then(function () { setKernelStatus("Saved"); });
        return;
      }

      // Command-mode shortcuts (only when not focused inside a cell editor or input).
      if (isEditingText()) return;
      if (ev.ctrlKey || ev.metaKey || ev.altKey) return;

      if (ev.key === "a" || ev.key === "A") {
        ev.preventDefault();
        addAtRelative("above");
      } else if (ev.key === "b" || ev.key === "B") {
        ev.preventDefault();
        addAtRelative("below");
      }
    });

    refreshList();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  window.NB = {
    newNotebook: newNotebook,
    openNotebook: openNotebook,
    saveCurrent: saveCurrent,
    deleteNotebook: deleteNotebook,
    showNotebookView: showNotebookView,
    hideNotebookView: hideNotebookView,
    runCell: runCell,
    runAll: runAll,
    addCell: addCell,
    restartKernel: restartKernel,
    killCell: killCell,
    exportIpynb: exportIpynb,
    toggleVarsPanel: toggleVarsPanel,
    refreshVars: refreshVars,
    _internal: { NB: NB },
  };
})();
