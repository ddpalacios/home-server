/* Notebook view — sidebar-driven activity that takes over the main canvas. */

(function () {
  "use strict";

  const NB = {
    booted: false,
    current: null,        // { notebook_id, name, cells, dirty }
    list: [],
    inFlight: null,
    runningCellId: null,
  };

  function uid(prefix) {
    return prefix + "_" + Math.random().toString(36).slice(2, 10);
  }

  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === "class") node.className = attrs[k];
        else if (k === "text") node.textContent = attrs[k];
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
  }

  function makeBlankCell() {
    return { id: uid("c"), source: "", output: null, status: "idle" };
  }

  function newEmptyNotebook() {
    return {
      notebook_id: uid("nb"),
      name: "Untitled notebook",
      cells: [makeBlankCell()],
      dirty: false,
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

      const icon = el("span", { class: "activity-icon", "aria-hidden": "true" }, []);
      icon.innerHTML = NOTEBOOK_ICON_SVG;

      const label = el("span", {
        class: "pipeline-list-label",
        text: item.name || item.notebook_id,
      }, []);

      const delBtn = el("button", {
        class: "pipeline-options-trigger",
        type: "button",
        "aria-label": "Delete notebook",
        title: "Delete",
        onclick: function (ev) {
          ev.stopPropagation();
          deleteNotebook(item.notebook_id);
        },
      }, []);
      delBtn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">' +
        '<path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
        '</svg>';

      card.appendChild(icon);
      card.appendChild(label);
      card.appendChild(delBtn);

      const row = el("div", { class: "pipeline-list-row" }, [card]);
      root.appendChild(row);
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
  }

  function openNotebook(notebook_id) {
    return fetch("/etl/notebook/load?notebook_id=" + encodeURIComponent(notebook_id))
      .then(function (r) {
        if (!r.ok) throw new Error("not found");
        return r.json();
      })
      .then(function (doc) {
        NB.current = {
          notebook_id: doc.notebook_id,
          name: doc.name || "",
          cells: (doc.cells && doc.cells.length) ? doc.cells : [makeBlankCell()],
          dirty: false,
        };
        document.getElementById("nb_name").value = NB.current.name;
        showNotebookView();
        renderCells();
        renderSidebarList();
        setDirtyBadge(false);
        setKernelStatus("Idle");
      });
  }

  function saveCurrent() {
    if (!NB.current) return Promise.resolve();
    const payload = {
      notebook_id: NB.current.notebook_id,
      name: NB.current.name || "Untitled notebook",
      cells: NB.current.cells.map(function (c) {
        return { id: c.id, source: c.source, output: c.output, status: c.status };
      }),
    };
    return fetch("/etl/notebook/save", {
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
      onclick: function () { addCell(NB.current.cells.length); },
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
      class: "nb-cell nb-" + (cell.status || "idle"),
      "data-cell-id": cell.id,
    }, []);

    const handle = el("span", { class: "nb-drag-handle", title: "Drag to reorder" }, ["⋮⋮"]);
    const pillLabel = el("span", { class: "nb-status-label", text: cell.status || "idle" }, []);
    const pill = el("span", { class: "nb-status-pill" }, [
      el("span", { class: "nb-spinner" }, []),
      pillLabel,
    ]);
    const runBtn = el("button", {
      class: "nb-run", type: "button",
      onclick: function () { runCell(cell.id); },
      title: "Run cell (Shift+Enter)",
    }, []);
    runBtn.innerHTML = '<svg viewBox="0 0 24 24" width="11" height="11" aria-hidden="true">' +
      '<path d="M7 5l12 7-12 7V5z" fill="currentColor"/></svg>' +
      '<span style="margin-left:6px">Run</span>';
    const delBtn = el("button", {
      type: "button",
      onclick: function () { deleteCell(cell.id); },
    }, ["✕"]);
    const actions = el("div", { class: "nb-cell-actions" }, [runBtn, delBtn]);
    const header = el("div", { class: "nb-cell-header" }, [pill, handle, actions]);

    const editorHost = el("div", { class: "nb-cell-editor" }, []);
    const textarea = el("textarea", {}, []);
    textarea.value = cell.source || "";
    editorHost.appendChild(textarea);

    const output = el("div", { class: "nb-cell-output" }, []);

    wrapper.appendChild(header);
    wrapper.appendChild(editorHost);
    wrapper.appendChild(output);

    // Store live DOM references on the cell so updates don't depend on querySelector.
    cell._wrapper = wrapper;
    cell._outputNode = output;
    cell._statusLabel = pillLabel;

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
        },
      });
      cm.on("change", function () {
        cell.source = cm.getValue();
        markDirty();
      });
      cell._cm = cm;
    }, 0);

    if (cell.output) renderOutput(cell._outputNode, cell.output);
    return wrapper;
  }

  function setCellStatus(cell, status) {
    cell.status = status;
    if (cell._wrapper) {
      cell._wrapper.classList.remove("nb-idle", "nb-running", "nb-success", "nb-error");
      cell._wrapper.classList.add("nb-" + status);
    }
    if (cell._statusLabel) cell._statusLabel.textContent = status;
  }

  function addCell(idx) {
    NB.current.cells.splice(idx, 0, makeBlankCell());
    markDirty();
    renderCells();
  }

  function deleteCell(cellId) {
    const i = NB.current.cells.findIndex(function (c) { return c.id === cellId; });
    if (i < 0) return;
    NB.current.cells.splice(i, 1);
    if (NB.current.cells.length === 0) NB.current.cells.push(makeBlankCell());
    markDirty();
    renderCells();
  }

  function focusCell(idx) {
    const target = NB.current.cells[idx];
    if (!target) return;
    setTimeout(function () { if (target._cm) target._cm.focus(); }, 0);
  }

  // ---- run + output --------------------------------------------------------

  function runCell(cellId, opts) {
    const cell = NB.current.cells.find(function (c) { return c.id === cellId; });
    if (!cell) return;
    const code = (cell._cm ? cell._cm.getValue() : cell.source) || "";
    if (!code.trim()) return;
    cell.source = code;

    setCellStatus(cell, "running");
    setKernelStatus("Running…", "nb-busy");
    NB.runningCellId = cellId;

    const ctrl = new AbortController();
    NB.inFlight = ctrl;

    fetch("/etl/notebook/execute", {
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
          return { status: "error", stderr: "Kernel busy", stdout: "", result: { type: "none", value: null } };
        }
        return r.json();
      })
      .then(function (data) {
        cell.output = data;
        setCellStatus(cell, data.status === "success" ? "success" : "error");
        if (cell._outputNode) renderOutput(cell._outputNode, data);
        setKernelStatus("Idle");
        NB.inFlight = null;
        NB.runningCellId = null;
        if (opts && opts.advance) {
          const idx = NB.current.cells.findIndex(function (c) { return c.id === cellId; });
          if (idx === NB.current.cells.length - 1) addCell(NB.current.cells.length);
          focusCell(idx + 1);
        }
        markDirty();
      })
      .catch(function (err) {
        if (err.name === "AbortError") {
          setCellStatus(cell, "error");
          setKernelStatus("Cancelled");
        } else {
          setCellStatus(cell, "error");
          setKernelStatus("Error", "nb-error");
        }
        NB.inFlight = null;
        NB.runningCellId = null;
      });
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
      node.appendChild(renderDataFrame(result.value));
    }
    // If the cell ran cleanly with no output of any kind, show a subtle "(no output)"
    // marker so the user gets visual confirmation the run completed.
    const empty = !data.stderr && !data.stdout
      && (result.type === "none" || result.value == null);
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

  function renderDataFrame(v) {
    const wrap = el("div", { class: "nb-df-wrap" }, []);
    const table = el("table", { class: "nb-df" }, []);
    const thead = el("thead", {}, [
      el("tr", {}, (v.columns || []).map(function (c) {
        return el("th", { text: String(c) }, []);
      })),
    ]);
    const tbody = el("tbody", {}, []);
    (v.rows || []).forEach(function (row) {
      tbody.appendChild(el("tr", {}, row.map(function (cell) {
        return el("td", { text: cell == null ? "" : String(cell) }, []);
      })));
    });
    table.appendChild(thead);
    table.appendChild(tbody);
    wrap.appendChild(table);

    const total = v.total_rows;
    const shown = (v.rows || []).length;
    const footer = el("div", { class: "nb-df-footer" }, [
      v.truncated
        ? "Showing " + shown + " of " + total + " rows"
        : (total + " row" + (total === 1 ? "" : "s")),
    ]);

    return el("div", {}, [wrap, footer]);
  }

  // ---- restart / kill ------------------------------------------------------

  function restartKernel() {
    if (!NB.current) return;
    fetch("/etl/notebook/restart", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notebook_id: NB.current.notebook_id }),
    }).then(function () { setKernelStatus("Restarted"); });
  }

  function killCell() {
    if (!NB.current) return;
    fetch("/etl/notebook/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notebook_id: NB.current.notebook_id }),
    }).then(function () { setKernelStatus("Cancelled"); });
  }

  // ---- boot ----------------------------------------------------------------

  function boot() {
    if (NB.booted) return;
    NB.booted = true;

    const newBtn = document.getElementById("newNotebookButton");
    if (newBtn) newBtn.addEventListener("click", newNotebook);

    const nameInput = document.getElementById("nb_name");
    if (nameInput) {
      nameInput.addEventListener("input", function (ev) {
        if (NB.current) {
          NB.current.name = ev.target.value;
          markDirty();
        }
      });
    }

    const saveBtn = document.getElementById("nb_save");
    if (saveBtn) saveBtn.addEventListener("click", function () {
      saveCurrent().then(function () { setKernelStatus("Saved"); });
    });

    const restartBtn = document.getElementById("nb_restart");
    if (restartBtn) restartBtn.addEventListener("click", restartKernel);

    const killBtn = document.getElementById("nb_kill");
    if (killBtn) killBtn.addEventListener("click", killCell);

    document.addEventListener("keydown", function (ev) {
      if (!document.body.classList.contains("notebook-mode")) return;
      const isSave = (ev.ctrlKey || ev.metaKey) && (ev.key === "s" || ev.key === "S");
      if (!isSave) return;
      ev.preventDefault();
      saveCurrent().then(function () { setKernelStatus("Saved"); });
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
    addCell: addCell,
    restartKernel: restartKernel,
    killCell: killCell,
    _internal: { NB: NB },
  };
})();
