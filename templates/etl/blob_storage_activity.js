/* blob_storage_activity.js — dedicated dataflow activity that reads
 * from a single file already in blob-storage. No upload UI; the user
 * picks a target file via the shared <PathPicker /> in Settings, and
 * the bottom panel's Data Preview tab reads it via Spark on demand.
 *
 * Distinct from Import_Activity because:
 *   - no file dropzone, no client-side parsing of CSV/JSON
 *   - settings shape is a flat { zone, path } stored under
 *     activity.settings.blob_storage (also reads legacy
 *     settings.import.{source_root|zone, path} for forwards-compat
 *     with files saved before this class existed)
 *   - the activity is responsible for telling the Data Preview tab
 *     which path to read, but it does NOT trigger the read itself.
 *     The user clicks Refresh in the Data Preview tab.
 *
 * Persistence shape:
 *   activity.settings.blob_storage = { zone: "raw"|"processed",
 *                                      path: "rel/path.json" }
 */
class BlobStorage_Activity extends Activity {
    constructor(flowchart, activity) {
        super(flowchart, activity);
        this.settings = this.get_settings_element();
    }

    /** Return saved {zone, path} from either the new or legacy shape. */
    _readSavedPath() {
        const s = this.activity && this.activity.settings;
        if (!s) return null;
        const fromNew = s.blob_storage;
        if (fromNew && fromNew.zone && fromNew.path) {
            return { zone: fromNew.zone, path: fromNew.path };
        }
        // Legacy: an Import_Activity saved with source=blob-storage.
        const fromImport = s.import;
        if (fromImport && (fromImport.zone || fromImport.source_root) && fromImport.path) {
            return {
                zone: fromImport.zone || fromImport.source_root,
                path: fromImport.path,
            };
        }
        return null;
    }

    _persist(value) {
        const next = Object.assign({}, this.activity.settings || {});
        if (value) {
            next.blob_storage = { zone: value.zone, path: value.path };
        } else {
            delete next.blob_storage;
        }
        // Drop legacy shape so saves carry only the new structure.
        if (next.import) delete next.import;
        this.activity.settings = next;
        if (this.flowchart && this.flowchart.flowchart) {
            this.flowchart.flowchart('setSettings', this.activityId, next);
        }
        // Notify the Data Preview tab so it can clear stale state.
        try {
            window.dispatchEvent(new CustomEvent('blob-storage:path-changed', {
                detail: { activityId: this.activityId, value: value || null },
            }));
        } catch (e) { /* no-op for old browsers */ }
    }

    get_settings_element() {
        const div = document.createElement('div');
        div.id = this.activityId;

        const helper = document.createElement('p');
        helper.className = 'help';
        helper.style.margin = '0 0 8px';
        helper.textContent = "This activity reads from a file already in blob storage. " +
            "Use another tool (sync, manual upload, separate pipeline) to populate files first.";
        div.appendChild(helper);

        if (typeof window.createPathPicker !== 'function') {
            const err = document.createElement('div');
            err.className = 'help';
            err.style.color = '#b91c1c';
            err.textContent = 'Path picker not loaded — cannot configure this activity.';
            div.appendChild(err);
            return div;
        }

        const saved = this._readSavedPath();
        this._pathPicker = window.createPathPicker({
            label: 'Target File',
            placeholder: 'Pick a file in raw/ or processed/…',
            value: saved,
            selectMode: 'file',
            fileExtensions: ['json', 'csv', 'jsonl'],
            rootZones: ['raw', 'processed'],
            initialPath: saved ? saved.path : '',
            required: true,
            onChange: (v) => this._persist(v),
        });
        div.appendChild(this._pathPicker.element);

        return div;
    }
}

window.BlobStorage_Activity = BlobStorage_Activity;
