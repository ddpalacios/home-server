
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
                ,'label':"New Column"
                ,'color': 'black'
            }
              ,{
                'type': 'input'
                ,'placeholder' : 'Column name'
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
                ,'default_value': "string"
                ,'name':'data_type'
            }
            , {
                'type': 'span'
                ,'label':"Default Value"
                ,'color': 'black'
            }
            ,{
                'type': 'input'
                ,'placeholder' : 'Used when no condition matches'
                ,'name':'value'
            }
            , {
                'type': 'span'
                ,'label':"If"
                ,'color': 'black'
            }
            ,{
                'type': 'selector'
                ,'options':all_columns
                ,'default_value': all_columns[0]
                ,'name': 'column_name'
            }
            , {
                'type': 'span'
                ,'label':"Condition"
                ,'color': 'black'
            }
            , {
                'type': 'selector'
                ,'options': this.string_operations
                ,'default_value': this.string_operations[0]
                ,'name': 'operation'
            }
            ,{
                'type': 'input'
                ,'placeholder' : 'Compare value'
                ,'name': 'condition_value'

            }
             , {
                'type': 'span'
                ,'label':"Then Value"
                ,'color': 'black'
            }
            ,{
                'type': 'input'
                ,'placeholder' : 'Value when condition is true'
                ,'name': 'then_value'

            }
            ,{
                'type': 'button'
                ,'label': 'remove'
                ,'color': 'red'
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
            const condition_fields = []
            const condition_labels = new Set(["If", "Condition", "Then Value"])
            const condition_names = new Set(["column_name", "operation", "condition_value", "then_value"])
            const remove_button = Array.from(column_edit_element.children).find(child =>
                child.tagName === "BUTTON" && child.textContent.trim().toLowerCase() === "remove"
            )
            Array.from(column_edit_element.children).forEach((child) => {
                if (child.name && condition_names.has(child.name)) {
                    condition_fields.push(child)
                    return
                }
                if (child.tagName === "SPAN" && condition_labels.has(child.textContent.trim())) {
                    condition_fields.push(child)
                }
            })
            if (condition_fields.length > 0) {
                const condition_wrapper = document.createElement("div")
                condition_wrapper.style.display = "none"
                condition_wrapper.style.gridColumn = "1 / -1"
                condition_wrapper.style.gridTemplateColumns = "repeat(auto-fit, minmax(180px, 1fr))"
                condition_wrapper.style.gap = "10px"
                condition_wrapper.style.alignItems = "center"
                condition_wrapper.style.paddingTop = "6px"
                condition_wrapper.style.borderTop = "1px dashed rgba(31, 79, 214, 0.25)"
                condition_fields.forEach((field) => {
                    if (field.parentElement === column_edit_element) {
                        column_edit_element.removeChild(field)
                    }
                    condition_wrapper.appendChild(field)
                })

                const toggle_button = document.createElement("button")
                toggle_button.className = "buttons"
                toggle_button.textContent = "Add Condition"
                toggle_button.style.gridColumn = "1 / -1"
                toggle_button.style.justifySelf = "start"
                toggle_button.style.background = "rgba(31, 79, 214, 0.12)"
                toggle_button.style.border = "1px solid rgba(31, 79, 214, 0.3)"
                toggle_button.style.color = "#1f4fd6"
                toggle_button.style.fontSize = "0.75rem"
                toggle_button.style.borderRadius = "999px"
                toggle_button.style.padding = "6px 12px"
                toggle_button.addEventListener("click", () => {
                    const is_hidden = condition_wrapper.style.display === "none"
                    condition_wrapper.style.display = is_hidden ? "grid" : "none"
                    toggle_button.textContent = is_hidden ? "Remove Condition" : "Add Condition"
                    if (!is_hidden) {
                        condition_wrapper.querySelectorAll('input[name="then_value"], input[name="condition_value"]').forEach((input) => {
                            input.value = ""
                        })
                    }
                })

                column_edit_element.insertBefore(toggle_button, remove_button || null)
                column_edit_element.insertBefore(condition_wrapper, remove_button || null)
            }
            columns_div.appendChild(column_edit_element)
    }

    _on_selector_change(e, widget, activity){
        this.get_operation_settings()
    }

    _on_input_change(e, widget, activity){
        this.get_operation_settings()
    }
  
}
