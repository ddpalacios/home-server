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

// function get_flatten_activity_body(activity){
//     const div = document.createElement('div');

//     previous_activity_outputVal = activity.link_from[0].outputs.output
//     array_values = []
//     Object.keys(previous_activity_outputVal).forEach(key => {
//         if (Array.isArray(previous_activity_outputVal[key])){
//             // console.log("Detected array!")
//             array_values.push(key)
//         }
//     });
//     if (array_values.length > 0){
//         let selector_element = get_selector_element("flatten_body_select_"+activity.operatorId, array_values, array_values[0])
     
//         div.appendChild(selector_element)
//     }
//     return div

// }

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

// function get_import_activity_body_element(widget,activity){
//     const div = document.createElement('div');
//     if(activity.properties.activityType == 'import'){
//         const input = document.createElement('input');
//         input.type = 'file';
//         input.setAttribute('operatorId', activity.operatorId)
//         const pre = document.createElement('pre');
//         pre.id = 'output';
//         input.onchange = async function(e){
//              const file = e.target.files?.item(0);
//             if (!file) {
//                 e.preventDefault();
//                 console.warn("No file selected, keeping existing content.");
//                 return;
//             }
//              if (file.name.includes(".json")){
//                 const text = await file.text();
//                 let obj = JSON.parse(text);
//                 let operatorId = input.getAttribute('operatorId')
//                 widget.setFileType(operatorId, 'json')
//                 widget.setoutputVal(operatorId,'output',obj)
//                 activity = widget.getOperatorActivity(operatorId)
//                 // let activity_settings_element = get_activity_settings_element(widget, activity)
//                 // let settings_div = document.getElementById('selected_activity_settings')
//                 // settings_div.innerHTML = ''
//                 // settings_div.appendChild(activity_settings_element)
//                 }
//             }
//         div.appendChild(input)
//         div.appendChild(pre)
//         return div

//     }
 
//      return div

// }
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
// function settings_add_record( activity, column){
//      let div = document.createElement('div')
//     div.className = 'rename_settings'
//     let originalKeyName = column
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
    //     Array.from(setting_rows).forEach(child => {
    //         if (target_column == child.id){
    //             document.querySelector('.columns').removeChild(child)
    //         }
    //     });
    // }
//     let new_key_input = document.createElement('input')
//     new_key_input.setAttribute('operatorId', activity.operatorId)
//     new_key_input.setAttribute('data-info', originalKeyName);
//     new_key_input.onchange = function () {
//             operatorId = this.getAttribute('operatorId')
//             obj = key_name_change(obj,this)
//             this.setAttribute('data-info', this.value);

//         };
//     let original_columns_options = null;
//     if (Array.isArray(previous_activity_outputVal)){
//          original_columns_options = Object.keys(previous_activity_outputVal[0])

//     }else{
//          original_columns_options = Object.keys(previous_activity_outputVal)

//     }
//     let data_types = null
//     const options = ['string', 'number', 'decimal', 'object'];
//     if (activity.activityType =='flatten'){
//         let elem = document.getElementById("flatten_body_select_"+activity.operatorId)
//         let selected_value = elem.value
//         original_columns_options = Object.keys(previous_activity_outputVal[selected_value][0])
//         data_types = get_selector_element(activity.activityType+"_datatype_"+activity.operatorId, options, typeof previous_activity_outputVal[selected_value][0][column])
//         //  if (widget != null && widget != undefined){
//         //     widget.setoutputVal(activity.operatorId,'output',previous_activity_outputVal[selected_value])
//         // }

        
//     }else{
//          data_types = get_selector_element(activity.activityType+"_datatype_"+activity.operatorId, options, typeof previous_activity_outputVal[column])
//         //    if (widget != null && widget != undefined){
//         //     widget.setoutputVal(activity.operatorId,'output',previous_activity_outputVal)
//         // }
//     }




//     let column_names_input = get_selector_element(activity.activityType+"_columnName_"+activity.operatorId,original_columns_options,  originalKeyName)
    
//     new_key_input.value = originalKeyName
//     row_div = document.createElement('div')
//     div.id = originalKeyName
//     row_div.appendChild(column_names_input)
//     row_div.appendChild(data_types)
//     row_div.appendChild(new_key_input)
//     row_div.appendChild(delete_button)
//     div.appendChild(row_div)
    
//     return div

