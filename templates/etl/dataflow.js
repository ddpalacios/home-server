class DataFlow_Activity extends Activity {
    constructor(flowchart, activity) {
        super(flowchart, activity);
        this._selectedDataflow = null;
        this._selectedDataflowId = "";
        this.settings = this.get_settings_element();
    }

    _get_dataflows() {
        if (typeof window.getAvailableDataflows === "function") {
            return window.getAvailableDataflows() || [];
        }
        return [];
    }

    _get_saved_id() {
        const settings = this.activity && this.activity.settings;
        if (settings && settings.dataflow && settings.dataflow.pipeline_id) {
            return settings.dataflow.pipeline_id;
        }
        return "";
    }

    _select_element(item, selectedId) {
        // Build an option element and mark it selected when it matches the saved dataflow.
        const option = document.createElement("option");
        option.value = item.pipeline_id || "";
        option.textContent = item.pipeline_name || item.pipeline_id || "Untitled Dataflow";
        if (selectedId && item.pipeline_id === selectedId) {
            option.selected = true;
        }
        return option;
    }

    _get_selected_id() {
        const select = document.getElementById(this.activityId + "_dataflow_select");
        if (this._selectedDataflowId) {
            return this._selectedDataflowId;
        }
        return select ? select.value : this._get_saved_id();
    }

    _populate_select(select) {
        const dataflows = this._get_dataflows();
        const selectedId = this._get_saved_id();
        select.innerHTML = "";
        // console.log(this.activityId);
        // let operator = this.flowchart("getOperatorActivity", this.activityId);
        // console.log(operator);

        const placeholder = document.createElement("option");
        placeholder.value = "";
        placeholder.textContent = dataflows.length ? "Select dataflow" : "No dataflows available";
        select.appendChild(placeholder);

        dataflows.forEach(function(item) {
            select.appendChild(this._select_element(item, selectedId));
        }, this);
    }

    _load_selected_dataflow(pipelineId) {
        if (!pipelineId) {
            this._selectedDataflow = null;
            return;
        }
        fetch("/blob-storage/etl/dataflow/load?pipelineId=" + encodeURIComponent(pipelineId), {
            method: "GET",
            headers: new Headers({
                "Accept": "application/json"
            })
        })
            .then((response) => {
                if (!response.ok) {
                    return null;
                }
                return response.json();
            })
            .then((dataflow) => {
                if (!dataflow) {
                    return;
                }
                this._selectedDataflow = dataflow;
            })
            .catch((error) => {
                console.error(error);
            });
    }

    _handle_dataflow_change() {
        const select = document.getElementById(this.activityId + "_dataflow_select");
        const selectedId = select ? select.value : "";
        this._selectedDataflowId = selectedId;
        this._load_selected_dataflow(selectedId);
        this.get_operation_settings();
    }

    get_settings_element() {
        const div = document.createElement("div");
        div.id = this.activityId;

        const section = document.createElement("div");
        section.className = "activity-settings-card";

        const header = document.createElement("div");
        header.className = "activity-settings-header";

        const title = document.createElement("div");
        title.className = "activity-settings-title";
        title.textContent = "Dataflow";
        header.appendChild(title);

        const subtitle = document.createElement("div");
        subtitle.className = "activity-settings-subtitle";
        subtitle.textContent = "Choose a saved dataflow to run inside this step.";
        header.appendChild(subtitle);
        section.appendChild(header);

        const field = document.createElement("div");
        field.className = "activity-settings-field";

        const label = document.createElement("label");
        label.textContent = "Dataflow";
        label.htmlFor = this.activityId + "_dataflow_select";
        field.appendChild(label);

        const controlRow = document.createElement("div");
        controlRow.className = "activity-settings-row";

        const select = document.createElement("select");
        select.className = "item_select activity-settings-select";
        select.name = "dataflow_id";
        select.id = this.activityId + "_dataflow_select";
        select.dataset.activityType = "dataflow";
        this._populate_select(select);
        select.addEventListener("change", () => {
            this._handle_dataflow_change();
        });
        controlRow.appendChild(select);

        const navigateButton = document.createElement("button");
        navigateButton.type = "button";
        navigateButton.className = "buttons activity-settings-button";
        navigateButton.textContent = "Navigate";
        navigateButton.addEventListener("click", () => {
            const selectedId = this._get_selected_id();
            if (!selectedId) {
                return;
            }
            if (typeof window.loadPipelineById === "function") {
                window.loadPipelineById(selectedId);
            }
        });
        controlRow.appendChild(navigateButton);

        field.appendChild(controlRow);
        section.appendChild(field);

        div.appendChild(section);
        return div;
    }

    get_operation_settings() {
        const select = document.getElementById(this.activityId + "_dataflow_select");
        const dataflows = this._get_dataflows();
        const selectedId = select ? select.value : "";
        let selectedName = "";
        dataflows.some(function(item) {
            if (item.pipeline_id === selectedId) {
                selectedName = item.pipeline_name || item.pipeline_id || "";
                return true;
            }
            return false;
        });
        this._selectedDataflowId = selectedId;
        const settings = {
            dataflow: {
                pipeline_id: selectedId,
                pipeline_name: selectedName
            }
        };
        if (this.activity) {
            this.activity.settings = settings;
        }
        if (this.flowchart && this.flowchart.flowchart) {
            this.flowchart.flowchart("setSettings", this.activityId, settings);
        }
        return settings;
    }

    _restore_saved_settings() {
        const select = document.getElementById(this.activityId + "_dataflow_select");
        if (select) {
            this._populate_select(select);
        }
        const selectedId = select ? select.value : "";
        this._selectedDataflowId = selectedId;
        this._load_selected_dataflow(selectedId);
    }
}

window.refreshDataflowActivityOptions = function(dataflows) {
    const selects = document.querySelectorAll("select[data-activity-type='dataflow']");
    selects.forEach(function(select) {
        const selectedId = select.value;
        select.innerHTML = "";
        const placeholder = document.createElement("option");
        placeholder.value = "";
        placeholder.textContent = dataflows.length ? "Select dataflow" : "No dataflows available";
        select.appendChild(placeholder);
        dataflows.forEach(function(item) {
            const option = document.createElement("option");
            option.value = item.pipeline_id || "";
            option.textContent = item.pipeline_name || item.pipeline_id || "Untitled Dataflow";
            select.appendChild(option);
        });
        if (selectedId) {
            select.value = selectedId;
        }
    });
};
