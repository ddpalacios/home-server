// web/src/routes/leads.js
//
// Leads route: "Imported" tab (CSV uploads + import management) and the
// CSV-import wizard. Loaded lazily via window.__dashboardLoadRouteModule.
//
// What lives here:
//   - initLeadsTabs()      — tab switcher between Captured / Imported
//   - loadImports()        — fetches /me/leads/imports and renders the list
//   - removeImport()       — DELETE /me/leads/imports/:id
//   - removeImportedLead() — DELETE /me/leads/:id
//   - viewImportedLeads()  — fetches /me/leads?source=csv_import&import_id=…
//   - initCsvImport()      — multi-step CSV upload wizard
//   - setCsvStep()         — wizard step switcher helper
//
// What stays inline (shared chrome / entangled state):
//   - openLeadDetailModal  — shared with Pipeline and Replies
//   - loadLeads() (old)    — captured-leads tab, uses accountId / leadRecords
//   - Transcript modal     — deep integration with accountId and chart state

// ─── Helpers ────────────────────────────────────────────────────────────────

function escapeHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function _openDlg(dlg) {
  if (dlg.showModal) dlg.showModal(); else dlg.setAttribute("open", "");
}
function _closeDlg(dlg) {
  if (dlg.close) dlg.close(); else dlg.removeAttribute("open");
}

// ─── Tabs ────────────────────────────────────────────────────────────────────

function initLeadsTabs() {
  const tabs = document.querySelectorAll("[data-leads-tab]");
  const panes = document.querySelectorAll("[data-leads-pane]");
  if (!tabs.length) return;
  function activate(name) {
    tabs.forEach(t => t.classList.toggle("is-active", t.dataset.leadsTab === name));
    panes.forEach(p => {
      const isActive = p.dataset.leadsPane === name;
      p.classList.toggle("is-active", isActive);
      p.hidden = !isActive;
    });
    if (name === "imported") loadImports();
  }
  tabs.forEach(t => t.addEventListener("click", () => activate(t.dataset.leadsTab)));
}

// ─── Imports list ────────────────────────────────────────────────────────────

async function loadImports() {
  const list = document.getElementById("leadsImportsList");
  if (!list) return;
  try {
    const res = await fetch("/me/leads/imports", { credentials: "same-origin" });
    if (!res.ok) return;
    const body = await res.json();
    const imports = (body.imports || []).slice().reverse();
    if (!imports.length) {
      list.innerHTML = `<div class="leads-empty"><span class="leads-empty-icon">📥</span><span>No imports yet — upload a CSV to start your first campaign.</span></div>`;
      return;
    }
    // "Start campaign" buttons used to live here but were moved to the
    // Campaigns nav section (the user picks imports inside the wizard
    // now, so the entry point lives there). Imports just show View /
    // Remove here — sending is the Campaigns page's job.
    list.innerHTML = imports.map(imp => `
      <div class="leads-import-row" data-import-id="${imp.id}">
        <div class="li-meta-wrap">
          <div class="li-title">${escapeHtml(imp.import_purpose || imp.filename)}</div>
          <div class="li-meta">${imp.row_count} recipients · uploaded ${new Date(imp.created_at*1000).toLocaleDateString()}</div>
        </div>
        <div class="leads-import-actions">
          <button type="button" data-import-view="${imp.id}">View leads</button>
          <button type="button" data-import-remove="${imp.id}" aria-label="Remove import" title="Remove this import and its leads"></button>
        </div>
      </div>
    `).join("");
    list.querySelectorAll("[data-import-view]").forEach(b =>
      b.addEventListener("click", () => viewImportedLeads(b.dataset.importView)));
    list.querySelectorAll("[data-import-remove]").forEach(b =>
      b.addEventListener("click", () => removeImport(b.dataset.importRemove, imports.find(i => i.id === b.dataset.importRemove))));
  } catch (e) { /* network */ }
}

async function removeImport(importId, imp) {
  if (!importId) return;
  const label = (imp && (imp.import_purpose || imp.filename)) || "this import";
  const count = imp && imp.row_count ? ` and its ${imp.row_count} leads` : " and its leads";
  if (!window.confirm(`Remove "${label}"${count}? This can't be undone.`)) return;
  try {
    const res = await fetch(`/me/leads/imports/${encodeURIComponent(importId)}`, {
      method: "DELETE",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error || "Couldn't remove that import. Try again.");
      return;
    }
    // If the user was viewing this import's leads, bounce back to the list.
    const wrap = document.getElementById("leadsImportedLeadsWrap");
    if (wrap && !wrap.hidden) {
      wrap.hidden = true;
      const importsList = document.getElementById("leadsImportsList");
      if (importsList) importsList.style.display = "";
    }
    await loadImports();
  } catch (e) {
    alert("Network error. Try again.");
  }
}

