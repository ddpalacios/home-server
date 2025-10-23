async function run_activity(activity){
    let activity_type = activity.activityType
    let body = {
        'activity_type' : activity_type
        ,'operations': activity.settings
        ,'data': activity.inputs.input.value
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