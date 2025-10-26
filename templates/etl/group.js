
class Group_Activity extends Activity{
    constructor(flowchart,activity){
        super(flowchart, activity)
        this.group_operators = ["COUNT", "SUM", "AVG", "MIN", "MAX"]
        this.add_button_label = "+ Add Group By"
        this.settings = this.get_settings_element()
    }
    get_operation_settings(){
        let settings = super.get_operation_settings('group')
        this.flowchart.flowchart('setSettings', this.activityId, settings)
        return settings
    }

    _add_column(e, widget, activity){
        let all_columns = []
        let activityId = activity.activityId
        let columns_div = document.getElementById(activity.activityId + "_column_edit");
        if (columns_div?.children.length > 0){
                return
            }
        if (columns_div == null || columns_div == undefined){
            let settings_div = document.getElementById('selected_activity_settings')
             columns_div = document.createElement('div')
            columns_div.id = this.activityId+ "_column_edit"
            settings_div.appendChild(columns_div)
        }
        console.log("GROUPNG", activity)
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
                ,'label':"Group By:"
                ,'color': 'black'
            },
            {
                'type': 'selector'
                ,'options':all_columns
                ,'default_value': all_columns[0]
                ,'name':'column_name'
            },
                {
                'type': 'span'
                ,'label':"As:"
                ,'color': 'black'
            },
              ,{
                'type': 'input'
                ,'placeholder' : 'New column name'
                ,'name':'new_column_name'
            }
            , {
                'type': 'span'
                ,'label':"Operation:"
                ,'color': 'black'
            },
             , {
                'type': 'selector'
                ,'order':3
                ,'options': this.group_operators
                ,'default_value': this.group_operators[0]
                ,'name':'operation'
                
            }
               , {
                'type': 'span'
                ,'label':"On:"
                ,'color': 'black'
            },
           ,{
                'type': 'selector'
                ,'options':all_columns
                ,'default_value': ""
                ,'name': 'value'
            }
          ]
          
            let column_edit_element = this.get_column_selection_element(widget,settings)
            columns_div.appendChild(column_edit_element)
    }
    // _on_selector_change(e, widget,activity){
    //     alert("Changed")
    // }
    
    // get_settings_element(){
    // let columns_div = document.createElement('div');
    // columns_div.id = this.activityId + "_column_edit";

    // let div = document.createElement('div');
    // let table_group_div = document.createElement('div');
    // table_group_div.style.display = 'flex';
    // table_group_div.style.flexDirection = 'column';
    // table_group_div.style.gap = '20px';
    // table_group_div.style.marginTop = '10px';

    // let group_section = document.createElement('div');
    // group_section.style.display = 'flex';
    // group_section.style.flexDirection = 'row';
    // group_section.style.alignItems = 'center';
    // group_section.style.flexWrap = 'wrap';
    // group_section.style.gap = '10px';

    // let span = document.createElement('span');
    // span.textContent = "Group By:";

    // let all_columns = this.get_input_value_columns
    //     ? this.get_input_value_columns()
    //     : ["department", "job_title", "salary", "hours"];

    // let group_by_selector = get_selector_element(null, all_columns, "");

    // group_section.appendChild(span);
    // group_section.appendChild(group_by_selector);

    // let agg_section = document.createElement('div');
    // agg_section.style.display = 'flex';
    // agg_section.style.flexDirection = 'row';
    // agg_section.style.alignItems = 'center';
    // agg_section.style.flexWrap = 'wrap';
    // agg_section.style.gap = '10px';

    // let agg_label = document.createElement('span');
    // agg_label.textContent = "Aggregate:";

    // let operations = ["COUNT", "SUM", "AVG", "MIN", "MAX"];
    // let operation_selector = get_selector_element(null, operations, "SUM");

    // let agg_column_selector = get_selector_element(null, all_columns, "");

    // let d = document.createElement("div")
    // let new_col_input = document.createElement('input');
    // new_col_input.type = "text";
    // new_col_input.placeholder = "New column name";
    // new_col_input.style.padding = "4px 6px";
    // new_col_input.style.border = "1px solid #ccc";
    // new_col_input.style.borderRadius = "6px";
    // new_col_input.style.flex = "1";
    // d.appendChild(new_col_input)

    // agg_section.appendChild(agg_label);
    // agg_section.appendChild(operation_selector);
    // agg_section.appendChild(agg_column_selector);
    // agg_section.appendChild(d);

    // table_group_div.appendChild(group_section);
    // table_group_div.appendChild(agg_section);
    // columns_div.appendChild(table_group_div);
    // div.appendChild(columns_div);

    //     return div
    // }
}