let _importedLeadsCache = [];

async function removeImportedLead(leadId, rowEl) {
  if (!leadId) return;
  if (!window.confirm("Remove this lead?")) return;
  try {
    const res = await fetch(`/me/leads/${encodeURIComponent(leadId)}`, {
      method: "DELETE",
      credentials: "same-origin",
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error || "Couldn't remove that lead.");
      return;
    }
    if (rowEl && rowEl.parentNode) rowEl.parentNode.removeChild(rowEl);
    _importedLeadsCache = _importedLeadsCache.filter((l) => l.id !== leadId);
    const title = document.getElementById("leadsImportedTitle");
    if (title) title.textContent = `${_importedLeadsCache.length} imported leads`;
  } catch (e) {
    alert("Network error. Try again.");
  }
}

async function viewImportedLeads(importId) {
  try {
    const res = await fetch(`/me/leads?source=csv_import&import_id=${encodeURIComponent(importId)}`, { credentials: "same-origin" });
    if (!res.ok) return;
    const body = await res.json();
    _importedLeadsCache = body.leads || [];
    const wrap = document.getElementById("leadsImportedLeadsWrap");
    const tbody = document.getElementById("leadsImportedTableBody");
    const title = document.getElementById("leadsImportedTitle");
    if (title) title.textContent = `${_importedLeadsCache.length} imported leads`;
    wrap.hidden = false;
    document.getElementById("leadsImportsList").style.display = "none";
    tbody.innerHTML = _importedLeadsCache.map(l => `
      <tr data-lead-row="${l.id}">
        <td><input type="checkbox" data-lead-id="${l.id}" checked></td>
        <td>${escapeHtml((l.first_name || "") + " " + (l.last_name || ""))}</td>
        <td>${escapeHtml(l.email || "")}</td>
        <td>${escapeHtml(l.phone || "")}</td>
        <td>${escapeHtml(l.service_type || "")}</td>
        <td>${l.has_reply ? "Replied" : "—"}</td>
        <td style="text-align:right;"><button type="button" class="leads-row-remove" data-lead-remove="${l.id}" aria-label="Remove lead" title="Remove this lead"></button></td>
      </tr>
    `).join("");
    tbody.querySelectorAll("[data-lead-remove]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        const id = btn.dataset.leadRemove;
        const row = btn.closest("tr");
        removeImportedLead(id, row);
      });
    });
    const checkAll = document.getElementById("leadsImportedCheckAll");
    const sel = document.getElementById("leadsImportedSelected");
    function updateCount() {
      const n = tbody.querySelectorAll("input[type='checkbox']:checked").length;
      sel.textContent = `${n} selected`;
    }
    checkAll.addEventListener("change", () => {
      tbody.querySelectorAll("input[type='checkbox']").forEach(c => c.checked = checkAll.checked);
      updateCount();
    });
    tbody.addEventListener("change", updateCount);
    updateCount();
  } catch (e) {}
}

// ─── Back button (delegated) ──────────────────────────────────────────────────

function _wireImportedBack() {
  document.addEventListener("click", (ev) => {
    if (ev.target && ev.target.id === "leadsImportedBack") {
      document.getElementById("leadsImportedLeadsWrap").hidden = true;
      document.getElementById("leadsImportsList").style.display = "";
    }
  });
}

// ─── CSV import wizard ────────────────────────────────────────────────────────

function setCsvStep(n) {
  document.querySelectorAll("#csvImportDialog .pn-step").forEach(s => {
    s.hidden = String(s.dataset.csvStep) !== String(n);
  });
  document.querySelectorAll("#csvImportDialog .pn-dot").forEach(d => {
    const s = parseInt(d.dataset.csvStep, 10);
    d.classList.toggle("is-active", s === n);
    d.classList.toggle("is-done", s < n);
  });
}

