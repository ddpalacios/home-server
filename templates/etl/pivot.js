class Pivot_Activity extends Activity{
    constructor(flowchart,activity){
        super(flowchart, activity)
        this.add_button_label = "+ Add Pivot"
        this.pivot_operations = ['PIVOT', 'UNPIVOT']
        this.agg_operations = ['COUNT', 'SUM', 'AVG', 'MIN', 'MAX']
        this.settings = this.get_settings_element()
    }
    get_operation_settings(){
        let settings = super.get_operation_settings('pivot')
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
        const row = e.target.closest(".rename_settings") || e.target.parentElement;
        if (row) {
            row.remove()
        }
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
            all_columns = [""]
        }

        let settings = [
            {
                'type': 'span'
                ,'label':"Mode"
                ,'color': 'black'
            },
            {
                'type': 'selector'
                ,'options':this.pivot_operations
                ,'default_value': this.pivot_operations[0]
                ,'name': 'operation'
            },
            {
                'type': 'span'
                ,'label':"Group By"
                ,'color': 'black'
            },
            {
                'type': 'selector'
                ,'options':all_columns
                ,'default_value': []
                ,'name': 'multiple_column_names'
                ,'ismultiple':true
            },
            {
                'type': 'span'
                ,'label':"Pivot Column"
                ,'color': 'black'
            },
            {
                'type': 'selector'
                ,'options':all_columns
                ,'default_value': all_columns[0]
                ,'name': 'column_name_1'
            },
            {
                'type': 'span'
                ,'label':"Value Column"
                ,'color': 'black'
            },
            {
                'type': 'selector'
                ,'options':all_columns
                ,'default_value': all_columns[0]
                ,'name': 'value'
            },
            {
                'type': 'span'
                ,'label':"Aggregate"
                ,'color': 'black'
            },
            {
                'type': 'selector'
                ,'options':this.agg_operations
                ,'default_value': this.agg_operations[0]
                ,'name': 'case'
            },
            {
                'type': 'span'
                ,'label':"Name Column"
                ,'color': 'black'
            },
            {
                'type': 'input'
                ,'placeholder' : 'For unpivot name'
                ,'name': 'new_column_name'
            },
            {
                'type': 'span'
                ,'label':"Value Name"
                ,'color': 'black'
            },
            {
                'type': 'input'
                ,'placeholder' : 'For unpivot value'
                ,'name': 'new_column_name_1'
            },
            {
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
        columns_div.appendChild(column_edit_element)
    }
    _on_selector_change(e, widget,activity){
        this.get_operation_settings()
    }
    _on_input_change(e, widget,activity){
        this.get_operation_settings()
    }
    get_settings_element(){
        let div = document.createElement('div')
        div.id = this.activityId

        const section = document.createElement('div')
        section.className = "combine-section"

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
