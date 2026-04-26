function jsonToCsv(jsonData) {
    let csv = '';
    
    const headers = Object.keys(jsonData[0]);
    csv += headers.join(',') + '\n';
    
    jsonData.forEach(obj => {
        const values = headers.map(header => obj[header]);
        csv += values.join(',') + '\n';
    });
    
    return csv;
}

function csvToJson(text, headers, quoteChar = '"', delimiter = ',') {
  const regex = new RegExp(`\\s*(${quoteChar})?(.*?)\\1\\s*(?:${delimiter}|$)`, 'gs');

  const match = line => [...line.matchAll(regex)]
    .map(m => m[2])  // we only want the second capture group
    .slice(0, -1);   // cut off blank match at the end

  const lines = text.split('\n');
  const heads = headers ?? match(lines.shift());

  return lines.map(line => {
    return match(line).reduce((acc, cur, i) => {
      // Attempt to parse as a number; replace blank matches with `null`
      const val = cur.length <= 0 ? null : Number(cur) || cur;
      const key = heads[i] ?? `extra_${i}`;
      return { ...acc, [key]: val };
    }, {});
  });
}

class Import_Activity extends Activity{
    constructor(flowchart,activity){
        super(flowchart,activity)
        this.operation_type = "select"
        this.settings = this.get_settings_element()
    }
    // _create_column_header(){
    //     const header = document.createElement('div');
    //     header.className = "column-settings-header";
    //     ["Column", "Rename", "Drop"].forEach(label => {
    //         const span = document.createElement('span');
    //         span.textContent = label;
    //         header.appendChild(span);
    //     });
    //     return header;
    // }

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

        // const existing_header = columns_div.querySelector(".column-settings-header");
        // if (!existing_header) {
        //     columns_div.appendChild(this._create_column_header());
        // }
    }

    get_settings_element(){
        let div = super.get_settings_element();
        const file_section = document.createElement('div');
        file_section.id = this.activityId + "_file_settings";
        file_section.style.display = "flex";
        file_section.style.flexDirection = "column";
        file_section.style.gap = "8px";
        file_section.style.padding = "6px 0 0";

        const file_label = document.createElement('label');
        file_label.textContent = "Upload File";
        file_label.style.color = "black";
        file_section.appendChild(file_label);

        const existing_file_input = div.querySelector('input[type="file"]');
        if (existing_file_input) {
            existing_file_input.remove();
            existing_file_input.className = "file-input";
            existing_file_input.style.width = "25%";
            file_section.appendChild(existing_file_input);
        } else {
            const file_input = document.createElement('input');
            file_input.type = 'file';
            file_input.className = "file-input";
            file_input.style.width = "25%";
            file_input.addEventListener("change", (event) => this._inputFile_onchange(event, this.flowchart, this));
            file_section.appendChild(file_input);
        }

        div.insertBefore(file_section, div.firstChild);

        return div;
    }

    _setInput(widget, activityId, inputValue){
        widget.flowchart('setinputVal', activityId,'input',{'datatypes': null, 'values': inputValue})
    }

    _setOutput(widget, activityId, outputVal){
        widget.flowchart('setoutputVal', activityId,'output',outputVal)
    }

    async _inputFile_onchange(e, widget, activity){ 
        let activityId = activity.activityId
        const file = e.target.files?.item(0);
        if (!file) {
            e.preventDefault();
            console.warn("No file selected, keeping existing content.");
            return;
        }
        let obj = null
        if (file.name.includes(".json")){
                let text = await file.text();
                obj = JSON.parse(text);
                this._setInput(widget, activityId, obj);

        }
        if (file.name.includes('.csv')){
            let text = await file.text();
            obj = csvToJson(text);
            this._setInput(widget, activityId, obj);
            obj = obj[0]
        }
        if (obj == null){
            alert("Invalid File. Not a CSV or JSON.");
            return
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
        let current_flow_input  = activity.activity.inputs.input.value.values;
        this._enable_column_sorting(columns_div);
        if (Array.isArray( current_flow_input)){
            all_columns = Object.keys(current_flow_input[0])
        }else{
            all_columns = Object.keys(current_flow_input)

        }
        this._setOutput(widget, activityId, current_flow_input);
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
        if (Array.isArray(input_values)) {
            all_columns = Object.keys(input_values[0] || {})
        } else if (input_values && typeof input_values === "object") {
            all_columns = Object.keys(input_values)
        } else {
            const saved_select = activity?.activity?.settings?.select
            if (Array.isArray(saved_select)) {
                all_columns = saved_select
                    .map(item => item?.column_name || item?.columnName)
                    .filter(Boolean)
            }
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
        // console.log("Name: ", event.target.name)
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
        this.get_operation_settings()
    }
}
