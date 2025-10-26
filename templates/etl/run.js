async function run_activity_flow(activity, widget, data){
    let activity_type = activity.activityType
     let body;
    if (data != undefined){
           body = {
        'activity_type' : activity_type
        ,'operations': activity.settings
        ,'data':data
        }
        console.log("SENDING BODY", body)
    }else{
        body = {
            'activity_type' : activity_type
            ,'operations': activity.settings
            ,'data': activity.inputs.input.value.values
        }
        console.log("SENDING BODY", body)

    }
    if (body == undefined){return}
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


  async function execute(widget, operatorId){
            let sorted_nodes = []
            let activity  = widget.flowchart('getOperatorActivity',operatorId)
            let ordered_nodes = widget.flowchart('get_ordered_operations',operatorId,sorted_nodes)
            console.log('ordered nodes',ordered_nodes)

            let output =activity.outputs.output.value.values
            console.log(activity, 'executing')

            for (let i=0; i<ordered_nodes.length; i++){
                let node = ordered_nodes[i]
                if (node.activityType == 'import'){
                    let response = await run_activity_flow(node, widget)
                    console.log(response)
                    if (response == null){return}
                     widget.flowchart('setoutputVal',node.operatorId,'output', response)
                }
                if (node.activityType == 'filter'){
                    let main_activity = main_activities[node.operatorId]
                    let settings = main_activity.get_operation_settings()
                    console.log(settings)
                    let response = await run_activity_flow(node, widget)
                    if (response == null){return}
                     widget.flowchart('setoutputVal',node.operatorId,'output', response)
                }
                if (node.activityType == 'group'){
                    let main_activity = main_activities[node.operatorId]
                    let settings = main_activity.get_operation_settings()
                    console.log(settings)
                    let response = await run_activity_flow(node, widget)
                    if (response == null){return}
                     widget.flowchart('setoutputVal',node.operatorId,'output', response)
                }

                if (node.activityType == 'replace'){
                    let main_activity = main_activities[node.operatorId]
                    let settings = main_activity.get_operation_settings()
                    console.log(settings)
                    let response = await run_activity_flow(node, widget)
                    if (response == null){return}
                     widget.flowchart('setoutputVal',node.operatorId,'output', response)
                }
                if (node.activityType == 'split'){
                    let main_activity = main_activities[node.operatorId]
                    let settings = main_activity.get_operation_settings()
                    console.log(settings)
                    let response = await run_activity_flow(node, widget)
                    if (response == null){return}
                     widget.flowchart('setoutputVal',node.operatorId,'output', response)
                }
                  if (node.activityType == 'custom'){
                    let main_activity = main_activities[node.operatorId]
                    let settings = main_activity.get_operation_settings()
                    console.log(settings)
                    let response = await run_activity_flow(node, widget)
                    if (response == null){return}
                     widget.flowchart('setoutputVal',node.operatorId,'output', response)
                }
                // if (node.activityType == 'join'){
                //     let main_activity = main_activities[node.operatorId]
                //     let settings = main_activity.get_operation_settings()
                //     console.log(settings)
                //     let input_data = {'table_1': node.inputs.input_1.value.outputs.output.value.values, 'table_2': node.inputs.input_2.value.outputs.output.value.values}
                //     let response = await run_activity_flow(node, widget,input_data)
                //     // if (response == null){return}
                //     //  widget.flowchart('setoutputVal',node.operatorId,'output', response)
                // }
            }
        }