// }


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
                    let data_types = get_selector_element("import_"+activity.operatorId, options, typeof obj[key])
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
                // console.log("Target Kyes", target_keys)
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
                            //  let div =settings_add_record( activity, original_column)
                            //  column_div.appendChild(div)
                            // settings_div.appendChild(column_div)
                            break;
                        }

                    }
                   
                    
                }
                row_div.appendChild(add_button)
                settings_div.appendChild(row_div)
                
                target_keys.forEach(column => {
                    // let div = settings_add_record( activity, column)
                    // column_div.appendChild(div)
                    // settings_div.appendChild(column_div)
                });


            }

            return settings_div
    }
    else if (activity.activityType == 'export'){
            let settings_div = document.createElement('div')
            return settings_div
    }
    else if (activity.activityType == 'select'){
            let column_div = document.createElement('div')
            column_div.className = 'columns';
            let settings_div = document.createElement('div')
            // console.log("MAIN SETTINGS", activity)
            
            previous_activity_outputVal = activity.link_from[0].outputs.output
            let target_keys = null
            if (Array.isArray(previous_activity_outputVal)){
             target_keys = Object.keys(previous_activity_outputVal[0])
            console.log("is array", previous_activity_outputVal,target_keys)


                
            }else{
             target_keys = Object.keys(previous_activity_outputVal)
            }
            // console.log(target_keys)
            row_div = document.createElement('div')
            let add_button = document.createElement('button')
            add_button.setAttribute('operatorId', activity.operatorId)
            add_button.id = "select_add_button_"+activity.operatorId
            add_button.setAttribute('data', JSON.stringify(previous_activity_outputVal))
            add_button.innerHTML = '+ Add'
            add_button.className = 'buttons'
            add_button.style.color = 'black'
            add_button.style.backgroundColor = 'green'
            add_button.onclick = function(){
                operatorId = this.getAttribute('operatorId')
                activity = {'operatorId':operatorId, 'activityType': 'select'}
                let output_data = JSON.parse(this.getAttribute('data'))
                let original_columns = Object.keys(output_data)
                let visible_columns = []
                let setting_rows = document.querySelector('.columns').children;
                    Array.from(setting_rows).forEach(child => {
                            visible_columns.push(child.id)
                    });
                
                for (let i=0; i<original_columns.length; i++){
                    let original_column = original_columns[i]
                    if (!visible_columns.includes(original_column)){
                            // let div =settings_add_record( activity, original_column)
                            // column_div.appendChild(div)
                            // settings_div.appendChild(column_div)
                        break;
                    }

                }
                
                
            }


             target_keys.forEach(column => {
                    console.log(column)
                    // let div = settings_add_record( activity, column)
                    // column_div.appendChild(div)
                    // settings_div.appendChild(column_div)
                });

            let add_div = document.createElement('div')
            add_div.appendChild(add_button)
            settings_div.insertBefore(add_div, settings_div.firstChild)
            $("#" + add_button.id).data("activity", activity);

            return settings_div
    }
    else if (activity.activityType == 'aggregate'){
            let settings_div = document.createElement('div')
            return settings_div
    }
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
        console.log("Cleared settings", outputVal)
        if (outputVal == null){return}
        let array_values = []
        Object.keys(activity.link_from[0].outputs.output.value).forEach(key => {
            if (Array.isArray(activity.link_from[0].outputs.output.value[key])){
                array_values.push(key)
            }
        }); 
        let target_values = outputVal
        let target_value = target_values[0]
        if (target_value == null || target_value == undefined){
            return
        }
        let original_columns = Object.keys(target_value)
        let add_button = document.createElement('button')
        add_button.setAttribute('operatorId', activity.operatorId)
        let add_div = document.createElement('div')
        add_button.innerHTML = '+ Add'
        add_button.className = 'buttons'
        add_button.style.color = 'black'
        add_button.style.backgroundColor = 'green'
        add_button.onclick = function(){
            // let operatorId = this.getAttribute('operatorId')
            // let settings_div = document.getElementById('selected_activity_settings')
            // let settings_json_list = JSON.parse(settings_div.getAttribute("settings_json"))
            // let output_data = JSON.parse(settings_div.getAttribute('original_record'))
            // let visible_columns  = []
            // let original_columns = Object.keys(output_data)
            // settings_json_list.forEach(element => {
            //     let columnName = element['columnName']
            //     visible_columns.push(columnName)
            // });
            // let new_record = {'operatorId': operatorId}
            // console.log(output_data)
            // for (let i=0; i<original_columns.length; i++){
            //     let original_column = original_columns[i]
            //     if (!visible_columns.includes(original_column)){
            //         console.log(original_column)
            //         new_record['columnName'] = original_column
            //         new_record['dataType'] = typeof output_data[original_column]
            //         new_record['updatedName'] = original_column
            //         break
            //     }
            // }
            // settings_create_column_edit_record(widget,original_columns, new_record)
        
            }
        let select_body_element = get_selector_element("flatten_select_root_"+activity.operatorId, array_values, array_values[0])
            
  
        add_div.appendChild(add_button)
        add_div.appendChild(select_body_element)
        let settings_json_list = []
        let columns = []
        let total_dupes = 0
        original_columns.forEach(column => {
            let settings_json = {}
            let dataType =typeof target_value[column]
            settings_json['operatorId'] = activity.operatorId
            settings_json['columnName'] = column
            settings_json['dataType'] = dataType
            settings_json['updatedName'] = column
            if (columns.includes(column)){
                console.log("Dupe Column", column);
                settings_json['columnName'] = column + "_"+String.toString(total_dupes)
                total_dupes +=1
            }
            settings_json_list.push(settings_json)
            columns.push(column)
        });

        // settings_div.setAttribute('settings_json', JSON.stringify(settings_json_list))
        // settings_div.setAttribute('original_record', JSON.stringify(target_value))
        settings_div.appendChild(add_div)
        settings_json_list.forEach(new_record => {
            settings_create_column_edit_record(widget,original_columns,new_record)
            
        });

}

