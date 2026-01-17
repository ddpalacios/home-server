class Http_Request_Activity extends Activity {
    constructor(flowchart, activity) {
        super(flowchart, activity)
        this.operation_type = "call"
        this.settings = this.get_settings_element()
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
        columns_div.appendChild(actions)

        div.appendChild(columns_div)
        const saved_settings = this.activity.settings?.call
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
            if (base.headers && typeof base.headers === "object") {
                Object.keys(base.headers).forEach(header_key => {
                    this._add_column(null, this.flowchart, this)
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
                        value_input.value = base.headers[header_key]
                    }
                })
            }
        }
        return div
    }

    get_operation_settings() {
        let settings = super.get_operation_settings('call')
        let base = { url: "", request_type: "GET", body: "", headers: {} }
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
            return
        }
    }

    _add_column(e, widget, activity) {
        let columns_div = document.getElementById(activity.activityId + "_column_edit");
        if (!columns_div) {
            return
        }
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
        this.get_operation_settings()
    }
}
