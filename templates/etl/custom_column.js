
class Custom_Activity extends Activity{
    constructor(flowchart,activity){
        super(flowchart, activity)
        this.add_button_label = "+ Add Colunn"
        this.settings = this.get_settings_element()
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

        let settings = [
              {
                'type': 'span'
                ,'label':"New Column Name"
                ,'color': 'black'
            }
              ,{
                'type': 'input'
                ,'placeholder' : ''
            }
            , {
                'type': 'span'
                ,'label':"Data Type"
                ,'color': 'black'
            }
            , {
                'type': 'selector'
                ,'options': ['string', 'int','datetime']
                ,'default_value': ""
            }
            , {
                'type': 'span'
                ,'label':"Value"
                ,'color': 'black'
            }
            ,{
                'type': 'input'
                ,'placeholder' : ''
            }
            ,{
                'type': 'button'
                ,'label': '+ Add Condition'
                ,'color': 'green'
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
    _on_selector_change(e, widget,activity){
        alert("Changed")
    }
    
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