function prettyPrintJson(obj) {
      let json = JSON.stringify(obj, null, 2);
      json = json
          .replace(/&/g, '&amp;') 
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|\b\d+\b)/g, match => {
          let color = '#ce9178';
          if (/^"/.test(match)) {
              color = /:$/.test(match) ? '#9cdcfe' : '#ce9178';
          } else if (/true|false/.test(match)) {
              color = '#569cd6';
          } else if (/null/.test(match)) {
              color = '#569cd6';
          } else if (/^[0-9]+$/.test(match)) {
              color = '#b5cea8';
          }
          return `<span style="color:${color}">${match}</span>`;
          });
          return json
  }
async function  get_clients(){
		var request = new Request('game-of-life/client?sessionId='+this.sessionId, {
					method: 'GET',
					headers: new Headers({
								'Accept': 'application/json'
							})
		});
        var clients = null;
        var response = await fetch(request);
        if (response.ok){ 
            clients = await response.json()
        }
        return clients;
	}
 async function stage(ws_clients){
    if (ws_clients == undefined){
        document.getElementById('bronzejsonContainer').innerHTML = prettyPrintJson({"Message": "No Live Session Detected!"});
    }else{
    
    if (ws_clients.hasOwnProperty("total_count")){
    delete ws_clients['total_count'];
    }


    document.getElementById('bronzejsonContainer').innerHTML = prettyPrintJson(ws_clients);

		let silver_values = []
        let sessionId = null;
        
		ws_clients['values'].forEach(element => {
            sessionId = element['sessionId']
                let silver = {
						'UserID' : element['userId'],
						'UserName' : element['username']
					}
					silver_values.push(silver)
		});
		let session = await get_session_by_sessionId(sessionId)
        let sessionName = session['name']
        
		 document.getElementById('silverjsonContainer').innerHTML = prettyPrintJson({"Session_Name": sessionName,"Session_ID": sessionId,"values":silver_values});
         document.getElementById('goldjsonContainer').innerHTML = prettyPrintJson({"Total_Clients": silver_values.length,"Session_ID": sessionId,"Session_Name": sessionName, 'values': silver_values});


    }

}

stage()