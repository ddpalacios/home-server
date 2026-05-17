// SQL Workspace — CodeMirror 6 editor wrapper. Spark SQL dialect,
// syntax highlighting, and an inline linter that flags any non-SELECT
// (DDL/DML) statement. Exposes an imperative API via apiRef so the
// workspace can read/insert text (file click, column click, format).
import React, { useRef, useEffect } from "react";
import { EditorView, basicSetup } from "codemirror";
import { keymap } from "@codemirror/view";
import { sql, SQLDialect } from "@codemirror/lang-sql";
import { linter, lintGutter } from "@codemirror/lint";

const sparkDialect = SQLDialect.define({
  keywords:
    "select from where group by order by limit offset having join inner "
    + "outer left right full cross union intersect except with as distinct "
    + "and or not in is null true false between like ilike on case when "
    + "then else end asc desc over partition",
  builtin:
    "count sum avg min max round abs date_format from_unixtime to_date "
    + "current_date current_timestamp datediff year month day explode "
    + "array_contains coalesce nullif cast concat substring lower upper "
    + "trim length rank row_number dense_rank",
});

// Statements that mutate or define data — the workspace is SELECT-only.
const DANGEROUS = [
  "INSERT", "UPDATE", "DELETE", "DROP", "TRUNCATE",
  "ALTER", "CREATE", "MERGE", "GRANT", "REVOKE", "REPLACE",
];

const sqlLinter = linter((view) => {
  const diags = [];
  const text = view.state.doc.toString();
  for (const kw of DANGEROUS) {
    const re = new RegExp("\\b" + kw + "\\b", "gi");
    let m;
    while ((m = re.exec(text)) !== null) {
      diags.push({
        from: m.index,
        to: m.index + kw.length,
        severity: "error",
        message: kw + " is not allowed — the workspace runs SELECT only.",
      });
    }
  }
  return diags;
});

export default function Editor({ initialDoc, onChange, onRun, apiRef }) {
  const hostRef = useRef(null);
  const cbRef = useRef({ onChange, onRun });
  cbRef.current = { onChange, onRun };

  useEffect(() => {
    const view = new EditorView({
      doc: initialDoc || "",
      parent: hostRef.current,
      extensions: [
        basicSetup,
        sql({ dialect: sparkDialect, upperCaseKeywords: false }),
        lintGutter(),
        sqlLinter,
        keymap.of([{
          key: "Mod-Enter",
          run: () => {
            if (cbRef.current.onRun) cbRef.current.onRun();
            return true;
          },
        }]),
        EditorView.updateListener.of((u) => {
          if (u.docChanged && cbRef.current.onChange) {
            cbRef.current.onChange(u.state.doc.toString());
          }
        }),
        EditorView.theme({
          "&": { height: "100%", fontSize: "13px" },
          ".cm-scroller": { fontFamily: "ui-monospace, Menlo, monospace" },
        }),
      ],
    });
    if (apiRef) {
      apiRef.current = {
        getText: () => view.state.doc.toString(),
        setText: (t) => view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: t || "" },
        }),
        append: (t) => view.dispatch({
          changes: { from: view.state.doc.length, insert: t || "" },
        }),
        insertAtCursor: (t) => {
          const pos = view.state.selection.main.head;
          view.dispatch({
            changes: { from: pos, insert: t || "" },
            selection: { anchor: pos + (t || "").length },
          });
          view.focus();
        },
      };
    }
    return () => {
      view.destroy();
      if (apiRef) apiRef.current = null;
    };
    // Created once — text is driven imperatively through apiRef.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={hostRef} className="sqlw-cm" />;
}
