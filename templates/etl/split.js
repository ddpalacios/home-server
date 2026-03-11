
class Split_Activity extends Activity{
    constructor(flowchart,activity){
        super(flowchart, activity)
        this.add_button_label = "+ Add Split"
        this.settings = this.get_settings_element()
        // this.operation_settings= null
    }
    _on_input_change(e, widget,activity){
        console.log(e.target.value)
        this.get_operation_settings()
    }
    _on_selector_change(e, widget,activity){
        console.log(e.target.value)
        this.get_operation_settings()
    }
    get_operation_settings(){
        let settings = super.get_operation_settings('split')
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
        let activityId = activity.activityId
        let columns_div = document.getElementById(activity.activityId + "_column_edit");
        if (columns_div == null || columns_div == undefined){
            let settings_div = document.getElementById('selected_activity_settings')
             columns_div = document.createElement('div')
            columns_div.id = this.activityId+ "_column_edit"
            settings_div.appendChild(columns_div)
        }
        const input_value = activity.activity &&
            activity.activity.inputs &&
            activity.activity.inputs.input &&
            activity.activity.inputs.input.value
            ? activity.activity.inputs.input.value.values
            : null
        if (Array.isArray(input_value)){
            all_columns = input_value.length ? Object.keys(input_value[0]) : []
        }else if (input_value){
            all_columns = Object.keys(input_value)
        } else {
            const saved_split = activity?.activity?.settings?.split
            if (Array.isArray(saved_split)) {
                all_columns = saved_split
                    .map(item => item?.columnName || item?.column_name)
                    .filter(Boolean)
            }
        }
        if (all_columns.length === 0) {
            all_columns = [""]
        }

        let settings = [
            {
                'type': 'span'
                ,'label':"Split Column"
                ,'color': 'black'
            },
            {
                'type': 'selector'
                ,'options':all_columns
                ,'default_value': all_columns[0]
                ,'name': "column_name"
            },
            {
                'type': 'span'
                ,'label':"Delimiter"
                ,'color': 'black'
            },
           ,{
                'type': 'input'
                ,'placeholder' : 'e.g. - or ,'
                ,'name': 'value'
            },
            {
                'type': 'span'
                ,'label':"First Column"
                ,'color': 'black'
            },
             ,{
                'type': 'input'
                ,'placeholder' : 'New column name'
                ,'name': 'new_column_name_1'
            }
                ,{
                'type': 'span'
                ,'label':"Second Column"
                ,'color': 'black'
            },
            ,{
                'type': 'input'
                ,'placeholder' : 'New column name'
                ,'name': 'new_column_name_2'
            }
            ,{
                'type': 'span'
                ,'label':"Drop Original"
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
}
