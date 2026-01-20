
class Replace_Activity extends Activity{
    constructor(flowchart,activity){
        super(flowchart, activity)
        this.add_button_label = "+ Add Replace Logic"
        this.settings = this.get_settings_element()
        this.string_operations = ['EQUALS', 'DOES NOT EQUAL', 'STARTS_WITH', 'DOES NOT START WITH', 'ENDS_WITH', 'DOES NOT END WITH', 'CONTAINS','DOES NOT CONTAIN']
        this.number_operations = ['EQUALS', 'DOES NOT EQUAL', 'GREATER THAN', 'GREATER THAN OR EQUAL TO', 'LESS THAN', 'LESS THAN OR EQUAL TO', 'BETWEEN']
        this._ensure_add_button()
        this._restore_saved_settings()
    }

    _is_meaningful_setting(statement) {
        if (!statement || typeof statement !== "object") {
            return false
        }
        const hasValue = (value) => value != null && String(value).trim() !== ""
        const hasReplaceValues = (
            hasValue(statement.find_value) ||
            hasValue(statement.value) ||
            hasValue(statement.new_column_name) ||
            hasValue(statement.renamed_name)
        )
        const hasConditionValues = (
            hasValue(statement.condition_value) ||
            hasValue(statement.else_value)
        )
        return hasReplaceValues || hasConditionValues
    }

    _filter_settings(settings) {
        if (!Array.isArray(settings)) {
            return []
        }
        return settings.filter(statement => this._is_meaningful_setting(statement))
    }

    _prune_empty_rows() {
        const columns_div = document.getElementById(this.activityId + "_column_edit")
        if (!columns_div) {
            return
        }
        const rows = Array.from(columns_div.children)
        rows.forEach(row => {
            const getValue = (name) => {
                const element = row.querySelector(`[name="${name}"]`)
                if (!element) {
                    return ""
                }
                return element.value || ""
            }
            const hasValue = (value) => value != null && String(value).trim() !== ""
            const hasReplaceValues = (
                hasValue(getValue("find_value")) ||
                hasValue(getValue("value")) ||
                hasValue(getValue("new_column_name"))
            )
            const hasConditionValues = (
                hasValue(getValue("condition_value")) ||
                hasValue(getValue("else_value"))
            )
            if (!hasReplaceValues && !hasConditionValues) {
                row.remove()
            }
        })
    }

    _ensure_add_button(){
        if (!this.settings) {
            return
        }
        const existing = this.settings.querySelector(".replace-add-button")
        if (existing) {
            existing.textContent = this.add_button_label
            return
        }
        const fallback = this.settings.querySelector(".add-button")
        if (fallback) {
            fallback.textContent = this.add_button_label
            fallback.classList.add("replace-add-button")
            return
        }
        const add_button = document.createElement("button")
        add_button.type = "button"
        add_button.className = "buttons add-button replace-add-button"
        add_button.textContent = this.add_button_label
        add_button.addEventListener("click", (event) => this._add_column(event, this.flowchart, this))
        this.settings.insertBefore(add_button, this.settings.firstChild)
    }
    get_operation_settings(){
        let settings = super.get_operation_settings('replace')
        if (!settings) {
            return null
        }
        const filtered = this._filter_settings(settings.replace)
        this.operation_settings = { replace: filtered }
        this.flowchart.flowchart('setSettings', this.activityId, this.operation_settings)
        return this.operation_settings
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
        this.flowchart.flowchart('setSettings', this.activityId, { replace: settings })
        if (typeof window.flowchartSchedulePipelineSave === "function") {
            window.flowchartSchedulePipelineSave()
        }
    }

    _add_column(e, widget, activity){
        let all_columns = []
        let activityId = activity.activityId
        let columns_div = document.getElementById(activity.activityId + "_column_edit");

        if (columns_div == null || columns_div == undefined){
            columns_div = document.createElement('div')
            columns_div.id = this.activityId+ "_column_edit"
            if (this.settings) {
                this.settings.appendChild(columns_div)
            } else {
                let settings_div = document.getElementById('selected_activity_settings')
                if (settings_div) {
                    settings_div.appendChild(columns_div)
                }
            }
        }
        const input_values = activity?.activity?.inputs?.input?.value?.values
        if (Array.isArray(input_values)){
            all_columns = Object.keys(input_values[0] || {})
        }else if (input_values){
            all_columns = Object.keys(input_values)
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
                condition_wrapper.className = "replace-condition-wrapper"
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
                toggle_button.className = "buttons replace-condition-toggle"
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

    _restore_saved_settings(){
        const live_activity = this.flowchart && typeof this.flowchart.flowchart === "function"
            ? this.flowchart.flowchart("getOperatorActivity", this.activityId)
            : this.activity
        const settings = live_activity?.settings || this.activity?.settings
        const saved_settings = Array.isArray(settings?.replace)
            ? settings.replace
            : (Array.isArray(settings) ? settings : null)
        if (!Array.isArray(saved_settings) || saved_settings.length === 0) {
            return
        }
        const meaningful_settings = this._filter_settings(saved_settings)
        let columns_div = document.getElementById(this.activityId + "_column_edit")
        if (!columns_div) {
            columns_div = document.createElement('div')
            columns_div.id = this.activityId + "_column_edit"
            this.settings.appendChild(columns_div)
        }
        columns_div.innerHTML = ""
        if (meaningful_settings.length === 0) {
            this._ensure_add_button()
            this.flowchart.flowchart('setSettings', this.activityId, { replace: [] })
            return
        }
        meaningful_settings.forEach(statement => {
            this._add_column(null, this.flowchart, this)
            const row = columns_div.lastElementChild
            if (!row || !statement) {
                return
            }
            const setValue = (name, value) => {
                if (value == null) {
                    return
                }
                const element = row.querySelector(`[name="${name}"]`)
                if (!element) {
                    return
                }
                if (element.tagName === "SELECT") {
                    const hasOption = Array.from(element.options).some(option => option.value === value)
                    if (!hasOption) {
                        const option = document.createElement("option")
                        option.value = value
                        option.textContent = value
                        element.appendChild(option)
                    }
                }
                element.value = value
            }
            setValue("column_name_1", statement.columnName_1 || statement.column_name_1)
            setValue("find_value", statement.find_value)
            setValue("value", statement.value)
            setValue("new_column_name", statement.new_column_name || statement.renamed_name)
            setValue("column_name_2", statement.columnName_2 || statement.column_name_2)
            setValue("operation", statement.operation)
            setValue("condition_value", statement.condition_value)
            setValue("else_value", statement.else_value)

            const has_condition = !!(statement.columnName_2 || statement.column_name_2 || statement.operation || statement.condition_value || statement.else_value)
            if (has_condition) {
                const condition_wrapper = row.querySelector(".replace-condition-wrapper")
                const toggle_button = row.querySelector(".replace-condition-toggle")
                if (condition_wrapper) {
                    condition_wrapper.style.display = "grid"
                }
                if (toggle_button) {
                    toggle_button.textContent = "Remove Condition"
                }
            }
        })
        this._ensure_add_button()
        this.flowchart.flowchart('setSettings', this.activityId, { replace: meaningful_settings })
        if (document.getElementById(this.activityId + "_column_edit")) {
            this.get_operation_settings()
        }
        this._prune_empty_rows()
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
        if (typeof window.flowchartSchedulePipelineSave === "function") {
            window.flowchartSchedulePipelineSave()
        }
    }

    _on_input_change(e, widget, activity){
        this.get_operation_settings()
        if (typeof window.flowchartSchedulePipelineSave === "function") {
            window.flowchartSchedulePipelineSave()
        }
    }
}
