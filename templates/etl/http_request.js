/* http_request.js — modernized HTTP Request activity settings.
 *
 * Replaces the previous flat list of inputs with five collapsible
 * sections (Request, Headers, Body, Pagination, Advanced). Each
 * section header shows a status badge so the user can see config at
 * a glance. Pagination in particular is a guided wizard with five
 * strategies, helper text, and tooltips so non-API-experts can
 * configure it correctly.
 *
 * Saved shape lives under `settings.call = [{ ... }]` for backwards
 * compat with the runtime executor; new fields are added inside the
 * single object. Legacy `pagination_mode` is migrated on load to the
 * new `pagination` shape via `_migrateLegacyPagination`.
 *
 * Slice 1 of the HTTP Request overhaul: the structural rewrite plus
 * most-of-the-way new UX. Subsequent slices polish individual sections.
 */
class Http_Request_Activity extends Activity {
    constructor(flowchart, activity) {
        super(flowchart, activity);
        this.operation_type = "call";
        /* Mutable working copy of the saved settings, normalized into
         * the new shape. Re-rendered into the DOM on every change. */
        this._config = this._readSavedConfig();
        this.settings = this.get_settings_element();
    }

    /* ===================================================================
       Saved-state I/O + legacy migration
       =================================================================== */

    _readSavedConfig() {
        const live = (this.flowchart && typeof this.flowchart.flowchart === "function")
            ? this.flowchart.flowchart("getOperatorActivity", this.activityId)
            : this.activity;
        const candidates = [
            this.activity?.settings?.call,
            this.activity?.properties?.settings?.call,
            live?.settings?.call,
            live?.properties?.settings?.call,
        ];
        let merged = null;
        const sniff_headers = {};
        for (const arr of candidates) {
            if (!Array.isArray(arr) || !arr.length) continue;
            if (!merged) merged = Object.assign({}, arr[0] || {});
            for (const entry of arr) {
                if (entry && entry.header_key) {
                    sniff_headers[entry.header_key] = entry.header_value || "";
                }
            }
        }
        if (!merged) merged = {};
        if (merged.headers && typeof merged.headers === "object") {
            Object.assign(sniff_headers, merged.headers);
        }
        return this._normalizeConfig(merged, sniff_headers);
    }

    _normalizeConfig(saved, headers) {
        const out = Http_Request_Activity.defaults();
        if (saved.url) out.url = String(saved.url);
        if (saved.request_type) out.request_type = String(saved.request_type).toUpperCase();
        if (saved.body != null) out.body = String(saved.body || "");
        if (saved.body_format) out.body_format = String(saved.body_format);
        else if (out.body && this._looksLikeJson(out.body)) out.body_format = "json";
        out.headers = Object.assign({}, headers || {});
        out.pagination = this._migrateLegacyPagination(saved);
        if (typeof saved.timeout_seconds === "number") out.timeout_seconds = saved.timeout_seconds;
        if (typeof saved.follow_redirects === "boolean") out.follow_redirects = saved.follow_redirects;
        if (typeof saved.verify_ssl === "boolean") out.verify_ssl = saved.verify_ssl;
        if (typeof saved.retry === "string") out.retry = saved.retry;
        if (saved.output_path && typeof saved.output_path === "object"
            && (saved.output_path.zone === "raw" || saved.output_path.zone === "processed")) {
            out.output_path = { zone: saved.output_path.zone, path: String(saved.output_path.path || "") };
        }
        return out;
    }

    static defaults() {
        return {
            url: "",
            request_type: "GET",
            body_format: "none",
            body: "",
            headers: {},
            pagination: {
                enabled: false,
                strategy: "offset",
                max_pages: 100,
                delay_ms: 0,
                records_path: "",
                /* offset/limit */
                offset_param: "offset", limit_param: "limit", limit_value: 100,
                stop_when: "empty",
                total_field: "",
                /* page number */
                page_param: "page", page_size_param: "", page_size: 25, first_page: 1,
                has_more_field: "", total_pages_field: "",
                /* cursor */
                cursor_param: "cursor", next_cursor_field: "next_cursor",
                first_request: "no_param", first_cursor_value: "",
                /* link header */
                link_header: "Link", link_rel: "next",
                /* custom field */
                next_url_field: "",
            },
            timeout_seconds: 30,
            follow_redirects: true,
            verify_ssl: true,
            retry: "none",
            output_path: null,
        };
    }

    _migrateLegacyPagination(saved) {
        const base = Http_Request_Activity.defaults().pagination;
        if (saved.pagination && typeof saved.pagination === "object") {
            return Object.assign(base, saved.pagination);
        }
        const mode = saved.pagination_mode;
        if (!mode || mode === "none") {
            return Object.assign(base, { enabled: false });
        }
        const out = Object.assign(base, {
            enabled: true,
            records_path: saved.unroll_by || "",
        });
        if (mode === "offset") {
            return Object.assign(out, {
                strategy: "offset",
                offset_param: saved.offset_param || "offset",
                limit_param: saved.limit_param || "limit",
                limit_value: saved.limit_value ? Number(saved.limit_value) : 100,
                total_field: this._stripJsonPathPrefix(saved.total_rows_property || ""),
                stop_when: saved.total_rows_property ? "total" : "empty",
            });
        }
        if (mode === "continuation") {
            return Object.assign(out, {
                strategy: "cursor",
                cursor_param: saved.continuation_query_param || "cursor",
                next_cursor_field: this._stripJsonPathPrefix(saved.continuation_property || ""),
            });
        }
        if (mode === "next_url") {
            return Object.assign(out, {
                strategy: "custom",
                next_url_field: this._stripJsonPathPrefix(saved.next_page_property || ""),
            });
        }
        return out;
    }

    _stripJsonPathPrefix(p) {
        if (typeof p !== "string") return "";
        return p.replace(/^\$\.?/, "");
    }

    _looksLikeJson(s) {
        if (typeof s !== "string") return false;
        const t = s.trim();
        if (!t) return false;
        return (t[0] === "{" && t[t.length - 1] === "}")
            || (t[0] === "[" && t[t.length - 1] === "]");
    }

    /* ===================================================================
       Tiny DOM helpers
       =================================================================== */

    _el(tag, attrs, children) {
        const node = document.createElement(tag);
        Object.keys(attrs || {}).forEach((k) => {
            const v = attrs[k];
            if (v == null || v === false) return;
            if (k === "class") node.className = v;
            else if (k === "html") node.innerHTML = v;
            else if (k === "text") node.textContent = v;
            else if (k.indexOf("on") === 0 && typeof v === "function") {
                node.addEventListener(k.slice(2).toLowerCase(), v);
            } else if (v === true) node.setAttribute(k, "");
            else node.setAttribute(k, v);
        });
        (children || []).forEach((c) => {
            if (c == null) return;
            node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
        });
        return node;
    }

