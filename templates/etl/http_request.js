class Http_Request_Activity extends Activity {
    constructor(flowchart, activity) {
        super(flowchart, activity)
        this.operation_type = "call"
        this.settings = this.get_settings_element()
        this._allow_header_fallback = false
    }

    _get_saved_call_settings() {
        const live_activity = this.flowchart && typeof this.flowchart.flowchart === "function"
            ? this.flowchart.flowchart("getOperatorActivity", this.activityId)
            : this.activity
        const candidates = [
            this.activity?.settings?.call,
            this.activity?.properties?.settings?.call,
            live_activity?.settings?.call,
            live_activity?.properties?.settings?.call
        ]
        if (this.flowchart && typeof this.flowchart.flowchart === "function") {
            const data_ref = this.flowchart.flowchart("getDataRef")
            const ref_call = data_ref?.operators?.[this.activityId]?.properties?.settings?.call
            if (Array.isArray(ref_call)) {
                candidates.push(ref_call)
            }
        }
        for (const entry of candidates) {
            if (Array.isArray(entry) && entry.length) {
                return entry
            }
        }
        return null
    }

    _get_saved_headers_fallback() {
        const live_activity = this.flowchart && typeof this.flowchart.flowchart === "function"
            ? this.flowchart.flowchart("getOperatorActivity", this.activityId)
            : this.activity
        const candidates = [
            this.activity?.settings?.call,
            this.activity?.properties?.settings?.call,
            live_activity?.settings?.call,
            live_activity?.properties?.settings?.call
        ]
        if (this.flowchart && typeof this.flowchart.flowchart === "function") {
            const data_ref = this.flowchart.flowchart("getDataRef")
            const ref_call = data_ref?.operators?.[this.activityId]?.properties?.settings?.call
            if (Array.isArray(ref_call)) {
                candidates.push(ref_call)
            }
        }
        for (const entry of candidates) {
            if (Array.isArray(entry) && entry[0] && typeof entry[0].headers === "object") {
                return entry[0].headers
            }
        }
        return null
    }

    _append_header_rows(headers, columns_div) {
        if (!headers || typeof headers !== "object") {
            return 0
        }
        let count = 0
        Object.keys(headers).forEach(header_key => {
            this._add_column(null, this.flowchart, this, { suppress_save: true })
            const rows = columns_div.querySelectorAll(".select-column-row")
            const row = rows[rows.length - 1]
            if (!row) {
                return
            }
            const key_input = row.querySelector("input[name='header_key']")
            const value_input = row.querySelector("input[name='header_value']")
            if (key_input) {
                key_input.value = header_key
            }
            if (value_input) {
                value_input.value = headers[header_key]
            }
            count++
        })
        return count
    }

    _restore_saved_settings() {
        const columns_div = document.getElementById(this.activityId + "_column_edit")
        if (!columns_div) {
            return
        }
        const existing = columns_div.querySelector("input[name='header_key']")
        if (existing) {
            return
        }
        const saved_settings = this._get_saved_call_settings()
        const base = Array.isArray(saved_settings) ? (saved_settings[0] || {}) : {}
        if (base.headers && typeof base.headers === "object" && Object.keys(base.headers).length > 0) {
            this._append_header_rows(base.headers, columns_div)
        }
        this._allow_header_fallback = false
    }

    get_settings_element() {
        let div = document.createElement('div')
        div.id = this.activityId

        let columns_div = document.createElement('div')
        columns_div.id = this.activityId + "_column_edit"
        columns_div.className = "column-settings"

        const actions = document.createElement('div')
        actions.className = "column-settings-actions"
        let add_button = document.createElement("button")
        add_button.innerHTML = "+ Add Header"
        add_button.className = 'buttons add-button'
        add_button.addEventListener("click", (event) => this._add_column(event, this.flowchart, this))
        actions.appendChild(add_button)

        const base_wrapper = document.createElement("div")
        base_wrapper.className = "select-column-row"
        const base_row = document.createElement("div")
        base_row.className = "rename_settings"
        base_row.style.gridTemplateColumns = "minmax(240px, 1.4fr) minmax(120px, 0.6fr)"

        const url_input = document.createElement('input')
        url_input.type = 'text'
        url_input.name = 'url'
        url_input.placeholder = 'https://api.example.com'
        url_input.addEventListener("change", (event) => this._on_input_change(event, this.flowchart, this))
        base_row.appendChild(url_input)

        const method_select = document.createElement('select')
        method_select.name = 'request_type'
        ;["GET", "POST", "PUT", "PATCH", "DELETE"].forEach(method => {
            let option = document.createElement('option')
            option.value = method
            option.textContent = method
            method_select.appendChild(option)
        })
        method_select.addEventListener("change", (event) => this._on_selector_change(event, this.flowchart, this))
        base_row.appendChild(method_select)
        base_wrapper.appendChild(base_row)
        columns_div.appendChild(base_wrapper)

        const body_wrapper = document.createElement("div")
        body_wrapper.className = "select-column-row"
        const body_row = document.createElement("div")
        body_row.className = "rename_settings"
        body_row.style.gridTemplateColumns = "minmax(320px, 1fr)"

        const body_input = document.createElement('textarea')
        body_input.name = 'body'
        body_input.placeholder = 'Request body (JSON or text)'
        body_input.rows = 5
        body_input.style.resize = "vertical"
        body_input.addEventListener("change", (event) => this._on_input_change(event, this.flowchart, this))
        body_row.appendChild(body_input)
        body_wrapper.appendChild(body_row)
        columns_div.appendChild(body_wrapper)

        const pagination_header = document.createElement("div")
        pagination_header.textContent = "Pagination"
        pagination_header.style.fontSize = "12px"
        pagination_header.style.fontWeight = "600"
        pagination_header.style.color = "#6b7280"
        pagination_header.style.padding = "6px 2px 2px"
        columns_div.appendChild(pagination_header)

        const pagination_wrapper = document.createElement("div")
        pagination_wrapper.className = "select-column-row"
        const pagination_row = document.createElement("div")
        pagination_row.className = "rename_settings"
        pagination_row.style.gridTemplateColumns = "minmax(200px, 1fr)"
        const pagination_select = document.createElement("select")
        pagination_select.name = "pagination_mode"
        ;[
            { value: "none", label: "None" },
            { value: "next_url", label: "Next page URL property" },
            { value: "continuation", label: "Continuation token" },
            { value: "offset", label: "Offset (total rows + limit)" }
        ].forEach(item => {
            const option = document.createElement("option")
            option.value = item.value
            option.textContent = item.label
            pagination_select.appendChild(option)
        })
        pagination_select.addEventListener("change", (event) => {
            update_pagination_visibility()
            this._on_selector_change(event, this.flowchart, this)
        })
        pagination_row.appendChild(pagination_select)
        pagination_wrapper.appendChild(pagination_row)
        columns_div.appendChild(pagination_wrapper)
        const pagination_help = document.createElement("div")
        pagination_help.innerHTML = "<strong>Required:</strong> choose how to fetch additional pages. <strong>Optional:</strong> leave as None for single-page requests."
        pagination_help.style.fontSize = "12px"
        pagination_help.style.color = "#6b7280"
        pagination_help.style.margin = "-4px 0 6px 2px"
        columns_div.appendChild(pagination_help)

        const unroll_wrapper = document.createElement("div")
        unroll_wrapper.className = "select-column-row"
        const unroll_row = document.createElement("div")
        unroll_row.className = "rename_settings"
        unroll_row.style.gridTemplateColumns = "minmax(280px, 1fr)"
        const unroll_input = document.createElement("input")
        unroll_input.type = "text"
        unroll_input.name = "unroll_by"
        unroll_input.placeholder = "Records property (e.g. attendees)"
        unroll_input.addEventListener("change", (event) => this._on_input_change(event, this.flowchart, this))
        unroll_row.appendChild(unroll_input)
        unroll_wrapper.appendChild(unroll_row)
        columns_div.appendChild(unroll_wrapper)
        const unroll_help = document.createElement("div")
        unroll_help.innerHTML = "<strong>Required:</strong> list property holding records, e.g. <strong>attendees</strong>."
        unroll_help.style.fontSize = "12px"
        unroll_help.style.color = "#6b7280"
        unroll_help.style.margin = "-4px 0 6px 2px"
        columns_div.appendChild(unroll_help)

        const next_url_wrapper = document.createElement("div")
        next_url_wrapper.className = "select-column-row"
        const next_url_row = document.createElement("div")
        next_url_row.className = "rename_settings"
        next_url_row.style.gridTemplateColumns = "minmax(280px, 1fr)"
        const next_url_input = document.createElement("input")
        next_url_input.type = "text"
        next_url_input.name = "next_page_property"
        next_url_input.placeholder = "Next page URL property (e.g. paging.next)"
        next_url_input.addEventListener("change", (event) => this._on_input_change(event, this.flowchart, this))
        next_url_row.appendChild(next_url_input)
        next_url_wrapper.appendChild(next_url_row)
        columns_div.appendChild(next_url_wrapper)
        const next_url_help = document.createElement("div")
        next_url_help.innerHTML = "<strong>Required for Next URL:</strong> property path with the next page URL, e.g. <strong>paging.next</strong>. <strong>Optional:</strong> leave empty for Continuation mode."
        next_url_help.style.fontSize = "12px"
        next_url_help.style.color = "#6b7280"
        next_url_help.style.margin = "-4px 0 6px 2px"
        columns_div.appendChild(next_url_help)

        const continuation_prop_wrapper = document.createElement("div")
        continuation_prop_wrapper.className = "select-column-row"
        const continuation_prop_row = document.createElement("div")
        continuation_prop_row.className = "rename_settings"
        continuation_prop_row.style.gridTemplateColumns = "minmax(280px, 1fr)"
        const continuation_prop_input = document.createElement("input")
        continuation_prop_input.type = "text"
        continuation_prop_input.name = "continuation_property"
        continuation_prop_input.placeholder = "Continuation token path (e.g. $.pagination.continuation)"
        continuation_prop_input.addEventListener("change", (event) => this._on_input_change(event, this.flowchart, this))
        continuation_prop_row.appendChild(continuation_prop_input)
        continuation_prop_wrapper.appendChild(continuation_prop_row)
        columns_div.appendChild(continuation_prop_wrapper)
        const continuation_prop_help = document.createElement("div")
        continuation_prop_help.innerHTML = "<strong>Required for Continuation:</strong> JSON path to the token, e.g. <strong>$.pagination.continuation</strong>."
        continuation_prop_help.style.fontSize = "12px"
        continuation_prop_help.style.color = "#6b7280"
        continuation_prop_help.style.margin = "-4px 0 6px 2px"
        columns_div.appendChild(continuation_prop_help)

        const continuation_param_wrapper = document.createElement("div")
        continuation_param_wrapper.className = "select-column-row"
        const continuation_param_row = document.createElement("div")
        continuation_param_row.className = "rename_settings"
        continuation_param_row.style.gridTemplateColumns = "minmax(280px, 1fr)"
        const continuation_param_input = document.createElement("input")
        continuation_param_input.type = "text"
        continuation_param_input.name = "continuation_query_param"
        continuation_param_input.placeholder = "Continuation query param (e.g. continuation)"
        continuation_param_input.addEventListener("change", (event) => this._on_input_change(event, this.flowchart, this))
        continuation_param_row.appendChild(continuation_param_input)
        continuation_param_wrapper.appendChild(continuation_param_row)
        columns_div.appendChild(continuation_param_wrapper)
        const continuation_param_help = document.createElement("div")
        continuation_param_help.innerHTML = "<strong>Optional:</strong> query param name to append, e.g. <strong>continuation</strong> (defaults to continuation)."
        continuation_param_help.style.fontSize = "12px"
        continuation_param_help.style.color = "#6b7280"
        continuation_param_help.style.margin = "-4px 0 6px 2px"
        columns_div.appendChild(continuation_param_help)

        const offset_param_wrapper = document.createElement("div")
        offset_param_wrapper.className = "select-column-row"
        const offset_param_row = document.createElement("div")
        offset_param_row.className = "rename_settings"
        offset_param_row.style.gridTemplateColumns = "minmax(280px, 1fr)"
        const offset_param_input = document.createElement("input")
        offset_param_input.type = "text"
        offset_param_input.name = "offset_param"
        offset_param_input.placeholder = "Offset query param (e.g. offset)"
        offset_param_input.addEventListener("change", (event) => this._on_input_change(event, this.flowchart, this))
        offset_param_row.appendChild(offset_param_input)
        offset_param_wrapper.appendChild(offset_param_row)
        columns_div.appendChild(offset_param_wrapper)

        const limit_param_wrapper = document.createElement("div")
        limit_param_wrapper.className = "select-column-row"
        const limit_param_row = document.createElement("div")
        limit_param_row.className = "rename_settings"
        limit_param_row.style.gridTemplateColumns = "minmax(280px, 1fr)"
        const limit_param_input = document.createElement("input")
        limit_param_input.type = "text"
        limit_param_input.name = "limit_param"
        limit_param_input.placeholder = "Limit query param (e.g. limit)"
        limit_param_input.addEventListener("change", (event) => this._on_input_change(event, this.flowchart, this))
        limit_param_row.appendChild(limit_param_input)
        limit_param_wrapper.appendChild(limit_param_row)
        columns_div.appendChild(limit_param_wrapper)

        const limit_value_wrapper = document.createElement("div")
        limit_value_wrapper.className = "select-column-row"
        const limit_value_row = document.createElement("div")
        limit_value_row.className = "rename_settings"
        limit_value_row.style.gridTemplateColumns = "minmax(280px, 1fr)"
        const limit_value_input = document.createElement("input")
        limit_value_input.type = "number"
        limit_value_input.name = "limit_value"
        limit_value_input.placeholder = "Limit value (e.g. 50)"
        limit_value_input.addEventListener("change", (event) => this._on_input_change(event, this.flowchart, this))
        limit_value_row.appendChild(limit_value_input)
        limit_value_wrapper.appendChild(limit_value_row)
        columns_div.appendChild(limit_value_wrapper)

        const total_rows_wrapper = document.createElement("div")
        total_rows_wrapper.className = "select-column-row"
        const total_rows_row = document.createElement("div")
        total_rows_row.className = "rename_settings"
        total_rows_row.style.gridTemplateColumns = "minmax(280px, 1fr)"
        const total_rows_input = document.createElement("input")
        total_rows_input.type = "text"
        total_rows_input.name = "total_rows_property"
        total_rows_input.placeholder = "Total rows JSON path (e.g. $.response.pagination.total_rows)"
        total_rows_input.addEventListener("change", (event) => this._on_input_change(event, this.flowchart, this))
        total_rows_row.appendChild(total_rows_input)
        total_rows_wrapper.appendChild(total_rows_row)
        columns_div.appendChild(total_rows_wrapper)

        const offset_help = document.createElement("div")
        offset_help.innerHTML = "<strong>Required for Offset:</strong> offset param, limit param/value, total rows JSON path, and records property."
        offset_help.style.fontSize = "12px"
        offset_help.style.color = "#6b7280"
        offset_help.style.margin = "-4px 0 6px 2px"
        columns_div.appendChild(offset_help)

        const update_pagination_visibility = () => {
            const mode = pagination_select.value || "none"
            unroll_wrapper.style.display = mode === "none" ? "none" : ""
            next_url_wrapper.style.display = mode === "next_url" ? "" : "none"
            continuation_prop_wrapper.style.display = mode === "continuation" ? "" : "none"
            continuation_param_wrapper.style.display = mode === "continuation" ? "" : "none"
            offset_param_wrapper.style.display = mode === "offset" ? "" : "none"
            limit_param_wrapper.style.display = mode === "offset" ? "" : "none"
            limit_value_wrapper.style.display = mode === "offset" ? "" : "none"
            total_rows_wrapper.style.display = mode === "offset" ? "" : "none"
        }
        update_pagination_visibility()
        columns_div.appendChild(actions)

        div.appendChild(columns_div)
        const saved_settings = this._get_saved_call_settings()
        let header_row_count = 0
        if (Array.isArray(saved_settings) && saved_settings.length > 0) {
            const base = saved_settings[0] || {}
            if (base.url) {
                url_input.value = base.url
            }
            if (base.request_type) {
                method_select.value = base.request_type
            }
            if (base.body) {
                body_input.value = base.body
            }
            if (base.pagination_mode) {
                pagination_select.value = base.pagination_mode
            }
            if (base.unroll_by) {
                unroll_input.value = base.unroll_by
            }
            if (base.next_page_property) {
                next_url_input.value = base.next_page_property
            }
            if (base.continuation_property) {
                continuation_prop_input.value = base.continuation_property
            }
            if (base.continuation_query_param) {
                continuation_param_input.value = base.continuation_query_param
            }
            if (base.offset_param) {
                offset_param_input.value = base.offset_param
            }
            if (base.limit_param) {
                limit_param_input.value = base.limit_param
            }
            if (base.limit_value) {
                limit_value_input.value = base.limit_value
            }
            if (base.total_rows_property) {
                total_rows_input.value = base.total_rows_property
            }
            update_pagination_visibility()
            if (base.headers && typeof base.headers === "object") {
                header_row_count += this._append_header_rows(base.headers, columns_div)
            }
        }
        if (header_row_count > 0) {
            this._allow_header_fallback = false
        }
        return div
    }

    get_operation_settings() {
        let settings = super.get_operation_settings('call')
        let base = {
            url: "",
            request_type: "GET",
            body: "",
            headers: {},
            pagination_mode: "none",
            unroll_by: "",
            next_page_property: "",
            continuation_property: "",
            continuation_query_param: "",
            offset_param: "",
            limit_param: "",
            limit_value: "",
            total_rows_property: ""
        }
        let headers = {}
        if (settings && Array.isArray(settings.call)) {
            settings.call.forEach(entry => {
                if (entry.url) {
                    base.url = entry.url
                }
                if (entry.request_type) {
                    base.request_type = entry.request_type
                }
                if (entry.body) {
                    base.body = entry.body
                }
                if (entry.pagination_mode) {
                    base.pagination_mode = entry.pagination_mode
                }
                if (entry.unroll_by) {
                    base.unroll_by = entry.unroll_by
                }
                if (entry.next_page_property) {
                    base.next_page_property = entry.next_page_property
                }
                if (entry.continuation_property) {
                    base.continuation_property = entry.continuation_property
                }
                if (entry.continuation_query_param) {
                    base.continuation_query_param = entry.continuation_query_param
                }
                if (entry.offset_param) {
                    base.offset_param = entry.offset_param
                }
                if (entry.limit_param) {
                    base.limit_param = entry.limit_param
                }
                if (entry.limit_value) {
                    base.limit_value = entry.limit_value
                }
                if (entry.total_rows_property) {
                    base.total_rows_property = entry.total_rows_property
                }
                if (entry.header_key) {
                    headers[entry.header_key] = entry.header_value || ""
                }
            })
        }
        base.headers = headers
        settings = { call: [base] }
        this.flowchart.flowchart('setSettings', this.activityId, settings)
        return settings
    }

    _on_selector_change(event, widget, activity) {
        this.get_operation_settings()
    }

    _on_input_change(event, widget, activity) {
        this.get_operation_settings()
    }

    _on_button_click(event, widget, activity) {
        const wrapper = event.target.closest(".select-column-row")
        if (wrapper) {
            wrapper.remove()
            this.get_operation_settings()
            if (typeof window.flowchartSchedulePipelineSave === "function") {
                window.flowchartSchedulePipelineSave()
            }
            return
        }
    }

    _add_column(e, widget, activity, options) {
        let columns_div = document.getElementById(activity.activityId + "_column_edit");
        if (!columns_div) {
            return
        }
        const suppress_save = options && options.suppress_save
        let settings = [
            {
                'type': 'input',
                'placeholder': 'Header name',
                'value': '',
                'name': 'header_key'
            },
            {
                'type': 'input',
                'placeholder': 'Header value',
                'value': '',
                'name': 'header_value'
            },
            {
                'type': 'button',
                'label': 'DROP',
                'color': 'red'
            }
        ]
        let header_element = this.get_column_selection_element(widget, settings)
        header_element.style.gridTemplateColumns = "minmax(180px, 0.8fr) minmax(220px, 1.2fr) 90px"
        const row_wrapper = document.createElement("div")
        row_wrapper.className = "select-column-row"
        const drag_handle = document.createElement("span")
        drag_handle.className = "drag-handle"
        drag_handle.title = "Drag to reorder"
        row_wrapper.appendChild(drag_handle)
        row_wrapper.appendChild(header_element)
        columns_div.appendChild(row_wrapper)
        if (!suppress_save) {
            this.get_operation_settings()
        }
    }
}

