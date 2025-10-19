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
    console.log(url, data)
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

function get_flatten_activity_body(activity){
    const div = document.createElement('div');

    previous_activity_outputVal = activity.link_from[0].outputs.output
    console.log("Activity", previous_activity_outputVal)
    array_values = []
    Object.keys(previous_activity_outputVal).forEach(key => {
        if (Array.isArray(previous_activity_outputVal[key])){
            console.log("Detected array!")
            array_values.push(key)
        }
    });
    if (array_values.length > 0){
        let selector_element = get_selector_element(array_values, array_values[0])
        div.appendChild(selector_element)
    }
    return div





}

function get_activity_body_element(widget,activity){
    const div = document.createElement('div');
    if(activity.properties.activityType == 'import'){
        const input = document.createElement('input');
        input.type = 'file';
        input.setAttribute('operatorId', activity.operatorId)
        const pre = document.createElement('pre');
        pre.id = 'output';
        input.onchange = async function(e){

             const file = e.target.files?.item(0);
            if (!file) {
                e.preventDefault();
                console.warn("No file selected, keeping existing content.");
                return;
            }

             if (file.name.includes(".json")){
                const text = await file.text();
                let obj = JSON.parse(text);
                let operatorId = input.getAttribute('operatorId')

                widget.setFileType(operatorId, 'json')
                widget.setoutputVal(operatorId,'output',obj)
                activity = widget.getOperatorActivity(operatorId)

                let activity_settings_element = get_activity_settings_element(widget, activity)
                let settings_div = document.getElementById('selected_activity_settings')
                settings_div.innerHTML = ''
                settings_div.appendChild(activity_settings_element)
                }
            }
        div.appendChild(input)
        div.appendChild(pre)
        return div

    }
 
    //     if (activity.properties.link_from != undefined){
    //         previous_activity_to_value = activity.properties.link_from[0].link_to[0].outputs.output
    //         console.log(previous_activity_to_value)
    //     }

    // }
     return div

}
function get_selector_element(options, default_value){
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
    return selectElement

}

function settings_add_record(widget, activity, column){
     let div = document.createElement('div')
    div.className = 'rename_settings'
    let originalKeyName = column
    let delete_button = document.createElement('button')
    delete_button.setAttribute('operatorId', activity.operatorId)
    delete_button.setAttribute('target_columnName', column)
    delete_button.innerHTML = 'remove'
    delete_button.className = 'buttons'
    delete_button.style.color = 'red'
    delete_button.onclick = function(){
        operatorId = this.getAttribute('operatorId')
        let target_column = this.getAttribute('target_columnName');
        let setting_rows = document.querySelector('.columns').children;
        Array.from(setting_rows).forEach(child => {
            if (target_column == child.id){
                document.querySelector('.columns').removeChild(child)
            }
        });
    }
    let new_key_input = document.createElement('input')
    new_key_input.setAttribute('operatorId', activity.operatorId)
    new_key_input.setAttribute('data-info', originalKeyName);
    new_key_input.onchange = function () {
            operatorId = this.getAttribute('operatorId')
            obj = key_name_change(obj,this)
            this.setAttribute('data-info', this.value);
        };
    let original_columns_options = Object.keys(previous_activity_outputVal[target_object_key][0])
    let column_names_input = get_selector_element(original_columns_options,  originalKeyName)
    
    new_key_input.value = originalKeyName
    const options = ['string', 'number', 'decimal', 'object'];
    let data_types = get_selector_element(options, typeof previous_activity_outputVal[target_object_key][0][column])
    let row_div = document.createElement('div')
    div.id = originalKeyName
    row_div.appendChild(column_names_input)
    row_div.appendChild(data_types)
    row_div.appendChild(new_key_input)
    row_div.appendChild(delete_button)
    div.appendChild(row_div)
    // if (widget != null && widget != undefined){
    //     console.log(widget)
    //     widget.setoutputVal(activity.operatorId,'output',previous_activity_outputVal[target_object_key])
    // }
    return div

}


