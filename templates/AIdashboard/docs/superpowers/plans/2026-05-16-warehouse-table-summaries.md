# Warehouse Computed Table Summaries Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every structured warehouse upload (CSV, TSV, XLSX, JSON array) an accurate computed statistics summary that is embedded for semantic search and fed into the agent's SQL prompt, and make JSON arrays SQL-queryable.

**Architecture:** A new pure-Python `_whse_table_stats(rows)` counts statistics over already-parsed rows (no LLM, no Spark). Its output drives three things: a factual summary text that becomes the document's embedding (replacing the raw row dump for tabular docs), a richer "QUERYABLE TABLES" prompt block so the agent writes correct SQL, and — for JSON arrays — a new conversion path so they register as Spark tables like CSVs.

**Tech Stack:** Python 3, Flask app in a single `app.py`, pytest for pure-function unit tests, honcho-supervised services + curl/Python smoke tests for integration.

**Repos / paths:**
- Backend code: `/home/dpalacios/local-server/server/app.py`
- Tests: `/home/dpalacios/local-server/tests/`
- Spec: `/home/dpalacios/home-server/templates/AIdashboard/docs/superpowers/specs/2026-05-16-warehouse-table-summaries-design.md`

**Conventions the engineer must know:**
- The whole codebase lives in one file, `app.py` (~50k lines). All new functions go into it.
- Warehouse helpers are prefixed `_whse_`. Add the new pure functions immediately after `_whse_rows_to_text` (which ends near line 3287), before `def _whse_extract`.
- `rows` everywhere means a list of lists of strings: `rows[0]` is the header, `rows[1:]` are data rows. CSV and XLSX extraction already coerce every cell to a string.
- Restart services with: `cd /home/dpalacios && pkill -f "honcho start"; (nohup honcho start > /tmp/honcho.log 2>&1 < /dev/null &)` then wait ~30s and check `ss -tlnp | grep -cE ':5000|:9030|:9000'` returns `3`.
- A warehouse API bearer token (account `test_whfolders_e2e`) for smoke tests: `wh_Hd7lbeZ-LCpMaL5NSU989YtNcXWHstOWlbhskEKuGO0`. The proxy at `https://localhost:9030` is HTTPS (use `curl -sk`).
- Commits: `cd /home/dpalacios/local-server && git -c user.name=dpalacios commit ...`. The repo uses no special hooks; a CRLF warning on `app.py` is normal.

---

### Task 1: `_whse_table_stats` and its type-inference helpers

The core artifact. Pure functions — full TDD with pytest.

**Files:**
- Modify: `/home/dpalacios/local-server/server/app.py` (add functions after `_whse_rows_to_text`, before `def _whse_extract`)
- Test: `/home/dpalacios/local-server/tests/test_whse_table_summaries.py` (create)

- [ ] **Step 1: Create the test file with import scaffolding and the first failing test**

Create `/home/dpalacios/local-server/tests/test_whse_table_summaries.py`:

```python
"""Unit tests for the warehouse computed-table-summary pure helpers.

Mocks pyspark + google.cloud.storage so importing app.py does not spin
up Spark or contact GCS. The functions under test are pure (no I/O)."""
import os
import sys
from unittest import mock

import pytest

SERVER_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "server")
if SERVER_DIR not in sys.path:
    sys.path.insert(0, SERVER_DIR)


@pytest.fixture(scope="module")
def app():
    """Import server.app with Spark + GCS stubbed."""
    if "app" in sys.modules:
        del sys.modules["app"]
    mock_spark = mock.MagicMock()
    sys.modules["pyspark"] = mock_spark
    sys.modules["pyspark.sql"] = mock_spark.sql
    mock_storage = mock.MagicMock()
    sys.modules["google.cloud.storage"] = mock_storage
    import app as app_module
    return app_module


def test_table_stats_counts_rows_exactly(app):
    rows = [["name", "qty"], ["a", "1"], ["b", "2"], ["c", "3"]]
    stats = app._whse_table_stats(rows)
    assert stats["row_count"] == 3
    assert stats["stats_source"] == "full"
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /home/dpalacios/local-server && python3 -m pytest tests/test_whse_table_summaries.py -v`
Expected: FAIL with `AttributeError: module 'app' has no attribute '_whse_table_stats'`

- [ ] **Step 3: Implement the helpers and `_whse_table_stats`**

In `app.py`, immediately after `_whse_rows_to_text` (ends ~line 3287) and before `def _whse_extract`, add:

