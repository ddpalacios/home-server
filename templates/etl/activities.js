class Settings{
        constructor(flowchart,activity){
        this.activity = activity
        this.activityId = activity.operatorId
        this.flowchart = flowchart
        this.add_button_label = "+ Add"
        this.add_button_element = null;
        this.operation_settings = null
        }
    get_input_value_columns(){
         let input_value;
         let all_columns;
        if (Array.isArray( this.activity.inputs.input.value.values)){
            all_columns = Object.keys(this.activity.inputs.input.value.values[0])
            input_value = this.activity.inputs.input.value.values[0]
        }else{
            all_columns = Object.keys(this.activity.inputs.input.value.values)
            input_value = this.activity.inputs.input.value.values
        }
        return all_columns
    }
    get_output_columns(){
        if (this.activity.inputs.input.value.values == null){
            return
        }
         let current_output = this.activity.inputs.input.value.values
         if (Array.isArray(current_output)){
            return Object.keys(current_output[0])
         }else{
            return Object.keys(current_output)
         }
    }
    _add_custom_value(e, widget, activity){
        let parent_element = e.target.parentElement;
        console.log(e.target.value)
        widget.flowchart('addCustomValue', activity.activityId, parent_element.id, e.target.value)

    }
    // _add_column(e, widget, activity){
    //     let all_columns = []
    //     let activityId = activity.activityId
    //     if (Array.isArray( activity.activity.inputs.input.value.values)){
    //         all_columns = Object.keys(activity.activity.inputs.input.value.values[0])
    //     }else{
    //         all_columns = Object.keys(activity.activity.inputs.input.value.values)

    //     }
    //     let settings = [
    //         {
    //             'type': 'selector'
    //             ,'order':1
    //             ,'options':all_columns
    //             ,'default_value': ""
    //             ,'name':'column_name'
    //         },
    //          {
    //             'type': 'selector'
    //             ,'order':2
    //             ,'options': ['string', 'int']
    //             ,'default_value': ""
    //             ,'name':'data_type'
    //         }
    //          , {
    //             'type': 'input'
    //             ,'order':3
    //             ,'placeholder' : 'Column Name'
    //         }
    //         ,{
    //             'type': 'input'
    //             ,'order':4
    //             ,'placeholder' : 'Column Value'
    //             ,'name':'custom_value'
    //         }
    //         ,{
    //             'type': 'button'
    //             ,'order':5
    //             ,'label': 'remove'
    //             ,'color': 'red'
    //         }]
    //         let columns_div = document.getElementById(activityId+"_column_edit")
    //         let column_edit_element = this.get_column_selection_element(widget,settings)
    //         columns_div.appendChild(column_edit_element)
    //         let select_val = {'select': "", 'as': "", 'datatype':"",'id':column_edit_element.id }
    //         widget.flowchart('addSelectColumn', activity.activityId, select_val)
    // }
    _on_button_click(e, widget, activity){
        let parent_element = e.target.parentElement;
        if (parent_element && parent_element.closest) {
            const wrapper = parent_element.closest(".select-column-row");
            if (wrapper) {
                wrapper.remove();
                return;
            }
        }
        parent_element.remove()
        // console.log("deleting", parent_element.id)
        // widget.flowchart('removeSelectColumn', activity.activityId, parent_element.id)
    }
    _on_selector_change(e, widget,activity){
        let parent_element = e.target.parentElement;
        console.log(e.target.value)
        // widget.flowchart('changeDataTypeSelectColumn', activity.activityId, parent_element.id, e.target.value)
    }
    _on_input_change(e, widget,activity){
        let parent_element = e.target.parentElement;
        console.log(e.target.value)
        // widget.flowchart('renameSelectColumn', activity.activityId, parent_element.id, e.target.value)
    }
    _on_column_select(e, widget, activity){
        let selected_column  = e.target.value
        let div = document.getElementById(activity.activityId+"_column_edit")
        let current_named_columns = []
        for (let i =0; i < div.children.length; i++){
            if (div.children[i].className != 'rename_settings'){continue}
            current_named_columns.push(div.children[i].children[2].value)
        }
        let total_dupes = 1
        let name = selected_column
        while(1){
            if (current_named_columns.includes(name)){
                name  = selected_column + "_" +total_dupes.toString()
                total_dupes +=1
            }else{
                break
            }
        }

        let datatypes = widget.flowchart('getOperatorActivity', activity.activityId).settings.datatypes;
        console.log("Looking for", selected_column, 'in', datatypes)
        let datatype = datatypes[selected_column]


          e.target.parentElement.children[2].value =  name
          e.target.parentElement.children[1].value =  datatype
          let select_val = {'select': selected_column, 'as': name, 'datatype': datatype, 'id':e.target.parentElement.id }
          widget.flowchart('addSelectColumn', activity.activityId, select_val)
          console.log(widget.flowchart('getOperatorActivity', activity.activityId))
    }
    _update_activity(e, widget, activity){
        // console.log("UPDATIN INPUTS", activity)
        activity = activity.activity
        let link_from_output = activity.link_from[0].outputs.output.value
         widget.flowchart('setinputVal', activity.operatorId,'input', link_from_output)

    }
     get_selector_element(options, default_value) {
    const selected_options = [];

    if (default_value === "") {
        selected_options.push('<option value="" selected></option>');
    }

    options.forEach(element => {
        if (element === default_value) {
            selected_options.push(`<option value="${element}" selected>${element}</option>`);
        } else {
            selected_options.push(`<option value="${element}">${element}</option>`);
        }
    });

    const selectHTML = `<select>${selected_options.join('')}</select>`;

    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = selectHTML;
    return tempDiv.firstElementChild;
}
    get_multiple_selector_element(options, default_value){
        const selected_options = [];
    if (default_value === "") {
    selected_options.push('<option value="" selected></option>');
}

    options.forEach(element => {
        if (Array.isArray(default_value) && default_value.includes(element)) {
            selected_options.push(`<option value="${element}" selected>${element}</option>`);
        } else if (element === default_value) {
            selected_options.push(`<option value="${element}" selected>${element}</option>`);
        } else {
            selected_options.push(`<option value="${element}">${element}</option>`);
        }
    });

    const selectHTML = `<select multiple size="5">${selected_options.join('')}</select>`;
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = selectHTML;
    return tempDiv.firstElementChild;

}

     get_column_selection_element(widget,rows,flexDirection){
        let div = document.createElement('div')
        div.className = 'rename_settings'
        div.id = crypto.randomUUID();
        if (flexDirection != null || flexDirection != undefined){
            div.style.display = 'flex'
            div.style.flexDirection = flexDirection
        }
        rows.forEach(element => {
            let elem_type = element['type']
            if (elem_type == 'selector'){
                let options = element['options']
                let default_value =element['default_value']
                let selector_element;
                if (element?.ismultiple!= undefined && element?.ismultiple !=null){
                    selector_element= this.get_multiple_selector_element(options, default_value)
                }else{
                 selector_element = this.get_selector_element(options,default_value)
                }
                selector_element.className = "item_select"
                selector_element.name = element?.name
                selector_element.disabled = element?.disabled
                selector_element.addEventListener("change", (event) => this._on_selector_change(event, widget, this));
                div.appendChild(selector_element)
            }
            if (elem_type == 'input'){
                let input = document.createElement('input')
                input.placeholder = element['placeholder']
                input.className = "text_input_value"

                input.name = element?.name
                if (element?.value != undefined){
                    input.value = element?.value
                }
                input.addEventListener("change", (event) => this._on_input_change(event, widget, this));
                input.addEventListener("input", (event) => this._on_input_change(event, widget, this));
                div.appendChild(input)
            }
            if (elem_type == 'button'){
                let button = document.createElement('button')
                button.className = "buttons"
                button.innerHTML = element['label']
                button.style.color = element['color']
                if (element['color'] === 'red') {
                    button.classList.add('danger-button')
                    button.setAttribute('data-action', 'drop')
                }
                button.addEventListener("click", (event) => this._on_button_click(event, widget, this));
                div.appendChild(button)
            }
             if (elem_type == 'span'){
                let span = document.createElement('span')
                span.innerHTML = element['label']
                span.style.color = element['color']
                div.appendChild(span)
            }
             if (elem_type == 'div'){
                let span = document.createElement('span')
                span.innerHTML = element['label']
                span.style.color = element['color']
                div.appendChild(span)
            }
            
        });
        return div

}

    get_settings_element(){
        let div = document.createElement('div')
        div.id = this.activityId
        let add_div = document.createElement('div')
        let add_button = document.createElement('button')
        add_button.className = "buttons"
        this.add_button_element = add_button

        // let add_button = document.createElement('button')
        // add_button.setAttribute('operatorId', this.activityId)
        // add_button.innerHTML = this.add_button_label
        // add_button.className = 'buttons'
        // add_button.style.color = 'black'
        // this.add_button_element = add_button
        // add_button.addEventListener("click", (event) => this._add_column(event, this.flowchart, this));

        // div.appendChild(add_div)
        if (this.activity.activityType == 'import'){
            const input = document.createElement('input');
            input.type = 'file';
            input.addEventListener("change", (event) => this._inputFile_onchange(event, this.flowchart, this));
            div.appendChild(input)
        }
        else if (this.activity.activityType == 'select'){
                // Add button is managed by Select_Activity settings UI.
            }
         
        else {
          

            let add_button = document.createElement("button")
            add_button.innerHTML = this.add_button_label
            add_button.className = 'buttons add-button'
            add_button.style.padding = "8px 12px";
            add_button.style.cursor = "pointer";
            add_button.style.transition = "background 0.2s ease";
            add_button.addEventListener("click", (event) => this._add_column(event, this.flowchart, this));
            div.appendChild(add_button)
        }
        // else{
        //     const button = document.createElement('button');
        //     button.innerHTML = "Update View"
        //     button.addEventListener("click", (event) => this._update_activity(event, this.flowchart, this));
        //     div.appendChild(button)

        // }
        if (this.activity.outputs.output.value?.values == null || this.activity.outputs.output.value?.values == undefined){
            // console.log("Returning empty")
            return div
        }

        let current_output = this.activity.outputs.output.value.values
        let columns_div = document.createElement('div')
        if (Array.isArray(current_output)){
            Object.keys(current_output[0]).forEach(key => {
                    let data_type =  typeof current_output[0][key]
                    if (data_type == 'string'){
                        data_type = 'TEXT'
                    }
                    if (data_type == 'number'){
                        data_type = 'INTEGER'
                    }
                    if (data_type == 'decimal'){
                        data_type = 'DECIMAL'
                    }
                    if (data_type == 'object'){
                        data_type = 'LIST'
                    }
                    let record = {'operatorId':this.activityId,'columnName': key, 'dataType': data_type,'updatedName': key}
                    let column_edit_element = this.get_column_selection_element(this.flowchart,Object.keys(current_output[0]),record)
                    columns_div.appendChild(column_edit_element)
            })
        }else{
                let expanded_input_values = expand_struct(this.activity.outputs.output.value.values)
                let all_available_columns = Object.keys(expanded_input_values)
                 all_available_columns.forEach(key => {
                        let data_type =  typeof expanded_input_values[key]
                        if (data_type == 'string'){
                            data_type = 'TEXT'
                        }
                        if (data_type == 'number'){
                            data_type = 'INTEGER'
                        }
                        if (data_type == 'decimal'){
                            data_type = 'DECIMAL'
                        }
                        if (data_type == 'object'){
                            data_type = 'LIST'
                        }
                        let record = {'operatorId':this.activityId,'columnName': key, 'dataType':data_type,'updatedName':expanded_input_values[key]}
                        let column_edit_element = this.get_column_selection_element(this.flowchart,Object.keys(expanded_input_values),record)
                        columns_div.appendChild(column_edit_element)
                });

        }
        div.appendChild(columns_div)
        return div
    }
    get_operation_settings(type) {
    const record = document.getElementById(this.activityId + "_column_edit");

    if (type == 'aggregate'){
        // console.log("GETTING SORTS ACTIVITG ID", this.activityId + "_column_edit")
        // console.log("GETTING SORTS RECORD",record)

        // console.log("GETTING SORTS CHILDREN",record.children)
    }

    if (!record) return null;

    const statements = [];
    for (let i = 0; i < record.children.length; i++) {
        let row = record.children[i];
        if (row && row.classList && row.classList.contains("select-column-row")) {
            const inner_row = row.querySelector(".rename_settings");
            if (inner_row) {
                row = inner_row;
            }
        }
        if (!row || !row.children) {
            continue;
        }
        const statement = {};

        const named_elements = row.querySelectorAll("[name]");
        for (let j = 0; j < named_elements.length; j++) {
            const element = named_elements[j];
         

            if (!element.name) continue;

            switch (element.name) {
                case 'column_name_1':
                    // First column selector (e.g., join/combine/replace left side).
                    statement.columnName_1 = element.value;
                    statement.row_id = row.id
                    continue
                case 'column_name_2':
                    // Second column selector (e.g., join/combine/replace right side).
                    statement.columnName_2 = element.value;
                    statement.row_id = row.id
                    continue
                case 'new_column_name':
                    // Rename target or newly created column name.
                    statement.new_column_name = element.value;
                    statement.row_id = row.id
                    continue
                case 'new_column_name_1':
                    // First output name (e.g., split part 1 column name).
                    statement.new_column_name_1 = element.value;
                    statement.row_id = row.id
                    continue
                case 'new_column_name_2':
                    // Second output name (e.g., split part 2 column name).
                    statement.new_column_name_2 = element.value;
                    statement.row_id = row.id
                    continue
                case 'multiple_column_names':
                    // Multi-select column list (e.g., group-by columns).
                    const selectedValues = Array.from(element.selectedOptions).map(opt => opt.value);
                    statement.columnName = selectedValues;
                    statement.row_id = row.id
                    continue
                case 'column_name':
                    // Single column selector for the row.
                    statement.columnName = element.value;
                    statement.row_id = row.id
                    continue
                case 'case':
                    // Flag-like selector (e.g., split drop original TRUE/FALSE).
                    statement.case = element.value;
                    statement.row_id = row.id
                    continue
                case 'data_type':
                    // Selected data type for the row/column.
                    statement.data_type = element.value;
                    statement.row_id = row.id
                    continue
                case 'orderby':
                    // Sort direction (ASC/DESC).
                    statement.orderby = element.value;
                    statement.row_id = row.id
                    continue
                case 'operation':
                    // Operation selector (e.g., filter/custom/replace/combine op).
                    statement.operation = element.value;
                    statement.row_id = row.id
                    continue
                case 'condition_value':
                    // Condition value for comparisons.
                    statement.condition_value = element.value;
                    statement.row_id = row.id
                    continue
                case 'find_value':
                    // Replacement search value/pattern.
                    statement.find_value = element.value;
                    statement.row_id = row.id
                    continue
                case 'value':
                    // Generic value input (delimiter, replacement, etc.).
                    statement.value = element.value;
                    statement.row_id = row.id
                    continue
                case 'replace_value_source':
                    // Replace: source for replacement value (manual/column).
                    statement.replace_value_source = element.value;
                    statement.row_id = row.id
                    continue
                case 'replace_value_column':
                    // Replace: column used when replacement source is column.
                    statement.replace_value_column = element.value;
                    statement.row_id = row.id
                    continue
                case 'value_source':
                    // Source for default value (manual/current date/current datetime).
                    statement.value_source = element.value;
                    statement.row_id = row.id
                    continue
                case 'value_offset_direction':
                    // Date offset direction for filter value.
                    statement.value_offset_direction = element.value;
                    statement.row_id = row.id
                    continue
                case 'value_offset_amount':
                    // Date offset amount for filter value.
                    statement.value_offset_amount = element.value;
                    statement.row_id = row.id
                    continue
                case 'value_offset_unit':
                    // Date offset unit for filter value.
                    statement.value_offset_unit = element.value;
                    statement.row_id = row.id
                    continue
                case 'date_start_column':
                    // Start column for date diff.
                    statement.date_start_column = element.value;
                    statement.row_id = row.id
                    continue
                case 'date_end_column':
                    // End column for date diff.
                    statement.date_end_column = element.value;
                    statement.row_id = row.id
                    continue
                case 'date_base_column':
                    // Base date column for date math.
                    statement.date_base_column = element.value;
                    statement.row_id = row.id
                    continue
                case 'date_days_column':
                    // Days offset column for date math.
                    statement.date_days_column = element.value;
                    statement.row_id = row.id
                    continue
                case 'date_compare_column':
                    // Date column for current datetime comparison.
                    statement.date_compare_column = element.value;
                    statement.row_id = row.id
                    continue
                case 'then_value':
                    // Then-branch value (custom/replace).
                    statement.then_value = element.value;
                    statement.row_id = row.id
                    continue
                case 'else_value':
                    // Else-branch value (custom/replace).
                    statement.else_value = element.value;
                    statement.row_id = row.id
                    continue
                case 'logical':
                    // Logical join for conditions (AND/OR).
                    statement.logical = element.value;
                    statement.row_id = row.id
                    continue
                case 'url':
                    // HTTP request URL.
                    statement.url = element.value;
                    statement.row_id = row.id
                    continue
                case 'request_type':
                    // HTTP method.
                    statement.request_type = element.value;
                    statement.row_id = row.id
                    continue
                case 'headers':
                    // HTTP headers.
                    statement.headers = element.value;
                    statement.row_id = row.id
                    continue
                case 'body':
                    // HTTP request body.
                    statement.body = element.value;
                    statement.row_id = row.id
                    continue
                case 'unroll_by':
                    // Flatten array field to unroll.
                    statement.unroll_by = element.value;
                    statement.row_id = row.id
                    continue
                case 'pagination_mode':
                    // Pagination mode for HTTP requests.
                    statement.pagination_mode = element.value;
                    statement.row_id = row.id
                    continue
                case 'offset_param':
                    // Offset pagination query param name.
                    statement.offset_param = element.value;
                    statement.row_id = row.id
                    continue
                case 'limit_param':
                    // Offset pagination limit param name.
                    statement.limit_param = element.value;
                    statement.row_id = row.id
                    continue
                case 'limit_value':
                    // Offset pagination limit value.
                    statement.limit_value = element.value;
                    statement.row_id = row.id
                    continue
                case 'total_rows_property':
                    // Offset pagination total rows json path.
                    statement.total_rows_property = element.value;
                    statement.row_id = row.id
                    continue
                case 'next_page_property':
                    // Next page URL property path.
                    statement.next_page_property = element.value;
                    statement.row_id = row.id
                    continue
                case 'continuation_property':
                    // Continuation token JSON path.
                    statement.continuation_property = element.value;
                    statement.row_id = row.id
                    continue
                case 'continuation_query_param':
                    // Continuation token query param name.
                    statement.continuation_query_param = element.value;
                    statement.row_id = row.id
                    continue
                case 'header_key':
                    // HTTP header key.
                    statement.header_key = element.value;
                    statement.row_id = row.id
                    continue
                case 'header_value':
                    // HTTP header value.
                    statement.header_value = element.value;
                    statement.row_id = row.id
                    continue
            }
        }
        if (Object.keys(statement).length > 0){
        statements.push(statement);

        }

    }
    console.log("STATEMENTS", statements)
    let normalized_statements = statements
    if (type == 'select') {
        normalized_statements = statements.map(statement => {
            return {
                column_name: statement.columnName,
                renamed_name: statement.new_column_name || statement.columnName,
                data_type: statement.data_type
            }
        })
    }
    if (type == 'flatten') {
        normalized_statements = statements.map(statement => {
            return {
                unroll_by: statement.unroll_by || statement.columnName || statement.column_name
            }
        })
    }
    this.operation_settings = { [type]: normalized_statements };
    return this.operation_settings;
}

}

