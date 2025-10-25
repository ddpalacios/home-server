
class Replace_Activity extends Activity{
    constructor(flowchart,activity){
        super(flowchart, activity)
        this.add_button_label = "+ Add Replace Logic"
        this.settings = this.get_settings_element()
        this.string_operations = ['EQUALS', 'DOES NOT EQUAL', 'STARTS_WITH', 'DOES NOT START WITH', 'ENDS_WITH', 'DOES NOT END WITH', 'CONTAINS','DOES NOT CONTAIN']
        this.number_operations = ['EQUALS', 'DOES NOT EQUAL', 'GREATER THAN', 'GREATER THAN OR EQUAL TO', 'LESS THAN', 'LESS THAN OR EQUAL TO', 'BETWEEN']
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
                'type': 'span'
                ,'label':"Replace Values In:"
                ,'color': 'black'
            }
              ,{
                'type': 'selector'
                ,'options':all_columns
                ,'default_value': all_columns[0]
            },
            , {
                'type': 'span'
                ,'label':"IF"
                ,'color': 'black'
            }
            ,{
                'type': 'selector'
                ,'options':all_columns
                ,'default_value': all_columns[0]
            }
            , {
                'type': 'selector'
                ,'options': this.string_operations
                ,'default_value': this.string_operations[0]
            }
            ,{
                'type': 'input'
                ,'placeholder' : ''
            }
              ,{
                'type': 'button'
                ,'label': '+ Add Condition'
                ,'color': 'green'
            }
             , {
                'type': 'span'
                ,'label':"THEN"
                ,'color': 'black'
            }
            ,{
                'type': 'input'
                ,'placeholder' : ''
            }
              , {
                'type': 'span'
                ,'label':"OTHERWISE"
                ,'color': 'black'
            }
            ,{
                'type': 'input'
                ,'placeholder' : ''
            }
              ,{
                'type': 'button'
                ,'label': 'remove'
                ,'color': 'red'
            }
          
            
          ]
          
            let column_edit_element = this.get_column_selection_element(widget,settings)
            columns_div.appendChild(column_edit_element)
    }
    _on_selector_change(e, widget,activity){
        alert("Changed")
    }
}