```python
_WHSE_DATE_FORMATS = [
    ("%Y-%m-%d", "YYYY-MM-DD"),
    ("%m/%d/%Y", "MM/DD/YYYY"),
    ("%d/%m/%Y", "DD/MM/YYYY"),
    ("%Y/%m/%d", "YYYY/MM/DD"),
]


def _whse_is_number(value):
    """True when value parses as a plain number. Strict: '$1,234' and
    '1,234' are NOT numbers (conservative — ambiguous stays text)."""
    try:
        float(str(value).strip())
        return True
    except (ValueError, TypeError):
        return False


def _whse_parse_date(value):
    """Return (iso_date, format_label) for a recognised date string,
    else None. The first matching format in _WHSE_DATE_FORMATS wins."""
    s = str(value).strip()
    for fmt, label in _WHSE_DATE_FORMATS:
        try:
            dt = datetime.strptime(s, fmt)
            return (dt.strftime("%Y-%m-%d"), label)
        except ValueError:
            continue
    return None


def _whse_infer_col_type(values):
    """Classify a column ('number' | 'date' | 'text') from its non-null
    string values. number/date require EVERY value to match; date also
    requires one consistent format. Ambiguous falls back to 'text'."""
    svals = [str(v).strip() for v in values if str(v).strip() != ""]
    if not svals:
        return "text"
    if all(_whse_is_number(v) for v in svals):
        return "number"
    fmts = set()
    for v in svals:
        parsed = _whse_parse_date(v)
        if parsed is None:
            return "text"
        fmts.add(parsed[1])
    return "date" if len(fmts) == 1 else "text"


def _whse_table_stats(rows, sample_cap=50000):
    """Compute accurate per-column statistics for a list-of-rows table
    by counting — no LLM, no Spark. rows[0] is the header. For tables
    with more than sample_cap data rows, statistics are computed over
    the first sample_cap rows and stats_source is 'sample' (the
    queryable Spark table still holds the full data)."""
    from collections import Counter
    if not rows or len(rows) < 2:
        return {"row_count": max(0, len(rows) - 1) if rows else 0,
                "stats_source": "full", "columns": [], "sample_rows": []}
    header = [(c or "").strip() or f"col_{i + 1}"
              for i, c in enumerate(rows[0])]
    data = rows[1:]
    total = len(data)
    if total > sample_cap:
        data = data[:sample_cap]
        stats_source = "sample"
    else:
        stats_source = "full"
    columns = []
    for ci, name in enumerate(header):
        values = [(r[ci] if ci < len(r) else "") for r in data]
        non_null = [v for v in values
                    if v is not None and str(v).strip() != ""]
        col = {"name": name,
               "type": _whse_infer_col_type(non_null),
               "null_count": len(values) - len(non_null)}
        if col["type"] == "number":
            nums = [float(str(v).strip()) for v in non_null]
            if nums:
                col["min"] = min(nums)
                col["max"] = max(nums)
                col["mean"] = round(sum(nums) / len(nums), 4)
        elif col["type"] == "date":
            parsed = sorted(_whse_parse_date(v) for v in non_null)
            if parsed:
                col["earliest"] = parsed[0][0]
                col["latest"] = parsed[-1][0]
                col["date_format"] = parsed[0][1]
        else:
            counts = Counter(str(v) for v in non_null)
            col["distinct_count"] = len(counts)
            col["top_values"] = [[v, n] for v, n in counts.most_common(5)]
        columns.append(col)
    sample_rows = [
        {header[i]: (r[i] if i < len(r) else "")
         for i in range(len(header))}
        for r in data[:3]
    ]
    out = {"row_count": total, "stats_source": stats_source,
           "columns": columns, "sample_rows": sample_rows}
    if stats_source == "sample":
        out["sample_size"] = sample_cap
    return out
```

Note: `datetime` is already imported at the top of `app.py` (`from datetime import datetime` is used throughout — verify with `grep -n "^from datetime" app.py`; if it is `import datetime` adjust `datetime.strptime` to `datetime.datetime.strptime`).

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd /home/dpalacios/local-server && python3 -m pytest tests/test_whse_table_summaries.py -v`
Expected: PASS

- [ ] **Step 5: Add the remaining `_whse_table_stats` tests**

Append to `tests/test_whse_table_summaries.py`:

```python
def test_table_stats_numeric_column(app):
    rows = [["price"], ["10"], ["20"], ["30"]]
    col = app._whse_table_stats(rows)["columns"][0]
    assert col["type"] == "number"
    assert col["min"] == 10.0
    assert col["max"] == 30.0
    assert col["mean"] == 20.0


def test_table_stats_text_column_top_values(app):
    rows = [["product"], ["A"], ["A"], ["A"], ["B"], ["B"], ["C"]]
    col = app._whse_table_stats(rows)["columns"][0]
    assert col["type"] == "text"
    assert col["distinct_count"] == 3
    assert col["top_values"][0] == ["A", 3]


def test_table_stats_date_column(app):
    rows = [["d"], ["2026-07-01"], ["2026-09-30"], ["2026-08-15"]]
    col = app._whse_table_stats(rows)["columns"][0]
    assert col["type"] == "date"
    assert col["earliest"] == "2026-07-01"
    assert col["latest"] == "2026-09-30"
    assert col["date_format"] == "YYYY-MM-DD"


def test_table_stats_null_count(app):
    rows = [["x"], ["1"], [""], ["3"], ["  "]]
    col = app._whse_table_stats(rows)["columns"][0]
    assert col["null_count"] == 2


def test_table_stats_mixed_column_is_text(app):
    rows = [["v"], ["1"], ["hello"], ["2026-07-01"]]
    col = app._whse_table_stats(rows)["columns"][0]
    assert col["type"] == "text"


def test_table_stats_sampling_large_table(app):
    rows = [["n"]] + [[str(i)] for i in range(120000)]
    stats = app._whse_table_stats(rows, sample_cap=50000)
    assert stats["row_count"] == 120000
    assert stats["stats_source"] == "sample"
    assert stats["sample_size"] == 50000


def test_table_stats_empty_table(app):
    assert app._whse_table_stats([])["columns"] == []
    assert app._whse_table_stats([["h"]])["row_count"] == 0


def test_table_stats_sample_rows(app):
    rows = [["a", "b"], ["1", "x"], ["2", "y"], ["3", "z"], ["4", "w"]]
    sample = app._whse_table_stats(rows)["sample_rows"]
    assert len(sample) == 3
    assert sample[0] == {"a": "1", "b": "x"}
