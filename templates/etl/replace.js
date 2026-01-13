
class Replace_Activity extends Activity{
    constructor(flowchart,activity){
        super(flowchart, activity)
        this.add_button_label = "+ Add Replace Logic"
        this.settings = this.get_settings_element()
        this.string_operations = ['EQUALS', 'DOES NOT EQUAL', 'STARTS_WITH', 'DOES NOT START WITH', 'ENDS_WITH', 'DOES NOT END WITH', 'CONTAINS','DOES NOT CONTAIN']
        this.number_operations = ['EQUALS', 'DOES NOT EQUAL', 'GREATER THAN', 'GREATER THAN OR EQUAL TO', 'LESS THAN', 'LESS THAN OR EQUAL TO', 'BETWEEN']
    }
    get_operation_settings(){
        let settings = super.get_operation_settings('replace')
        this.flowchart.flowchart('setSettings', this.activityId, settings)
        return settings
    }

    _on_button_click(e, widget, activity){
        let parent_element = e.target.parentElement;
        parent_element.remove()
        let row_id = parent_element.id
        console.log("deleting", parent_element.id)

        let settings = []
        activity.activity.settings?.replace.forEach(element => {
            if (element.row_id != row_id){
                settings.push(element)
            }
        });
        if (settings.length > 0){
            this.flowchart.flowchart('setSettings', this.activityId, settings)
        }
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
                ,'label':"Replace In"
                ,'color': 'black'
            }
              ,{
                'type': 'selector'
                ,'options':all_columns
                ,'default_value': all_columns[0]
                ,'name':'column_name_1'
            },
            , {
                'type': 'span'
                ,'label':"Find"
                ,'color': 'black'
            }
            ,{
                'type': 'input'
                ,'placeholder' : 'Character(s) to replace'
                ,'name': 'find_value'

            }
            , {
                'type': 'span'
                ,'label':"Replace With"
                ,'color': 'black'
            }
            ,{
                'type': 'input'
                ,'placeholder' : 'New character(s)'
                ,'name': 'value'

            }
            , {
                'type': 'span'
                ,'label':"Set"
                ,'color': 'black'
            }
            ,{
                'type': 'input'
                ,'placeholder' : 'Optional new column'
                ,'name': 'new_column_name'

            }
            , {
                'type': 'span'
                ,'label':"If And Only If"
                ,'color': 'black'
            }
            ,{
                'type': 'selector'
                ,'options':all_columns
                ,'default_value': all_columns[0]
                ,'name': 'column_name_2'
            }
            , {
                'type': 'span'
                ,'label':"Match"
                ,'color': 'black'
            }
            , {
                'type': 'selector'
                ,'options': this.string_operations
                ,'default_value': 'CONTAINS'
                ,'name': 'operation'
            }
            ,{
                'type': 'input'
                ,'placeholder' : 'Match value'
                ,'name': 'condition_value'

            }
              , {
                'type': 'span'
                ,'label':"Otherwise"
                ,'color': 'black'
            }
            ,{
                'type': 'input'
                ,'placeholder' : 'Fallback value (optional)'
                ,'name': 'else_value'

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
            const condition_labels = new Set(["If And Only If", "Match", "Otherwise"])
            const condition_names = new Set(["column_name_2", "operation", "condition_value", "else_value"])
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

                const condition_column = condition_wrapper.querySelector('select[name="column_name_2"]')
                const operation_select = condition_wrapper.querySelector('select[name="operation"]')
                if (condition_column) {
                    const empty_option = document.createElement('option')
                    empty_option.value = ""
                    empty_option.innerHTML = ""
                    condition_column.insertBefore(empty_option, condition_column.firstChild)
                    condition_column.value = ""
                }
                if (operation_select) {
                    const empty_option = document.createElement('option')
                    empty_option.value = ""
                    empty_option.innerHTML = ""
                    operation_select.insertBefore(empty_option, operation_select.firstChild)
                    operation_select.value = ""
                }

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
                    if (is_hidden) {
                        const replace_column = column_edit_element.querySelector('select[name="column_name_1"]')
                        if (condition_column && replace_column) {
                            condition_column.value = replace_column.value
                        }
                        if (operation_select) {
                            const datatypes = widget.flowchart("getOperatorActivity", activity.activityId).inputs.input.value.datatypes || {}
                            const datatype = datatypes[condition_column ? condition_column.value : ""]
                            const options = datatype && datatype !== 'string' ? this.number_operations : this.string_operations
                            operation_select.innerHTML = ''
                            options.forEach(element => {
                                let option = document.createElement('option')
                                option.value = element
                                option.innerHTML = element
                                operation_select.appendChild(option)
                            })
                        }
                    }
                    if (!is_hidden) {
                        condition_wrapper.querySelectorAll('input[name="condition_value"], input[name="else_value"]').forEach((input) => {
                            input.value = ""
                        })
                        if (condition_column) {
                            condition_column.value = ""
                        }
                        if (operation_select) {
                            operation_select.value = ""
                        }
                    }
                })

                column_edit_element.insertBefore(toggle_button, remove_button || null)
                column_edit_element.insertBefore(condition_wrapper, remove_button || null)
            }

            const replace_column = column_edit_element.querySelector('select[name="column_name_1"]')
            const condition_column = column_edit_element.querySelector('select[name="column_name_2"]')
            if (replace_column && condition_column) {
                condition_column.value = replace_column.value
            }

            columns_div.appendChild(column_edit_element)
    }

    _on_selector_change(e, widget, activity){
        const target_name = e.target.name
        if (target_name === 'column_name_1') {
            const row = e.target.parentElement
            const condition_column = row.querySelector('select[name="column_name_2"]')
            if (condition_column && condition_column.value === "") {
                condition_column.value = e.target.value
            }
        }
        if (target_name === 'column_name_2') {
            const row = e.target.parentElement
            const operation_select = row.querySelector('select[name="operation"]')
            const datatypes = widget.flowchart("getOperatorActivity", activity.activityId).inputs.input.value.datatypes || {}
            const datatype = datatypes[e.target.value]
            if (operation_select) {
                const options = datatype && datatype !== 'string' ? this.number_operations : this.string_operations
                operation_select.innerHTML = ''
                options.forEach(element => {
                    let option = document.createElement('option')
                    option.value = element
                    option.innerHTML = element
                    operation_select.appendChild(option)
                })
            }
        }
        this.get_operation_settings()
    }

    _on_input_change(e, widget, activity){
        this.get_operation_settings()
    }
}
