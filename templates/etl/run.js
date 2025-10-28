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

  async function execute(widget){
            let sorted_nodes = []
            let dependencies = {}
            let operators = widget.flowchart('getOperators')
            let target_ids = []
            Object.keys(operators).forEach(key => {
                let activity = operators[key].properties
                let main_activity = main_activities[key]
                let settings = main_activity.get_operation_settings()
                let d = []
                activity.dependencies.forEach(element => {
                        d.push(element.operatorId)
                        
                    });
                dependencies[key] = {'tableName':key,"dependencies":d, 'query': settings, 'activityType':activity.activityType}
                if (activity.activityType == 'export'){
                    target_ids.push(key)
                }
            
            });


            let data = await run_pipeline(dependencies, Object.keys(dependencies))
            console.log("ORDERED", data)
            data['ordered_nodes'].forEach(async node => {
                let activity  = widget.flowchart('getOperatorActivity',node['tableName'])
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
                
                
            });



            // let activity  = widget.flowchart('getOperatorActivity',operatorId)
            // let ordered_nodes = widget.flowchart('get_ordered_operations',operatorId,sorted_nodes)
            // console.log('ordered nodes',ordered_nodes)
            // let output =activity.outputs.output.value.values
            // console.log(activity, 'executing')
            // let dependencies = {}
            
            
            // Object.values(ordered_nodes).forEach(node => {
            //         let d = []
            //         let main_activity = main_activities[node.operatorId]
            //         let settings = main_activity.get_operation_settings()
                    // node.dependencies.forEach(element => {
                    //     d.push(element.operatorId)
                        
                    // });

            //         console.log("SETTINGS for", node.operatorId, node.settings)

            //         dependencies[node.operatorId] = {"dependencies":d, 'query': settings, 'activityType':node.activityType}
            // });
            // console.log("SENDINFG DEPENDENTS", dependencies)
        

            // for (let i=0; i<ordered_nodes.length; i++){
            //     let node = ordered_nodes[i]
            //     if (node.activityType == 'import'){
            //         let response = await run_activity_flow(node, widget)
            //         console.log(response)
            //         if (response == null){return}
            //          widget.flowchart('setoutputVal',node.operatorId,'output', response)
            //     }
            //     if (node.activityType == 'filter'){
            //         let main_activity = main_activities[node.operatorId]
            //         let settings = main_activity.get_operation_settings()
            //         console.log(settings)
            //         let response = await run_activity_flow(node, widget)
            //         if (response == null){return}
            //          widget.flowchart('setoutputVal',node.operatorId,'output', response)
            //     }
            //     if (node.activityType == 'group'){
            //         let main_activity = main_activities[node.operatorId]
            //         let settings = main_activity.get_operation_settings()
            //         console.log(settings)
            //         let response = await run_activity_flow(node, widget)
                    // if (response == null){return}
                    //  widget.flowchart('setoutputVal',node.operatorId,'output', response)
            //     }

            //     if (node.activityType == 'replace'){
            //         let main_activity = main_activities[node.operatorId]
            //         let settings = main_activity.get_operation_settings()
            //         console.log(settings)
            //         let response = await run_activity_flow(node, widget)
            //         if (response == null){return}
            //          widget.flowchart('setoutputVal',node.operatorId,'output', response)
            //     }
            //     if (node.activityType == 'split'){
            //         let main_activity = main_activities[node.operatorId]
            //         let settings = main_activity.get_operation_settings()
            //         console.log(settings)
            //         let response = await run_activity_flow(node, widget)
            //         if (response == null){return}
            //          widget.flowchart('setoutputVal',node.operatorId,'output', response)
            //     }
            //       if (node.activityType == 'custom'){
            //         let main_activity = main_activities[node.operatorId]
            //         let settings = main_activity.get_operation_settings()
            //         console.log(settings)
            //         let response = await run_activity_flow(node, widget)
            //         if (response == null){return}
            //          widget.flowchart('setoutputVal',node.operatorId,'output', response)
            //     }
                // if (node.activityType == 'join'){
                //     let main_activity = main_activities[node.operatorId]
                //     let settings = main_activity.get_operation_settings()
                //     console.log(settings)
                //     let input_data = {'table_1': node.inputs.input_1.value.outputs.output.value.values, 'table_2': node.inputs.input_2.value.outputs.output.value.values}
                //     let response = await run_activity_flow(node, widget,input_data)
                //     // if (response == null){return}
                //     //  widget.flowchart('setoutputVal',node.operatorId,'output', response)
                // }
            // }
        }