class Activity extends Settings{
    constructor(flowchart,activity){
        super(flowchart, activity)
        this.activity = activity
        this.activityId = activity.operatorId
        this.flowchart = flowchart
    }
    async run(){
    let body = {
        'activity_type' :  this.activity.activityType
        ,'operations':  this.get_operation_settings("where")
        ,'data':  this.activity.inputs.input.value.values
    }
    // console.log("RUN",body)
    // var request = new Request('/etl/run/', {
    //                             method: 'POST',
    //                             headers: new Headers({
    //                                         'Accept': 'application/json'
    //                                     })
	// 		       ,body: JSON.stringify(body)
    //                 });
    // var response = await fetch(request);
    // if (response.ok){ 
    //     try{
    //         const data = await response.json()
    //         this.flowchart.flowchart('setoutputVal', this.activityId,'output',data)
    //         return data;
    //     }catch(error){}
    // }
    // return null;

    
}


}

function export_data(data){
    const blob = new Blob([data], { type: 'text/csv' });
    // Create a URL for the Blob
    const url = URL.createObjectURL(blob);
    // Create an anchor tag for downloading
    const a = document.createElement('a');
    // Set the URL and download attribute of the anchor tag
    a.href = url;
    a.download = 'download.csv';
    // Trigger the download by clicking the anchor tag
    a.click();
}

