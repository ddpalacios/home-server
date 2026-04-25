class Combine_Activity extends Activity{
    constructor(flowchart,activity){
        super(flowchart, activity)
        this.add_button_label = "+ Add Combine"
        this.settings = this.get_settings_element()
    }
    get_operation_settings(){
        let settings = super.get_operation_settings('combine')
        this.flowchart.flowchart('setSettings', this.activityId, settings)
        return settings
    }
    _on_input_change(e, widget,activity){
        this.get_operation_settings()
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
            all_columns = [""]
        }
        let settings = [
            {
                'type': 'span'
                ,'order':1
                ,'label':"Combine"
                ,'color': 'black'
            },
            {
                'type': 'selector'
                ,'order':2
                ,'options':all_columns
                ,'default_value': all_columns[0]
                ,'name': "column_name_1"
            },
             {
                'type': 'span'
                ,'order':3
                ,'label':"With"
                ,'color': 'black'
            },
            {
                'type': 'selector'
                ,'order':4
                ,'options':all_columns
                ,'default_value': all_columns[0]
                ,'name': "column_name_2"
            }
            , {
                'type': 'span'
                ,'order':5
                ,'label':"Delimiter"
                ,'color': 'black'
            }
            ,{
                'type': 'input'
                ,'placeholder' : 'Delimiter'
                ,'name': 'value'
            }
            , {
                'type': 'span'
                ,'order':6
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
                ,'order':7
                ,'label': 'remove'
                ,'color': 'red'
                ,'name':'remove'
            }
          ]

            let column_edit_element = this.get_column_selection_element(widget,settings)
            columns_div.appendChild(column_edit_element)
    }
    _on_selector_change(e, widget,activity){
        let value = e.target.value
        let parent_element = e.target.parentElement
        let target_name = e.target.name
        if (target_name != 'column_name_1' && target_name != 'column_name_2'){
            return
        }
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
