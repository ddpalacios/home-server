
class Filter_Activity extends Activity{
    constructor(flowchart,activity){
        super(flowchart, activity)
        this.string_operations = ['EQUALS', 'DOES NOT EQUAL', 'STARTS_WITH', 'DOES NOT START WITH', 'ENDS_WITH', 'DOES NOT END WITH', 'CONTAINS','DOES NOT CONTAIN', 'IS NOT NULL', 'IS NULL']
        this.number_operations = ['EQUALS', 'DOES NOT EQUAL', 'GREATER THAN', 'GREATER THAN OR EQUAL TO', 'LESS THAN', 'LESS THAN OR EQUAL TO', 'IS NOT NULL', 'IS NULL']
        this.add_button_label = "+ Add Condition"
        this.settings = this.get_settings_element()
        // this.operation_settings= null
    }
    _on_input_change(e, widget,activity){
        let parent_element = e.target.parentElement;
        console.log(e.target.value)
        // widget.flowchart('renameSelectColumn', activity.activityId, parent_element.id, e.target.value)
    }
    get_operation_settings(){
        let settings = super.get_operation_settings('where')
        this.flowchart.flowchart('setSettings', this.activityId, settings)
        return settings
    }
    _on_button_click(e, widget, activity){
        let parent_element = e.target.parentElement;
        parent_element.remove()
        let row_id = parent_element.id
        console.log("deleting", parent_element.id)
        let settings = []
        activity.activity.settings?.where.forEach(element => {
            if (element.row_id != row_id){
                settings.push(element)
            }
        });
        this.flowchart.flowchart('setSettings', this.activityId, settings)
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
        console.log("CONDITION", activity)
        if (Array.isArray( activity.activity.inputs.input.value.values)){
            all_columns = Object.keys(activity.activity.inputs.input.value.values[0])
        }else{
            all_columns = Object.keys(activity.activity.inputs.input.value.values)

        }
        let datatypes = widget.flowchart("getOperatorActivity", activity.activityId).inputs.input.value.datatypes;
        let s = new Set(Object.values(datatypes));
        datatypes = [...s]

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
        console.log("DATA TYPES", datatypes)
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
        // alert("Changed")
    }



    
    // _delete_column(e, widget, activity){
    //     let parent_element = e.target.parentElement;
    //     parent_element.remove()
    //     console.log("deleting", parent_element.id)
    // }
    // _on_column_select(e, widget, activity){
    //     let selected_column  = e.target.value
    //     let datatypes = widget.flowchart('getOperatorActivity', activity.activityId).inputs.input.value.datatypes;
    //     console.log("Looking for", selected_column, 'in', datatypes)
    //     let datatype = datatypes[selected_column]
    //     e.target.parentElement.children[1].value =  datatype
    //     e.target.parentElement.children[2].innerHTML = ''
        // let options = null;
        // if (datatype != 'string'){
        //     options = this.number_operations
        // }else{
        //     options = this.string_operations
        // }
        // options.forEach(element => {
        //     let option = document.createElement('option')
        //     option.value = element
        //     option.innerHTML = element
        //     e.target.parentElement.children[2].appendChild(option)
        // });

    // }
    // _on_operation_select(e, widget, activity) {
    //     let columns_div = document.getElementById(activity.activityId + "_column_edit");
    //     let selected_operation = e.target.value;

    //     const parent = e.target.parentElement;
    //     while (parent.children.length > 3) {
    //         parent.removeChild(parent.lastChild);
    //     }

    //     let existingBetween = parent.querySelector(".between-wrapper");
    //     if (existingBetween) existingBetween.remove();

    //     columns_div.style.display = "flex";
    //     columns_div.style.gap = "6px";
    //     columns_div.style.flexWrap = "wrap";

    //     if (selected_operation === "BETWEEN") {
    //         let op1 = get_selector_element(null, [">=", ">"], ">=");
    //         let op1_in = document.createElement("input");
    //         op1_in.type = "number";
    //         op1_in.placeholder = "Min value";
    //         op1_in.className = "op-input";

    //         let and_label = document.createElement("span");
    //         and_label.textContent = "AND";
    //         and_label.style.margin = "0 4px";
    //         and_label.style.fontWeight = "bold";

    //         let op2 = get_selector_element(null, ["<=", "<"], "<=");
    //         let op2_in = document.createElement("input");
    //         op2_in.type = "number";
    //         op2_in.placeholder = "Max value";
    //         op2_in.className = "op-input";

    //         let wrapper = document.createElement("div");
    //         wrapper.className = "between-wrapper";
    //         wrapper.style.display = "flex";
    //         wrapper.style.alignItems = "center";
    //         wrapper.style.gap = "6px";
    //         wrapper.style.marginTop = "8px";

