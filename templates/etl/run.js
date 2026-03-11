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

function resolveHttpRequestSettings(activity) {
    if (window.getHttpRequestSettingsFromActivity) {
        return window.getHttpRequestSettingsFromActivity(activity) || {};
    }
    return extractHttpCallSettings(activity && (activity.settings || activity.operations) || {});
}

function isBlobStorageUrl(url) {
    if (window.isBlobStorageUrl) {
        return window.isBlobStorageUrl(url);
    }
    return typeof url === "string" && url.indexOf("/blob-storage/") !== -1;
}

async function fetchBlobStoragePayload(settings) {
    const url = settings.url || "";
    if (!url) {
        return null;
    }
    const method = (settings.request_type || "GET").toUpperCase();
    const headers = new Headers({ "Accept": "application/json" });
    if (settings.headers && typeof settings.headers === "object") {
        Object.keys(settings.headers).forEach(key => {
            headers.set(key, settings.headers[key]);
        });
    }
    const init = { method: method, headers: headers };
    if (method !== "GET" && settings.body) {
        init.body = settings.body;
    }
    const response = await fetch(url, init);
    if (!response.ok) {
        return null;
    }
    try {
        return await response.json();
    } catch (error) {
        return await response.text();
    }
}

function normalizeBlobStoragePayload(payload) {
    if (payload && typeof payload === "object" && !Array.isArray(payload)) {
        if (payload.filetype === "csv" && Array.isArray(payload.values)) {
            return payload.values;
        }
    }
    return payload;
}

async function hydrateBlobStorageActivities(activities, preview = false) {
    const prepared = [];
    for (const activity of activities) {
        if (activity && activity.activityType === "http_request") {
            const settings = resolveHttpRequestSettings(activity);
            const url = settings && settings.url ? settings.url : "";
            if (isBlobStorageUrl(url)) {
                const payload = await fetchBlobStoragePayload(settings);
                if (payload !== null && payload !== undefined) {
                    const data = normalizeBlobStoragePayload(payload);
                    prepared.push(Object.assign({}, activity, {
                        activityType: "import",
                        activity_type: "import",
                        data: data,
                        settings: null,
                        operations: null
                    }));
                    continue;
                }
            }
        }
        prepared.push(activity);
    }
    return prepared;
}

function getActivityDependencies(activity) {
    const raw = Array.isArray(activity?.dependencies) ? activity.dependencies : [];
    let slot1 = null;
    let slot2 = null;
    const rest = [];
    raw.forEach(dep => {
        if (dep === null || dep === undefined) {
            return;
        }
        const depId = dep && dep.operatorId !== undefined ? dep.operatorId : dep;
        const connector = dep && dep.connector ? dep.connector : null;
        if (connector === "input_1") {
            slot1 = depId;
            return;
        }
        if (connector === "input_2") {
            slot2 = depId;
            return;
        }
        rest.push(depId);
    });
    const ordered = [];
    if (slot1 !== null) {
        ordered.push(slot1);
    }
    if (slot2 !== null) {
        ordered.push(slot2);
    }
    rest.forEach(depId => {
        if (!ordered.includes(depId)) {
            ordered.push(depId);
        }
    });
    return ordered.map(dep => dep.toString());
}

async function orderStoredDataflow(dataflow) {
    if (!dataflow || !dataflow.activities) {
        return null;
    }
    const dependencies = {};
    const target_ids = [];
    Object.keys(dataflow.activities).forEach(key => {
        const activity = dataflow.activities[key]?.properties || {};
        const deps = getActivityDependencies(activity);
        dependencies[key] = {
            tableName: key,
            dependencies: deps,
            query: "",
            activityType: activity.activityType || ""
        };
        target_ids.push(key);
    });
    if (!target_ids.length) {
        return null;
    }
    const body = { dependencies: JSON.stringify(dependencies), target_ids: target_ids };
    const request = new Request("/etl/pipeline/order", {
        method: "POST",
        headers: new Headers({
            "Accept": "application/json"
        }),
        body: JSON.stringify(body)
    });
    const response = await fetch(request);
    if (!response.ok) {
        return null;
    }
    try {
        return await response.json();
    } catch (error) {
        return null;
    }
}