```

- [ ] **Step 6: Run all Task 1 tests**

Run: `cd /home/dpalacios/local-server && python3 -m pytest tests/test_whse_table_summaries.py -v`
Expected: PASS (9 tests)

- [ ] **Step 7: Commit**

```bash
cd /home/dpalacios/local-server
git add server/app.py tests/test_whse_table_summaries.py
git -c user.name=dpalacios commit -m "feat(warehouse): _whse_table_stats computed table statistics"
```

---

### Task 2: `_whse_format_table_summary`

Turns a stats dict into factual summary text. Pure — full TDD.

**Files:**
- Modify: `/home/dpalacios/local-server/server/app.py` (add after `_whse_table_stats`)
- Test: `/home/dpalacios/local-server/tests/test_whse_table_summaries.py`

- [ ] **Step 1: Write the failing tests**

Append to `tests/test_whse_table_summaries.py`:

```python
def test_format_summary_includes_row_count_and_columns(app):
    rows = [["product", "price"], ["A", "10"], ["B", "20"]]
    stats = app._whse_table_stats(rows)
    text = app._whse_format_table_summary("sales.csv", "main", stats)
    assert "sales.csv" in text
    assert "2 rows" in text
    assert "product" in text and "price" in text
    assert "ranges 10.0 to 20.0" in text


def test_format_summary_notes_sample(app):
    rows = [["n"]] + [[str(i)] for i in range(60000)]
    stats = app._whse_table_stats(rows, sample_cap=50000)
    text = app._whse_format_table_summary("big.csv", "main", stats)
    assert "50,000-row sample" in text


def test_format_summary_uses_sheet_label(app):
    stats = app._whse_table_stats([["x"], ["1"]])
    text = app._whse_format_table_summary("book.xlsx", "Q3", stats)
    assert '"Q3"' in text
```

- [ ] **Step 2: Run to verify failure**

Run: `cd /home/dpalacios/local-server && python3 -m pytest tests/test_whse_table_summaries.py -k format_summary -v`
Expected: FAIL with `AttributeError: ... '_whse_format_table_summary'`

- [ ] **Step 3: Implement `_whse_format_table_summary`**

In `app.py`, immediately after `_whse_table_stats`, add:

```python
def _whse_format_table_summary(doc_name, label, stats):
    """Render a stats dict (from _whse_table_stats) into factual
    summary text for embedding. Every line traces to a counted
    number — no LLM involved."""
    lines = []
    if label and label != "main":
        lines.append(f'Data table "{label}" from "{doc_name}".')
    else:
        lines.append(f'Data table from "{doc_name}".')
    lines.append(f"{stats.get('row_count', 0):,} rows.")
    cols = stats.get("columns") or []
    lines.append(f"Columns ({len(cols)}):")
    for c in cols:
        ctype = c.get("type")
        line = f"- {c['name']} ({ctype})"
        if ctype == "number" and c.get("min") is not None:
            line += (f": ranges {c['min']} to {c['max']}, "
                     f"mean {c['mean']}")
        elif ctype == "date" and c.get("earliest"):
            line += f": from {c['earliest']} to {c['latest']}"
        elif ctype == "text":
            line += f": {c.get('distinct_count', 0):,} distinct values"
            top = c.get("top_values") or []
            if top:
                joined = ", ".join(f'"{v}" ({n})' for v, n in top[:3])
                line += f"; most common: {joined}"
        if c.get("null_count"):
            line += f" ({c['null_count']:,} empty)"
        lines.append(line)
    sample = stats.get("sample_rows") or []
    if sample:
        lines.append("First rows:")
        for row in sample:
            lines.append("  " + " · ".join(
                f"{k}={str(v)[:40]}" for k, v in row.items()))
    if stats.get("stats_source") == "sample":
        lines.append(f"(Statistics based on a "
                     f"{stats.get('sample_size', 0):,}-row sample; "
                     f"queries run on the full table.)")
    lines.append("This table can be queried with SQL for counts, "
                 "sums, filters, and group-bys.")
    return "\n".join(lines)
```

- [ ] **Step 4: Run to verify the tests pass**

Run: `cd /home/dpalacios/local-server && python3 -m pytest tests/test_whse_table_summaries.py -v`
Expected: PASS (12 tests)

- [ ] **Step 5: Commit**

```bash
cd /home/dpalacios/local-server
git add server/app.py tests/test_whse_table_summaries.py
git -c user.name=dpalacios commit -m "feat(warehouse): _whse_format_table_summary stats-to-text"
```

---

### Task 3: `_whse_json_to_rows`

Converts a JSON array of objects into tabular rows and decides queryability. Pure — full TDD.

**Files:**
- Modify: `/home/dpalacios/local-server/server/app.py` (add after `_whse_format_table_summary`)
- Test: `/home/dpalacios/local-server/tests/test_whse_table_summaries.py`

- [ ] **Step 1: Write the failing tests**

Append to `tests/test_whse_table_summaries.py`:

```python
def test_json_to_rows_consistent_objects(app):
    recs = [{"name": "A", "qty": 1}, {"name": "B", "qty": 2}]
    rows, queryable = app._whse_json_to_rows(recs)
    assert queryable is True
    assert rows[0] == ["name", "qty"]
    assert rows[1] == ["A", "1"]
    assert rows[2] == ["B", "2"]


def test_json_to_rows_missing_keys_filled(app):
    recs = [{"a": 1, "b": 2}, {"a": 3}]
    rows, queryable = app._whse_json_to_rows(recs)
    assert queryable is True
    assert rows[2] == ["3", ""]


def test_json_to_rows_nested_value_stringified(app):
    recs = [{"a": {"x": 1}}, {"a": {"x": 2}}]
    rows, queryable = app._whse_json_to_rows(recs)
    assert queryable is True
    assert rows[1][0] == '{"x": 1}'


def test_json_to_rows_non_objects_not_queryable(app):
    rows, queryable = app._whse_json_to_rows([1, 2, 3])
    assert queryable is False
    assert rows == []


def test_json_to_rows_disjoint_shapes_not_queryable(app):
    recs = [{"a": 1}, {"b": 2}, {"c": 3}, {"d": 4}, {"e": 5}]
    rows, queryable = app._whse_json_to_rows(recs)
    assert queryable is False


def test_json_to_rows_empty_not_queryable(app):
    assert app._whse_json_to_rows([]) == ([], False)
