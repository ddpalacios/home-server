async function run_activity_flow(activity, widget, data){
    let activity_type = activity.activityType
     let body;
    if (data != undefined || data != null){
           body = {
        'activity_type' : activity_type
        ,'operations': activity.settings
        ,'data':data
        }
        // console.log("SENDING BODY", body)
    }else{
        body = {
            'activity_type' : activity_type
            ,'operations': activity.settings
            ,'data': activity.inputs.input.value.values

        }
        // console.log("SENDING BODY", body)

    }
    if (body == undefined){return}
    console.log("Sending body", body)
    var request = new Request('/etl/run/', {
                                method: 'POST',
                                headers: new Headers({
                                            'Accept': 'application/json'
                                        })
			       ,body: JSON.stringify(body)
                    });
    var response = await fetch(request);
    if (response.ok){ 
        try{
            const data = await response.json()
            return data;
        }catch(error){}
    }
    return null;
}


async function run_pipeline(dependencies, target_node_ids){
    let body = {'dependencies': JSON.stringify(dependencies)
        ,'target_ids': target_node_ids
    }
        var request = new Request('/etl/run/pipeline/', {
                                method: 'POST',
                                headers: new Headers({
                                            'Accept': 'application/json'
                                        })
			       ,body: JSON.stringify(body)
                    });
    var response = await fetch(request);


    if (response.ok){ 
        try{
            const data = await response.json()

            return data;
        }catch(error){}
    }
    return null;


}

async function execute_activity(widget,activityid){
            let dependencies = {}
            let operators = widget.flowchart('getOperators')
            Object.keys(operators).forEach(key => {
                let activity = operators[key].properties
                let main_activity = main_activities[key]
                let settings = main_activity.get_operation_settings()
                let d = []
                activity.dependencies.forEach(element => {
                        d.push(element.toString())
                        
                    });
                dependencies[key] = {'tableName':key,"dependencies":d, 'query': {}, 'activityType':activity.activityType}
            });
            // console.log("table lookup",dependencies)
            // console.log("Target ID", activityid)

        let data = await run_pipeline(dependencies, [activityid])
        console.log("ORDERED", data)
        for (const node of data['ordered_nodes']) {
            let activity = widget.flowchart('getOperatorActivity', node['tableName']);
            // console.log("node",activity)
            if (activity.activityType != 'export'){
                if (activity.activityType == 'join'){
                        let input_data = {'table_1': activity.inputs.input_1.value.outputs.output.value.values, 'table_2': activity.inputs.input_2.value.outputs.output.value.values}
                        let response = await run_activity_flow(activity, widget,input_data)
                        if (response == null){return}
                        console.log("JOIN RESPONSE", response)
                            widget.flowchart('setoutputVal',activity.operatorId,'output', response)
                }else{
                    let response = await run_activity_flow(activity, widget)
                    // console.log("Ordered Response",response)
                    if (response == null){return}
                    widget.flowchart('setoutputVal',activity.operatorId,'output', response)
                }
            }
        }
}

  async function execute(widget){
            let sorted_nodes = []
            let dependencies = {}
            let operators = widget.flowchart('getOperators')
            let target_ids = []
            Object.keys(operators).forEach(key => {
                let activity = operators[key].properties
                let main_activity = main_activities[key]
                let settings = main_activity.get_operation_settings()
                console.log(settings)
                let d = []
                activity.dependencies.forEach(element => {
                        d.push(element)
                        
                    });
                dependencies[key] = {'tableName':key,"dependencies":d, 'query': settings, 'activityType':activity.activityType}
                if (activity.activityType == 'export'){
                    target_ids.push(key)
                }
            
            });

            let data = await run_pipeline(dependencies, Object.keys(dependencies))
            console.log("ORDERED", data)
            for (const node of data['ordered_nodes']) {
                let activity = widget.flowchart('getOperatorActivity', node['tableName']);
                console.log("node",activity)
                if (activity.activityType != 'export'){
                    if (activity.activityType == 'join'){
                            let input_data = {'table_1': activity.inputs.input_1.value.outputs.output.value.values, 'table_2': activity.inputs.input_2.value.outputs.output.value.values}
                            let response = await run_activity_flow(activity, widget,input_data)
                            if (response == null){return}
                            console.log("JOIN RESPONSE", response)
                             widget.flowchart('setoutputVal',activity.operatorId,'output', response)
                    }else{
                     let response = await run_activity_flow(activity, widget)
                        console.log("Ordered Response",response)
                        if (response == null){return}
                        widget.flowchart('setoutputVal',activity.operatorId,'output', response)
                    }
            }
        }
 }