// function jsonToCsv(jsonData) {
//     let csv = '';
    
//     const headers = Object.keys(jsonData[0]);
//     csv += headers.join(',') + '\n';
    
//     jsonData.forEach(obj => {
//         const values = headers.map(header => obj[header]);
//         csv += values.join(',') + '\n';
//     });
    
//     return csv;
// }

// function csvToJson(csv) {
//   const lines = csv.split("\n");
//   const headers = lines[0].split(",");
//   const result = lines.slice(1).map(line => {
//     const values = line.split(",");
//     return headers.reduce((acc, header, index) => {
//       header = header.replace("\"","")
//       header = header.replace("\"","")
//       acc[header] = values[index];
//       return acc;
//     }, {});
//   });
//   return result;
// }



function key_name_change(obj,element){
     let original_key = element.getAttribute('data-info')
     let new_key = element.value
    if (obj.hasOwnProperty(original_key)){
        let value = obj[original_key]
        delete obj[original_key]
        obj[new_key] = value
        original_key = new_key
    }
    return obj
}



function get_selector_element(id, options, default_value) {
    const selected_options = [];

    if (default_value === "") {
        selected_options.push('<option value="" selected></option>');
    }

    options.forEach(element => {
        if (element === default_value) {
            selected_options.push(`<option value="${element}" selected>${element}</option>`);
        } else {
            selected_options.push(`<option value="${element}">${element}</option>`);
        }
    });

    const selectHTML = `<select>${selected_options.join('')}</select>`;

    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = selectHTML;
    return tempDiv.firstElementChild;
}



