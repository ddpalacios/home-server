class Sink_Activity extends Activity{
    constructor(flowchart,activity){
        super(flowchart,activity)
        this.settings = this.get_settings_element()
    }

    _on_button_click(e, widget, activity){
        let parent_element = e.target.parentElement;
        let fileName = parent_element.children[0].value
        let filetype = parent_element.children[1].value
        console.log(fileName, filetype)
        let data = this.flowchart.flowchart('getoutputVal', this.activityId, 'output')
        fileName = fileName+"."+filetype
        if (filetype == 'csv'){
            data = jsonToCsv(data['values'])
        }else{
            data = JSON.stringify(data['values'])
        }
         let blobstorage =  new BlobStorage()
        blobstorage.post_blob_by_path('silver', 'etl','imports', fileName,data)
        alert("Sinked", fileName)
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
                'type': 'input'
                ,'placeholder' : 'File Name'
                ,'value': ""
                ,'name': 'new_column_name'
            }
            ,{
                'type': 'selector'
                ,'order':1
                ,'options':['json','csv']
                ,'default_value': "json"
                ,'name': "column_name"
            }
            ,{
                'type': 'button'
                ,'label': 'Sink'
                ,'color': 'red'
            }]
        let column_edit_element = this.get_column_selection_element(widget,settings)
        columns_div.appendChild(column_edit_element)

}
    _sink(e, widget, activity){
        let filename = e.target.value
        if (filename == null || filename == "" || filename == undefined){
            alert("Invalid File Name")
            return
        }

        let blobstorage =  new BlobStorage()
        let data = this.flowchart.flowchart('getoutputVal', this.activityId, 'output')

        blobstorage.post_blob_by_path('silver', 'etl','imports', filename,data)

       

}
    get_operation_settings(){
        let settings = super.get_operation_settings('sink')
        this.flowchart.flowchart('setSettings', this.activityId, settings)
        return settings
    }
}
