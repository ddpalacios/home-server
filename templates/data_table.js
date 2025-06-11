async function update_audio_t(data){
        console.log("Sending "+ data)
        var request = new Request('/life-of-sounds/audio', {
					method: 'PATCH',
					headers: new Headers({
								'Accept': 'application/json'
							})
					 ,body: JSON.stringify(data)
			});
		var response =  await fetch(request);

    }

function save_record(Id,editable_columns) {
      const table = document.getElementById('editableTable');
      const data = [];
      const th_rows = table.querySelectorAll('thead th');
      var count = 0;

      th_rows.forEach(row => {
        if (editable_columns.includes(row.textContent.toLowerCase())){
            var col_name = row.textContent.toLowerCase()

               var target_cell = document.getElementById('cell_'+col_name+'_'+Id)
               console.log("Target ID "+ target_cell.id)
               console.log("Target Text "+ target_cell.textContent)
             var json_data = {}
             json_data['Id'] = Id 
             json_data[col_name] = target_cell.textContent;
             update_audio_t(json_data)
             data.push(json_data)

        }
      });
      console.log('Saved Data:', data);
    }

async function load_audio(audioId, col_name){
				var request = new Request("/life-of-sounds/audio_blob?Id='"+audioId+"'", {
					method: 'GET',
					headers: new Headers({
								'Accept': 'application/octet-stream'
							})
			});
					fetch(request)
					.then(response => response.arrayBuffer())
					.then(arrayBuffer => {
						const blob = new Blob([arrayBuffer], { type: 'application/octet-stream' });
						const url = URL.createObjectURL(blob);
						const audioElem = document.getElementById( "audio_"+col_name+"_"+ audioId);
						audioElem.src = url;


					})
					.catch(err => console.error("Fetch or playback error:", err));
	

	}



function action_button_on_click(button,editable_columns,Id){
     button.onclick = function () {
                    save_record(button.id.replace("button_action_",""),editable_columns)
					button.textContent = "Saved!"
			  		button.style.backgroundColor = 'green'
					button.disabled =  true

                    var action_cell = document.getElementById('cell_action_'+Id)
                    action_cell.style.backgroundColor = ""

                    for (var i=0; i<editable_columns.length; i++){
                        var target_cell = document.getElementById('cell_'+editable_columns[i] +'_'+Id)
                        target_cell.style.backgroundColor = ""
                    }

				}; 
}

function set_action_button(cell, columnName, Id,editable_columns){
        var button = create_element('button', 'button_'+columnName+'_'+Id);
        button.textContent = "No Changes Made"; 
        button.style.backgroundColor = 'gray'
        button.disabled =  true
        action_button_on_click(button,editable_columns,Id)

        cell.appendChild(button)
}

function on_cell_change(cell, columnName, Id){
        cell.addEventListener("input", (event) => {
            console.log("Cell value changed to:", event.target.innerText);
            var button = document.getElementById('button_action_'+Id)
            var action_cell = document.getElementById('cell_action_'+Id)

            button.textContent = "Save Changes"
            button.style.backgroundColor = 'red'
            button.disabled =  false
            action_cell.style.backgroundColor = '#FCEC92'
            cell.style.backgroundColor = '#FCEC92'
            // var button_cell = document.getElementById("button_cell_"+item["Id"])
            // console.log(item)
            });
}


function add_rows(data){
    tableBody_element = get_element_by_id('tableBodyid')
    data.forEach(item =>  {
        let row = tableBody_element.insertRow();
        var Id = item['Id']
        Object.keys(item).forEach(key => {
            if (!ignore_columns.includes(key)){
                let cell = row.insertCell();
                cell.id = 'cell_'+key+'_'+Id
                var value = item[key];
                if (key == 'action'){
                    set_action_button(cell, key, Id,editable_columns)
                }else{
                    if (editable_columns.includes(key)){
                        cell.setAttribute('contentEditable', 'true');
                        on_cell_change(cell, key, Id)
                        const t = document.createElement("p");
                        t.textContent = value
                        cell.appendChild(t);
                    }else if (key == 'path'){
                        const audioElement = document.createElement("audio");                        
						audioElement.id = "audio_path_"+ item['Id'];
						audioElement.controls = true; // Adds play/pause controls
						audioElement.loop = false; // Audio won't loop
						cell.style.display = 'flex';
						cell.style.justifyContent = 'center';
						cell.style.alignItems = 'center';
						cell.style.gap = '15px'; 
                        load_audio(item['Id'],key)
						cell.appendChild(audioElement);

                    }else{
                        const t = document.createElement("p");
                        t.textContent = value
                        cell.appendChild(t);
                    }

                }
        }

        });
     });




}

