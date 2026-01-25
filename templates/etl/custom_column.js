
class Custom_Activity extends Activity{
    constructor(flowchart,activity){
        super(flowchart, activity)
        this.add_button_label = "+ Add Colunn"
        this.settings = this.get_settings_element()
        this.string_operations = ['EQUALS', 'DOES NOT EQUAL', 'STARTS_WITH', 'DOES NOT START WITH', 'ENDS_WITH', 'DOES NOT END WITH', 'CONTAINS','DOES NOT CONTAIN']
        this.number_operations = ['EQUALS', 'DOES NOT EQUAL', 'GREATER THAN', 'GREATER THAN OR EQUAL TO', 'LESS THAN', 'LESS THAN OR EQUAL TO', 'BETWEEN']
    }
    get_operation_settings(){
        const columns_div = document.getElementById(this.activityId + "_column_edit")
        if (!columns_div) {
            return null
        }
        const statements = []
        const column_rows = columns_div.querySelectorAll(".custom-column-row")
        column_rows.forEach((row) => {
            const statement = {}
            const getValue = (name) => {
                const el = row.querySelector(`[name="${name}"]`)
                return el ? el.value : ""
            }
            statement.new_column_name = getValue("new_column_name")
            statement.data_type = getValue("data_type")
            statement.value = getValue("value")
            statement.value_source = getValue("value_source")
            statement.date_start_column = getValue("date_start_column")
            statement.date_end_column = getValue("date_end_column")
            statement.date_base_column = getValue("date_base_column")
            statement.date_days_column = getValue("date_days_column")
            statement.date_compare_column = getValue("date_compare_column")
            const conditions = []
            const condition_rows = row.querySelectorAll(".custom-condition-row")
            condition_rows.forEach((cond) => {
                const col = cond.querySelector('[name="column_name"]')
                const op = cond.querySelector('[name="operation"]')
                const val = cond.querySelector('[name="condition_value"]')
                const thenVal = cond.querySelector('[name="then_value"]')
                const condition = {
                    columnName: col ? col.value : "",
                    operation: op ? op.value : "",
                    condition_value: val ? val.value : "",
                    then_value: thenVal ? thenVal.value : ""
                }
                const thenSource = cond.querySelector('[name="then_value_source"]')
                const thenColumn = cond.querySelector('[name="then_value_column"]')
                if (thenSource) {
                    condition.then_value_source = thenSource.value
                }
                if (thenColumn) {
                    condition.then_value_column = thenColumn.value
                }
                if (condition.then_value_source === "column" && (!condition.then_value_column || condition.then_value_column === "")) {
                    condition.then_value_column = condition.columnName
                }
                if (condition.columnName || condition.operation || condition.then_value || condition.condition_value) {
                    conditions.push(condition)
                }
            })
            if (conditions.length) {
                statement.conditions = conditions
                // Preserve legacy fields for compatibility.
                statement.columnName = conditions[0].columnName
                statement.operation = conditions[0].operation
                statement.condition_value = conditions[0].condition_value
                statement.then_value = conditions[0].then_value
            }
            statements.push(statement)
        })
        this.operation_settings = { custom: statements }
        this.flowchart.flowchart('setSettings', this.activityId, this.operation_settings)
        return this.operation_settings
    }