function initCsvImport() {
  const dlg = document.getElementById("csvImportDialog");
  const btn = document.getElementById("leadsImportBtn");
  if (!dlg || !btn) return;
  let parsedRows = [];
  let parsedHeaders = [];
  btn.addEventListener("click", () => { setCsvStep(1); _openDlg(dlg); });
  document.getElementById("csvImportClose").addEventListener("click", () => _closeDlg(dlg));
  document.getElementById("csvCancel").addEventListener("click", () => _closeDlg(dlg));

  const fileInp = document.getElementById("csvFile");
  const next1 = document.getElementById("csvNext1");
  fileInp.addEventListener("change", () => {
    next1.disabled = !fileInp.files || !fileInp.files[0];
  });
  next1.addEventListener("click", () => {
    const f = fileInp.files[0];
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result;
      const lines = text.split(/\r?\n/).filter(l => l.trim());
      if (!lines.length) { alert("Empty file."); return; }
      parsedHeaders = lines[0].split(",").map(s => s.trim().replace(/^"|"$/g, ""));
      parsedRows = lines.slice(1, 4).map(l => l.split(",").map(s => s.trim().replace(/^"|"$/g, "")));
      _csvUserMap = {};  // reset overrides for the new file
      renderMapper();
      setCsvStep(2);
    };
    reader.readAsText(f);
  });

  // Map of normalized header → canonical target. Mirrors the backend's
  // fuzzy-match list so the UI auto-maps the same way the server does.
  const _csvCanonical = ["first_name","last_name","email","phone","company",
                         "appointment_date","appointment_time","service_type"];
  const _csvAliases = {
    "name": "first_name", "fullname": "first_name", "firstname": "first_name", "first": "first_name", "givenname": "first_name",
    "lastname": "last_name", "last": "last_name", "surname": "last_name", "familyname": "last_name",
    "emailaddress": "email", "email": "email", "mail": "email", "e_mail": "email",
    "phonenumber": "phone", "mobile": "phone", "cell": "phone", "tel": "phone", "telephone": "phone", "phone": "phone",
    "businessname": "company", "organization": "company", "org": "company", "company": "company",
    "service": "service_type", "servicetype": "service_type", "service_type": "service_type",
    "date": "appointment_date", "apptdate": "appointment_date", "appointmentdate": "appointment_date", "appointment_date": "appointment_date",
    "time": "appointment_time", "appttime": "appointment_time", "appointmenttime": "appointment_time", "appointment_time": "appointment_time",
    "firstname": "first_name", "lastname": "last_name",
  };
  function _csvSlug(s) {
    // Compact slug — match the backend exactly: strip everything that
    // isn't a letter or digit. So "Email Address", "email_address",
    // "EmailAddress", "e-mail" all collapse to "emailaddress".
    return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  }
  function _csvAutoTarget(header) {
    const slug = _csvSlug(header);
    if (_csvCanonical.includes(slug)) return slug;
    if (_csvAliases[slug]) return _csvAliases[slug];
    return "custom";
  }

  // Per-column user choices. Null = auto, "drop" = explicitly dropped,
  // canonical name or "custom" = explicit override.
  let _csvUserMap = {};

  function renderMapper() {
    const root = document.getElementById("csvMapper");
    if (!parsedHeaders.length) {
      root.innerHTML = '<div class="csv-empty">No columns detected. Make sure the first row of your CSV is the header row.</div>';
      return;
    }
    // Build options once.
    const targetOptions = [
      { v: "first_name",       label: "First name" },
      { v: "last_name",        label: "Last name"  },
      { v: "email",            label: "Email"      },
      { v: "phone",            label: "Phone"      },
      { v: "company",          label: "Company"    },
      { v: "appointment_date", label: "Appointment date" },
      { v: "appointment_time", label: "Appointment time" },
      { v: "custom",           label: "Custom field (passes through)" },
    ];
    const sample = parsedRows[0] || [];
    let emailMapped = false;
    const rowsHtml = parsedHeaders.map((h, idx) => {
      const userChoice = _csvUserMap[h];
      const dropped = userChoice === "drop";
      const target = dropped ? "drop" : (userChoice || _csvAutoTarget(h));
      if (target === "email") emailMapped = true;
      const sampleVal = (sample[idx] || "").trim();
      const opts = targetOptions.map(o => {
        const sel = (o.v === target) ? " selected" : "";
        return `<option value="${escapeHtml(o.v)}"${sel}>${escapeHtml(o.label)}</option>`;
      }).join("");
      return `
        <div class="csv-map-row ${dropped ? "is-dropped" : ""}" data-csv-header="${escapeHtml(h)}">
          <div class="csv-map-meta">
            <div class="csv-map-name">${escapeHtml(h || "(unnamed)")}</div>
            <div class="csv-map-sample">${sampleVal ? "e.g. " + escapeHtml(sampleVal.slice(0, 60)) : "(empty in first row)"}</div>
          </div>
          <select class="csv-map-select" data-csv-header="${escapeHtml(h)}" ${dropped ? "disabled" : ""}>${opts}</select>
          <button type="button" class="csv-map-remove" data-csv-drop="${escapeHtml(h)}" aria-label="${dropped ? "Restore column" : "Drop column"}" title="${dropped ? "Restore" : "Drop this column"}"></button>
        </div>
      `;
    }).join("");
    const warn = emailMapped ? "" : `
      <div class="csv-warn">
        <strong>One column needs to be Email.</strong>
        We couldn't auto-detect an email column. Pick the column that holds email addresses below — without it, no row can be imported.
      </div>`;
    const total = parsedHeaders.length;
    const dropped = parsedHeaders.filter(h => _csvUserMap[h] === "drop").length;
    const counter = `<div class="csv-map-counter">${total - dropped} of ${total} columns will be imported${dropped ? ` · ${dropped} dropped` : ""}</div>`;
    root.innerHTML = warn + counter + `<div class="csv-map-list">${rowsHtml}</div>`;

    root.querySelectorAll(".csv-map-select").forEach(sel => {
      sel.addEventListener("change", () => {
        _csvUserMap[sel.dataset.csvHeader] = sel.value;
        renderMapper();
      });
    });
    root.querySelectorAll("[data-csv-drop]").forEach(btn => {
      btn.addEventListener("click", () => {
        const h = btn.dataset.csvDrop;
        _csvUserMap[h] = (_csvUserMap[h] === "drop") ? null : "drop";
        renderMapper();
      });
    });
  }

  document.getElementById("csvBack2").addEventListener("click", () => setCsvStep(1));
  document.getElementById("csvNext2").addEventListener("click", async () => {
    // Build {csv_header: target} where target is "drop" | "custom" | a canonical name.
    const map = {};
    parsedHeaders.forEach((h) => {
      const choice = _csvUserMap[h];
      map[h] = (choice === "drop") ? "drop"
             : (choice || _csvAutoTarget(h));
    });
    // Hard-stop in the UI if no Email column is mapped — backend will
    // reject anyway, this is a friendlier place to catch it.
    const hasEmail = Object.values(map).includes("email");
    if (!hasEmail) {
      alert("Pick a column for Email. Without it, no rows can be imported.");
      return;
    }
    const fd = new FormData();
    fd.append("file", fileInp.files[0]);
    fd.append("import_purpose", document.getElementById("csvPurpose").value || "");
    fd.append("column_map", JSON.stringify(map));
    fd.append("dedupe_strategy", "skip");
    try {
      const res = await fetch("/me/leads/import", { method: "POST", credentials: "same-origin", body: fd });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const msg = body.message || (
          body.error === "no_email_column" ? "Pick the column that contains email addresses, then upload again." :
          body.error === "no_valid_rows" ? "We read your file but couldn't find any rows with a valid email address." :
          `Import failed: ${body.error || res.status}`
        );
        alert(msg);
        return;
      }
      const body = await res.json();
      document.getElementById("csvSummary").innerHTML = `
        <div style="font-size:18px;font-weight:800;margin-bottom:6px;">${body.row_count} rows processed</div>
        <div style="color:#475569;font-size:13.5px;">${body.inserted} new · ${body.updated} updated · ${body.skipped} skipped</div>`;
      window._lastImportId = body.import_id;
      setCsvStep(3);
      // Invalidate so the leads & campaigns sections re-fetch on next visit.
      if (typeof window.invalidateSection === "function") {
        window.invalidateSection("leads");
        window.invalidateSection("campaigns");
      }
      loadImports();
    } catch (e) { alert("Network error."); }
  });

  document.getElementById("csvDoneAnother").addEventListener("click", () => {
    fileInp.value = ""; next1.disabled = true; setCsvStep(1);
  });
  document.getElementById("csvStartCampaign").addEventListener("click", () => {
    _closeDlg(dlg);
    if (window._lastImportId && typeof window.openCampaignWizard === "function") {
      window.openCampaignWizard({ importId: window._lastImportId });
    }
  });
}

// ─── Module init ─────────────────────────────────────────────────────────────

let _initialized = false;

export function init() {
  if (_initialized) return;
  _initialized = true;
  initLeadsTabs();
  initCsvImport();
  _wireImportedBack();
}

// ─── Expose globals the inline router code expects ────────────────────────────

window.loadLeadsSection = function () {
  // The captured-tab data load is still handled by the inline loadLeads()
  // which uses accountId/leadRecords. Just trigger it via the global.
  if (typeof window._leadsLoad === "function") window._leadsLoad();
};

window.__leadsRoute = {
  loadImports,
  init,
};