class Http_Sink_Activity extends Activity {
    constructor(flowchart, activity) {
        super(flowchart, activity)
        this.operation_type = "call"
        this.settings = this.get_settings_element()
        this._allow_header_fallback = false
    }

    _get_saved_call_settings() {
        const live_activity = this.flowchart && typeof this.flowchart.flowchart === "function"
            ? this.flowchart.flowchart("getOperatorActivity", this.activityId)
            : this.activity
        const candidates = [
            this.activity?.settings?.call,
            this.activity?.properties?.settings?.call,
            live_activity?.settings?.call,
            live_activity?.properties?.settings?.call
        ]
        if (this.flowchart && typeof this.flowchart.flowchart === "function") {
            const data_ref = this.flowchart.flowchart("getDataRef")
            const ref_call = data_ref?.operators?.[this.activityId]?.properties?.settings?.call
            if (Array.isArray(ref_call)) {
                candidates.push(ref_call)
            }
        }
        for (const entry of candidates) {
            if (Array.isArray(entry) && entry.length) {
                return entry
            }
        }
        return null
    }

    _get_saved_headers_fallback() {
        const live_activity = this.flowchart && typeof this.flowchart.flowchart === "function"
            ? this.flowchart.flowchart("getOperatorActivity", this.activityId)
            : this.activity
        const candidates = [
            this.activity?.settings?.call,
            this.activity?.properties?.settings?.call,
            live_activity?.settings?.call,
            live_activity?.properties?.settings?.call
        ]
        if (this.flowchart && typeof this.flowchart.flowchart === "function") {
            const data_ref = this.flowchart.flowchart("getDataRef")
            const ref_call = data_ref?.operators?.[this.activityId]?.properties?.settings?.call
            if (Array.isArray(ref_call)) {
                candidates.push(ref_call)
            }
        }
        for (const entry of candidates) {
            if (Array.isArray(entry) && entry[0] && typeof entry[0].headers === "object") {
                return entry[0].headers
            }
        }
        return null
    }

