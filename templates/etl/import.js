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
        this.settings = this.get_settings_element()
    }


    _on_selector_change(event, widget, activity){
        let parent_element = event.target.parentElement;
        console.log(event.target.value)
        console.log(event.target)
        console.log(parent_element)
        console.log("Name: ", event.target.name)

        if (event.target.name == 'data_type'){
            let parent_element = event.target.parentElement;
            widget.flowchart('changeDataTypeSelectColumn', activity.activityId, parent_element.id, event.target.value)
            return
        }

        let selected_column  = event.target.value
        if (selected_column != "" && parent_element.children.length > 4){
            parent_element.children[3].remove()
        }
        if (selected_column == "" && parent_element.children.length == 4){
            let input = document.createElement('input')
            input.name = 'custom_value'
            input.placeholder = "Column Value"
            input.addEventListener("change", (event) => this._on_input_change(event, widget, this));
            let children = parent_element.children;
            let insertIndex = children.length - 1;
            parent_element.insertBefore(input, children[insertIndex]);
        }
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
        let datatype = datatypes[selected_column]


        event.target.parentElement.children[2].value =  name
        event.target.parentElement.children[1].value =  datatype
        let select_val = {'select': selected_column, 'as': name, 'datatype': datatype, 'id':event.target.parentElement.id }
        widget.flowchart('addSelectColumn', activity.activityId, select_val)
        console.log(widget.flowchart('getOperatorActivity', activity.activityId))
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
    }

//     _add_custom_value(e, widget, activity){
        // let parent_element = e.target.parentElement;
        // console.log(e.target.value)
        // widget.flowchart('addCustomValue', activity.activityId, parent_element.id, e.target.value)

//     }
//     _add_column(e, widget, activity){
//         let all_columns = []
//         let activityId = activity.activityId
//         let input_value;
//         if (Array.isArray( activity.activity.inputs.input.value)){
//             all_columns = Object.keys(activity.activity.inputs.input.value[0])
//             input_value = activity.activity.inputs.input.value[0]
//         }else{
//             all_columns = Object.keys(activity.activity.inputs.input.value)
//             input_value = activity.activity.inputs.input.value

//         }
//          console.log("Adding From Original List", all_columns)
//         let record = {'operatorId':activityId,'columnName': "", 'dataType': "",'updatedName': ""}
//         let column_edit_element = document.getElementById(activityId+"_column_edit")
//         console.log(column_edit_element, activity.activityId+"_column_edit")
//         let n = this.get_column_selection_element(widget,all_columns,record)
//         let new_input = document.createElement('input')
        
//         n.appendChild(new_input)
//         column_edit_element.appendChild(n)
//         new_input.addEventListener("change", (event) => this._add_custom_value(event, widget, this));

//         let select_val = {'select': record.columnName,'datatype': null, 'as': record.columnName, 'id':n.id, 'custom_value': null}
//         widget.flowchart('addSelectColumn', activity.activityId, select_val)
//         // activity.import_column_selection(widget,all_columns,record)
//     }
//     _delete_column(e, widget, activity){
//         let parent_element = e.target.parentElement;
//         parent_element.remove()
//         console.log("deleting", parent_element.id)
//         widget.flowchart('removeSelectColumn', activity.activityId, parent_element.id)
//     }
//     _on_datatype_select(e, widget,activity){
        // let parent_element = e.target.parentElement;
        // console.log(e.target.value)
        // widget.flowchart('changeDataTypeSelectColumn', activity.activityId, parent_element.id, e.target.value)
//     }
//     _on_rename_column(e, widget,activity){
//         let parent_element = e.target.parentElement;
//         console.log(e.target.value)
//         widget.flowchart('renameSelectColumn', activity.activityId, parent_element.id, e.target.value)
//     }
//     _on_column_select(e, widget, activity){
        // let selected_column  = e.target.value
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
        // console.log("Looking for", selected_column, 'in', datatypes)
        // let datatype = datatypes[selected_column]


        //   e.target.parentElement.children[2].value =  name
        //   e.target.parentElement.children[1].value =  datatype
        //   let select_val = {'select': selected_column, 'as': name, 'datatype': datatype, 'id':e.target.parentElement.id }
        //   widget.flowchart('addSelectColumn', activity.activityId, select_val)
        //   console.log(widget.flowchart('getOperatorActivity', activity.activityId))
