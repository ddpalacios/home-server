/* Notebook tab — single NB namespace, no globals beyond `window.NB`. */

(function () {
  "use strict";

  const NB = {
    initialized: false,
    current: null,
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

  function makeBlankCell() {
    return { id: uid("c"), source: "", output: null, status: "idle" };
  }

  function newEmptyNotebook() {
    return {
      notebook_id: uid("nb"),
      name: "Untitled notebook",
      cells: [makeBlankCell()],
      dirty: true,
    };
  }

  // ---- list panel ----------------------------------------------------------

  function refreshList() {
    return fetch("/etl/notebook/list")
      .then(function (r) { return r.json(); })
      .then(function (data) {
        NB.list = (data && data.notebooks) || [];
        renderList();
      })
      .catch(function () { /* ignore */ });
  }

  function renderList() {
    const root = document.getElementById("nb_list");
    if (!root) return;
    root.innerHTML = "";
    NB.list.forEach(function (item) {
      const isCurrent = NB.current && NB.current.notebook_id === item.notebook_id;
      const row = el("div", {
        class: "nb-list-item" + (isCurrent ? " nb-selected" : ""),
        onclick: function () { loadNotebook(item.notebook_id); },
      }, [
        el("span", { text: item.name || item.notebook_id }),
        el("button", {
          class: "nb-list-delete",
          title: "Delete",
          onclick: function (ev) { ev.stopPropagation(); deleteNotebook(item.notebook_id); },
        }, ["×"]),
      ]);
      root.appendChild(row);
    });
  }

  // ---- save / load ---------------------------------------------------------

  function saveCurrent() {
    if (!NB.current) return Promise.resolve();
    const payload = {
      notebook_id: NB.current.notebook_id,
      name: NB.current.name,
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
        return refreshList();
      });
  }

  function loadNotebook(notebook_id) {
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
        renderCells();
        renderList();
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
        NB.current = newEmptyNotebook();
        document.getElementById("nb_name").value = NB.current.name;
        renderCells();
      }
      return refreshList();
    });
  }

  // ---- cell rendering ------------------------------------------------------

  function renderCells() {
    const root = document.getElementById("nb_cells");
    if (!root) return;
    root.innerHTML = "";
    NB.current.cells.forEach(function (cell, idx) {
      root.appendChild(renderCell(cell, idx));
    });
    const addBtn = el("button", {
      class: "nb-add-cell",
      type: "button",
      onclick: function () { addCell(NB.current.cells.length); },
    }, ["+ Add cell"]);
    root.appendChild(addBtn);

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
          NB.current.dirty = true;
        },
      });
    }
  }

  function renderCell(cell, idx) {
    const wrapper = el("div", {
      class: "nb-cell nb-" + (cell.status || "idle"),
      "data-cell-id": cell.id,
    }, []);

    const handle = el("span", { class: "nb-drag-handle", title: "Drag to reorder" }, ["⋮⋮"]);
    const pill = el("span", { class: "nb-status-pill" }, [
      el("span", { class: "nb-spinner" }, []),
      el("span", { class: "nb-status-label", text: cell.status || "idle" }, []),
    ]);
    const runBtn = el("button", {
      class: "nb-run", type: "button",
      onclick: function () { runCell(cell.id); },
    }, ["▶ Run"]);
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
        NB.current.dirty = true;
      });
      cell._cm = cm;
    }, 0);

    if (cell.output) renderOutput(output, cell.output);
    return wrapper;
  }

  function setCellStatus(cellId, status) {
    const cell = NB.current.cells.find(function (c) { return c.id === cellId; });
    if (!cell) return;
    cell.status = status;
    const node = document.querySelector('[data-cell-id="' + cellId + '"]');
    if (!node) return;
    node.classList.remove("nb-idle", "nb-running", "nb-success", "nb-error");
    node.classList.add("nb-" + status);
    const label = node.querySelector(".nb-status-label");
    if (label) label.textContent = status;
  }

  function addCell(idx) {
    const cell = makeBlankCell();
    NB.current.cells.splice(idx, 0, cell);
    NB.current.dirty = true;
    renderCells();
  }

  function deleteCell(cellId) {
    const i = NB.current.cells.findIndex(function (c) { return c.id === cellId; });
    if (i < 0) return;
    NB.current.cells.splice(i, 1);
    if (NB.current.cells.length === 0) NB.current.cells.push(makeBlankCell());
    NB.current.dirty = true;
    renderCells();
  }

  function focusCell(idx) {
    const target = NB.current.cells[idx];
    if (!target) return;
    setTimeout(function () {
      if (target._cm) target._cm.focus();
    }, 0);
  }

  // ---- run + output --------------------------------------------------------

  function runCell(cellId, opts) {
    const cell = NB.current.cells.find(function (c) { return c.id === cellId; });
    if (!cell) return;
    const code = (cell._cm ? cell._cm.getValue() : cell.source) || "";
    if (!code.trim()) return;
    cell.source = code;

    setCellStatus(cellId, "running");
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
        if (r.status === 409) return { status: "error", stderr: "Kernel busy", stdout: "", result: { type: "none", value: null } };
        return r.json();
      })
      .then(function (data) {
        cell.output = data;
        setCellStatus(cellId, data.status === "success" ? "success" : "error");
        const node = document.querySelector('[data-cell-id="' + cellId + '"] .nb-cell-output');
        if (node) renderOutput(node, data);
        setKernelStatus("Idle");
        NB.inFlight = null;
        NB.runningCellId = null;
        if (opts && opts.advance) {
          const idx = NB.current.cells.findIndex(function (c) { return c.id === cellId; });
          if (idx === NB.current.cells.length - 1) addCell(NB.current.cells.length);
          focusCell(idx + 1);
        }
        NB.current.dirty = true;
      })
      .catch(function (err) {
        if (err.name === "AbortError") {
          setCellStatus(cellId, "error");
          setKernelStatus("Cancelled");
        } else {
          setCellStatus(cellId, "error");
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
      node.appendChild(el("pre", { text: data.stdout }, []));
    }
    const result = data.result || { type: "none" };
    if (result.type === "text" && result.value != null) {
      node.appendChild(el("pre", { text: result.value }, []));
    } else if (result.type === "dataframe" && result.value) {
      node.appendChild(renderDataFrame(result.value));
    }
  }

  function renderDataFrame(v) {
    const wrap = el("div", { class: "nb-df-wrap" }, []);
    const table = el("table", { class: "nb-df" }, []);
    const thead = el("thead", {}, []);
    const headRow = el("tr", {}, (v.columns || []).map(function (c) {
      return el("th", { text: String(c) }, []);
    }));
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = el("tbody", {}, []);
    (v.rows || []).forEach(function (row) {
      const tr = el("tr", {}, row.map(function (cell) {
        return el("td", { text: cell == null ? "" : String(cell) }, []);
      }));
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrap.appendChild(table);

    const total = v.total_rows;
    const shown = (v.rows || []).length;
    const footer = el("div", { class: "nb-df-footer" }, [
      v.truncated
        ? "Showing " + shown + " of " + total + " rows"
        : (total + " row" + (total === 1 ? "" : "s"))
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

  // ---- init ----------------------------------------------------------------

  function init() {
    if (NB.initialized) return;
    NB.initialized = true;

    NB.current = newEmptyNotebook();
    document.getElementById("nb_name").value = NB.current.name;
    document.getElementById("nb_name").addEventListener("input", function (ev) {
      NB.current.name = ev.target.value;
      NB.current.dirty = true;
    });

    document.getElementById("nb_new").addEventListener("click", function () {
      NB.current = newEmptyNotebook();
      document.getElementById("nb_name").value = NB.current.name;
      renderCells();
      renderList();
    });

    document.getElementById("nb_save").addEventListener("click", function () {
      saveCurrent().then(function () { setKernelStatus("Saved"); });
    });

    document.getElementById("nb_restart").addEventListener("click", restartKernel);
    document.getElementById("nb_kill").addEventListener("click", killCell);

    renderCells();
    refreshList();
  }

  window.NB = {
    init: init,
    runCell: runCell,
    addCell: addCell,
    deleteCell: deleteCell,
    saveCurrent: saveCurrent,
    loadNotebook: loadNotebook,
    restartKernel: restartKernel,
    killCell: killCell,
    _internal: { NB: NB },
  };
})();