    _infoTip(text) {
        return this._el("span", {
            class: "hr-info-tip",
            title: text,
            "aria-label": text,
            text: "(?)",
        });
    }

    _helperLine(text) {
        return this._el("div", { class: "hr-helper", text });
    }

    /* ===================================================================
       get_settings_element — the new collapsible-sections layout
       =================================================================== */

    get_settings_element() {
        const root = this._el("div", { id: this.activityId, class: "hr-settings" });

        /* Section: Request */
        const reqDetails = this._el("details", { class: "hr-section hr-section--request", open: true });
        reqDetails.appendChild(this._renderSectionHeader("Request", () => this._reqBadge()));
        reqDetails.appendChild(this._renderRequestBody());
        root.appendChild(reqDetails);

        /* Section: Headers */
        const hdrDetails = this._el("details", { class: "hr-section hr-section--headers" });
        hdrDetails.appendChild(this._renderSectionHeader("Headers", () => this._hdrBadge()));
        hdrDetails.appendChild(this._renderHeadersBody());
        root.appendChild(hdrDetails);

        /* Section: Body */
        const bodyDetails = this._el("details", { class: "hr-section hr-section--body" });
        this._bodyDetailsEl = bodyDetails;
        bodyDetails.appendChild(this._renderSectionHeader("Body", () => this._bodyBadge()));
        bodyDetails.appendChild(this._renderBodyBody());
        root.appendChild(bodyDetails);

        /* Section: Pagination */
        const pgDetails = this._el("details", { class: "hr-section hr-section--pagination" });
        pgDetails.appendChild(this._renderSectionHeader("Pagination", () => this._pgBadge()));
        pgDetails.appendChild(this._renderPaginationBody());
        root.appendChild(pgDetails);

        /* Section: Advanced */
        const advDetails = this._el("details", { class: "hr-section hr-section--advanced" });
        advDetails.appendChild(this._renderSectionHeader("Advanced", () => this._advBadge()));
        advDetails.appendChild(this._renderAdvancedBody());
        root.appendChild(advDetails);

        /* Footer: validation summary + Reset button. */
        const footer = this._el("div", { class: "hr-footer" });
        const validationSummary = this._el("div", { class: "hr-validation-summary" });
        this._validationSummary = validationSummary;
        footer.appendChild(validationSummary);
        const resetBtn = this._el("button", {
            class: "buttons", type: "button", text: "Reset to saved",
            onclick: () => this._resetToSaved(),
        });
        footer.appendChild(resetBtn);
        root.appendChild(footer);
        this._refreshValidation();

        this._applyMethodVisibility();
        return root;
    }

    _renderSectionHeader(label, badgeFn) {
        const summary = this._el("summary", { class: "hr-summary" });
        summary.appendChild(this._el("span", { class: "hr-summary-label", text: label }));
        const badgeEl = this._el("span", { class: "hr-summary-badge" });
        badgeEl.textContent = badgeFn() || "";
        summary._refresh = () => { badgeEl.textContent = badgeFn() || ""; };
        if (!this._badgeRefreshers) this._badgeRefreshers = [];
        this._badgeRefreshers.push(summary._refresh);
        summary.appendChild(badgeEl);
        return summary;
    }

    _refreshBadges() {
        (this._badgeRefreshers || []).forEach((fn) => { try { fn(); } catch (e) { /* */ } });
    }

    _reqBadge() {
        const m = (this._config.request_type || "GET").toUpperCase();
        return m;
    }
    _hdrBadge() {
        const n = Object.keys(this._config.headers || {}).filter((k) => k && this._config.headers[k] != null).length;
        return n ? `(${n})` : "";
    }
    _bodyBadge() {
        const f = this._config.body_format || "none";
        if (f === "none" || !this._bodyApplies()) return "";
        const len = (this._config.body || "").length;
        return `${f.toUpperCase()}, ${this._fmtBytes(len)}`;
    }
    _pgBadge() {
        if (!this._config.pagination?.enabled) return "Disabled";
        const labels = { offset: "Offset/Limit", page: "Page Number", cursor: "Cursor",
                         link: "Link Header", custom: "Custom Field" };
        return labels[this._config.pagination.strategy] || "Enabled";
    }
    _advBadge() {
        const c = this._config;
        const bits = [];
        if (c.timeout_seconds && c.timeout_seconds !== 30) bits.push(`${c.timeout_seconds}s`);
        if (c.retry && c.retry !== "none") bits.push(`retry ${c.retry}`);
        if (c.output_path && c.output_path.zone) bits.push("→ " + c.output_path.zone + "/" + c.output_path.path);
        return bits.length ? bits.join(" · ") : "";
    }
    _fmtBytes(n) {
        if (!n) return "0 B";
        if (n < 1024) return n + " B";
        if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
        return (n / 1024 / 1024).toFixed(1) + " MB";
    }
    _bodyApplies() {
        const m = (this._config.request_type || "GET").toUpperCase();
        return m === "POST" || m === "PUT" || m === "PATCH";
    }

    _applyMethodVisibility() {
        if (this._bodyDetailsEl) {
            const applies = this._bodyApplies();
            this._bodyDetailsEl.style.display = applies ? "" : "none";
        }
    }

    /* ===================================================================
       SECTION: Request
       =================================================================== */

