function jsonToCsv(jsonData) {
    let csv = '';
    
    const headers = Object.keys(jsonData[0]);
    csv += headers.join(',') + '\n';
    
    jsonData.forEach(obj => {
        const values = headers.map(header => obj[header]);
        csv += values.join(',') + '\n';
    });
    
    return csv;
}

function csvToJson(text, headers, quoteChar = '"', delimiter = ',') {
  const regex = new RegExp(`\\s*(${quoteChar})?(.*?)\\1\\s*(?:${delimiter}|$)`, 'gs');

  const match = line => [...line.matchAll(regex)]
    .map(m => m[2])  // we only want the second capture group
    .slice(0, -1);   // cut off blank match at the end

  const lines = text.split('\n');
  const heads = headers ?? match(lines.shift());

  return lines.map(line => {
    return match(line).reduce((acc, cur, i) => {
      // Attempt to parse as a number; replace blank matches with `null`
      const val = cur.length <= 0 ? null : Number(cur) || cur;
      const key = heads[i] ?? `extra_${i}`;
      return { ...acc, [key]: val };
    }, {});
  });
}

class Import_Activity extends Activity{
    constructor(flowchart,activity){
        super(flowchart,activity)
        this.operation_type = "select"
        this.settings = this.get_settings_element()
    }


    get_add_button(){
        let add_button = document.createElement("button")
        add_button.innerHTML = this.add_button_label
        add_button.style.width = '15%'
        add_button.className = 'buttons'
        add_button.style.backgroundColor = "#28a745"; // modern bootstrap green
        add_button.style.color = "white";
        add_button.style.border = "none";
        add_button.style.borderRadius = "6px";
        add_button.style.padding = "8px 12px";
        add_button.style.cursor = "pointer";
        add_button.style.transition = "background 0.2s ease";
        add_button.addEventListener("click", (event) => this._add_column(event, this.flowchart, this));
        return add_button
    }

    async add_settings(metadata){
        if (metadata == null){return}
        metadata = metadata['data']
        let columns_div = document.getElementById(this.activityId + "_column_edit");
        if (columns_div == null || columns_div == undefined){
            let settings_div = document.getElementById('selected_activity_settings')
                columns_div = document.createElement('div')
                columns_div.style.display = 'flex'
                columns_div.style.flexDirection = 'column'
                columns_div.style.gap = "15px"
                columns_div.id = this.activityId+ "_column_edit"
                settings_div.appendChild(columns_div)
        }else{
            columns_div.innerHTML = ""
        }
        let add_button = this.get_add_button()
        columns_div.appendChild(add_button)
        let all_columns=[]
        metadata.forEach(element => {
            all_columns.push(element['name'])
        });

        metadata.forEach(column => {
            let settings = [
            {
                'type': 'selector'
                ,'options': all_columns
                ,'default_value': column['name']
                ,'name': 'column_name'
            },
             {
                'type': 'selector'
                ,'options': ['string','int', 'datetime','decimal','array']
                ,'default_value': column['type']
                ,'name': 'data_type'
            }
             , {
                'type': 'input'
                ,'placeholder' : 'Column Name'
                ,'value': column['name']
                ,'name': 'new_column_name'
            }
            ,{
                'type': 'button'
                ,'label': 'DROP'
                ,'color': 'red'
            }]
            let column_edit_element = this.get_column_selection_element(this.flowchart,settings)
            columns_div.appendChild(column_edit_element)
        });
    }