function add_export_activity_settings(widget, activity, outputVal){
    let settings_div = document.getElementById('selected_activity_settings')
    settings_div.innerHTML = ""
    let div = document.createElement('div')
    div.id ='export_div'
    if (activity.inputs.input.value == null){
        return
    }

    let operatorId = activity.operatorId;
    let array_values = []
    Object.keys(activity.inputs.input.value).forEach(key => {
        if (Array.isArray(activity.inputs.input.value[key])){
            array_values.push(key)
        }
    }); 

    if (array_values.length == 0){
        return
    }
    let default_root_array = null
    if (div.getAttribute('root') == null){
         default_root_array = array_values[0]
        div.setAttribute('root', default_root_array)
    }else{
         default_root_array = div.getAttribute('root')
    }



    let array_selector = get_selector_element(
                                            "export_datatype_"+operatorId
                                            , array_values
                                            ,default_root_array
                                                )
    widget.flowchart('setoutputVal', operatorId,'output',activity.inputs.input.value[default_root_array])
    array_selector.setAttribute("inputs", JSON.stringify(activity.inputs.input.value))                                        
    array_selector.setAttribute("operatorId", operatorId)   
    array_selector.onchange = function(){
        let div = document.getElementById('export_div')
        // console.log("Changed to", this.value)
        let inputs = JSON.parse(this.getAttribute('inputs'))
        let flattened_output = inputs[this.value]
         if (Array.isArray(flattened_output)){
            div.setAttribute('root', this.value)
            // console.log("Updating output",flattened_output )
             widget.flowchart('setoutputVal', operatorId,'output',JSON.parse(JSON.stringify(flattened_output)))
          
        }

    }
    let export_button = document.createElement('button')

    export_button.className = 'buttons'
    export_button.innerHTML = 'Export Data'
    export_button.style.color = 'black'
    export_button.style.backgroundColor = 'green'
    export_button.style.fontSiz3='20px'
    export_button.onclick = function(){
        let from_output_value = activity.outputs.output.value
        let csv = jsonToCsv(from_output_value)
        export_data(csv)
    }
    div.appendChild(export_button)
    div.appendChild(array_selector)
    settings_div.appendChild(div)
}