```

- [ ] **Step 2: Run to verify failure**

Run: `cd /home/dpalacios/local-server && python3 -m pytest tests/test_whse_table_summaries.py -k json_to_rows -v`
Expected: FAIL with `AttributeError: ... '_whse_json_to_rows'`

- [ ] **Step 3: Implement `_whse_json_to_rows`**

In `app.py`, immediately after `_whse_format_table_summary`, add:

```python
def _whse_json_to_rows(recs):
    """Convert a JSON array of records into a list-of-rows table
    (rows[0] = header). Returns (rows, queryable). queryable is False
    when records are not all objects, there are no keys, or shapes
    barely overlap (the most common key appears in < 60% of records).
    Nested object/array values are stringified into the cell."""
    from collections import Counter
    if not recs or not all(isinstance(r, dict) for r in recs):
        return ([], False)
    header = []
    key_counts = Counter()
    for r in recs:
        for k in r.keys():
            if k not in header:
                header.append(k)
            key_counts[k] += 1
    if not header:
        return ([], False)
    if key_counts.most_common(1)[0][1] < 0.6 * len(recs):
        return ([], False)
    rows = [list(header)]
    for r in recs:
        row = []
        for k in header:
            v = r.get(k, "")
            if isinstance(v, (dict, list)):
                v = json.dumps(v)
            elif v is None:
                v = ""
            row.append(str(v))
        rows.append(row)
    return (rows, True)
```

Note: `json` is already imported at the top of `app.py`.

- [ ] **Step 4: Run to verify the tests pass**

Run: `cd /home/dpalacios/local-server && python3 -m pytest tests/test_whse_table_summaries.py -v`
Expected: PASS (18 tests)

- [ ] **Step 5: Commit**

```bash
cd /home/dpalacios/local-server
git add server/app.py tests/test_whse_table_summaries.py
git -c user.name=dpalacios commit -m "feat(warehouse): _whse_json_to_rows JSON-array to table rows"
```

---

### Task 4: Enrich the agent's QUERYABLE TABLES prompt block

`_whse_agent_table_schema(tables)` (`app.py:4224`) currently renders column names plus 1-2 sample values. When a table carries a `table_stats` dict, render rich per-column lines instead. Pure given its input — testable.

**Files:**
- Modify: `/home/dpalacios/local-server/server/app.py:4224-4253`
- Test: `/home/dpalacios/local-server/tests/test_whse_table_summaries.py`

- [ ] **Step 1: Write the failing test**

Append to `tests/test_whse_table_summaries.py`:

```python
def test_agent_table_schema_uses_stats_when_present(app):
    rows = [["product", "revenue"], ["Widget A", "100"],
            ["Widget B", "200"]]
    stats = app._whse_table_stats(rows)
    tables = [{
        "table_name": "sales", "whse_doc_name": "Q3.csv",
        "row_count": 2, "columns": ["product", "revenue"],
        "table_stats": stats,
    }]
    block = app._whse_agent_table_schema(tables)
    assert "kb_sales" in block
    assert "revenue" in block and "range" in block
    assert "Widget A" in block  # real distinct value, not a guess


def test_agent_table_schema_empty(app):
    assert app._whse_agent_table_schema([]) == ""
```

- [ ] **Step 2: Run to verify failure**

Run: `cd /home/dpalacios/local-server && python3 -m pytest tests/test_whse_table_summaries.py -k agent_table_schema -v`
Expected: FAIL — `test_agent_table_schema_uses_stats_when_present` fails because the current renderer ignores `table_stats` and produces no "range" text.

- [ ] **Step 3: Add a stats renderer and use it in `_whse_agent_table_schema`**

In `app.py`, immediately before `def _whse_agent_table_schema` (line 4224), add a helper:

```python
def _whse_stats_columns_line(stats):
    """Rich per-column description lines from a table_stats dict, for
    the agent's QUERYABLE TABLES prompt block. Returns a list of
    indented strings."""
    out = []
    for c in (stats.get("columns") or [])[:30]:
        ctype = c.get("type")
        line = f"  - {c['name']}  {ctype}"
        if ctype == "number" and c.get("min") is not None:
            line += f"  range {c['min']}-{c['max']}"
        elif ctype == "date" and c.get("earliest"):
            line += (f"  {c['earliest']} … {c['latest']}"
                     f"  (format: {c.get('date_format', '?')})")
        elif ctype == "text":
            line += f"  {c.get('distinct_count', 0)} distinct"
            top = c.get("top_values") or []
            if top:
                vals = ",".join(f'"{v}"' for v, _ in top[:3])
                line += f"; values: {vals}…"
        if c.get("null_count"):
            line += f"  ({c['null_count']} empty)"
        out.append(line)
    return out
```

Then replace the body of the `for t in tables:` loop in `_whse_agent_table_schema` (lines 4231-4252). The current loop computes `samples`/`col_list` and appends a single line per table. Change it so a table with `table_stats` uses the rich renderer:

```python
    lines = ["=== QUERYABLE TABLES (Spark SQL views) ==="]
    for t in tables:
        stats = t.get("table_stats")
        title = t.get("whse_doc_name") or t.get("title") or ""
        if stats and (stats.get("columns")):
            lines.append(
                f"- view `kb_{t.get('table_name')}` "
                f"(from \"{title}\") · {stats.get('row_count', 0)} rows")
            lines.extend(_whse_stats_columns_line(stats))
            continue
        cols = t.get("columns") or []
        try:
            samples = _kb_table_sample_values(t)
        except Exception:
            samples = None
        if samples:
            parts = []
            for c in cols[:25]:
                vals = samples.get(c) or []
                if vals:
                    parts.append(f"{c} (e.g. "
                                  f"{', '.join(repr(v) for v in vals[:2])})")
                else:
                    parts.append(c)
            col_list = ", ".join(parts) + ("…" if len(cols) > 25 else "")
        else:
            col_list = ", ".join(cols[:25]) + ("…" if len(cols) > 25 else "")
        lines.append(
            f"- view `kb_{t.get('table_name')}` "
            f"(from \"{title}\") · "
            f"{t.get('row_count', 0)} rows · columns: {col_list}")
    return "\n".join(lines)
