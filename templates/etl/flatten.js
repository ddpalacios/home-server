
class Flatten_Activity extends Activity{
    constructor(flowchart,activity){
        super(flowchart, activity)
        this.add_button_label = "+ Add Flatten"
        this.settings = this.get_settings_element()
    }
    _on_input_change(e, widget,activity){
        let parent_element = e.target.parentElement;
    }
    get_operation_settings(){
        let settings = super.get_operation_settings('flatten')
        this.flowchart.flowchart('setSettings', this.activityId, settings)
        return settings
    }
    _on_button_click(e, widget, activity){
        let parent_element = e.target.parentElement;
        parent_element.remove()
        let row_id = parent_element.id
        // console.log("deleting", parent_element.id)
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
        let settings_div = document.getElementById('selected_activity_settings')
        

        let activityId = activity.activityId
        // console.log("FILTER ID", activityId)
        let columns_div = document.getElementById(activityId + "_column_edit");
        if (columns_div?.children.length > 0){
                return
            }
        if (columns_div == null || columns_div == undefined){
             settings_div = document.getElementById('selected_activity_settings')
             columns_div = document.createElement('div')
            columns_div.id = this.activityId+ "_column_edit"
            settings_div.appendChild(columns_div)
        }
        // console.log("CONDITION", activity)
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
                ,'order':1
                ,'options':all_columns
                ,'default_value': ""
                ,'name': "column_name"
            }
          ]
          
            let column_edit_element = this.get_column_selection_element(widget,settings)
            columns_div.appendChild(column_edit_element)
    }

    


}