function expand_struct(struct){
    Object.keys(struct).forEach(key => {
        if (typeof value == 'object' && !Array?.isArray(value)){
            let child_keys = Object?.keys(value);
            child_keys.forEach(ck => {
                struct[key+'.'+ck] = value[ck]
            });
            delete struct[key]
        }
        
    });
  return struct


}

function add_select_activity_settings(widget, activity, outputVal){
    let settings_div = document.getElementById('selected_activity_settings')
    settings_div.innerHTML = ""
    let operatorId = activity.operatorId;
    if (activity.outputs.output.value==null && activity.inputs.input.value == null){
        return
    }
    if (activity.inputs.input.value == null){
        return
    }
    if (activity.link_from[0].outputs.output.value == null){
        return
    }else{
        widget.flowchart('setinputVal', operatorId,'input',JSON.parse(JSON.stringify(expand_struct(activity.link_from[0].outputs.output.value))))
    }


    let add_button = document.createElement('button')
    add_button.setAttribute('operatorId', activity.operatorId)
    let add_div = document.createElement('div')
    add_button.innerHTML = '+ Add'
    add_button.className = 'buttons'
    add_button.style.color = 'black'
    add_button.style.backgroundColor = 'green'
    add_button.onclick = function(){
        let operatorId = this.getAttribute('operatorId')
        let activity = widget.flowchart('getOperatorActivity', operatorId)
        let expanded_input_values = expand_struct(activity.inputs.input.value)
        let all_available_columns = Object.keys(expanded_input_values)
        // console.log("All columns", all_available_columns)
        let expanded_output_values = expand_struct(activity.outputs.output.value)
        let all_visible_columns = Object.keys(expanded_output_values)
        // console.log("Visible columns",all_visible_columns )
        for (let i =0; i<all_available_columns.length; i++){
            let original_column = all_available_columns[i]
             if (!all_visible_columns.includes(original_column)){
                let data_type = typeof expanded_input_values[original_column]
                let record = {'operatorId':activity.operatorId,'columnName': original_column, 'dataType': data_type,'updatedName': original_column}
                // console.log("Adding New column", record)
                settings_create_column_edit_record(widget,all_available_columns,record)

                activity.outputs.output.value[original_column] = expanded_input_values[original_column]
                widget.flowchart('setoutputVal', operatorId,'output',JSON.parse(JSON.stringify(activity.outputs.output.value)))
                break
             }
        }
    }
    add_div.appendChild(add_button)
    settings_div.appendChild(add_div)

    let expanded_output_values = expand_struct(activity.outputs.output.value)
    let expanded_input_values = expand_struct(activity.inputs.input.value)
    let availiable_input_columns = Object.keys(expanded_input_values)
    let all_available_columns = Object.keys(expanded_output_values) 
    if (Array.isArray(expanded_output_values)){
        Object.keys(expanded_output_values[0]).forEach(key => {
        let record = {'operatorId':activity.operatorId,'columnName': key, 'dataType': typeof expanded_output_values[0][key],'updatedName': key}
        settings_create_column_edit_record(widget,Object.keys(expanded_output_values[0]),record)})
        }
    else{
        let excluded_columns = []
        for (let i=0; i < all_available_columns.length; i++){
            let key = all_available_columns[i]
            if (!availiable_input_columns.includes(key)){
                excluded_columns.push(key)
                continue
            }
            let record = {'operatorId':activity.operatorId,'columnName': key, 'dataType': typeof expanded_output_values[key],'updatedName':expanded_output_values[key]}
            settings_create_column_edit_record(widget,Object.keys(expanded_output_values),record)

        }
        if (excluded_columns.length > 0){
            excluded_columns.forEach(element => {
                delete expanded_output_values[element]
            });
             widget.flowchart('setoutputVal', activity.operatorId,'output',JSON.parse(JSON.stringify(expanded_output_values)))
        }
    }
}