    _append_header_rows(headers, columns_div) {
        if (!headers || typeof headers !== "object") {
            return 0
        }
        let count = 0
        Object.keys(headers).forEach(header_key => {
            this._add_column(null, this.flowchart, this, { suppress_save: true })
            const rows = columns_div.querySelectorAll(".select-column-row")
            const row = rows[rows.length - 1]
            if (!row) {
                return
            }
            const key_input = row.querySelector("input[name='header_key']")
            const value_input = row.querySelector("input[name='header_value']")
            if (key_input) {
                key_input.value = header_key
            }
            if (value_input) {
                value_input.value = headers[header_key]
            }
            count++
        })
        return count
    }

    _restore_saved_settings() {
        const columns_div = document.getElementById(this.activityId + "_column_edit")
        if (!columns_div) {
            return
        }
        const existing = columns_div.querySelector("input[name='header_key']")
        if (existing) {
            return
        }
        const saved_settings = this._get_saved_call_settings()
        const base = Array.isArray(saved_settings) ? (saved_settings[0] || {}) : {}
        if (base.headers && typeof base.headers === "object" && Object.keys(base.headers).length > 0) {
            this._append_header_rows(base.headers, columns_div)
        }
        this._allow_header_fallback = false
    }

    get_settings_element() {
        let div = document.createElement('div')
        div.id = this.activityId

        let columns_div = document.createElement('div')
        columns_div.id = this.activityId + "_column_edit"
        columns_div.className = "column-settings"

        const actions = document.createElement('div')
        actions.className = "column-settings-actions"
        let add_button = document.createElement("button")
        add_button.innerHTML = "+ Add Header"
        add_button.className = 'buttons add-button'
        add_button.addEventListener("click", (event) => this._add_column(event, this.flowchart, this))
        actions.appendChild(add_button)

        const base_wrapper = document.createElement("div")
        base_wrapper.className = "select-column-row"
        const base_row = document.createElement("div")
        base_row.className = "rename_settings"
        base_row.style.gridTemplateColumns = "minmax(240px, 1.4fr) minmax(120px, 0.6fr)"

        const url_input = document.createElement('input')
        url_input.type = 'text'
        url_input.name = 'url'
        url_input.placeholder = 'https://api.example.com'
        url_input.addEventListener("change", (event) => this._on_input_change(event, this.flowchart, this))
        base_row.appendChild(url_input)

        const method_select = document.createElement('select')
        method_select.name = 'request_type'
        let option = document.createElement('option')
        option.value = "POST"
        option.textContent = "POST"
        method_select.appendChild(option)
        method_select.value = "POST"
        method_select.disabled = true
        base_row.appendChild(method_select)
        base_wrapper.appendChild(base_row)
        columns_div.appendChild(base_wrapper)

        const body_wrapper = document.createElement("div")
        body_wrapper.className = "select-column-row"
        const body_row = document.createElement("div")
        body_row.className = "rename_settings"
        body_row.style.gridTemplateColumns = "minmax(320px, 1fr)"

        const body_input = document.createElement('textarea')
        body_input.name = 'body_preview'
        body_input.placeholder = 'Uses input data as request body'
        body_input.rows = 6
        body_input.readOnly = true
        body_input.style.resize = "vertical"
        body_input.style.fontFamily = "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, \"Liberation Mono\", \"Courier New\", monospace"
        body_row.appendChild(body_input)
        const body_note = document.createElement("div")
        body_note.textContent = "Body is taken from the input to this activity."
        body_note.style.fontSize = "12px"
        body_note.style.color = "#7a7f87"
        body_note.style.paddingTop = "6px"
        body_row.appendChild(body_note)
        body_wrapper.appendChild(body_row)
        columns_div.appendChild(body_wrapper)
        columns_div.appendChild(actions)

        div.appendChild(columns_div)
        this.body_preview = body_input
        const saved_settings = this._get_saved_call_settings()
        let header_row_count = 0
        if (Array.isArray(saved_settings) && saved_settings.length > 0) {
            const base = saved_settings[0] || {}
            if (base.url) {
                url_input.value = base.url
            }
            if (base.headers && typeof base.headers === "object") {
                header_row_count += this._append_header_rows(base.headers, columns_div)
            }
        }
        if (header_row_count > 0) {
            this._allow_header_fallback = false
        }
        return div
    }