//     }
//      get_column_selection_element(widget,original_columns,new_record){
//         if (Object.keys(new_record).length <=1){
//                 console.log("Returning..")
//                 return;
//             }
//         let operatorId = new_record.operatorId
//         let data_type = new_record['dataType']
//        const datatype_options = ['string', 'int','bigint'];
//         let data_type_selector_element = get_selector_element(
//                                                     "flatten_datatype_"+operatorId
//                                                     , datatype_options
//                                                     ,data_type
//                                                 )
//             data_type_selector_element.addEventListener("change", (event) => this._on_datatype_select(event, widget, this));
//             let originalName_selector_element = get_selector_element(
//                                                     "flatten_name_"+operatorId
//                                                     , original_columns
//                                                     ,new_record['columnName']
//                                                 )
            
            
//             originalName_selector_element.addEventListener("change", (event) => this._on_column_select(event, widget, this));
//             originalName_selector_element.setAttribute("originalColumnName",new_record['columnName'])

//             let delete_button = document.createElement('button')
//             delete_button.setAttribute('operatorId', operatorId)
//             delete_button.setAttribute('target_columnName', new_record['columnName'])
//             delete_button.innerHTML = 'remove'
//             delete_button.className = 'buttons'
//             delete_button.style.color = 'red'
//             delete_button.addEventListener("click", (event) => this._delete_column(event, widget, this));

//             let new_key_input = document.createElement('input')
//             new_key_input.value = new_record['columnName']
//             new_key_input.addEventListener("change", (event) => this._on_rename_column(event, widget, this));

//             let div = document.createElement('div')
//             div.id = crypto.randomUUID();
//             div.className = 'rename_settings'
//             div.appendChild(originalName_selector_element)
//             div.appendChild(data_type_selector_element)
//             div.appendChild(new_key_input)
//             div.appendChild(delete_button)
//             return div
//     }
//      get_selector_element(options, default_value) {
//     const selected_options = [];

//     if (default_value === "") {
//         selected_options.push('<option value="" selected></option>');
//     }

//     options.forEach(element => {
//         if (element === default_value) {
//             selected_options.push(`<option value="${element}" selected>${element}</option>`);
//         } else {
//             selected_options.push(`<option value="${element}">${element}</option>`);
//         }
//     });

//     const selectHTML = `<select>${selected_options.join('')}</select>`;

//     const tempDiv = document.createElement('div');
//     tempDiv.innerHTML = selectHTML;
//     return tempDiv.firstElementChild;
// }
//    async _inputFile_onchange(e, widget, activity){
//         let activityId = activity.activityId
//         const file = e.target.files?.item(0);
//         if (!file) {
//             e.preventDefault();
//             console.warn("No file selected, keeping existing content.");
//             return;
//         }
//         let obj = null
//         if (file.name.includes(".json")){
//                 let text = await file.text();
//                 obj = JSON.parse(text);
//                 widget.flowchart('setinputVal', activityId,'input', {'datatypes': null, 'values': obj})
//                 // widget.flowchart('setoutputVal', activityId,'output',JSON.parse(JSON.stringify(expand_struct(obj))))

//         }
//         if (file.name.includes('.csv')){
//             let text = await file.text();
//             obj = csvToJson(text);
//             widget.flowchart('setinputVal', activityId,'input',{'datatypes': null, 'values': obj})
//             // widget.flowchart('setoutputVal', activityId,'output',JSON.parse(JSON.stringify(obj)))
//             obj = obj[0]
//         }
//         if (obj == null){
//             alert("Invalid File. Not a CSV or JSON.");
//             return
//         }
//         let response = await run_activity_flow(widget.flowchart('getOperatorActivity', activity.activityId),widget)
//         widget.flowchart('setoutputVal', activityId,'output',response)
//         let column_datatypes = response['datatypes']
//         widget.flowchart('addDataTypes',activity.activityId,column_datatypes)

