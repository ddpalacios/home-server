
class Filter_Activity extends Activity{
    constructor(flowchart,activity){
        super(flowchart, activity)
        this.string_operations = ['EQUALS', 'DOES NOT EQUAL', 'STARTS_WITH', 'DOES NOT START WITH', 'ENDS_WITH', 'DOES NOT END WITH', 'CONTAINS','DOES NOT CONTAIN', 'IS NOT NULL', 'IS NULL']
        this.number_operations = ['EQUALS', 'DOES NOT EQUAL', 'GREATER THAN', 'GREATER THAN OR EQUAL TO', 'LESS THAN', 'LESS THAN OR EQUAL TO', 'IS NOT NULL', 'IS NULL']
        this.add_button_label = "+ Add Condition"
        this.settings = this.get_settings_element()
    }
    get_operation_settings(){
        let settings = super.get_operation_settings('where')
        this.flowchart.flowchart('setSettings', this.activityId, settings)
        return settings
    }
    _on_input_change(e, widget,activity){
        console.log(e.target.value)
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
            all_columns = [""]
        }
        const datatype_map = widget.flowchart("getOperatorActivity", activity.activityId).inputs.input.value.datatypes || {};
        let s = new Set(Object.values(datatype_map));
        let datatypes = [...s]

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
                ,'options': this.string_operations
                ,'default_value': this.string_operations[0]
                ,'name': 'operation'
            }
            ,{
                'type': 'input'
                ,'placeholder' : 'Value'
                ,'name': 'value'
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
    }
    _on_selector_change(e, widget,activity){
        console.log(e.target.value)
        let value = e.target.value
        let parent_element = e.target.parentElement
        let target_element = e.target
        let target_name = e.target.name
        let datatypes = widget.flowchart("getOperatorActivity", activity.activityId).inputs.input.value.datatypes
        if (target_name == 'column_name'){
            parent_element.children[2].value = datatypes[value]
            e.target.parentElement.children[3].innerHTML = ''
            let options = null;
            if (datatypes[value] != 'string'){
                options = this.number_operations
            }else{
                options = this.string_operations
            }
            options.forEach(element => {
                let option = document.createElement('option')
                option.value = element
                option.innerHTML = element
                e.target.parentElement.children[3].appendChild(option)
            });

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
