
class Group_Activity extends Activity{
    constructor(flowchart,activity){
        super(flowchart, activity)
        this.group_operators = ["COUNT", "SUM", "AVG", "MIN", "MAX"]
        this.add_button_label = "+ Add Group By"
        this.settings = this.get_settings_element()
    }
    get_operation_settings(){
        let settings = super.get_operation_settings('group')
        this.flowchart.flowchart('setSettings', this.activityId, settings)
        return settings
    }

    _add_column(e, widget, activity){
        let all_columns = []
        let activityId = activity.activityId
        let columns_div = document.getElementById(activity.activityId + "_column_edit");
        if (columns_div?.children.length > 0){
                return
            }
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
                'type': 'span'
                ,'label':"Group By:"
                ,'color': 'black'
            },
            {
                'type': 'selector'
                ,'options':all_columns
                ,'default_value': all_columns[0]
                ,'name':'multiple_column_names'
                ,'ismultiple':true
            },
                {
                'type': 'span'
                ,'label':"As:"
                ,'color': 'black'
            },
              ,{
                'type': 'input'
                ,'placeholder' : 'New column name'
                ,'name':'new_column_name'
            }
            , {
                'type': 'span'
                ,'label':"Operation:"
                ,'color': 'black'
            },
             , {
                'type': 'selector'
                ,'order':3
                ,'options': this.group_operators
                ,'default_value': this.group_operators[0]
                ,'name':'operation'
                
            }
               , {
                'type': 'span'
                ,'label':"On:"
                ,'color': 'black'
            },
           ,{
                'type': 'selector'
                ,'options':all_columns
                ,'default_value': ""
                ,'name': 'value'
            }
          ]
          
            let column_edit_element = this.get_column_selection_element(widget,settings)
            columns_div.appendChild(column_edit_element)
    }
  
}