function add_import_activity_settings(widget, activity, outputVal){
        let settings_div = document.getElementById('selected_activity_settings')
        settings_div.innerHTML = ""
        let add_button = document.createElement('button')
        add_button.setAttribute('operatorId', activity.operatorId)
        let add_div = document.createElement('div')
        add_button.innerHTML = '+ Add'
        add_button.className = 'buttons'
        add_button.style.color = 'black'
        add_button.style.backgroundColor = 'green'
        add_button.onclick = function(){
            let operatorId = this.getAttribute('operatorId')
            let activity = widget.flowchart('getOperatorActivity', operatorId)

            if (activity.inputs.input.value == null){return}
            let expanded_input_values = expand_struct(activity.inputs.input.value)
            let all_available_columns = Object.keys(expanded_input_values)
            console.log("All columns", all_available_columns)
            let expanded_output_values = expand_struct(activity.outputs.output.value)
            let all_visible_columns = Object.keys(expanded_output_values)
            console.log("Visible columns",all_visible_columns )
            for (let i =0; i<all_available_columns.length; i++){
                let original_column = all_available_columns[i]
                if (!all_visible_columns.includes(original_column)){
                    let data_type = typeof expanded_input_values[original_column]
                    let record = {'operatorId':activity.operatorId,'columnName': original_column, 'dataType': data_type,'updatedName': original_column}
                    console.log("Adding New column", record)
                    settings_create_column_edit_record(widget,all_available_columns,record)
                    activity.outputs.output.value[original_column] = expanded_input_values[original_column]
                    widget.flowchart('setoutputVal', operatorId,'output',JSON.parse(JSON.stringify(activity.outputs.output.value)))
                    // widget.flowchart('run_activity', operatorId)
                    break
                }
            }
        }
        add_div.appendChild(add_button)
        settings_div.appendChild(add_div)
        const div = document.createElement('div');
        const input = document.createElement('input');
        input.type = 'file';
        input.setAttribute('operatorId', activity.operatorId)
        input.onchange = async function(e){
            let operatorId = input.getAttribute('operatorId')
            let settings_json = {'fileName': null, 'values':null}
            let settings_div = document.getElementById('selected_activity_settings')
            let obj = null
            const file = e.target.files?.item(0);
            if (!file) {
                e.preventDefault();
                console.warn("No file selected, keeping existing content.");
                return;
            }
            if (file.name.includes(".json")){
                 let text = await file.text();
                  obj = JSON.parse(text);

            }
            if (file.name.includes('.csv')){
                let text = await file.text();
                obj = csvToJson(text);
                widget.flowchart('setinputVal', operatorId,'input',JSON.parse(JSON.stringify(obj)))
                widget.flowchart('setoutputVal', operatorId,'output',JSON.parse(JSON.stringify(obj)))

                 obj = obj[0]
            }

            if (obj == null){
                alert("Invalid File. Not a CSV or JSON.");
                return
            }

            settings_json['fileName'] =  file.name
            console.log("Object", obj)
            settings_div.setAttribute('settings_json', JSON.stringify(settings_json))
            document.querySelectorAll('.rename_settings').forEach(el => el.remove());
            document.querySelectorAll('p').forEach(el => el.remove());
            let file_name_element = document.createElement('p')
            file_name_element.innerHTML = settings_json['fileName']
            settings_div.appendChild(file_name_element)
            let expanded_obj = expand_struct(obj)
            console.log("Expanded Object", expanded_obj)

            Object.keys(expanded_obj).forEach(key => {
                console.log(key)
                let record = {'operatorId':operatorId,'columnName': key, 'dataType': typeof expanded_obj[key],'updatedName': key}
                settings_create_column_edit_record(widget,Object.keys(expanded_obj),record)
                settings_div.setAttribute('settings_json', JSON.stringify(settings_json))
             
            }); 
            widget.flowchart('run_activity', operatorId)

        }

        div.appendChild(input)
        if (settings_div.getAttribute('settings_json')!=null){
            let file_name_element = document.createElement('p')
            file_name_element.innerHTML = JSON.parse(settings_div.getAttribute('settings_json'))['fileName']
            settings_div.appendChild(file_name_element)
        }
        settings_div.insertBefore(div, settings_div.firstChild)
        if (activity.outputs.output.value == null || activity.outputs.output.value == undefined){
            return div
        }
        let current_output = activity.outputs.output.value
        if (Array.isArray(current_output)){
            Object.keys(current_output[0]).forEach(key => {
                let record = {'operatorId':activity.operatorId,'columnName': key, 'dataType': typeof current_output[0][key],'updatedName': key}
                settings_create_columnedit_record(widget,Object.keys(current_output[0]),record)
                })
        }else{
                let expanded_input_values = expand_struct(activity.outputs.output.value)
                let all_available_columns = Object.keys(expanded_input_values)
                 all_available_columns.forEach(key => {
                    let record = {'operatorId':activity.operatorId,'columnName': key, 'dataType': typeof expanded_input_values[key],'updatedName':expanded_input_values[key]}
                    settings_create_column_edit_record(widget,Object.keys(expanded_input_values),record)
                });

        }
        
        return div



            // console.log("Expanding", activity.outputs.output.value)
            // let expanded_input_values = expand_struct(activity.outputs.output.value)
            // if (expanded_input_values == null || expanded_input_values == undefined){return}
            // let all_available_columns = Object.keys(expanded_input_values)
            // if (Array.isArray(expanded_input_values)){
                // Object.keys(expanded_input_values[0]).forEach(key => {
                // let record = {'operatorId':activity.operatorId,'columnName': key, 'dataType': typeof expanded_input_values[0][key],'updatedName': key}
                // settings_create_columnedit_record(widget,Object.keys(expanded_input_values[0]),record)})
                // }
            // else{
                // all_available_columns.forEach(key => {
                //     let record = {'operatorId':activity.operatorId,'columnName': key, 'dataType': typeof expanded_input_values[key],'updatedName':expanded_input_values[key]}
                //     settings_create_column_edit_record(widget,Object.keys(expanded_input_values),record)
                // });
            // }
}