function add_export_activity_settings(widget, activity, outputVal){
    let settings_div = document.getElementById('selected_activity_settings')
    settings_div.innerHTML = ""
    let export_button = document.createElement('button')
    let div = document.createElement('div')
    export_button.className = 'buttons'
    export_button.innerHTML = 'Export Data'
    export_button.style.color = 'black'
    export_button.style.backgroundColor = 'green'
    export_button.style.fontSiz3='20px'
    export_button.onclick = function(){
        let from_output_value = outputVal
        let csv = jsonToCsv(from_output_value)
        export_data(csv)
    }
    div.appendChild(export_button)

    settings_div.appendChild(div)
    if (outputVal !== null && outputVal != undefined) {
            if (Array.isArray(outputVal)){
                Object.keys(outputVal[0]).forEach(key => {
                let record = {'columnName': key, 'dataType': typeof outputVal[0][key],'updatedName': key}
                settings_create_column_edit_record(widget,Object.keys(outputVal[0]),record)
             })

            }else{
                 Object.keys(outputVal).forEach(key => {
                let record = {'columnName': key, 'dataType': typeof outputVal[key],'updatedName': key}
                settings_create_column_edit_record(widget,Object.keys(outputVal),record)
             })
            }

          
        }

}


function add_select_activity_settings(widget, activity, outputVal){
    let settings_div = document.getElementById('selected_activity_settings')
    settings_div.innerHTML = ""
    let add_button = document.createElement('button')
    add_button.setAttribute('operatorId', activity.operatorId)
    add_button.setAttribute('outputVal', JSON.stringify(outputVal))
    let add_div = document.createElement('div')
    add_button.innerHTML = '+ Add'
    add_button.className = 'buttons'
    add_button.style.color = 'black'
    add_button.style.backgroundColor = 'green'
    add_button.onclick = function(){
        let operatorId = this.getAttribute('operatorId')
        let activity = widget.flowchart('getOperatorActivity', operatorId)
        let outputVal = activity.outputs.output.value//JSON.parse(this.getAttribute('outputVal'))

        let settings_div = document.getElementById('selected_activity_settings');
        let visible_columns = Object.keys(activity.inputs.input.value)

        console.log(activity,visible_columns)
        // let rename_elems = settings_div.getElementsByClassName('rename_settings');
        // let visible_columns = []
        // for (let el of rename_elems) {
        //     visible_columns.push(el.children[0].value)
        // }
        let all_columns = []
        for (let i=0; i<Object.keys(outputVal).length; i++){
            let key = Object.keys(outputVal)[i]
             if (typeof outputVal[key] == 'object' && !Array.isArray(outputVal[key])){
                Object.keys(outputVal[key]).forEach(element => {
                    all_columns.push(key+"."+element)
                });

             }else{
                all_columns.push(key)
             }
        }
        let new_record = null
        for (let i=0; i<all_columns.length; i++){
            let new_column = all_columns[i]
            if (!visible_columns.includes(new_column)){
                let data_type = null
                if (new_column.includes(".")){
                    let root = new_column.split('.')[0]
                    let attr = new_column.split('.')[1]
                    data_type = typeof outputVal[root][attr]
                    let record = {'columnName': new_column, 'dataType': data_type,'updatedName': new_column}
                    new_record = record
                    let columnOptions = []
                    all_columns.forEach(element => {
                        if (element.includes(".")){
                            if (element.split(".")[0] == root){
                            columnOptions.push(element)
                            }
                        }
                    });
                    settings_create_column_edit_record(widget,columnOptions,record)
                }else{
                    data_type = typeof outputVal[new_column]
                }
                break
            }
        }

        if (new_record !=null){
            let new_column = new_record['columnName']
            if (new_column.includes('.')){
                let root = new_column.split('.')[0]
                let attr = new_column.split('.')[1]
                outputVal[new_column] = outputVal[root][attr]
                widget.flowchart('setoutputVal', operatorId,'output',outputVal)

            }


        }

    }
    
    
    
    
    

    add_div.appendChild(add_button)
    settings_div.appendChild(add_div)

    if (outputVal !== null) {
        if (Array.isArray(outputVal)){
            Object.keys(outputVal[0]).forEach(key => {
            let record = {'columnName': key, 'dataType': typeof outputVal[0][key],'updatedName': key}
            settings_create_column_edit_record(widget,Object.keys(outputVal[0]),record)})
        }else{
            if (outputVal == null || outputVal == undefined){
                return;
            }
            Object.keys(outputVal).forEach(key => {
                if (typeof outputVal[key] == 'object' && !Array.isArray(outputVal[key])){
                    // if its json object
                    // let columns = Object.keys(outputVal[key])
                    // let columnOptions = []
                    // let default_val = null
                    // columns.forEach(column => {
                    //     columnOptions.push(key + "."+column)
                    //     if (default_val == null){
                    //         default_val = key + "."+column
                    //     }
                    // });
                    let record = {'operatorId':activity.operatorId,'columnName': key, 'dataType': typeof outputVal[key],'updatedName':key}
                    settings_create_column_edit_record(widget,Object.keys(outputVal),record)
                }else{
                    let record = {'operatorId':activity.operatorId,'columnName': key, 'dataType': typeof outputVal[key],'updatedName':outputVal[key]}
                    settings_create_column_edit_record(widget,Object.keys(outputVal),record)

                }
        })
        }
    }





}