function buildStoredDataflowActivities(dataflow, ordered) {
    if (!dataflow || !dataflow.activities || !ordered || !Array.isArray(ordered.ordered_nodes)) {
        return [];
    }
    return ordered.ordered_nodes.map(node => {
        const operatorId = node.tableName;
        const entry = dataflow.activities[operatorId];
        const activity = entry ? entry.properties : null;
        if (!activity) {
            return null;
        }
        let activity_data = null;
        if (activity.activityType === "import" || activity.activityType === "sheets_read" || activity.activityType === "http_request") {
            activity_data = activity?.inputs?.input?.value?.values ?? activity?.outputs?.output?.value?.values ?? null;
        } else if (activity.activityType === "join" || activity.activityType === "append") {
            const table_1 = activity?.inputs?.input_1?.value?.outputs?.output?.value?.values ?? null;
            const table_2 = activity?.inputs?.input_2?.value?.outputs?.output?.value?.values ?? null;
            if (table_1 && table_2) {
                activity_data = { table_1: table_1, table_2: table_2 };
            }
        }
        return {
            operatorId: operatorId,
            activityType: activity.activityType,
            settings: activity.settings || null,
            data: activity_data,
            dependencies: getActivityDependencies(activity)
        };
    }).filter(Boolean);
}

async function runStoredDataflow(activity, preview) {
    const settings = activity && activity.settings ? activity.settings : {};
    const dataflowSettings = settings.dataflow || {};
    const pipelineId = dataflowSettings.pipeline_id || settings.pipeline_id;
    if (!pipelineId) {
        return null;
    }
    const loadResponse = await fetch("/blob-storage/etl/dataflow/load?pipelineId=" + encodeURIComponent(pipelineId), {
        method: "GET",
        headers: new Headers({
            "Accept": "application/json"
        })
    });
    if (!loadResponse.ok) {
        return null;
    }
    const dataflow = await loadResponse.json();
    const ordered = await orderStoredDataflow(dataflow);
    const activities = buildStoredDataflowActivities(dataflow, ordered);
    if (!activities.length) {
        return null;
    }
    const httpSinkActivities = activities.filter(activity => activity.activityType === "http_sink");
    const body = { activities: activities, preview: !!preview, skip_http_sink: true };
    const request = new Request("/etl/run/", {
        method: "POST",
        headers: new Headers({
            "Accept": "application/json"
        }),
        body: JSON.stringify(body)
    });
    const response = await fetch(request);
    if (!response.ok) {
        return null;
    }
    try {
        const payload = await response.json();
        if (!preview && httpSinkActivities.length && payload && Array.isArray(payload.results)) {
            const resultsById = {};
            payload.results.forEach(entry => {
                if (entry && entry.operatorId != null && entry.result) {
                    resultsById[String(entry.operatorId)] = entry.result;
                }
            });
            for (const sink of httpSinkActivities) {
                let sinkData = sink.data;
                if ((sinkData == null || sinkData === []) && Array.isArray(sink.dependencies) && sink.dependencies.length) {
                    const depId = sink.dependencies[sink.dependencies.length - 1];
                    const depResult = resultsById[String(depId)];
                    if (depResult && depResult.values !== undefined) {
                        sinkData = depResult.values;
                    } else if (depResult) {
                        sinkData = depResult;
                    }
                }
                await postHttpSinkActivity(sink, sinkData);
            }
        }
        if (payload && Array.isArray(payload.results) && ordered && Array.isArray(ordered.ordered_nodes)) {
            const lastNode = ordered.ordered_nodes[ordered.ordered_nodes.length - 1];
            const lastId = lastNode ? String(lastNode.tableName) : null;
            if (lastId) {
                const match = payload.results.find(entry => entry && String(entry.operatorId) === lastId);
                if (match && match.result) {
                    return match.result.values !== undefined ? match.result.values : match.result;
                }
            }
        }
        return null;
    } catch (error) {
        return null;
    }
}

