
class Combine_Activity extends Activity{
    constructor(flowchart,activity){
        super(flowchart, activity)
        this.add_button_label = "+ Add Combine"
        this.add_column_label = "+ Add Column"
        this.settings = this.get_settings_element()
    }
    _derive_datatypes(values){
        const datatypes = {}
        if (!Array.isArray(values) || values.length === 0) {
            return datatypes
        }
        const sample = values[0] || {}
        Object.keys(sample).forEach(key => {
            const value = sample[key]
            if (typeof value === 'string') {
                datatypes[key] = 'TEXT'
            } else if (typeof value === 'number') {
                datatypes[key] = 'INTEGER'
            } else if (typeof value === 'object') {
                datatypes[key] = 'LIST'
            } else {
                datatypes[key] = 'TEXT'
            }
        })
        return datatypes
    }
    _apply_select(values, selections){
        if (!Array.isArray(values) || values.length === 0) {
            return []
        }
        if (!Array.isArray(selections) || selections.length === 0) {
            return values
        }
        return values.map(row => {
            const next_row = {}
            selections.forEach(selection => {
                const source = selection.column_name
                const target = selection.renamed_name || source
                if (!source) {
                    return
                }
                next_row[target] = row[source]
            })
            return next_row
        })
    }
    _apply_combine(values, combine_settings){
        if (!Array.isArray(values) || values.length === 0) {
            return values || []
        }
        if (!Array.isArray(combine_settings) || combine_settings.length === 0) {
            return values
        }
        return values.map(row => {
            const next_row = { ...row }
            combine_settings.forEach(setting => {
                const col1 = setting.columnName_1
                const col2 = setting.columnName_2
                const delim = setting.value ?? ''
                const new_name = setting.new_column_name || `${col1 || ""}_${col2 || ""}`
                const val1 = col1 ? (row[col1] ?? '') : ''
                const val2 = col2 ? (row[col2] ?? '') : ''
                next_row[new_name] = `${val1}${delim}${val2}`
            })
            return next_row
        })
    }
    _refresh_output_from_settings(widget, activity){
        const input_values = activity.activity.inputs?.input?.value?.values
        if (!Array.isArray(input_values) || input_values.length === 0) {
            return
        }
        const settings = this.get_operation_settings()
        const selections = settings?.select || []
        const combine_settings = settings?.combine || []
        const selected_values = this._apply_select(input_values, selections)
        const next_values = this._apply_combine(selected_values, combine_settings)
        const output_value = activity.activity.outputs?.output?.value || {}
        output_value.values = next_values
        output_value.datatypes = this._derive_datatypes(next_values)
        widget.flowchart('setoutputVal', activity.activityId, 'output', output_value)
        widget.flowchart('run_activity', activity.activityId)
    }
    _create_column_header(){
        const header = document.createElement('div');
        header.className = "column-settings-header";
        ["Column", "Type", "Rename", "Drop"].forEach(label => {
            const span = document.createElement('span');
            span.textContent = label;
            header.appendChild(span);
        });
        return header;
    }
    _setup_column_container(columns_div, add_button){
        columns_div.classList.add("column-settings");
        if (add_button) {
            const existing_actions = columns_div.querySelector(".column-settings-actions");
            if (!existing_actions) {
                const actions = document.createElement('div');
                actions.className = "column-settings-actions";
                actions.appendChild(add_button);
                columns_div.appendChild(actions);
            }
        }
        const existing_header = columns_div.querySelector(".column-settings-header");
        if (!existing_header) {
            columns_div.appendChild(this._create_column_header());
        }
    }
    get_operation_settings(){
        const combine_container = document.getElementById(this.activityId + "_combine_edit");

        const read_container = (container) => {
            if (!container) {
                return [];
            }
            const statements = [];
            for (let i = 0; i < container.children.length; i++) {
                let row = container.children[i];
                if (!row) {
                    continue;
                }
                if (row.classList && row.classList.contains("select-column-row")) {
                    const inner = row.querySelector(".rename_settings");
                    row = inner || row;
                }
                if (!row || !row.children) {
                    continue;
                }
                const statement = {};
                for (let j = 0; j < row.children.length; j++) {
                    const element = row.children[j];
                    if (!element.name) continue;
                    switch (element.name) {
                        case 'column_name_1':
                            statement.columnName_1 = element.value;
                            statement.row_id = row.id;
                            continue;
                        case 'column_name_2':
                            statement.columnName_2 = element.value;
                            statement.row_id = row.id;
                            continue;
                        case 'new_column_name':
                            statement.new_column_name = element.value;
                            statement.row_id = row.id;
                            continue;
                        case 'column_name':
                            statement.columnName = element.value;
                            statement.row_id = row.id;
                            continue;
                        case 'data_type':
                            statement.data_type = element.value;
                            statement.row_id = row.id;
                            continue;
                        case 'value':
                            statement.value = element.value;
                            statement.row_id = row.id;
                            continue;
                    }
                }
                if (Object.keys(statement).length > 0) {
                    statements.push(statement);
                }
            }
            return statements;
        };

        const combine_statements = read_container(combine_container);

        const settings = {};
        if (combine_statements.length > 0) {
            settings.combine = combine_statements;
        }
        this.flowchart.flowchart('setSettings', this.activityId, settings);
        return settings;
    }
    _add_combine_row(e, widget, activity, container){
        let all_columns = []
        let activityId = activity.activityId
        let columns_div = container || document.getElementById(activity.activityId + "_combine_edit");

        if (columns_div == null || columns_div == undefined){
            return;
        }
        const input_columns = this._get_input_columns(activityId);
        if (input_columns.length > 0) {
            all_columns = input_columns;
        }
        if (all_columns.length === 0) {
            const current_activity = this.flowchart.flowchart("getOperatorActivity", activityId);
            if (current_activity?.link_from?.length) {
                this.flowchart.flowchart("run_activity", this.activityId);
                const refreshed_columns = this._get_input_columns(activityId);
                if (refreshed_columns.length > 0) {
                    all_columns = refreshed_columns;
                }
            }
        }
        if (all_columns.length === 0) {
            all_columns = [""]
        }

        let settings = [
              {
                'type': 'span'
                ,'label':"Combine"
                ,'color': 'black'
            }
            ,{
                'type': 'selector'
                ,'options':all_columns
                ,'default_value': all_columns[0]
                ,'name':'column_name_1'
            }
            , {
                'type': 'span'
                ,'label':"With"
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
                ,'label':"Delimiter"
                ,'color': 'black'
            }
            ,{
                'type': 'input'
                ,'placeholder' : ''
                ,'name': 'value'

            }
             , {
                'type': 'span'
                ,'label':"As"
                ,'color': 'black'
            }
            ,{
                'type': 'input'
                ,'placeholder' : 'New column name'
                ,'name': 'new_column_name'

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
    _get_input_columns(activityId){
        const current_activity = this.flowchart.flowchart("getOperatorActivity", activityId);
        const input_types = current_activity?.inputs?.input?.value?.datatypes
            ?? current_activity?.link_from?.[0]?.outputs?.output?.value?.datatypes;
        if (input_types && typeof input_types === "object") {
            return Object.keys(input_types);
        }
        const input_values = current_activity?.inputs?.input?.value?.values
            ?? current_activity?.link_from?.[0]?.outputs?.output?.value?.values
            ?? this.activity?.inputs?.input?.value?.values;
        if (Array.isArray(input_values) && input_values.length > 0) {
            return Object.keys(input_values[0]);
        }
        if (input_values && typeof input_values === "object") {
            return Object.keys(input_values);
        }
        return [];
    }
    _sync_combine_dropdowns(){
        let columns = this._get_input_columns(this.activityId);
        if (columns.length === 0) {
            const current_activity = this.flowchart.flowchart("getOperatorActivity", this.activityId);
            if (current_activity?.link_from?.length) {
                this.flowchart.flowchart("run_activity", this.activityId);
                columns = this._get_input_columns(this.activityId);
            }
        }
        if (columns.length === 0) {
            return;
        }
        const combine_container = document.getElementById(this.activityId + "_combine_edit");
        if (!combine_container) {
            return;
        }
        const selectors = combine_container.querySelectorAll('select[name="column_name_1"], select[name="column_name_2"]');
        selectors.forEach((select) => {
            const current_value = select.value;
            select.innerHTML = "";
            columns.forEach((column) => {
                const option = document.createElement("option");
                option.value = column;
                option.textContent = column;
                if (column === current_value) {
                    option.selected = true;
                }
                select.appendChild(option);
            });
            if (!select.value && columns[0]) {
                select.value = columns[0];
            }
        });
    }
    _on_button_click(event, widget, activity){
        const row = event.target.closest(".rename_settings") || event.target.parentElement;
        const combine_row = row && row.parentElement && row.parentElement.id === this.activityId + "_combine_edit";
        if (combine_row) {
            row.remove();
            this.get_operation_settings();
            this._refresh_output_from_settings(widget, activity);
            return;
        }
        if (row) {
            row.remove();
            this.get_operation_settings();
            this._refresh_output_from_settings(widget, activity);
        }
    }
    _on_selector_change(event, widget, activity){
        if (event.target.name !== 'column_name_1' && event.target.name !== 'column_name_2'){
            return
        }
        this.get_operation_settings();
        this._refresh_output_from_settings(widget, activity);
    }
    _on_input_change(event, widget, activity){
        if (event.target.name !== 'new_column_name' && event.target.name !== 'value'){
            return
        }
        this.get_operation_settings();
        this._refresh_output_from_settings(widget, activity);
    }
    get_settings_element(){
        let div = document.createElement('div')
        div.id = this.activityId

        const combine_section = document.createElement('div')
        combine_section.className = "combine-section"

        const combine_add_button = document.createElement("button")
        combine_add_button.innerHTML = this.add_button_label
        combine_add_button.className = 'buttons add-button'
        combine_add_button.style.padding = "8px 12px";
        combine_add_button.style.cursor = "pointer";
        combine_add_button.style.transition = "background 0.2s ease";
        combine_add_button.addEventListener("click", (event) => this._add_combine_row(event, this.flowchart, this, combine_container));
        combine_section.appendChild(combine_add_button)

        const combine_container = document.createElement('div')
        combine_container.id = this.activityId + "_combine_edit"
        combine_container.style.display = 'flex'
        combine_container.style.flexDirection = 'column'
        combine_container.style.gap = "12px"
        combine_section.appendChild(combine_container)
        this._add_combine_row(null, this.flowchart, this, combine_container)
        div.appendChild(combine_section)

        this._sync_combine_dropdowns();

        return div
    }
}