    _renderRequestBody() {
        const wrap = this._el("div", { class: "hr-section-body" });
        const row = this._el("div", { class: "hr-request-row" });

        const methodSel = this._el("select", {
            class: "hr-method select",
            "aria-label": "HTTP method",
            "data-method": this._config.request_type,
            onchange: (ev) => {
                this._config.request_type = ev.target.value;
                methodSel.setAttribute("data-method", this._config.request_type);
                this._applyMethodVisibility();
                this._persist();
            },
        });
        ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"].forEach((m) => {
            const opt = document.createElement("option");
            opt.value = m;
            opt.textContent = m;
            if (m === this._config.request_type) opt.selected = true;
            methodSel.appendChild(opt);
        });

        const urlInput = this._el("input", {
            class: "input hr-url",
            type: "text",
            value: this._config.url,
            placeholder: "https://api.example.com/v1/users",
            spellcheck: "false",
            oninput: (ev) => {
                this._config.url = ev.target.value;
                this._refreshUrlValidation(urlInput, urlHelp);
                this._persist();
            },
        });

        row.appendChild(methodSel);
        row.appendChild(urlInput);
        wrap.appendChild(row);

        const urlHelp = this._el("div", { class: "hr-helper hr-url-help" });
        wrap.appendChild(urlHelp);
        this._refreshUrlValidation(urlInput, urlHelp);

        const hint = this._el("div", { class: "hr-helper hr-helper--quiet" });
        hint.innerHTML = 'Use <code>{{name}}</code> to insert a variable from a previous activity or pipeline parameter (resolved at runtime).';
        wrap.appendChild(hint);

        /* Test Request */
        const testRow = this._el("div", { class: "hr-test-row" });
        const testBtn = this._el("button", {
            class: "buttons", type: "button", text: "+ Test Request",
            title: "Send the configured request once and show the response. Does not save the activity.",
            onclick: () => this._testRequest(testBtn, testOut),
        });
        testRow.appendChild(testBtn);
        wrap.appendChild(testRow);
        const testOut = this._el("div", { class: "hr-test-output", hidden: true });
        wrap.appendChild(testOut);

        return wrap;
    }

    _refreshUrlValidation(input, helpEl) {
        const v = (this._config.url || "").trim();
        let error = "";
        let warn = "";
        if (!v) {
            input.classList.remove("is-error", "is-warn");
            helpEl.textContent = "";
            return;
        }
        try {
            const u = new URL(v.replace(/\{\{[^}]+\}\}/g, "PLACEHOLDER"));
            if (u.protocol === "http:") warn = "URL uses http:// — traffic is unencrypted. Prefer https:// when available.";
            else if (u.protocol !== "https:") warn = "URL protocol is not https — proceed with caution.";
        } catch (e) {
            error = "URL appears malformed.";
        }
        input.classList.toggle("is-error", !!error);
        input.classList.toggle("is-warn", !!warn && !error);
        helpEl.textContent = error || warn || "";
        helpEl.classList.toggle("hr-helper--error", !!error);
        helpEl.classList.toggle("hr-helper--warn", !!warn && !error);
    }

    _testRequest(button, outEl) {
        const url = (this._config.url || "").trim();
        if (!url) {
            outEl.hidden = false;
            outEl.textContent = "Enter a URL first.";
            return;
        }
        const previousLabel = button.textContent;
        button.textContent = "Testing…";
        button.disabled = true;
        outEl.hidden = false;
        outEl.textContent = "Sending request…";
        const headers = Object.assign({}, this._config.headers || {});
        const body = this._bodyApplies() ? (this._config.body || "") : "";
        fetch("/etl/http_request/test", {
            method: "POST",
            headers: new Headers({ "Content-Type": "application/json" }),
            body: JSON.stringify({
                url: url,
                method: this._config.request_type || "GET",
                headers: headers,
                body: body,
                body_format: this._config.body_format,
                timeout_seconds: this._config.timeout_seconds || 30,
                /* Honor the Advanced-section toggles. The activity owns
                 * the policy; the test endpoint just applies it. */
                verify_ssl: this._config.verify_ssl !== false,
                follow_redirects: this._config.follow_redirects !== false,
            }),
        }).then((r) => r.json().catch(() => ({ status: "error", message: "Empty response" })))
          .then((resp) => {
              outEl.innerHTML = "";
              if (resp.status === "error" || resp.error) {
                  outEl.appendChild(this._el("div", { class: "hr-test-status hr-test-status--err",
                      text: "Error: " + (resp.message || resp.error || "Unknown error") }));
              } else {
                  const code = resp.status_code || "?";
                  const ok = code >= 200 && code < 400;
                  outEl.appendChild(this._el("div", {
                      class: "hr-test-status " + (ok ? "hr-test-status--ok" : "hr-test-status--err"),
                      text: "HTTP " + code + " · " + (resp.elapsed_ms || 0) + " ms",
                  }));
                  if (resp.headers) {
                      const hdrPre = this._el("pre", { class: "hr-test-pre",
                          text: Object.keys(resp.headers).map((k) => k + ": " + resp.headers[k]).join("\n") });
                      outEl.appendChild(this._el("details", { class: "hr-test-details" }, [
                          this._el("summary", { text: "Response headers" }),
                          hdrPre,
                      ]));
                  }
                  if (resp.body_preview != null) {
                      outEl.appendChild(this._el("pre", { class: "hr-test-pre", text: String(resp.body_preview) }));
                  }
              }
          }).catch((err) => {
              outEl.innerHTML = "";
              outEl.appendChild(this._el("div", { class: "hr-test-status hr-test-status--err",
                  text: "Network error: " + (err && err.message || err) }));
          }).then(() => {
              button.textContent = previousLabel;
              button.disabled = false;
          });
    }

    /* ===================================================================
       SECTION: Headers
       =================================================================== */

    _renderHeadersBody() {
        const wrap = this._el("div", { class: "hr-section-body hr-headers" });

        const chips = this._el("div", { class: "hr-chips" });
        const QUICK = [
            { name: "Authorization", value: "Bearer {{token}}" },
            { name: "Content-Type", value: "application/json" },
            { name: "Accept", value: "application/json" },
            { name: "User-Agent", value: "MyETLTool/1.0" },
        ];
        QUICK.forEach((q) => {
            chips.appendChild(this._el("button", {
                class: "buttons hr-chip", type: "button", text: "+ " + q.name,
                title: "Add " + q.name + ": " + q.value,
                onclick: () => this._addHeader(q.name, q.value),
            }));
        });
        wrap.appendChild(chips);

        const list = this._el("div", { class: "hr-headers-list" });
        this._headersListEl = list;
        wrap.appendChild(list);
        this._renderHeaderRows();

        const addBtn = this._el("button", {
            class: "buttons hr-headers-add", type: "button", text: "+ Add Header",
            onclick: () => this._addHeader("", ""),
        });
        wrap.appendChild(addBtn);

        wrap.appendChild(this._helperLine("Header values support {{name}} variables, resolved at runtime."));
        return wrap;
    }

    _renderHeaderRows() {
        const list = this._headersListEl;
        if (!list) return;
        list.innerHTML = "";
        const headerKeys = Object.keys(this._config.headers || {});
        headerKeys.forEach((name, idx) => {
            list.appendChild(this._renderHeaderRow(name, this._config.headers[name], idx));
        });
        if (window.jQuery && jQuery.fn && jQuery.fn.sortable) {
            try {
                jQuery(list).sortable({
                    handle: ".hr-header-drag",
                    axis: "y",
                    update: () => this._captureHeaderOrder(),
                });
            } catch (e) { /* not loaded? — skip */ }
        }
    }

    _renderHeaderRow(name, value, idx) {
        const sensitive = this._isSensitiveHeader(name);
        const row = this._el("div", { class: "hr-header-row", "data-idx": String(idx) });
        const drag = this._el("span", { class: "hr-header-drag", title: "Drag to reorder", text: "≡" });
        row.appendChild(drag);

        const nameInput = this._el("input", {
            class: "input hr-header-name", type: "text", value: name || "",
            placeholder: "Header name", list: "hr-header-suggestions",
            oninput: (ev) => {
                const oldName = name;
                const newName = ev.target.value;
                this._renameHeader(oldName, newName, value);
                row.dataset.name = newName;
                row._maskBtn.style.display = this._isSensitiveHeader(newName) ? "" : "none";
            },
        });
        row.appendChild(nameInput);

        const valueInput = this._el("input", {
            class: "input hr-header-value", type: sensitive ? "password" : "text",
            value: value || "", placeholder: "Value (use {{var}} for variables)",
            oninput: (ev) => {
                const currentName = (row.dataset.name != null) ? row.dataset.name : name;
                if (currentName) this._setHeader(currentName, ev.target.value);
            },
        });
        row.dataset.name = name || "";
        row.appendChild(valueInput);

        const maskBtn = this._el("button", {
            class: "buttons hr-header-mask", type: "button", text: "👁",
            title: "Show / hide value",
            onclick: () => {
                valueInput.type = (valueInput.type === "password") ? "text" : "password";
            },
        });
        maskBtn.style.display = sensitive ? "" : "none";
        row._maskBtn = maskBtn;
        row.appendChild(maskBtn);

        const delBtn = this._el("button", {
            class: "buttons hr-header-del", type: "button", text: "×",
            title: "Remove header",
            onclick: () => {
                const currentName = (row.dataset.name != null) ? row.dataset.name : name;
                if (currentName) delete this._config.headers[currentName];
                this._renderHeaderRows();
                this._persist();
            },
        });
        row.appendChild(delBtn);

        return row;
    }

    _addHeader(name, value) {
        if (!this._config.headers) this._config.headers = {};
        if (name) {
            this._config.headers[name] = value || "";
        } else {
            const placeholder = " ".repeat((Object.keys(this._config.headers).filter(k => /^ +$/.test(k)).length) + 1);
            this._config.headers[placeholder] = value || "";
        }
        this._renderHeaderRows();
        this._persist();
    }

    _setHeader(name, value) {
        if (!this._config.headers) this._config.headers = {};
        this._config.headers[name] = value;
        this._persist();
    }

    _renameHeader(oldName, newName, value) {
        if (!this._config.headers) this._config.headers = {};
        if (oldName && oldName in this._config.headers) {
            delete this._config.headers[oldName];
        }
        const trimmed = (newName || "").trim();
        if (trimmed) this._config.headers[trimmed] = value || "";
        this._persist();
    }

    _captureHeaderOrder() {
        if (!this._headersListEl) return;
        const order = {};
        const rows = this._headersListEl.querySelectorAll(".hr-header-row");
        rows.forEach((r) => {
            const name = (r.dataset.name || "").trim();
            if (!name) return;
            const val = r.querySelector(".hr-header-value");
            order[name] = val ? val.value : "";
        });
        this._config.headers = order;
        this._persist();
    }

    _isSensitiveHeader(name) {
        if (!name) return false;
        const lower = String(name).toLowerCase();
        return ["authorization", "x-api-key", "cookie", "x-auth-token", "proxy-authorization"]
            .indexOf(lower) >= 0;
    }

    /* ===================================================================
       SECTION: Body
       =================================================================== */

    _renderBodyBody() {
        const wrap = this._el("div", { class: "hr-section-body hr-body" });

        const formats = ["none", "json", "form", "raw", "graphql"];
        const labels = {
            none: "None",
            json: "JSON",
            form: "Form-encoded",
            raw: "Raw text",
            graphql: "GraphQL",
        };

        const fmtRow = this._el("div", { class: "hr-body-format-row" });
        formats.forEach((f) => {
            const id = this.activityId + "_body_fmt_" + f;
            const inp = this._el("input", {
                type: "radio", name: this.activityId + "_body_fmt", value: f, id,
                onchange: () => {
                    this._config.body_format = f;
                    this._applyAutoContentType();
                    this._renderBodyEditor(editorWrap);
                    this._persist();
                },
            });
            if (this._config.body_format === f) inp.checked = true;
            const lbl = this._el("label", { class: "hr-body-fmt-lbl", "for": id, text: labels[f] });
            fmtRow.appendChild(this._el("span", { class: "hr-body-fmt-opt" }, [inp, lbl]));
        });
        wrap.appendChild(fmtRow);

        const editorWrap = this._el("div", { class: "hr-body-editor-wrap" });
        wrap.appendChild(editorWrap);
        this._renderBodyEditor(editorWrap);

        wrap.appendChild(this._helperLine("Body supports {{name}} variables, resolved at runtime."));
        return wrap;
    }

    _renderBodyEditor(wrap) {
        wrap.innerHTML = "";
        const f = this._config.body_format;
        if (f === "none") {
            wrap.appendChild(this._helperLine("No body sent with this request."));
            return;
        }
        if (f === "form") {
            this._renderFormBody(wrap);
            return;
        }
        if (f === "graphql") {
            this._renderGraphqlBody(wrap);
            return;
        }
        /* json / raw — use a styled textarea (Monaco isn't loaded; CM5
         * is loaded but instantiating one CM per row is overkill for
         * the body). Plain textarea + JSON validation message. */
        const textarea = this._el("textarea", {
            class: "input hr-body-textarea",
            spellcheck: "false",
            placeholder: f === "json"
                ? '{ "key": "value" }'
                : "Plain text body",
            oninput: (ev) => {
                this._config.body = ev.target.value;
                this._refreshBodyValidation(textarea, msg);
                this._refreshBadges();
                this._persist();
            },
        });
        textarea.value = this._config.body || "";
        textarea.rows = 8;
        wrap.appendChild(textarea);
        const msg = this._el("div", { class: "hr-helper hr-body-msg" });
        wrap.appendChild(msg);
        this._refreshBodyValidation(textarea, msg);

        if (f === "json") {
            const fmtBtn = this._el("button", {
                class: "buttons", type: "button", text: "Format",
                onclick: () => {
                    try {
                        const parsed = JSON.parse(this._config.body || "{}");
                        this._config.body = JSON.stringify(parsed, null, 2);
                        textarea.value = this._config.body;
                        this._refreshBodyValidation(textarea, msg);
                        this._persist();
                    } catch (e) { msg.textContent = "Cannot format: " + e.message; msg.classList.add("hr-helper--error"); }
                },
            });
            wrap.appendChild(fmtBtn);
        }
    }

    _refreshBodyValidation(textarea, msg) {
        if (this._config.body_format !== "json") { msg.textContent = ""; msg.classList.remove("hr-helper--error"); return; }
        const v = (this._config.body || "").trim();
        if (!v) { msg.textContent = ""; msg.classList.remove("hr-helper--error"); textarea.classList.remove("is-error"); return; }
        try {
            JSON.parse(v.replace(/\{\{[^}]+\}\}/g, '""'));
            msg.textContent = "";
            msg.classList.remove("hr-helper--error");
            textarea.classList.remove("is-error");
        } catch (e) {
            msg.textContent = "Invalid JSON: " + e.message;
            msg.classList.add("hr-helper--error");
            textarea.classList.add("is-error");
        }
    }

    _renderFormBody(wrap) {
        let parsed = {};
        try {
            const sp = new URLSearchParams(this._config.body || "");
            sp.forEach((v, k) => { parsed[k] = v; });
        } catch (e) { /* */ }
        const list = this._el("div", { class: "hr-form-body-list" });
        const persist = () => {
            const sp = new URLSearchParams();
            Object.keys(parsed).forEach((k) => { if (k) sp.append(k, parsed[k] || ""); });
            this._config.body = sp.toString();
            this._refreshBadges();
            this._persist();
        };
        const renderRows = () => {
            list.innerHTML = "";
            Object.keys(parsed).forEach((k) => {
                const row = this._el("div", { class: "hr-form-row" });
                const keyInp = this._el("input", { class: "input", type: "text", value: k, placeholder: "Key",
                    oninput: (ev) => {
                        const newKey = ev.target.value;
                        const v = parsed[k];
                        delete parsed[k];
                        parsed[newKey] = v;
                        k = newKey;
                        persist();
                    } });
                const valInp = this._el("input", { class: "input", type: "text", value: parsed[k], placeholder: "Value",
                    oninput: (ev) => { parsed[k] = ev.target.value; persist(); } });
                const del = this._el("button", { class: "buttons hr-header-del", type: "button", text: "×",
                    onclick: () => { delete parsed[k]; renderRows(); persist(); } });
                row.appendChild(keyInp); row.appendChild(valInp); row.appendChild(del);
                list.appendChild(row);
            });
            const add = this._el("button", { class: "buttons", type: "button", text: "+ Add field",
                onclick: () => { parsed[""] = ""; renderRows(); persist(); } });
            list.appendChild(add);
        };
        renderRows();
        wrap.appendChild(list);
    }

    _renderGraphqlBody(wrap) {
        let parsed = { query: "", variables: "" };
        try {
            if (this._config.body) {
                const o = JSON.parse(this._config.body);
                if (o && typeof o === "object") {
                    parsed.query = String(o.query || "");
                    parsed.variables = (o.variables == null) ? "" : JSON.stringify(o.variables, null, 2);
                }
            }
        } catch (e) { /* */ }
        const persist = () => {
            const out = { query: parsed.query };
            if (parsed.variables.trim()) {
                try { out.variables = JSON.parse(parsed.variables); }
                catch (e) { out.variables = parsed.variables; }
            }
            this._config.body = JSON.stringify(out, null, 2);
            this._refreshBadges();
            this._persist();
        };
        const qLbl = this._el("label", { class: "label", text: "Query" });
        const qTa = this._el("textarea", { class: "input hr-body-textarea", rows: 6,
            placeholder: "query MyOp { ... }",
            oninput: (ev) => { parsed.query = ev.target.value; persist(); } });
        qTa.value = parsed.query;
        const vLbl = this._el("label", { class: "label", text: "Variables (JSON)" });
        const vTa = this._el("textarea", { class: "input hr-body-textarea", rows: 4,
            placeholder: '{ "id": 123 }',
            oninput: (ev) => { parsed.variables = ev.target.value; persist(); } });
        vTa.value = parsed.variables;
        wrap.appendChild(qLbl); wrap.appendChild(qTa);
        wrap.appendChild(vLbl); wrap.appendChild(vTa);
    }

    _applyAutoContentType() {
        const f = this._config.body_format;
        const ct = {
            json: "application/json",
            form: "application/x-www-form-urlencoded",
            raw: "text/plain",
            graphql: "application/json",
        }[f];
        if (!ct) return;
        const existingKey = Object.keys(this._config.headers || {})
            .find((k) => k.toLowerCase() === "content-type");
        if (!existingKey) {
            this._config.headers = this._config.headers || {};
            this._config.headers["Content-Type"] = ct;
            if (this._headersListEl) this._renderHeaderRows();
        }
    }

    /* ===================================================================
       SECTION: Pagination — guided wizard
       =================================================================== */

    _renderPaginationBody() {
        const wrap = this._el("div", { class: "hr-section-body hr-pagination" });

        const toggleRow = this._el("div", { class: "hr-pg-toggle-row" });
        const offLbl = this._el("label", { class: "hr-pg-toggle" }, [
            this._el("input", { type: "radio", name: this.activityId + "_pg_enabled", value: "off",
                onchange: () => this._setPagination({ enabled: false }) }),
            document.createTextNode(" Disabled (single request)"),
        ]);
        const onLbl = this._el("label", { class: "hr-pg-toggle" }, [
            this._el("input", { type: "radio", name: this.activityId + "_pg_enabled", value: "on",
                onchange: () => this._setPagination({ enabled: true }) }),
            document.createTextNode(" Enabled"),
        ]);
        const setRadioState = () => {
            offLbl.querySelector("input").checked = !this._config.pagination.enabled;
            onLbl.querySelector("input").checked = !!this._config.pagination.enabled;
        };
        setRadioState();
        toggleRow.appendChild(offLbl);
        toggleRow.appendChild(onLbl);
        wrap.appendChild(toggleRow);

        const wizardWrap = this._el("div", { class: "hr-pg-wizard" });
        this._pgWizardWrap = wizardWrap;
        wrap.appendChild(wizardWrap);
        this._renderPaginationWizard();

        return wrap;
    }

    _renderPaginationWizard() {
        const wrap = this._pgWizardWrap;
        if (!wrap) return;
        wrap.innerHTML = "";
        if (!this._config.pagination.enabled) return;

        /* Step 1: strategy cards */
        wrap.appendChild(this._el("div", { class: "hr-pg-step", text: "Step 1 — What kind of pagination does this API use?" }));
        const cards = this._el("div", { class: "hr-pg-cards" });
        const STRATEGIES = [
            { key: "offset", title: "Offset / Limit", desc: "Pages numbered by record offset (e.g. ?offset=0&limit=100 then ?offset=100&limit=100). Common in SQL-style APIs and Eventbrite.",
              example: "GET /api/users?offset=0&limit=100\nGET /api/users?offset=100&limit=100" },
            { key: "page", title: "Page Number", desc: "Pages numbered sequentially (e.g. ?page=1, ?page=2). Common in WordPress, Reddit listings, GitHub search.",
              example: "GET /api/posts?page=1&per_page=25\nGET /api/posts?page=2&per_page=25" },
            { key: "cursor", title: "Cursor", desc: "API returns a token pointing to the next page. Common in Twitter, Slack, Stripe (new), Notion.",
              example: "GET /api/messages\n→ {\"items\": [...], \"next_cursor\": \"abc123\"}\nGET /api/messages?cursor=abc123" },
            { key: "link", title: "Link Header", desc: "API returns a Link: <url>; rel=\"next\" header with the next page's full URL. Common in GitHub, GitLab, RFC 5988 APIs.",
              example: "GET /api/issues\n→ Link: <…?page=2>; rel=\"next\", <…?page=10>; rel=\"last\"" },
            { key: "custom", title: "Custom Field", desc: "The next page is in a custom field of the response (e.g. {\"meta\": {\"next_url\": \"…\"}}). Use this when none of the above fit.",
              example: "GET /api/feed\n→ {\"data\": [...], \"meta\": {\"next_url\": \"https://…/feed?after=42\"}}" },
        ];
        STRATEGIES.forEach((s) => {
            const selected = this._config.pagination.strategy === s.key;
            const card = this._el("label", { class: "hr-pg-card" + (selected ? " is-selected" : "") });
            const radio = this._el("input", {
                type: "radio", name: this.activityId + "_pg_strategy", value: s.key,
                onchange: () => this._setPagination({ strategy: s.key }),
            });
            if (selected) radio.checked = true;
            card.appendChild(radio);
            const body = this._el("div", { class: "hr-pg-card-body" });
            body.appendChild(this._el("div", { class: "hr-pg-card-title", text: s.title }));
            body.appendChild(this._el("div", { class: "hr-pg-card-desc", text: s.desc }));
            const ex = this._el("details", { class: "hr-pg-card-example" });
            ex.appendChild(this._el("summary", { text: "Show example" }));
            ex.appendChild(this._el("pre", { class: "hr-pg-card-code", text: s.example }));
            body.appendChild(ex);
            card.appendChild(body);
            cards.appendChild(card);
        });
        wrap.appendChild(cards);

        /* Step 2: strategy-specific fields */
        wrap.appendChild(this._el("div", { class: "hr-pg-step", text: "Step 2 — Configure the strategy" }));
        const fieldsWrap = this._el("div", { class: "hr-pg-fields" });
        wrap.appendChild(fieldsWrap);
        this._renderPaginationFields(fieldsWrap);

        /* Step 3: safety limits */
        wrap.appendChild(this._el("div", { class: "hr-pg-step", text: "Step 3 — Safety limits (always shown)" }));
        wrap.appendChild(this._renderField("Max pages", String(this._config.pagination.max_pages || 100), "100",
            "Hard cap on number of pages fetched. Prevents runaway loops if the API misbehaves. The activity stops with a warning if this is reached.",
            (v) => this._setPagination({ max_pages: Math.max(1, parseInt(v, 10) || 100) }),
            "Even if the API keeps returning more pages, stop after this many. Default 100 is safe for most workloads. Increase only if you've verified the API's total page count.",
            "number"));
        wrap.appendChild(this._renderField("Delay between pages (ms)", String(this._config.pagination.delay_ms || 0), "0",
            "Wait this many milliseconds between requests. Use this to avoid rate limits. Common values: 100–500ms for well-behaved APIs, 1000+ for strict ones.",
            (v) => this._setPagination({ delay_ms: Math.max(0, parseInt(v, 10) || 0) }),
            null, "number"));
        wrap.appendChild(this._renderField("Records collection field", this._config.pagination.records_path || "", "auto-detect",
            "Where in the response body the array of records is located. Leave empty to auto-detect the first array. Set explicitly for nested responses like 'data.items' or 'response.records'.",
            (v) => this._setPagination({ records_path: v }),
            "Most APIs put records under a key like 'data', 'items', 'results', or 'records'. The activity concatenates these arrays across all pages."));
    }

    _renderPaginationFields(wrap) {
        wrap.innerHTML = "";
        const p = this._config.pagination;
        const set = (patch) => this._setPagination(patch);
        if (p.strategy === "offset") {
            wrap.appendChild(this._renderField("Offset parameter name", p.offset_param, "offset",
                "The query parameter that tells the API how many records to skip. Often 'offset', 'start', or 'skip'.",
                (v) => set({ offset_param: v })));
            wrap.appendChild(this._renderField("Limit parameter name", p.limit_param, "limit",
                "The query parameter for page size. Often 'limit', 'per_page', or 'page_size'.",
                (v) => set({ limit_param: v })));
            wrap.appendChild(this._renderField("Page size", String(p.limit_value || 100), "100",
                "How many records per page. Most APIs allow 50–200. Check the API's documentation for the maximum.",
                (v) => set({ limit_value: Math.max(1, parseInt(v, 10) || 100) }),
                null, "number"));
            wrap.appendChild(this._renderRadioGroup("Stop when", [
                { value: "empty", label: "Response is empty" },
                { value: "short_page", label: "Records returned < page size" },
                { value: "total", label: "Total count field reached" },
            ], p.stop_when || "empty", (v) => set({ stop_when: v }),
                "How the activity decides there are no more pages. 'Empty response' is safest. 'Records < page size' is faster but assumes the API doesn't return partial pages mid-collection. 'Total count' requires the API to return a total — specify the field below."));
            if ((p.stop_when || "empty") === "total") {
                wrap.appendChild(this._renderField("Total count field", p.total_field, "meta.total",
                    "Path to the total record count in the response (e.g. 'meta.total' for {meta: {total: 5000}}).",
                    (v) => set({ total_field: v })));
            }
        } else if (p.strategy === "page") {
            wrap.appendChild(this._renderField("Page parameter name", p.page_param, "page",
                "The query parameter for page number. Often 'page' or 'p'.",
                (v) => set({ page_param: v })));
            wrap.appendChild(this._renderField("Page size parameter (optional)", p.page_size_param, "per_page",
                "The parameter that controls page size, if the API supports it. Leave blank if the API doesn't accept a size parameter.",
                (v) => set({ page_size_param: v }),
                "Some APIs (like Reddit) have a fixed page size and ignore size parameters. Leave blank in that case."));
            wrap.appendChild(this._renderField("Page size", String(p.page_size || 25), "25",
                "How many records per page.",
                (v) => set({ page_size: Math.max(1, parseInt(v, 10) || 25) }),
                null, "number"));
            wrap.appendChild(this._renderRadioGroup("First page number", [
                { value: 1, label: "1" }, { value: 0, label: "0" },
            ], p.first_page === 0 ? 0 : 1, (v) => set({ first_page: v ? 1 : 0 }),
                "Most APIs start counting at page 1. A few use page 0."));
            wrap.appendChild(this._renderRadioGroup("Stop when", [
                { value: "empty", label: "Response is empty" },
                { value: "short_page", label: "Records returned < page size" },
                { value: "has_more", label: "'Has more' field is false" },
                { value: "total_pages", label: "Total pages field reached" },
            ], p.stop_when || "empty", (v) => set({ stop_when: v })));
            if (p.stop_when === "has_more") {
                wrap.appendChild(this._renderField("Has-more field", p.has_more_field, "has_more",
                    "Path to a boolean field indicating more pages (e.g. 'has_more' or 'pagination.has_next').",
                    (v) => set({ has_more_field: v })));
            }
            if (p.stop_when === "total_pages") {
                wrap.appendChild(this._renderField("Total pages field", p.total_pages_field, "meta.total_pages",
                    "Path to a field with the total page count.", (v) => set({ total_pages_field: v })));
            }
        } else if (p.strategy === "cursor") {
            wrap.appendChild(this._renderField("Cursor parameter name", p.cursor_param, "cursor",
                "The query parameter that accepts the cursor for the next page. Often 'cursor', 'next', or 'after'.",
                (v) => set({ cursor_param: v })));
            wrap.appendChild(this._renderField("Next-cursor field in response", p.next_cursor_field, "next_cursor",
                "Path to the cursor in the response body (e.g. 'next_cursor', 'meta.next', 'pagination.cursors.after').",
                (v) => set({ next_cursor_field: v })));
            wrap.appendChild(this._renderRadioGroup("First request behavior", [
                { value: "no_param", label: "Don't send cursor" },
                { value: "empty", label: "Send empty string" },
                { value: "custom", label: "Send custom value" },
            ], p.first_request || "no_param", (v) => set({ first_request: v }),
                "How to make the very first request, before any cursor exists. Most APIs want no cursor param at all. Some want an empty string. Some want a specific value like 'start'. Check the API docs."));
            if (p.first_request === "custom") {
                wrap.appendChild(this._renderField("Initial cursor value", p.first_cursor_value, "",
                    "The literal string sent as the cursor on the very first request.",
                    (v) => set({ first_cursor_value: v })));
            }
            wrap.appendChild(this._renderRadioGroup("Stop when", [
                { value: "empty_cursor", label: "Cursor is null/missing" },
                { value: "same_cursor", label: "Cursor equals previous cursor" },
                { value: "empty", label: "Response is empty" },
            ], p.stop_when || "empty_cursor", (v) => set({ stop_when: v })));
        } else if (p.strategy === "link") {
            wrap.appendChild(this._renderField("Link header name", p.link_header, "Link",
                "Header containing pagination links. Standard is 'Link' per RFC 5988.",
                (v) => set({ link_header: v })));
            wrap.appendChild(this._renderField("Relation for next page", p.link_rel, "next",
                "The 'rel' value identifying the next page. Almost always 'next'.",
                (v) => set({ link_rel: v })));
            wrap.appendChild(this._helperLine("No additional fields needed. The activity follows the next URL until no Link header with the configured rel is returned."));
        } else if (p.strategy === "custom") {
            wrap.appendChild(this._renderField("Next-page URL field", p.next_url_field, "meta.next_url",
                "Path in the response body containing the URL for the next page (full URL, not relative).",
                (v) => set({ next_url_field: v })));
            wrap.appendChild(this._renderRadioGroup("Stop when", [
                { value: "missing", label: "Field is null/missing" },
                { value: "same_url", label: "Field equals previous value" },
                { value: "empty", label: "Response is empty" },
            ], p.stop_when || "missing", (v) => set({ stop_when: v })));
        }
    }

    _renderField(label, value, placeholder, helper, onchange, tooltip, type) {
        const field = this._el("div", { class: "field hr-field" });
        const labelRow = this._el("div", { class: "hr-field-label-row" });
        labelRow.appendChild(this._el("label", { class: "label", text: label }));
        if (tooltip) labelRow.appendChild(this._infoTip(tooltip));
        field.appendChild(labelRow);
        const input = this._el("input", {
            class: "input", type: type || "text",
            value: (value == null ? "" : String(value)),
            placeholder: placeholder || "",
            oninput: (ev) => onchange(ev.target.value),
        });
        field.appendChild(input);
        if (helper) field.appendChild(this._helperLine(helper));
        return field;
    }

    _renderRadioGroup(label, options, current, onchange, tooltip) {
        const field = this._el("div", { class: "field hr-field hr-radio-field" });
        const labelRow = this._el("div", { class: "hr-field-label-row" });
        labelRow.appendChild(this._el("label", { class: "label", text: label }));
        if (tooltip) labelRow.appendChild(this._infoTip(tooltip));
        field.appendChild(labelRow);
        const group = this._el("div", { class: "hr-radio-group" });
        const groupName = this.activityId + "_radio_" + Math.random().toString(16).slice(2, 8);
        options.forEach((o) => {
            const id = groupName + "_" + String(o.value);
            const inp = this._el("input", {
                type: "radio", name: groupName, value: String(o.value), id,
                onchange: () => onchange(o.value),
            });
            if (String(current) === String(o.value)) inp.checked = true;
            group.appendChild(this._el("label", { class: "hr-radio-opt", "for": id }, [inp, document.createTextNode(" " + o.label)]));
        });
        field.appendChild(group);
        return field;
    }

    _setPagination(patch) {
        this._config.pagination = Object.assign({}, this._config.pagination, patch || {});
        this._renderPaginationWizard();
        this._refreshBadges();
        this._persist();
    }

    /* ===================================================================
       SECTION: Advanced
       =================================================================== */

    _renderAdvancedBody() {
        const wrap = this._el("div", { class: "hr-section-body hr-advanced" });
        wrap.appendChild(this._renderField("Timeout (seconds)", String(this._config.timeout_seconds || 30), "30",
            "Maximum time to wait for a response. The activity fails if the server doesn't respond within this window.",
            (v) => { this._config.timeout_seconds = Math.max(1, parseInt(v, 10) || 30); this._persist(); },
            null, "number"));

        wrap.appendChild(this._renderToggle("Follow redirects", !!this._config.follow_redirects,
            (v) => { this._config.follow_redirects = v; this._persist(); }));

        wrap.appendChild(this._renderToggle("Verify SSL certificates", !!this._config.verify_ssl,
            (v) => { this._config.verify_ssl = v; this._persist(); },
            "Disable only for self-signed certificates in dev environments. In production, leave on."));

        wrap.appendChild(this._renderRadioGroup("Retry on error", [
            { value: "none", label: "No retries" },
            { value: "3", label: "3 retries" },
            { value: "5", label: "5 retries" },
        ], this._config.retry || "none", (v) => { this._config.retry = String(v); this._persist(); },
            "Retries on 5xx and connection errors with exponential backoff. 4xx errors are not retried."));

        /* Output destination — PathPicker for the file the response goes to. */
        const outField = this._el("div", { class: "field hr-field" });
        outField.appendChild(this._el("div", { class: "hr-field-label-row" }, [
            this._el("label", { class: "label", text: "Save response to (optional)" }),
            this._infoTip("Where in blob storage to save the final response. Leave unset to keep the response in-memory only."),
        ]));
        if (typeof window.createPathPicker === "function") {
            const picker = window.createPathPicker({
                value: this._config.output_path,
                placeholder: "Pick a destination file…",
                selectMode: "file",
                fileExtensions: ["json", "csv", "jsonl"],
                rootZones: ["raw", "processed"],
                onChange: (v) => { this._config.output_path = v || null; this._refreshBadges(); this._persist(); },
            });
            outField.appendChild(picker.element);
        } else {
            outField.appendChild(this._el("div", { class: "hr-helper hr-helper--quiet", text: "Path picker not loaded — save destination unavailable." }));
        }
        wrap.appendChild(outField);

        return wrap;
    }

    _renderToggle(label, current, onchange, tooltip) {
        const id = this.activityId + "_t_" + Math.random().toString(16).slice(2, 8);
        const wrap = this._el("div", { class: "field hr-field hr-toggle-field" });
        const inner = this._el("div", { class: "hr-toggle-row" });
        const inp = this._el("input", { type: "checkbox", id, class: "hr-toggle-input",
            onchange: (ev) => onchange(!!ev.target.checked) });
        if (current) inp.checked = true;
        const lbl = this._el("label", { class: "hr-toggle-label", "for": id, text: label });
        inner.appendChild(inp);
        inner.appendChild(lbl);
        if (tooltip) inner.appendChild(this._infoTip(tooltip));
        wrap.appendChild(inner);
        return wrap;
    }

    /* ===================================================================
       Persistence — write through to flowchart settings + autosave
       =================================================================== */

    _persist() {
        const c = this._config;
        const entry = {
            url: c.url || "",
            request_type: c.request_type || "GET",
            body_format: c.body_format || "none",
            body: c.body || "",
            headers: Object.assign({}, c.headers || {}),
            pagination: Object.assign({}, c.pagination || {}),
            timeout_seconds: c.timeout_seconds || 30,
            follow_redirects: c.follow_redirects !== false,
            verify_ssl: c.verify_ssl !== false,
            retry: c.retry || "none",
            output_path: c.output_path || null,
            /* Backwards-compat hints for the existing executor — keep
             * the legacy flat fields in sync so the old runtime path
             * still works while we land Slice 6 (new runtime). */
            pagination_mode: this._legacyModeFor(c.pagination),
            unroll_by: c.pagination?.records_path || "",
            next_page_property: c.pagination?.strategy === "custom" ? (c.pagination.next_url_field || "") : "",
            continuation_property: c.pagination?.strategy === "cursor" ? (c.pagination.next_cursor_field || "") : "",
            continuation_query_param: c.pagination?.strategy === "cursor" ? (c.pagination.cursor_param || "") : "",
            offset_param: c.pagination?.strategy === "offset" ? (c.pagination.offset_param || "") : "",
            limit_param: c.pagination?.strategy === "offset" ? (c.pagination.limit_param || "") : "",
            limit_value: c.pagination?.strategy === "offset" ? (c.pagination.limit_value || "") : "",
            total_rows_property: c.pagination?.strategy === "offset" ? (c.pagination.total_field || "") : "",
        };
        const settings = { call: [entry] };
        if (this.flowchart && typeof this.flowchart.flowchart === "function") {
            this.flowchart.flowchart("setSettings", this.activityId, settings);
        }
        this._refreshBadges();
        this._refreshValidation();
        if (typeof window.flowchartSchedulePipelineSave === "function") {
            window.flowchartSchedulePipelineSave();
        }
    }

    _validateConfig() {
        const issues = [];
        const c = this._config;
        const url = (c.url || "").trim();
        if (!url) {
            issues.push("URL is required.");
        } else {
            try { new URL(url.replace(/\{\{[^}]+\}\}/g, "PLACEHOLDER")); }
            catch (e) { issues.push("URL appears malformed."); }
        }
        if (c.body_format === "json" && this._bodyApplies()) {
            const v = (c.body || "").trim();
            if (v) {
                try { JSON.parse(v.replace(/\{\{[^}]+\}\}/g, '""')); }
                catch (e) { issues.push("Body is not valid JSON."); }
            }
        }
        if (c.pagination?.enabled) {
            const p = c.pagination;
            if (p.strategy === "offset") {
                if (!p.offset_param) issues.push("Pagination: offset parameter name is required.");
                if (!p.limit_param)  issues.push("Pagination: limit parameter name is required.");
                if (!p.limit_value || p.limit_value < 1) issues.push("Pagination: page size must be ≥ 1.");
                if (p.stop_when === "total" && !p.total_field) issues.push("Pagination: total count field is required when stop=Total count.");
            } else if (p.strategy === "page") {
                if (!p.page_param) issues.push("Pagination: page parameter name is required.");
                if (p.stop_when === "has_more" && !p.has_more_field) issues.push("Pagination: has-more field is required.");
                if (p.stop_when === "total_pages" && !p.total_pages_field) issues.push("Pagination: total pages field is required.");
            } else if (p.strategy === "cursor") {
                if (!p.cursor_param) issues.push("Pagination: cursor parameter name is required.");
                if (!p.next_cursor_field) issues.push("Pagination: next-cursor field path is required.");
            } else if (p.strategy === "link") {
                if (!p.link_header) issues.push("Pagination: link header name is required.");
                if (!p.link_rel) issues.push("Pagination: rel value is required.");
            } else if (p.strategy === "custom") {
                if (!p.next_url_field) issues.push("Pagination: next-page URL field path is required.");
            }
        }
        return issues;
    }

    _refreshValidation() {
        if (!this._validationSummary) return;
        const issues = this._validateConfig();
        const root = this._validationSummary;
        root.innerHTML = "";
        if (!issues.length) {
            root.classList.remove("is-active");
            return;
        }
        root.classList.add("is-active");
        root.appendChild(this._el("strong", { text: "Configuration issues:" }));
        const ul = this._el("ul", { class: "hr-validation-list" });
        issues.forEach((m) => ul.appendChild(this._el("li", { text: m })));
        root.appendChild(ul);
    }

    _legacyModeFor(p) {
        if (!p || !p.enabled) return "none";
        if (p.strategy === "offset") return "offset";
        if (p.strategy === "cursor") return "continuation";
        if (p.strategy === "custom") return "next_url";
        if (p.strategy === "link" || p.strategy === "page") return p.strategy; /* new modes */
        return "none";
    }

    /* Re-enter point used by run.js when refresh-preview wants the
     * latest panel state. We just re-assert what we already have. */
    get_operation_settings() {
        this._persist();
        const live = this.flowchart && typeof this.flowchart.flowchart === "function"
            ? this.flowchart.flowchart("getOperatorActivity", this.activityId) : null;
        return (live && live.settings) ? live.settings : { call: [Object.assign({}, this._config)] };
    }

    _resetToSaved() {
        this._config = this._readSavedConfig();
        const newDom = this.get_settings_element();
        if (this.settings && this.settings.parentNode) {
            this.settings.parentNode.replaceChild(newDom, this.settings);
        }
        this.settings = newDom;
    }
}

window.Http_Request_Activity = Http_Request_Activity;