    _build_condition_row(all_columns, preset){
        const row = document.createElement("div")
        row.className = "custom-condition-row"
        row.style.display = "grid"
        row.style.gridTemplateColumns = "repeat(auto-fit, minmax(180px, 1fr))"
        row.style.gap = "10px"
        row.style.alignItems = "center"

        const buildSpan = (label) => {
            const span = document.createElement("span")
            span.textContent = label
            span.style.fontSize = "0.75rem"
            span.style.fontWeight = "600"
            span.style.letterSpacing = "0.05em"
            span.style.textTransform = "uppercase"
            span.style.color = "rgba(15, 23, 42, 0.6)"
            return span
        }
        const buildSelect = (name, options, value) => {
            const select = document.createElement("select")
            select.name = name
            options.forEach((opt) => {
                const option = document.createElement("option")
                option.value = opt
                option.textContent = opt
                select.appendChild(option)
            })
            if (value) {
                select.value = value
            }
            select.addEventListener("change", (event) => this._on_selector_change(event, this.flowchart, this))
            return select
        }
        const buildInput = (name, placeholder, value) => {
            const input = document.createElement("input")
            input.name = name
            input.placeholder = placeholder
            if (value != null) {
                input.value = value
            }
            input.addEventListener("input", (event) => this._on_input_change(event, this.flowchart, this))
            return input
        }
        const buildSelectWithOptions = (name, options, value) => {
            const select = document.createElement("select")
            select.name = name
            options.forEach((opt) => {
                const option = document.createElement("option")
                option.value = opt
                option.textContent = opt
                select.appendChild(option)
            })
            if (value) {
                select.value = value
            }
            select.addEventListener("change", (event) => this._on_selector_change(event, this.flowchart, this))
            return select
        }
        row.appendChild(buildSpan("If"))
        row.appendChild(buildSelect("column_name", all_columns, preset?.columnName))
        row.appendChild(buildSpan("Condition"))
        row.appendChild(buildSelect("operation", this.string_operations, preset?.operation || this.string_operations[0]))
        row.appendChild(buildInput("condition_value", "Compare value", preset?.condition_value || ""))
        row.appendChild(buildSpan("Then Value"))
        row.appendChild(buildSelectWithOptions("then_value_source", ["manual", "column"], preset?.then_value_source || "column"))
        row.appendChild(buildInput("then_value", "Value when condition is true", preset?.then_value || ""))
        row.appendChild(buildSelect("then_value_column", all_columns, preset?.then_value_column || preset?.columnName || ""))
        const remove_button = document.createElement("button")
        remove_button.className = "buttons danger-button"
        remove_button.textContent = "remove"
        remove_button.addEventListener("click", () => {
            row.remove()
            this.get_operation_settings()
        })
        row.appendChild(remove_button)

        const source_select = row.querySelector('[name="then_value_source"]')
        const value_input = row.querySelector('[name="then_value"]')
        const value_column = row.querySelector('[name="then_value_column"]')
        const condition_column = row.querySelector('[name="column_name"]')
        const updateVisibility = () => {
            const source = source_select ? source_select.value : "manual"
            if (value_input) {
                value_input.style.display = source === "manual" ? "" : "none"
            }
            if (value_column) {
                value_column.style.display = source === "column" ? "" : "none"
            }
            if (source === "column" && value_column && condition_column && (!value_column.value || value_column.value === "")) {
                value_column.value = condition_column.value
            }
        }
        if (source_select) {
            source_select.addEventListener("change", updateVisibility)
            updateVisibility()
        }
        if (condition_column && value_column && source_select) {
            condition_column.addEventListener("change", () => {
                if (source_select.value === "column") {
                    value_column.value = condition_column.value
                }
            })
        }
        return row
    }