     async _inputFile_onchange(e, widget, activity){
        let settings_div = document.getElementById('selected_activity_settings')
		let loading_text = document.createElement("h1");
		loading_text.textContent = "Loading...";
		loading_text.style.color = "black";
		settings_div.prepend(loading_text);

        let blobstorage = new BlobStorage();
        let sparkclient = new SparkClient();
        let filename;
        let data;
        let dataslice = 100000
        let filetype = 'json'
        if (e.target.name == 'blob_selection'){
            filename = e.target.value
            let file = await blobstorage.get_blob_by_path('bronze','etl', 'imports',filename)
            if (filename.includes('.csv')){
                data = csvToJson(file);
                filetype = 'csv'
                data = data.slice(1,dataslice)
            }else{
                data = file

            }

        }else{
            const file = e.target.files?.item(0);
            if (!file){
                e.preventDefault();
                console.warn("No file selected, keeping existing content.");
                return;
            }
            filename = file.name
            let blob_files = await blobstorage.get_blob_directory_files('bronze', 'etl','imports')
            if (!blob_files.includes(filename)){
                let text = await file.text();
                 if (file.name.includes(".json")){
                        data = JSON.parse(text);
                        // data = JSON.stringify(data)
                 }else{
                         data = csvToJson(text);
                         data = data.slice(1,dataslice)
                         filetype = 'csv'
                 }
                // console.log(text)
                blobstorage.post_blob_by_path('bronze', 'etl','imports', filename,  text)
            }
        }
        let metadata = await sparkclient.process(data, filetype);
        console.log("META DATA", metadata)
        this.add_settings(metadata)
        this.flowchart.flowchart('setinputVal', this.activityId ,'input',{'datatypes': metadata['data'], 'values': data})
        this.flowchart.flowchart('setoutputVal', this.activityId ,'output',{'datatypes': metadata['data'], 'values': data})
        settings_div.removeChild(loading_text)
        //  widget.flowchart('run_activity', activityId);
     }


    async _on_selector_change(event, widget, activity){
        let div = document.getElementById(activity.activityId+"_column_edit")

         if (event.target.name != 'column_name'){
            return
        }

        let total_dupes = 1
        let selected_column  = event.target.value
        let name = selected_column
        let current_named_columns = []
        for (let i =0; i < div.children.length; i++){
            if (div.children[i].className != 'rename_settings'){continue}
            current_named_columns.push(div.children[i].children[2].value)
        }
        while(1){
            if (current_named_columns.includes(name)){
                name  = selected_column + "_" +total_dupes.toString()
                total_dupes +=1
            }else{
                break
            }
        }
        let datatypes = widget.flowchart('getOperatorActivity', activity.activityId).inputs.input.value.datatypes;
        let datatype = datatypes[selected_column]
        event.target.parentElement.children[1].value =  datatype
        event.target.parentElement.children[2].value =  name

    }
    _add_column(e, widget, activity){
        let all_columns = []
        let activityId = activity.activityId
        let columns_div = document.getElementById(activity.activityId + "_column_edit");
        if (columns_div == null || columns_div == undefined){
            let settings_div = document.getElementById('selected_activity_settings')
                columns_div = document.createElement('div')
                columns_div.style.display = 'flex'
                columns_div.style.flexDirection = 'column'
                columns_div.style.gap = "5px"
            columns_div.id = this.activityId+ "_column_edit"
            settings_div.appendChild(columns_div)
        }
          if (Array.isArray( activity.activity.inputs.input.value.values)){
            all_columns = Object.keys(activity.activity.inputs.input.value.values[0])
        }else{
            all_columns = Object.keys(activity.activity.inputs.input.value.values)

        }
        let datatypes = widget.flowchart("getOperatorActivity", activity.activityId).inputs.input.value.datatypes;
        let s = new Set(Object.values(datatypes));
        datatypes = [...s]
        let settings = [
            {
                'type': 'selector'
                ,'options': all_columns
                ,'default_value': ""
                ,'name': 'column_name'
            },
             {
                'type': 'selector'
                ,'options':['string','int', 'datetime','decimal','array']
                ,'default_value': datatypes[0]
                ,'name': 'data_type'
            }
             , {
                'type': 'input'
                ,'placeholder' : 'Column Name'
                ,'value': ""
                ,'name': 'new_column_name'
            }
            ,{
                'type': 'button'
                ,'label': 'DROP'
                ,'color': 'red'
            }]
        let column_edit_element = this.get_column_selection_element(widget,settings)
        columns_div.appendChild(column_edit_element)

}
    get_operation_settings(){
        let settings = super.get_operation_settings('select')
        this.flowchart.flowchart('setSettings', this.activityId, settings)
        return settings
    }

    _on_input_change(e, widget,activity){
        if (e.target.name == 'custom_value'){
            let parent_element = e.target.parentElement;
            // console.log(e.target.value)
            widget.flowchart('addCustomValue', activity.activityId, parent_element.id, e.target.value)
            return
        }

        let parent_element = e.target.parentElement;
        // console.log(e.target.value)
        widget.flowchart('renameSelectColumn', activity.activityId, parent_element.id, e.target.value)
    }
}