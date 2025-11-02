class Select_Activity extends Activity{
    constructor(flowchart,activity){
        super(flowchart,activity)
        this.settings = this.get_settings_element()
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
        if (columns_div != null){
            columns_div.innerHTML = ""
                let from_value = activity.activity.link_from[0].outputs.output.value
                widget.flowchart('setinputVal', activityId,'input',from_value)
        }

        let all_columns = []
        let add_button = document.createElement("button")
        add_button.innerHTML = this.add_button_label
        add_button.style.width = '15%'
        add_button.className = 'buttons'
        add_button.style.backgroundColor = "#28a745"; // modern bootstrap green
        add_button.style.color = "white";
        add_button.style.border = "none";
        add_button.style.borderRadius = "6px";
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

          if (Array.isArray( activity.activity.inputs.input.value.values)){
            all_columns = Object.keys(activity.activity.inputs.input.value.values[0])
        }else{
            all_columns = Object.keys(activity.activity.inputs.input.value.values)

        }
        columns_div.appendChild(add_button)
        let datatypes = widget.flowchart("getOperatorActivity", activity.activityId).inputs.input.value.datatypes;
        let s = new Set(Object.values(datatypes));
        let unique_datatypes = [...s]


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
                ,'options': ['string','int', 'datetime','decimal','array']
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
            columns_div.appendChild(column_edit_element)
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
                columns_div.style.display = 'flex'
                columns_div.style.flexDirection = 'column'
                columns_div.style.gap = "5px"
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
                ,'label': 'DROP'
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
    }
}