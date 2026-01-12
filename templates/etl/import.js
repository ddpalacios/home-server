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
                const source = selection.column_name
                const target = selection.renamed_name || source
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
        console.log("REFRESH SETTINGS", settings)
        const selections = settings?.select || []
        const next_values = this._apply_select_to_values(input_values, selections)
        const output_value = activity.activity.outputs?.output?.value || {}
        output_value.values = next_values
        output_value.datatypes = this._derive_datatypes(next_values)
        console.log("OUTPUT VALUE", output_value)
        widget.flowchart('setoutputVal', activity.activityId, 'output', output_value)
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
                widget.flowchart('setinputVal', activityId,'input', {'datatypes': null, 'values': obj})

        }
        if (file.name.includes('.csv')){
            let text = await file.text();
            obj = csvToJson(text);
            widget.flowchart('setinputVal', activityId,'input',{'datatypes': null, 'values': obj})
            obj = obj[0]
        }
        if (obj == null){
            alert("Invalid File. Not a CSV or JSON.");
            return
        }

        let all_columns = []
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

          if (Array.isArray( activity.activity.inputs.input.value.values)){
            all_columns = Object.keys(activity.activity.inputs.input.value.values[0])
        }else{
            all_columns = Object.keys(activity.activity.inputs.input.value.values)

        }
        // let datatypes = widget.flowchart("getOperatorActivity", activity.activityId).inputs.input.value.datatypes;
        // let s = new Set(Object.values(datatypes));
        // datatypes = [...s]


        let target_activity = widget.flowchart('getOperatorActivity', activity.activityId)
        // console.log("ACTIVITY FILE CHANGE", target_activity) 
        let loading_text = document.createElement("h1");
		loading_text.textContent = "Loading...";
		loading_text.style.color = "black";
		columns_div.prepend(loading_text);
        let response = await run_activity_flow(target_activity,widget)
		columns_div.removeChild(loading_text)

        // console.log("RESPONSE", response, activityId)
        const inferDatatypes = (values) => {
            const sample = Array.isArray(values) ? values[0] : values;
            if (!sample || typeof sample !== "object") {
                return {};
            }
            const inferred = {};
            Object.keys(sample).forEach((key) => {
                const value = sample[key];
                if (value == null) {
                    inferred[key] = "string";
                } else if (Array.isArray(value)) {
                    inferred[key] = "object";
                } else {
                    inferred[key] = typeof value;
                }
            });
            return inferred;
        };

        if (!response || !response.datatypes) {
            const currentValues = activity.activity.inputs.input.value.values;
            response = {
                datatypes: inferDatatypes(currentValues),
                values: currentValues
            };
        }
        widget.flowchart('setinputVal', activityId,'input',{'datatypes': response.datatypes, 'values': response.values})
        widget.flowchart('setoutputVal', activityId,'output',response)
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
                ,'options': [...new Set(Object.values(response.datatypes || {}))]
                ,'default_value': (response.datatypes || {})[column]
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
        });
        widget.flowchart('run_activity', activityId);
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
    _on_button_click(event, widget, activity){
        const row = event.target.closest(".rename_settings") || event.target.parentElement;
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
        let settings = super.get_operation_settings('select') || {};
        const columns = [];
        const column_container = document.getElementById(this.activityId + "_column_edit");
        if (column_container) {
            const rows = column_container.querySelectorAll(".rename_settings");
            rows.forEach((row) => {
                const columnSelect = row.querySelector('select[name="column_name"]');
                const dataTypeSelect = row.querySelector('select[name="data_type"]');
                const renameInput = row.querySelector('input[name="new_column_name"]');
                if (!columnSelect || !dataTypeSelect || !renameInput) {
                    return;
                }
                columns.push({
                    column_name: columnSelect.value,
                    renamed_name: renameInput.value,
                    data_type: dataTypeSelect.value
                });
            });
        }
        settings.select = columns;
        const source_select = document.getElementById(this.activityId + "_source_type");
        const source_type = source_select ? source_select.value : "file";
        const api_url = document.getElementById(this.activityId + "_api_url");
        const api_method = document.getElementById(this.activityId + "_api_method");
        const api_headers = document.getElementById(this.activityId + "_api_headers");
        const api_body = document.getElementById(this.activityId + "_api_body");

        const api_settings = {
            url: api_url ? api_url.value.trim() : "",
            method: api_method ? api_method.value : "GET",
            headers: api_headers ? api_headers.value.trim() : "",
            body: api_body ? api_body.value.trim() : ""
        };

        settings.source = source_type;
        if (source_type === "api" && (api_settings.url || api_settings.headers || api_settings.body)) {
            settings.api = api_settings;
        }

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
        for (let i =0; i < div.children.length; i++){
            if (div.children[i].className != 'rename_settings'){continue}
            current_named_columns.push(div.children[i].children[2].value)
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
        // console.log("Data type", datatype)
        event.target.parentElement.children[1].value =  datatype

        event.target.parentElement.children[2].value =  name
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
        let parent_element = e.target.parentElement;
        widget.flowchart('renameSelectColumn', activity.activityId, parent_element.id, e.target.value)
        this._refresh_output_from_settings(widget, activity)
    }
}