    _add_column(e, widget, activity, preset){
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
            const saved_custom = activity?.activity?.settings?.custom
            if (Array.isArray(saved_custom)) {
                all_columns = saved_custom
                    .map(item => item?.columnName || item?.column_name)
                    .filter(Boolean)
            }
            if (preset && Array.isArray(preset.conditions)) {
                preset.conditions.forEach((cond) => {
                    if (cond && cond.columnName) {
                        all_columns.push(cond.columnName)
                    }
                })
            }
        }
        if (all_columns.length === 0) {
            all_columns = [""]
        } else {
            all_columns = Array.from(new Set(all_columns))
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
                ,'label':"Value Source"
                ,'color': 'black'
            }
            , {
                'type': 'selector'
                ,'options': ['manual', 'current_date', 'current_datetime', 'unique_id', 'date_diff_days', 'date_sub_days', 'date_gt_now', 'date_lt_now']
                ,'default_value': "manual"
                ,'name':'value_source'
            }
            , {
                'type': 'span'
                ,'label':"Date Compare Column"
                ,'color': 'black'
            }
            ,{
                'type': 'selector'
                ,'options': all_columns
                ,'default_value': all_columns[0]
                ,'name': 'date_compare_column'
            }
            , {
                'type': 'span'
                ,'label':"Base Date Column"
                ,'color': 'black'
            }
            ,{
                'type': 'selector'
                ,'options': all_columns
                ,'default_value': all_columns[0]
                ,'name': 'date_base_column'
            }
            , {
                'type': 'span'
                ,'label':"Days Column"
                ,'color': 'black'
            }
            ,{
                'type': 'selector'
                ,'options': all_columns
                ,'default_value': all_columns[0]
                ,'name': 'date_days_column'
            }
            , {
                'type': 'span'
                ,'label':"Start Date Column"
                ,'color': 'black'
            }
            ,{
                'type': 'selector'
                ,'options': all_columns
                ,'default_value': all_columns[0]
                ,'name': 'date_start_column'
            }
            , {
                'type': 'span'
                ,'label':"End Date Column"
                ,'color': 'black'
            }
            ,{
                'type': 'selector'
                ,'options': all_columns
                ,'default_value': all_columns[0]
                ,'name': 'date_end_column'
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
            const remove_button = Array.from(column_edit_element.children).find(child =>
                child.tagName === "BUTTON" && child.textContent.trim().toLowerCase() === "remove"
            )
            column_edit_element.classList.add("custom-column-row")
            const base_condition_fields = []
            const base_condition_labels = new Set(["If", "Condition", "Then Value"])
            const base_condition_names = new Set(["column_name", "operation", "condition_value", "then_value"])
            Array.from(column_edit_element.children).forEach((child) => {
                if (child.name && base_condition_names.has(child.name)) {
                    base_condition_fields.push(child)
                    return
                }
                if (child.tagName === "SPAN" && base_condition_labels.has(child.textContent.trim())) {
                    base_condition_fields.push(child)
                }
            })
            base_condition_fields.forEach((field) => {
                if (field.parentElement === column_edit_element) {
                    column_edit_element.removeChild(field)
                }
            })
            const conditionWrapper = document.createElement("div")
            conditionWrapper.className = "custom-condition-wrapper"
            conditionWrapper.style.display = "none"
            conditionWrapper.style.gridColumn = "1 / -1"
            conditionWrapper.style.flexDirection = "column"
            conditionWrapper.style.gap = "10px"
            conditionWrapper.style.paddingTop = "6px"
            conditionWrapper.style.borderTop = "1px dashed rgba(31, 79, 214, 0.25)"

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
                conditionWrapper.style.display = "flex"
                conditionWrapper.appendChild(this._build_condition_row(all_columns))
                this.get_operation_settings()
            })
            column_edit_element.insertBefore(toggle_button, remove_button || null)
            column_edit_element.insertBefore(conditionWrapper, remove_button || null)

            const conditions = Array.isArray(preset?.conditions) ? preset.conditions : []
            if (conditions.length > 0) {
                conditionWrapper.style.display = "flex"
                conditions.forEach((cond) => {
                    conditionWrapper.appendChild(this._build_condition_row(all_columns, cond))
                })
            } else if (preset && (preset.columnName || preset.column_name || preset.operation || preset.condition_value || preset.then_value)) {
                conditionWrapper.style.display = "flex"
                conditionWrapper.appendChild(this._build_condition_row(all_columns, {
                    columnName: preset.columnName || preset.column_name || "",
                    operation: preset.operation || this.string_operations[0],
                    condition_value: preset.condition_value || "",
                    then_value: preset.then_value || ""
                }))
            }
            const value_source_select = column_edit_element.querySelector('select[name="value_source"]')
            const default_value_input = column_edit_element.querySelector('[name="value"]')
            const default_value_label = Array.from(column_edit_element.children).find(child =>
                child.tagName === "SPAN" && child.textContent.trim() === "Default Value"
            )
            const date_start_select = column_edit_element.querySelector('select[name="date_start_column"]')
            const date_end_select = column_edit_element.querySelector('select[name="date_end_column"]')
            const date_base_select = column_edit_element.querySelector('select[name="date_base_column"]')
            const date_days_select = column_edit_element.querySelector('select[name="date_days_column"]')
            const date_compare_select = column_edit_element.querySelector('select[name="date_compare_column"]')
            const date_compare_label = Array.from(column_edit_element.children).find(child =>
                child.tagName === "SPAN" && child.textContent.trim() === "Date Compare Column"
            )
            const date_start_label = Array.from(column_edit_element.children).find(child =>
                child.tagName === "SPAN" && child.textContent.trim() === "Start Date Column"
            )
            const date_end_label = Array.from(column_edit_element.children).find(child =>
                child.tagName === "SPAN" && child.textContent.trim() === "End Date Column"
            )
            const date_base_label = Array.from(column_edit_element.children).find(child =>
                child.tagName === "SPAN" && child.textContent.trim() === "Base Date Column"
            )
            const date_days_label = Array.from(column_edit_element.children).find(child =>
                child.tagName === "SPAN" && child.textContent.trim() === "Days Column"
            )
            const condition_wrapper = column_edit_element.querySelector('.custom-condition-wrapper')
            const toggle_button_control = Array.from(column_edit_element.querySelectorAll('button'))
                .find(button => button.textContent.trim().toLowerCase().includes("condition")) || null

            const setVisible = (el, visible) => {
                if (!el) return
                el.style.display = visible ? "" : "none"
            }
            const update_visibility = () => {
                const source = value_source_select ? value_source_select.value : "manual"
                const show_manual = source === "manual"
                const show_date_diff = source === "date_diff_days"
                const show_date_sub = source === "date_sub_days"
                const show_date_gt_now = source === "date_gt_now" || source === "date_lt_now"
                const show_default_value = show_manual || show_date_gt_now
                setVisible(default_value_label, show_default_value)
                setVisible(default_value_input, show_default_value)
                setVisible(date_start_label, show_date_diff)
                setVisible(date_start_select, show_date_diff)
                setVisible(date_end_label, show_date_diff)
                setVisible(date_end_select, show_date_diff)
                setVisible(date_base_label, show_date_sub)
                setVisible(date_base_select, show_date_sub)
                setVisible(date_days_label, show_date_sub)
                setVisible(date_days_select, show_date_sub)
                setVisible(date_compare_label, show_date_gt_now)
                setVisible(date_compare_select, show_date_gt_now)
                if (toggle_button_control) {
                    toggle_button_control.style.display = show_manual ? "" : "none"
                }
                if (condition_wrapper) {
                    if (show_manual) {
                        condition_wrapper.querySelectorAll('[name="column_name"], [name="operation"], [name="condition_value"], [name="then_value"]').forEach(el => {
                            el.style.display = ""
                        })
                        condition_wrapper.querySelectorAll('span').forEach(span => {
                            span.style.display = ""
                        })
                    } else if (show_date_gt_now) {
                        condition_wrapper.style.display = "grid"
                        condition_wrapper.querySelectorAll('[name="column_name"], [name="operation"], [name="condition_value"]').forEach(el => {
                            el.style.display = "none"
                        })
                        condition_wrapper.querySelectorAll('span').forEach(span => {
                            const label = span.textContent.trim()
                            if (label === "If" || label === "Condition") {
                                span.style.display = "none"
                            } else if (label === "Then Value") {
                                span.style.display = ""
                            }
                        })
                        condition_wrapper.querySelectorAll('[name="then_value"]').forEach(el => {
                            el.style.display = ""
                        })
                    } else {
                        condition_wrapper.style.display = "none"
                    }
                }
            }
            if (value_source_select) {
                value_source_select.addEventListener("change", update_visibility)
                update_visibility()
            }
            if (preset) {
                const setField = (name, value) => {
                    if (!value) return
                    const el = column_edit_element.querySelector(`[name="${name}"]`)
                    if (el) {
                        el.value = value
                    }
                }
                const firstCondition = conditions.length ? conditions[0] : null
                setField("new_column_name", preset.new_column_name)
                setField("data_type", preset.data_type)
                setField("value", preset.value)
                setField("value_source", preset.value_source)
                setField("date_start_column", preset.date_start_column)
                setField("date_end_column", preset.date_end_column)
                setField("date_base_column", preset.date_base_column)
                setField("date_days_column", preset.date_days_column)
                setField("date_compare_column", preset.date_compare_column)
                if (value_source_select) {
                    value_source_select.dispatchEvent(new Event("change"))
                }
            }
            columns_div.appendChild(column_edit_element)
            return column_edit_element
    }

    _on_selector_change(e, widget, activity){
        this.get_operation_settings()
    }

    _on_input_change(e, widget, activity){
        this.get_operation_settings()
    }
  
}
