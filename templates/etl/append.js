class Append_Activity extends Activity{
    constructor(flowchart, activity){
        super(flowchart, activity)
        this.settings = this.get_settings_element()
    }

    get_settings_element(){
        const div = document.createElement('div')
        div.id = this.activityId
        return div
    }

    get_operation_settings(){
        const settings = {}
        this.flowchart.flowchart('setSettings', this.activityId, settings)
        return settings
    }
}
