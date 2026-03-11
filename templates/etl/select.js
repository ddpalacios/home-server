class Select_Activity extends Activity{
    constructor(flowchart,activity){
        super(flowchart,activity)
        this.operation_type = "select"
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
        let div = super.get_settings_element();
        const sync_section = document.createElement('div');
        sync_section.id = this.activityId + "_sync_settings";
        sync_section.style.display = "flex";
        sync_section.style.flexDirection = "column";
        sync_section.style.gap = "8px";
        sync_section.style.padding = "6px 0 0";

        const sync_label = document.createElement('label');
        sync_label.textContent = "Sync Columns";
        sync_label.style.color = "black";
        sync_section.appendChild(sync_label);

        const sync_button = document.createElement('button');
        sync_button.className = "buttons add-button";
        sync_button.textContent = "Sync Columns";
        sync_button.style.width = "25%";
        sync_button.addEventListener("click", (event) => this._sync_columns_onclick(event, this.flowchart, this));
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

    async _sync_columns_onclick(e, widget, activity){
        let activityId = activity.activityId
        const link_output = activity.activity.link_from?.[0]?.outputs?.output?.value
        console.log("LINK OUTPUT", link_output)

        if (!link_output) {
            console.warn("No linked output available for sync.");
            return
        }
        const source_values = link_output.values ?? link_output
        console.log("SOURCE VALUES", source_values, link_output)
        if (!source_values) {
            console.warn("Linked output is empty.");
            return
        }
        if (link_output && typeof link_output === 'object' && link_output.values !== undefined) {
            widget.flowchart('setinputVal', activityId,'input', link_output)
        } else {
            this._setInput(widget, activityId, source_values)
        }

        // Add button Settings For Output
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
        /////////////////////////////////////////////////////

        let all_columns = []
        this._enable_column_sorting(columns_div);
        let sample = source_values
        if (Array.isArray(source_values)) {
            sample = source_values[0] || {}
        }
        if (sample && typeof sample === "object") {
            Object.keys(sample).forEach(key => {
                const value = sample[key]
                if (value && typeof value === "object" && !Array.isArray(value)) {
                    Object.keys(value).forEach(child => {
                        all_columns.push(key + "." + child)
                    })
                } else {
                    all_columns.push(key)
                }
            })
        }
        if (all_columns.length === 0) {
            all_columns = [""]
        }
        this._setOutput(widget, activityId, link_output);
        all_columns.forEach(column => {
            let settings = [
            {
                'type': 'selector'
                ,'options': all_columns
                ,'default_value': column
                ,'name': 'column_name'
            }
             , {
                'type': 'input'
                ,'placeholder' : 'Column Name'
                ,'value': column
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
        });
        // widget.flowchart('run_activity', activityId);
    }

    _add_column(e, widget, activity){
        let all_columns = []
        let activityId = activity.activityId
        let columns_div = document.getElementById(activity.activityId + "_column_edit");
        if (columns_div == null || columns_div == undefined){
            let settings_div = document.getElementById('selected_activity_settings')
                columns_div = document.createElement('div')
            columns_div.id = this.activityId+ "_column_edit"
            settings_div.appendChild(columns_div)
        }
        this._setup_column_container(columns_div);
        this._enable_column_sorting(columns_div);
        const input_values = activity?.activity?.inputs?.input?.value?.values
        let sample = null
        if (Array.isArray(input_values)) {
            sample = input_values[0] || {}
        } else if (input_values && typeof input_values === "object") {
            sample = input_values
        }
        if (sample && typeof sample === "object") {
            Object.keys(sample).forEach(key => {
                const value = sample[key]
                if (value && typeof value === "object" && !Array.isArray(value)) {
                    Object.keys(value).forEach(child => {
                        all_columns.push(key + "." + child)
                    })
                } else {
                    all_columns.push(key)
                }
            })
        } else {
            const saved_select = activity?.activity?.settings?.select
            if (Array.isArray(saved_select)) {
                all_columns = saved_select
                    .map(item => item?.column_name || item?.columnName)
                    .filter(Boolean)
            }
        }
        if (all_columns.length === 0) {
            all_columns = [""]
        }

        let settings = [
            {
                'type': 'selector'
                ,'options': all_columns
                ,'default_value': ""
                ,'name': 'column_name'
            }
             , {
                'type': 'input'
                ,'placeholder' : 'Column Name'
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
        let settings = super.get_operation_settings('select')
        this.flowchart.flowchart('setSettings', this.activityId, settings)
        return settings
    }
    _on_selector_change(event, widget, activity){
        let parent_element = event.target.parentElement;
        let div = document.getElementById(activity.activityId+"_column_edit")
        if (event.target.name != 'column_name'){
            return
        }
        let total_dupes = 1
        let selected_column  = event.target.value
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
        event.target.parentElement.children[1].value =  name
        this.get_operation_settings()
    }
    _on_input_change(e, widget,activity){
        let parent_element = e.target.parentElement;
        // widget.flowchart('renameSelectColumn', activity.activityId, parent_element.id, e.target.value)
        this.get_operation_settings()
    }
}
