
class Custom_Activity extends Activity{
    constructor(flowchart,activity){
        super(flowchart, activity)
        this.add_button_label = "+ Add Colunn"
        this.settings = this.get_settings_element()
        this.string_operations = ['EQUALS', 'DOES NOT EQUAL', 'STARTS_WITH', 'DOES NOT START WITH', 'ENDS_WITH', 'DOES NOT END WITH', 'CONTAINS','DOES NOT CONTAIN']
        this.number_operations = ['EQUALS', 'DOES NOT EQUAL', 'GREATER THAN', 'GREATER THAN OR EQUAL TO', 'LESS THAN', 'LESS THAN OR EQUAL TO', 'BETWEEN']
    }
    get_operation_settings(){
        let settings = super.get_operation_settings('custom')
        this.flowchart.flowchart('setSettings', this.activityId, settings)
        return settings
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

        let settings = [
              {
                'type': 'span'
                ,'label':"New Column Name"
                ,'color': 'black'
            }
              ,{
                'type': 'input'
                ,'placeholder' : ''
                ,'name':'new_column_name'

            }
            , {
                'type': 'span'
                ,'label':"Data Type"
                ,'color': 'black'
            }
            , {
                'type': 'selector'
                ,'options': ['string', 'int','datetime']
                ,'default_value': ""
                ,'name':'data_type'
            }
            , {
                'type': 'span'
                ,'label':"Value"
                ,'color': 'black'
            }
            ,{
                'type': 'input'
                ,'placeholder' : ''
                ,'name':'value'
            }
            , {
                'type': 'span'
                ,'label':"IF"
                ,'color': 'black'
            }
            ,{
                'type': 'selector'
                ,'options':all_columns
                ,'default_value': all_columns[0]
                ,'name': 'column_name'
            }
            , {
                'type': 'selector'
                ,'options': this.string_operations
                ,'default_value': this.string_operations[0]
                ,'name': 'operation'
            }
            ,{
                'type': 'input'
                ,'placeholder' : ''
                ,'name': 'condition_value'

            }
             , {
                'type': 'span'
                ,'label':"THEN"
                ,'color': 'black'
            }
            ,{
                'type': 'input'
                ,'placeholder' : ''
                ,'name': 'then_value'

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

  
}