class SparkClient{
    async process(data, filetype){
         let body = {
            'data': data,
            'filetype': filetype
         }
         var request = new Request('/etl/sparkclient/process', {
                                method: 'POST',
                                headers: new Headers({
                                            'Accept': 'application/json'
                                        })
			       ,body: JSON.stringify(body)
                    });
    console.log("Sending body", body)
    var response = await fetch(request);
    if (response.ok){ 
        try{
            const data = await response.json()
            return data;
        }catch(error){}
    }
    return null;
    }
}