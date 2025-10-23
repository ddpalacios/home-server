class Import_Activity{
    constructor(flowchart,activity){
        this.activity = activity
        this.activityId = activity.operatorId
        this.flowchart = flowchart
    }

    get_input_value_columns(){
         let input_value;
         let all_columns;
        if (Array.isArray( this.activity.inputs.input.value)){
            all_columns = Object.keys(this.activity.inputs.input.value[0])
            input_value = this.activity.inputs.input.value[0]
        }else{
            all_columns = Object.keys(this.activity.inputs.input.value)
            input_value = this.activity.inputs.input.value
        }
        return all_columns
    }
    _add_custom_value(e, widget, activity){
        let parent_element = e.target.parentElement;
        console.log(e.target.value)
        widget.flowchart('addCustomValue', activity.activityId, parent_element.id, e.target.value)

    }
    _add_column(e, widget, activity){
        let all_columns = []
        let activityId = activity.activityId
        let input_value;
        if (Array.isArray( activity.activity.inputs.input.value)){
            all_columns = Object.keys(activity.activity.inputs.input.value[0])
            input_value = activity.activity.inputs.input.value[0]
        }else{
            all_columns = Object.keys(activity.activity.inputs.input.value)
            input_value = activity.activity.inputs.input.value

        }
         console.log("Adding From Original List", all_columns)
        let record = {'operatorId':activityId,'columnName': "", 'dataType': "",'updatedName': ""}
        let column_edit_element = document.getElementById(activityId+"_column_edit")
        console.log(column_edit_element, activity.activityId+"_column_edit")
        let n = this.get_column_selection_element(widget,all_columns,record)
        let new_input = document.createElement('input')
        
        n.appendChild(new_input)
        column_edit_element.appendChild(n)
        new_input.addEventListener("change", (event) => this._add_custom_value(event, widget, this));

        let select_val = {'select': record.columnName,'datatype': null, 'as': record.columnName, 'id':n.id, 'custom_value': null}
        widget.flowchart('addSelectColumn', activity.activityId, select_val)
        // activity.import_column_selection(widget,all_columns,record)
    }
    _delete_column(e, widget, activity){
        let parent_element = e.target.parentElement;
        parent_element.remove()
        console.log("deleting", parent_element.id)
        widget.flowchart('removeSelectColumn', activity.activityId, parent_element.id)
    }
    _on_datatype_select(e, widget,activity){
        let parent_element = e.target.parentElement;
        console.log(e.target.value)
        widget.flowchart('changeDataTypeSelectColumn', activity.activityId, parent_element.id, e.target.value)
    }
    _on_rename_column(e, widget,activity){
        let parent_element = e.target.parentElement;
        console.log(e.target.value)
        widget.flowchart('renameSelectColumn', activity.activityId, parent_element.id, e.target.value)
    }
    _on_column_select(e, widget, activity){
        let originalColumnName = e.target.parentElement.children[0].getAttribute("originalColumnName")

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
        let selected_columns = widget.flowchart('getOperatorActivity', activity.activityId).settings.select;
        let datatype = null
        for (let i =0; i < selected_columns.length; i++){
            if (selected_column == selected_columns[i].select){
                datatype = selected_columns[i].datatype
            }

        }

          e.target.parentElement.children[2].value =  name
          let select_val = {'select': selected_column, 'as': name, 'datatype': datatype, 'id':e.target.parentElement.id }
          widget.flowchart('addSelectColumn', activity.activityId, select_val)
          console.log(widget.flowchart('getOperatorActivity', activity.activityId))
    }
     get_column_selection_element(widget,original_columns,new_record){
        if (Object.keys(new_record).length <=1){
                console.log("Returning..")
                return;
            }
        let operatorId = new_record.operatorId
        let data_type = new_record['dataType']
        const datatype_options = ['string', 'number', 'decimal', 'object'];
        let data_type_selector_element = get_selector_element(
                                                    "flatten_datatype_"+operatorId
                                                    , datatype_options
                                                    ,data_type
                                                )
            data_type_selector_element.addEventListener("change", (event) => this._on_datatype_select(event, widget, this));
            // data_type_selector_element.disabled = true
            let originalName_selector_element = get_selector_element(
                                                    "flatten_name_"+operatorId
                                                    , original_columns
                                                    ,new_record['columnName']
                                                )
            
            
            originalName_selector_element.addEventListener("change", (event) => this._on_column_select(event, widget, this));
            originalName_selector_element.setAttribute("originalColumnName",new_record['columnName'])

            let delete_button = document.createElement('button')
            delete_button.setAttribute('operatorId', operatorId)
            delete_button.setAttribute('target_columnName', new_record['columnName'])
            delete_button.innerHTML = 'remove'
            delete_button.className = 'buttons'
            delete_button.style.color = 'red'
            delete_button.addEventListener("click", (event) => this._delete_column(event, widget, this));

            let new_key_input = document.createElement('input')
            new_key_input.value = new_record['columnName']
            new_key_input.addEventListener("change", (event) => this._on_rename_column(event, widget, this));


            


            let div = document.createElement('div')
            div.id = crypto.randomUUID();
            div.className = 'rename_settings'
            div.appendChild(originalName_selector_element)
            div.appendChild(data_type_selector_element)
            div.appendChild(new_key_input)
            div.appendChild(delete_button)
            return div
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
                widget.flowchart('setinputVal', activityId,'input',JSON.parse(JSON.stringify(obj)))
                widget.flowchart('setoutputVal', activityId,'output',JSON.parse(JSON.stringify(expand_struct(obj))))

        }
        if (file.name.includes('.csv')){
            let text = await file.text();
            obj = csvToJson(text);
            widget.flowchart('setinputVal', activityId,'input',JSON.parse(JSON.stringify(obj)))
            widget.flowchart('setoutputVal', activityId,'output',JSON.parse(JSON.stringify(obj)))
            obj = obj[0]
        }

        if (obj == null){
            alert("Invalid File. Not a CSV or JSON.");
            return
        }
        //  document.querySelectorAll('.rename_settings').forEach(el => el.remove());
        let expanded_obj = expand_struct(obj)
        let settings_div = document.getElementById('selected_activity_settings')
        let columns_div = document.createElement('div')
        columns_div.id = this.activityId+ "_column_edit"
         Object.keys(expanded_obj).forEach(key => {
            let record = {'operatorId':activityId,'columnName': key, 'dataType': typeof expanded_obj[key],'updatedName': key}
            let column_edit_element = this.get_column_selection_element(widget,Object.keys(expanded_obj),record)
            columns_div.appendChild(column_edit_element)
            let select_val = {'select': key, 'as': key, 'datatype':typeof expanded_obj[key] ,'id':column_edit_element.id }
            widget.flowchart('addSelectColumn', activity.activityId, select_val)
        }); 
        settings_div.appendChild(columns_div)
        widget.flowchart('run_activity', activityId)


    }

    get_settings_element(){
        let div = document.createElement('div')
        div.id = this.activityId
        let add_button = document.createElement('button')
        let add_div = document.createElement('div')
        add_button.setAttribute('operatorId', this.activityId)
        add_button.innerHTML = '+ Add'
        add_button.className = 'buttons'
        add_button.style.color = 'black'
        add_button.addEventListener("click", (event) => this._add_column(event, this.flowchart, this));
        add_div.appendChild(add_button)
        div.appendChild(add_div)
        const input = document.createElement('input');
        input.type = 'file';
        input.addEventListener("change", (event) => this._inputFile_onchange(event, this.flowchart, this));
        div.appendChild(input)
        if (this.activity.outputs.output.value == null || this.activity.outputs.output.value == undefined){
            return div
        }
        let current_output = this.activity.outputs.output.value
        let drop_columns = this.activity.settings.drop
        let columns_div = document.createElement('div')
        if (Array.isArray(current_output)){
            Object.keys(current_output[0]).forEach(key => {
                if (!drop_columns.includes(key)){
                    let record = {'operatorId':this.activityId,'columnName': key, 'dataType': typeof current_output[0][key],'updatedName': key}
                    let column_edit_element = this.get_column_selection_element(this.flowchart,Object.keys(current_output[0]),record)
                    columns_div.appendChild(column_edit_element)
                }
            })
        }else{
                let expanded_input_values = expand_struct(this.activity.outputs.output.value)
                let all_available_columns = Object.keys(expanded_input_values)
                 all_available_columns.forEach(key => {
                     if (!drop_columns.includes(key)){
                        let record = {'operatorId':this.activityId,'columnName': key, 'dataType': typeof expanded_input_values[key],'updatedName':expanded_input_values[key]}
                        let column_edit_element = this.get_column_selection_element(this.flowchart,Object.keys(expanded_input_values),record)
                        columns_div.appendChild(column_edit_element)

                     }
                    
                });

        }
        div.appendChild(columns_div)
        return div
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
        // if (activity.outputs.output.value == null || activity.outputs.output.value == undefined){
        //     return
        // }
        // let current_output = activity.outputs.output.value
        // if (Array.isArray(current_output)){
        //     Object.keys(current_output[0]).forEach(key => {
        //         let record = {'operatorId':activity.operatorId,'columnName': key, 'dataType': typeof current_output[0][key],'updatedName': key}
        //         settings_create_column_edit_record(widget,Object.keys(current_output[0]),record)
        //         })
        // }else{
        //         let expanded_input_values = expand_struct(activity.outputs.output.value)
        //         let all_available_columns = Object.keys(expanded_input_values)
        //          all_available_columns.forEach(key => {
        //             let record = {'operatorId':activity.operatorId,'columnName': key, 'dataType': typeof expanded_input_values[key],'updatedName':expanded_input_values[key]}
        //             settings_create_column_edit_record(widget,Object.keys(expanded_input_values),record)
        //         });

        // }
}