function get_activity_settings_element(widget, activity){
    if (activity.activityType == 'import'){
        if (activity.fileType == 'json'){
            let settings_div = document.createElement('div')
            obj = activity.outputs.output
            Object.keys(obj).forEach(key => {
                    let div = document.createElement('div')
                    div.className = 'rename_settings'
                    let originalKeyName = key
                    let input = document.createElement('input')
                    let new_key_input = document.createElement('input')
                    new_key_input.setAttribute('widget', widget)
                    new_key_input.setAttribute('operatorId', activity.operatorId)
                    new_key_input.setAttribute('data-info', originalKeyName);
                    new_key_input.onchange = function () {
                            operatorId = this.getAttribute('operatorId')
                            obj = key_name_change(obj,this)
                            this.setAttribute('data-info', this.value);
                            // widget.setoutputVal(operatorId,'output',obj )
                        };
                    input.disabled = true
                    input.value = originalKeyName
                    new_key_input.value = originalKeyName
                    const options = ['string', 'number', 'decimal', 'object'];
                    let data_types = get_selector_element(options, typeof obj[key])
                    div.appendChild(input)
                    div.appendChild(data_types)
                    div.appendChild(new_key_input)
                    settings_div.appendChild(div)
            })
            return settings_div
        }


    }
    else if(activity.activityType == 'flatten'){
            let settings_div = document.createElement('div')
            let column_div = document.createElement('div')
            column_div.className = 'columns';
            previous_activity_outputVal = activity.link_from[0].outputs.output
            target_object_key = null
            let target_keys = null
            for (let i=0; i<Object.keys(previous_activity_outputVal).length; i++){
                let key = Object.keys(previous_activity_outputVal)[i]

                if (Array.isArray(previous_activity_outputVal[key])){
                    if (previous_activity_outputVal[key].length > 0){
                        let obj = previous_activity_outputVal[key][0]
                        target_keys = Object.keys(obj)
                        target_object_key = key
                        break
                    }
                }
            }
           
            if (target_keys != null){
                row_div = document.createElement('div')
                let add_button = document.createElement('button')
                add_button.setAttribute('operatorId', activity.operatorId)
                add_button.setAttribute('data', JSON.stringify(previous_activity_outputVal))
                add_button.innerHTML = '+ Add'
                add_button.className = 'buttons'
                add_button.style.color = 'black'
                add_button.style.backgroundColor = 'green'
                add_button.onclick = function(){
                    let output_data = JSON.parse(this.getAttribute('data'))
                    let original_columns = Object.keys(output_data[target_object_key][0])
                    let visible_columns = []
                    let setting_rows = document.querySelector('.columns').children;
                       Array.from(setting_rows).forEach(child => {
                                visible_columns.push(child.id)
                        });
                    for (let i=0; i<original_columns.length; i++){
                        let original_column = original_columns[i]
                        if (!visible_columns.includes(original_column)){
                             let div =settings_add_record(widget, activity, original_column)
                             column_div.appendChild(div)
                            settings_div.appendChild(column_div)
                            break;
                        }

                    }
                   
                    
                }
                row_div.appendChild(add_button)
                settings_div.appendChild(row_div)



                
                target_keys.forEach(column => {
                    let div = settings_add_record(widget, activity, column)
                    // let div = document.createElement('div')
                    // div.className = 'rename_settings'
                    // let originalKeyName = column
                    // let delete_button = document.createElement('button')
                    // delete_button.setAttribute('operatorId', activity.operatorId)
                    // delete_button.setAttribute('target_columnName', column)
                    // delete_button.innerHTML = 'remove'
                    // delete_button.className = 'buttons'
                    // delete_button.style.color = 'red'
                    // delete_button.onclick = function(){
                    //     operatorId = this.getAttribute('operatorId')
                    //     let target_column = this.getAttribute('target_columnName');
                    //     let setting_rows = document.querySelector('.columns').children;
                    //    Array.from(setting_rows).forEach(child => {
                    //         if (target_column == child.id){
                    //             document.querySelector('.columns').removeChild(child)
                    //         }
                    //     });
                    // }
                    // let new_key_input = document.createElement('input')
                    // new_key_input.setAttribute('operatorId', activity.operatorId)
                    // new_key_input.setAttribute('data-info', originalKeyName);
                    // new_key_input.onchange = function () {
                    //         operatorId = this.getAttribute('operatorId')
                    //         obj = key_name_change(obj,this)
                    //         this.setAttribute('data-info', this.value);
                    //     };
                    // let original_columns_options = Object.keys(previous_activity_outputVal[target_object_key][0])
                    // let column_names_input = get_selector_element(original_columns_options,  originalKeyName)
                    
                    // new_key_input.value = originalKeyName
                    // const options = ['string', 'number', 'decimal', 'object'];
                    // let data_types = get_selector_element(options, typeof previous_activity_outputVal[target_object_key][0][column])
                    // let row_div = document.createElement('div')
                    // div.id = originalKeyName
                    // row_div.appendChild(column_names_input)
                    // row_div.appendChild(data_types)
                    // row_div.appendChild(new_key_input)
                    // row_div.appendChild(delete_button)
                    // div.appendChild(row_div)
                    column_div.appendChild(div)
                    settings_div.appendChild(column_div)
                });

            }

            return settings_div
    }
    else if (activity.activityType == 'export'){
            let settings_div = document.createElement('div')
            return settings_div


    }


}