function settings_create_column_edit_record(widget,original_columns,new_record){

        if (Object.keys(new_record).length <=1){
                console.log("Returning..")
                return;
            }
        let operatorId = new_record.operatorId
        let settings_div = document.getElementById('selected_activity_settings')
        let data_type = new_record['dataType']
        const datatype_options = ['TEXT', 'INTEGER', 'DECIMAL', 'LIST'];
        if (data_type == 'string'){
            data_type = 'TEXT'
        }
        if (data_type == 'number'){
            data_type = 'INTEGER'
        }
        if (data_type == 'decimal'){
            data_type = 'DECIMAL'
        }
        if (data_type == 'object'){
            data_type = 'LIST'
        }
        let data_type_selector_element = get_selector_element(
                                                    "flatten_datatype_"+operatorId
                                                    , datatype_options
                                                    ,data_type
                                                )
            data_type_selector_element.disabled = true
            let originalName_selector_element = get_selector_element(
                                                    "flatten_name_"+operatorId
                                                    , original_columns
                                                    ,new_record['columnName']
                                                )
            originalName_selector_element.disabled = true
            let delete_button = document.createElement('button')
            delete_button.setAttribute('operatorId', operatorId)
            delete_button.setAttribute('target_columnName', new_record['columnName'])
            delete_button.innerHTML = 'remove'
            delete_button.className = 'buttons'
            delete_button.style.color = 'red'
            delete_button.onclick = function(){
                const operatorId = this.getAttribute('operatorId')
                let target_column = this.getAttribute('target_columnName');
                const parent = this.parentElement;
                console.log('Parent element:', parent, target_column, operatorId);
                parent.remove();



                let activity = widget.flowchart('getOperatorActivity', operatorId)
                let outputVal = activity.outputs.output.value
                console.log("Deleting", outputVal, target_column)
                delete outputVal[target_column];
                widget.flowchart('setoutputVal', operatorId,'output',JSON.parse(JSON.stringify(expand_struct(outputVal))))
                // widget.flowchart('update_activity_inputs', operatorId)
                
                


                
            }

                let new_key_input = document.createElement('input')
                new_key_input.disabled = true
                new_key_input.value = new_record['columnName']
                let div = document.createElement('div')
                div.className = 'rename_settings'
                div.appendChild(originalName_selector_element)
                div.appendChild(data_type_selector_element)
                div.appendChild(new_key_input)
                div.appendChild(delete_button)
                settings_div.appendChild(div)

}

