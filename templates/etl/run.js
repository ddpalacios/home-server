async function run_activity_flow(activity, widget){
    let activity_type = activity.activityType
    let body = {
        'activity_type' : activity_type
        ,'operations': activity.settings
        ,'data': activity.inputs.input.value.values
    }
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
                    let response = await run_activity_flow(activity, widget)
                    console.log(response)
                     widget.flowchart('setoutputVal',node.operatorId,'output', response)
                }
                // if (node.activityType == 'filter'){
                //     let response = await run_activity_flow(activity, widget)
                //      widget.flowchart('setoutputVal',node.operatorId,'output', response)
                // }
            }
        }