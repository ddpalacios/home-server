
class Sort_Activity extends Activity{
    constructor(flowchart,activity){
        super(flowchart, activity)
        this.string_operations = ['EQUALS', 'DOES NOT EQUAL', 'STARTS_WITH', 'DOES NOT START WITH', 'ENDS_WITH', 'DOES NOT END WITH', 'CONTAINS','DOES NOT CONTAIN', 'IS NOT NULL', 'IS NULL']
        this.number_operations = ['EQUALS', 'DOES NOT EQUAL', 'GREATER THAN', 'GREATER THAN OR EQUAL TO', 'LESS THAN', 'LESS THAN OR EQUAL TO', 'IS NOT NULL', 'IS NULL']
        this.add_button_label = "+ Add Sort"
        this.settings = this.get_settings_element()
    }


    _on_input_change(e, widget,activity){
        let parent_element = e.target.parentElement;
        console.log(e.target.value)
        // widget.flowchart('renameSelectColumn', activity.activityId, parent_element.id, e.target.value)
    }
    get_operation_settings(){
        let settings = super.get_operation_settings('sort')
        console.log("SORTING settings", settings)
        this.flowchart.flowchart('setSettings', this.activityId, settings)
        return settings
    }
    _on_button_click(e, widget, activity){
        let parent_element = e.target.parentElement;
        parent_element.remove()
        let row_id = parent_element.id
        console.log("deleting", parent_element.id)
        let settings = []
        activity.activity.settings?.sort.forEach(element => {
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
        let columns_div = document.getElementById(activityId + "_column_edit");
        if (columns_div == null || columns_div == undefined){
             settings_div = document.getElementById('selected_activity_settings')
             columns_div = document.createElement('div')
            columns_div.id = activityId+ "_column_edit"
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
                ,'order':4
                ,'label':"Sort By"
                ,'color': 'black'
            },
            {
                'type': 'selector'
                ,'order':1
                ,'options':all_columns
                ,'default_value': ""
                ,'name': "column_name"
            },
             {
                'type': 'selector'
                ,'order':2
                ,'options': ['ASC', 'DESC']
                ,'default_value': "ASC"
                ,'name': "orderby"
            }
           ,{
                'type': 'button'
                ,'order':5
                ,'label': 'remove'
                ,'color': 'red'
                ,'name':'remove'
            }
          ]
          
            let column_edit_element = this.get_column_selection_element(widget,settings)
            columns_div.appendChild(column_edit_element)
    }
    _on_selector_change(e, widget,activity){
        console.log(e.target.value)
        // let value = e.target.value
        // let parent_element = e.target.parentElement
        // let target_element = e.target
        // let target_name = e.target.name
        // let datatypes = widget.flowchart("getOperatorActivity", activity.activityId).inputs.input.value.datatypes
        // console.log("DATA TYPES", datatypes)
        // if (target_name == 'column_name'){
        //     parent_element.children[2].value = datatypes[value]
        //     e.target.parentElement.children[3].innerHTML = ''
        //     let options = null;
        //     if (datatypes[value] != 'string'){
        //         options = this.number_operations
        //     }else{
        //         options = this.string_operations
        //     }
        //     options.forEach(element => {
        //         let option = document.createElement('option')
        //         option.value = element
        //         option.innerHTML = element
        //         e.target.parentElement.children[3].appendChild(option)
        //     });

        // }
    }




}