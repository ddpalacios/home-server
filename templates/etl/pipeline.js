class Pipeline_Activity extends Activity {
    constructor(flowchart, activity) {
        super(flowchart, activity);
        this._selectedPipeline = null;
        this._selectedPipelineId = "";
        this.settings = this.get_settings_element();
    }

    _get_pipelines() {
        if (typeof window.getAvailablePipelines === "function") {
            return window.getAvailablePipelines() || [];
        }
        return [];
    }

    _get_saved_id() {
        const settings = this.activity && this.activity.settings;
        if (settings && settings.pipeline && settings.pipeline.pipeline_id) {
            return settings.pipeline.pipeline_id;
        }
        return "";
    }

    _select_element(item, selectedId) {
        // Build an option element and mark it selected when it matches the saved pipeline.
        const option = document.createElement("option");
        option.value = item.pipeline_id || "";
        option.textContent = item.pipeline_name || item.pipeline_id || "Untitled Pipeline";
        if (selectedId && item.pipeline_id === selectedId) {
            option.selected = true;
        }
        return option;
    }

    _get_selected_id() {
        const select = document.getElementById(this.activityId + "_pipeline_select");
        if (this._selectedPipelineId) {
            return this._selectedPipelineId;
        }
        return select ? select.value : this._get_saved_id();
    }

    _populate_select(select) {
        const pipelines = this._get_pipelines();
        const selectedId = this._get_saved_id();
        select.innerHTML = "";

        const placeholder = document.createElement("option");
        placeholder.value = "";
        placeholder.textContent = pipelines.length ? "Select pipeline" : "No pipelines available";
        select.appendChild(placeholder);

        if (!pipelines.length && typeof window.fetchSavedPipelineList === "function") {
            // Kick off a pipeline list refresh; the global refresh handler will update options.
            window.fetchSavedPipelineList();
        }

        pipelines.forEach(function(item) {
            select.appendChild(this._select_element(item, selectedId));
        }, this);
    }

    _load_selected_pipeline(pipelineId) {
        if (!pipelineId) {
            this._selectedPipeline = null;
            return;
        }
        fetch("/blob-storage/etl/pipeline/load?pipelineId=" + encodeURIComponent(pipelineId), {
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
            .then((pipeline) => {
                if (!pipeline) {
                    return;
                }
                this._selectedPipeline = pipeline;
            })
            .catch((error) => {
                console.error(error);
            });
    }

    _handle_pipeline_change() {
        const select = document.getElementById(this.activityId + "_pipeline_select");
        const selectedId = select ? select.value : "";
        this._selectedPipelineId = selectedId;
        this._load_selected_pipeline(selectedId);
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
        title.textContent = "Pipeline";
        header.appendChild(title);

        const subtitle = document.createElement("div");
        subtitle.className = "activity-settings-subtitle";
        subtitle.textContent = "Run a saved pipeline inside this step.";
        header.appendChild(subtitle);
        section.appendChild(header);

        const field = document.createElement("div");
        field.className = "activity-settings-field";

        const label = document.createElement("label");
        label.textContent = "Pipeline";
        label.htmlFor = this.activityId + "_pipeline_select";
        field.appendChild(label);

        const controlRow = document.createElement("div");
        controlRow.className = "activity-settings-row";

        const select = document.createElement("select");
        select.className = "item_select activity-settings-select";
        select.name = "pipeline_id";
        select.id = this.activityId + "_pipeline_select";
        select.dataset.activityType = "pipeline";
        this._populate_select(select);
        select.addEventListener("change", () => {
            this._handle_pipeline_change();
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
            if (typeof window.loadSavedPipelineById === "function") {
                window.loadSavedPipelineById(selectedId);
            }
        });
        controlRow.appendChild(navigateButton);

        field.appendChild(controlRow);
        section.appendChild(field);

        div.appendChild(section);
        return div;
    }

    get_operation_settings() {
        const select = document.getElementById(this.activityId + "_pipeline_select");
        const pipelines = this._get_pipelines();
        const selectedId = select ? select.value : "";
        let selectedName = "";
        pipelines.some(function(item) {
            if (item.pipeline_id === selectedId) {
                selectedName = item.pipeline_name || item.pipeline_id || "";
                return true;
            }
            return false;
        });
        this._selectedPipelineId = selectedId;
        const settings = {
            pipeline: {
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
        const select = document.getElementById(this.activityId + "_pipeline_select");
        if (select) {
            this._populate_select(select);
        }
        const selectedId = select ? select.value : "";
        this._selectedPipelineId = selectedId;
        this._load_selected_pipeline(selectedId);
    }
}

window.refreshPipelineActivityOptions = function(pipelines) {
    const selects = document.querySelectorAll("select[data-activity-type='pipeline']");
    selects.forEach(function(select) {
        const selectedId = select.value;
        select.innerHTML = "";
        const placeholder = document.createElement("option");
        placeholder.value = "";
        placeholder.textContent = pipelines.length ? "Select pipeline" : "No pipelines available";
        select.appendChild(placeholder);
        pipelines.forEach(function(item) {
            const option = document.createElement("option");
            option.value = item.pipeline_id || "";
            option.textContent = item.pipeline_name || item.pipeline_id || "Untitled Pipeline";
            select.appendChild(option);
        });
        if (selectedId) {
            select.value = selectedId;
        }
    });
};
