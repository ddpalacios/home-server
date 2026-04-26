class Append_Activity extends Activity{
    constructor(flowchart, activity){
        super(flowchart, activity)
        this.add_button_label = "Refresh Inputs"
        this.settings = this.get_settings_element()
    }

    _setup_column_container(columns_div, add_button){
        columns_div.classList.add("column-settings", "stack");

        if (add_button) {
            const existing_actions = columns_div.querySelector(".column-settings-actions");
            if (!existing_actions) {
                const actions = document.createElement('div');
                actions.className = "column-settings-actions";
                actions.appendChild(add_button);
                columns_div.appendChild(actions);
            }
        }
    }

    get_settings_element(){
        const div = document.createElement('div')
        div.id = this.activityId

        const section = document.createElement('div')
        section.className = "combine-section panel stack"

        const title = document.createElement('span')
        title.textContent = "Append Rows"
        title.style.color = "black"
        title.style.fontWeight = "600"
        section.appendChild(title)

        const description = document.createElement('span')
        description.textContent = "Combine Table 1 and Table 2 into a single dataset."
        description.style.color = "rgba(15, 23, 42, 0.6)"
        description.style.fontSize = "0.85rem"
        section.appendChild(description)

        const stats = document.createElement('div')
        stats.id = this.activityId + "_append_stats"
        stats.style.display = "grid"
        stats.style.gridTemplateColumns = "repeat(auto-fit, minmax(180px, 1fr))"
        stats.style.gap = "10px"
        stats.style.marginTop = "6px"
        stats.style.color = "rgba(15, 23, 42, 0.7)"

        const rows_1 = document.createElement('span')
        rows_1.id = this.activityId + "_append_rows_1"
        rows_1.textContent = "Table 1 Rows: -"
        stats.appendChild(rows_1)

        const rows_2 = document.createElement('span')
        rows_2.id = this.activityId + "_append_rows_2"
        rows_2.textContent = "Table 2 Rows: -"
        stats.appendChild(rows_2)

        const rows_total = document.createElement('span')
        rows_total.id = this.activityId + "_append_rows_total"
        rows_total.textContent = "Result Rows: -"
        stats.appendChild(rows_total)

        section.appendChild(stats)

        const refresh_button = document.createElement("button")
        refresh_button.innerHTML = this.add_button_label
        refresh_button.className = 'buttons add-button'
        refresh_button.style.padding = "8px 12px";
        refresh_button.style.cursor = "pointer";
        refresh_button.style.transition = "background 0.2s ease";
        refresh_button.addEventListener("click", (event) => this._sync_inputs(event, this.flowchart, this));
        section.appendChild(refresh_button)

        const columns_div = document.createElement('div')
        columns_div.id = this.activityId + "_column_edit"
        columns_div.style.display = "flex"
        columns_div.style.flexDirection = "column"
        columns_div.style.gap = "12px"
        section.appendChild(columns_div)

        div.appendChild(section)
        return div
    }

    get_operation_settings(){
        let settings = super.get_operation_settings('append')
        this.flowchart.flowchart('setSettings', this.activityId, settings)
        return settings
    }

    _sync_inputs(e, widget, activity){
        const operator = widget.flowchart('getOperatorActivity', activity.activityId)
        const incoming = operator?.link_from || []
        if (incoming.length === 0) {
            return
        }
        if (incoming[0]) {
            widget.flowchart('setinputVal', activity.activityId, 'input_1', incoming[0])
        }
        if (incoming[1]) {
            widget.flowchart('setinputVal', activity.activityId, 'input_2', incoming[1])
        }

        const table_1 = incoming[0]?.outputs?.output?.value?.values ?? null
        const table_2 = incoming[1]?.outputs?.output?.value?.values ?? null
        const count_1 = Array.isArray(table_1) ? table_1.length : (table_1 ? 1 : 0)
        const count_2 = Array.isArray(table_2) ? table_2.length : (table_2 ? 1 : 0)
        const total_count = count_1 + count_2

        const rows_1 = document.getElementById(this.activityId + "_append_rows_1")
        const rows_2 = document.getElementById(this.activityId + "_append_rows_2")
        const rows_total = document.getElementById(this.activityId + "_append_rows_total")
        if (rows_1) {
            rows_1.textContent = "Table 1 Rows: " + count_1
        }
        if (rows_2) {
            rows_2.textContent = "Table 2 Rows: " + count_2
        }
        if (rows_total) {
            rows_total.textContent = "Result Rows: " + total_count
        }

        const all_columns = new Set()
        const capture_columns = (values) => {
            if (!values) {
                return
            }
            if (Array.isArray(values) && values.length > 0) {
                Object.keys(values[0] || {}).forEach(key => all_columns.add(key))
                return
            }
            if (typeof values === "object") {
                Object.keys(values).forEach(key => all_columns.add(key))
            }
        }
        capture_columns(table_1)
        capture_columns(table_2)

        let columns_div = document.getElementById(this.activityId + "_column_edit")
        if (columns_div) {
            columns_div.innerHTML = ""
            const column_list = Array.from(all_columns)
            const add_button = document.createElement("button")
            add_button.innerHTML = "+ Add"
            add_button.className = 'buttons add-button'
            add_button.addEventListener("click", (event) => this._add_column(event, widget, this));
            this._setup_column_container(columns_div, add_button)
            this._enable_column_sorting(columns_div)
            column_list.forEach(column => {
                const settings = [
                    {
                        'type': 'selector'
                        ,'options': column_list
                        ,'default_value': column
                        ,'name': 'column_name'
                    },
                    {
                        'type': 'input'
                        ,'placeholder' : 'Column name'
                        ,'value': column
                        ,'name': 'new_column_name'
                    },
                    {
                        'type': 'button'
                        ,'label': 'DROP'
                        ,'color': 'red'
                    }
                ]
                const column_edit_element = this.get_column_selection_element(widget, settings)
                const column_wrapper = document.createElement("div")
                column_wrapper.className = "select-column-row"
                const drag_handle = document.createElement("span")
                drag_handle.className = "drag-handle"
                drag_handle.title = "Drag to reorder"
                column_wrapper.appendChild(drag_handle)
                column_wrapper.appendChild(column_edit_element)
                columns_div.appendChild(column_wrapper)
            })
        }
        this.get_operation_settings()
    }

    _on_selector_change(e, widget, activity){
        if (e.target.name !== 'column_name'){
            return
        }
        const div = document.getElementById(activity.activityId + "_column_edit")
        let total_dupes = 1
        let selected_column = e.target.value
        let name = selected_column

        let current_named_columns = []
        for (let i = 0; i < div.children.length; i++){
            let row = div.children[i]
            if (row.classList && row.classList.contains("select-column-row")) {
                row = row.querySelector(".rename_settings") || row
            }
            if (!row || row.className != 'rename_settings'){continue}
            current_named_columns.push(row.children[1].value)
        }
        while (name && current_named_columns.includes(name)) {
            name  = selected_column + "_" + total_dupes.toString()
            total_dupes += 1
        }
        e.target.parentElement.children[1].value =  name
        this.get_operation_settings()
    }

    _on_input_change(e, widget, activity){
        this.get_operation_settings()
    }

    _on_button_click(e, widget, activity){
        const row = e.target.closest(".rename_settings") || e.target.parentElement;
        const wrapper = e.target.closest(".select-column-row");
        if (wrapper) {
            wrapper.remove();
        } else if (row) {
            row.remove();
        }
        this.get_operation_settings()
    }

    _enable_column_sorting(columns_div){
        if (!columns_div || columns_div.dataset.sortableBound === "true") {
            return
        }
        if (typeof $(columns_div).sortable !== "function") {
            return
        }
        $(columns_div).sortable({
            items: ".select-column-row",
            axis: "y",
            containment: "parent",
            tolerance: "pointer"
        })
        columns_div.dataset.sortableBound = "true"
    }

    _add_column(e, widget, activity){
        let columns_div = document.getElementById(activity.activityId + "_column_edit");
        if (columns_div == null || columns_div == undefined){
            return
        }
        const column_list = []
        const operator = widget.flowchart('getOperatorActivity', activity.activityId)
        const incoming = operator?.link_from || []
        const table_1 = incoming[0]?.outputs?.output?.value?.values ?? null
        const table_2 = incoming[1]?.outputs?.output?.value?.values ?? null
        const capture_columns = (values) => {
            if (!values) {
                return
            }
            if (Array.isArray(values) && values.length > 0) {
                Object.keys(values[0] || {}).forEach(key => column_list.push(key))
                return
            }
            if (typeof values === "object") {
                Object.keys(values).forEach(key => column_list.push(key))
            }
        }
        capture_columns(table_1)
        capture_columns(table_2)
        const unique_columns = Array.from(new Set(column_list))
        if (unique_columns.length === 0) {
            unique_columns.push("")
        }

        const settings = [
            {
                'type': 'selector'
                ,'options': unique_columns
                ,'default_value': ""
                ,'name': 'column_name'
            },
             {
                'type': 'input'
                ,'placeholder' : 'Column name'
                ,'value': ""
                ,'name': 'new_column_name'
            }
            ,{
                'type': 'button'
                ,'label': 'DROP'
                ,'color': 'red'
            }]
        let column_edit_element = this.get_column_selection_element(widget,settings)
        const column_wrapper = document.createElement("div");
        column_wrapper.className = "select-column-row";
        const drag_handle = document.createElement("span");
        drag_handle.className = "drag-handle";
        drag_handle.title = "Drag to reorder";
        column_wrapper.appendChild(drag_handle);
        column_wrapper.appendChild(column_edit_element);
        columns_div.appendChild(column_wrapper)
    }
}
