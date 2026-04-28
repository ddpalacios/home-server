class SQL_Activity extends Activity {
    constructor(flowchart, activity) {
        super(flowchart, activity);
        this._selectedSqlId = "";
        this.settings = this.get_settings_element();
    }

    _get_sql_docs() {
        if (typeof window.getAvailableSqlDocs === "function") {
            return window.getAvailableSqlDocs() || [];
        }
        return [];
    }

    _get_saved_id() {
        const settings = this.activity && this.activity.settings;
        if (settings && settings.sql && settings.sql.sql_id) {
            return settings.sql.sql_id;
        }
        return "";
    }

    _select_element(item, selectedId) {
        const option = document.createElement("option");
        option.value = item.sql_id || "";
        option.textContent = item.name || item.sql_id || "Untitled SQL";
        if (selectedId && item.sql_id === selectedId) {
            option.selected = true;
        }
        return option;
    }

    _get_selected_id() {
        const select = document.getElementById(this.activityId + "_sql_select");
        if (this._selectedSqlId) {
            return this._selectedSqlId;
        }
        return select ? select.value : this._get_saved_id();
    }

    _populate_select(select) {
        const docs = this._get_sql_docs();
        const selectedId = this._get_saved_id();
        select.innerHTML = "";

        const placeholder = document.createElement("option");
        placeholder.value = "";
        placeholder.textContent = docs.length ? "Select SQL" : "No SQL docs available";
        select.appendChild(placeholder);

        if (!docs.length && typeof window.fetchSavedSqlList === "function") {
            window.fetchSavedSqlList();
        }

        docs.forEach(function(item) {
            select.appendChild(this._select_element(item, selectedId));
        }, this);
    }

    _handle_sql_change() {
        const select = document.getElementById(this.activityId + "_sql_select");
        const selectedId = select ? select.value : "";
        this._selectedSqlId = selectedId;
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
        title.textContent = "SQL";
        header.appendChild(title);

        const subtitle = document.createElement("div");
        subtitle.className = "activity-settings-subtitle";
        subtitle.textContent = "Run a saved SQL query as one parallel step.";
        header.appendChild(subtitle);
        section.appendChild(header);

        const field = document.createElement("div");
        field.className = "activity-settings-field";

        const label = document.createElement("label");
        label.textContent = "SQL";
        label.htmlFor = this.activityId + "_sql_select";
        field.appendChild(label);

        const controlRow = document.createElement("div");
        controlRow.className = "activity-settings-row";

        const select = document.createElement("select");
        select.className = "item_select activity-settings-select";
        select.name = "sql_id";
        select.id = this.activityId + "_sql_select";
        select.dataset.activityType = "sql";
        this._populate_select(select);
        select.addEventListener("change", () => {
            this._handle_sql_change();
        });
        controlRow.appendChild(select);

        field.appendChild(controlRow);
        section.appendChild(field);

        div.appendChild(section);
        return div;
    }

    get_operation_settings() {
        const select = document.getElementById(this.activityId + "_sql_select");
        const docs = this._get_sql_docs();
        const selectedId = select ? select.value : "";
        let selectedName = "";
        docs.some(function(item) {
            if (item.sql_id === selectedId) {
                selectedName = item.name || item.sql_id || "";
                return true;
            }
            return false;
        });
        this._selectedSqlId = selectedId;
        const settings = {
            sql: {
                sql_id: selectedId,
                name: selectedName
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
        const select = document.getElementById(this.activityId + "_sql_select");
        if (select) {
            this._populate_select(select);
        }
        const selectedId = select ? select.value : "";
        this._selectedSqlId = selectedId;
    }
}

window.refreshSqlActivityOptions = function(docs) {
    const selects = document.querySelectorAll("select[data-activity-type='sql']");
    selects.forEach(function(select) {
        const selectedId = select.value;
        select.innerHTML = "";
        const placeholder = document.createElement("option");
        placeholder.value = "";
        placeholder.textContent = docs.length ? "Select SQL" : "No SQL docs available";
        select.appendChild(placeholder);
        docs.forEach(function(item) {
            const option = document.createElement("option");
            option.value = item.sql_id || "";
            option.textContent = item.name || item.sql_id || "Untitled SQL";
            select.appendChild(option);
        });
        if (selectedId) {
            select.value = selectedId;
        }
    });
};