async function runStoredPipeline(activity, preview) {
    const settings = activity && activity.settings ? activity.settings : {};
    const pipelineSettings = settings.pipeline || {};
    const pipelineId = pipelineSettings.pipeline_id || settings.pipeline_id;
    if (!pipelineId) {
        return null;
    }
    const loadResponse = await fetch("/blob-storage/etl/pipeline/load?pipelineId=" + encodeURIComponent(pipelineId), {
        method: "GET",
        headers: new Headers({
            "Accept": "application/json"
        })
    });
    if (!loadResponse.ok) {
        return null;
    }
    const pipeline = await loadResponse.json();
    const ordered = await orderStoredDataflow(pipeline);
    const activities = buildStoredDataflowActivities(pipeline, ordered);
    if (!activities.length) {
        return null;
    }
    const hydrated = await hydrateBlobStorageActivities(activities, preview);
    const httpSinkActivities = hydrated.filter(activity => activity.activityType === "http_sink");
    const body = { activities: hydrated, preview: !!preview, skip_http_sink: true };
    const request = new Request("/etl/run/", {
        method: "POST",
        headers: new Headers({
            "Accept": "application/json"
        }),
        body: JSON.stringify(body)
    });
    const response = await fetch(request);
    if (!response.ok) {
        return null;
    }
    try {
        const payload = await response.json();
        if (!preview && httpSinkActivities.length && payload && Array.isArray(payload.results)) {
            const resultsById = {};
            payload.results.forEach(entry => {
                if (entry && entry.operatorId != null && entry.result) {
                    resultsById[String(entry.operatorId)] = entry.result;
                }
            });
            for (const sink of httpSinkActivities) {
                let sinkData = sink.data;
                if ((sinkData == null || sinkData === []) && Array.isArray(sink.dependencies) && sink.dependencies.length) {
                    const depId = sink.dependencies[sink.dependencies.length - 1];
                    const depResult = resultsById[String(depId)];
                    if (depResult && depResult.values !== undefined) {
                        sinkData = depResult.values;
                    } else if (depResult) {
                        sinkData = depResult;
                    }
                }
                await postHttpSinkActivity(sink, sinkData);
            }
        }
        if (payload && Array.isArray(payload.results) && ordered && Array.isArray(ordered.ordered_nodes)) {
            const lastNode = ordered.ordered_nodes[ordered.ordered_nodes.length - 1];
            const lastId = lastNode ? String(lastNode.tableName) : null;
            if (lastId) {
                const match = payload.results.find(entry => entry && String(entry.operatorId) === lastId);
                if (match && match.result) {
                    return match.result.values !== undefined ? match.result.values : match.result;
                }
            }
        }
        return null;
    } catch (error) {
        return null;
    }
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
    if (activity_type === "http_request") {
        const httpSettings = resolveHttpRequestSettings(activity);
        const url = httpSettings && httpSettings.url ? httpSettings.url : "";
        if (isBlobStorageUrl(url)) {
            const payload = await fetchBlobStoragePayload(httpSettings);
            if (payload !== null && payload !== undefined) {
                return { values: normalizeBlobStoragePayload(payload) };
            }
        }
    }
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
    if (target_ids.length === 0) {
        target_ids = Object.keys(dependencies);
    }
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
    const preparedActivities = await hydrateBlobStorageActivities(activities, preview);
    const httpSinkActivities = preparedActivities.filter(activity => activity.activityType === "http_sink");
    const body = { activities: preparedActivities, preview: !!preview, skip_http_sink: !!preview }
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
            if (data && data.status === "accepted") {
                return data;
            }
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
