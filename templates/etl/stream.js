class Stream_Activity extends Activity {
    constructor(flowchart, activity) {
        super(flowchart, activity);
        this._wsSession = null;
        this._wsUrl = "";
        this._sqlEditor = null;
        this._streamSessionId = "";
        this._streamTableData = [];
        this._streamTableColumns = [];
        this._streamTableFilters = { key: "", value: "" };
        this._streamTableSort = { key: null, dir: 1 };
        this._streamTables = [];
        this._streamChartRows = [];
        this._streamChartWindowMs = 5000;
        this._chart = null;
        this._chartControls = null;
        this._autoFetchTimer = null;
        this._fetchInFlight = false;
        this.settings = this.get_settings_element();
    }

    _get_saved_url() {
        const settings = this.activity && this.activity.settings;
        if (settings && settings.stream && settings.stream.url) {
            return settings.stream.url;
        }
        return 'wss://' + window.location.host + '/connect';
    }

    _get_current_url() {
        const input = document.getElementById(this.activityId + "_stream_url");
        return input ? input.value : this._get_saved_url();
    }

    _get_saved_sql() {
        const settings = this.activity && this.activity.settings;
        if (settings && settings.stream && settings.stream.sql) {
            return settings.stream.sql;
        }
        return "";
    }

    _normalize_stream_url(url) {
        if (!url) {
            return "";
        }
        const trimmed = url.trim();
        if (trimmed.startsWith("https://")) {
            return "wss://" + trimmed.slice("https://".length);
        }
        if (trimmed.startsWith("http://")) {
            return "ws://" + trimmed.slice("http://".length);
        }
        return trimmed;
    }

    _handle_stream_change() {
        this.get_operation_settings();
    }

    _handle_stream_message(payload) {
        if (!payload || typeof payload !== "object") {
            return;
        }
        const nowMs = Number(payload.utime) ? Number(payload.utime) * 1000 : Date.now();
        const cutoffMs = nowMs - this._streamChartWindowMs;
        const row = {
            timestamp: payload.timestamp || "",
            avg_fitness: payload.avg_fitness,
            avg_adjusted_fitness: payload.avg_adjusted_fitness,
            total_population: payload.total_population,
            utime: payload.utime
        };
        this._streamChartRows.push(row);
        this._streamChartRows = this._streamChartRows.filter((entry) => {
            if (entry && typeof entry.utime === "number") {
                return entry.utime * 1000 >= cutoffMs;
            }
            if (entry && typeof entry.utime === "string") {
                const asNumber = Number(entry.utime);
                if (!Number.isNaN(asNumber)) {
                    return asNumber * 1000 >= cutoffMs;
                }
            }
            if (entry && entry.timestamp) {
                const parsed = Date.parse(entry.timestamp);
                if (!Number.isNaN(parsed)) {
                    return parsed >= cutoffMs;
                }
            }
            return true;
        });
        // Websocket updates should not drive the chart; keep these for other UI use.
    }

    _disconnect_stream() {
        if (this._wsSession && this._wsSession.session) {
            try {
                this._wsSession.session.onmessage = null;
                this._wsSession.session.onopen = null;
                this._wsSession.session.onclose = null;
                if (this._wsSession.session.readyState === WebSocket.OPEN ||
                    this._wsSession.session.readyState === WebSocket.CONNECTING) {
                    this._wsSession.session.close(1000, "client disconnect");
                }
            } catch (error) {
                console.warn("Unable to close stream session", error);
            }
        }
        this._wsSession = null;
        this._wsUrl = "";
        this._stop_auto_fetch();
    }

    _format_stream_value(value) {
        if (value == null) {
            return "";
        }
        if (Array.isArray(value)) {
            return JSON.stringify(value);
        }
        if (typeof value === "object") {
            return JSON.stringify(value);
        }
        return String(value);
    }

    _render_stream_table(data) {
        if (!this._streamTableBody) {
            return;
        }
        const table = this._streamTableBody.closest("table");
        const thead = table ? table.querySelector("thead") : null;
        const headRow = thead ? thead.querySelector("tr") : null;
        this._streamTableBody.innerHTML = "";
        if (!headRow) {
            return;
        }
        const normalized = this._normalize_stream_table_data(data);
        this._streamTableData = normalized.rows;
        this._streamTableColumns = normalized.columns;
        if (this._streamTableFilterRow) {
            this._streamTableFilterRow.style.display = this._streamTableColumns.length ? "flex" : "none";
        }
        this._update_stream_table_filter_columns();
        this._build_stream_table_header(headRow);
        this._render_stream_table_rows();
    }

    _parse_stream_query(statement) {
        if (!statement) {
            return null;
        }
        const lines = statement.split("\n");
        let title = "";
        const sqlLines = [];
        lines.forEach((line) => {
            const trimmed = line.trim();
            if (trimmed.startsWith("--")) {
                if (!title) {
                    title = trimmed.slice(2).trim();
                }
                return;
            }
            if (trimmed.length) {
                sqlLines.push(line);
            }
        });
        const sql = sqlLines.join("\n").trim();
        if (!sql) {
            return null;
        }
        return title ? { sql: sql, title: title } : { sql: sql };
    }

    _update_stream_table_title(wrapper, title) {
        const existing = wrapper.querySelector(".stream-table-title");
        if (title) {
            if (existing) {
                existing.textContent = title;
            } else {
                const heading = document.createElement("div");
                heading.className = "stream-table-title";
                heading.textContent = title;
                wrapper.prepend(heading);
            }
        } else if (existing) {
            existing.remove();
        }
    }

    _normalize_stream_table_data(data) {
        if (!data) {
            return { rows: [], columns: [] };
        }
        if (Array.isArray(data)) {
            if (data.length === 0) {
                return { rows: [], columns: [] };
            }
            if (Array.isArray(data[0])) {
                return {
                    rows: [{ Value: JSON.stringify(data) }],
                    columns: ["Value"]
                };
            }
            if (typeof data[0] === "object" && data[0] !== null) {
                const columns = [];
                const seen = new Set();
                data.forEach((row) => {
                    if (!row || typeof row !== "object") {
                        return;
                    }
                    Object.keys(row).forEach((key) => {
                        if (!seen.has(key)) {
                            seen.add(key);
                            columns.push(key);
                        }
                    });
                });
                return { rows: data, columns: columns };
            }
            const rows = data.map((item, index) => ({
                Index: index + 1,
                Value: this._format_stream_value(item)
            }));
            return { rows: rows, columns: ["Index", "Value"] };
        }
        if (typeof data === "object") {
            const rows = Object.keys(data).map((key) => ({
                Field: key,
                Value: this._format_stream_value(data[key])
            }));
            return { rows: rows, columns: ["Field", "Value"] };
        }
        return { rows: [{ Value: this._format_stream_value(data) }], columns: ["Value"] };
    }

    _render_stream_tables(tables) {
        if (!this._streamTableBody) {
            return;
        }
        this._streamTables = Array.isArray(tables) ? tables : [];
        const tableSection = this._streamTableBody.closest(".stream-table");
        if (!tableSection) {
            return;
        }
        const grid = tableSection.closest(".stream-table-grid");
        if (!grid) {
            return;
        }
        const existing = grid.querySelectorAll(".stream-table");
        existing.forEach((item) => item.remove());
        const first = tables[0];
        if (!first) {
            return;
        }
        const firstWrapper = document.createElement("div");
        firstWrapper.className = "stream-table";
        const firstTable = document.createElement("table");
        firstTable.className = "table-resizable";
        const firstHead = document.createElement("thead");
        const firstHeadRow = document.createElement("tr");
        firstHead.appendChild(firstHeadRow);
        const firstBody = document.createElement("tbody");
        firstTable.appendChild(firstHead);
        firstTable.appendChild(firstBody);
        firstWrapper.appendChild(firstTable);
        grid.appendChild(firstWrapper);
        const previousBody = this._streamTableBody;
        const previousFilterSelect = this._streamTableFilterSelect;
        const previousFilterRow = this._streamTableFilterRow;
        this._streamTableBody = firstBody;
        this._update_stream_table_title(firstWrapper, first.title ? first.title : "");
        this._render_stream_table(first && Object.prototype.hasOwnProperty.call(first, "data") ? first.data : first);
        for (let i = 1; i < tables.length; i += 1) {
            const item = tables[i];
            const wrapper = document.createElement("div");
            wrapper.className = "stream-table stream-table--secondary";
            this._update_stream_table_title(wrapper, item && item.title ? item.title : "");
            const table = document.createElement("table");
            table.className = "table-resizable";
            const thead = document.createElement("thead");
            const headRow = document.createElement("tr");
            thead.appendChild(headRow);
            const tbody = document.createElement("tbody");
            table.appendChild(thead);
            table.appendChild(tbody);
            wrapper.appendChild(table);
            grid.appendChild(wrapper);
            const previousBody = this._streamTableBody;
            const previousFilterSelect = this._streamTableFilterSelect;
            const previousFilterRow = this._streamTableFilterRow;
            this._streamTableBody = tbody;
            this._streamTableFilterSelect = null;
            this._streamTableFilterRow = null;
            this._render_stream_table(item && Object.prototype.hasOwnProperty.call(item, "data") ? item.data : item);
            this._streamTableBody = previousBody;
            this._streamTableFilterSelect = previousFilterSelect;
            this._streamTableFilterRow = previousFilterRow;
        }
        this._streamTableBody = firstBody;
        this._streamTableFilterSelect = previousFilterSelect;
        this._streamTableFilterRow = previousFilterRow;
    }

    _build_stream_table_header(headRow) {
        headRow.innerHTML = "";
        this._streamTableColumns.forEach((key) => {
            const th = document.createElement("th");
            const headerWrap = document.createElement("div");
            headerWrap.className = "stream-table-header";
            const sortButton = document.createElement("button");
            sortButton.type = "button";
            sortButton.className = "stream-table-sort";
            sortButton.textContent = key;
            const sortIndicator = document.createElement("span");
            sortIndicator.className = "stream-table-sort-indicator";
            if (this._streamTableSort.key === key) {
                sortIndicator.textContent = this._streamTableSort.dir === 1 ? "ASC" : "DESC";
            }
            sortButton.addEventListener("click", () => {
                if (this._streamTableSort.key === key) {
                    this._streamTableSort.dir = this._streamTableSort.dir === 1 ? -1 : 1;
                } else {
                    this._streamTableSort.key = key;
                    this._streamTableSort.dir = 1;
                }
                this._build_stream_table_header(headRow);
                this._render_stream_table_rows();
            });
            headerWrap.appendChild(sortButton);
            headerWrap.appendChild(sortIndicator);
            th.appendChild(headerWrap);
            const resizer = document.createElement("span");
            resizer.className = "column-resizer";
            th.appendChild(resizer);
            headRow.appendChild(th);
        });
        const table = this._streamTableBody.closest("table");
        if (table) {
            this._attach_stream_table_resizers(table);
        }
        this._update_chart_controls();
    }

    _update_stream_table_filter_columns() {
        if (!this._streamTableFilterSelect) {
            return;
        }
        const current = this._streamTableFilters.key;
        this._streamTableFilterSelect.innerHTML = "";
        const emptyOption = document.createElement("option");
        emptyOption.value = "";
        emptyOption.textContent = "Filter column";
        this._streamTableFilterSelect.appendChild(emptyOption);
        this._streamTableColumns.forEach((key) => {
            const option = document.createElement("option");
            option.value = key;
            option.textContent = key;
            this._streamTableFilterSelect.appendChild(option);
        });
        if (current && this._streamTableColumns.includes(current)) {
            this._streamTableFilterSelect.value = current;
        } else {
            this._streamTableFilters.key = "";
            this._streamTableFilterSelect.value = "";
        }
    }

    _collect_stream_table_values(key) {
        const seen = new Set();
        const values = [];
        for (let i = 0; i < this._streamTableData.length; i += 1) {
            const value = this._format_stream_value(this._streamTableData[i][key]);
            if (!seen.has(value)) {
                seen.add(value);
                values.push(value);
            }
            if (values.length >= 50) {
                break;
            }
        }
        return values;
    }

    _render_stream_table_rows() {
        this._streamTableBody.innerHTML = "";
        let rows = this._streamTableData.slice();
        if (this._streamTableFilters.key && this._streamTableFilters.value) {
            const filterKey = this._streamTableFilters.key;
            const filterValue = this._streamTableFilters.value.toLowerCase();
            rows = rows.filter((row) => {
                const cellValue = this._format_stream_value(row[filterKey]).toLowerCase();
                return cellValue.includes(filterValue);
            });
        }
        if (this._streamTableSort.key) {
            const sortKey = this._streamTableSort.key;
            const sortDir = this._streamTableSort.dir;
            rows.sort((a, b) => {
                const valueA = a[sortKey];
                const valueB = b[sortKey];
                const numA = typeof valueA === "number" ? valueA : Number(valueA);
                const numB = typeof valueB === "number" ? valueB : Number(valueB);
                if (!Number.isNaN(numA) && !Number.isNaN(numB)) {
                    return (numA - numB) * sortDir;
                }
                const strA = this._format_stream_value(valueA);
                const strB = this._format_stream_value(valueB);
                return strA.localeCompare(strB) * sortDir;
            });
        }
        rows.forEach((item) => {
            const tr = document.createElement("tr");
            this._streamTableColumns.forEach((key) => {
                const td = document.createElement("td");
                td.textContent = this._format_stream_value(item[key]);
                tr.appendChild(td);
            });
            this._streamTableBody.appendChild(tr);
        });
    }

    _attach_stream_table_resizers(table) {
        const headers = table.querySelectorAll("th");
        headers.forEach((th) => {
            const resizer = th.querySelector(".column-resizer");
            if (!resizer || resizer._streamBound) {
                return;
            }
            resizer._streamBound = true;
            resizer.addEventListener("mousedown", (event) => {
                event.preventDefault();
                const startX = event.clientX;
                const startWidth = th.offsetWidth;
                const onMouseMove = (moveEvent) => {
                    const delta = moveEvent.clientX - startX;
                    th.style.width = Math.max(80, startWidth + delta) + "px";
                };
                const onMouseUp = () => {
                    document.removeEventListener("mousemove", onMouseMove);
                    document.removeEventListener("mouseup", onMouseUp);
                };
                document.addEventListener("mousemove", onMouseMove);
                document.addEventListener("mouseup", onMouseUp);
            });
        });
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
        title.textContent = "Stream";
        header.appendChild(title);

        const subtitle = document.createElement("div");
        subtitle.className = "activity-settings-subtitle";
        subtitle.textContent = "Choose a saved stream to run inside this step.";
        header.appendChild(subtitle);
        section.appendChild(header);

        const field = document.createElement("div");
        field.className = "activity-settings-field";

        const label = document.createElement("label");
        label.textContent = "Stream";
        label.htmlFor = this.activityId + "_stream_url";
        field.appendChild(label);

        const controlRow = document.createElement("div");
        controlRow.className = "activity-settings-row";

        const input = document.createElement("input");
        input.type = "url";
        input.className = "item_select activity-settings-select";
        input.name = "stream_url";
        input.id = this.activityId + "_stream_url";
        input.placeholder = 'wss://' + window.location.host  +'/connect';
        input.value = this._get_saved_url();
        input.addEventListener("input", () => {
            this._handle_stream_change();
        });
        controlRow.appendChild(input);


        const sqlField = document.createElement("div");
        sqlField.className = "activity-settings-field";

        const sqlLabel = document.createElement("label");
        sqlLabel.textContent = "SQL";
        sqlLabel.htmlFor = this.activityId + "_stream_sql";
        sqlField.appendChild(sqlLabel);

        const sqlArea = document.createElement("textarea");
        sqlArea.id = this.activityId + "_stream_sql";
        sqlArea.rows = 8;
        sqlArea.className = "activity-settings-textarea";
        sqlArea.placeholder = "SELECT *\nFROM table\nLIMIT 100;";
        sqlArea.value = this._get_saved_sql();
        sqlArea.style.width = "100%";
        sqlArea.style.minHeight = "180px";
        sqlArea.style.fontFamily = "ui-monospace, SFMono-Regular, Menlo, Consolas, \"Liberation Mono\", monospace";
        sqlArea.style.fontSize = "15px";
        sqlArea.style.lineHeight = "1.4";
        sqlArea.addEventListener("input", () => {
            this._handle_stream_change();
        });
        sqlField.appendChild(sqlArea);
        if (window.CodeMirror && !this._sqlEditor) {
            this._sqlEditor = window.CodeMirror.fromTextArea(sqlArea, {
                mode: "text/x-sql",
                theme: "eclipse",
                lineNumbers: true,
                lineWrapping: true,
                extraKeys: {
                    "Ctrl-/": "toggleComment",
                    "Cmd-/": "toggleComment"
                }
            });
            this._sqlEditor.setSize("100%", "220px");
            this._sqlEditor.on("change", () => {
                this._handle_stream_change();
            });
        }

        const connectButton = document.createElement("button");
        connectButton.type = "button";
        connectButton.className = "buttons activity-settings-button";
        connectButton.textContent = "Connect";
        connectButton.style.background = "linear-gradient(135deg, #10b981, #047857)";
        connectButton.style.color = "#fff";
        connectButton.addEventListener("click", () => {
            const url = this._normalize_stream_url(this._get_current_url());
            if (!url) {
                return;
            }
            console.log("Connecting to stream at URL:", url);
            fetch("/etl/sparkclient/stream/start", {
                method: "POST",
                headers: new Headers({
                    "Accept": "application/json"
                })
            }).catch((error) => {
                console.warn("Stream start failed:", error);
            });
            this._disconnect_stream();
            this._wsSession = new Websocket_Session("neat");
            this._wsUrl = url;
            this._wsSession.initialize(url);
            this._wsSession.session.onmessage = async (event) => {
                let data = JSON.parse(event.data)
                console.log("Message from server ", data);
                this._handle_stream_message(data);
            }
            connectButton.style.display = "none";
            disconnectButton.style.display = "inline-flex";
        });



        const disconnectButton = document.createElement("button");
        disconnectButton.type = "button";
        disconnectButton.className = "buttons activity-settings-button";
        disconnectButton.textContent = "Disconnect";
        disconnectButton.style.background = "linear-gradient(135deg, #ef4444, #b91c1c)";
        disconnectButton.style.color = "#fff";
        disconnectButton.style.display = "none";
        disconnectButton.addEventListener("click", () => {
            this._disconnect_stream();
            this._streamSessionId = "";
            connectButton.style.display = "inline-flex";
            disconnectButton.style.display = "none";
        });

        controlRow.appendChild(connectButton);
        controlRow.appendChild(disconnectButton);
        field.appendChild(controlRow);
        field.appendChild(sqlField);

        const fetchRow = document.createElement("div");
        fetchRow.className = "activity-settings-row";

        const fetchButton = document.createElement("button");
        fetchButton.type = "button";
        fetchButton.className = "buttons activity-settings-button";
        fetchButton.textContent = "Fetch";
        const runFetch = () => {
            this._run_stream_queries();
        };
        fetchButton.addEventListener("click", () => {
            runFetch();
        });

        const autoFetchLabel = document.createElement("label");
        autoFetchLabel.className = "stream-auto-fetch-label";
        const autoFetchCheckbox = document.createElement("input");
        autoFetchCheckbox.type = "checkbox";
        autoFetchCheckbox.className = "stream-auto-fetch-toggle";
        const autoFetchText = document.createElement("span");
        autoFetchText.textContent = "Auto Fetch";
        autoFetchLabel.appendChild(autoFetchCheckbox);
        autoFetchLabel.appendChild(autoFetchText);

        const autoFetchInterval = document.createElement("input");
        autoFetchInterval.type = "number";
        autoFetchInterval.min = "1";
        autoFetchInterval.value = "5";
        autoFetchInterval.className = "stream-auto-fetch-interval";
        autoFetchInterval.title = "Seconds";

        autoFetchCheckbox.addEventListener("change", () => {
            if (autoFetchCheckbox.checked) {
                window.streamAutoFetchActive = true;
                this._start_auto_fetch(runFetch, autoFetchInterval);
            } else {
                window.streamAutoFetchActive = false;
                this._stop_auto_fetch();
            }
        });
        autoFetchInterval.addEventListener("change", () => {
            if (autoFetchCheckbox.checked) {
                this._start_auto_fetch(runFetch, autoFetchInterval);
            }
        });

        fetchRow.appendChild(fetchButton);
        fetchRow.appendChild(autoFetchLabel);
        fetchRow.appendChild(autoFetchInterval);
        field.appendChild(fetchRow);

        const tableSection = document.createElement("div");
        tableSection.className = "activity-settings-field";

        const tableLabel = document.createElement("div");
        tableLabel.className = "stream-table-label";
        tableLabel.textContent = "Stream Data";
        tableSection.appendChild(tableLabel);

        const filterRow = document.createElement("div");
        filterRow.className = "stream-table-filter-row";
        filterRow.style.display = "none";
        const filterSelect = document.createElement("select");
        filterSelect.className = "stream-table-filter-select";
        const filterInput = document.createElement("input");
        filterInput.type = "text";
        filterInput.placeholder = "Filter value";
        filterInput.className = "stream-table-filter-input";
        filterSelect.addEventListener("change", (event) => {
            this._streamTableFilters.key = event.target.value;
            this._render_stream_table_rows();
        });
        filterInput.addEventListener("input", (event) => {
            this._streamTableFilters.value = event.target.value;
            this._render_stream_table_rows();
        });
        filterRow.appendChild(filterSelect);
        filterRow.appendChild(filterInput);
        tableSection.appendChild(filterRow);

        const tableGrid = document.createElement("div");
        tableGrid.className = "stream-table-grid";
        const tableWrap = document.createElement("div");
        tableWrap.className = "stream-table";
        const table = document.createElement("table");
        table.className = "table-resizable";
        const thead = document.createElement("thead");
        const headRow = document.createElement("tr");
        const headKey = document.createElement("th");
        headKey.textContent = "Field";
        const headValue = document.createElement("th");
        headValue.textContent = "Value";
        headRow.appendChild(headKey);
        headRow.appendChild(headValue);
        thead.appendChild(headRow);
        const tbody = document.createElement("tbody");
        table.appendChild(thead);
        table.appendChild(tbody);
        tableWrap.appendChild(table);
        tableGrid.appendChild(tableWrap);
        tableSection.appendChild(tableGrid);
        this._streamTableBody = tbody;
        this._streamTableFilterSelect = filterSelect;
        this._streamTableFilterRow = filterRow;
        section.appendChild(field);
        section.appendChild(tableSection);

        const chartSection = document.createElement("div");
        chartSection.className = "activity-settings-field";

        const chartLabel = document.createElement("div");
        chartLabel.className = "stream-table-label";
        chartLabel.textContent = "Chart";
        chartSection.appendChild(chartLabel);

        const chartControls = document.createElement("div");
        chartControls.className = "stream-chart-controls";

        const tableSelect = document.createElement("select");
        tableSelect.className = "stream-chart-select";
        const chartFilterSelect = document.createElement("select");
        chartFilterSelect.className = "stream-chart-select";
        const chartFilterInput = document.createElement("input");
        chartFilterInput.type = "text";
        chartFilterInput.placeholder = "Filter value";
        chartFilterInput.className = "stream-chart-filter-input";
        const xSelect = document.createElement("select");
        xSelect.className = "stream-chart-select";
        const ySelect = document.createElement("select");
        ySelect.className = "stream-chart-select";
        const typeSelect = document.createElement("select");
        typeSelect.className = "stream-chart-select";
        ["line", "bar"].forEach((type) => {
            const option = document.createElement("option");
            option.value = type;
            option.textContent = type;
            typeSelect.appendChild(option);
        });
        const buildChartField = (labelText, control) => {
            const wrapper = document.createElement("div");
            wrapper.className = "stream-chart-field";
            const label = document.createElement("span");
            label.className = "stream-chart-field-label";
            label.textContent = labelText;
            wrapper.appendChild(label);
            wrapper.appendChild(control);
            return wrapper;
        };

        tableSelect.addEventListener("change", () => {
            this._update_chart_columns();
            this._render_chart();
        });
        chartFilterSelect.addEventListener("change", () => {
            this._render_chart();
        });
        chartFilterInput.addEventListener("input", () => {
            this._render_chart();
        });
        [xSelect, ySelect, typeSelect].forEach((control) => {
            control.addEventListener("change", () => {
                this._render_chart();
            });
        });

        chartControls.appendChild(buildChartField("Table", tableSelect));
        chartControls.appendChild(buildChartField("Filter column", chartFilterSelect));
        chartControls.appendChild(buildChartField("Filter value", chartFilterInput));
        chartControls.appendChild(buildChartField("X axis", xSelect));
        chartControls.appendChild(buildChartField("Y axis", ySelect));
        chartControls.appendChild(buildChartField("Type", typeSelect));
        chartSection.appendChild(chartControls);

        const chartWrap = document.createElement("div");
        chartWrap.className = "stream-chart-panel";
        const chartCanvas = document.createElement("canvas");
        chartCanvas.className = "stream-chart-canvas";
        chartWrap.appendChild(chartCanvas);
        chartSection.appendChild(chartWrap);

        this._chartControls = {
            tableSelect: tableSelect,
            filterSelect: chartFilterSelect,
            filterInput: chartFilterInput,
            xSelect: xSelect,
            ySelect: ySelect,
            typeSelect: typeSelect,
            canvas: chartCanvas
        };

        section.appendChild(chartSection);

        div.appendChild(section);
        return div;
    }



    get_operation_settings() {
        const input = document.getElementById(this.activityId + "_stream_url");
        const sqlArea = document.getElementById(this.activityId + "_stream_sql");
        const url = input ? input.value.trim() : this._get_saved_url();
        const sql = this._sqlEditor ? this._sqlEditor.getValue() : (sqlArea ? sqlArea.value : this._get_saved_sql());
        const settings = {
            stream: {
                url: url,
                sql: sql
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
        const input = document.getElementById(this.activityId + "_stream_url");
        if (input) {
            input.value = this._get_saved_url();
        }
        const sqlArea = document.getElementById(this.activityId + "_stream_sql");
        if (sqlArea) {
            const savedSql = this._get_saved_sql();
            if (this._sqlEditor) {
                this._sqlEditor.setValue(savedSql);
            } else {
                sqlArea.value = savedSql;
            }
        }
    }

    _run_stream_queries() {
        const sqlArea = document.getElementById(this.activityId + "_stream_sql");
        const sql = this._sqlEditor ? this._sqlEditor.getValue() : (sqlArea ? sqlArea.value : "");
        const statements = sql
            .split(";")
            .map((statement) => this._parse_stream_query(statement))
            .filter((statement) => statement && statement.sql);
        const requestBody = JSON.stringify({ queries: statements });
        fetch("/etl/sparkclient/stream/execute", {
            method: "POST",
            headers: new Headers({
                "Accept": "application/json",
                "Content-Type": "application/json"
            }),
            body: requestBody
        }).then((response) => {
            if (!response.ok) {
                throw new Error(response.statusText || "Request failed");
            }
            return response.json();
        }).then((result) => {
            const tables = result && Object.prototype.hasOwnProperty.call(result, "tables")
                ? result.tables
                : [];
            if (!tables.length) {
                const tableData = result && Object.prototype.hasOwnProperty.call(result, "data")
                    ? result.data
                    : result;
                this._streamTables = [];
                this._render_stream_table(tableData);
                this._update_chart_controls();
                return;
            }
            this._streamTables = tables;
            this._render_stream_tables(tables);
            this._update_chart_controls();
        }).catch((error) => {
            console.warn("Stream execute failed:", error);
        });
    }

    _start_auto_fetch(runFetch, intervalInput) {
        const intervalSeconds = Math.max(1, Number(intervalInput.value) || 5);
        intervalInput.value = String(intervalSeconds);
        this._stop_auto_fetch();
        this._autoFetchTimer = setInterval(() => {
            runFetch();
        }, intervalSeconds * 1000);
    }

    _stop_auto_fetch() {
        if (this._autoFetchTimer) {
            clearInterval(this._autoFetchTimer);
            this._autoFetchTimer = null;
        }
        window.streamAutoFetchActive = false;
    }


    _update_chart_controls() {
        if (!this._chartControls) {
            return;
        }
        const tables = Array.isArray(this._streamTables) ? this._streamTables : [];
        const tableSelect = this._chartControls.tableSelect;
        const previousTableValue = tableSelect.value;
        const previousTableText = tableSelect.options.length
            ? tableSelect.options[tableSelect.selectedIndex].textContent
            : "";
        tableSelect.innerHTML = "";
        if (!tables.length) {
            this._render_chart();
            return;
        }
        tables.forEach((table, index) => {
            const title = table && table.title ? table.title : "t" + (index + 1);
            const option = document.createElement("option");
            option.value = String(index);
            option.textContent = title;
            tableSelect.appendChild(option);
        });
        if (previousTableText) {
            const matched = Array.from(tableSelect.options).find((opt) => opt.textContent === previousTableText);
            if (matched) {
                tableSelect.value = matched.value;
            } else if (previousTableValue) {
                tableSelect.value = previousTableValue;
            }
        }
        this._update_chart_columns();
        this._render_chart();
    }

    _update_chart_columns() {
        if (!this._chartControls) {
            return;
        }
        const tableIndex = Number(this._chartControls.tableSelect.value || 0);
        const table = this._streamTables[tableIndex];
        const rows = table && table.data ? table.data : [];
        const columns = [];
        if (rows.length) {
            const seen = new Set();
            rows.forEach((row) => {
                if (!row || typeof row !== "object") {
                    return;
                }
                Object.keys(row).forEach((key) => {
                    if (!seen.has(key)) {
                        seen.add(key);
                        columns.push(key);
                    }
                });
            });
        }
        const xSelect = this._chartControls.xSelect;
        const ySelect = this._chartControls.ySelect;
        const filterSelect = this._chartControls.filterSelect;
        const previousX = xSelect.value;
        const previousY = ySelect.value;
        const previousFilterColumn = filterSelect.value;
        xSelect.innerHTML = "";
        ySelect.innerHTML = "";
        filterSelect.innerHTML = "";
        const filterOption = document.createElement("option");
        filterOption.value = "";
        filterOption.textContent = "Filter column";
        filterSelect.appendChild(filterOption);
        columns.forEach((col, idx) => {
            const optionX = document.createElement("option");
            optionX.value = col;
            optionX.textContent = col;
            xSelect.appendChild(optionX);
            const optionY = document.createElement("option");
            optionY.value = col;
            optionY.textContent = col;
            ySelect.appendChild(optionY);
            const optionFilter = document.createElement("option");
            optionFilter.value = col;
            optionFilter.textContent = col;
            filterSelect.appendChild(optionFilter);
            if (idx === 0) {
                xSelect.value = col;
            }
            if (idx === 1) {
                ySelect.value = col;
            }
        });
        if (columns.length === 1) {
            ySelect.value = columns[0];
        }
        if (previousX && columns.includes(previousX)) {
            xSelect.value = previousX;
        }
        if (previousY && columns.includes(previousY)) {
            ySelect.value = previousY;
        }
        if (previousFilterColumn && columns.includes(previousFilterColumn)) {
            filterSelect.value = previousFilterColumn;
        }
    }

    _render_chart() {
        if (!this._chartControls || !window.Chart) {
            return;
        }
        const tableIndex = Number(this._chartControls.tableSelect.value || 0);
        const table = this._streamTables[tableIndex];
        let rows = table && table.data ? table.data : [];
        if (!rows.length || typeof rows[0] !== "object") {
            if (this._chart) {
                this._chart.destroy();
                this._chart = null;
            }
            return;
        }
        const filterKey = this._chartControls.filterSelect.value;
        const filterValue = this._chartControls.filterInput.value.trim().toLowerCase();
        if (filterKey && filterValue) {
            rows = rows.filter((row) => {
                const cell = this._format_stream_value(row[filterKey]).toLowerCase();
                return cell.includes(filterValue);
            });
        }
        const xKey = this._chartControls.xSelect.value;
        const yKey = this._chartControls.ySelect.value;
        const type = this._chartControls.typeSelect.value || "line";
        rows = rows.slice().sort((a, b) => {
            const aVal = a ? a[xKey] : "";
            const bVal = b ? b[xKey] : "";
            const aNum = Number(aVal);
            const bNum = Number(bVal);
            if (!Number.isNaN(aNum) && !Number.isNaN(bNum)) {
                return aNum - bNum;
            }
            return String(aVal).localeCompare(String(bVal));
        });
        const labels = [];
        const values = [];
        rows.forEach((row) => {
            labels.push(this._format_stream_value(row[xKey]));
            const value = Number(row[yKey]);
            values.push(Number.isNaN(value) ? 0 : value);
        });
        const needsNewChart = !this._chart || this._chart.config.type !== type;
        if (needsNewChart) {
            if (this._chart) {
                this._chart.destroy();
            }
            this._chart = new Chart(this._chartControls.canvas.getContext("2d"), {
                type: type,
                data: {
                    labels: labels,
                    datasets: [{
                        label: yKey,
                        data: values,
                        borderColor: "#2563eb",
                        backgroundColor: "rgba(37, 99, 235, 0.25)",
                        borderWidth: 2,
                        pointRadius: 2,
                        tension: 0.25
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    animation: { duration: 350, easing: "easeOutQuart" },
                    plugins: {
                        legend: { display: true }
                    },
                    scales: {
                        x: { ticks: { maxRotation: 45, minRotation: 0 } },
                        y: { beginAtZero: true }
                    }
                }
            });
            return;
        }

        this._chart.data.labels = labels;
        if (this._chart.data.datasets[0]) {
            this._chart.data.datasets[0].label = yKey;
            this._chart.data.datasets[0].data = values;
        } else {
            this._chart.data.datasets = [{
                label: yKey,
                data: values,
                borderColor: "#2563eb",
                backgroundColor: "rgba(37, 99, 235, 0.25)",
                borderWidth: 2,
                pointRadius: 2,
                tension: 0.25
            }];
        }
        if (this._chart.options) {
            this._chart.options.animation = { duration: 350, easing: "easeOutQuart" };
        }
        this._chart.update("active");
    }
}
