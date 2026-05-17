/* Form editor — single-popup builder for the dashboard's Forms tab.
 *
 * Public surface (kept stable so existing callsites don't break):
 *   window.openFormBuilder(form)        — open with a pre-loaded form
 *   window.openFormBuilderById(formId)  — fetch by id (or "" for new)
 *   window.openFormWebhookModal(formId) — webhook config (stub here;
 *                                         the previous full impl lived
 *                                         in this same file but the
 *                                         editor was redone)
 *   window.deleteFormViaEditor(formId)  — delete + broadcast
 *
 * Broadcast:
 *   On save / delete, posts a window message
 *   {type: "form-editor-changed"} so the Forms tab re-fetches.
 *
 * This is a complete rewrite — the previous string-template
 * implementation (~960 lines, fb-* CSS conventions) was scrapped at
 * user request. The new editor uses plain DOM construction and
 * self-contained CSS scoped under .mfe-* so nothing here collides
 * with the FlowBuilder styles. */
(function () {
  if (window.__formEditorLoaded) return;
  window.__formEditorLoaded = true;

  // ─── Field type catalog ─────────────────────────────────────────
  var FIELD_TYPES = [
    { id: "text",     label: "Short text",     icon: "📝" },
    { id: "email",    label: "Email",          icon: "📧" },
    { id: "phone",    label: "Phone",          icon: "📞" },
    { id: "address",  label: "Address",        icon: "🏠" },
    { id: "textarea", label: "Long text",      icon: "💬" },
    { id: "select",   label: "Pick from list", icon: "📋" },
    { id: "date",     label: "Date",           icon: "⏰" },
    { id: "number",   label: "Number",         icon: "🔢" },
  ];
  var FIELD_BY_TYPE = FIELD_TYPES.reduce(function (a, f) {
    a[f.id] = f; return a;
  }, {});

  // Quick-add suggestions surfaced in the "+ Add field" menu so the
  // user gets sensible defaults instead of an unlabeled blank field.
  var QUICK_ADD = [
    { key: "name",     label: "Name",                type: "text" },
    { key: "email",    label: "Email",               type: "email" },
    { key: "phone",    label: "Phone",               type: "phone" },
    { key: "message",  label: "What they need",      type: "textarea" },
    { key: "address",  label: "Address",             type: "address" },
    { key: "service",  label: "What service",        type: "select",
      options: ["Service A", "Service B"] },
    { key: "date_needed", label: "When",             type: "date" },
    { key: "company",  label: "Company",             type: "text" },
  ];

  // ─── Self-contained CSS, injected once ──────────────────────────
  function injectCss() {
    if (document.getElementById("mfe-css")) return;
    var s = document.createElement("style");
    s.id = "mfe-css";
    s.textContent = [
      ".mfe-overlay { position:fixed; inset:0; z-index:9998; display:none;",
      "  align-items:center; justify-content:center;",
      "  background:rgba(15,23,42,.45); padding:24px; }",
      ".mfe-overlay.is-open { display:flex; }",
      ".mfe-card { background:#fff; width:min(1100px,100%); max-height:90vh;",
      "  border-radius:14px; box-shadow:0 24px 60px rgba(15,23,42,.20);",
      "  display:flex; flex-direction:column; overflow:hidden;",
      "  font:14px/1.5 'Inter',system-ui,-apple-system,sans-serif; color:#0f172a; }",
      ".mfe-head { display:flex; align-items:center; justify-content:space-between;",
      "  gap:12px; padding:16px 22px; border-bottom:1px solid #f1f5f9; position:relative; }",
      ".mfe-progress { position:absolute; left:0; right:0; bottom:-1px; height:3px;",
      "  background:transparent; overflow:hidden; display:none; }",
      ".mfe-progress.is-on { display:block; }",
      ".mfe-progress::after { content:''; position:absolute; inset:0;",
      "  background:linear-gradient(90deg, transparent 0%, #4f46e5 50%, transparent 100%);",
      "  animation:mfeProgress 1.2s ease-in-out infinite; }",
      "@keyframes mfeProgress { 0% { transform:translateX(-100%); }",
      "                          100% { transform:translateX(100%); } }",
      ".mfe-loading-stub { padding:40px 24px; display:flex;",
      "  flex-direction:column; gap:12px; align-items:flex-start; }",
      ".mfe-loading-stub > div { background:linear-gradient(90deg,",
      "  #f1f5f9, #e2e8f0, #f1f5f9); background-size:200% 100%;",
      "  animation:mfeProgress 1.6s ease-in-out infinite;",
      "  height:14px; border-radius:5px; }",
      ".mfe-loading-stub-tall { height:48px !important; width:60% !important; }",
      ".mfe-loading-stub-row { width:100% !important; height:46px !important;",
      "  border-radius:10px !important; }",
      ".mfe-head-title { margin:0; font-size:16px; font-weight:700; }",
      ".mfe-head-sub { font-size:12.5px; color:#64748b; margin-top:2px; }",
      ".mfe-close { width:32px; height:32px; border:0; background:transparent;",
      "  color:#64748b; font-size:22px; cursor:pointer; border-radius:6px; line-height:1; }",
      ".mfe-close:hover { background:#f1f5f9; color:#0f172a; }",
      ".mfe-body { flex:1; overflow:auto; padding:20px 22px;",
      "  display:grid; grid-template-columns:minmax(0,1fr) 320px;",
      "  gap:20px; align-items:start; }",
      // Keep the preview pinned to the right side at all reasonable
      // widths. Only fall back to stacked layout on truly tiny
      // screens (≤480px — phones in portrait) where 320px of preview
      // wouldn't leave room for anything else.
      "@media (max-width:480px) { .mfe-body { grid-template-columns:1fr; } }",
      ".mfe-section-h { font-size:11.5px; font-weight:700; color:#475569;",
      "  text-transform:uppercase; letter-spacing:.04em; margin:0 0 8px; }",
      ".mfe-input { width:100%; padding:9px 12px; border:1px solid #cbd5e1;",
      "  border-radius:8px; font:inherit; font-size:14px; color:#0f172a;",
      "  background:#fff; outline:none; box-sizing:border-box;",
      "  transition:border-color .12s ease, box-shadow .12s ease; }",
      ".mfe-input:focus { border-color:#4f46e5;",
      "  box-shadow:0 0 0 3px rgba(79,70,229,.18); }",
      ".mfe-name-row { margin-bottom:18px; }",
      ".mfe-fields-list { display:flex; flex-direction:column; gap:8px; }",
      ".mfe-field-card { display:flex; align-items:center; gap:10px;",
      "  padding:10px 12px; background:#f8fafc; border:1px solid #e5e7eb;",
      "  border-radius:10px; transition:border-color .12s ease, background .12s ease,",
      "    transform .15s ease, opacity .15s ease;",
      "  user-select:none; }",
      ".mfe-field-card:hover { border-color:#cbd5e1; background:#fff; }",
      ".mfe-field-card.is-dragging { opacity:.4; transform:scale(.98); }",
      ".mfe-field-card.is-drop-target {",
      "  border-color:#4f46e5; background:#eef2ff;",
      "  box-shadow:0 -2px 0 0 #4f46e5 inset; }",
      ".mfe-field-card.is-drop-target-below {",
      "  border-color:#4f46e5; background:#eef2ff;",
      "  box-shadow:0 2px 0 0 #4f46e5 inset; }",
      ".mfe-field-drag { width:18px; cursor:grab; color:#94a3b8;",
      "  flex-shrink:0; font-size:14px; line-height:1; text-align:center;",
      "  user-select:none; }",
      ".mfe-field-drag:active { cursor:grabbing; }",
      ".mfe-field-card:hover .mfe-field-drag { color:#475569; }",
      ".mfe-field-ico { width:30px; height:30px; flex-shrink:0;",
      "  display:inline-flex; align-items:center; justify-content:center;",
      "  background:#eef2ff; border-radius:7px; font-size:14px; }",
      ".mfe-field-main { flex:1; min-width:0;",
      "  display:flex; flex-direction:column; gap:3px; }",
      ".mfe-field-label-input { font:inherit; font-size:14px; font-weight:600;",
      "  color:#0f172a; padding:3px 6px; border:1px solid transparent;",
      "  border-radius:5px; background:transparent; outline:none;",
      "  margin:-3px -6px; }",
      ".mfe-field-label-input:focus, .mfe-field-label-input:hover {",
      "  border-color:#cbd5e1; background:#fff; }",
      ".mfe-field-meta { font-size:11.5px; color:#64748b;",
      "  display:flex; align-items:center; gap:6px; }",
      ".mfe-field-typepill { background:#e2e8f0; color:#334155;",
      "  padding:1px 7px; border-radius:999px; font-size:10.5px; font-weight:600; }",
      ".mfe-field-req-btn { border:1px solid #cbd5e1; background:#fff;",
      "  color:#64748b; padding:3px 9px; border-radius:999px;",
      "  font:inherit; font-size:11px; font-weight:600; cursor:pointer; }",
      ".mfe-field-req-btn.is-on { background:#fef3c7; color:#92400e;",
      "  border-color:#fde68a; }",
      ".mfe-field-x { width:26px; height:26px; flex-shrink:0;",
      "  border:0; background:transparent; color:#94a3b8; font-size:16px;",
      "  border-radius:5px; cursor:pointer; }",
      ".mfe-field-x:hover { background:#fee2e2; color:#b91c1c; }",
      ".mfe-field-wrap { display:flex; flex-direction:column; gap:0; }",
      ".mfe-opts { margin:-2px 0 0 40px; padding:8px 12px 10px;",
      "  background:#fff; border:1px solid #e5e7eb; border-top:0;",
      "  border-radius:0 0 10px 10px; }",
      ".mfe-opts-h { font-size:10.5px; font-weight:700; color:#64748b;",
      "  text-transform:uppercase; letter-spacing:.04em; margin-bottom:6px; }",
      ".mfe-opts-chips { display:flex; flex-wrap:wrap; gap:4px; min-height:24px;",
      "  margin-bottom:6px; }",
      ".mfe-opt-chip { display:inline-flex; align-items:center; gap:4px;",
      "  padding:3px 4px 3px 10px; background:#eef2ff; color:#312e81;",
      "  border-radius:999px; font-size:12px; font-weight:500; }",
      ".mfe-opt-x { border:0; background:transparent; cursor:pointer;",
      "  color:#6366f1; font-size:13px; line-height:1; padding:0 4px;",
      "  border-radius:50%; }",
      ".mfe-opt-x:hover { color:#fff; background:#6366f1; }",
      ".mfe-opts-empty { font-size:11.5px; color:#94a3b8; font-style:italic;",
      "  padding:3px 0; }",
      ".mfe-opt-input { width:100%; padding:6px 10px; border:1px solid #cbd5e1;",
      "  border-radius:6px; font:inherit; font-size:12.5px; color:#0f172a;",
      "  background:#fff; outline:none; box-sizing:border-box; }",
      ".mfe-opt-input:focus { border-color:#4f46e5;",
      "  box-shadow:0 0 0 3px rgba(79,70,229,.15); }",
      ".mfe-add-wrap { position:relative; margin-top:10px; }",
      ".mfe-add-btn { width:100%; padding:9px 12px;",
      "  border:1px dashed #94a3b8; background:#fff; color:#0f172a;",
      "  border-radius:10px; font:inherit; font-size:13px; font-weight:600;",
      "  cursor:pointer; transition:background .12s ease, border-color .12s ease; }",
      ".mfe-add-btn:hover { background:#eef2ff; border-color:#4f46e5; color:#312e81; }",
      ".mfe-add-menu { position:absolute; top:calc(100% + 6px); left:0; right:0;",
      "  background:#fff; border:1px solid #e5e7eb; border-radius:10px;",
      "  box-shadow:0 16px 36px rgba(15,23,42,.18); padding:8px;",
      "  display:none; z-index:5; max-height:420px; overflow:auto; }",
      ".mfe-add-menu.is-drop-up { top:auto; bottom:calc(100% + 6px); }",
      ".mfe-add-menu.is-open { display:block; }",
      ".mfe-add-menu-h { font-size:10.5px; font-weight:700; color:#94a3b8;",
      "  text-transform:uppercase; letter-spacing:.04em; padding:6px 10px 4px; }",
      ".mfe-add-item { display:flex; align-items:center; gap:8px;",
      "  width:100%; padding:7px 10px; border:0; background:transparent;",
      "  color:#0f172a; font:inherit; font-size:13px; cursor:pointer;",
      "  border-radius:6px; text-align:left; }",
      ".mfe-add-item:hover { background:#f1f5f9; }",
      ".mfe-empty { padding:20px; text-align:center; color:#94a3b8;",
      "  font-size:13px; background:#f8fafc; border:1px dashed #cbd5e1;",
      "  border-radius:10px; }",
      ".mfe-preview { background:#fafbfc; border:1px solid #e5e7eb;",
      "  border-radius:12px; padding:18px;",
      "  display:flex; flex-direction:column; gap:12px; align-self:start;",
      "  position:sticky; top:0; max-height:calc(90vh - 200px); overflow:auto; }",
      ".mfe-preview-tag { font-size:10.5px; font-weight:700; color:#94a3b8;",
      "  text-transform:uppercase; letter-spacing:.05em; }",
      ".mfe-preview-title { margin:0; font-size:18px; font-weight:700; color:#0f172a; }",
      ".mfe-preview-field { display:flex; flex-direction:column; gap:4px; }",
      ".mfe-preview-label { font-size:12.5px; font-weight:600; color:#334155; }",
      ".mfe-preview-label .mfe-req-mark { color:#ef4444; margin-left:3px; }",
      ".mfe-preview-input { padding:8px 11px; border:1px solid #cbd5e1;",
      "  border-radius:7px; background:#fff; font:inherit; font-size:13px;",
      "  color:#0f172a; pointer-events:none; }",
      ".mfe-preview-textarea { min-height:64px; resize:none; }",
      ".mfe-preview-submit { margin-top:6px; padding:9px 16px;",
      "  background:#4f46e5; color:#fff; border:0; border-radius:8px;",
      "  font:inherit; font-size:13px; font-weight:700; pointer-events:none; }",
      // Embed panel — sits under the live preview on the right.
      ".mfe-embed { margin-top:16px; padding:14px; background:#fff;",
      "  border:1px solid #e5e7eb; border-radius:10px;",
      "  display:flex; flex-direction:column; gap:10px; }",
      ".mfe-embed-h { font-size:11.5px; font-weight:700; color:#475569;",
      "  text-transform:uppercase; letter-spacing:.04em;",
      "  padding-bottom:8px; border-bottom:1px solid #f1f5f9; }",
      ".mfe-embed-block { display:flex; flex-direction:column; gap:5px; }",
      ".mfe-embed-lbl { display:flex; align-items:center;",
      "  justify-content:space-between; gap:8px;",
      "  font-size:12px; font-weight:600; color:#0f172a; }",
      ".mfe-embed-copy { padding:3px 10px; background:#0f172a; color:#fff;",
      "  border:0; border-radius:6px; font:inherit; font-size:11.5px;",
      "  font-weight:600; cursor:pointer; }",
      ".mfe-embed-copy:hover { background:#1e293b; }",
      ".mfe-embed-input, .mfe-embed-code {",
      "  font:11.5px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace;",
      "  color:#312e81; background:#f8fafc; border:1px solid #e5e7eb;",
      "  border-radius:6px; padding:7px 9px; width:100%;",
      "  outline:none; resize:vertical; box-sizing:border-box;",
      "  word-break:break-all; }",
      ".mfe-embed-input { resize:none; }",
      ".mfe-embed-input:focus, .mfe-embed-code:focus {",
      "  border-color:#4f46e5; box-shadow:0 0 0 3px rgba(79,70,229,.15); }",
      ".mfe-embed-hint { margin-top:14px; padding:10px 12px;",
      "  background:#fffbeb; border:1px solid #fde68a; border-radius:8px;",
      "  font-size:12.5px; color:#78350f; }",
      // Discovered-fields panel (Phase 1 universal field discovery).
      ".mfe-discovered { margin-top:16px; padding:12px 14px;",
      "  background:#fff; border:1px solid #e5e7eb; border-radius:10px; }",
      ".mfe-disc-h { font-size:11.5px; font-weight:700; color:#475569;",
      "  text-transform:uppercase; letter-spacing:.04em;",
      "  padding-bottom:8px; border-bottom:1px solid #f1f5f9;",
      "  margin-bottom:10px; }",
      ".mfe-disc-loading, .mfe-disc-empty { font-size:12.5px;",
      "  color:#94a3b8; font-style:italic; padding:6px 0; }",
      ".mfe-disc-meta { font-size:11.5px; color:#64748b; margin-bottom:8px; }",
      ".mfe-disc-section-h { font-size:11px; font-weight:700;",
      "  color:#64748b; text-transform:uppercase;",
      "  letter-spacing:.04em; margin:10px 0 6px; }",
      ".mfe-disc-row { padding:7px 9px; border:1px solid #e5e7eb;",
      "  border-radius:7px; margin-bottom:5px; }",
      ".mfe-disc-row.is-unlabeled { background:#fffbeb;",
      "  border-color:#fde68a; }",
      ".mfe-disc-row.is-labeled { background:#f8fafc; }",
      ".mfe-disc-row-top { display:flex; align-items:center;",
      "  justify-content:space-between; gap:8px; }",
      ".mfe-disc-name-wrap { display:flex; align-items:center;",
      "  gap:6px; min-width:0; flex:1; }",
      ".mfe-disc-key { font-family:ui-monospace,SFMono-Regular,Menlo,monospace;",
      "  font-size:12px; color:#312e81; background:#eef2ff;",
      "  padding:2px 7px; border-radius:4px; }",
      ".mfe-disc-pill { font-size:10.5px; font-weight:700;",
      "  padding:2px 7px; border-radius:999px; }",
      ".mfe-disc-pill.is-ok { background:#dcfce7; color:#166534; }",
      ".mfe-disc-pill.is-new { background:#fde68a; color:#78350f; }",
      ".mfe-disc-add { padding:4px 10px; background:#0f172a;",
      "  color:#fff; border:0; border-radius:6px; font:inherit;",
      "  font-size:11.5px; font-weight:600; cursor:pointer; }",
      ".mfe-disc-add:hover { background:#1e293b; }",
      ".mfe-disc-samples { margin-top:4px; font-size:11.5px;",
      "  color:#64748b; line-height:1.45; }",
      ".mfe-disc-sample { font-family:ui-monospace,SFMono-Regular,Menlo,monospace;",
      "  color:#0f172a; background:#fff; padding:1px 5px; border-radius:3px;",
      "  border:1px solid #e5e7eb; }",
      // Inline label/type editor that expands beneath a discovered row
      // when the user clicks "+ Add to form". Lets them confirm the
      // friendly label, pick a type, and set required-ness in one go.
      ".mfe-disc-editor { display:grid; gap:6px; margin-top:8px;",
      "  padding:9px; background:#fff; border:1px solid #c7d2fe;",
      "  border-radius:8px;",
      "  grid-template-columns: 1fr 1fr; align-items:center; }",
      ".mfe-disc-editor > .mfe-disc-editor-label { grid-column:1 / -1; }",
      ".mfe-disc-editor input.mfe-disc-editor-label,",
      ".mfe-disc-editor select.mfe-disc-editor-type {",
      "  font:13px/1.4 inherit; padding:7px 9px;",
      "  border:1px solid #e5e7eb; border-radius:6px;",
      "  background:#fff; color:#0f172a; outline:none; width:100%;",
      "  box-sizing:border-box; }",
      ".mfe-disc-editor input.mfe-disc-editor-label:focus,",
      ".mfe-disc-editor select.mfe-disc-editor-type:focus {",
      "  border-color:#4f46e5; box-shadow:0 0 0 2px rgba(79,70,229,.15); }",
      ".mfe-disc-editor-req { font-size:12px; color:#475569;",
      "  display:flex; align-items:center; gap:6px; }",
      ".mfe-disc-editor-actions { display:flex; gap:6px;",
      "  justify-content:flex-end; grid-column:1 / -1; }",
      ".mfe-disc-editor-save { padding:6px 12px; background:#4f46e5;",
      "  color:#fff; border:0; border-radius:6px; font:inherit;",
      "  font-size:12px; font-weight:700; cursor:pointer; }",
      ".mfe-disc-editor-save:hover { background:#4338ca; }",
      ".mfe-disc-editor-cancel { padding:6px 12px; background:#fff;",
      "  color:#64748b; border:1px solid #e5e7eb; border-radius:6px;",
      "  font:inherit; font-size:12px; font-weight:600; cursor:pointer; }",
      ".mfe-disc-editor-cancel:hover { background:#f8fafc; color:#0f172a; }",
      ".mfe-foot { display:flex; align-items:center; justify-content:space-between;",
      "  gap:12px; padding:14px 22px; border-top:1px solid #f1f5f9; background:#fff; }",
      ".mfe-status { font-size:12.5px; color:#64748b; }",
      ".mfe-status.is-ok { color:#15803d; }",
      ".mfe-status.is-bad { color:#b91c1c; }",
      ".mfe-btn { padding:9px 14px; border:1px solid #e5e7eb; background:#fff;",
      "  color:#0f172a; border-radius:8px; font:inherit; font-size:13px;",
      "  font-weight:600; cursor:pointer; }",
      ".mfe-btn:hover { background:#f8fafc; }",
      ".mfe-btn-danger { color:#b91c1c; border-color:#fecaca; }",
      ".mfe-btn-danger:hover { background:#fee2e2; }",
      ".mfe-btn-primary { background:#4f46e5; color:#fff; border-color:#4f46e5; }",
      ".mfe-btn-primary:hover { background:#4338ca; }",
      ".mfe-btn-primary:disabled { background:#cbd5e1; border-color:#cbd5e1; cursor:wait; }",
      // ─── Dark-mode overrides for the new mfe-* editor ──────────
      "[data-theme=\"dark\"] .mfe-overlay { background:rgba(0,0,0,.65); }",
      "[data-theme=\"dark\"] .mfe-card { background:#111113; color:#fafafa;",
      "  border:1px solid #27272a; box-shadow:0 24px 60px rgba(0,0,0,.7); }",
      "[data-theme=\"dark\"] .mfe-head { border-bottom-color:#27272a; }",
      "[data-theme=\"dark\"] .mfe-head-sub { color:#a1a1aa; }",
      "[data-theme=\"dark\"] .mfe-close { color:#a1a1aa; }",
      "[data-theme=\"dark\"] .mfe-close:hover { background:#27272a; color:#fafafa; }",
      "[data-theme=\"dark\"] .mfe-loading-stub > div {",
      "  background:linear-gradient(90deg,#18181b,#27272a,#18181b); background-size:200% 100%; }",
      "[data-theme=\"dark\"] .mfe-section-h { color:#a1a1aa; }",
      "[data-theme=\"dark\"] .mfe-input { background:#18181b !important;",
      "  color:#fafafa !important; border-color:#27272a !important; }",
      "[data-theme=\"dark\"] .mfe-input:focus { border-color:#818cf8 !important;",
      "  box-shadow:0 0 0 3px rgba(129,140,248,.18) !important; }",
      "[data-theme=\"dark\"] .mfe-input::placeholder { color:#71717a; }",
      "[data-theme=\"dark\"] .mfe-field-card { background:#18181b; border-color:#27272a; }",
      "[data-theme=\"dark\"] .mfe-field-card:hover { background:#1f1f23; border-color:#3f3f46; }",
      "[data-theme=\"dark\"] .mfe-field-card.is-drop-target,",
      "[data-theme=\"dark\"] .mfe-field-card.is-drop-target-below {",
      "  border-color:#818cf8; background:rgba(129,140,248,.12); }",
      "[data-theme=\"dark\"] .mfe-field-drag { color:#71717a; }",
      "[data-theme=\"dark\"] .mfe-field-card:hover .mfe-field-drag { color:#a1a1aa; }",
      "[data-theme=\"dark\"] .mfe-field-ico { background:rgba(129,140,248,.18); }",
      "[data-theme=\"dark\"] .mfe-field-label-input { color:#fafafa; }",
      "[data-theme=\"dark\"] .mfe-field-label-input:focus,",
      "[data-theme=\"dark\"] .mfe-field-label-input:hover {",
      "  background:#0a0a0b; border-color:#3f3f46; }",
      "[data-theme=\"dark\"] .mfe-status.is-ok { color:#6ee7b7; }",
      "[data-theme=\"dark\"] .mfe-status.is-bad { color:#fca5a5; }",
      "[data-theme=\"dark\"] .mfe-btn { background:#18181b; color:#fafafa;",
      "  border-color:#27272a; }",
      "[data-theme=\"dark\"] .mfe-btn:hover { background:#1f1f23; border-color:#3f3f46; }",
      "[data-theme=\"dark\"] .mfe-btn-danger { color:#fca5a5; border-color:rgba(220,38,38,.4); }",
      "[data-theme=\"dark\"] .mfe-btn-danger:hover { background:rgba(220,38,38,.15); }",
      "[data-theme=\"dark\"] .mfe-btn-primary { background:#818cf8; color:#0a0a0b; border-color:#818cf8; }",
      "[data-theme=\"dark\"] .mfe-btn-primary:hover { background:#a5b4fc; border-color:#a5b4fc; }",
      "[data-theme=\"dark\"] .mfe-btn-primary:disabled { background:#27272a; color:#71717a; border-color:#27272a; }",
      // ── Dark mode — remaining surfaces the first pass missed ──────
      "[data-theme=\"dark\"] .mfe-add-btn { background:#18181b; border-color:#3f3f46; color:#fafafa; }",
      "[data-theme=\"dark\"] .mfe-add-btn:hover { background:rgba(129,140,248,.12); border-color:#818cf8; color:#c7d2fe; }",
      "[data-theme=\"dark\"] .mfe-add-menu { background:#1f1f23; border-color:#3f3f46; box-shadow:0 16px 36px rgba(0,0,0,.6); }",
      "[data-theme=\"dark\"] .mfe-add-menu-h { color:#71717a; }",
      "[data-theme=\"dark\"] .mfe-add-item { color:#fafafa; }",
      "[data-theme=\"dark\"] .mfe-add-item:hover { background:#27272a; }",
      "[data-theme=\"dark\"] .mfe-foot { background:#111113; border-top-color:#27272a; }",
      "[data-theme=\"dark\"] .mfe-status { color:#a1a1aa; }",
      "[data-theme=\"dark\"] .mfe-empty { background:#18181b; border-color:#3f3f46; color:#71717a; }",
      "[data-theme=\"dark\"] .mfe-field-meta { color:#a1a1aa; }",
      "[data-theme=\"dark\"] .mfe-field-typepill { background:#27272a; color:#d4d4d8; }",
      "[data-theme=\"dark\"] .mfe-field-req-btn { background:#18181b; border-color:#3f3f46; color:#a1a1aa; }",
      "[data-theme=\"dark\"] .mfe-field-req-btn.is-on { background:rgba(245,158,11,.18); color:#fcd34d; border-color:rgba(245,158,11,.4); }",
      "[data-theme=\"dark\"] .mfe-field-x { color:#71717a; }",
      "[data-theme=\"dark\"] .mfe-field-x:hover { background:rgba(220,38,38,.18); color:#fca5a5; }",
      "[data-theme=\"dark\"] .mfe-opts { background:#18181b; border-color:#27272a; }",
      "[data-theme=\"dark\"] .mfe-opts-h { color:#a1a1aa; }",
      "[data-theme=\"dark\"] .mfe-opts-empty { color:#71717a; }",
      "[data-theme=\"dark\"] .mfe-opt-chip { background:rgba(129,140,248,.16); color:#c7d2fe; }",
      "[data-theme=\"dark\"] .mfe-opt-input { background:#18181b; border-color:#3f3f46; color:#fafafa; }",
      // Live preview pane (right column of the editor).
      "[data-theme=\"dark\"] .mfe-preview { background:#18181b; border-color:#27272a; }",
      "[data-theme=\"dark\"] .mfe-preview-tag { color:#71717a; }",
      "[data-theme=\"dark\"] .mfe-preview-title { color:#fafafa; }",
      "[data-theme=\"dark\"] .mfe-preview-label { color:#d4d4d8; }",
      "[data-theme=\"dark\"] .mfe-preview-input { background:#0a0a0b; border-color:#3f3f46; color:#fafafa; }",
      "[data-theme=\"dark\"] .mfe-preview-submit { background:#818cf8; color:#0a0a0b; }",
      // Embed panel.
      "[data-theme=\"dark\"] .mfe-embed { background:#18181b; border-color:#27272a; }",
      "[data-theme=\"dark\"] .mfe-embed-h { color:#a1a1aa; border-bottom-color:#27272a; }",
      "[data-theme=\"dark\"] .mfe-embed-lbl { color:#fafafa; }",
      "[data-theme=\"dark\"] .mfe-embed-input, [data-theme=\"dark\"] .mfe-embed-code { background:#0a0a0b; border-color:#3f3f46; color:#c7d2fe; }",
      "[data-theme=\"dark\"] .mfe-embed-hint { background:rgba(245,158,11,.12); border-color:rgba(245,158,11,.35); color:#fcd34d; }",
      // Discovered-data panel ('OTHER DATA SENT WITH THIS FORM').
      "[data-theme=\"dark\"] .mfe-discovered { background:#18181b; border-color:#27272a; }",
      "[data-theme=\"dark\"] .mfe-disc-h { color:#a1a1aa; border-bottom-color:#27272a; }",
      "[data-theme=\"dark\"] .mfe-disc-loading, [data-theme=\"dark\"] .mfe-disc-empty, [data-theme=\"dark\"] .mfe-disc-meta, [data-theme=\"dark\"] .mfe-disc-section-h, [data-theme=\"dark\"] .mfe-disc-samples { color:#a1a1aa; }",
      "[data-theme=\"dark\"] .mfe-disc-row { background:#1f1f23; border-color:#3f3f46; }",
      "[data-theme=\"dark\"] .mfe-disc-row.is-labeled { background:#18181b; }",
      "[data-theme=\"dark\"] .mfe-disc-row.is-unlabeled { background:rgba(245,158,11,.1); border-color:rgba(245,158,11,.35); }",
      "[data-theme=\"dark\"] .mfe-disc-key { background:rgba(129,140,248,.16); color:#c7d2fe; }",
      "[data-theme=\"dark\"] .mfe-disc-sample { background:#0a0a0b; border-color:#3f3f46; color:#d4d4d8; }",
      "[data-theme=\"dark\"] .mfe-disc-add { background:#818cf8; color:#0a0a0b; }",
      "[data-theme=\"dark\"] .mfe-disc-editor { background:#18181b; border-color:#3f3f46; }",
      "[data-theme=\"dark\"] .mfe-disc-editor input.mfe-disc-editor-label, [data-theme=\"dark\"] .mfe-disc-editor select.mfe-disc-editor-type { background:#0a0a0b; border-color:#3f3f46; color:#fafafa; }",
      "[data-theme=\"dark\"] .mfe-disc-editor-req { color:#a1a1aa; }",
      "[data-theme=\"dark\"] .mfe-disc-editor-cancel { background:#18181b; border-color:#3f3f46; color:#a1a1aa; }"
    ].join("\n");
    document.head.appendChild(s);
  }

  // ─── Modal scaffold (built once, re-used per open) ──────────────
  var overlay, card, body, headSub, statusEl, saveBtn, deleteBtn, progressEl;
  var livePreviewHost = null;   // right-column live form preview
  var state = null;          // { id, name, fields: [...] }
  var addMenuOpen = false;

  // Show / hide the indeterminate top progress bar inside the modal
  // header. Used during initial fetch + any background work so the
  // user sees activity instead of staring at a frozen modal.
  function setProgress(on) {
    if (!progressEl) return;
    progressEl.classList.toggle("is-on", !!on);
  }

  // Heuristic: is this key something OTHER than a real form input?
  // Used to strip tracking/metadata/legacy-preset noise from the
  // editor's field list so the user only sees actual form fields.
  // Mirrors the wizard's isLikelyMetadata so behavior is consistent
  // across both entry points (wizard handoff and direct form edit).
  var _META_KEY_SET = {
    utm: 1, utm_source: 1, utm_medium: 1, utm_campaign: 1,
    utm_term: 1, utm_content: 1,
    gclid: 1, fbclid: 1, msclkid: 1, mc_eid: 1, mc_cid: 1,
    source: 1, medium: 1, campaign: 1, ad_id: 1, adid: 1,
    referral: 1, referrer: 1, referer: 1, ref: 1,
    page: 1, page_url: 1, page_title: 1, url: 1, landing_page: 1,
    landing_url: 1, current_url: 1, "_page_url": 1, "_page_title": 1,
    user_agent: 1, useragent: 1, ip: 1, ip_address: 1, client_ip: 1,
    remote_addr: 1, country: 1, language: 1, locale: 1,
    timestamp: 1, time: 1, submitted_at: 1, created_at: 1,
    submission_id: 1, lead_id: 1, form_id: 1, id: 1,
    csrf_token: 1, _token: 1, "_csrf": 1, "g-recaptcha-response": 1,
    "h-captcha-response": 1, recaptcha_token: 1, honeypot: 1,
    "_wpcf7": 1, "_wpcf7_version": 1, "_wpcf7_locale": 1,
    "_wpcf7_unit_tag": 1, "_wpcf7_container_post": 1,
  };
  function isLikelyMetadata(key) {
    var k = String(key || "").toLowerCase().trim();
    if (!k) return true;
    if (_META_KEY_SET[k]) return true;
    if (k.indexOf("utm_") === 0) return true;
    if (k.indexOf("_wpcf7") === 0) return true;
    // landscape_* are legacy preset variables from the old
    // LANDSCAPING_PRO_PRESETS feature. They got baked into a lot
    // of existing form blobs back when the canvas auto-added them
    // as merge-tag suggestions. They aren't real form inputs and
    // should never appear in the field editor.
    if (k.indexOf("landscape_") === 0) return true;
    if (k.charAt(0) === "_") return true;
    return false;
  }

  // Strip metadata-shaped keys out of a fields array. Returns a new
  // array; never mutates the input. Used at render() time so the user
  // sees a clean editor regardless of what legacy junk lives in the
  // saved form blob — and at Save time the cleaned list gets PUT back
  // to the server, so the next reload doesn't show it either.
  function pruneMetadataFields(fields) {
    if (!Array.isArray(fields)) return [];
    return fields.filter(function (f) {
      var k = (f && (f.key || f.id || f.name)) || "";
      return !isLikelyMetadata(k);
    });
  }

  // Render a skeleton "we're loading" view in the modal body. Keeps
  // the modal usable (scaffold visible, close button works) while
  // we wait for either the script load or the network fetch.
  function renderLoadingStub() {
    if (!body) return;
    body.innerHTML = "";
    body.style.display = "block";
    var stub = el("div", { class: "mfe-loading-stub" });
    stub.appendChild(el("div", { class: "mfe-loading-stub-tall" }));
    stub.appendChild(el("div", { class: "mfe-loading-stub-row" }));
    stub.appendChild(el("div", { class: "mfe-loading-stub-row" }));
    stub.appendChild(el("div", { class: "mfe-loading-stub-row" }));
    body.appendChild(stub);
  }

  function buildScaffold() {
    if (overlay) return;
    overlay = el("div", { class: "mfe-overlay", role: "dialog",
                            "aria-modal": "true" });
    card = el("div", { class: "mfe-card" });
    var head = el("div", { class: "mfe-head" });
    var headLeft = el("div");
    headLeft.appendChild(el("h3", { class: "mfe-head-title" }, "Form"));
    headSub = el("div", { class: "mfe-head-sub" }, "Edit form details");
    headLeft.appendChild(headSub);
    head.appendChild(headLeft);
    var x = el("button", { type: "button", class: "mfe-close",
                            "aria-label": "Close" }, "×");
    x.addEventListener("click", close);
    head.appendChild(x);
    // Indeterminate progress bar pinned to the bottom edge of the
    // header — visible during the brief network/script-load window
    // when the modal is open but the form data isn't ready yet.
    progressEl = el("div", { class: "mfe-progress" });
    head.appendChild(progressEl);
    body = el("div", { class: "mfe-body" });
    var foot = el("div", { class: "mfe-foot" });
    deleteBtn = el("button", {
      type: "button", class: "mfe-btn mfe-btn-danger",
    }, "Delete form");
    deleteBtn.addEventListener("click", deleteFlow);
    var footRight = el("div", { style: "display:flex;gap:8px;align-items:center;" });
    statusEl = el("span", { class: "mfe-status" }, "");
    var cancelBtn = el("button", {
      type: "button", class: "mfe-btn",
    }, "Cancel");
    cancelBtn.addEventListener("click", close);
    saveBtn = el("button", {
      type: "button", class: "mfe-btn mfe-btn-primary",
    }, "Save form");
    saveBtn.addEventListener("click", save);
    footRight.appendChild(statusEl);
    footRight.appendChild(cancelBtn);
    footRight.appendChild(saveBtn);
    foot.appendChild(deleteBtn);
    foot.appendChild(footRight);
    card.appendChild(head);
    card.appendChild(body);
    card.appendChild(foot);
    overlay.appendChild(card);
    // Backdrop close — only fire when the user STARTED their click
    // on the backdrop AND released on the backdrop. Without this
    // mousedown-tracking, highlighting text inside the card and
    // releasing the mouse outside (over the backdrop) would
    // accidentally close the modal mid-selection and trash all of
    // the user's progress.
    var pressedOnBackdrop = false;
    overlay.addEventListener("mousedown", function (e) {
      pressedOnBackdrop = (e.target === overlay);
    });
    overlay.addEventListener("mouseup", function (e) {
      if (pressedOnBackdrop && e.target === overlay) {
        close();
      }
      pressedOnBackdrop = false;
    });
    document.body.appendChild(overlay);
    document.addEventListener("keydown", function (e) {
      if (overlay.classList.contains("is-open") && e.key === "Escape") {
        close();
      }
    });
  }

  // Drop indicator cleanup — shared across all field cards during
  // a drag, removed once the drag ends so the next hover doesn't
  // double-mark.
  function clearDropMarks() {
    if (!body) return;
    Array.prototype.forEach.call(
      body.querySelectorAll(".mfe-field-card.is-drop-target,.mfe-field-card.is-drop-target-below"),
      function (c) {
        c.classList.remove("is-drop-target");
        c.classList.remove("is-drop-target-below");
      });
  }

  // Tiny element helper — DOM construction without the verbosity.
  function el(tag, attrs, text) {
    var n = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === "class") n.className = attrs[k];
        else n.setAttribute(k, attrs[k]);
      });
    }
    if (text != null) n.appendChild(document.createTextNode(String(text)));
    return n;
  }

  // ─── Render ────────────────────────────────────────────────────
  function render() {
    body.innerHTML = "";
    // Two-section layout: the left column holds the form's settings
    // (name + field editor + extras); the right column is a live
    // preview of the form the visitor will see. The body's grid CSS
    // drives the split — clear any stale inline display so it applies.
    body.style.display = "";
    // Defensive prune: legacy form blobs may carry tracking keys
    // (utm_*), framework noise (_wpcf7*), or stale preset variables
    // (landscape_*) in their fields array. Strip those before the
    // user sees them, so the editor's field list = real form inputs
    // only. The cleaned array is reassigned to state.fields so a
    // subsequent Save writes the pruned list back to the server,
    // making the cleanup permanent.
    state.fields = pruneMetadataFields(state.fields);
    headSub.textContent = state.id ? "Editing /" + (state.slug || "form")
                                    : "New form";
    deleteBtn.style.display = state.id ? "" : "none";
    statusEl.textContent = "";
    statusEl.className = "mfe-status";

    // ── Editor column (the only column now) ──
    var leftCol = el("div");
    // The "extras" container for the body-only fields panel is built
    // separately so the per-field-card edit callbacks (which used to
    // call renderPreview(rightCol)) have a stable no-op target. The
    // panel itself is fetch-driven and doesn't need to re-render on
    // each character typed in a label input.
    var extrasCol = el("div");
    var nameRow = el("div", { class: "mfe-name-row" });
    nameRow.appendChild(el("div", { class: "mfe-section-h" }, "Form name"));
    var nameInput = el("input", {
      type: "text", class: "mfe-input",
      placeholder: "Contact form",
      value: state.name || "",
      maxlength: "120",
    });
    nameInput.addEventListener("input", function () {
      state.name = nameInput.value;
      renderLivePreview();
    });
    nameRow.appendChild(nameInput);
    leftCol.appendChild(nameRow);

    leftCol.appendChild(el("div", { class: "mfe-section-h" }, "Fields"));
    var fieldsHost = el("div", { class: "mfe-fields-list" });
    if (!state.fields.length) {
      fieldsHost.appendChild(el("div", { class: "mfe-empty" },
        "No fields yet. Add one below — Name + Email is a sensible start."));
    } else {
      state.fields.forEach(function (f, idx) {
        // Pass extrasCol as the legacy "previewHost" arg so the
        // per-field-card callbacks that still call renderPreview()
        // don't error. renderPreview() will populate the extras panel
        // (which is benign / idempotent — same fetch every time).
        fieldsHost.appendChild(renderFieldCard(f, idx, extrasCol));
      });
    }
    leftCol.appendChild(fieldsHost);

    // Add-field button + dropdown
    var addWrap = el("div", { class: "mfe-add-wrap" });
    var addBtn = el("button", {
      type: "button", class: "mfe-add-btn",
    }, "+ Add field");
    var menu = el("div", { class: "mfe-add-menu" });
    addWrap.appendChild(addBtn);
    addWrap.appendChild(menu);
    addBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      addMenuOpen = !addMenuOpen;
      menu.classList.toggle("is-open", addMenuOpen);
      if (!addMenuOpen) return;
      buildAddMenu(menu);
      // Auto-flip the menu UP if there's not enough room below it
      // inside the modal body. Otherwise the user sees only the
      // first row or two and has to manually scroll the modal.
      var btnRect  = addBtn.getBoundingClientRect();
      var bodyRect = body.getBoundingClientRect();
      var roomBelow = bodyRect.bottom - btnRect.bottom;
      // Menu's max-height is 420px; flip up if below has <240px.
      menu.classList.toggle("is-drop-up", roomBelow < 240);
      // Then make sure the menu is actually visible — scroll the
      // modal body if the menu sticks out past the viewport.
      setTimeout(function () {
        try {
          menu.scrollIntoView({ block: "nearest", behavior: "smooth" });
        } catch (_) {}
      }, 30);
    });
    document.addEventListener("click", function (e) {
      if (!addMenuOpen) return;
      if (!menu.contains(e.target) && e.target !== addBtn) {
        addMenuOpen = false;
        menu.classList.remove("is-open");
      }
    });
    leftCol.appendChild(addWrap);

    // The "Other data sent with this form" panel sits at the bottom
    // of the left column, under the field editor.
    renderPreview(extrasCol);
    leftCol.appendChild(extrasCol);
    body.appendChild(leftCol);

    // Right column — the live form preview.
    livePreviewHost = el("div", { class: "mfe-preview" });
    body.appendChild(livePreviewHost);
    renderLivePreview();
  }

  function renderFieldCard(field, idx, previewHost) {
    var cat = FIELD_BY_TYPE[field.type] || FIELD_BY_TYPE.text;
    var card = el("div", {
      class: "mfe-field-card",
      "data-idx": String(idx),
      draggable: "true",
    });
    // Drag handle + HTML5 drag-and-drop reorder. dragstart stashes
    // the source index; dragover marks the hovered card with an
    // "above" or "below" drop indicator based on cursor Y vs the
    // card's vertical center; drop commits the move.
    var grip = el("div", { class: "mfe-field-drag", title: "Drag to reorder" }, "⋮⋮");
    card.appendChild(grip);
    card.addEventListener("dragstart", function (e) {
      try { e.dataTransfer.setData("text/plain", String(idx)); } catch (_) {}
      e.dataTransfer.effectAllowed = "move";
      card.classList.add("is-dragging");
    });
    card.addEventListener("dragend", function () {
      card.classList.remove("is-dragging");
      clearDropMarks();
    });
    card.addEventListener("dragover", function (e) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      var rect = card.getBoundingClientRect();
      var below = (e.clientY - rect.top) > rect.height / 2;
      clearDropMarks();
      card.classList.add(below ? "is-drop-target-below" : "is-drop-target");
    });
    card.addEventListener("dragleave", function () {
      card.classList.remove("is-drop-target");
      card.classList.remove("is-drop-target-below");
    });
    card.addEventListener("drop", function (e) {
      e.preventDefault();
      var srcIdxRaw = e.dataTransfer.getData("text/plain");
      var srcIdx = parseInt(srcIdxRaw, 10);
      if (isNaN(srcIdx) || srcIdx === idx) { clearDropMarks(); return; }
      var rect = card.getBoundingClientRect();
      var below = (e.clientY - rect.top) > rect.height / 2;
      var dest = idx + (below ? 1 : 0);
      // After splicing out srcIdx, indices shift; clamp accordingly.
      if (srcIdx < dest) dest -= 1;
      var moved = state.fields.splice(srcIdx, 1)[0];
      state.fields.splice(dest, 0, moved);
      clearDropMarks();
      render();
    });
    card.appendChild(el("div", { class: "mfe-field-ico" }, cat.icon));
    var main = el("div", { class: "mfe-field-main" });
    var labelInput = el("input", {
      type: "text", class: "mfe-field-label-input",
      value: field.label || "", placeholder: "Field label",
      maxlength: "80",
    });
    labelInput.addEventListener("input", function () {
      field.label = labelInput.value;
      renderLivePreview();
    });
    main.appendChild(labelInput);
    var meta = el("div", { class: "mfe-field-meta" });
    var typeSelect = el("select", { class: "mfe-field-typepill",
                                      style: "border:0;background:#e2e8f0;color:#334155;cursor:pointer;font:inherit;font-size:10.5px;font-weight:600;padding:1px 7px;border-radius:999px;" });
    FIELD_TYPES.forEach(function (t) {
      var opt = el("option", { value: t.id }, t.icon + "  " + t.label);
      if (t.id === field.type) opt.selected = true;
      typeSelect.appendChild(opt);
    });
    typeSelect.addEventListener("change", function () {
      field.type = typeSelect.value;
      // Re-render the card so the icon updates to the new type.
      var fresh = renderFieldCard(field, idx, previewHost);
      card.parentNode.replaceChild(fresh, card);
      renderLivePreview();
    });
    meta.appendChild(typeSelect);
    var reqBtn = el("button", { type: "button",
                                  class: "mfe-field-req-btn"
                                          + (field.required ? " is-on" : "") },
                     field.required ? "Required" : "Optional");
    reqBtn.addEventListener("click", function () {
      field.required = !field.required;
      reqBtn.textContent = field.required ? "Required" : "Optional";
      reqBtn.classList.toggle("is-on", field.required);
      renderLivePreview();
    });
    meta.appendChild(reqBtn);
    main.appendChild(meta);
    card.appendChild(main);
    var del = el("button", { type: "button", class: "mfe-field-x",
                              title: "Remove field" }, "×");
    del.addEventListener("click", function () {
      state.fields.splice(idx, 1);
      render();  // re-render whole left column to fix indices
    });
    card.appendChild(del);

    // Inline options editor — only for select-type fields. Sits as a
    // full-width row under the card so the chip list has room to wrap
    // without squeezing the rest of the card layout.
    if (field.type === "select") {
      if (!Array.isArray(field.options)) field.options = [];
      var optsRow = el("div", { class: "mfe-opts" });
      var optsHd  = el("div", { class: "mfe-opts-h" }, "Dropdown options");
      optsRow.appendChild(optsHd);
      var chips = el("div", { class: "mfe-opts-chips" });
      function rerenderChips() {
        chips.innerHTML = "";
        field.options.forEach(function (opt, oi) {
          var chip = el("span", { class: "mfe-opt-chip" });
          chip.appendChild(document.createTextNode(opt));
          var x = el("button", { type: "button", class: "mfe-opt-x",
                                  title: "Remove" }, "×");
          x.addEventListener("click", function () {
            field.options.splice(oi, 1);
            rerenderChips();
            renderLivePreview();
          });
          chip.appendChild(x);
          chips.appendChild(chip);
        });
        if (!field.options.length) {
          chips.appendChild(el("span", { class: "mfe-opts-empty" },
            "No options yet — add one →"));
        }
      }
      rerenderChips();
      optsRow.appendChild(chips);
      var addInput = el("input", {
        type: "text", class: "mfe-opt-input",
        placeholder: "Add option (press Enter)",
        maxlength: "80",
      });
      function commitOpt() {
        var v = (addInput.value || "").trim();
        if (!v) return;
        if (field.options.indexOf(v) !== -1) {
          addInput.value = "";
          return;  // dedupe
        }
        field.options.push(v);
        addInput.value = "";
        rerenderChips();
        renderLivePreview();
      }
      addInput.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === ",") {
          e.preventDefault();
          commitOpt();
        } else if (e.key === "Backspace" && !addInput.value && field.options.length) {
          field.options.pop();
          rerenderChips();
          renderLivePreview();
        }
      });
      addInput.addEventListener("paste", function (e) {
        var txt = (e.clipboardData || window.clipboardData).getData("text") || "";
        if (/[,\n]/.test(txt)) {
          e.preventDefault();
          txt.split(/[,\n]+/).forEach(function (piece) {
            var v = piece.trim();
            if (!v || field.options.indexOf(v) !== -1) return;
            field.options.push(v);
          });
          rerenderChips();
          renderLivePreview();
        }
      });
      addInput.addEventListener("blur", function () {
        if (addInput.value.trim()) commitOpt();
      });
      optsRow.appendChild(addInput);
      // Wrap card + options in a single container so they stick
      // together visually and the parent list spacing still works.
      var wrap = el("div", { class: "mfe-field-wrap" });
      wrap.appendChild(card);
      wrap.appendChild(optsRow);
      return wrap;
    }
    return card;
  }

  function buildAddMenu(menu) {
    menu.innerHTML = "";
    menu.appendChild(el("div", { class: "mfe-add-menu-h" }, "Quick add"));
    QUICK_ADD.forEach(function (q) {
      var taken = state.fields.some(function (f) { return f.key === q.key; });
      if (taken) return;
      var btn = el("button", { type: "button", class: "mfe-add-item" });
      btn.appendChild(el("span", null, (FIELD_BY_TYPE[q.type] || {}).icon || "•"));
      btn.appendChild(el("span", null, q.label));
      btn.addEventListener("click", function () {
        addMenuOpen = false;
        menu.classList.remove("is-open");
        state.fields.push({
          key: q.key, label: q.label, type: q.type,
          required: q.key === "email" || q.key === "name",
          options: q.options || undefined,
        });
        render();
      });
      menu.appendChild(btn);
    });
    menu.appendChild(el("div", { class: "mfe-add-menu-h" }, "Or pick a type"));
    FIELD_TYPES.forEach(function (t) {
      var btn = el("button", { type: "button", class: "mfe-add-item" });
      btn.appendChild(el("span", null, t.icon));
      btn.appendChild(el("span", null, t.label));
      btn.addEventListener("click", function () {
        addMenuOpen = false;
        menu.classList.remove("is-open");
        // Generate a fresh key based on the type (fld_text_3 etc).
        var n = state.fields.filter(function (f) { return f.type === t.id; }).length + 1;
        state.fields.push({
          key:   "fld_" + t.id + "_" + n,
          label: t.label,
          type:  t.id,
          required: false,
        });
        render();
      });
      menu.appendChild(btn);
    });
  }

  // Live preview — actual rendered (non-interactive) form.
  // Live form preview (right column) — a read-only mockup of the form
  // the visitor will see, rebuilt from state on every edit.
  function renderLivePreview() {
    var host = livePreviewHost;
    if (!host) return;
    host.innerHTML = "";
    host.appendChild(el("div", { class: "mfe-preview-tag" }, "Live preview"));
    host.appendChild(el("h3", { class: "mfe-preview-title" },
      state.name || "Untitled form"));
    if (!state.fields.length) {
      host.appendChild(el("div",
        { style: "font-size:12px;color:#94a3b8;" },
        "Add a field to see the form preview."));
    }
    state.fields.forEach(function (f) {
      var row = el("div", { class: "mfe-preview-field" });
      var lbl = el("label", { class: "mfe-preview-label" },
        f.label || (FIELD_BY_TYPE[f.type] || {}).label || "Field");
      if (f.required) {
        lbl.appendChild(el("span", { class: "mfe-req-mark" }, "*"));
      }
      row.appendChild(lbl);
      var ctl;
      if (f.type === "textarea" || f.type === "address") {
        ctl = el("textarea", {
          class: "mfe-preview-input mfe-preview-textarea",
          disabled: "disabled", placeholder: f.placeholder || "" });
      } else if (f.type === "select") {
        ctl = el("select", { class: "mfe-preview-input", disabled: "disabled" });
        var opts = f.options || [];
        if (!opts.length) opts = ["Option"];
        opts.forEach(function (o) { ctl.appendChild(el("option", {}, o)); });
      } else {
        var t = f.type === "email" ? "email"
              : f.type === "phone" ? "tel"
              : f.type === "number" ? "number"
              : f.type === "date" ? "date" : "text";
        ctl = el("input", { class: "mfe-preview-input", type: t,
          disabled: "disabled", placeholder: f.placeholder || "" });
      }
      row.appendChild(ctl);
      host.appendChild(row);
    });
    host.appendChild(el("button", { type: "button",
      class: "mfe-preview-submit", disabled: "disabled" }, "Submit"));
  }

  function renderPreview(host) {
    // The visual <form>-tag-style preview was removed per user spec:
    // the editor's job is to edit the form, not show a mockup of
    // what the rendered form will look like. This function now
    // exists only to (re)render the "Other data sent with this form"
    // informational panel below the field editor. It's safe to call
    // multiple times — the panel is idempotent (re-fetches the same
    // /discovered-fields endpoint each time).
    host.innerHTML = "";
    // Discovered fields panel — shows what keys have actually
    // arrived in submissions to this form, so a non-technical user
    // can see "your site sends utm_source / referral_url / etc."
    // and add them as fields with one click without anyone editing
    // FlowBuilder.jsx. Only renders for saved forms (need an id).
    if (state.id) {
      // Per user spec: the form editor's left column shows ONLY the
      // actual declared form fields (state.fields). Any keys that
      // arrive in submissions but aren't declared in the form schema
      // are body-only "extras" (UTM params, referrer URLs, hidden
      // metadata, etc.) — they're shown here as a read-only
      // informational list, NOT as fields-to-promote. No auto-add,
      // no bulk "+ Add all", no per-row "+ Add" CTA — the user
      // explicitly does not want body extras treated as form fields.
      // If they ever want to promote one, they can declare it on
      // their site form and submit; it'll then live in state.fields
      // like any other declared field.
      var disc = el("div", { class: "mfe-discovered" });
      disc.appendChild(el("div", { class: "mfe-disc-h" }, "Other data sent with this form"));
      var discBody = el("div", { class: "mfe-disc-body" });
      discBody.innerHTML = '<div class="mfe-disc-loading">Loading…</div>';
      disc.appendChild(discBody);
      host.appendChild(disc);
      fetch("/me/forms/" + encodeURIComponent(state.id) + "/discovered-fields",
        { credentials: "same-origin" })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (d) {
          discBody.innerHTML = "";
          if (!d || !d.ok) {
            discBody.appendChild(el("div", { class: "mfe-disc-empty" },
              "Couldn't load other-data list."));
            return;
          }
          var subs = (d.submission_count || 0);
          var allFields = d.fields || [];
          // Body-only extras = discovered keys NOT in the form schema.
          var extras = allFields.filter(function (f) { return !f.in_form_schema; });
          if (!subs || !extras.length) {
            discBody.appendChild(el("div", { class: "mfe-disc-empty" },
              "No extra body data yet — once someone submits, any keys "
              + "your site sends that aren't form fields will show up "
              + "here (UTM params, referrer URLs, hidden metadata, etc.)."));
            return;
          }
          discBody.appendChild(el("div", { class: "mfe-disc-meta" },
            subs + " submission" + (subs === 1 ? "" : "s") +
            " · " + extras.length + " extra field" +
            (extras.length === 1 ? "" : "s") +
            " collected alongside your form"));
          extras.forEach(function (f) {
            discBody.appendChild(renderDiscoveredRow(f, false, true));
          });
        })
        .catch(function () {
          discBody.innerHTML = '<div class="mfe-disc-empty">' +
            'Couldn\'t load discovered fields.</div>';
        });

      // Friendly-label / type inference for a single discovered key.
      // Used as the editor's *initial* values — the user can tweak
      // before saving. Pure function, no side effects.
      function guessLabelAndType(f) {
        var key = String(f.key || "");
        var label = key.replace(/[_-]+/g, " ")
          .replace(/\b\w/g, function (c) { return c.toUpperCase(); }).trim();
        var sample = (f.sample_values && f.sample_values[0]) || "";
        var lowerKey = key.toLowerCase();
        var type = "text";
        // Key-name hints first — they're more reliable than sample
        // values, especially when the user's first submission is
        // sparsely filled.
        if (/email|e_mail/.test(lowerKey)) type = "email";
        else if (/phone|tel|mobile|cell/.test(lowerKey)) type = "phone";
        else if (/message|comments?|description|details|notes?/.test(lowerKey)) type = "textarea";
        else if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sample)) type = "email";
        else if (/^[\+\(]?[\d\s().-]{10,}$/.test(sample)) type = "phone";
        else if (sample.length > 80) type = "textarea";
        return { label: label, type: type };
      }

      // readOnly=true → read-only row with no "+ Add to form" button
      // and a neutral pill. Used for the "Other data collected"
      // panel where body-only keys (UTM, referrer, etc.) are shown
      // for visibility but not promoted to form fields.
      function renderDiscoveredRow(f, isLabeled, readOnly) {
        var row = el("div", { class: "mfe-disc-row" +
          (isLabeled ? " is-labeled" : " is-unlabeled") +
          (readOnly ? " is-readonly" : "") });
        var top = el("div", { class: "mfe-disc-row-top" });
        var nameWrap = el("div", { class: "mfe-disc-name-wrap" });
        nameWrap.appendChild(el("code", { class: "mfe-disc-key" }, f.key));
        if (readOnly) {
          nameWrap.appendChild(el("span", { class: "mfe-disc-pill" },
            "x" + (f.appearance_count || 0)));
        } else if (isLabeled) {
          nameWrap.appendChild(el("span", { class: "mfe-disc-pill is-ok" }, "On form"));
        } else {
          nameWrap.appendChild(el("span", { class: "mfe-disc-pill is-new" },
            "New (" + (f.appearance_count || 0) + ")"));
        }
        top.appendChild(nameWrap);
        // Inline editor (hidden by default, revealed on "+ Add" click).
        // Lives in the row so the user can confirm/rename the label +
        // pick a type before promoting the discovered key into a real
        // form field. Saves the user from having to click "Add", scroll
        // to the new field, rename, change type, then come back.
        var editor = null;
        function openEditor() {
          if (editor) return;
          var guess = guessLabelAndType(f);
          editor = el("div", { class: "mfe-disc-editor" });
          var labelInput = el("input", { class: "mfe-disc-editor-label",
                                          type: "text",
                                          placeholder: "Label (what the user sees)" });
          labelInput.value = guess.label;
          var typeSelect = el("select", { class: "mfe-disc-editor-type" });
          [
            ["text",     "Single line text"],
            ["email",    "Email address"],
            ["phone",    "Phone number"],
            ["textarea", "Long message"],
            ["select",   "Dropdown (you pick options)"],
            ["url",      "Website URL"],
            ["number",   "Number"],
          ].forEach(function (pair) {
            var opt = el("option", { value: pair[0] }, pair[1]);
            if (pair[0] === guess.type) opt.selected = true;
            typeSelect.appendChild(opt);
          });
          var requiredWrap = el("label", { class: "mfe-disc-editor-req" });
          var requiredCb = el("input", { type: "checkbox" });
          requiredWrap.appendChild(requiredCb);
          requiredWrap.appendChild(document.createTextNode(" Required"));
          var actions = el("div", { class: "mfe-disc-editor-actions" });
          var saveBtn = el("button", { type: "button",
                                        class: "mfe-disc-editor-save" },
                            "Add this field");
          var cancelBtn = el("button", { type: "button",
                                          class: "mfe-disc-editor-cancel" },
                              "Cancel");
          actions.appendChild(saveBtn);
          actions.appendChild(cancelBtn);
          editor.appendChild(labelInput);
          editor.appendChild(typeSelect);
          editor.appendChild(requiredWrap);
          editor.appendChild(actions);
          row.appendChild(editor);
          setTimeout(function () { labelInput.focus(); labelInput.select(); }, 0);
          cancelBtn.addEventListener("click", function () {
            if (editor && editor.parentNode) editor.remove();
            editor = null;
          });
          // Enter on the label field = save (keyboard-friendly).
          labelInput.addEventListener("keydown", function (e) {
            if (e.key === "Enter") { e.preventDefault(); saveBtn.click(); }
          });
          saveBtn.addEventListener("click", function () {
            var newLabel = labelInput.value.trim() || guess.label;
            var newType  = typeSelect.value || "text";
            state.fields.push({ key: f.key, label: newLabel, type: newType,
                                  required: !!requiredCb.checked });
            render();
          });
        }
        if (!isLabeled && !readOnly) {
          var addBtn = el("button", { type: "button",
                                       class: "mfe-disc-add" }, "+ Add to form");
          addBtn.addEventListener("click", openEditor);
          top.appendChild(addBtn);
        }
        row.appendChild(top);
        if (f.sample_values && f.sample_values.length) {
          var samples = el("div", { class: "mfe-disc-samples" });
          samples.appendChild(document.createTextNode("e.g. "));
          f.sample_values.forEach(function (s, i) {
            if (i > 0) samples.appendChild(document.createTextNode(" · "));
            samples.appendChild(el("span", { class: "mfe-disc-sample" }, s));
          });
          row.appendChild(samples);
        }
        return row;
      }
    }
    // Embed actions live on each row in the Forms table (Share ▾).
  }

  // ─── Network ────────────────────────────────────────────────────
  function fetchById(formId) {
    if (!formId) {
      return Promise.resolve({
        id: "", name: "", slug: "", fields: [
          { key: "name",  label: "Name",  type: "text",  required: true },
          { key: "email", label: "Email", type: "email", required: true },
        ],
      });
    }
    return fetch("/me/forms/" + encodeURIComponent(formId), {
      credentials: "same-origin",
    })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        var f = d && d.form;
        if (!f) throw new Error("not_found");
        return {
          id:     f.id || formId,
          name:   f.name || "",
          slug:   f.slug || "",
          fields: Array.isArray(f.fields) ? f.fields.map(function (x) {
            return Object.assign({}, x);
          }) : [],
        };
      });
  }

  // Last-resort: if state.id is missing or looks like a stale temp
  // marker (tmp_*), try to recover the real server-side id from the
  // localStorage forms cache by matching the slug or name. Prevents
  // Save from accidentally creating a duplicate when the optimistic
  // create's tmp→real swap landed in cache but state was never
  // updated.
  function _recoverIdFromCache() {
    try {
      var raw = localStorage.getItem("my_forms_cache_v1");
      if (!raw) return "";
      var c = JSON.parse(raw);
      var list = (c && c.forms) || [];
      // Prefer slug match (more unique) then name match.
      var match = null;
      if (state.slug) {
        match = list.find(function (f) { return f && f.slug === state.slug && f.id && f.id.indexOf("tmp_") !== 0; });
      }
      if (!match && state.name) {
        var nm = (state.name || "").trim().toLowerCase();
        match = list.find(function (f) {
          return f && (f.name || "").trim().toLowerCase() === nm
                  && f.id && f.id.indexOf("tmp_") !== 0;
        });
      }
      return (match && match.id) ? String(match.id) : "";
    } catch (_) { return ""; }
  }

  function save() {
    if (!state) return;
    if (!state.name || !state.name.trim()) {
      setStatus("Name your form first.", "bad");
      return;
    }
    saveBtn.disabled = true; setStatus("Saving…");
    // If we're editing an optimistically-created form whose POST
    // hasn't returned yet, the id we hold is still "tmp_…" — PATCH
    // against /me/forms/tmp_xxx would 404. Wait for the pending
    // create to resolve, then PATCH with the real id.
    var pending = (typeof state.id === "string" &&
                    state.id.indexOf("tmp_") === 0 &&
                    window.__pendingFormCreates &&
                    window.__pendingFormCreates[state.id]) || null;
    var idReady = pending
      ? pending.then(function (real) {
          if (real && real.id) {
            state.id   = real.id;
            state.slug = real.slug || "";
            try {
              headSub.textContent = "Editing /" + state.slug;
            } catch (_) {}
          }
        })
      : Promise.resolve();
    idReady.then(function () {
      // Defense in depth: if state.id is STILL missing or stale
      // after the pending-resolve, try to recover from cache by
      // slug/name match. This prevents Save from silently falling
      // back to /me/forms (create new) when the user is editing
      // an existing form that's just missing its id binding.
      if (!state.id || state.id.indexOf("tmp_") === 0) {
        var recovered = _recoverIdFromCache();
        if (recovered) {
          console.log("[form-editor] recovered id from cache: " + recovered);
          state.id = recovered;
        } else {
          // Couldn't recover. This is a brand-new form — show a
          // confirm so the user isn't surprised by a duplicate.
          // (No surprise duplicates is the whole point of this guard.)
          if (!window.confirm(
            "Save this as a new form? (No matching existing form found)")) {
            setStatus("Save cancelled.", "");
            saveBtn.disabled = false;
            return;
          }
        }
      }
      _doSave();
    })
    .catch(function () {
      setStatus("Couldn't save — try again.", "bad");
      saveBtn.disabled = false;
    });
  }
  function _doSave() {
    var url = state.id && state.id.indexOf("tmp_") !== 0
      ? "/me/forms/" + encodeURIComponent(state.id)
      : "/me/forms";
    try {
      console.log("[form-editor] save → " + url + "  state.id=" +
                  JSON.stringify(state.id) + "  name=" +
                  JSON.stringify(state.name));
    } catch (_) {}
    fetch(url, {
      method: "POST", credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name:   state.name.trim(),
        fields: state.fields,
        // Saving promotes the form out of draft status. Without this
        // flag, a form created via the Connect-existing-form wizard
        // (or any other draft-creation path) stays "Draft" forever —
        // the PATCH handler in app.py only updates is_draft when the
        // key is present in the body, so send it explicitly.
        is_draft: false,
      }),
    })
      .then(function (r) {
        return r.json().then(function (d) { return { ok: r.ok, body: d }; });
      })
      .then(function (res) {
        if (!res.ok) {
          setStatus("Couldn't save: " + (res.body && res.body.error
                                          || "try again"), "bad");
          saveBtn.disabled = false;
          return;
        }
        setStatus("Saved ✓", "ok");
        saveBtn.disabled = false;
        // If we just created a new form, capture the id so subsequent
        // saves PATCH the same record instead of creating duplicates.
        var savedForm = (res.body && res.body.form) || null;
        if (!state.id && savedForm && savedForm.id) {
          state.id   = savedForm.id;
          state.slug = savedForm.slug || "";
          headSub.textContent = "Editing /" + state.slug;
          deleteBtn.style.display = "";
        }
        // Patch the Forms list cache with the saved record so the
        // table row updates (name / field count / status) instantly
        // when we close, without a loading flash.
        _patchFormCache(savedForm || {
          id:     state.id,
          name:   state.name,
          slug:   state.slug,
          fields: state.fields,
          is_draft: false,
          created_at: new Date().toISOString(),
        });
        broadcast();
        setTimeout(function () {
          if (statusEl.classList.contains("is-ok")) close();
        }, 600);
      })
      .catch(function () {
        setStatus("Network error — try again.", "bad");
        saveBtn.disabled = false;
      });
  }

  function deleteFlow() {
    if (!state || !state.id) return;
    var ok = window.confirm(
      'Delete "' + (state.name || "this form") + '"? This can\'t be undone.');
    if (!ok) return;
    // Optimistic delete: close the modal + remove the form from the
    // cached list IMMEDIATELY so the Forms tab updates in the same
    // frame as the click. Fire the network DELETE in the background.
    // If it fails, restore the form to the cache and refresh.
    var goneId    = state.id;
    var snapshot  = Object.assign({}, state);
    // Strip the form from the localStorage cache + broadcast so the
    // Forms tab re-renders without it.
    try {
      var raw = localStorage.getItem("my_forms_cache_v1");
      if (raw) {
        var c = JSON.parse(raw);
        if (c && Array.isArray(c.forms)) {
          c.forms = c.forms.filter(function (f) { return f && f.id !== goneId; });
          localStorage.setItem("my_forms_cache_v1", JSON.stringify(c));
        }
      }
    } catch (_) {}
    broadcast();
    close();
    fetch("/me/forms/" + encodeURIComponent(goneId), {
      method: "DELETE", credentials: "same-origin",
    })
      .then(function (r) {
        if (!r.ok) throw new Error("delete_failed");
      })
      .catch(function () {
        // Roll back: put the form back into the cache + alert.
        try {
          var raw = localStorage.getItem("my_forms_cache_v1");
          var c = raw ? JSON.parse(raw) : { forms: [] };
          c.forms = c.forms || [];
          if (!c.forms.find(function (f) { return f && f.id === goneId; })) {
            c.forms.unshift(snapshot);
          }
          localStorage.setItem("my_forms_cache_v1", JSON.stringify(c));
        } catch (_) {}
        broadcast();
        alert("Couldn't delete on the server — restored.");
      });
  }

  function broadcast() {
    // Only post the change message — the call sites (create / save /
    // delete) patch the localStorage cache themselves so the Forms
    // tab re-renders the new/changed/removed row instantly. Calling
    // _formsInvalidateCache() here would nuke that careful patch and
    // force a loading-flash on every change.
    try { window.postMessage({ type: "form-editor-changed" }, "*"); }
    catch (_) {}
  }

  // Patch a single form record into the localStorage cache. Used by
  // save() to push edits (name, fields) into the Forms list view
  // before the network round-trip — so the table reflects changes
  // in the same frame as the Save click.
  function _patchFormCache(form) {
    if (!form || !form.id) return;
    try {
      var raw = localStorage.getItem("my_forms_cache_v1");
      var c = raw ? JSON.parse(raw) : { forms: [] };
      c.forms = c.forms || [];
      var found = false;
      c.forms = c.forms.map(function (f) {
        if (f && f.id === form.id) { found = true; return form; }
        return f;
      });
      if (!found) c.forms.unshift(form);
      localStorage.setItem("my_forms_cache_v1", JSON.stringify(c));
    } catch (_) {}
  }

  function setStatus(text, kind) {
    statusEl.textContent = text || "";
    statusEl.className = "mfe-status"
      + (kind === "ok" ? " is-ok" : kind === "bad" ? " is-bad" : "");
  }

  // ─── Public surface ─────────────────────────────────────────────
  function open(form) {
    injectCss();
    buildScaffold();
    state = {
      id:     form && form.id ? String(form.id) : "",
      name:   form && form.name ? String(form.name) : "",
      slug:   form && form.slug ? String(form.slug) : "",
      fields: (form && Array.isArray(form.fields))
                ? form.fields.map(function (f) { return Object.assign({}, f); })
                : [],
    };
    try {
      console.log("[form-editor] open id=" + (state.id || "(new)") +
                  " name=" + JSON.stringify(state.name) +
                  " fields=" + state.fields.length +
                  " from-form-keys=" +
                  (form ? Object.keys(form).join(",") : "(no form)"));
    } catch (_) {}
    overlay.classList.add("is-open");
    setProgress(false);
    render();
  }
  function close() {
    if (overlay) overlay.classList.remove("is-open");
    setProgress(false);
    state = null;
    addMenuOpen = false;
  }
  // Show an empty modal shell + progress bar IMMEDIATELY (in the
  // same tick as the click), so the user always sees a popup
  // appear instantly. The form contents populate when the data
  // is ready — which in the cached path is microseconds, in the
  // network-fetch path is 50-300ms (and that window now shows the
  // progress bar instead of "did the click register?").
  function showShellNow() {
    injectCss();
    buildScaffold();
    overlay.classList.add("is-open");
    headSub.textContent = "Loading…";
    setProgress(true);
    renderLoadingStub();
  }
  // Public open entry. ALWAYS shows the modal shell + loading bar
  // synchronously on the same tick as the click — even when the form
  // data is already in hand from cache. Otherwise the cached path
  // skipped the loading state entirely and the user couldn't tell
  // the click registered until the body painted ~30-50ms later. The
  // shell paints first, then we schedule the actual content render
  // on the next frame so the browser has a chance to draw the
  // loading state before the heavier render runs.
  window.openFormBuilder = function (form) {
    showShellNow();
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(function () {
        open(form);
      });
    } else {
      setTimeout(function () { open(form); }, 0);
    }
  };
  window.openFormBuilderById = function (formId) {
    showShellNow();
    fetchById(formId)
      .then(function (form) {
        // Race guard: bail if the user already closed.
        if (!overlay || !overlay.classList.contains("is-open")) return;
        open(form);
      })
      .catch(function () {
        if (!overlay || !overlay.classList.contains("is-open")) return;
        setProgress(false);
        body.innerHTML =
          '<div class="mfe-empty" style="grid-column:1/-1;">' +
          'Couldn\'t load that form.</div>';
      });
  };
  // Webhook editor was a separate modal in the previous impl. The
  // new editor doesn't ship its own webhook UI yet; expose a stub
  // so any code calling it doesn't NPE.
  window.openFormWebhookModal = function () {
    alert("Webhook editor moved — open the form's settings from " +
          "the canvas Input node.");
  };
  window.deleteFormViaEditor = function (formId) {
    if (!formId) return;
    fetch("/me/forms/" + encodeURIComponent(formId), {
      method: "DELETE", credentials: "same-origin",
    }).then(broadcast).catch(function () {});
  };
})();
