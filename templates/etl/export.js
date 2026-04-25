
class Export_Activity extends Activity{
    constructor(flowchart,activity){
        super(flowchart, activity)
        this.add_button_label = "+ Export Data"
        this.settings = this.get_settings_element()
    }
    get_operation_settings(){
        let settings = super.get_operation_settings('custom')
        this.flowchart.flowchart('setSettings', this.activityId, settings)
        return settings
    }
jsonToCsv(jsonData) {
    if (!Array.isArray(jsonData) || jsonData.length === 0) return '';

    // get all headers (union of all keys)
    const headers = [...new Set(jsonData.flatMap(obj => Object.keys(obj)))];

    // helper to safely escape values
    const escape = (val) => {
        if (val === null || val === undefined) return '';
        val = String(val);
        // wrap in quotes if contains comma, newline, or quote
        if (/[",\n\r]/.test(val)) {
            return `"${val.replace(/"/g, '""')}"`;
        }
        return val;
    }

    const csv = [
        headers.join(','), // header row
        ...jsonData.map(obj => headers.map(h => escape(obj[h])).join(','))
    ].join('\n');

    return csv;
}



     export_data(data){
        data = this.jsonToCsv(data)
        const blob = new Blob([data], { type: 'text/csv' });
        // Create a URL for the Blob
        const url = URL.createObjectURL(blob);
        // Create an anchor tag for downloading
        const a = document.createElement('a');
        // Set the URL and download attribute of the anchor tag
        a.href = url;
        a.download = 'download.csv';
        // Trigger the download by clicking the anchor tag
        a.click();
}

    _add_column(e, widget, activity){
        this.export_data(activity.activity.inputs.input.value.values)
    }

  
}