function create_table_body(tableBody_element,data, editable_columns,ignore_columns){
    var idx = 0
     data.forEach(item =>  {
        let row = tableBody_element.insertRow();
        var Id = item['Id']
        
        idx ++;
        if (idx < 9){
        
        Object.keys(item).forEach(key => {
            if (!ignore_columns.includes(key)){
                let cell = row.insertCell();
                cell.id = 'cell_'+key+'_'+Id
                var value = item[key];
                if (key == 'action'){
                    set_action_button(cell, key, Id,editable_columns)
                }else{
                    if (editable_columns.includes(key)){
                        cell.setAttribute('contentEditable', 'true');
                        on_cell_change(cell, key, Id)
                        const t = document.createElement("p");
                        t.textContent = value
                        cell.appendChild(t);
                    }else if (key == 'path'){
                        const audioElement = document.createElement("audio");                        
						audioElement.id = "audio_path_"+ item['Id'];
						audioElement.controls = true; // Adds play/pause controls
						audioElement.loop = false; // Audio won't loop
						cell.style.display = 'flex';
						cell.style.justifyContent = 'center';
						cell.style.alignItems = 'center';
						cell.style.gap = '15px'; 
                        load_audio(item['Id'],key)
						cell.appendChild(audioElement);

                    }else{
                        const t = document.createElement("p");
                        t.textContent = value
                        cell.appendChild(t);
                    }

                }
        }

        });
    }
     });
}
function create_table_headers(tableHead_element,data, editable_columns,ignore_columns){
    var values = []
    let row = tableHead_element.insertRow();
    if (editable_columns.length > 0){
            let th = document.createElement('th');
            row.appendChild(th);
            for (var i =0; i<data.length; i++){
                 obj = data[i]
                 keys = Object.keys(obj);
                 newobj = {}
                 newobj['action'] = null
                 for (var j=0; j<keys.length; j++){
                    var key_val = keys[j];
                    if (ignore_columns.includes(key_val)){
                        if (key_val == 'Id'){
                            newobj[key_val] = obj[key_val]
                        }
                        continue;
                    }
                    var val = obj[key_val]
                    newobj[key_val] = val
                 }
                 values.push(newobj)  
            }
    }
	Object.keys(data[0]).forEach(key => {
            if (!ignore_columns.includes(key)){
			    let th = document.createElement('th');
                th.textContent = key.toUpperCase();
                row.appendChild(th);
                console.log(key);
            }
        });  
    if (values.length > 0){
        return values;
    }else{
        return data;
    }
                
}

function create_table(data,  editable_columns, ignore_columns){
        const table = create_element('table', 'editableTable')
        const tableHead = create_element('thead', 'theadid')
        const tableBody = create_element('thead', 'tableBodyid')
        table.appendChild(tableHead);
        table.appendChild(tableBody);

        data = create_table_headers(tableHead,data, editable_columns,ignore_columns)
        create_table_body(tableHead,data, editable_columns,ignore_columns)

        document.getElementById('audio_table_container').appendChild(table);
    }

function create_table_data(entity, userid){
      document.getElementById("audio_table_container").innerHTML = "";
      editable_columns = []
	  ignore_columns = []
      if (entity == 'audio'){
          editable_columns = ['name']
		  ignore_columns = [ 'Id','userid']
      }
      var request_url = null;
      if (userid != null){
            request_url = "/life-of-sounds/"+entity+"?userid='"+userid+"'"
      }else{
            request_url = "/life-of-sounds/"+entity;
      }

      data_request = new Request(request_url, {
                    method: 'GET'
                    ,headers: new Headers({
                        'Accept': 'application/json'
                        })
                });
            fetch(data_request)
                .then((response)=> response.json())
                .then((data)=> {
                    var obj = data.values
                    create_table(obj, editable_columns,ignore_columns)
                });
    }