function onLinkCreation(widget,linkData){
    // console.log(linkData)
    let toOperator = widget.getOperatorActivity(linkData['toOperator'])
    let fromOperator  = widget.getOperatorActivity(linkData['fromOperator'])
    let outputVal = fromOperator.outputs.output.value

    if (typeof main_activities === "object" && main_activities !== null) {
        const toActivity = main_activities[linkData['toOperator']]
        if (toActivity) {
            toActivity.activity = widget.getOperatorActivity(linkData['toOperator'])
        }
        const fromActivity = main_activities[linkData['fromOperator']]
        if (fromActivity) {
            fromActivity.activity = widget.getOperatorActivity(linkData['fromOperator'])
        }
    }

    if (toOperator.activityType == 'join' || toOperator.activityType == 'append'){
        // console.log("ADDING dependency")
        widget.setDependency(linkData['toOperator'], { operatorId: fromOperator.operatorId, connector: linkData.toConnector })

        if (linkData.toConnector == 'input_1'){
            widget.setinputVal(linkData['toOperator'],'input_1', fromOperator)
        }
        if (linkData.toConnector == 'input_2'){
            widget.setinputVal(linkData['toOperator'],'input_2', fromOperator)
        }
    }else{
        // console.log("ADDING dependency")
        widget.setDependency(linkData['toOperator'],fromOperator.operatorId)

            if (outputVal == null){
                return
            }


        console.log("Setting input and output", outputVal)
        widget.setinputVal(linkData['toOperator'],'input', outputVal)
        widget.setoutputVal(linkData['toOperator'],'output', outputVal)
    }


    // widget.addDataTypes(linkData['toOperator'], datatypes)
    // widget.update_activity_input_outputs(fromOperator.operatorId)

}