```

The non-stats branch is the existing behavior verbatim — kept as the fallback for tables not yet backfilled.

- [ ] **Step 4: Run to verify the tests pass**

Run: `cd /home/dpalacios/local-server && python3 -m pytest tests/test_whse_table_summaries.py -v`
Expected: PASS (20 tests)

- [ ] **Step 5: Verify no syntax error in app.py**

Run: `cd /home/dpalacios/local-server/server && python3 -c "import ast; ast.parse(open('app.py').read()); print('OK')"`
Expected: `OK`

- [ ] **Step 6: Commit**

```bash
cd /home/dpalacios/local-server
git add server/app.py tests/test_whse_table_summaries.py
git -c user.name=dpalacios commit -m "feat(warehouse): rich stats in agent QUERYABLE TABLES prompt"
```

---

### Task 5: Register JSON arrays as tables and attach `table_stats`

Extend `_whse_register_tables` (`app.py:3379`) so JSON/NDJSON arrays of objects become Spark tables like CSVs, and so every registered table carries its computed `table_stats` in the registry entry (consumed by Task 4). Integration — verified by smoke test.

**Files:**
- Modify: `/home/dpalacios/local-server/server/app.py:3379-3425`

- [ ] **Step 1: Read the current `_whse_register_tables`**

Read `app.py:3379-3425`. Key facts: it builds `units` (a list of `(label, rows)`), then for each unit converts `rows` to CSV with `_rows_to_csv(rows)` and calls `save_kb_table(account_id, sid, csv_text, ..., extra={...})`. `save_kb_table` already accepts an `extra` dict and stores its keys onto the registry entry.

- [ ] **Step 2: Add JSON handling to the `units` builder**

In `_whse_register_tables`, the `units` are built by a chain of `if fmt in (...)` branches. After the `elif fmt == "xlsx":` branch (which ends near line 3398) and before `for i, (label, rows) in enumerate(units):`, add:

```python
        elif fmt in ("json", "ndjson"):
            text = raw_bytes.decode("utf-8", errors="replace")
            if fmt == "ndjson":
                recs = []
                for line in text.splitlines():
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        recs.append(json.loads(line))
                    except Exception:
                        pass
            else:
                try:
                    parsed = json.loads(text)
                except Exception:
                    parsed = None
                recs = parsed if isinstance(parsed, list) else []
            json_rows, queryable = _whse_json_to_rows(recs)
            if queryable and json_rows:
                units.append((name, json_rows))
```

- [ ] **Step 3: Attach `table_stats` to each registered table**

Inside the `for i, (label, rows) in enumerate(units):` loop, the code computes `csv_text` then calls `save_kb_table(..., extra={...})`. Compute stats from the same `rows` and add them to that `extra` dict. Change the `extra=` argument of the `save_kb_table` call from:

```python
                    extra={"origin": "warehouse",
                           "whse_doc_id": document_id,
                           "whse_doc_name": name,
                           "whse_visibility": _whse_doc_visibility(doc)})
```

to:

```python
                    extra={"origin": "warehouse",
                           "whse_doc_id": document_id,
                           "whse_doc_name": name,
                           "whse_visibility": _whse_doc_visibility(doc),
                           "table_stats": _whse_table_stats(rows)})
```

- [ ] **Step 4: Verify no syntax error**

Run: `cd /home/dpalacios/local-server/server && python3 -c "import ast; ast.parse(open('app.py').read()); print('OK')"`
Expected: `OK`

- [ ] **Step 5: Restart services and smoke-test a JSON upload**

```bash
cd /home/dpalacios && pkill -f "honcho start"; (nohup honcho start > /tmp/honcho.log 2>&1 < /dev/null &)
sleep 32 && ss -tlnp 2>/dev/null | grep -cE ':5000|:9030|:9000'
```
Expected: `3`

Then upload a JSON array and confirm it becomes a queryable table:

```bash
T="wh_Hd7lbeZ-LCpMaL5NSU989YtNcXWHstOWlbhskEKuGO0"
S=$(date +%s)
curl -sk -X POST "https://localhost:9030/api/warehouse/upload?filename=jsontbl_$S.json" \
  -H "Authorization: Bearer $T" -H "Content-Type: application/json" \
  -d '[{"product":"A","revenue":100},{"product":"B","revenue":200},{"product":"A","revenue":50}]'
```
Expected: a `202` JSON response with a `document_id`. Wait ~10s for background processing, then:

```bash
python3 - <<'EOF'
import sys; sys.path.insert(0, '/home/dpalacios/local-server/server')
import app
acct = "test_whfolders_e2e"
tables = app._whse_account_tables(acct)
jt = [t for t in tables if "jsontbl_" in (t.get("whse_doc_name") or "")]
print("RESULT: json tables registered =", len(jt))
if jt:
    print("RESULT: has table_stats =", bool(jt[0].get("table_stats")))
    print("RESULT: columns =", [c["name"] for c in
          (jt[0].get("table_stats") or {}).get("columns", [])])
