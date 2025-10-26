
class Split_Activity extends Activity{
    constructor(flowchart,activity){
        super(flowchart, activity)
        this.add_button_label = "+ Add Split"
        this.settings = this.get_settings_element()
        // this.operation_settings= null
    }
    _on_input_change(e, widget,activity){
        let parent_element = e.target.parentElement;
        console.log(e.target.value)
        // widget.flowchart('renameSelectColumn', activity.activityId, parent_element.id, e.target.value)
    }
    get_operation_settings(){
        let settings = super.get_operation_settings('split')
        this.flowchart.flowchart('setSettings', this.activityId, settings)
        return settings
    }
    _on_button_click(e, widget, activity){
        let parent_element = e.target.parentElement;
        parent_element.remove()
        let row_id = parent_element.id
        console.log("deleting", parent_element.id)
        let settings = []
        activity.activity.settings?.where.forEach(element => {
            if (element.row_id != row_id){
                settings.push(element)
            }
        });
        this.flowchart.flowchart('setSettings', this.activityId, settings)
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
        console.log("SPLIT", activity)
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
                'type': 'span'
                ,'label':"SPLIT"
                ,'color': 'black'
            },
            {
                'type': 'selector'
                ,'options':all_columns
                ,'default_value': ""
                ,'name': "column_name"
            },
            {
                'type': 'span'
                ,'label':"BY DELIMITER"
                ,'color': 'black'
            },
           ,{
                'type': 'input'
                ,'placeholder' : 'Value'
                ,'name': 'value'
            },
            {
                'type': 'span'
                ,'label':"Part 1 Column Name"
                ,'color': 'black'
            },
             ,{
                'type': 'input'
                ,'placeholder' : 'new column name'
                ,'name': 'new_column_name_1'
            }
                ,{
                'type': 'span'
                ,'label':"Part 2 Column Name"
                ,'color': 'black'
            },
            ,{
                'type': 'input'
                ,'placeholder' : 'new column name'
                ,'name': 'new_column_name_2'
            }
            ,{
                'type': 'span'
                ,'label':"Drop Original Column"
                ,'color': 'black'
            },
            {
                'type': 'selector'
                ,'options':['TRUE', 'FALSE']
                ,'default_value': "FALSE"
                ,'name': "case"
            }
           ,{
                'type': 'button'
                ,'label': 'remove'
                ,'color': 'red'
                ,'name':'remove'
            }
          ]
          
            let column_edit_element = this.get_column_selection_element(widget,settings)
            columns_div.appendChild(column_edit_element)
    }
}