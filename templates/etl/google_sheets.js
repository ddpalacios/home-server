
class GoogleSheets_Activity extends Activity{
    constructor(flowchart,activity){
        super(flowchart, activity)
        this.settings = this.get_settings_element()
    }
    get_operation_settings(){
        const settings = {
            sheets: this._get_sheet_settings()
        }
        this.flowchart.flowchart('setSettings', this.activityId, settings)
        return settings
    }
    _get_sheet_settings(){
        const url_input = document.getElementById(this.activityId + "_sheet_url")
        const tab_input = document.getElementById(this.activityId + "_sheet_tab")
        const range_input = document.getElementById(this.activityId + "_sheet_range")
        const mode_input = document.getElementById(this.activityId + "_sheet_mode")
        return {
            url: url_input ? url_input.value : "",
            tab: tab_input ? tab_input.value : "",
            range: range_input ? range_input.value : "",
            mode: mode_input ? mode_input.value : ""
        }
    }
    get_settings_element(){
        let div = document.createElement('div')
        div.id = this.activityId
        div.style.display = 'flex'
        div.style.flexDirection = 'column'
        div.style.gap = '10px'

        const title = document.createElement('label')
        title.textContent = "Google Sheets"
        title.style.color = "black"
        div.appendChild(title)

        const url_label = document.createElement('label')
        url_label.textContent = "Sheet URL"
        url_label.style.color = "black"
        div.appendChild(url_label)

        const url_input = document.createElement('input')
        url_input.type = "text"
        url_input.className = "text_input_value"
        url_input.id = this.activityId + "_sheet_url"
        url_input.placeholder = "https://docs.google.com/spreadsheets/d/..."
        url_input.addEventListener("input", () => this.get_operation_settings())
        div.appendChild(url_input)

        const tab_label = document.createElement('label')
        tab_label.textContent = "Tab Name"
        tab_label.style.color = "black"
        div.appendChild(tab_label)

        const tab_input = document.createElement('input')
        tab_input.type = "text"
        tab_input.className = "text_input_value"
        tab_input.id = this.activityId + "_sheet_tab"
        tab_input.placeholder = "Sheet1"
        tab_input.addEventListener("input", () => this.get_operation_settings())
        div.appendChild(tab_input)

        const range_label = document.createElement('label')
        range_label.textContent = "Range (optional)"
        range_label.style.color = "black"
        div.appendChild(range_label)

        const range_input = document.createElement('input')
        range_input.type = "text"
        range_input.className = "text_input_value"
        range_input.id = this.activityId + "_sheet_range"
        range_input.placeholder = "A1:Z100"
        range_input.addEventListener("input", () => this.get_operation_settings())
        div.appendChild(range_input)

        let mode_select = null
        if (this.activity.activityType == "sheets_write"){
            const mode_label = document.createElement('label')
            mode_label.textContent = "Write Mode"
            mode_label.style.color = "black"
            div.appendChild(mode_label)

            mode_select = document.createElement('select')
            mode_select.id = this.activityId + "_sheet_mode"
            mode_select.className = "text_input_value"
            ;["append", "overwrite"].forEach(mode => {
                const option = document.createElement('option')
                option.value = mode
                option.textContent = mode.toUpperCase()
                mode_select.appendChild(option)
            })
            mode_select.addEventListener("change", () => this.get_operation_settings())
            div.appendChild(mode_select)
        }

        const saved_settings = this.activity.settings?.sheets
        if (saved_settings) {
            url_input.value = saved_settings.url || ""
            tab_input.value = saved_settings.tab || ""
            range_input.value = saved_settings.range || ""
            if (mode_select && saved_settings.mode) {
                mode_select.value = saved_settings.mode
            }
        }

        return div
    }
}
