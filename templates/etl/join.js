
class Join_Activity extends Activity{
    constructor(flowchart,activity){
        super(flowchart, activity)
        this.join_operators = ['Left Join (all from first, matching from second)'
            , 'Right Join (all from second, matching from first)'
            , 'Inner Join (only matching rows)'
            , 'Full Outer Join (all rows from both)']
        this.add_button_label = "+ Add Join"
        this.settings = this.get_settings_element()
    }
    get_operation_settings(){
        const join_settings = this._collect_join_settings()
        this.flowchart.flowchart('setSettings', this.activityId, join_settings)
        return join_settings
    }
    _get_table_columns(input_key){
        const current = this.flowchart.flowchart("getOperatorActivity", this.activityId);
        const input_data = current?.inputs?.[input_key]?.value;
        const legacy_outputs = input_data?.outputs?.output?.value || null;
        const input_types = input_data?.datatypes || legacy_outputs?.datatypes;
        if (input_types && typeof input_types === "object") {
            return Object.keys(input_types);
        }
        const input_values = input_data?.values || legacy_outputs?.values;
        if (Array.isArray(input_values) && input_values.length > 0){
            return Object.keys(input_values[0]);
        }
        if (input_values && typeof input_values === "object") {
            return Object.keys(input_values);
        }
        return [];
    }

    _ensure_container(){
        if (this.columns_div) {
            return this.columns_div
        }
        let columns_div = null
        if (this.settings && this.settings.querySelector) {
            columns_div = this.settings.querySelector("#" + this.activityId + "_column_edit")
        }
        if (!columns_div) {
            columns_div = document.getElementById(this.activityId + "_column_edit");
        }
        if (!columns_div) {
            columns_div = document.createElement('div')
            columns_div.id = this.activityId + "_column_edit"
        }
        this.columns_div = columns_div
        return columns_div
    }

    _build_join_row(table1_columns, table2_columns, preset){
        const settings = [
            {
                'type': 'span'
                ,'label':"Table 1"
                ,'color': 'black'
            },
            {
                'type': 'selector'
                ,'options': table1_columns
                ,'default_value': preset?.columnName_1 || preset?.column_name_1 || ""
                ,'name':'column_name_1'
            },
            {
                'type': 'span'
                ,'label':"Table 2"
                ,'color': 'black'
            },
            {
                'type': 'selector'
                ,'options': table2_columns
                ,'default_value': preset?.columnName_2 || preset?.column_name_2 || ""
                ,'name':'column_name_2'
            },
            {
                'type': 'selector'
                ,'options': this.join_operators
                ,'default_value': preset?.operation || this.join_operators[0]
                ,'name':'operation'
            }
        ]
        const row = this.get_column_selection_element(this.flowchart, settings)
        row.classList.add("join-condition-row")
        return row
    }

    _add_join_row(section, preset){
        const table1_columns = this._get_table_columns("input_1")
        const table2_columns = this._get_table_columns("input_2")
        const join_row = this._build_join_row(
            table1_columns.length ? table1_columns : [""],
            table2_columns.length ? table2_columns : [""],
            preset
        )
        section.appendChild(join_row)
        this.get_operation_settings()
    }

    _apply_saved_join_fields(row, preset){
        if (!row || !preset) {
            return
        }
        const setValue = (name, value) => {
            if (!value) return
            const el = row.querySelector(`[name="${name}"]`)
            if (!el) return
            if (el.tagName === "SELECT") {
                const hasOption = Array.from(el.options).some(option => option.value === value)
                if (!hasOption) {
                    const option = document.createElement("option")
                    option.value = value
                    option.textContent = value
                    el.appendChild(option)
                }
            }
            el.value = value
        }
        setValue("column_name_1", preset.columnName_1 || preset.column_name_1)
        setValue("column_name_2", preset.columnName_2 || preset.column_name_2)
        setValue("operation", preset.operation)
    }

    _add_table2_column(e, widget, activity, preset){
        const columns_div = this._ensure_container()
        let table2_columns = this._get_table_columns("input_2")
        if (table2_columns.length === 0) {
            const saved = activity?.activity?.settings?.join?.[0]?.table_2_columns || []
            table2_columns = saved.map(entry => entry?.column_name || entry?.columnName).filter(Boolean)
        }
        if (table2_columns.length === 0) {
            table2_columns = [""]
        }
        const column_name = preset?.column_name || preset?.columnName || ""
        const default_name = preset?.new_column_name || (column_name ? `t2_${column_name}` : "")
        const settings = [
            {
                'type': 'selector'
                ,'options': table2_columns
                ,'default_value': column_name
                ,'name': 'column_name'
            },
            {
                'type': 'input'
                ,'placeholder' : 'Output name'
                ,'value': default_name
                ,'name': 'new_column_name'
            },
            {
                'type': 'button'
                ,'label': 'DROP'
                ,'color': 'red'
            }
        ]
        const column_edit_element = this.get_column_selection_element(widget, settings)
        const column_select = column_edit_element.querySelector('select[name="column_name"]')
        const name_input = column_edit_element.querySelector('input[name="new_column_name"]')
        if (column_select && column_name) {
            const hasOption = Array.from(column_select.options).some(option => option.value === column_name)
            if (!hasOption) {
                const option = document.createElement("option")
                option.value = column_name
                option.textContent = column_name
                column_select.appendChild(option)
            }
            column_select.value = column_name
        }
        if (column_select && name_input) {
            column_select.addEventListener("change", () => {
                if (!name_input.value || name_input.value === `t2_${column_select.value}`) {
                    name_input.value = column_select.value
                }
                this.get_operation_settings()
            })
        }
        const column_wrapper = document.createElement("div");
        column_wrapper.className = "select-column-row";
        const drag_handle = document.createElement("span");
        drag_handle.className = "drag-handle";
        drag_handle.title = "Drag to reorder";
        column_wrapper.appendChild(drag_handle);
        column_wrapper.appendChild(column_edit_element);
        const section = columns_div.querySelector(".join-table2-columns");
        if (section) {
            section.appendChild(column_wrapper);
        }
    }

