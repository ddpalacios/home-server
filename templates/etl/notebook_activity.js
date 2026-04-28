class Notebook_Activity extends Activity {
    constructor(flowchart, activity) {
        super(flowchart, activity);
        this._selectedNotebookId = "";
        this.settings = this.get_settings_element();
    }

    _get_notebooks() {
        if (typeof window.getAvailableNotebooks === "function") {
            return window.getAvailableNotebooks() || [];
        }
        return [];
    }

    _get_saved_id() {
        const settings = this.activity && this.activity.settings;
        if (settings && settings.notebook && settings.notebook.notebook_id) {
            return settings.notebook.notebook_id;
        }
        return "";
    }

    _select_element(item, selectedId) {
        const option = document.createElement("option");
        option.value = item.notebook_id || "";
        option.textContent = item.name || item.notebook_id || "Untitled Notebook";
        if (selectedId && item.notebook_id === selectedId) {
            option.selected = true;
        }
        return option;
    }

    _get_selected_id() {
        const select = document.getElementById(this.activityId + "_notebook_select");
        if (this._selectedNotebookId) {
            return this._selectedNotebookId;
        }
        return select ? select.value : this._get_saved_id();
    }

    _populate_select(select) {
        const notebooks = this._get_notebooks();
        const selectedId = this._get_saved_id();
        select.innerHTML = "";

        const placeholder = document.createElement("option");
        placeholder.value = "";
        placeholder.textContent = notebooks.length ? "Select notebook" : "No notebooks available";
        select.appendChild(placeholder);

        if (!notebooks.length && typeof window.fetchSavedNotebookList === "function") {
            window.fetchSavedNotebookList();
        }

        notebooks.forEach(function(item) {
            select.appendChild(this._select_element(item, selectedId));
        }, this);
    }

    _handle_notebook_change() {
        const select = document.getElementById(this.activityId + "_notebook_select");
        const selectedId = select ? select.value : "";
        this._selectedNotebookId = selectedId;
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
        title.textContent = "Notebook";
        header.appendChild(title);

        const subtitle = document.createElement("div");
        subtitle.className = "activity-settings-subtitle";
        subtitle.textContent = "Run a saved notebook as one parallel step.";
        header.appendChild(subtitle);
        section.appendChild(header);

        const field = document.createElement("div");
        field.className = "activity-settings-field";

        const label = document.createElement("label");
        label.textContent = "Notebook";
        label.htmlFor = this.activityId + "_notebook_select";
        field.appendChild(label);

        const controlRow = document.createElement("div");
        controlRow.className = "activity-settings-row";

        const select = document.createElement("select");
        select.className = "item_select activity-settings-select";
        select.name = "notebook_id";
        select.id = this.activityId + "_notebook_select";
        select.dataset.activityType = "notebook";
        this._populate_select(select);
        select.addEventListener("change", () => {
            this._handle_notebook_change();
        });
        controlRow.appendChild(select);

        field.appendChild(controlRow);
        section.appendChild(field);

        div.appendChild(section);
        return div;
    }

    get_operation_settings() {
        const select = document.getElementById(this.activityId + "_notebook_select");
        const notebooks = this._get_notebooks();
        const selectedId = select ? select.value : "";
        let selectedName = "";
        notebooks.some(function(item) {
            if (item.notebook_id === selectedId) {
                selectedName = item.name || item.notebook_id || "";
                return true;
            }
            return false;
        });
        this._selectedNotebookId = selectedId;
        const settings = {
            notebook: {
                notebook_id: selectedId,
                notebook_name: selectedName
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
        const select = document.getElementById(this.activityId + "_notebook_select");
        if (select) {
            this._populate_select(select);
        }
        const selectedId = select ? select.value : "";
        this._selectedNotebookId = selectedId;
    }
}

window.refreshNotebookActivityOptions = function(notebooks) {
    const selects = document.querySelectorAll("select[data-activity-type='notebook']");
    selects.forEach(function(select) {
        const selectedId = select.value;
        select.innerHTML = "";
        const placeholder = document.createElement("option");
        placeholder.value = "";
        placeholder.textContent = notebooks.length ? "Select notebook" : "No notebooks available";
        select.appendChild(placeholder);
        notebooks.forEach(function(item) {
            const option = document.createElement("option");
            option.value = item.notebook_id || "";
            option.textContent = item.name || item.notebook_id || "Untitled Notebook";
            select.appendChild(option);
        });
        if (selectedId) {
            select.value = selectedId;
        }
    });
};
