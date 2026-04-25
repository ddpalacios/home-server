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

  // ---- cell rendering placeholder (Task 16 fills this in) ------------------

  function renderCells() {
    const root = document.getElementById("nb_cells");
    if (!root) return;
    root.innerHTML = "";
    const placeholder = el("div", { class: "nb-empty", text: "Cells will render here." }, []);
    root.appendChild(placeholder);
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
    saveCurrent: saveCurrent,
    loadNotebook: loadNotebook,
    restartKernel: restartKernel,
    killCell: killCell,
    _internal: { NB: NB, refreshList: refreshList, makeBlankCell: makeBlankCell, el: el, uid: uid, setKernelStatus: setKernelStatus },
  };
})();