EOF
```
Expected: `json tables registered = 1`, `has table_stats = True`, `columns = ['product', 'revenue']`.

- [ ] **Step 6: Commit**

```bash
cd /home/dpalacios/local-server
git add server/app.py
git -c user.name=dpalacios commit -m "feat(warehouse): register JSON arrays as tables with stats"
```

---

### Task 6: Wire stats + summary embedding into `_whse_process_document`

For tabular documents, compute stats, store them on the doc, embed the **summary** instead of the raw row dump, and set `processing.queryable`. Integration — verified by smoke test.

**Files:**
- Modify: `/home/dpalacios/local-server/server/app.py:3486-3558` (`_whse_process_document`)

- [ ] **Step 1: Re-read `_whse_process_document`**

Read `app.py:3486-3568`. Key facts: after `_whse_extract` it has `text` (flattened rows) and `schema`; it writes the processed-text blob, then calls `_whse_embed_document(account_id, document_id, version, text)`, then sets `doc["processing"][...]` fields, then for `csv/tsv/xlsx` calls `_whse_unregister_tables` + `_whse_register_tables`.

- [ ] **Step 2: Compute stats and choose the embed text**

In `_whse_process_document`, after the line `schema = result.get("schema")` (≈line 3508) and before the processed-text blob is written, add a block that computes per-table stats and builds the text to embed. Tabular formats are `csv`, `tsv`, `xlsx`, and JSON arrays. For JSON, only treat it as tabular when `_whse_json_to_rows` says queryable.

Add after `schema = result.get("schema")`:

```python
        # Structured-data path: compute accurate statistics and embed a
        # summary instead of the raw row dump. Falls back to the
        # existing full-text path on any error.
        fmt = doc.get("format")
        table_stats_list = []
        embed_text = text
        is_tabular = False
        try:
            if fmt in ("csv", "tsv"):
                rows = _whse_extract_rows_csv(
                    raw_bytes, delimiter="\t" if fmt == "tsv" else ",")
                if len(rows) >= 2:
                    st = _whse_table_stats(rows)
                    table_stats_list.append(st)
                    embed_text = _whse_format_table_summary(
                        doc.get("name") or doc.get("filename") or "table",
                        "main", st)
                    is_tabular = True
            elif fmt == "xlsx":
                parts = []
                for s in _whse_extract_rows_xlsx(raw_bytes):
                    if len(s.get("rows") or []) >= 2:
                        st = _whse_table_stats(s["rows"])
                        table_stats_list.append(st)
                        parts.append(_whse_format_table_summary(
                            doc.get("name") or "table", s["sheet"], st))
                if parts:
                    embed_text = "\n\n".join(parts)
                    is_tabular = True
            elif fmt in ("json", "ndjson"):
                jtext = raw_bytes.decode("utf-8", errors="replace")
                if fmt == "ndjson":
                    jrecs = []
                    for ln in jtext.splitlines():
                        ln = ln.strip()
                        if ln:
                            try:
                                jrecs.append(json.loads(ln))
                            except Exception:
                                pass
                else:
                    try:
                        jparsed = json.loads(jtext)
                    except Exception:
                        jparsed = None
                    jrecs = jparsed if isinstance(jparsed, list) else []
                jrows, jqueryable = _whse_json_to_rows(jrecs)
                if jqueryable and len(jrows) >= 2:
                    st = _whse_table_stats(jrows)
                    table_stats_list.append(st)
                    embed_text = _whse_format_table_summary(
                        doc.get("name") or "table", "main", st)
                    is_tabular = True
        except Exception as exc:
            print(f"[warehouse] stats failed doc={document_id}: {exc!r}",
                  flush=True)
            table_stats_list = []
            embed_text = text
            is_tabular = False
```

- [ ] **Step 3: Embed the chosen text**

Change the embed call. The current line is:

```python
            embed_stats = _whse_embed_document(
                account_id, document_id, version, text)
```

Change the final argument from `text` to `embed_text`:

```python
            embed_stats = _whse_embed_document(
                account_id, document_id, version, embed_text)
```

The processed-text blob written just above still uses the full `text`, so the document preview is unchanged.

- [ ] **Step 4: Store stats and the `queryable` flag on the doc**

After the block that sets `doc["processing"]["..."]` fields and before `doc["status"] = "ready"`, add:

```python
        if is_tabular:
            doc["processing"]["table_stats"] = (
                table_stats_list[0] if len(table_stats_list) == 1
                else table_stats_list)
            doc["processing"]["queryable"] = True
        elif fmt in ("csv", "tsv", "xlsx", "json", "ndjson"):
            doc["processing"]["queryable"] = False
```

(For a multi-sheet XLSX `table_stats` is a list; for a single table it is one dict — matching the spec. A JSON array that failed the queryability check leaves `queryable` False and keeps the existing full-text embedding.)

- [ ] **Step 5: Make table registration also cover JSON**

The existing post-processing line registers tables only for `csv/tsv/xlsx`:

```python
        if doc.get("format") in ("csv", "tsv", "xlsx"):
            _whse_unregister_tables(account_id, document_id)
            _whse_register_tables(account_id, doc, raw_bytes)
```

Change the format tuple to include JSON so JSON arrays get registered (Task 5 made `_whse_register_tables` handle them; a non-queryable JSON simply produces no `units` and registers nothing):

```python
        if doc.get("format") in ("csv", "tsv", "xlsx", "json", "ndjson"):
            _whse_unregister_tables(account_id, document_id)
            _whse_register_tables(account_id, doc, raw_bytes)
```

- [ ] **Step 6: Verify no syntax error**

Run: `cd /home/dpalacios/local-server/server && python3 -c "import ast; ast.parse(open('app.py').read()); print('OK')"`
Expected: `OK`

- [ ] **Step 7: Restart and smoke-test a CSV upload end to end**

```bash
cd /home/dpalacios && pkill -f "honcho start"; (nohup honcho start > /tmp/honcho.log 2>&1 < /dev/null &)
sleep 32 && ss -tlnp 2>/dev/null | grep -cE ':5000|:9030|:9000'
```
Expected: `3`

Upload a CSV with known content (3 rows; revenue sum = 350):

```bash
T="wh_Hd7lbeZ-LCpMaL5NSU989YtNcXWHstOWlbhskEKuGO0"
S=$(date +%s)
printf 'product,revenue\nWidget A,100\nWidget B,200\nWidget A,50\n' > /tmp/known_$S.csv
curl -sk -X POST "https://localhost:9030/api/warehouse/upload?filename=known_$S.csv" \
  -H "Authorization: Bearer $T" -H "Content-Type: text/csv" \
  --data-binary @/tmp/known_$S.csv
