class Activity{
    constructor(id, type, title, inputs,outputs){
        this.id = id 
        this.type = type
        this.title = title
        this.inputs = inputs
        this.outputs = outputs
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



function get_output_values(activity){
    if (activity.activityType == 'flatten'){
        let previous_activity_outputVal = activity.link_from[0].outputs.output
        let elem = document.getElementById("flatten_body_select_"+activity.operatorId)
        console.log('Output elem',elem)
        let value = elem.value
        let new_output = previous_activity_outputVal[value]
        return new_output
    }
    else if (activity.activityType == 'select'){
         let previous_activity_outputVal = activity.link_from[0].outputs.output
        let new_output = previous_activity_outputVal
        return new_output

    }
  

}


function get_selector_element(id,options, default_value){
    let selected_options = []
    options.forEach(element => {
        let e;
        if (element == default_value){
            e = `<option value="${element}" selected>${element}</option>`
        }else{
         e = `<option value="${element}">${element}</option>`
        }
        selected_options.push(e)
    });

    let selectHTML = '<select>'
    selected_options.forEach(element => {
        selectHTML+=element
    });
    selectHTML +='</select>'


    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = selectHTML;
    const selectElement = tempDiv.firstElementChild;
    selectElement.id = id
    return selectElement

}


function add_activity_body(activity, outputVal){
    if (activity.activityType == 'flatten'){
        let array_values = []
        Object.keys(outputVal).forEach(key => {
            if (Array.isArray(outputVal[key])){
                array_values.push(key)
            }
        });
        if (array_values.length>0){
            let select_body_element = get_selector_element("flatten_body_select_"+activity.operatorId, array_values, array_values[0])
            let body = document.getElementById("activity_body_"+activity.operatorId)
            body.appendChild(select_body_element)
            body.innerHTML = '';
            body.appendChild(select_body_element);
        }else{
            let select_body_element = get_selector_element("flatten_body_select_"+activity.operatorId, ['-'], "-")
            let body = document.getElementById("activity_body_"+activity.operatorId)
            body.innerHTML = '';
            body.appendChild(select_body_element);
        }
    }

}
function add_flatten_activity_settings(widget, activity, outputVal){
    let settings_div = document.getElementById('selected_activity_settings')
    settings_div.innerHTML = ""
    if (activity.inputs.input.value == null){
        return
    }
    if (activity.link_from[0].outputs.output.value == null || activity.link_from[0].outputs.output.value == undefined){
        return
    }


    if (Array.isArray(activity.outputs.output.value)){
        Object.keys(activity.outputs.output.value[0]).forEach(key => {
        let record = {'operatorId':activity.operatorId,'columnName': key, 'dataType': typeof activity.outputs.output.value[0][key],'updatedName': key}
        settings_create_column_edit_record(widget,Object.keys(activity.outputs.output.value[0]),record)})
        }
    else{
            let expanded_input_values = expand_struct(activity.outputs.output.value)
    let all_available_columns = Object.keys(expanded_input_values) 
        all_available_columns.forEach(key => {
            let record = {'operatorId':activity.operatorId,'columnName': key, 'dataType': typeof expanded_input_values[key],'updatedName':expanded_input_values[key]}
            settings_create_column_edit_record(widget,Object.keys(expanded_input_values),record)
        });
    }
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
        console.log("Changed to", this.value)
        let inputs = JSON.parse(this.getAttribute('inputs'))
        let flattened_output = inputs[this.value]
         if (Array.isArray(flattened_output)){
            div.setAttribute('root', this.value)
            console.log("Updating output",flattened_output )
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
        let value = struct[key]
        if (typeof value == 'object' && !Array.isArray(value)){
            let child_keys = Object.keys(value);
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
            let settings_json = {'fileName': null, 'values':null}
            let settings_div = document.getElementById('selected_activity_settings')
            const file = e.target.files?.item(0);
            if (!file) {
                e.preventDefault();
                console.warn("No file selected, keeping existing content.");
                return;
            }
            if (file.name.includes(".json")){
                const text = await file.text();
                let operatorId = input.getAttribute('operatorId')
                settings_json['fileName'] =  file.name
                settings_div.setAttribute('settings_json', JSON.stringify(settings_json))
                document.querySelectorAll('.rename_settings').forEach(el => el.remove());
                document.querySelectorAll('p').forEach(el => el.remove());
                let file_name_element = document.createElement('p')
                file_name_element.innerHTML = settings_json['fileName']
                settings_div.appendChild(file_name_element)
                let obj = JSON.parse(text);
                let expanded_obj = expand_struct(obj)
                Object.keys(expanded_obj).forEach(key => {
                let record = {'operatorId':operatorId,'columnName': key, 'dataType': typeof expanded_obj[key],'updatedName': key}
                settings_create_column_edit_record(widget,Object.keys(expanded_obj),record)
                settings_div.setAttribute('settings_json', JSON.stringify(settings_json))
                widget.flowchart('setoutputVal', operatorId,'output',JSON.parse(JSON.stringify(expanded_obj)))
                widget.flowchart('run_activity', operatorId)
                }); 
            }
        }
        div.appendChild(input)
        if (settings_div.getAttribute('settings_json')!=null){
            let file_name_element = document.createElement('p')
            file_name_element.innerHTML = JSON.parse(settings_div.getAttribute('settings_json'))['fileName']
            settings_div.appendChild(file_name_element)
        }

        settings_div.insertBefore(div, settings_div.firstChild)
        if (activity.outputs.output.value != null && activity.outputs.output.value != undefined){
            console.log("Expanding", activity.outputs.output.value)
            let expanded_input_values = expand_struct(activity.outputs.output.value)
            if (expanded_input_values == null || expanded_input_values == undefined){return}
            let all_available_columns = Object.keys(expanded_input_values)
            if (Array.isArray(expanded_input_values)){
                Object.keys(expanded_input_values[0]).forEach(key => {
                let record = {'operatorId':activity.operatorId,'columnName': key, 'dataType': typeof expanded_input_values[0][key],'updatedName': key}
                settings_create_columnedit_record(widget,Object.keys(expanded_input_values[0]),record)})
                }
            else{
                all_available_columns.forEach(key => {
                    let record = {'operatorId':activity.operatorId,'columnName': key, 'dataType': typeof expanded_input_values[key],'updatedName':expanded_input_values[key]}
                    settings_create_column_edit_record(widget,Object.keys(expanded_input_values),record)
                });
            }
        }

       



     




}

function settings_create_column_edit_record(widget,original_columns,new_record){

        if (Object.keys(new_record).length <=1){
                console.log("Returning..")
                return;
            }
        let operatorId = new_record.operatorId
        let settings_div = document.getElementById('selected_activity_settings')
        let data_type = new_record['dataType']
        const datatype_options = ['string', 'number', 'decimal', 'object'];
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
    console.log(linkData)
    let toOperator = widget.getOperatorActivity(linkData['toOperator'])
    let fromOperator  = widget.getOperatorActivity(linkData['fromOperator'])
    outputVal = fromOperator.outputs.output.value
    if (outputVal == null){
        return
    }
    widget.setinputVal(linkData['toOperator'],'input', outputVal)
    widget.setoutputVal(linkData['toOperator'],'output', outputVal)
    // widget.update_activity_input_outputs(fromOperator.operatorId)

    // if (toOperator.activityType == 'flatten'){
    //      // get body contents
    //     // get settings contents
    //     console.log("FROM",fromOperator)
    //     // add_flatten_activity_settings(toOperator, fromOperator.outputs.output.value)
    // }



}