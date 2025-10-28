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
        let columns_div = document.getElementById(activity.activityId + "_column_edit");
        if (columns_div == null || columns_div == undefined){
            let settings_div = document.getElementById('selected_activity_settings')
                columns_div = document.createElement('div')
            columns_div.id = this.activityId+ "_column_edit"
            settings_div.appendChild(columns_div)
        }
          if (Array.isArray( activity.activity.inputs.input.value.values)){
            all_columns = Object.keys(activity.activity.inputs.input.value.values[0])
        }else{
            all_columns = Object.keys(activity.activity.inputs.input.value.values)

        }
        // let datatypes = widget.flowchart("getOperatorActivity", activity.activityId).inputs.input.value.datatypes;
        // let s = new Set(Object.values(datatypes));
        // datatypes = [...s]


        let target_activity = widget.flowchart('getOperatorActivity', activity.activityId)
        console.log("ACTIVITY FILE CHANGE", target_activity) 
        let response = await run_activity_flow(target_activity,widget)
        console.log("RESPONSE", response, activityId)
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
                ,'options': [...new Set(Object.values(response.datatypes))]
                ,'default_value': response.datatypes[column]
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
                ,'label': 'remove'
                ,'color': 'red'
            }]
            let column_edit_element = this.get_column_selection_element(widget,settings)
            columns_div.appendChild(column_edit_element)
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
                ,'label': 'remove'
                ,'color': 'red'
            }]
        let column_edit_element = this.get_column_selection_element(widget,settings)
        columns_div.appendChild(column_edit_element)

}
    get_operation_settings(){
        let settings = super.get_operation_settings('select')
        this.flowchart.flowchart('setSettings', this.activityId, settings)
        return settings
    }
    _on_selector_change(event, widget, activity){
        let parent_element = event.target.parentElement;
        let div = document.getElementById(activity.activityId+"_column_edit")
        console.log("Name: ", event.target.name)
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
        console.log("Data type", datatype)
        event.target.parentElement.children[1].value =  datatype

        event.target.parentElement.children[2].value =  name

        // if (event.target.name == 'data_type'){
        //     let parent_element = event.target.parentElement;
        //     widget.flowchart('changeDataTypeSelectColumn', activity.activityId, parent_element.id, event.target.value)
        //     return
        // }

        // let selected_column  = event.target.value
        // if (selected_column != "" && parent_element.children.length > 4){
        //     parent_element.children[3].remove()
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
    }
}