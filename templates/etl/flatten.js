class Flatten_Activity extends Activity{
    constructor(flowchart,activity){
        super(flowchart,activity)
        this.add_button_label = "+ Add Flatten"
        this.settings = this.get_settings_element()
    }

    _setup_column_container(columns_div, add_button){
        columns_div.classList.add("column-settings");

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
        let div = document.createElement('div')
        div.id = this.activityId
        const sync_section = document.createElement('div');
        sync_section.id = this.activityId + "_sync_settings";
        sync_section.style.display = "flex";
        sync_section.style.flexDirection = "column";
        sync_section.style.gap = "8px";
        sync_section.style.padding = "6px 0 0";

        const sync_label = document.createElement('label');
        sync_label.textContent = "Sync Arrays";
        sync_label.style.color = "black";
        sync_section.appendChild(sync_label);

        const sync_button = document.createElement('button');
        sync_button.className = "buttons add-button";
        sync_button.textContent = "Sync Arrays";
        sync_button.style.width = "25%";
        sync_button.addEventListener("click", (event) => this._sync_arrays_onclick(event, this.flowchart, this));
        sync_section.appendChild(sync_button);

        div.insertBefore(sync_section, div.firstChild);

        return div;
    }

    _setInput(widget, activityId, inputValue){
        widget.flowchart('setinputVal', activityId,'input',{'datatypes': null, 'values': inputValue})
    }

    _setOutput(widget, activityId, outputVal){
        widget.flowchart('setoutputVal', activityId,'output',outputVal)
    }

    _collect_array_paths(obj, prefix, results){
        if (!obj || typeof obj !== "object") {
            return
        }
        if (Array.isArray(obj)) {
            return
        }
        Object.keys(obj).forEach(key => {
            const value = obj[key]
            const path = prefix ? prefix + "." + key : key
            if (Array.isArray(value)) {
                results.push(path)
                return
            }
            if (value && typeof value === "object") {
                this._collect_array_paths(value, path, results)
            }
        })
    }

    _get_array_columns(source_values){
        let values = source_values
        if (!values) {
            return [""]
        }
        let sample = values
        if (Array.isArray(values)) {
            sample = values[0] || {}
        }
        if (!sample || typeof sample !== "object") {
            return [""]
        }
        const array_columns = []
        this._collect_array_paths(sample, "", array_columns)
        return array_columns.length > 0 ? array_columns : [""]
    }

    _sync_arrays_onclick(e, widget, activity){
        let activityId = activity.activityId
        activity.activity = widget.flowchart('getOperatorActivity', activityId)
        const link_output = activity.activity.link_from?.[0]?.outputs?.output?.value
        if (!link_output) {
            console.warn("No linked output available for sync.");
            return
        }
        const source_values = link_output.values ?? link_output
        if (!source_values) {
            console.warn("Linked output is empty.");
            return
        }
        if (link_output && typeof link_output === 'object' && link_output.values !== undefined) {
            widget.flowchart('setinputVal', activityId,'input', link_output)
        } else {
            this._setInput(widget, activityId, source_values)
        }

        let add_button = document.createElement("button")
        add_button.innerHTML = this.add_button_label
        add_button.className = 'buttons add-button'
        add_button.addEventListener("click", (event) => this._add_column(event, widget, this));
        let columns_div = document.getElementById(activity.activityId + "_column_edit");

        if (columns_div == null || columns_div == undefined){
            let settings_div = document.getElementById('selected_activity_settings')
            columns_div = document.createElement('div')
            columns_div.id = this.activityId+ "_column_edit"
            settings_div.appendChild(columns_div)
        }else{
            columns_div.innerHTML = ""
        }
        this._setup_column_container(columns_div, add_button);
        this._enable_column_sorting(columns_div);

        let all_columns = this._get_array_columns(source_values)
        if (all_columns.length === 0) {
            all_columns = [""]
        }
        this._setOutput(widget, activityId, link_output);
        all_columns.forEach(column => {
            let settings = [
                {
                    'type': 'span'
                    ,'label': "Flatten Array"
                    ,'color': 'black'
                },
                {
                    'type': 'selector'
                    ,'options': all_columns
                    ,'default_value': column
                    ,'name': 'unroll_by'
                },
                {
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
        });
    }

    _add_column(e, widget, activity){
        let activityId = activity.activityId
        let columns_div = document.getElementById(activity.activityId + "_column_edit");
        if (columns_div == null || columns_div == undefined){
            let settings_div = document.getElementById('selected_activity_settings')
            columns_div = document.createElement('div')
            columns_div.id = this.activityId+ "_column_edit"
            settings_div.appendChild(columns_div)
        }
        this._setup_column_container(columns_div);
        let current_values = activity.activity.inputs.input.value.values
        let all_columns = this._get_array_columns(current_values)
        if (all_columns.length === 0) {
            all_columns = [""]
        }

        let settings = [
            {
                'type': 'span'
                ,'label': "Flatten Array"
                ,'color': 'black'
            },
            {
                'type': 'selector'
                ,'options': all_columns
                ,'default_value': ""
                ,'name': 'unroll_by'
            },
            {
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

    _on_button_click(event, widget, activity){
        const wrapper = event.target.closest(".select-column-row");
        if (wrapper) {
            wrapper.remove();
            this.get_operation_settings()
            return;
        }
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

    get_operation_settings(){
        let settings = super.get_operation_settings('flatten')
        this.flowchart.flowchart('setSettings', this.activityId, settings)
        return settings
    }

    _on_selector_change(event, widget, activity){
        this.get_operation_settings()
    }

    _on_input_change(e, widget,activity){
        this.get_operation_settings()
    }
}