    get_operation_settings() {
        let settings = super.get_operation_settings('call')
        let base = { url: "", request_type: "POST", body: "", headers: {} }
        let headers = {}
        if (settings && Array.isArray(settings.call)) {
            settings.call.forEach(entry => {
                if (entry.url) {
                    base.url = entry.url
                }
            if (entry.header_key) {
                headers[entry.header_key] = entry.header_value || ""
            }
        })
      }
        base.headers = headers
        settings = { call: [base] }
        this.flowchart.flowchart('setSettings', this.activityId, settings)
        return settings
    }

    update_body_preview(data) {
        if (!this.body_preview) {
            return
        }
        if (data === undefined || data === null) {
            this.body_preview.value = ""
            this.body_preview.placeholder = "No input data yet"
            return
        }
        try {
            this.body_preview.value = JSON.stringify(data, null, 2)
        } catch (error) {
            this.body_preview.value = String(data)
        }
    }

    _on_selector_change(event, widget, activity) {
        this.get_operation_settings()
    }

    _on_input_change(event, widget, activity) {
        this.get_operation_settings()
    }

    _on_button_click(event, widget, activity) {
        const wrapper = event.target.closest(".select-column-row")
        if (wrapper) {
            wrapper.remove()
            this.get_operation_settings()
            if (typeof window.flowchartSchedulePipelineSave === "function") {
                window.flowchartSchedulePipelineSave()
            }
            return
        }
    }

    _add_column(e, widget, activity, options) {
        let columns_div = document.getElementById(activity.activityId + "_column_edit");
        if (!columns_div) {
            return
        }
        const suppress_save = options && options.suppress_save
        let settings = [
            {
                'type': 'input',
                'placeholder': 'Header name',
                'value': '',
                'name': 'header_key'
            },
            {
                'type': 'input',
                'placeholder': 'Header value',
                'value': '',
                'name': 'header_value'
            },
            {
                'type': 'button',
                'label': 'DROP',
                'color': 'red'
            }
        ]
        let header_element = this.get_column_selection_element(widget, settings)
        header_element.style.gridTemplateColumns = "minmax(180px, 0.8fr) minmax(220px, 1.2fr) 90px"
        const row_wrapper = document.createElement("div")
        row_wrapper.className = "select-column-row"
        const drag_handle = document.createElement("span")
        drag_handle.className = "drag-handle"
        drag_handle.title = "Drag to reorder"
        row_wrapper.appendChild(drag_handle)
        row_wrapper.appendChild(header_element)
        columns_div.appendChild(row_wrapper)
        if (!suppress_save) {
            this.get_operation_settings()
        }
    }
}
