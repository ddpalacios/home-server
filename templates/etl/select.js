class Select_Activity extends Activity{
    constructor(flowchart,activity){
        super(flowchart,activity)
        this.settings = this.get_settings_element()
    }
    _create_column_header(){
        const header = document.createElement('div');
        header.className = "column-settings-header";
        ["Column", "Type", "Rename", "Drop"].forEach(label => {
            const span = document.createElement('span');
            span.textContent = label;
            header.appendChild(span);
        });
        return header;
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
        const existing_header = columns_div.querySelector(".column-settings-header");
        if (!existing_header) {
            columns_div.appendChild(this._create_column_header());
        }
    }
    _derive_datatypes(values){
        const datatypes = {}
        if (!Array.isArray(values) || values.length === 0) {
            return datatypes
        }
        const sample = values[0] || {}
        Object.keys(sample).forEach(key => {
            const value = sample[key]
            if (typeof value === 'string') {
                datatypes[key] = 'TEXT'
            } else if (typeof value === 'number') {
                datatypes[key] = 'INTEGER'
            } else if (typeof value === 'object') {
                datatypes[key] = 'LIST'
            } else {
                datatypes[key] = 'TEXT'
            }
        })
        return datatypes
    }
    _apply_select_to_values(values, selections){
        if (!Array.isArray(values)) {
            return []
        }
        if (!Array.isArray(selections) || selections.length === 0) {
            return values
        }
        return values.map(row => {
            const next_row = {}
            selections.forEach(selection => {
                const source = selection.columnName || selection.column_name
                const target = selection.new_column_name || selection.renamed_name || selection.as || source
                if (!source) {
                    return
                }
                next_row[target] = row[source]
            })
            return next_row
        })
    }
    _refresh_output_from_settings(widget, activity){
        const input_values = activity.activity.inputs?.input?.value?.values
        if (!Array.isArray(input_values) || input_values.length === 0) {
            return
        }
        const settings = this.get_operation_settings()
        const selections = settings?.select || []
        const next_values = this._apply_select_to_values(input_values, selections)
        const output_value = activity.activity.outputs?.output?.value || {}
        output_value.values = next_values
        output_value.datatypes = this._derive_datatypes(next_values)
        console.log("REFRESH OUTPUT", output_value)
        widget.flowchart('setoutputVal', activity.activityId, 'output', output_value)
        widget.flowchart('run_activity', activity.activityId)
        if (typeof update_missing_columns_message === "function") {
            const selected_id = widget.flowchart('getSelectedOperatorId')
            if (selected_id != null) {
                const settings_div = document.getElementById('selected_activity_settings')
                update_missing_columns_message(selected_id, settings_div)
            }
        }
    }
//  display_columns(){
//         let activity = this.activity
//         if (activity.inputs.input.value.values == null){
//             return
//         }
//         let all_columns = []
//         let columns_div = document.getElementById(activity.activityId + "_column_edit");
//         if (columns_div == null || columns_div == undefined){
//             let settings_div = document.getElementById('selected_activity_settings')
//                 columns_div = document.createElement('div')
//                 columns_div.style.display = 'flex'
//                 columns_div.style.flexDirection = 'column'
//                 columns_div.style.gap = "15px"

//             columns_div.id = this.activityId+ "_column_edit"
//             settings_div.appendChild(columns_div)
//         }

//           if (Array.isArray( activity.inputs.input.value.values)){
//             all_columns = Object.keys(activity.inputs.input.value.values[0])
//         }else{
//             all_columns = Object.keys(activity.inputs.input.value.values)

//         }
       
//         all_columns.forEach(column => {
//             let settings = [
//             {
//                 'type': 'selector'
//                 ,'options': all_columns
//                 ,'default_value': column
//                 ,'name': 'column_name'
//             },
//              {
//                 'type': 'selector'
//                 ,'options':[]
//                 ,'default_value': ""
//                 ,'name': 'data_type'
//             }
//              , {
//                 'type': 'input'
//                 ,'placeholder' : 'Column Name'
//                 ,'value': column
//                 ,'name': 'new_column_name'
//             }
//             ,{
//                 'type': 'button'
//                 ,'label': 'DROP'
//                 ,'color': 'red'
//             }]
//             let column_edit_element = this.get_column_selection_element(this.flowchart,settings)
//             columns_div.appendChild(column_edit_element)
//         });
     
//     }

    async _sync_columns(e, widget, activity){
        let activityId = activity.activityId
        let columns_div = document.getElementById(activity.activityId + "_column_edit");
        console.log("COLUMNS DIV", columns_div)
        const output_values = activity.activity.outputs?.output?.value?.values
        if (columns_div != null){
            columns_div.innerHTML = ""
            if ((!output_values || (Array.isArray(output_values) && output_values.length === 0)) &&
                activity.activity.link_from && activity.activity.link_from.length > 0) {
                let from_value = activity.activity.link_from[0].outputs.output.value
                widget.flowchart('setinputVal', activityId,'input',from_value)
            }
        }

        let all_columns = []
        let add_button = document.createElement("button")
        add_button.innerHTML = this.add_button_label
        add_button.className = 'buttons add-button'
        add_button.style.padding = "8px 12px";
        add_button.style.cursor = "pointer";
        add_button.style.transition = "background 0.2s ease";
        add_button.addEventListener("click", (event) => this._add_column(event, widget, this));
        if (columns_div == null || columns_div == undefined){
            let settings_div = document.getElementById('selected_activity_settings')
                columns_div = document.createElement('div')
                columns_div.style.display = 'flex'
                columns_div.style.flexDirection = 'column'
                columns_div.style.gap = "15px"

            columns_div.id = this.activityId+ "_column_edit"
            settings_div.appendChild(columns_div)
        }
        this._setup_column_container(columns_div, add_button)
        this._enable_column_sorting(columns_div)

        const operator_activity = widget.flowchart("getOperatorActivity", activity.activityId)
        const existing_settings = operator_activity?.settings?.select || []
        const input_values = activity.activity.inputs?.input?.value?.values
        const source_values = (Array.isArray(output_values) && output_values.length > 0) || (output_values && !Array.isArray(output_values))
            ? output_values
            : input_values
        if (Array.isArray(source_values) && source_values.length > 0){
            all_columns = Object.keys(source_values[0])
        }else if (source_values){
            all_columns = Object.keys(source_values)
        } else {
            all_columns = []
        }
        const datatypes = operator_activity?.inputs?.input?.value?.datatypes || {};
        const unique_datatypes = [...new Set(Object.values(datatypes))];
        if (Array.isArray(existing_settings) && existing_settings.length > 0) {
            const available_columns = all_columns.length > 0
                ? all_columns
                : existing_settings.map(item => item.columnName || item.column_name).filter(Boolean);
            existing_settings.forEach(setting => {
                const source = setting.columnName || setting.column_name;
                const rename = setting.new_column_name || setting.renamed_name || setting.as || source;
                let settings = [
                {
                    'type': 'selector'
                    ,'options': available_columns
                    ,'default_value': source || available_columns[0] || ""
                    ,'name': 'column_name'
                },
                 {
                    'type': 'selector'
                    ,'options': unique_datatypes
                    ,'default_value': datatypes[source] || unique_datatypes[0] || ""
                    ,'name': 'data_type'
                }
                 , {
                    'type': 'input'
                    ,'placeholder' : 'Column Name'
                    ,'value': rename || ""
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
            this._refresh_output_from_settings(widget, activity)
            return
        }
        if (all_columns.length === 0) {
            return
        }
        // Sync Columns button removed; auto-sync happens on selection.


        let target_activity = widget.flowchart('getOperatorActivity', activity.activityId)
        console.log("ACTIVITY FILE CHANGE", target_activity) 
        // let response = await run_activity_flow(target_activity,widget)
        // console.log("RESPONSE", response, activityId)
        //  widget.flowchart('setinputVal', activityId,'input',{'datatypes': response.datatypes, 'values': response.values})
        // widget.flowchart('setoutputVal', activityId,'output',response)
        all_columns.forEach(column => {
            let settings = [
            {
                'type': 'selector'
                ,'options': all_columns
                ,'default_value': column
                ,'name': 'column_name'
            },
             {
                'type': 'selector'
                ,'options': unique_datatypes
                ,'default_value': datatypes[column]
                ,'name': 'data_type'
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
            let select_val = {
                'select': column,
                'as': column,
                'datatype': datatypes[column],
                'id': column_edit_element.id
            }
            widget.flowchart('addSelectColumn', activity.activityId, select_val)
        });
        // widget.flowchart('run_activity', activityId);
        this._refresh_output_from_settings(widget, activity)
    }

    _add_column(e, widget, activity){
        let all_columns = []
        let activityId = activity.activityId
        let columns_div = document.getElementById(activity.activityId + "_column_edit");
        if (columns_div == null || columns_div == undefined){
            let settings_div = document.getElementById('selected_activity_settings')
                columns_div = document.createElement('div')
                columns_div.style.display = 'flex'
                columns_div.style.flexDirection = 'column'
                columns_div.style.gap = "5px"
            columns_div.id = this.activityId+ "_column_edit"
            settings_div.appendChild(columns_div)
        }
        const add_button = columns_div.querySelector(".column-settings-actions .add-button");
        if (add_button) {
            this._setup_column_container(columns_div, add_button);
        }
        this._enable_column_sorting(columns_div)
          if (Array.isArray( activity.activity.inputs.input.value.values)){
            all_columns = Object.keys(activity.activity.inputs.input.value.values[0])
        }else{
            all_columns = Object.keys(activity.activity.inputs.input.value.values)

        }
        let datatypes = widget.flowchart("getOperatorActivity", activity.activityId).inputs.input.value.datatypes;
        let s = new Set(Object.values(datatypes));
        datatypes = [...s]
        let settings = [
            {
                'type': 'selector'
                ,'options': all_columns
                ,'default_value': ""
                ,'name': 'column_name'
            },
             {
                'type': 'selector'
                ,'options':datatypes
                ,'default_value': datatypes[0]
                ,'name': 'data_type'
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
    get_operation_settings(){
        let settings = super.get_operation_settings('select')
        this.flowchart.flowchart('setSettings', this.activityId, settings)
        return settings
    }
    _on_button_click(event, widget, activity){
        const row = event.target.closest(".rename_settings") || event.target.parentElement;
        if (row) {
            widget.flowchart('removeSelectColumn', activity.activityId, row.id);
        }
        const wrapper = event.target.closest(".select-column-row");
        if (wrapper) {
            wrapper.remove();
            this._refresh_output_from_settings(widget, activity)
            return;
        }
        if (row) {
            row.remove();
            this._refresh_output_from_settings(widget, activity)
        }
    }
    _on_selector_change(event, widget, activity){
        let parent_element = event.target.parentElement;
        let div = document.getElementById(activity.activityId+"_column_edit")
        console.log("Name: ", event.target.name)
        if (event.target.name === 'data_type'){
            widget.flowchart(
                'changeDataTypeSelectColumn',
                activity.activityId,
                parent_element.id,
                event.target.value
            )
            return
        }
        if (event.target.name != 'column_name'){
            return
        }
        let total_dupes = 1
        let selected_column  = event.target.value
        let name = selected_column

        let current_named_columns = []
        for (let i =0; i < div.children.length; i++){
            const row = div.children[i].classList.contains("select-column-row")
                ? div.children[i].querySelector(".rename_settings")
                : div.children[i];
            if (!row || row.className != 'rename_settings'){continue}
            current_named_columns.push(row.children[2].value)
        }
        while(1){
            if (current_named_columns.includes(name)){
                name  = selected_column + "_" +total_dupes.toString()
                total_dupes +=1
            }else{
                break
            }
        }
        let datatypes = widget.flowchart('getOperatorActivity', activity.activityId).inputs.input.value.datatypes;
        let datatype = datatypes[selected_column]
        console.log("Data type", datatype)
        event.target.parentElement.children[1].value =  datatype

        event.target.parentElement.children[2].value =  name

        if (selected_column) {
            let select_val = {
                'select': selected_column,
                'as': name,
                'datatype': datatype,
                'id': parent_element.id
            }
            widget.flowchart('addSelectColumn', activity.activityId, select_val)
        }
        this._refresh_output_from_settings(widget, activity)

        // if (event.target.name == 'data_type'){
        //     let parent_element = event.target.parentElement;
        //     widget.flowchart('changeDataTypeSelectColumn', activity.activityId, parent_element.id, event.target.value)
        //     return
        // }

        // let selected_column  = event.target.value
        // if (selected_column != "" && parent_element.children.length > 4){
        //     parent_element.children[3].DROP()
        // }
        // if (selected_column == "" && parent_element.children.length == 4){
        //     let input = document.createElement('input')
        //     input.name = 'custom_value'
        //     input.placeholder = "Column Value"
        //     input.addEventListener("change", (event) => this._on_input_change(event, widget, this));
        //     let children = parent_element.children;
        //     let insertIndex = children.length - 1;
        //     parent_element.insertBefore(input, children[insertIndex]);
        // }
        // let div = document.getElementById(activity.activityId+"_column_edit")
        // let current_named_columns = []
        // for (let i =0; i < div.children.length; i++){
        //     if (div.children[i].className != 'rename_settings'){continue}
        //     current_named_columns.push(div.children[i].children[2].value)
        // }
        // let total_dupes = 1
        // let name = selected_column
        // while(1){
        //     if (current_named_columns.includes(name)){
        //         name  = selected_column + "_" +total_dupes.toString()
        //         total_dupes +=1
        //     }else{
        //         break
        //     }
        // }

        // let datatypes = widget.flowchart('getOperatorActivity', activity.activityId).settings.datatypes;
        // let datatype = datatypes[selected_column]


        // event.target.parentElement.children[2].value =  name
        // event.target.parentElement.children[1].value =  datatype
        // let select_val = {'select': selected_column, 'as': name, 'datatype': datatype, 'id':event.target.parentElement.id }
        // widget.flowchart('addSelectColumn', activity.activityId, select_val)
        // console.log(widget.flowchart('getOperatorActivity', activity.activityId))
    }
    _on_input_change(e, widget,activity){
        if (e.target.name == 'custom_value'){
            let parent_element = e.target.parentElement;
            console.log(e.target.value)
            widget.flowchart('addCustomValue', activity.activityId, parent_element.id, e.target.value)
            return
        }

        let parent_element = e.target.parentElement;
        console.log(e.target.value)
        widget.flowchart('renameSelectColumn', activity.activityId, parent_element.id, e.target.value)
        this._refresh_output_from_settings(widget, activity)
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
}
