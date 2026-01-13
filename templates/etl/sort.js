
class Sort_Activity extends Activity{
    constructor(flowchart,activity){
        super(flowchart, activity)
        this.string_operations = ['EQUALS', 'DOES NOT EQUAL', 'STARTS_WITH', 'DOES NOT START WITH', 'ENDS_WITH', 'DOES NOT END WITH', 'CONTAINS','DOES NOT CONTAIN', 'IS NOT NULL', 'IS NULL']
        this.number_operations = ['EQUALS', 'DOES NOT EQUAL', 'GREATER THAN', 'GREATER THAN OR EQUAL TO', 'LESS THAN', 'LESS THAN OR EQUAL TO', 'IS NOT NULL', 'IS NULL']
        this.add_button_label = "+ Add Sort"
        this.settings = this.get_settings_element()
    }


    _on_input_change(e, widget,activity){
        console.log(e.target.value)
        this.get_operation_settings()
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
        this.get_operation_settings()
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
        if (Array.isArray(activity.activity.inputs.input.value.values)){
            all_columns = Object.keys(activity.activity.inputs.input.value.values[0])
        }else if (activity.activity.inputs.input.value.values){
            all_columns = Object.keys(activity.activity.inputs.input.value.values)
        }
        if (all_columns.length === 0) {
            all_columns = [""]
        }

        let settings = [
            {
                'type': 'span'
                ,'order':4
                ,'label':"Sort"
                ,'color': 'black'
            },
            {
                'type': 'selector'
                ,'order':1
                ,'options':all_columns
                ,'default_value': all_columns[0]
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
            column_edit_element.style.display = "grid"
            column_edit_element.style.gridTemplateColumns = "repeat(auto-fit, minmax(180px, 1fr))"
            column_edit_element.style.gap = "10px"
            column_edit_element.style.alignItems = "center"
            column_edit_element.style.width = "100%"
            column_edit_element.style.boxSizing = "border-box"
            column_edit_element.style.padding = "12px 14px"
            column_edit_element.style.border = "1px solid rgba(31, 79, 214, 0.16)"
            column_edit_element.style.borderRadius = "12px"
            column_edit_element.style.background = "linear-gradient(135deg, #eef4ff 0%, #dfe9ff 100%)"
            column_edit_element.style.boxShadow = "0 10px 18px rgba(15, 23, 42, 0.08)"
            Array.from(column_edit_element.children).forEach((child) => {
                if (child.tagName === "INPUT" || child.tagName === "SELECT") {
                    child.style.width = "100%"
                    child.style.minWidth = "0"
                    child.style.boxSizing = "border-box"
                }
                if (child.tagName === "SPAN") {
                    child.style.fontSize = "0.75rem"
                    child.style.fontWeight = "600"
                    child.style.letterSpacing = "0.05em"
                    child.style.textTransform = "uppercase"
                    child.style.color = "rgba(15, 23, 42, 0.6)"
                }
            })
            columns_div.appendChild(column_edit_element)
    }
    _on_selector_change(e, widget,activity){
        console.log(e.target.value)
        this.get_operation_settings()
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
