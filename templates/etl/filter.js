
class Filter_Activity extends Activity{
    constructor(flowchart,activity){
        super(flowchart, activity)
        this.string_operations = ['EQUALS', 'DOES NOT EQUAL', 'STARTS_WITH', 'DOES NOT START WITH', 'ENDS_WITH', 'DOES NOT END WITH', 'CONTAINS','DOES NOT CONTAIN', 'IS NOT NULL', 'IS NULL']
        this.number_operations = ['EQUALS', 'DOES NOT EQUAL', 'GREATER THAN', 'GREATER THAN OR EQUAL TO', 'LESS THAN', 'LESS THAN OR EQUAL TO', 'IS NOT NULL', 'IS NULL']
        this.all_operations = [
            'EQUALS',
            'DOES NOT EQUAL',
            'GREATER THAN',
            'GREATER THAN OR EQUAL TO',
            'LESS THAN',
            'LESS THAN OR EQUAL TO',
            'STARTS_WITH',
            'DOES NOT START WITH',
            'ENDS_WITH',
            'DOES NOT END WITH',
            'CONTAINS',
            'DOES NOT CONTAIN',
            'IN',
            'IS NOT NULL',
            'IS NULL'
        ]
        this.add_button_label = "+ Add Condition"
        this.settings = this.get_settings_element()
    }
    get_operation_settings(){
        let settings = super.get_operation_settings('where')
        this.flowchart.flowchart('setSettings', this.activityId, settings)
        return settings
    }
    _on_input_change(e, widget,activity){
        this.get_operation_settings()

    }
    get_operation_settings(){
        let settings = super.get_operation_settings('where')
        this.flowchart.flowchart('setSettings', this.activityId, settings)
        return settings
    }
    _get_input_columns(activityId){
        const current_activity = this.flowchart.flowchart("getOperatorActivity", activityId);
        const input_types = current_activity?.inputs?.input?.value?.datatypes;
        if (input_types && typeof input_types === "object") {
            return Object.keys(input_types);
        }
        const input_values = current_activity?.inputs?.input?.value?.values;
        if (Array.isArray(input_values) && input_values.length > 0){
            return Object.keys(input_values[0]);
        }
        if (input_values && typeof input_values === "object") {
            return Object.keys(input_values);
        }
        return [];
    }
    _on_button_click(e, widget, activity){
        let parent_element = e.target.parentElement;
        parent_element.remove()
        this.get_operation_settings()
    }
    _add_column(e, widget, activity){
        let activityId = activity.activityId
        let columns_div = document.getElementById(activityId + "_column_edit");
        if (columns_div == null || columns_div == undefined){
            return
        }
        let all_columns = this._get_input_columns(activityId)
        if (all_columns.length === 0) {
            const saved_where = activity?.activity?.settings?.where
            if (Array.isArray(saved_where)) {
                all_columns = saved_where
                    .map(item => item?.columnName || item?.column_name)
                    .filter(Boolean)
            }
        }
        if (all_columns.length === 0) {
            all_columns = [""]
        }
        const datatype_map = widget.flowchart("getOperatorActivity", activity.activityId).inputs?.input?.value?.datatypes || {};
        let s = new Set(Object.values(datatype_map));
        let datatypes = [...s]
        if (datatypes.length === 0) {
            const saved_where = activity?.activity?.settings?.where
            if (Array.isArray(saved_where)) {
                datatypes = saved_where
                    .map(item => item?.data_type)
                    .filter(Boolean)
            }
        }

        let settings = [
            {
                'type': 'span'
                ,'order':4
                ,'label':"WHERE"
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
                ,'options': datatypes
                ,'default_value': ""
                ,'name': "data_type"
                ,'disabled':true

            }
             , {
                'type': 'selector'
                ,'order':3
                ,'options': this.all_operations
                ,'default_value': this.all_operations[0]
                ,'name': 'operation'
            }
            ,{
                'type': 'input'
                ,'placeholder' : 'Value'
                ,'name': 'value'
            }
            , {
                'type': 'selector'
                ,'order':3
                ,'options': ['manual', 'current_date', 'current_datetime']
                ,'default_value': 'manual'
                ,'name': 'value_source'
            }
            , {
                'type': 'selector'
                ,'order':3
                ,'options': ['', 'add', 'subtract', 'This Week (Mon-Sun)', 'Last Week (Mon-Sun)', 'Next Week (Mon-Sun)']
                ,'default_value': ''
                ,'name': 'value_offset_direction'
            }
            ,{
                'type': 'input'
                ,'placeholder' : 'Offset amount'
                ,'name': 'value_offset_amount'
            }
            , {
                'type': 'selector'
                ,'order':3
                ,'options': ['day', 'week']
                ,'default_value': 'day'
                ,'name': 'value_offset_unit'
            }
            ,{
                 'type': 'selector'
                ,'order':4
                ,'options': ["AND", "OR"]
                ,'default_value': "AND"
                ,'name': 'logical'
            },{
                'type': 'button'
                ,'order':5
                ,'label': 'remove'
                ,'color': 'red'
                ,'name':'remove'
            }
          ]
         
            let column_edit_element = this.get_column_selection_element(widget,settings)
            columns_div.appendChild(column_edit_element)
            const value_source = column_edit_element.querySelector('[name="value_source"]')
            if (value_source) {
                value_source.dispatchEvent(new Event("change"))
            }
    }
    _on_selector_change(e, widget,activity){
        let value = e.target.value
        let parent_element = e.target.parentElement
        let target_element = e.target
        let target_name = e.target.name
        let datatypes = widget.flowchart("getOperatorActivity", activity.activityId).inputs?.input?.value?.datatypes || {}
        if (target_name == 'column_name'){
            parent_element.children[2].value = datatypes[value]
        }
        if (target_name == 'operation') {
            const valueInput = parent_element.querySelector('[name="value"]')
            if (valueInput) {
                if (value === 'IN' && valueInput.tagName !== 'TEXTAREA') {
                    const textarea = document.createElement('textarea')
                    textarea.name = 'value'
                    textarea.placeholder = 'Enter one value per line'
                    textarea.className = valueInput.className
                    textarea.value = valueInput.value
                    textarea.addEventListener("input", (event) => this._on_input_change(event, widget, this))
                    valueInput.replaceWith(textarea)
                } else if (value !== 'IN' && valueInput.tagName === 'TEXTAREA') {
                    const input = document.createElement('input')
                    input.name = 'value'
                    input.placeholder = 'Value'
                    input.className = valueInput.className
                    input.value = valueInput.value
                    input.addEventListener("input", (event) => this._on_input_change(event, widget, this))
                    valueInput.replaceWith(input)
                }
            }
        }
        if (target_name == 'value_source' || target_name == 'value_offset_direction') {
            const offsetDirection = parent_element.querySelector('[name="value_offset_direction"]')
            const offsetAmount = parent_element.querySelector('[name="value_offset_amount"]')
            const offsetUnit = parent_element.querySelector('[name="value_offset_unit"]')
            const operationSelect = parent_element.querySelector('[name="operation"]')
            const valueField = parent_element.querySelector('[name="value"]')
            const sourceSelect = parent_element.querySelector('[name="value_source"]')
            const sourceValue = sourceSelect ? sourceSelect.value : value
            const showOffsets = sourceValue === 'current_date' || sourceValue === 'current_datetime'
            const directionValue = offsetDirection ? offsetDirection.value : ''
            const isWeekPreset = directionValue === 'This Week (Mon-Sun)' ||
                directionValue === 'Last Week (Mon-Sun)' ||
                directionValue === 'Next Week (Mon-Sun)'
            const showOffsetDetails = showOffsets && directionValue && !isWeekPreset
            if (offsetDirection) {
                offsetDirection.style.display = showOffsets ? "" : "none"
            }
            if (offsetAmount) {
                offsetAmount.style.display = showOffsetDetails ? "" : "none"
            }
            if (offsetUnit) {
                offsetUnit.style.display = showOffsetDetails ? "" : "none"
            }
            if (operationSelect) {
                operationSelect.style.display = isWeekPreset ? "none" : ""
            }
            if (valueField) {
                valueField.style.display = isWeekPreset ? "none" : ""
            }
        }
        this.get_operation_settings()
    }
    get_settings_element(){
        let div = document.createElement('div')
        div.id = this.activityId

        const section = document.createElement('div')
        section.className = "combine-section panel stack"

        const add_button = document.createElement("button")
        add_button.innerHTML = this.add_button_label
        add_button.className = 'buttons add-button'
        add_button.style.padding = "8px 12px";
        add_button.style.cursor = "pointer";
        add_button.style.transition = "background 0.2s ease";
        add_button.addEventListener("click", (event) => this._add_column(event, this.flowchart, this));
        section.appendChild(add_button)

        const columns_div = document.createElement('div')
        columns_div.id = this.activityId+ "_column_edit"
        columns_div.style.display = 'flex'
        columns_div.style.flexDirection = 'column'
        columns_div.style.gap = "12px"
        section.appendChild(columns_div)

        div.appendChild(section)
        this._add_column(null, this.flowchart, this)

        return div
    }
}
