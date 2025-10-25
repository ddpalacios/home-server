
class Join_Activity extends Activity{
    constructor(flowchart,activity){
        super(flowchart, activity)
        this.join_operators = ['Left Join (all from first, matching from second)'
            , 'Right Join (all from second, matching from first)'
            , 'Inner Join (only matching rows)'
            , 'Full Outer Join (all rows from both)']
        this.add_button_label = "+ Add Join"
        this.settings = this.get_settings_element()
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
            console.log("JOIN", activity)

        let table1 = activity.activity.inputs.input_1.value
        let table2 = activity.activity.inputs.input_2.value
        if (table1 == null && table2 == null){
            return
        }

        let table1_output_values = table1?.outputs.output.value?.values
        let table1_output_datatypes = table1?.outputs.output.value?.datatypes

        let table2_output_values = table2.outputs?.output.value?.values
        let table2_output_datatypes = table2.outputs?.output.value?.datatypes
        let table1_columns = null
        let table2_columns = null
        if (table1_output_datatypes != null || table1_output_datatypes != undefined){
         table1_columns = Object.keys(table1_output_datatypes)
        }
         if (table2_output_datatypes != null || table2_output_datatypes != undefined){
         table2_columns = Object.keys(table2_output_datatypes)
        }
        let div = document.createElement('div')
        div.style.display = 'flex'
        div.style.flexDirection = 'column'
        let settings = [
              
            {
                'type': 'span'
                ,'order':2
                ,'label':"Table 1"
                ,'color': 'black'
            },
             {
                'type': 'selector'
                ,'order':3
                ,'options': table1_columns
                ,'default_value': ""
            }
                ,{
                'type': 'span'
                ,'order':4
                ,'label':"Table 2"
                ,'color': 'black'
            },
             {
                'type': 'selector'
                ,'order':5
                ,'options': table2_columns
                ,'default_value': ""
            }
            , {
                'type': 'selector'
                ,'order':3
                ,'options': this.join_operators
                ,'default_value': this.join_operators[0]
            }
          ]

        columns_div.appendChild( this.get_column_selection_element(widget,settings))
        

    }
    _on_selector_change(e, widget,activity){
        alert("Changed")
    }

    // get_settings_element(){
    //     let columns_div = document.createElement('div')
    //     columns_div.id = this.activityId+ "_column_edit"
    //     let div = document.createElement('div')
    //     let table_join_ops_div = document.createElement('div')
    //     table_join_ops_div.style.display = 'flex'
    //     table_join_ops_div.style.flexDirection = 'column'
    //     table_join_ops_div.style.gap = '20px'

    //     for (let i=0; i<2; i++){
    //         let table_column_div = document.createElement('div')
    //         table_column_div.style.display = 'flex'
    //         table_column_div.style.flexDirection = 'row'
    //         table_column_div.style.gap = '20px'
    //         let span = document.createElement("span")
    //         span.innerHTML = 'Table '+(i+1)
    //         span.style.color = 'black'
    //         let column_selector = get_selector_element(null, ["AND", "OR"], "AND");
    //         table_column_div.appendChild(span)
    //         table_column_div.appendChild(column_selector)
    //         table_join_ops_div.appendChild(table_column_div)
    //     }
 
    //     let join_selector_div = document.createElement('div')
    //     let join_selector = get_selector_element(null, this.join_operators, this.join_operators[0]);
    //     join_selector_div.appendChild(join_selector)
    //     table_join_ops_div.appendChild(join_selector_div)

    //     div.appendChild(table_join_ops_div)
    //     div.appendChild(columns_div)

    //     return div
    // }
}