function add_import_activity_settings(widget, activity, outputVal){
        let settings_div = document.getElementById('selected_activity_settings')
        // $(settings_div).data('widget', widget);
        settings_div.innerHTML = ""
        const div = document.createElement('div');
        const input = document.createElement('input');
        if (settings_div.getAttribute('settings_json')!=null){
            let file_name_element = document.createElement('p')
            console.log("Settings json", JSON.parse(settings_div.getAttribute('settings_json')))
            file_name_element.innerHTML = JSON.parse(settings_div.getAttribute('settings_json'))['fileName']
            settings_div.appendChild(file_name_element)
        }
        div.appendChild(input)
        settings_div.insertBefore(div, settings_div.firstChild)
        if (outputVal !== null) {
            Object.keys(outputVal).forEach(key => {
            let record = {'operatorId':activity.operatorId,'columnName': key, 'dataType': typeof outputVal[key],'updatedName': key}
            settings_create_column_edit_record(widget,Object.keys(outputVal),record)
        })
        }




        input.type = 'file';
        input.setAttribute('operatorId', activity.operatorId)
        input.onchange = async function(e){
            let settings_json = {'fileName': null, 'values':null}
            let settings_div = document.getElementById('selected_activity_settings')
            //  widget = $(settings_div).data('widget');
            const file = e.target.files?.item(0);
            if (!file) {
                e.preventDefault();
                console.warn("No file selected, keeping existing content.");
                return;
            }
             if (file.name.includes(".json")){
                const text = await file.text();
                settings_json['fileName'] =  file.name
                settings_json['values'] =  outputVal
                let obj = JSON.parse(text);
                let operatorId = input.getAttribute('operatorId')
                document.querySelectorAll('.rename_settings').forEach(el => el.remove());
                document.querySelectorAll('p').forEach(el => el.remove());
                widget.flowchart('setFileType', operatorId,'json')
                widget.flowchart('setoutputVal', operatorId,'output',obj)
                // widget.setFileType(operatorId, 'json')
                // widget.setoutputVal(operatorId,'output',obj)
                let file_name_element = document.createElement('p')
                file_name_element.innerHTML = settings_json['fileName']
                settings_div.appendChild(file_name_element)
                Object.keys(obj).forEach(key => {
                let record = {'operatorId':operatorId,'columnName': key, 'dataType': typeof obj[key],'updatedName': key}
                settings_create_column_edit_record(widget,Object.keys(obj),record)
                settings_div.setAttribute('settings_json', JSON.stringify(settings_json))
                widget.flowchart('run_activity', operatorId)

                // widget.run_activity(operatorId)
                
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
            
            let originalName_selector_element = get_selector_element(
                                                    "flatten_name_"+operatorId
                                                    , original_columns
                                                    ,new_record['columnName']
                                                )

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
                if (outputVal.hasOwnProperty(target_column)){
                    delete outputVal[target_column];
                    widget.flowchart('setoutputVal', operatorId,'output',outputVal)
                    console.log("Deleted", outputVal)
                    
                }
                


                
            }

                let new_key_input = document.createElement('input')
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
    outputVal = fromOperator.outputs.output
    widget.setinputVal(linkData['toOperator'],'input', outputVal)
    if (toOperator.activityType == 'flatten'){
         // get body contents
        // get settings contents
        console.log("FROM",fromOperator)
        // add_flatten_activity_settings(toOperator, fromOperator.outputs.output.value)
    }



}