    //         wrapper.appendChild(op1);
    //         wrapper.appendChild(op1_in);
    //         wrapper.appendChild(and_label);
    //         wrapper.appendChild(op2);
    //         wrapper.appendChild(op2_in);

    //         let and_or_op = get_selector_element(null, ["AND", "OR"], "AND");
    //         let delete_button = document.createElement("button");
    //         delete_button.innerHTML = "remove";
    //         delete_button.style.color = "red";
    //         delete_button.addEventListener("click", (event) =>
    //             this._delete_column(event, widget, this)
    //         );

    //         parent.appendChild(wrapper);
    //         parent.appendChild(and_or_op);
    //         parent.appendChild(delete_button);

    //     } else {

    //         let value = document.createElement("input");
    //         value.type = "text";
    //         value.placeholder = "Enter value";
    //         value.className = "op-input";

    //         let and_or_op = get_selector_element(null, ["AND", "OR"], "AND");

    //         let delete_button = document.createElement("button");
    //         delete_button.innerHTML = "remove";
    //         delete_button.style.color = "red";
    //         delete_button.addEventListener("click", (event) =>
    //             this._delete_column(event, widget, this)
    //         );

    //         parent.appendChild(value);
    //         parent.appendChild(and_or_op);
    //         parent.appendChild(delete_button);
    //     }
    // }
    // get_input_value_columns(){
    //      let input_value;
    //      let all_columns;
    //     if (Array.isArray( this.activity.inputs.input.value.values)){
    //         all_columns = Object.keys(this.activity.inputs.input.value.values[0])
    //         input_value = this.activity.inputs.input.value.values[0]
    //     }else{
    //         all_columns = Object.keys(this.activity.inputs.input.value.values)
    //         input_value = this.activity.inputs.input.value.values
    //     }
    //     return all_columns
    // }
    // _add_condition(e, widget, activity){
    //     let columns_div = document.getElementById(activity.activityId + "_column_edit");
    //     let settings_div = document.getElementById("selected_activity_settings");

    //     columns_div.style.display = "flex";
    //     columns_div.style.flexDirection = "column";
    //     columns_div.style.gap = "8px";

    //     let div = document.createElement("div");
    //     div.id = crypto.randomUUID();
    //     div.className = "condition-row";
    //     div.style.display = "flex";
    //     div.style.flexWrap = "wrap";
    //     div.style.alignItems = "center";
    //     div.style.gap = "6px";
    //     div.style.border = "1px solid #ccc";
    //     div.style.borderRadius = "6px";
    //     div.style.padding = "4px 6px";
    //     div.style.background = "#fafafa";

        // let datatypes = widget.flowchart("getOperatorActivity", activity.activityId).inputs.input.value.datatypes;
        // let s = new Set(Object.values(datatypes));
        // datatypes = [...s];

    //     let all_input_columns = this.get_input_value_columns();

    //     let column_selector_element = get_selector_element(null, all_input_columns, "");
    //     column_selector_element.addEventListener("change", (event) =>
    //         this._on_column_select(event, widget, this)
    //     );

    //     let datatype_selector_element = get_selector_element(null, datatypes, "");
    //     datatype_selector_element.disabled = true;

    //     let operation_selector_element = get_selector_element(
    //         null,
    //         this.string_operations,
    //         this.string_operations[0]
    //     );
    //     operation_selector_element.addEventListener("change", (event) =>
    //         this._on_operation_select(event, widget, this)
    //     );

    //     let and_or_op = get_selector_element(null, ["AND", "OR"], "AND");

    //     let value = document.createElement("input");
    //     value.type = "text";
    //     value.placeholder = "Enter value";

    //     let delete_button = document.createElement("button");
    //     delete_button.innerHTML = "remove";
    //     delete_button.style.color = "red";
    //     delete_button.addEventListener("click", (event) =>this._delete_column(event, widget, this));
    //     div.appendChild(column_selector_element);
    //     div.appendChild(datatype_selector_element);
    //     div.appendChild(operation_selector_element);
    //     div.appendChild(value);
    //     div.appendChild(and_or_op);
    //     div.appendChild(delete_button);
    //     columns_div.appendChild(div);
    //     settings_div.appendChild(columns_div);
    // }
    // get_settings_element(){
        // let columns_div = document.createElement('div')
        // columns_div.id = this.activityId+ "_column_edit"
    //     let div = document.createElement('div')
    //     div.id = this.activityId
    //     let add_button = document.createElement('button')
    //     let add_div = document.createElement('div')
    //     add_button.setAttribute('operatorId', this.activityId)
    //     add_button.innerHTML = '+ Add Condition'
    //     add_button.className = 'buttons'
    //     add_button.style.color = 'black'
    //     add_button.addEventListener("click", (event) => this._add_condition(event, this.flowchart, this));
    //     add_div.appendChild(add_button)
    //     div.appendChild(add_div)
    //     div.appendChild(columns_div)
    //     return div
    // }



}