```
Expected: `202` with a `document_id`. Wait ~12s, then inspect the doc and its embedding:

```bash
python3 - <<'EOF'
import sys; sys.path.insert(0, '/home/dpalacios/local-server/server')
import app
acct = "test_whfolders_e2e"
docs = [d for d in app._whse_all_docs(acct)
        if "known_" in (d.get("filename") or "")]
d = sorted(docs, key=lambda x: x.get("uploaded_at",""))[-1]
proc = d.get("processing") or {}
print("RESULT: status =", d.get("status"))
print("RESULT: queryable =", proc.get("queryable"))
ts = proc.get("table_stats") or {}
print("RESULT: row_count =", ts.get("row_count"))
rev = [c for c in ts.get("columns", []) if c["name"] == "revenue"]
print("RESULT: revenue col =", rev[0] if rev else None)
bundle = app._whse_load_embed_bundle(acct, d["document_id"],
                                     int(d.get("version") or 1))
chunks = (bundle or {}).get("chunks") or []
print("RESULT: chunk_count =", len(chunks))
print("RESULT: first chunk starts:", repr((chunks[0]["text"][:60])
      if chunks else ""))
EOF
```
Expected: `status = ready`, `queryable = True`, `row_count = 3`, the revenue column `type` is `number` with `min 50.0 max 200.0`, `chunk_count` is small (1-2, not dozens), and the first chunk text starts with `Data table from "known_...`.

- [ ] **Step 8: Commit**

```bash
cd /home/dpalacios/local-server
git add server/app.py
git -c user.name=dpalacios commit -m "feat(warehouse): embed computed summary for structured uploads"
```

---

### Task 7: One-time backfill for pre-existing tabular documents

Documents processed before this feature have raw-row embeddings and no `table_stats`. Add an idempotent backfill mirroring `_whse_ensure_tables_registered` (`app.py:3456`), gated by a new index flag `summaries_backfill_done`.

**Files:**
- Modify: `/home/dpalacios/local-server/server/app.py` (add a function after `_whse_ensure_tables_registered`, ≈line 3484; call it where `_whse_ensure_tables_registered` is already called)

- [ ] **Step 1: Find where `_whse_ensure_tables_registered` is called**

Run: `cd /home/dpalacios/local-server/server && grep -n "_whse_ensure_tables_registered" app.py`
Note every call site — the new backfill is invoked right after each call (it is on the warehouse chat hot path and must stay a cheap no-op after the first run).

- [ ] **Step 2: Implement `_whse_ensure_summaries_backfilled`**

In `app.py`, immediately after `_whse_ensure_tables_registered` ends (≈line 3484), add:

```python
def _whse_ensure_summaries_backfilled(account_id):
    """One-time, idempotent: for ready tabular documents processed
    before computed summaries existed, recompute table_stats, re-embed
    the summary, and store stats on the doc. Gated by an index flag so
    it is a free no-op on every call after the first."""
    idx = _whse_load_index(account_id)
    if idx.get("summaries_backfill_done"):
        return
    for doc in _whse_all_docs(account_id):
        did = doc.get("document_id")
        fmt = doc.get("format")
        if (doc.get("status") != "ready"
                or fmt not in ("csv", "tsv", "xlsx", "json", "ndjson")):
            continue
        if (doc.get("processing") or {}).get("table_stats"):
            continue  # already has computed stats
        try:
            version = int(doc.get("version") or 1)
            raw = get_storage_client().bucket(BUCKET_NAME).blob(
                _whse_raw_path(account_id, did, version,
                               doc.get("filename") or "file")
                ).download_as_bytes()
            # Reprocessing recomputes stats, re-embeds the summary, and
            # re-registers tables — the same path a fresh upload takes.
            _whse_process_document(account_id, did)
        except Exception as exc:
            print(f"[warehouse] summary backfill failed {did}: {exc!r}",
                  flush=True)
    idx = _whse_load_index(account_id)
    idx["summaries_backfill_done"] = True
    _whse_save_index(account_id, idx)
```

(Note: `_whse_process_document` re-reads the raw blob itself, so the `raw` download above is only the existence/permission probe; if you prefer, drop the `raw =` line and call `_whse_process_document` directly inside the `try`. Keep the `try/except` either way.)

- [ ] **Step 3: Call the backfill alongside `_whse_ensure_tables_registered`**

At each call site found in Step 1, add a call to `_whse_ensure_summaries_backfilled(account_id)` on the line immediately after the existing `_whse_ensure_tables_registered(account_id)` call, with the same indentation.

- [ ] **Step 4: Verify no syntax error**

Run: `cd /home/dpalacios/local-server/server && python3 -c "import ast; ast.parse(open('app.py').read()); print('OK')"`
Expected: `OK`

- [ ] **Step 5: Restart and verify the flag is set after a warehouse query**

```bash
cd /home/dpalacios && pkill -f "honcho start"; (nohup honcho start > /tmp/honcho.log 2>&1 < /dev/null &)
sleep 32 && ss -tlnp 2>/dev/null | grep -cE ':5000|:9030|:9000'
```
Expected: `3`. Then trigger the warehouse path and check the flag:

```bash
python3 - <<'EOF'
import sys; sys.path.insert(0, '/home/dpalacios/local-server/server')
import app
acct = "test_whfolders_e2e"
app._whse_ensure_summaries_backfilled(acct)
idx = app._whse_load_index(acct)
print("RESULT: summaries_backfill_done =", idx.get("summaries_backfill_done"))
# second call must be a no-op (flag already set)
app._whse_ensure_summaries_backfilled(acct)
print("RESULT: idempotent second call OK")
EOF
```
Expected: `summaries_backfill_done = True` and `idempotent second call OK`.