    _collect_join_settings(){
        const columns_div = this._ensure_container()
        const join_row = columns_div.querySelector(".join-condition-row")
        const join_statement = {}
        if (join_row) {
            const getVal = (name) => {
                const el = join_row.querySelector(`[name="${name}"]`)
                return el ? el.value : ""
            }
            join_statement.columnName_1 = getVal("column_name_1")
            join_statement.columnName_2 = getVal("column_name_2")
            join_statement.operation = getVal("operation") || this.join_operators[0]
        }
        const table2_rows = Array.from(columns_div.querySelectorAll(".join-table2-columns .rename_settings"))
        const table2_columns = table2_rows.map((row) => {
            const col = row.querySelector('[name="column_name"]')?.value || ""
            const name = row.querySelector('[name="new_column_name"]')?.value || ""
            if (!col && !name) {
                return null
            }
            return { column_name: col, new_column_name: name }
        }).filter(Boolean)
        if (table2_columns.length) {
            join_statement.table_2_columns = table2_columns
        }
        return { join: [join_statement] }
    }

    _restore_saved_settings(){
        const activity = this.flowchart.flowchart("getOperatorActivity", this.activityId)
        const saved = activity?.settings?.join?.[0] || null
        const columns_div = this._ensure_container()
        columns_div.innerHTML = ""
        const section = document.createElement("div")
        section.className = "combine-section"
        const table1_columns = this._get_table_columns("input_1")
        const table2_columns = this._get_table_columns("input_2")
        const header = document.createElement("div")
        header.style.display = "flex"
        header.style.justifyContent = "space-between"
        header.style.alignItems = "center"
        header.style.gap = "12px"

        const title = document.createElement("span")
        title.textContent = "Join Settings"
        title.style.fontWeight = "600"
        title.style.color = "#111827"
        header.appendChild(title)

        const add_join_button = document.createElement("button")
        add_join_button.innerHTML = this.add_button_label
        add_join_button.className = "buttons add-button"
        add_join_button.addEventListener("click", (event) => {
            if (!section.querySelector(".join-condition-row")) {
                this._add_join_row(section, saved)
            }
        })
        header.appendChild(add_join_button)
        section.appendChild(header)

        if (!section.querySelector(".join-condition-row")) {
            this._add_join_row(section, saved)
        }
        const join_row = section.querySelector(".join-condition-row")
        if (join_row) {
            this._apply_saved_join_fields(join_row, saved)
        }

        const table2_section = document.createElement("div")
        table2_section.className = "combine-columns-section join-table2-columns"

        const table2_header = document.createElement("div")
        table2_header.style.display = "flex"
        table2_header.style.justifyContent = "space-between"
        table2_header.style.alignItems = "center"
        table2_header.style.gap = "12px"

        const table2_title = document.createElement("span")
        table2_title.textContent = "Table 2 Columns"
        table2_title.style.fontWeight = "600"
        table2_title.style.color = "#111827"
        table2_header.appendChild(table2_title)

        const add_button = document.createElement("button")
        add_button.innerHTML = "Add Column"
        add_button.className = "buttons add-button"
        add_button.addEventListener("click", (event) => this._add_table2_column(event, this.flowchart, this))
        table2_header.appendChild(add_button)

        table2_section.appendChild(table2_header)
        section.appendChild(table2_section)
        columns_div.appendChild(section)

        const selected = Array.isArray(saved?.table_2_columns) ? saved.table_2_columns : []
        if (selected.length) {
            selected.forEach((entry) => {
                this._add_table2_column(null, this.flowchart, this, entry)
            })
        } else {
            this._add_table2_column(null, this.flowchart, this)
        }
        this.get_operation_settings()
    }

    get_settings_element(){
        const div = document.createElement('div')
        div.id = this.activityId
        const columns_div = this._ensure_container()
        div.appendChild(columns_div)
        this._restore_saved_settings()
        return div
    }

    _on_selector_change(e, widget,activity){
        this.get_operation_settings();
    }

}
