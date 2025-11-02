class BlobStorage{
    async get_blob_by_path(container,source, database,tableName){
        if (tableName.includes(".csv")){
        var request = new Request('/blob-storage/'+container+'/'+source+ "/"+database+"/"+tableName, {
                        method: 'GET',
                        headers: new Headers({
                                    'content-type': 'text/csv;charset=UTF-8',
                                })
            });

        var response = await fetch(request);
        let values = null;
        if (response.ok){ 
            values= await response.text();
        }
        return values;
        }else{
             var request = new Request('/blob-storage/'+container+'/'+source+ "/"+database+"/"+tableName, {
                                method: 'GET',
                                headers: new Headers({
                                            'Accept': 'application/json'
                                        })
                    });
            var response = await fetch(request);
            let values = null;
                    if (response.ok){ 
                        values = await response.json()
                    }
                    return values;
        }
    }

    async get_blob_directory_files(container, source,database){
          var request = new Request('/blob-storage/files?source='+source+'&database='+database+'&container='+container, {
                                method: 'GET',
                                headers: new Headers({
                                            'Accept': 'application/json'
                                        })
                    });
      var response = await fetch(request);
      let values = null;
            if (response.ok){ 
                values = await response.json()
            }

        let out = []
        values['values'].forEach(element => {
            console.log(element['filename'])
            out.push(element['filename'])
        });


        return out
    }

    post_blob_by_path(container,source, database,tableName,body){
         var request = new Request('/blob-storage/'+container+'/'+source+ "/"+database+"/"+tableName, {
                                method: 'POST',
                                headers: new Headers({
                                            'Accept': 'application/json'
                                        })
			       ,body: body
                    });

            fetch(request);

    }
}