- [ ] **Step 6: Commit**

```bash
cd /home/dpalacios/local-server
git add server/app.py
git -c user.name=dpalacios commit -m "feat(warehouse): one-time backfill of computed table summaries"
```

---

### Task 8: End-to-end verification and regression

No code changes — proof that the feature works and nothing regressed.

**Files:** none (verification only)

- [ ] **Step 1: Run the full pure-function test suite**

Run: `cd /home/dpalacios/local-server && python3 -m pytest tests/test_whse_table_summaries.py -v`
Expected: PASS (20 tests).

- [ ] **Step 2: Aggregation accuracy — the 5-year-old test**

With services running, upload the known CSV from Task 6 Step 7 (revenue: 100, 200, 50 → total 350; top product "Widget A" with 150). Ask the warehouse agent a computation question and confirm it ran SQL with a correct result:

```bash
T="wh_Hd7lbeZ-LCpMaL5NSU989YtNcXWHstOWlbhskEKuGO0"
S=$(date +%s)
printf 'product,revenue\nWidget A,100\nWidget B,200\nWidget A,50\n' > /tmp/agg_$S.csv
curl -sk -X POST "https://localhost:9030/api/warehouse/upload?filename=agg_$S.csv" \
  -H "Authorization: Bearer $T" -H "Content-Type: text/csv" \
  --data-binary @/tmp/agg_$S.csv
sleep 14
python3 - <<'EOF'
import sys; sys.path.insert(0, '/home/dpalacios/local-server/server')
import app
acct = "test_whfolders_e2e"
out = app._whse_answer(acct, "What is our total revenue?", [])
print("RESULT: answer =", out.get("answer"))
print("RESULT: sql =", out.get("sql"))
print("RESULT: tables =", out.get("tables"))
EOF
```
Expected: the SQL is a real `SELECT SUM(revenue) ...` (or equivalent) against a `kb_...` view, and the answer states **350** (or `$350`). Capture the actual SQL and answer text as proof. If the answer is right but cites no SQL, the build has failed the core promise — halt.

- [ ] **Step 2b: "What's in our data?" returns the summary, not raw rows**

```bash
python3 - <<'EOF'
import sys; sys.path.insert(0, '/home/dpalacios/local-server/server')
import app
acct = "test_whfolders_e2e"
out = app._whse_answer(acct, "What columns are in the agg file?", [])
print("RESULT: answer =", out.get("answer"))
EOF
```
Expected: the answer names the `product` and `revenue` columns — drawn from the summary chunk.

- [ ] **Step 3: JSON queryability**

Upload the JSON array from Task 5 Step 5, wait ~12s, then ask an aggregation against it via `_whse_answer`. Expected: a `SELECT ... FROM kb_...` query runs and returns a correct number (e.g. total revenue 350 for `[{"product":"A","revenue":100},{"product":"B","revenue":200},{"product":"A","revenue":50}]`).

- [ ] **Step 4: Non-queryable JSON falls back cleanly**

```bash
T="wh_Hd7lbeZ-LCpMaL5NSU989YtNcXWHstOWlbhskEKuGO0"
S=$(date +%s)
curl -sk -X POST "https://localhost:9030/api/warehouse/upload?filename=msg_$S.json" \
  -H "Authorization: Bearer $T" -H "Content-Type: application/json" \
  -d '[{"a":1},{"b":2},{"c":3},{"d":4},{"e":5}]'
sleep 12
python3 - <<'EOF'
import sys; sys.path.insert(0, '/home/dpalacios/local-server/server')
import app
acct = "test_whfolders_e2e"
d = sorted([x for x in app._whse_all_docs(acct)
            if "msg_" in (x.get("filename") or "")],
           key=lambda x: x.get("uploaded_at",""))[-1]
proc = d.get("processing") or {}
print("RESULT: status =", d.get("status"))
print("RESULT: queryable =", proc.get("queryable"))
EOF
```
Expected: `status = ready`, `queryable = False`, no crash.

- [ ] **Step 5: Regression — a PDF is untouched**

Upload any small PDF via the dashboard or API. Confirm the doc reaches `status = ready`, `processing.queryable` is absent or False, no `table_stats`, and it is still retrievable by text search (ask the warehouse a question about its content). Expected: unchanged behavior — the PDF uses the full-text embedding path.

- [ ] **Step 6: Regression — existing warehouse features**

Confirm these still work: warehouse upload (done above), `/replace` (re-upload a same-named CSV), the document list endpoint (`GET /api/warehouse/documents`), folders, and the API token auth. Spot-check via the dashboard warehouse page that documents list and open normally.

- [ ] **Step 7: Final commit (if any verification fixes were needed)**

If Steps 1-6 required no code changes, there is nothing to commit. If a fix was needed, commit it with a clear message describing the fix.

---

## Notes for the executor

- **Tasks 1-4 are pure functions** — true TDD with pytest. **Tasks 5-7 are integration** — verified by smoke tests against the running honcho stack, because they need GCS, embeddings, and Spark.
- After Tasks 5, 6, and 7 you must restart honcho for the change to take effect — the smoke-test steps include the restart.
- The single hard requirement: when the agent answers a data question, it must run real SQL and the number must be correct. An answer that is right but cites no SQL, or statistics that do not match a hand calculation, means the build is broken — halt and report rather than working around it.
- If `datetime` is imported as a module (`import datetime`) rather than the class (`from datetime import datetime`), adjust `datetime.strptime` / `datetime.utcnow` references in the new code accordingly. Check with `grep -n "^import datetime\|^from datetime" app.py` before Task 1 Step 3.