//         let expanded_obj = expand_struct(obj)
//         let settings_div = document.getElementById('selected_activity_settings')
//         let columns_div = document.createElement('div')
//         columns_div.id = this.activityId+ "_column_edit"
//         let idx = 0
//          Object.keys(expanded_obj).forEach(key => {
//             let data_type = column_datatypes[key]
//             let record = {'operatorId':activityId,'columnName': key, 'dataType':data_type,'updatedName': key}
//             let column_edit_element = this.get_column_selection_element(widget,Object.keys(expanded_obj),record)
//             columns_div.appendChild(column_edit_element)
//             let select_val = {'select': key, 'as': key, 'datatype':data_type,'id':column_edit_element.id }
//             widget.flowchart('addSelectColumn', activity.activityId, select_val)
//             idx +=1
//         }); 
//         settings_div.appendChild(columns_div)

//         // widget.flowchart('run_activity', activityId);
      
       



//     }
//     get_settings_element(){
//         let div = document.createElement('div')
//         div.id = this.activityId
//         let add_button = document.createElement('button')
//         let add_div = document.createElement('div')
//         add_button.setAttribute('operatorId', this.activityId)
//         add_button.innerHTML = '+ Add'
//         add_button.className = 'buttons'
//         add_button.style.color = 'black'
//         add_button.addEventListener("click", (event) => this._add_column(event, this.flowchart, this));
//         add_div.appendChild(add_button)
//         div.appendChild(add_div)
//         if (this.activity.activityType == 'import'){
//             const input = document.createElement('input');
//             input.type = 'file';
//             input.addEventListener("change", (event) => this._inputFile_onchange(event, this.flowchart, this));
//             div.appendChild(input)
//         }
//         if (this.activity.outputs.output.value.values == null || this.activity.outputs.output.value.values == undefined){
//             return div
//         }
//         let current_output = this.activity.outputs.output.value.values
//         let columns_div = document.createElement('div')
//         if (Array.isArray(current_output)){
//             Object.keys(current_output[0]).forEach(key => {
//                     let data_type =  typeof current_output[0][key]
//                     if (data_type == 'string'){
//                         data_type = 'TEXT'
//                     }
//                     if (data_type == 'number'){
//                         data_type = 'INTEGER'
//                     }
//                     if (data_type == 'decimal'){
//                         data_type = 'DECIMAL'
//                     }
//                     if (data_type == 'object'){
//                         data_type = 'LIST'
//                     }
//                     let record = {'operatorId':this.activityId,'columnName': key, 'dataType': data_type,'updatedName': key}
//                     let column_edit_element = this.get_column_selection_element(this.flowchart,Object.keys(current_output[0]),record)
//                     columns_div.appendChild(column_edit_element)
//             })
//         }else{
//                 let expanded_input_values = expand_struct(this.activity.outputs.output.value.values)
//                 let all_available_columns = Object.keys(expanded_input_values)
//                  all_available_columns.forEach(key => {
//                         let data_type =  typeof expanded_input_values[key]
//                         if (data_type == 'string'){
//                             data_type = 'TEXT'
//                         }
//                         if (data_type == 'number'){
//                             data_type = 'INTEGER'
//                         }
//                         if (data_type == 'decimal'){
//                             data_type = 'DECIMAL'
//                         }
//                         if (data_type == 'object'){
//                             data_type = 'LIST'
//                         }
//                         let record = {'operatorId':this.activityId,'columnName': key, 'dataType':data_type,'updatedName':expanded_input_values[key]}
//                         let column_edit_element = this.get_column_selection_element(this.flowchart,Object.keys(expanded_input_values),record)
//                         columns_div.appendChild(column_edit_element)
//                 });

//         }
//         div.appendChild(columns_div)
//         return div
    
//     }
}

