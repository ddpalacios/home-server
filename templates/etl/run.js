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


async function get_ordered_nodes(widget, targetIds){
    let all_dependecies = widget.flowchart("getDependencies");
    console.log("dependencies", all_dependecies);
    let dependencies = {}
    let target_ids = []
    // let operators = widget.flowchart('getOperators')
    Object.keys(all_dependecies).forEach(key => {
        let target_dependencies = all_dependecies[key].dependencies
        let query= all_dependecies[key].query
        let activityType = all_dependecies[key].activityType
        dependencies[key] = {'tableName':key,"dependencies":target_dependencies, 'query': query, 'activityType':activityType}
        if (activityType == 'sheets_write'){
            target_ids.push(key)
        }
    
    });
    if (Array.isArray(targetIds) && targetIds.length > 0) {
        target_ids = targetIds.map(id => id.toString())
    }
    let body = {'dependencies': JSON.stringify(dependencies)
        ,'target_ids': target_ids
    }
    var request = new Request('/etl/pipeline/order', {
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

async function post_ordered_activities(activities){
    if (!Array.isArray(activities) || activities.length === 0) {
        return null
    }
    const body = { activities: activities }
    console.log("Posting activities:", body)
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
        let data = await get_ordered_nodes(widget, [activityid])
        console.log("ORDERED", data)


        // for (const node of data['ordered_nodes']) {
        //     let activity = widget.flowchart('getOperatorActivity', node['tableName']);
        //     // console.log("node",activity)
        //     if (activity.activityType != 'export'){
        //         const main_activity = main_activities[activity.operatorId];
        //         if (main_activity && typeof main_activity.get_operation_settings === "function") {
        //             const settings = main_activity.get_operation_settings();
        //             if (settings) {
        //                 activity.settings = settings;
        //             }
        //         }
        //         if (activity.activityType !== 'join' && activity.activityType !== 'append') {
        //             if (activity.link_from && activity.link_from.length > 0) {
        //                 const previous_output_value = activity.link_from[0].outputs.output.value;
        //                 const copy = JSON.parse(JSON.stringify(previous_output_value));
        //                 widget.flowchart('setinputVal', activity.operatorId, 'input', copy);
        //             }
        //         }
        //         if (activity.activityType == 'join'){
        //                 let input_data = {'table_1': activity.inputs.input_1.value.outputs.output.value.values, 'table_2': activity.inputs.input_2.value.outputs.output.value.values}
        //                 let response = await run_activity_flow(activity, widget,input_data)
        //                 if (response == null){return}
        //                 console.log("JOIN RESPONSE", response)
        //                     widget.flowchart('setoutputVal',activity.operatorId,'output', response)
        //         }else if (activity.activityType == 'append'){
        //                 let input_data = {'table_1': activity.inputs.input_1.value.outputs.output.value.values, 'table_2': activity.inputs.input_2.value.outputs.output.value.values}
        //                 let response = await run_activity_flow(activity, widget,input_data)
        //                 if (response == null){return}
        //                 widget.flowchart('setoutputVal',activity.operatorId,'output', response)
        //         }else{
        //             let response = await run_activity_flow(activity, widget)
        //             if (response == null){return}
        //             widget.flowchart('setoutputVal',activity.operatorId,'output', response)
        //         }
        //     }
        // }
}




  async function execute(widget){
        alert("Not yet implemented")
        //     let sorted_nodes = []
        //     let dependencies = {}
        //     let target_ids = []

        //     let operators = widget.flowchart('getOperators')
        //     Object.keys(operators).forEach(key => {
        //         let activity = operators[key].properties
        //         let main_activity = main_activities[key]
        //         let settings = main_activity.get_operation_settings()
        //         console.log("Settings:",settings)
        //         let d = []
        //         activity.dependencies.forEach(element => {
        //                 d.push(element)
                        
        //             });
        //         dependencies[key] = {'tableName':key,"dependencies":d, 'query': settings, 'activityType':activity.activityType}
        //         if (activity.activityType == 'export'){
        //             target_ids.push(key)
        //         }
            
        //     });

        //     let data = await get_ordered_nodes(dependencies, Object.keys(dependencies))
        //     console.log("ORDERED", data)
        //     for (const node of data['ordered_nodes']) {
        //         let activity = widget.flowchart('getOperatorActivity', node['tableName']);
        //         console.log("node",activity)
        //         if (activity.activityType != 'export'){
        //             if (activity.activityType == 'join'){
        //                     let input_data = {'table_1': activity.inputs.input_1.value.outputs.output.value.values, 'table_2': activity.inputs.input_2.value.outputs.output.value.values}
        //                     let response = await run_activity_flow(activity, widget,input_data)
        //                     if (response == null){return}
        //                     console.log("JOIN RESPONSE", response)
        //                      widget.flowchart('setoutputVal',activity.operatorId,'output', response)
        //             }else if (activity.activityType == 'append'){
        //                     let input_data = {'table_1': activity.inputs.input_1.value.outputs.output.value.values, 'table_2': activity.inputs.input_2.value.outputs.output.value.values}
        //                     let response = await run_activity_flow(activity, widget,input_data)
        //                     if (response == null){return}
        //                     widget.flowchart('setoutputVal',activity.operatorId,'output', response)
        //             }else{
        //              let response = await run_activity_flow(activity, widget)
        //                 console.log("Ordered Response",response)
        //                 if (response == null){return}
        //                 widget.flowchart('setoutputVal',activity.operatorId,'output', response)
        //             }
        //     }
        // }
 }
