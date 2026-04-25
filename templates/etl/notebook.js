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

  const AUTOSAVE_DEBOUNCE_MS = 5000;
  const SPARK_POLL_INTERVAL_MS = 600;

  function uid(prefix) {
    return prefix + "_" + Math.random().toString(36).slice(2, 10);
  }

  // Fetch wrapper that redirects to /etl/login on 401 (session expired/missing).
  function authedFetch(url, opts) {
    const merged = Object.assign({ credentials: "same-origin" }, opts || {});
    return fetch(url, merged).then(function (r) {
      if (r.status === 401) {
        window.location.replace("/etl/login");
        // Surface a never-resolving promise so subsequent .then handlers don't run.
        return new Promise(function () {});
      }
      return r;
    });
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
    node.textContent = text;
    node.className = "nb-kernel-status" + (klass ? " " + klass : "");
  }

  function setDirtyBadge(dirty) {
    const node = document.getElementById("nb_save");
    if (!node) return;
    if (dirty) {
      node.classList.add("nb-save-dirty");
      node.textContent = "Save *";
    } else {
      node.classList.remove("nb-save-dirty");
      node.textContent = "Save";
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
    return authedFetch("/etl/notebook/list")
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
    return authedFetch("/etl/notebook/load?notebook_id=" + encodeURIComponent(notebook_id))
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
      });
  }

  function saveCurrent() {
    if (!NB.current) return Promise.resolve();
    const payload = {
      notebook_id: NB.current.notebook_id,
      name: NB.current.name || "Untitled notebook",
      cells: NB.current.cells.map(function (c) {
        return {
          id: c.id,
          type: c.type || "code",
          source: c.source,
          output: c.output,
          status: c.status,
          exec_count: c.exec_count,
        };
      }),
    };
    return authedFetch("/etl/notebook/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
      .then(function (r) { return r.json(); })
      .then(function () {
        NB.current.dirty = false;
        setDirtyBadge(false);
        return refreshList();
      });
  }

  function deleteNotebook(notebook_id) {
    if (!confirm("Delete this notebook?")) return;
    authedFetch("/etl/notebook/delete", {
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
      const cm = CodeMirror.fromTextArea(textarea, {
        mode: { name: "python", version: 3 },
        theme: "eclipse",
        lineNumbers: true,
        indentUnit: 4,
        viewportMargin: Infinity,
        extraKeys: {
          "Shift-Enter": function () { runCell(cell.id, { advance: true }); },
          "Ctrl-Enter":  function () { runCell(cell.id, { advance: false }); },
          "Esc":         function (cmInstance) { cmInstance.getInputField().blur(); },
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
      authedFetch("/etl/notebook/spark/status")
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (!NB.sparkStatusNode) return;
          renderSparkWidget(NB.sparkStatusNode, data);
        })
        .catch(function () { /* ignore transient errors */ });
    }
    poll();
    NB.sparkPollTimer = setInterval(poll, SPARK_POLL_INTERVAL_MS);
  }

  function stopSparkPolling() {
    if (NB.sparkPollTimer) {
      clearInterval(NB.sparkPollTimer);
      NB.sparkPollTimer = null;
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

  function runCell(cellId, opts) {
    const cell = NB.current.cells.find(function (c) { return c.id === cellId; });
    if (!cell) return Promise.resolve({ status: "skipped" });
    if ((cell.type || "code") === "markdown") {
      // For markdown cells, "run" just exits edit mode.
      if (cell._wrapper) cell._wrapper.classList.remove("nb-md-editing");
      return Promise.resolve({ status: "success" });
    }
    const code = (cell._cm ? cell._cm.getValue() : cell.source) || "";
    if (!code.trim()) return Promise.resolve({ status: "skipped" });
    cell.source = code;

    setCellStatus(cell, "running");
    setKernelStatus("Running…", "nb-busy");
    NB.runningCellId = cellId;
    startSparkPolling(cell);

    const ctrl = new AbortController();
    NB.inFlight = ctrl;

    return authedFetch("/etl/notebook/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        notebook_id: NB.current.notebook_id,
        cell_id: cellId,
        code: code,
      }),
      signal: ctrl.signal,
    })
      .then(function (r) {
        if (r.status === 409) {
          return { status: "error", stderr: "Kernel busy", stdout: "", result: { type: "none", value: null }, images: [] };
        }
        return r.json();
      })
      .then(function (data) {
        stopSparkPolling();
        NB.current.exec_counter = (NB.current.exec_counter || 0) + 1;
        cell.exec_count = NB.current.exec_counter;
        setExecBadge(cell);
        cell.output = data;
        setCellStatus(cell, data.status === "success" ? "success" : "error");
        if (cell._outputNode) renderOutput(cell._outputNode, data);
        setKernelStatus("Idle");
        NB.inFlight = null;
        NB.runningCellId = null;
        if (opts && opts.advance) {
          const idx = NB.current.cells.findIndex(function (c) { return c.id === cellId; });
          if (idx === NB.current.cells.length - 1) addCell(NB.current.cells.length, "code");
          focusCell(idx + 1);
        }
        markDirty();
        if (NB.varsVisible) refreshVars();
        return data;
      })
      .catch(function (err) {
        stopSparkPolling();
        if (err.name === "AbortError") {
          setCellStatus(cell, "error");
          setKernelStatus("Cancelled");
        } else {
          setCellStatus(cell, "error");
          setKernelStatus("Error", "nb-error");
        }
        NB.inFlight = null;
        NB.runningCellId = null;
        return { status: "error" };
      });
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
    if (NB.varsVisible) refreshVars();
  }

  function refreshVars() {
    if (!NB.current) return;
    authedFetch("/etl/notebook/variables?notebook_id=" + encodeURIComponent(NB.current.notebook_id))
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
    authedFetch("/etl/notebook/restart", {
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
    authedFetch("/etl/notebook/cancel", {
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
