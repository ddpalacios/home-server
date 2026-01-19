function normalizeHttpSinkRows(data) {
    if (Array.isArray(data)) {
        return data;
    }
    if (data && typeof data === "object") {
        return [data];
    }
    if (data != null) {
        return [{ value: data }];
    }
    return [];
}

function csvEscape(value) {
    if (value === null || value === undefined) {
        return "";
    }
    let str = String(value);
    if (/[\",\n\r]/.test(str)) {
        str = '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
}

function rowsToCsv(rows) {
    const headers = [];
    rows.forEach(row => {
        if (row && typeof row === "object" && !Array.isArray(row)) {
            Object.keys(row).forEach(key => {
                if (!headers.includes(key)) {
                    headers.push(key);
                }
            });
        }
    });
    if (!headers.length) {
        return "";
    }
    const lines = [];
    lines.push(headers.map(csvEscape).join(","));
    rows.forEach(row => {
        if (row && typeof row === "object" && !Array.isArray(row)) {
            lines.push(headers.map(key => csvEscape(row[key])).join(","));
        } else {
            lines.push(headers.map(() => "").join(","));
        }
    });
    return lines.join("\n");
}

function extractHttpCallSettings(settings) {
    if (!settings) {
        return {};
    }
    if (Array.isArray(settings.call) && settings.call.length) {
        return settings.call[0] || {};
    }
    if (settings.call && typeof settings.call === "object") {
        return settings.call;
    }
    return settings;
}

async function postHttpSinkActivity(activity, data) {
    const settings = extractHttpCallSettings(activity.settings || {});
    const url = settings.url || "";
    if (!url) {
        return null;
    }
    const rows = normalizeHttpSinkRows(data);
    const lowerUrl = url.toLowerCase();
    let body = "";
    const headers = new Headers({ "Accept": "application/json" });
    if (lowerUrl.endsWith(".csv")) {
        body = rowsToCsv(rows);
        headers.set("Content-Type", "text/csv");
    } else {
        body = JSON.stringify(rows);
        headers.set("Content-Type", "application/json");
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
        const request = new Request(url, {
            method: "POST",
            headers: headers,
            body: body,
            signal: controller.signal
        });
        return await fetch(request);
    } finally {
        clearTimeout(timeout);
    }
}

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
    if (activity_type === 'http_sink') {
        const response = await postHttpSinkActivity(activity, body.data);
        return response && response.ok ? { ok: true } : null;
    }
    var requestUrl = '/etl/run/';
    if (activity_type === 'http_request') {
        requestUrl = '/etl/call';
    }
    var request = new Request(requestUrl, {
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
        if (activityType == 'sheets_write' || activityType == 'http_sink'){
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

async function post_ordered_activities(activities, preview = false, meta){
    if (!Array.isArray(activities) || activities.length === 0) {
        return null
    }
    const httpSinkActivities = activities.filter(activity => activity.activityType === "http_sink");
    const body = { activities: activities, preview: !!preview, skip_http_sink: true }
    if (meta && typeof meta === "object") {
        body.test_run_meta = meta
    }
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
            if (!preview && httpSinkActivities.length && data && Array.isArray(data.results)) {
                const resultsById = {}
                data.results.forEach(entry => {
                    if (entry && entry.operatorId != null && entry.result) {
                        resultsById[String(entry.operatorId)] = entry.result
                    }
                })
                for (const sink of httpSinkActivities) {
                    let sinkData = sink.data
                    if ((sinkData == null || sinkData === []) && Array.isArray(sink.dependencies) && sink.dependencies.length) {
                        const depId = sink.dependencies[sink.dependencies.length - 1]
                        const depResult = resultsById[String(depId)]
                        if (depResult && depResult.values !== undefined) {
                            sinkData = depResult.values
                        } else if (depResult) {
                            sinkData = depResult
                        }
                    }
                    await postHttpSinkActivity(sink, sinkData)
                }
            }
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
