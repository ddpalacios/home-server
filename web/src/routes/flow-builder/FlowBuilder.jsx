// Milestones 1–3:
//   • Canvas with hardcoded demo nodes (so a fresh user sees structure)
//   • Right-docked Activity Library (Triggers / Actions / Logic)
//   • Drag a card from the library onto the canvas → new node appears
//     at the drop position, and auto-connects to the rightmost open
//     output if there's one open tail (linear case = zero clicks)
//
// React Flow handles pan / zoom / edge routing / minimap. We supply:
//   • A custom "activity" node (matches the dashboard's vertical-timeline
//     card so the visual language is consistent).
//   • A small library renderer + HTML5 drag/drop hook into the canvas.
//   • An auto-connect strategy that finds the rightmost orphan tail.
//
// Tailwind is intentionally NOT used yet — inline CSS keeps the React
// island self-contained until we know the structure is right. Colors
// match the existing dashboard tokens (soft greens, subtle borders).

import React from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  MarkerType,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

// Context for passing the "add next step" callback into custom node
// components. Cleaner than threading callbacks through node.data,
// which would re-render every node on every state change.
const FlowContext = React.createContext({ openChooser: () => {} });

import {
  ACTIVITY_CATALOG, ACTIVITY_BY_ID,
  BRANCH_CONDITIONS, BRANCH_CONDITION_BY_ID,
} from "./activityCatalog.js";

// ── Custom node renderer ────────────────────────────────────────────────
// Big, vibrant, scannable. Color is keyed off activity kind:
//   trigger → emerald (green)
//   action  → sky / blue (wait + text + email)
//   logic   → amber (branch — gets its own renderer)
// At zoom-out the icon + title still read because they're large.
function ActivityCard({ id, data }) {
  const ctx = React.useContext(FlowContext);
  const isOn = !!data.on;
  // Look up theme by activity kind. The catalog has the canonical kind;
  // node.data.kind is a snapshot copied at create time.
  const kind = data.kind || (ACTIVITY_BY_ID[data.activityId]?.kind) || "action";
  const onAddNext = (e) => {
    e.stopPropagation();
    ctx.openChooser({ sourceId: id });
  };
  return (
    <div className={`fb-card fb-kind-${kind} ${isOn ? "is-on" : ""}`}>
      <Handle type="target" position={Position.Left}  id="in"  className="fb-handle" />
      <Handle type="source" position={Position.Right} id="out" className="fb-handle" />
      <div className="fb-card-stripe" aria-hidden="true" />
      <div className="fb-card-row">
        <div className="fb-card-icoring" aria-hidden="true">
          <span>{data.icon}</span>
        </div>
        <div className="fb-card-text">
          <div className="fb-card-title">{data.title}</div>
          {data.cardSub ? (
            <div className="fb-card-sub">{data.cardSub}</div>
          ) : null}
        </div>
        <span className={`fb-card-pill ${isOn ? "is-on" : ""}`}>
          {isOn ? "ON" : "OFF"}
        </span>
      </div>
      <button
        type="button"
        className="fb-next-btn nodrag nopan"
        onClick={onAddNext}
        aria-label="Add the next step"
        title="Add the next step"
      >
        <span aria-hidden="true">+</span>
        <span className="fb-next-btn-l">Next</span>
      </button>
    </div>
  );
}

// ── Branch node ─────────────────────────────────────────────────────────
// Visually split: green "Yes" row on top, gray "No" row on bottom. Each
// row has its own labeled output handle so the user can drag two
// distinct lines without guessing which is which.
function BranchCard({ id, data }) {
  const ctx = React.useContext(FlowContext);
  const cond = BRANCH_CONDITION_BY_ID[data.conditionId] || BRANCH_CONDITIONS[0];
  return (
    <div className="fb-card fb-branch">
      <Handle
        type="target"
        position={Position.Left}
        id="in"
        className="fb-handle fb-handle-in"
      />
      <div className="fb-card-stripe" aria-hidden="true" />
      <div className="fb-card-row">
        <div className="fb-card-icoring" aria-hidden="true">
          <span>🔀</span>
        </div>
        <div className="fb-card-text">
          <div className="fb-card-title">{cond.question}</div>
          <div className="fb-card-sub">Pick a path</div>
        </div>
      </div>
      <div className="fb-branch-paths">
        <div className="fb-branch-path is-yes">
          <span className="fb-branch-path-ico">✓</span>
          <span className="fb-branch-path-l">{cond.yesLabel}</span>
          <button
            type="button"
            className="fb-next-btn fb-next-btn-yes nodrag nopan"
            onClick={(e) => {
              e.stopPropagation();
              ctx.openChooser({ sourceId: id, sourceHandle: "yes" });
            }}
            aria-label="Add the next step on the yes path"
            title="Add the step that runs if YES"
          >
            <span aria-hidden="true">+</span>
            <span className="fb-next-btn-l">Then</span>
          </button>
          <Handle
            type="source"
            position={Position.Right}
            id="yes"
            className="fb-handle fb-handle-yes"
          />
        </div>
        <div className="fb-branch-path is-no">
          <span className="fb-branch-path-ico">✗</span>
          <span className="fb-branch-path-l">{cond.noLabel}</span>
          <button
            type="button"
            className="fb-next-btn fb-next-btn-no nodrag nopan"
            onClick={(e) => {
              e.stopPropagation();
              ctx.openChooser({ sourceId: id, sourceHandle: "no" });
            }}
            aria-label="Add the next step on the no path"
            title="Add the step that runs if NO"
          >
            <span aria-hidden="true">+</span>
            <span className="fb-next-btn-l">Else</span>
          </button>
          <Handle
            type="source"
            position={Position.Right}
            id="no"
            className="fb-handle fb-handle-no"
          />
        </div>
      </div>
    </div>
  );
}

const NODE_TYPES = { activity: ActivityCard, branch: BranchCard };

// ── Activity Library (right-docked, collapsible) ────────────────────────
function LibraryItem({ activity, disabled, comingSoon, alreadyOnCanvas }) {
  const onDragStart = (e) => {
    if (disabled || comingSoon) { e.preventDefault(); return; }
    if (alreadyOnCanvas) { e.preventDefault(); return; }
    e.dataTransfer.setData("application/reactflow", activity.id);
    e.dataTransfer.effectAllowed = "move";
  };
  const isLocked = disabled || comingSoon || alreadyOnCanvas;
  return (
    <div
      className={`fb-lib-item ${isLocked ? "is-locked" : ""}`}
      draggable={!isLocked}
      onDragStart={onDragStart}
      title={
        comingSoon ? "Coming in a future milestone"
        : alreadyOnCanvas ? "Already on your flow"
        : "Drag onto the canvas"
      }
    >
      <span className="fb-lib-ico" aria-hidden="true">{activity.icon}</span>
      <div className="fb-lib-text">
        <div className="fb-lib-title">{activity.title}</div>
        <div className="fb-lib-sub">{activity.description}</div>
      </div>
      {comingSoon && <span className="fb-lib-badge fb-lib-badge-soon">Soon</span>}
      {alreadyOnCanvas && !comingSoon && (
        <span className="fb-lib-badge fb-lib-badge-added">Added</span>
      )}
    </div>
  );
}

function FlowLibrary({ canvasActivityIds, collapsed, onToggle, onUseTemplate }) {
  const triggers = ACTIVITY_CATALOG.filter(a => a.kind === "trigger");
  const actions  = ACTIVITY_CATALOG.filter(a => a.kind === "action");
  const logic    = ACTIVITY_CATALOG.filter(a => a.kind === "logic");

  return (
    <aside className={`fb-library ${collapsed ? "is-collapsed" : ""}`}>
      <header className="fb-library-h">
        <div>
          <div className="fb-library-h-title">Add a step</div>
          <div className="fb-library-h-sub">Drag any card onto your flow.</div>
        </div>
        <button
          type="button"
          className="fb-library-toggle"
          onClick={onToggle}
          aria-label={collapsed ? "Show library" : "Hide library"}
        >
          {collapsed ? "‹" : "›"}
        </button>
      </header>
      {!collapsed && onUseTemplate && (
        <button
          type="button"
          className="fb-library-tpl-btn"
          onClick={onUseTemplate}
        >
          ✨ Use a template
        </button>
      )}
      {!collapsed && (
        <div className="fb-library-body">
          <section className="fb-library-section">
            <h3 className="fb-library-section-h">Lifecycle moments</h3>
            <p className="fb-library-section-sub">
              Pick what kicks the flow off. One per moment.
            </p>
            {triggers.map(a => (
              <LibraryItem
                key={a.id}
                activity={a}
                alreadyOnCanvas={canvasActivityIds.has(a.id)}
              />
            ))}
          </section>
          <section className="fb-library-section">
            <h3 className="fb-library-section-h">Building blocks</h3>
            <p className="fb-library-section-sub">
              Drop these in anywhere. You can add as many as you want.
            </p>
            {actions.map(a => (
              <LibraryItem key={a.id} activity={a} />
            ))}
          </section>
          <section className="fb-library-section">
            <h3 className="fb-library-section-h">Branching</h3>
            <p className="fb-library-section-sub">Send people down different paths.</p>
            {logic.map(a => (
              <LibraryItem key={a.id} activity={a} comingSoon={a.comingSoon} />
            ))}
          </section>
        </div>
      )}
    </aside>
  );
}

// ── Initial canvas: empty by default. The first-load template picker
// (centered overlay) walks the user through picking a starting flow.
const INITIAL_NODES = [];
const INITIAL_EDGES = [];

// Built-in starter templates. Each defines a chain of activity ids; we
// turn it into actual nodes + edges (linear, evenly-spaced) when
// applied. Branching templates ("Full hustle") render linearly until
// milestone 6 wires up the If/Then node.
const TEMPLATES = [
  {
    id: "starter",
    icon: "🆕",
    title: "Brand new business",
    sub: "Basic 5-step flow: greet, confirm, ping yourself, thank, win back.",
    activityIds: [
      "first_contact",
      "job_onboarding",
      "during_job",
      "after_job",
      "win_back",
    ],
  },
  {
    id: "hustle",
    icon: "💪",
    title: "The full hustle",
    sub: "8 steps: greet, estimate, chase the quote, do the job, ask for a review.",
    activityIds: [
      "first_contact",
      "estimate_onboarding",
      "quote_followup",
      "wait",
      "job_onboarding",
      "during_job",
      "after_job",
      "win_back",
    ],
  },
  {
    id: "reminders",
    icon: "🔧",
    title: "Just job reminders",
    sub: "Minimal — only booking confirmation, mid-job pings, and a thank-you.",
    activityIds: [
      "job_onboarding",
      "during_job",
      "after_job",
    ],
  },
  {
    id: "blank",
    icon: "✨",
    title: "Start blank",
    sub: "An empty canvas. Drag steps from the library on your own.",
    activityIds: [],
  },
];

// Build nodes + edges for a template. Spaced 380px apart on a single row
// so React Flow's fitView centers the chain nicely on first paint.
function buildFromTemplate(template) {
  const SPACING_X = 380;
  const Y = 200;
  const newNodes = template.activityIds.map((aid, i) => {
    const activity = ACTIVITY_BY_ID[aid];
    if (!activity) return null;
    const id = `${aid}_${shortId()}`;
    const nodeType = activity.kind === "logic" ? "branch" : "activity";
    return {
      id,
      type: nodeType,
      position: { x: 60 + i * SPACING_X, y: Y },
      data: {
        activityId: aid,
        kind: activity.kind,
        icon: activity.icon,
        title: activity.title,
        cardSub: activity.cardSub || "",
        description: activity.description,
        trigger: activity.trigger || "",
        on: false,
        mode: activity.defaultMode || "email",
        subject: activity.defaultSubject || "",
        body: activity.defaultBody || "",
        waitDays: activity.defaultDurationDays || 1,
        conditionId: activity.defaultConditionId || BRANCH_CONDITIONS[0].id,
      },
    };
  }).filter(Boolean);
  const newEdges = [];
  for (let i = 0; i < newNodes.length - 1; i++) {
    newEdges.push({
      id: `e-${newNodes[i].id}-${newNodes[i + 1].id}`,
      source: newNodes[i].id,
      target: newNodes[i + 1].id,
      animated: true,
      style: { stroke: "#16a34a", strokeWidth: 2.5 },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: "#16a34a",
        width: 18,
        height: 18,
      },
    });
  }
  return { nodes: newNodes, edges: newEdges };
}

// ── "What comes next?" chooser ──────────────────────────────────────────
// Triggered by the "+" buttons on every card (and by branches' Then /
// Else buttons). Pure click-to-add: no drag required.
function NextStepChooser({ source, canvasActivityIds, onPick, onClose }) {
  // Esc closes.
  React.useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Triggers + actions can both be a "next step." The library shows
  // them grouped — same idea here.
  const triggers = ACTIVITY_CATALOG.filter(a => a.kind === "trigger");
  const actions  = ACTIVITY_CATALOG.filter(a => a.kind === "action");
  const logic    = ACTIVITY_CATALOG.filter(a => a.kind === "logic");

  const ChooseRow = ({ a }) => {
    const dup = a.oneOfAKind && canvasActivityIds.has(a.id);
    return (
      <button
        key={a.id}
        type="button"
        className={`fb-chooser-row ${dup ? "is-locked" : ""}`}
        disabled={dup}
        onClick={() => !dup && onPick(a.id)}
        title={dup ? "Already on your flow" : ""}
      >
        <span className="fb-chooser-ico" aria-hidden="true">{a.icon}</span>
        <span className="fb-chooser-text">
          <span className="fb-chooser-name">{a.title}</span>
          <span className="fb-chooser-sub">{a.description}</span>
        </span>
        {dup && <span className="fb-chooser-badge">Added</span>}
      </button>
    );
  };

  // Headline tells the user what they're hooking up — esp. clear for
  // branches where the source handle decides the path.
  let headline = "What comes next?";
  if (source && source.sourceHandle === "yes") headline = "Then what? (the yes path)";
  if (source && source.sourceHandle === "no")  headline = "Else what? (the no path)";

  return (
    <div className="fb-chooser-bg" onClick={onClose}>
      <div
        className="fb-chooser-card"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="fb-chooser-h">
          <h2 className="fb-chooser-title">{headline}</h2>
          <button type="button" className="fb-chooser-x"
                  onClick={onClose} aria-label="Cancel">×</button>
        </header>
        <div className="fb-chooser-body">
          <section className="fb-chooser-section">
            <h3 className="fb-chooser-section-h">Lifecycle moments</h3>
            {triggers.map(a => <ChooseRow key={a.id} a={a} />)}
          </section>
          <section className="fb-chooser-section">
            <h3 className="fb-chooser-section-h">Building blocks</h3>
            {actions.map(a => <ChooseRow key={a.id} a={a} />)}
          </section>
          <section className="fb-chooser-section">
            <h3 className="fb-chooser-section-h">Branching</h3>
            {logic.map(a => <ChooseRow key={a.id} a={a} />)}
          </section>
        </div>
      </div>
    </div>
  );
}

function TemplatePicker({ onPick, onDismiss }) {
  return (
    <div className="fb-tpl-bg">
      <div className="fb-tpl-card" role="dialog" aria-modal="true">
        <header className="fb-tpl-h">
          <h2 className="fb-tpl-title">Pick a starting flow</h2>
          <p className="fb-tpl-sub">
            We'll set up a few steps you can tweak. You can change anything later.
          </p>
        </header>
        <div className="fb-tpl-grid">
          {TEMPLATES.map(t => (
            <button
              key={t.id}
              type="button"
              className={`fb-tpl-pick ${t.id === "blank" ? "is-blank" : ""}`}
              onClick={() => (t.id === "blank" ? onDismiss() : onPick(t))}
            >
              <div className="fb-tpl-pick-ico" aria-hidden="true">{t.icon}</div>
              <div className="fb-tpl-pick-text">
                <div className="fb-tpl-pick-name">{t.title}</div>
                <div className="fb-tpl-pick-sub">{t.sub}</div>
                {t.activityIds.length > 0 && (
                  <div className="fb-tpl-pick-count">
                    {t.activityIds.length} step{t.activityIds.length === 1 ? "" : "s"}
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Merge tags ──────────────────────────────────────────────────────────
// Friendly chips the user can click to insert at the cursor. Example
// values are used in the live preview so the user sees a real-feeling
// message instead of {first_name} {service_type} placeholder soup.
const MERGE_TAGS = [
  { token: "{first_name}",     label: "First name",   sample: "Sam" },
  { token: "{service_type}",   label: "Service",      sample: "the kitchen sink" },
  { token: "{appointment_at}", label: "Appointment",  sample: "Friday at 10am" },
  { token: "{owner_name}",     label: "Your name",    sample: "Pat" },
  { token: "{review_link}",    label: "Review link",  sample: "g.page/r/your-shop" },
  { token: "{phone}",          label: "Their phone",  sample: "(555) 123-4567" },
];

function applyMergeTags(text) {
  let out = String(text || "");
  for (const t of MERGE_TAGS) {
    out = out.split(t.token).join(t.sample);
  }
  return out;
}

// Insert a token at the textarea's current cursor position. Falls back
// to appending at the end if the textarea isn't focused.
function insertTokenAtCursor(textareaRef, value, setValue, token) {
  const ta = textareaRef.current;
  if (!ta) {
    setValue((value || "") + token);
    return;
  }
  const start = ta.selectionStart ?? value.length;
  const end   = ta.selectionEnd   ?? value.length;
  const next  = (value || "").slice(0, start) + token + (value || "").slice(end);
  setValue(next);
  // Restore focus and put the cursor right after the inserted token.
  requestAnimationFrame(() => {
    if (ta) {
      ta.focus();
      const pos = start + token.length;
      ta.setSelectionRange(pos, pos);
    }
  });
}

// ── Phone preview (iMessage / Mail-style) ───────────────────────────────
function PhonePreview({ mode, subject, body, fromName }) {
  const renderedBody = applyMergeTags(body || "");
  const renderedSubject = applyMergeTags(subject || "");
  return (
    <div className="fb-phone">
      <div className="fb-phone-notch" />
      <div className="fb-phone-screen">
        <div className="fb-phone-statusbar">
          <span>9:41</span>
          <span>● ● ●</span>
        </div>
        {mode === "email" ? (
          <div className="fb-phone-mail">
            <div className="fb-phone-mail-from">
              <strong>{fromName || "Your business"}</strong>
            </div>
            <div className="fb-phone-mail-subject">
              {renderedSubject || <span className="fb-phone-empty">(subject)</span>}
            </div>
            <div className="fb-phone-mail-body">
              {renderedBody || <span className="fb-phone-empty">(empty)</span>}
            </div>
          </div>
        ) : mode === "sms" ? (
          <div className="fb-phone-sms">
            <div className="fb-phone-sms-from">
              {fromName || "Your business"}
            </div>
            <div className="fb-phone-sms-bubble">
              {renderedBody || <span className="fb-phone-empty">(type a message)</span>}
            </div>
          </div>
        ) : mode === "wait" ? (
          <div className="fb-phone-wait">
            <div className="fb-phone-wait-ico">⏱️</div>
            <div className="fb-phone-wait-h">Nothing happens here</div>
            <div className="fb-phone-wait-p">
              We just pause before the next step.
            </div>
          </div>
        ) : (
          <div className="fb-phone-wait">
            <div className="fb-phone-wait-h">No preview</div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Reply Widget preview (right side of drawer) ────────────────────────
// Shows the timeline visually so the user can sanity-check what they
// configured: 3 reminders followed by AI or custom takeover.
function _fmtMinutes(m) {
  m = parseInt(m, 10) || 0;
  if (m % 1440 === 0) {
    const d = m / 1440;
    return d + " day" + (d === 1 ? "" : "s");
  }
  if (m % 60 === 0) {
    const h = m / 60;
    return h + " hour" + (h === 1 ? "" : "s");
  }
  return m + " min";
}

function ReplyPhonePreview({
  fallback, useGlobalCadence,
  firstReminderMinutes, secondReminderMinutes, takeoverMinutes,
  customBody, globalAiMode,
}) {
  const finalLabel = fallback === "ai"
    ? (globalAiMode === "i_respond" ? "AI off — stops" : "AI replies")
    : "My message sends";
  const renderedBody = applyMergeTags(customBody || "");
  const r1 = useGlobalCadence ? "global" : _fmtMinutes(firstReminderMinutes);
  const r2 = useGlobalCadence ? "global" : _fmtMinutes(secondReminderMinutes);
  const rT = useGlobalCadence ? "global" : _fmtMinutes(takeoverMinutes);
  return (
    <div className="fb-rwprev">
      <div className="fb-rwprev-h">How this plays out</div>
      <ol className="fb-rwprev-timeline">
        <li>
          <span className="fb-rwprev-dot is-cust" />
          <div>
            <strong>They write back</strong>
          </div>
        </li>
        <li>
          <span className="fb-rwprev-dot" />
          <div>
            <strong>Nudge 1</strong>
            <span>{r1}</span>
          </div>
        </li>
        <li>
          <span className="fb-rwprev-dot" />
          <div>
            <strong>Nudge 2</strong>
            <span>{r2}</span>
          </div>
        </li>
        <li>
          <span className={`fb-rwprev-dot ${fallback === "ai" ? "is-ai" : "is-custom"}`} />
          <div>
            <strong>{finalLabel}</strong>
            <span>{rT}</span>
          </div>
        </li>
      </ol>
      {fallback === "custom" && (
        <div className="fb-rwprev-custom">
          <div className="fb-rwprev-custom-h">Preview</div>
          <div className="fb-rwprev-custom-body">
            {renderedBody || <span className="fb-phone-empty">(write your message)</span>}
          </div>
        </div>
      )}
      <p className="fb-helper" style={{ textAlign: "center", marginTop: 12 }}>
        Reply yourself anytime → nudges stop.
      </p>
    </div>
  );
}

// ── Message editor drawer ───────────────────────────────────────────────
function MessageEditorDrawer({ node, activity, onChange, onClose, onDelete }) {
  // Local state mirrors node.data so typing is responsive; we propagate
  // every change up via onChange so the canvas card + preview stay in sync.
  const data = node.data || {};
  const canBeSms = !!activity.canBeSms;
  const isWait = activity.defaultMode === "wait";
  const isBranch = activity.kind === "logic";
  const isReply = activity.defaultMode === "reply";

  const [mode, setMode] = React.useState(
    data.mode || activity.defaultMode || "email");
  const [subject, setSubject] = React.useState(
    data.subject != null ? data.subject : (activity.defaultSubject || ""));
  const [body, setBody] = React.useState(
    data.body != null ? data.body : (activity.defaultBody || ""));
  const [waitDays, setWaitDays] = React.useState(
    data.waitDays != null ? data.waitDays : (activity.defaultDurationDays || 1));
  const [conditionId, setConditionId] = React.useState(
    data.conditionId || activity.defaultConditionId || BRANCH_CONDITIONS[0].id);
  // Reply Widget state — only meaningful when isReply.
  const [fallback, setFallback] = React.useState(
    data.fallback || activity.defaultFallback || "ai");
  const [useGlobalCadence, setUseGlobalCadence] = React.useState(
    data.useGlobalCadence != null ? !!data.useGlobalCadence
      : (activity.defaultUseGlobalCadence !== false));
  const [firstReminderMinutes, setFirstReminderMinutes] = React.useState(
    data.firstReminderMinutes != null ? data.firstReminderMinutes
      : (activity.defaultFirstReminderMinutes || 30));
  const [secondReminderMinutes, setSecondReminderMinutes] = React.useState(
    data.secondReminderMinutes != null ? data.secondReminderMinutes
      : (activity.defaultSecondReminderMinutes || 120));
  const [takeoverMinutes, setTakeoverMinutes] = React.useState(
    data.takeoverMinutes != null ? data.takeoverMinutes
      : (activity.defaultTakeoverMinutes || 360));
  // Live mirror of the account's global AI mode for the helper line in
  // the drawer ("AI replies: When slow"). Single fetch on open.
  const [globalAiMode, setGlobalAiMode] = React.useState(null);
  React.useEffect(() => {
    if (!isReply) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/me/ai/policy", { credentials: "same-origin" });
        if (!r.ok) return;
        const p = await r.json();
        if (!cancelled) setGlobalAiMode((p && p.mode) || "hybrid");
      } catch (_) {}
    })();
    return () => { cancelled = true; };
  }, [isReply]);

  const taRef = React.useRef(null);
  const subjRef = React.useRef(null);
  const [activeField, setActiveField] = React.useState("body"); // for chips

  // Push edits up to the canvas. We don't debounce — typing into a 100kB
  // node graph is fine in React.
  React.useEffect(() => {
    onChange(node.id, {
      mode, subject, body, waitDays, conditionId,
      fallback, useGlobalCadence,
      firstReminderMinutes, secondReminderMinutes, takeoverMinutes,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, subject, body, waitDays, conditionId,
      fallback, useGlobalCadence,
      firstReminderMinutes, secondReminderMinutes, takeoverMinutes]);

  // Esc closes the drawer.
  React.useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function insertToken(token) {
    if (activeField === "subject") {
      insertTokenAtCursor(subjRef, subject, setSubject, token);
    } else {
      insertTokenAtCursor(taRef, body, setBody, token);
    }
  }

  return (
    <>
      <div className="fb-drawer-backdrop" onClick={onClose} />
      <aside className="fb-drawer" role="dialog" aria-modal="true">
        <header className="fb-drawer-h">
          <div className="fb-drawer-h-text">
            <div className="fb-drawer-h-eyebrow">{activity.trigger || ""}</div>
            <div className="fb-drawer-h-title">
              <span className="fb-drawer-h-ico" aria-hidden="true">{activity.icon}</span>
              <span>{activity.title}</span>
            </div>
          </div>
          <button
            type="button"
            className="fb-drawer-x"
            onClick={onClose}
            aria-label="Close"
          >×</button>
        </header>

        <div className="fb-drawer-body">
          <div className="fb-drawer-edit">
            {isBranch ? (
              <div>
                <label className="fb-drawer-l" htmlFor="fb-edit-condition">
                  Pick the question
                </label>
                <select
                  id="fb-edit-condition"
                  className="fb-input"
                  value={conditionId}
                  onChange={(e) => setConditionId(e.target.value)}
                >
                  {BRANCH_CONDITIONS.map(c => (
                    <option key={c.id} value={c.id}>{c.question}</option>
                  ))}
                </select>
                <div className="fb-branch-pathnames">
                  <div className="fb-branch-pathname is-yes">
                    <span className="fb-branch-pathname-ico">✓</span>
                    <span>
                      {(BRANCH_CONDITION_BY_ID[conditionId] || BRANCH_CONDITIONS[0]).yesLabel}
                    </span>
                  </div>
                  <div className="fb-branch-pathname is-no">
                    <span className="fb-branch-pathname-ico">✗</span>
                    <span>
                      {(BRANCH_CONDITION_BY_ID[conditionId] || BRANCH_CONDITIONS[0]).noLabel}
                    </span>
                  </div>
                </div>
                <p className="fb-helper">
                  Drag a line from the green ✓ side to what should happen if "yes."
                  Drag from the gray ✗ side to what should happen if "no."
                </p>
              </div>
            ) : isWait ? (
              <div>
                <label className="fb-drawer-l">Wait for</label>
                <div className="fb-wait-row">
                  <input
                    type="number"
                    min="0"
                    max="60"
                    className="fb-input fb-wait-num"
                    value={waitDays}
                    onChange={(e) => setWaitDays(Math.max(0,
                      Math.min(60, parseInt(e.target.value || "0", 10))))}
                  />
                  <span className="fb-wait-unit">
                    day{waitDays === 1 ? "" : "s"} before the next step
                  </span>
                </div>
                <p className="fb-helper">
                  This step doesn't send anything — it just pauses your flow.
                </p>
              </div>
            ) : isReply ? (
              <ReplyWidgetEditor
                fallback={fallback} setFallback={setFallback}
                useGlobalCadence={useGlobalCadence}
                setUseGlobalCadence={setUseGlobalCadence}
                firstReminderMinutes={firstReminderMinutes}
                setFirstReminderMinutes={setFirstReminderMinutes}
                secondReminderMinutes={secondReminderMinutes}
                setSecondReminderMinutes={setSecondReminderMinutes}
                takeoverMinutes={takeoverMinutes}
                setTakeoverMinutes={setTakeoverMinutes}
                body={body} setBody={setBody}
                taRef={taRef}
                onActiveField={() => setActiveField("body")}
                globalAiMode={globalAiMode}
              />
            ) : (
              <>
                {canBeSms && (
                  <div className="fb-modes" role="tablist" aria-label="Send by">
                    <button
                      type="button"
                      role="tab"
                      aria-selected={mode === "email"}
                      className={`fb-mode ${mode === "email" ? "is-active" : ""}`}
                      onClick={() => setMode("email")}
                    >📧 Email</button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={mode === "sms"}
                      className={`fb-mode ${mode === "sms" ? "is-active" : ""}`}
                      onClick={() => setMode("sms")}
                    >💬 Text</button>
                  </div>
                )}

                {mode === "email" && (
                  <>
                    <label className="fb-drawer-l" htmlFor="fb-edit-subject">Subject</label>
                    <input
                      id="fb-edit-subject"
                      ref={subjRef}
                      type="text"
                      className="fb-input"
                      data-ai-editable="true"
                      data-ai-field-type="post_caption"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      onFocus={() => setActiveField("subject")}
                      placeholder="What's the subject?"
                      maxLength={140}
                    />
                  </>
                )}

                <label className="fb-drawer-l" htmlFor="fb-edit-body">
                  {mode === "sms" ? "Message" : "Body"}
                </label>
                <textarea
                  id="fb-edit-body"
                  ref={taRef}
                  className="fb-textarea"
                  data-ai-editable="true"
                  data-ai-field-type={mode === "sms" ? "reply_body" : "post_caption"}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  onFocus={() => setActiveField("body")}
                  placeholder={mode === "sms"
                    ? "Type a quick note…"
                    : "Type your message here. Use the chips below to add things like the customer's name."}
                  rows={mode === "sms" ? 5 : 10}
                />

                <div className="fb-chips-row">
                  <div className="fb-chips-l">Tap to add:</div>
                  <div className="fb-chips">
                    {MERGE_TAGS.map(t => (
                      <button
                        key={t.token}
                        type="button"
                        className="fb-chip"
                        onClick={() => insertToken(t.token)}
                        title={`Adds ${t.token}`}
                      >{t.label}</button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="fb-drawer-preview">
            <div className="fb-drawer-preview-l">Live preview</div>
            {isBranch ? (
              <div className="fb-branch-preview">
                <div className="fb-branch-preview-q">
                  {(BRANCH_CONDITION_BY_ID[conditionId] || BRANCH_CONDITIONS[0]).question}
                </div>
                <div className="fb-branch-preview-paths">
                  <div className="fb-branch-preview-row is-yes">
                    <span>✓</span>
                    <span>{(BRANCH_CONDITION_BY_ID[conditionId] || BRANCH_CONDITIONS[0]).yesLabel}</span>
                    <span className="fb-branch-preview-arrow">→</span>
                  </div>
                  <div className="fb-branch-preview-row is-no">
                    <span>✗</span>
                    <span>{(BRANCH_CONDITION_BY_ID[conditionId] || BRANCH_CONDITIONS[0]).noLabel}</span>
                    <span className="fb-branch-preview-arrow">→</span>
                  </div>
                </div>
              </div>
            ) : isReply ? (
              <ReplyPhonePreview
                fallback={fallback}
                useGlobalCadence={useGlobalCadence}
                firstReminderMinutes={firstReminderMinutes}
                secondReminderMinutes={secondReminderMinutes}
                takeoverMinutes={takeoverMinutes}
                customBody={body}
                globalAiMode={globalAiMode}
              />
            ) : (
              <>
                <PhonePreview
                  mode={mode}
                  subject={subject}
                  body={body}
                  fromName="Your business"
                />
                <p className="fb-helper" style={{ textAlign: "center" }}>
                  The chips become real customer info when this sends.
                </p>
              </>
            )}
          </div>
        </div>

        <footer className="fb-drawer-foot">
          {onDelete ? (
            <button
              type="button"
              className="fb-drawer-del"
              onClick={() => onDelete(node.id)}
            >Remove this step</button>
          ) : <span />}
          <button
            type="button"
            className="fb-drawer-done"
            onClick={onClose}
          >Done</button>
        </footer>
      </aside>
    </>
  );
}

// ── List view: linearize the graph into a tree the renderer walks ──────
// Roots = nodes with no incoming edges (typically the trigger).
// Each branch node forks into a yes-path tree and a no-path tree.
// Returns an array of root trees (most flows have just one).
function buildStepTrees(nodes, edges) {
  const byId = Object.fromEntries(nodes.map(n => [n.id, n]));
  const incoming = {}, outgoing = {};
  edges.forEach(e => {
    (incoming[e.target]  = incoming[e.target]  || []).push(e);
    (outgoing[e.source]  = outgoing[e.source]  || []).push(e);
  });
  const roots = nodes.filter(n => !(incoming[n.id] || []).length);
  const visited = new Set();
  function walk(id) {
    if (visited.has(id)) return null;
    visited.add(id);
    const n = byId[id];
    if (!n) return null;
    const out = outgoing[id] || [];
    if (n.type === "branch") {
      const yesEdge = out.find(e => e.sourceHandle === "yes");
      const noEdge  = out.find(e => e.sourceHandle === "no");
      return {
        kind: "branch", node: n,
        yes: yesEdge ? walk(yesEdge.target) : null,
        no:  noEdge  ? walk(noEdge.target)  : null,
      };
    }
    const next = out[0];
    return {
      kind: "step", node: n,
      next: next ? walk(next.target) : null,
    };
  }
  // Sort roots left-to-right by canvas x so the list reads in the
  // same direction the user laid them out.
  roots.sort((a, b) => (a.position?.x || 0) - (b.position?.x || 0));
  return roots.map(r => walk(r.id)).filter(Boolean);
}

// ── Reply Widget editor ────────────────────────────────────────────────
// Drawer body for the "Reply" activity. Surfaces:
//   - the global AI mode (read-only — change it from the top-right control)
//   - reminder cadence (use global default OR override here)
//   - what happens when reminders run out: AI replies, OR a custom message
//   - if custom: a textarea for the body (same merge-tag conventions as Text/Email)
const REMINDER_OPTIONS = [
  { value: 15,   label: "15 min" },
  { value: 30,   label: "30 min" },
  { value: 60,   label: "1 hour" },
  { value: 120,  label: "2 hours" },
  { value: 360,  label: "6 hours" },
  { value: 720,  label: "12 hours" },
  { value: 1440, label: "1 day"  },
];

const GLOBAL_MODE_LABEL = {
  ai_always: "Always reply",
  hybrid:    "Reply when I'm slow",
  i_respond: "Never reply (off)",
};

function ReplyWidgetEditor({
  fallback, setFallback,
  useGlobalCadence, setUseGlobalCadence,
  firstReminderMinutes, setFirstReminderMinutes,
  secondReminderMinutes, setSecondReminderMinutes,
  takeoverMinutes, setTakeoverMinutes,
  body, setBody, taRef, onActiveField,
  globalAiMode,
}) {
  const aiOff = globalAiMode === "i_respond";

  function insertChip(token) {
    onActiveField && onActiveField();
    insertTokenAtCursor(taRef, body, setBody, token);
  }

  return (
    <div>
      <div className="fb-replywidget-section">
        <label className="fb-drawer-l">Remind me</label>
        <div className="fb-replywidget-cadence-toggle">
          <label className="fb-replywidget-radio">
            <input
              type="radio"
              name="rwCadenceMode"
              checked={useGlobalCadence}
              onChange={() => setUseGlobalCadence(true)}
            />
            <span>My usual times</span>
          </label>
          <label className="fb-replywidget-radio">
            <input
              type="radio"
              name="rwCadenceMode"
              checked={!useGlobalCadence}
              onChange={() => setUseGlobalCadence(false)}
            />
            <span>Set for this step</span>
          </label>
        </div>
        {!useGlobalCadence && (
          <div className="fb-replywidget-cadence-grid">
            <label>
              <span>First nudge</span>
              <select className="fb-input"
                value={firstReminderMinutes}
                onChange={(e) => setFirstReminderMinutes(parseInt(e.target.value, 10))}>
                {REMINDER_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>
            <label>
              <span>Again</span>
              <select className="fb-input"
                value={secondReminderMinutes}
                onChange={(e) => setSecondReminderMinutes(parseInt(e.target.value, 10))}>
                {REMINDER_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>
            <label>
              <span>Take over</span>
              <select className="fb-input"
                value={takeoverMinutes}
                onChange={(e) => setTakeoverMinutes(parseInt(e.target.value, 10))}>
                {REMINDER_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>
          </div>
        )}
      </div>

      <div className="fb-replywidget-section">
        <label className="fb-drawer-l">If I don't reply</label>
        <div className="fb-replywidget-fallback">
          <label className={`fb-replywidget-fbcard ${fallback === "ai" ? "is-active" : ""}`}>
            <input
              type="radio"
              name="rwFallback"
              checked={fallback === "ai"}
              onChange={() => setFallback("ai")}
            />
            <div>
              <div className="fb-replywidget-fbtitle">🤖 AI replies</div>
              <div className="fb-replywidget-fbsub">
                {aiOff ? "AI is off — turn on in top-right" : "Uses my Knowledge Base"}
              </div>
            </div>
          </label>
          <label className={`fb-replywidget-fbcard ${fallback === "custom" ? "is-active" : ""}`}>
            <input
              type="radio"
              name="rwFallback"
              checked={fallback === "custom"}
              onChange={() => setFallback("custom")}
            />
            <div>
              <div className="fb-replywidget-fbtitle">✏️ Send this</div>
              <div className="fb-replywidget-fbsub">My own words</div>
            </div>
          </label>
        </div>
      </div>

      {fallback === "custom" && (
        <div className="fb-replywidget-section">
          <textarea
            id="fb-rw-body"
            ref={taRef}
            className="fb-input fb-textarea"
            rows={6}
            value={body}
            onFocus={onActiveField}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Hey {first_name}, sorry I missed you — I'll be in touch soon."
          />
          <div className="fb-chips-row">
            <div className="fb-chips-l">Tap to add:</div>
            <div className="fb-chips">
              {MERGE_TAGS.map(t => (
                <button
                  key={t.token}
                  type="button"
                  className="fb-chip"
                  onClick={() => insertChip(t.token)}
                  title={`Adds ${t.token}`}
                >{t.label}</button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ListStepCard({ index, node, onEdit }) {
  const data = node.data || {};
  const activity = ACTIVITY_BY_ID[data.activityId] || {};
  // Friendly subline: wait nodes show the duration; message nodes show
  // the first line of the body (substituted with example merge tags so
  // the user reads a real-feeling preview).
  let sub = "";
  if (activity.defaultMode === "wait") {
    const d = data.waitDays || 1;
    sub = `Wait ${d} day${d === 1 ? "" : "s"}`;
  } else if (activity.defaultMode === "reply") {
    const fb = data.fallback || "ai";
    sub = fb === "ai" ? "Nudges → AI" : "Nudges → my message";
  } else if (data.body) {
    const firstLine = applyMergeTags(data.body || "").split("\n")[0];
    sub = firstLine.length > 96 ? firstLine.slice(0, 96) + "…" : firstLine;
  }
  return (
    <div className="fb-list-card">
      <span className="fb-list-num">{index}</span>
      <span className="fb-list-ico" aria-hidden="true">{data.icon || "•"}</span>
      <div className="fb-list-text">
        <div className="fb-list-trigger">{data.trigger || ""}</div>
        <div className="fb-list-title">{data.title}</div>
        <div className="fb-list-desc">{data.description}</div>
        {sub ? <div className="fb-list-sub">{sub}</div> : null}
      </div>
      <button
        type="button"
        className="fb-list-edit"
        onClick={() => onEdit(node.id)}
      >Edit →</button>
    </div>
  );
}

function ListBranchCard({ index, node, onEdit }) {
  const data = node.data || {};
  const cond = BRANCH_CONDITION_BY_ID[data.conditionId] || BRANCH_CONDITIONS[0];
  return (
    <div className="fb-list-card is-branch">
      <span className="fb-list-num">{index}</span>
      <span className="fb-list-ico" aria-hidden="true">🔀</span>
      <div className="fb-list-text">
        <div className="fb-list-trigger">IF / THEN</div>
        <div className="fb-list-title">{cond.question}</div>
      </div>
      <button
        type="button"
        className="fb-list-edit"
        onClick={() => onEdit(node.id)}
      >Edit →</button>
    </div>
  );
}

// Walk the tree producing flat numbered cards (yes path first, then no
// path). Counter is a {n} ref-ish object so sub-walks share numbering.
function StepTree({ tree, counter, onEdit }) {
  if (!tree) return null;
  if (tree.kind === "step") {
    const n = ++counter.n;
    return (
      <>
        <ListStepCard index={n} node={tree.node} onEdit={onEdit} />
        {tree.next && <div className="fb-list-arrow" aria-hidden="true">↓</div>}
        {tree.next && <StepTree tree={tree.next} counter={counter} onEdit={onEdit} />}
      </>
    );
  }
  // branch
  const n = ++counter.n;
  const cond = BRANCH_CONDITION_BY_ID[tree.node.data?.conditionId]
            || BRANCH_CONDITIONS[0];
  return (
    <>
      <ListBranchCard index={n} node={tree.node} onEdit={onEdit} />
      <div className="fb-list-arrow" aria-hidden="true">↓</div>
      <div className="fb-list-split">
        <div className="fb-list-path is-yes">
          <div className="fb-list-path-h">
            <span className="fb-list-path-ico">✓</span>
            <span>{cond.yesLabel}</span>
          </div>
          {tree.yes
            ? <StepTree tree={tree.yes} counter={counter} onEdit={onEdit} />
            : <div className="fb-list-empty">
                Nothing on this path yet. Switch to Canvas to add a step here.
              </div>}
        </div>
        <div className="fb-list-path is-no">
          <div className="fb-list-path-h">
            <span className="fb-list-path-ico is-no">✗</span>
            <span>{cond.noLabel}</span>
          </div>
          {tree.no
            ? <StepTree tree={tree.no} counter={counter} onEdit={onEdit} />
            : <div className="fb-list-empty">
                Nothing on this path yet. Switch to Canvas to add a step here.
              </div>}
        </div>
      </div>
    </>
  );
}

function FlowList({ nodes, edges, onEdit }) {
  const trees = React.useMemo(
    () => buildStepTrees(nodes, edges), [nodes, edges]);
  if (!nodes.length) {
    return (
      <div className="fb-list-blank">
        <div className="fb-list-blank-ico">📋</div>
        <div className="fb-list-blank-h">No steps yet</div>
        <div className="fb-list-blank-p">
          Switch to <strong>Canvas</strong> and pick a template or drop a step.
        </div>
      </div>
    );
  }
  // Numbering is a single counter shared across all root trees so a
  // multi-root flow still numbers 1, 2, 3, … instead of restarting.
  const counter = { n: 0 };
  return (
    <div className="fb-list-wrap">
      {trees.map((tree, i) => (
        <div key={i} className="fb-list-root">
          {i > 0 && <div className="fb-list-divider">Another flow</div>}
          <StepTree tree={tree} counter={counter} onEdit={onEdit} />
        </div>
      ))}
    </div>
  );
}

// ── Auto-connect: pick the rightmost orphan tail (linear case) ──────────
// Branch nodes are intentionally excluded — they have two distinct
// outputs (Yes / No) and we can't pick one without guessing the user's
// intent. Branches require a manual line drag from the right output.
function findRightmostOrphan(nodes, edges) {
  const hasOutgoing = new Set(edges.map(e => e.source));
  const tails = nodes.filter(n =>
    !hasOutgoing.has(n.id) && n.type !== "branch");
  if (!tails.length) return null;
  return tails.reduce((best, n) =>
    !best || (n.position?.x || 0) > (best.position?.x || 0) ? n : best, null);
}

function shortId() {
  return Math.random().toString(36).slice(2, 8);
}

// ── Inline CSS — kept here so the React island stays self-contained.
const STYLES = `
  .fb-root {
    position: relative;
    width: 100%;
    height: calc(100vh - 130px);
    min-height: 480px;
    background: #fafaf9;
    border: 1px solid rgba(15,23,42,.08);
    border-radius: 14px;
    overflow: hidden;
    display: flex; flex-direction: column;
    --fb-green: #16a34a;
    --fb-green-soft: #bbf7d0;
    --fb-border: rgba(15,23,42,.08);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
                 Helvetica, Arial, sans-serif;
  }
  .fb-content {
    flex: 1; min-height: 0;
    display: flex; flex-direction: row;
  }
  .fb-canvas {
    flex: 1; min-width: 0; height: 100%; position: relative;
  }
  /* View tabs (Canvas / Steps) */
  .fb-view-tabs {
    display: flex; gap: 4px;
    padding: 8px 12px;
    background: #fff;
    border-bottom: 1px solid var(--fb-border);
    flex-shrink: 0;
  }
  .fb-view-tab {
    background: transparent; border: 0;
    padding: 8px 14px; border-radius: 8px;
    font: 600 13px inherit; color: #6b7280; cursor: pointer;
    display: inline-flex; align-items: center; gap: 6px;
  }
  .fb-view-tab:hover { background: #f3f4f6; color: #0a0a0a; }
  .fb-view-tab.is-active {
    background: #f0fdf4; color: var(--fb-green);
    box-shadow: 0 0 0 1px #bbf7d0 inset;
  }
  /* ── Canvas node (activity + branch share .fb-card) ────────────────
     Redesigned to be larger, color-coded, and readable when zoomed
     out. Each kind gets its own --kind-* palette and the card paints
     a 6px top stripe + a colored icon ring + an inner border tint.
     Title is 20px, sub is 13.5px — both scale-survive a 50% zoom. */
  .fb-card {
    position: relative;
    width: 360px;
    background: #fff;
    border-radius: 16px;
    padding: 16px 18px 16px;
    border: 1px solid var(--fb-border);
    box-shadow: 0 1px 2px rgba(15,23,42,.04),
                0 8px 24px rgba(15,23,42,.06);
    transition: border-color .15s, box-shadow .15s, transform .15s;
    /* overflow stays visible so the "+ Next" button can hang off the
       right edge. The top stripe + branch path corners do their own
       border-radius clipping (top: 16px 16px 0 0 / bottom: rounded). */
    overflow: visible;
  }
  .fb-card:hover {
    transform: translateY(-1px);
    box-shadow: 0 1px 2px rgba(15,23,42,.04),
                0 12px 28px rgba(15,23,42,.10);
  }
  /* Top stripe */
  .fb-card-stripe {
    position: absolute; top: 0; left: 0; right: 0; height: 6px;
    background: var(--kind-color, #10b981);
    border-radius: 16px 16px 0 0;
  }
  /* Per-kind palettes — picked to be vibrant + professional. */
  .fb-kind-trigger {
    --kind-color: #10b981;       /* emerald 500 */
    --kind-soft:  #d1fae5;        /* emerald 100 */
    --kind-ring:  rgba(16,185,129,.18);
    --kind-deep:  #065f46;        /* emerald 800 */
  }
  .fb-kind-action {
    --kind-color: #3b82f6;       /* blue 500 */
    --kind-soft:  #dbeafe;        /* blue 100 */
    --kind-ring:  rgba(59,130,246,.18);
    --kind-deep:  #1e40af;
  }
  .fb-kind-logic, .fb-branch {
    --kind-color: #f59e0b;       /* amber 500 */
    --kind-soft:  #fef3c7;        /* amber 100 */
    --kind-ring:  rgba(245,158,11,.20);
    --kind-deep:  #92400e;
  }
  .fb-card.is-on {
    border-color: var(--kind-color);
    box-shadow: 0 0 0 1px var(--kind-color) inset,
                0 12px 28px rgba(16,185,129,.14);
  }

  .fb-card-row {
    display: flex; align-items: center; gap: 14px;
    margin-top: 6px;        /* leave room for the top stripe */
  }
  /* Icon in a colored ring — bigger, clearer at zoom-out. */
  .fb-card-icoring {
    width: 52px; height: 52px; flex-shrink: 0;
    border-radius: 14px;
    background: var(--kind-soft);
    display: flex; align-items: center; justify-content: center;
    box-shadow: 0 0 0 4px var(--kind-ring);
  }
  .fb-card-icoring span {
    font-size: 26px; line-height: 1;
  }
  .fb-card-text { flex: 1; min-width: 0; }
  .fb-card-title {
    font-size: 19px; font-weight: 700; color: #0a0a0a;
    line-height: 1.2;
    letter-spacing: -0.01em;
    margin-bottom: 3px;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .fb-card-sub {
    font-size: 13.5px; font-weight: 500; color: var(--kind-deep);
    line-height: 1.3;
  }
  .fb-card-pill {
    flex-shrink: 0;
    padding: 5px 11px; border-radius: 999px;
    background: #f3f4f6; color: #6b7280;
    font-size: 11px; font-weight: 800; letter-spacing: .05em;
  }
  .fb-card-pill.is-on {
    background: var(--kind-color); color: #fff;
    box-shadow: 0 0 0 3px var(--kind-ring);
  }
  /* "+ Next" connector button — sticks out the right edge of every
     activity card so adding the next step never requires hunting for
     a tiny port handle. */
  .fb-card { /* position:relative already set above; keep next-btn anchored */ }
  .fb-next-btn {
    /* Anchored to the card's right edge with its own center on the
       border so it reads as a "port" rather than a free-floating chip.
       Translate-X moves half its width past the edge — exactly the
       look the user asked for, no clipping. */
    position: absolute;
    right: 0; top: 50%;
    transform: translate(50%, -50%);
    z-index: 2;
    display: inline-flex; align-items: center; gap: 6px;
    height: 36px; padding: 0 14px;
    background: var(--fb-green); color: #fff;
    border: 2px solid #fff; border-radius: 999px;
    font: 700 13px -apple-system, BlinkMacSystemFont, "Segoe UI",
          Roboto, sans-serif;
    box-shadow: 0 4px 12px rgba(15,23,42,.18),
                0 0 0 1px rgba(22,163,74,.25);
    cursor: pointer;
    white-space: nowrap;
    transition: transform .12s, box-shadow .12s, background .12s;
  }
  .fb-next-btn:hover {
    background: #15803d;
    transform: translate(50%, -50%) scale(1.05);
    box-shadow: 0 6px 16px rgba(15,23,42,.22),
                0 0 0 2px rgba(22,163,74,.35);
  }
  /* ── Layered UI z-index scale ──────────────────────────────────────
     Codified so future components don't pick arbitrary values.
        20  persistent UI (save status, return-pill, intro strip)
        30  popovers, dropdowns
        40  modals (chooser, template picker, message drawer)
        45  tour panel (above modals so it can guide through them)
        50  toasts
        70  return-pill RAISED state — but only when no modal is open
     The pill defaults to 20; we elevate it to 70 only when there's no
     competing modal. When a modal opens (.fb-canvas.is-modal-open),
     persistent UI fades out so it can't visually intrude. */
  .fb-canvas .fb-tour-panel,
  .fb-canvas .fb-return-pill,
  .fb-canvas .fb-save,
  .fb-canvas .fb-tour-replay {
    transition: opacity .15s ease, visibility 0s linear .15s;
  }
  .fb-canvas.is-modal-open .fb-tour-panel:not([data-sub="1"]),
  .fb-canvas.is-modal-open .fb-return-pill,
  .fb-canvas.is-modal-open .fb-save,
  .fb-canvas.is-modal-open .fb-tour-replay {
    opacity: 0;
    pointer-events: none;
    visibility: hidden;
  }
  /* Sub-path tour panels stay visible during modals — they're the
     guidance INSIDE the modal. Float them on top of everything. */
  .fb-tour-panel[data-sub="1"] {
    z-index: 60 !important;
    box-shadow: 0 12px 32px rgba(20,40,80,.22) !important;
  }

  /* Tour highlight — soft warm yellow/gold halo around whatever
     element the active tour step is describing. Reads as a "look
     here!" hint, not an error.

     Critical: NO position override. The +Next button uses
     position:absolute with a translate, and any reposition on this
     class would break the card's right-edge anchor. We rely on
     box-shadow + filter only — pure visual layer, no layout impact. */
  @keyframes fb-tour-halo {
    0%, 100% {
      box-shadow:
        0 0 0 3px  rgba(252,211,77,.55),    /* warm gold ring */
        0 0 0 10px rgba(252,211,77,.22),    /* outer soft halo */
        0 6px 18px rgba(160,110,0,.20);
    }
    50% {
      box-shadow:
        0 0 0 5px  rgba(252,211,77,.70),
        0 0 0 16px rgba(252,211,77,.28),
        0 8px 22px rgba(160,110,0,.26);
    }
  }
  .fb-tour-highlight {
    /* No position / z-index here — purely visual. */
    animation: fb-tour-halo 1.4s ease-in-out infinite !important;
    border-radius: 12px;
  }
  /* Bobbing arrow companion that points at the highlighted element.
     The tour panel positions one of these absolutely just below the
     panel content with content set to direct the user's eye. */
  @keyframes fb-tour-arrow-bob {
    0%, 100% { transform: translateY(0)   rotate(-12deg); }
    50%      { transform: translateY(-4px) rotate(-12deg); }
  }
  .fb-tour-arrow {
    display: inline-block;
    font-size: 22px;
    animation: fb-tour-arrow-bob 1.2s ease-in-out infinite;
    margin: 0 0 0 4px;
  }

  /* Pulse hint — when the canvas has just one trigger card, draw the
     user's eye to the green +Next button so they know that's how a
     step gets added. The parent wrapper sets data-pulse-next="1". */
  @keyframes fb-pulse-next {
    0%   { box-shadow: 0 0 0 0   rgba(22,163,74,.55),
                       0 4px 12px rgba(15,23,42,.18); }
    70%  { box-shadow: 0 0 0 14px rgba(22,163,74,0),
                       0 4px 12px rgba(15,23,42,.18); }
    100% { box-shadow: 0 0 0 0   rgba(22,163,74,0),
                       0 4px 12px rgba(15,23,42,.18); }
  }
  [data-pulse-next="1"] .fb-next-btn {
    animation: fb-pulse-next 1.6s ease-out infinite;
  }
  [data-pulse-next="1"] .fb-next-btn:hover { animation: none; }
  .fb-next-btn .fb-next-btn-l {
    font-size: 12px; font-weight: 700; letter-spacing: .02em;
  }
  /* Branch-row variants — same anchoring so each path's button hangs
     off the card's right edge in line with its row. */
  .fb-next-btn-yes,
  .fb-next-btn-no {
    position: absolute;
    right: 0; top: 50%;
    transform: translate(50%, -50%);
  }
  .fb-next-btn-yes:hover,
  .fb-next-btn-no:hover {
    transform: translate(50%, -50%) scale(1.05);
  }
  .fb-next-btn-no {
    background: #6b7280;
    box-shadow: 0 2px 6px rgba(15,23,42,.18),
                0 0 0 1px rgba(107,114,128,.25);
  }
  .fb-next-btn-no:hover {
    background: #4b5563;
    box-shadow: 0 4px 12px rgba(15,23,42,.22),
                0 0 0 2px rgba(107,114,128,.35);
  }
  /* Port handles — bigger and brighter so users can see and grab them
     without hunting. Hovering a handle scales it up; dragging from one
     gives the connection line a clear origin. */
  .react-flow__handle {
    background: var(--fb-green);
    width: 14px; height: 14px;
    border: 2px solid #fff;
    box-shadow: 0 0 0 2px rgba(22,163,74,.25);
    transition: transform .12s, box-shadow .12s;
  }
  .react-flow__handle:hover {
    transform: scale(1.25);
    box-shadow: 0 0 0 4px rgba(22,163,74,.35);
  }
  .react-flow__handle.fb-handle-no {
    background: #9ca3af;
    box-shadow: 0 0 0 2px rgba(156,163,175,.25);
  }
  .react-flow__handle.fb-handle-no:hover {
    box-shadow: 0 0 0 4px rgba(156,163,175,.35);
  }
  /* Connection line preview while the user drags from a handle. */
  .react-flow__connection-path {
    stroke: var(--fb-green); stroke-width: 2;
    stroke-dasharray: 6 4;
  }
  .react-flow__edge-path { stroke-linecap: round; }
  /* Edge hover surface for easier click-to-delete. */
  .react-flow__edge-interaction { stroke-width: 18; }

  /* ── Branch node — wider card with two split path rows below ─────── */
  .fb-branch {
    position: relative;
    width: 380px;
    padding: 0;             /* card row gets its own padding */
  }
  .fb-branch .fb-card-row {
    padding: 14px 18px 14px;
    margin-top: 6px;        /* leave room for top stripe */
  }
  .fb-branch-paths {
    display: grid; grid-template-rows: 1fr 1fr;
  }
  .fb-branch-path {
    position: relative;
    display: flex; align-items: center; gap: 10px;
    padding: 14px 18px;
    font-size: 14px; font-weight: 600;
  }
  .fb-branch-path.is-yes {
    background: rgba(16,185,129,.08); color: #065f46;
    border-top: 1px solid #d1fae5;
    border-bottom: 1px solid #d1fae5;
  }
  .fb-branch-path.is-no {
    background: #fafafa; color: #4b5563;
    border-top: 1px solid #e5e7eb;
    border-bottom-left-radius: 16px;
    border-bottom-right-radius: 16px;
  }
  .fb-branch-path-ico {
    width: 22px; height: 22px; border-radius: 50%;
    background: #10b981; color: #fff;
    display: inline-flex; align-items: center; justify-content: center;
    font-size: 12px; font-weight: 700; flex-shrink: 0;
  }
  .fb-branch-path.is-no .fb-branch-path-ico { background: #9ca3af; }
  .fb-branch-path-l { flex: 1; min-width: 0; }

  /* Drawer: branch condition picker + path preview ─────────────────── */
  .fb-branch-pathnames {
    display: flex; flex-direction: column; gap: 8px;
    margin-top: 14px;
  }
  .fb-branch-pathname {
    display: flex; align-items: center; gap: 10px;
    padding: 10px 14px; border-radius: 10px;
    font-size: 13.5px; font-weight: 600;
  }
  .fb-branch-pathname.is-yes {
    background: rgba(22,163,74,.08); color: #166534;
    border: 1px solid #bbf7d0;
  }
  .fb-branch-pathname.is-no {
    background: #f9fafb; color: #4b5563;
    border: 1px solid #e5e7eb;
  }
  .fb-branch-pathname-ico {
    width: 22px; height: 22px; border-radius: 50%;
    background: #16a34a; color: #fff;
    display: inline-flex; align-items: center; justify-content: center;
    font-size: 12px; font-weight: 700;
  }
  .fb-branch-pathname.is-no .fb-branch-pathname-ico { background: #9ca3af; }

  .fb-branch-preview {
    width: 100%; max-width: 280px;
    background: #fff; border: 1px solid var(--fb-border);
    border-radius: 14px; padding: 14px 16px;
  }
  .fb-branch-preview-q {
    font-size: 13.5px; font-weight: 700; color: #0a0a0a;
    margin-bottom: 12px; text-align: center;
  }
  .fb-branch-preview-paths {
    display: flex; flex-direction: column; gap: 8px;
  }
  .fb-branch-preview-row {
    display: flex; align-items: center; gap: 8px;
    padding: 8px 12px; border-radius: 10px;
    font-size: 12.5px; font-weight: 600;
  }
  .fb-branch-preview-row.is-yes {
    background: rgba(22,163,74,.06); color: #166534;
  }
  .fb-branch-preview-row.is-no {
    background: #fafafa; color: #6b7280;
  }
  .fb-branch-preview-arrow {
    margin-left: auto; opacity: .5;
  }

  /* ── Library panel ───────────────────────────────────────────────── */
  .fb-library {
    width: 304px; flex-shrink: 0;
    background: #fff;
    border-left: 1px solid var(--fb-border);
    display: flex; flex-direction: column;
    transition: width .18s ease;
  }
  .fb-library.is-collapsed { width: 36px; }
  .fb-library-h {
    display: flex; align-items: flex-start; justify-content: space-between;
    gap: 12px; padding: 14px 16px 10px;
    border-bottom: 1px solid var(--fb-border);
  }
  .fb-library.is-collapsed .fb-library-h > div { display: none; }
  .fb-library-h-title {
    font-size: 14px; font-weight: 700; color: #0a0a0a;
    margin-bottom: 2px;
  }
  .fb-library-h-sub {
    font-size: 12px; color: #6b7280; line-height: 1.4;
  }
  .fb-library-toggle {
    width: 24px; height: 24px;
    border: 1px solid var(--fb-border); background: #fff;
    border-radius: 50%;
    color: #6b7280; cursor: pointer;
    display: inline-flex; align-items: center; justify-content: center;
    flex-shrink: 0; padding: 0; line-height: 1;
    font-size: 14px;
  }
  .fb-library-toggle:hover { background: #f9fafb; color: #0a0a0a; }
  .fb-library-body {
    flex: 1; overflow-y: auto;
    padding: 10px 12px 16px;
  }
  .fb-library-section { margin-bottom: 16px; }
  .fb-library-section-h {
    font-size: 11px; font-weight: 700; color: #4b5563;
    letter-spacing: .04em; text-transform: uppercase;
    margin: 6px 4px 2px;
  }
  .fb-library-section-sub {
    font-size: 11.5px; color: #6b7280; line-height: 1.4;
    margin: 0 4px 8px;
  }
  .fb-lib-item {
    display: flex; align-items: flex-start; gap: 10px;
    padding: 9px 10px;
    background: #fff; border: 1px solid var(--fb-border);
    border-radius: 10px;
    margin-bottom: 6px;
    cursor: grab;
    transition: border-color .12s, box-shadow .12s, transform .12s;
  }
  .fb-lib-item:hover {
    border-color: var(--fb-green-soft);
    box-shadow: 0 4px 12px rgba(15,23,42,.06);
  }
  .fb-lib-item:active { cursor: grabbing; transform: scale(.98); }
  .fb-lib-item.is-locked {
    cursor: not-allowed; opacity: .55;
  }
  .fb-lib-item.is-locked:hover {
    border-color: var(--fb-border); box-shadow: none;
  }
  .fb-lib-ico { font-size: 18px; line-height: 1.2; flex-shrink: 0; }
  .fb-lib-text { flex: 1; min-width: 0; }
  .fb-lib-title {
    font-size: 13.5px; font-weight: 600; color: #0a0a0a;
    margin-bottom: 1px;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .fb-lib-sub {
    font-size: 11.5px; color: #6b7280; line-height: 1.4;
  }
  .fb-lib-badge {
    flex-shrink: 0; font-size: 10px; font-weight: 700;
    padding: 2px 7px; border-radius: 999px;
    letter-spacing: .04em; align-self: center;
  }
  .fb-lib-badge-soon {
    background: #fef3c7; color: #92400e;
  }
  .fb-lib-badge-added {
    background: #dcfce7; color: #166534;
  }

  /* Save indicator (top-right, inside the canvas). Subtle by default;
     animates while a save is in flight; turns soft red on error. */
  .fb-save {
    position: absolute; top: 12px; right: 12px;
    display: inline-flex; align-items: center; gap: 6px;
    padding: 6px 12px;
    background: rgba(255,255,255,.85);
    backdrop-filter: blur(6px);
    border: 1px solid var(--fb-border);
    border-radius: 999px;
    font-size: 12px; font-weight: 600; color: #6b7280;
    z-index: 5;
    pointer-events: none;
    transition: color .15s, background .15s, border-color .15s;
  }
  .fb-save-saving { color: #4b5563; }
  .fb-save-saved  { color: #166534; border-color: #bbf7d0;
                    background: rgba(240,253,244,.92); }
  .fb-save-error  { color: #991b1b; border-color: #fecaca;
                    background: rgba(254,242,242,.92); }
  .fb-save-dot {
    width: 8px; height: 8px; border-radius: 50%;
    background: #4b5563;
    animation: fbSavePulse 1s ease-in-out infinite;
  }
  @keyframes fbSavePulse {
    0%, 100% { opacity: .4; transform: scale(.85); }
    50%      { opacity: 1;  transform: scale(1.05); }
  }

  /* Subtle hint when the user is dragging over the canvas. */
  .fb-canvas.is-drop-target::before {
    content: ""; position: absolute; inset: 0;
    background: rgba(22,163,74,.04);
    pointer-events: none;
    border-radius: 14px;
  }

  /* ── Message editor drawer ───────────────────────────────────────── */
  .fb-drawer-backdrop {
    position: absolute; inset: 0;
    background: rgba(15,23,42,.18);
    z-index: 10;
    animation: fbFade .15s ease-out;
  }
  @keyframes fbFade { from { opacity: 0; } to { opacity: 1; } }
  .fb-drawer {
    position: absolute; right: 0; top: 0; bottom: 0;
    width: min(720px, 100%);
    background: #fff;
    border-left: 1px solid var(--fb-border);
    box-shadow: -16px 0 40px rgba(15,23,42,.18);
    z-index: 11;
    display: flex; flex-direction: column;
    animation: fbSlideIn .22s cubic-bezier(.2,.8,.2,1);
  }
  @keyframes fbSlideIn {
    from { transform: translateX(100%); opacity: 0; }
    to   { transform: translateX(0);     opacity: 1; }
  }
  .fb-drawer-h {
    display: flex; align-items: flex-start; justify-content: space-between;
    gap: 12px; padding: 18px 22px 14px;
    border-bottom: 1px solid var(--fb-border);
  }
  .fb-drawer-h-eyebrow {
    font-size: 11px; font-weight: 700; color: #6b7280;
    letter-spacing: .04em; margin-bottom: 4px;
  }
  .fb-drawer-h-title {
    display: flex; align-items: center; gap: 8px;
    font-size: 17px; font-weight: 700; color: #0a0a0a;
  }
  .fb-drawer-h-ico { font-size: 20px; line-height: 1; }
  .fb-drawer-x {
    background: none; border: 0; font-size: 26px;
    color: #9ca3af; cursor: pointer; padding: 0 6px; line-height: 1;
  }
  .fb-drawer-x:hover { color: #0a0a0a; }
  .fb-drawer-body {
    flex: 1; overflow-y: auto;
    display: grid;
    grid-template-columns: minmax(0, 1fr) 320px;
    gap: 18px;
    padding: 18px 22px;
  }
  @media (max-width: 880px) {
    .fb-drawer-body {
      grid-template-columns: 1fr;
    }
  }
  .fb-drawer-edit { min-width: 0; }
  .fb-drawer-l {
    display: block;
    font-size: 12px; font-weight: 700; color: #4b5563;
    letter-spacing: .03em; text-transform: uppercase;
    margin: 12px 0 6px;
  }
  .fb-drawer-l:first-child { margin-top: 0; }
  .fb-input, .fb-textarea {
    display: block; width: 100%;
    padding: 10px 12px;
    border: 1px solid var(--fb-border); border-radius: 8px;
    font: 14px/1.45 inherit;
    background: #fff;
  }
  .fb-input:focus, .fb-textarea:focus {
    outline: none; border-color: var(--fb-green);
    box-shadow: 0 0 0 3px rgba(22,163,74,.15);
  }
  .fb-textarea {
    resize: vertical; min-height: 120px;
  }
  .fb-modes {
    display: inline-flex; gap: 0; padding: 2px;
    background: #f3f4f6; border-radius: 999px;
    margin-bottom: 8px;
  }
  .fb-mode {
    background: transparent; border: 0;
    padding: 6px 14px; border-radius: 999px;
    font: 500 13px inherit; color: #6b7280; cursor: pointer;
  }
  .fb-mode.is-active {
    background: #fff; color: var(--fb-green); font-weight: 700;
    box-shadow: 0 1px 3px rgba(15,23,42,.10);
  }
  .fb-chips-row {
    margin-top: 10px;
    display: flex; flex-direction: column; gap: 6px;
  }
  .fb-chips-l { font-size: 12px; color: #6b7280; }
  .fb-chips { display: flex; flex-wrap: wrap; gap: 6px; }
  .fb-chip {
    background: #f0fdf4; border: 1px solid #bbf7d0;
    color: #166534; font: 500 12.5px inherit;
    padding: 5px 10px; border-radius: 999px;
    cursor: pointer;
  }
  .fb-chip:hover { background: #dcfce7; border-color: #86efac; }
  .fb-helper {
    font-size: 12px; color: #6b7280; margin: 8px 0 0;
    line-height: 1.45;
  }
  .fb-wait-row {
    display: flex; align-items: center; gap: 10px;
  }
  .fb-wait-num {
    width: 80px; text-align: center; font-size: 16px; font-weight: 700;
  }
  .fb-wait-unit { font-size: 14px; color: #4b5563; }

  /* Live phone preview */
  .fb-drawer-preview {
    display: flex; flex-direction: column; align-items: center; gap: 8px;
  }
  .fb-drawer-preview-l {
    font-size: 12px; font-weight: 700; color: #4b5563;
    letter-spacing: .03em; text-transform: uppercase;
    align-self: flex-start;
  }
  .fb-phone {
    width: 280px; height: 480px;
    background: #1c1c1e; border-radius: 36px;
    padding: 10px;
    box-shadow: 0 12px 28px rgba(15,23,42,.2);
    position: relative;
  }
  .fb-phone-notch {
    position: absolute; top: 12px; left: 50%; transform: translateX(-50%);
    width: 90px; height: 22px;
    background: #1c1c1e; border-radius: 14px;
    z-index: 1;
  }
  .fb-phone-screen {
    width: 100%; height: 100%;
    background: #f5f5f7; border-radius: 28px;
    overflow: hidden;
    display: flex; flex-direction: column;
    padding: 36px 12px 12px;
  }
  .fb-phone-statusbar {
    display: flex; justify-content: space-between;
    font-size: 12px; font-weight: 700; color: #1c1c1e;
    padding: 0 4px 8px;
  }
  /* SMS view */
  .fb-phone-sms { padding: 8px 4px; }
  .fb-phone-sms-from {
    text-align: center; font-size: 11.5px; color: #6b7280;
    margin-bottom: 8px;
  }
  .fb-phone-sms-bubble {
    background: #e9e9eb; color: #1c1c1e;
    padding: 9px 13px; border-radius: 18px;
    font-size: 13px; line-height: 1.4;
    max-width: 80%; margin-right: auto;
    white-space: pre-wrap; word-wrap: break-word;
  }
  /* Email view */
  .fb-phone-mail {
    background: #fff; border-radius: 12px;
    padding: 14px;
    box-shadow: 0 1px 3px rgba(15,23,42,.06);
    margin: 6px 2px;
    overflow-y: auto;
  }
  .fb-phone-mail-from {
    font-size: 12px; color: #1c1c1e; margin-bottom: 4px;
  }
  .fb-phone-mail-subject {
    font-size: 14px; font-weight: 700; color: #0a0a0a;
    margin-bottom: 6px;
  }
  .fb-phone-mail-body {
    font-size: 12.5px; color: #1c1c1e; line-height: 1.5;
    white-space: pre-wrap; word-wrap: break-word;
  }
  .fb-phone-empty { color: #9ca3af; font-style: italic; }
  .fb-phone-wait {
    text-align: center; padding: 40px 16px; color: #6b7280;
  }
  .fb-phone-wait-ico { font-size: 40px; margin-bottom: 8px; }
  .fb-phone-wait-h { font-size: 14px; font-weight: 700; color: #0a0a0a; }
  .fb-phone-wait-p { font-size: 12px; margin-top: 4px; }

  /* ── Reply Widget editor + preview ────────────────────────────────── */
  .fb-replywidget-section { margin-bottom: 32px; }
  .fb-replywidget-section .fb-drawer-l {
    font-size: 17px; font-weight: 700; color: #0a0a0a;
    letter-spacing: -0.01em; margin-bottom: 14px;
  }

  /* Segmented toggle (My usual times / Set for this step) */
  .fb-replywidget-cadence-toggle {
    display: flex; gap: 0; padding: 4px;
    background: #f1f5f9; border-radius: 12px;
    margin-top: 4px;
  }
  .fb-replywidget-radio {
    flex: 1; display: inline-flex; align-items: center; justify-content: center;
    gap: 6px; padding: 12px 16px;
    font-size: 14px; font-weight: 600; color: #475569;
    cursor: pointer; border-radius: 8px;
    transition: all 0.16s ease;
  }
  .fb-replywidget-radio:has(input:checked) {
    background: #fff; color: #0a0a0a;
    box-shadow: 0 1px 3px rgba(15,23,42,0.10),
                0 1px 1px rgba(15,23,42,0.06);
  }
  .fb-replywidget-radio input {
    appearance: none; -webkit-appearance: none;
    width: 0; height: 0; margin: 0; padding: 0; opacity: 0;
    position: absolute;
  }

  .fb-replywidget-cadence-grid {
    display: grid; grid-template-columns: 1fr; gap: 12px;
    margin-top: 16px;
    padding: 16px 18px;
    background: #f8fafc; border-radius: 12px;
  }
  .fb-replywidget-cadence-grid label {
    display: flex; align-items: center; justify-content: space-between;
    gap: 14px; font-size: 15px; font-weight: 500; color: #1f2937;
  }
  .fb-replywidget-cadence-grid select {
    min-width: 140px; height: 42px;
    font-size: 14px; font-weight: 500;
    padding: 0 14px;
    border: 1.5px solid #e2e8f0; border-radius: 10px;
    background: #fff; color: #0a0a0a;
    cursor: pointer; font-family: inherit;
    transition: border-color 0.14s ease;
  }
  .fb-replywidget-cadence-grid select:hover { border-color: #cbd5e1; }
  .fb-replywidget-cadence-grid select:focus {
    outline: 0; border-color: #2563eb;
    box-shadow: 0 0 0 3px rgba(37,99,235,0.12);
  }

  /* Fallback choice cards (AI replies / Send this) */
  .fb-replywidget-fallback {
    display: grid; grid-template-columns: 1fr 1fr;
    gap: 12px; margin-top: 4px;
  }
  @media (max-width: 600px) {
    .fb-replywidget-fallback { grid-template-columns: 1fr; }
  }
  .fb-replywidget-fbcard {
    display: flex; flex-direction: column; gap: 8px;
    padding: 22px 22px; cursor: pointer;
    background: #fff;
    border: 2px solid #e5e7eb; border-radius: 16px;
    transition: all 0.16s ease; position: relative;
  }
  .fb-replywidget-fbcard:hover {
    border-color: #cbd5e1; transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(15,23,42,0.06);
  }
  .fb-replywidget-fbcard.is-active {
    border-color: #0f172a;
    background: linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%);
    box-shadow: 0 4px 14px rgba(15,23,42,0.10);
    transform: translateY(-1px);
  }
  .fb-replywidget-fbcard.is-active::after {
    content: "✓"; position: absolute; top: 14px; right: 16px;
    width: 22px; height: 22px;
    display: flex; align-items: center; justify-content: center;
    background: #0f172a; color: #fff;
    border-radius: 50%;
    font-size: 12px; font-weight: 700;
  }
  .fb-replywidget-fbcard input {
    appearance: none; -webkit-appearance: none;
    width: 0; height: 0; margin: 0; opacity: 0; position: absolute;
  }
  .fb-replywidget-fbtitle {
    font-size: 17px; font-weight: 700; color: #0a0a0a;
    letter-spacing: -0.01em;
  }
  .fb-replywidget-fbsub {
    font-size: 13.5px; color: #4b5563; line-height: 1.5;
  }

  /* Right-side preview */
  .fb-rwprev {
    background: #fff;
    border: 1px solid #e5e7eb; border-radius: 18px;
    padding: 26px 26px 22px;
    box-shadow: 0 1px 2px rgba(15,23,42,0.04),
                0 4px 16px rgba(15,23,42,0.04);
  }
  .fb-rwprev-h {
    font-size: 12px; font-weight: 700; letter-spacing: 0.06em;
    text-transform: uppercase; color: #6b7280; margin-bottom: 22px;
  }
  .fb-rwprev-timeline {
    list-style: none; padding: 0; margin: 0;
    position: relative;
  }
  .fb-rwprev-timeline::before {
    content: ""; position: absolute; left: 9px; top: 12px; bottom: 12px;
    width: 2px; background: linear-gradient(180deg, #e5e7eb 0%, #f1f5f9 100%);
  }
  .fb-rwprev-timeline li {
    position: relative; padding-left: 36px; margin-bottom: 22px;
  }
  .fb-rwprev-timeline li:last-child { margin-bottom: 0; }
  .fb-rwprev-dot {
    position: absolute; left: 0; top: 4px;
    width: 20px; height: 20px; border-radius: 50%;
    background: #fff; border: 3px solid #cbd5e1;
    box-shadow: 0 0 0 4px rgba(255,255,255,1);
  }
  .fb-rwprev-dot.is-cust { border-color: #2563eb; background: #2563eb; }
  .fb-rwprev-dot.is-ai { border-color: #16a34a; background: #16a34a; }
  .fb-rwprev-dot.is-custom { border-color: #d97706; background: #d97706; }
  .fb-rwprev-timeline li > div {
    display: flex; flex-direction: column; gap: 4px;
  }
  .fb-rwprev-timeline strong {
    font-size: 16px; font-weight: 700; color: #0a0a0a;
    letter-spacing: -0.01em;
  }
  .fb-rwprev-timeline span {
    font-size: 13.5px; color: #6b7280; font-weight: 500;
  }
  .fb-rwprev-custom {
    margin-top: 22px; padding: 18px 20px;
    background: linear-gradient(180deg, #fffbeb 0%, #fef3c7 100%);
    border: 1.5px solid #fde68a; border-radius: 12px;
  }
  .fb-rwprev-custom-h {
    font-size: 11px; font-weight: 700; letter-spacing: 0.06em;
    text-transform: uppercase; color: #92400e; margin-bottom: 8px;
  }
  .fb-rwprev-custom-body {
    font-size: 14.5px; color: #0a0a0a; line-height: 1.6;
    white-space: pre-wrap; word-wrap: break-word;
  }

  /* ── Template picker (centered overlay on empty canvas) ──────────── */
  .fb-tpl-bg {
    position: absolute; inset: 0;
    background: rgba(15,23,42,.16);
    display: flex; align-items: center; justify-content: center;
    padding: 20px;
    z-index: 12;
    animation: fbFade .18s ease-out;
  }
  .fb-tpl-card {
    background: #fff; border-radius: 18px;
    max-width: 720px; width: 100%;
    max-height: calc(100% - 40px); overflow-y: auto;
    box-shadow: 0 24px 60px rgba(15,23,42,.18);
    padding: 24px 26px 22px;
  }
  .fb-tpl-h { text-align: center; margin-bottom: 18px; }
  .fb-tpl-title {
    font-size: 22px; font-weight: 700; color: #0a0a0a;
    margin: 0 0 6px;
  }
  .fb-tpl-sub {
    font-size: 14px; color: #6b7280; margin: 0;
    line-height: 1.5;
  }
  .fb-tpl-grid {
    display: grid; grid-template-columns: 1fr 1fr; gap: 12px;
  }
  @media (max-width: 640px) {
    .fb-tpl-grid { grid-template-columns: 1fr; }
  }
  .fb-tpl-pick {
    display: flex; align-items: flex-start; gap: 12px;
    padding: 16px;
    background: #fff;
    border: 2px solid var(--fb-border);
    border-radius: 14px;
    cursor: pointer; text-align: left;
    font-family: inherit;
    transition: border-color .12s, transform .12s, box-shadow .12s;
  }
  .fb-tpl-pick:hover {
    border-color: var(--fb-green-soft);
    box-shadow: 0 8px 22px rgba(15,23,42,.08);
    transform: translateY(-1px);
  }
  .fb-tpl-pick.is-blank {
    background: #fafafa;
    border-style: dashed;
  }
  .fb-tpl-pick-ico {
    font-size: 28px; line-height: 1; flex-shrink: 0;
  }
  .fb-tpl-pick-text { flex: 1; min-width: 0; }
  .fb-tpl-pick-name {
    font-size: 15px; font-weight: 700; color: #0a0a0a;
    margin-bottom: 4px;
  }
  .fb-tpl-pick-sub {
    font-size: 12.5px; color: #6b7280; line-height: 1.45;
    margin-bottom: 6px;
  }
  .fb-tpl-pick-count {
    display: inline-block;
    font-size: 11px; font-weight: 700; color: var(--fb-green);
    background: #dcfce7; padding: 2px 8px; border-radius: 999px;
  }

  /* ── List view (numbered cards + arrows, branches as splits) ────── */
  .fb-list-wrap {
    flex: 1; min-height: 0;
    overflow-y: auto;
    padding: 28px 24px 60px;
    display: flex; flex-direction: column; align-items: center;
    gap: 0;
    background: #fafaf9;
  }
  .fb-list-root {
    display: flex; flex-direction: column; align-items: center;
    width: 100%; max-width: 640px;
  }
  .fb-list-divider {
    margin: 28px 0 14px;
    font-size: 11px; font-weight: 700; color: #9ca3af;
    letter-spacing: .05em; text-transform: uppercase;
  }
  .fb-list-card {
    width: 100%; max-width: 520px;
    display: grid;
    grid-template-columns: 32px 28px 1fr auto;
    align-items: center;
    gap: 12px;
    background: #fff;
    border: 1px solid var(--fb-border);
    border-radius: 14px;
    padding: 14px 16px;
    box-shadow: 0 1px 2px rgba(15,23,42,.04),
                0 4px 14px rgba(15,23,42,.04);
  }
  .fb-list-card.is-branch {
    background: linear-gradient(180deg, #fff 0%, #fafaf9 100%);
    border-color: #c7d2fe;
  }
  .fb-list-num {
    width: 28px; height: 28px; border-radius: 50%;
    background: var(--fb-green); color: #fff;
    font-size: 13px; font-weight: 700;
    display: inline-flex; align-items: center; justify-content: center;
    flex-shrink: 0;
  }
  .fb-list-card.is-branch .fb-list-num { background: #6366f1; }
  .fb-list-ico { font-size: 22px; line-height: 1; flex-shrink: 0; }
  .fb-list-text { min-width: 0; }
  .fb-list-trigger {
    font-size: 10.5px; font-weight: 700; color: #6b7280;
    letter-spacing: .04em; margin-bottom: 3px;
  }
  .fb-list-title {
    font-size: 15px; font-weight: 700; color: #0a0a0a;
    margin-bottom: 2px;
  }
  .fb-list-desc {
    font-size: 12.5px; color: #6b7280; line-height: 1.4;
  }
  .fb-list-sub {
    margin-top: 6px;
    font-size: 12.5px; color: #1c1c1e;
    line-height: 1.4;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .fb-list-edit {
    background: none; border: 1px solid var(--fb-border);
    color: var(--fb-green); font: 600 12.5px inherit;
    padding: 6px 12px; border-radius: 999px;
    cursor: pointer;
    align-self: center;
  }
  .fb-list-edit:hover { background: #f0fdf4; border-color: #bbf7d0; }

  .fb-list-arrow {
    font-size: 20px; color: #9ca3af;
    line-height: 1; padding: 6px 0;
  }
  /* The split: yes-path on the left, no-path on the right. Stays
     readable side-by-side until the canvas narrows. */
  .fb-list-split {
    display: grid; grid-template-columns: 1fr 1fr; gap: 14px;
    width: 100%; max-width: 760px;
    margin-top: 4px;
  }
  @media (max-width: 720px) {
    .fb-list-split { grid-template-columns: 1fr; }
  }
  .fb-list-path {
    display: flex; flex-direction: column; align-items: center;
    background: #fff;
    border: 1px solid var(--fb-border);
    border-radius: 14px;
    padding: 14px 12px 16px;
  }
  .fb-list-path.is-yes { border-color: #bbf7d0; background: #f7fef9; }
  .fb-list-path.is-no  { border-color: #e5e7eb; background: #fafafa; }
  .fb-list-path-h {
    display: inline-flex; align-items: center; gap: 8px;
    font-size: 12.5px; font-weight: 700; color: #166534;
    margin-bottom: 12px;
  }
  .fb-list-path.is-no .fb-list-path-h { color: #4b5563; }
  .fb-list-path-ico {
    width: 22px; height: 22px; border-radius: 50%;
    background: #16a34a; color: #fff;
    display: inline-flex; align-items: center; justify-content: center;
    font-size: 12px; font-weight: 700;
  }
  .fb-list-path-ico.is-no { background: #9ca3af; }
  .fb-list-empty {
    font-size: 12.5px; color: #9ca3af; text-align: center;
    padding: 14px 8px; line-height: 1.5;
  }

  /* Empty state on the list when there are no nodes at all. */
  .fb-list-blank {
    flex: 1; display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    text-align: center; gap: 8px; padding: 60px 20px;
    color: #6b7280;
  }
  .fb-list-blank-ico { font-size: 40px; }
  .fb-list-blank-h {
    font-size: 17px; font-weight: 700; color: #0a0a0a;
  }
  .fb-list-blank-p {
    font-size: 13.5px; line-height: 1.5; max-width: 380px;
  }

  /* ── "What comes next?" chooser ─────────────────────────────────── */
  .fb-chooser-bg {
    position: absolute; inset: 0;
    background: rgba(15,23,42,.18);
    display: flex; align-items: center; justify-content: center;
    padding: 20px;
    z-index: 14;
    animation: fbFade .15s ease-out;
  }
  .fb-chooser-card {
    background: #fff; border-radius: 16px;
    max-width: 460px; width: 100%;
    max-height: calc(100% - 40px); overflow: hidden;
    display: flex; flex-direction: column;
    box-shadow: 0 24px 60px rgba(15,23,42,.20);
  }
  .fb-chooser-h {
    display: flex; align-items: center; justify-content: space-between;
    padding: 16px 20px 12px;
    border-bottom: 1px solid var(--fb-border);
  }
  .fb-chooser-title {
    font-size: 16px; font-weight: 700; color: #0a0a0a;
    margin: 0;
  }
  .fb-chooser-x {
    background: none; border: 0; font-size: 22px;
    color: #9ca3af; cursor: pointer; padding: 0 6px; line-height: 1;
  }
  .fb-chooser-x:hover { color: #0a0a0a; }
  .fb-chooser-body {
    flex: 1; overflow-y: auto;
    padding: 8px 12px 14px;
  }
  .fb-chooser-section { margin-bottom: 10px; }
  .fb-chooser-section-h {
    font-size: 11px; font-weight: 700; color: #4b5563;
    letter-spacing: .04em; text-transform: uppercase;
    margin: 8px 6px 4px;
  }
  .fb-chooser-row {
    width: 100%; display: flex; align-items: flex-start; gap: 10px;
    padding: 10px 12px;
    background: #fff; border: 1px solid var(--fb-border);
    border-radius: 10px;
    margin-bottom: 6px;
    cursor: pointer; text-align: left;
    font: inherit;
    transition: border-color .12s, box-shadow .12s, transform .12s;
  }
  .fb-chooser-row:hover {
    border-color: var(--fb-green-soft);
    box-shadow: 0 4px 12px rgba(15,23,42,.06);
    transform: translateY(-1px);
  }
  .fb-chooser-row.is-locked {
    cursor: not-allowed; opacity: .55;
  }
  .fb-chooser-row.is-locked:hover {
    border-color: var(--fb-border); box-shadow: none; transform: none;
  }
  .fb-chooser-ico {
    font-size: 20px; line-height: 1.1; flex-shrink: 0;
  }
  .fb-chooser-text { flex: 1; min-width: 0; }
  .fb-chooser-name {
    display: block;
    font-size: 14px; font-weight: 600; color: #0a0a0a;
    margin-bottom: 2px;
  }
  .fb-chooser-sub {
    display: block;
    font-size: 12px; color: #6b7280; line-height: 1.4;
  }
  .fb-chooser-badge {
    align-self: center; flex-shrink: 0;
    font-size: 10.5px; font-weight: 700;
    padding: 2px 7px; border-radius: 999px;
    background: #dcfce7; color: #166534;
    letter-spacing: .04em;
  }

  /* "Use a template" button in library header */
  .fb-library-tpl-btn {
    margin: 8px 12px 4px;
    padding: 8px 12px;
    background: #fffbeb; border: 1px solid #fde68a;
    color: #92400e;
    border-radius: 8px;
    font: 600 12.5px inherit; cursor: pointer;
    text-align: left;
  }
  .fb-library-tpl-btn:hover {
    background: #fef3c7; border-color: #fcd34d;
  }

  /* Drawer footer */
  .fb-drawer-foot {
    display: flex; align-items: center; justify-content: space-between;
    padding: 14px 22px 18px;
    border-top: 1px solid var(--fb-border);
  }
  .fb-drawer-del {
    background: none; border: 1px solid #fecaca; color: #b91c1c;
    padding: 8px 14px; border-radius: 8px;
    font: 500 13px inherit; cursor: pointer;
  }
  .fb-drawer-del:hover { background: #fef2f2; }
  .fb-drawer-done {
    background: var(--fb-green); color: #fff; border: 0;
    padding: 9px 18px; border-radius: 999px;
    font: 700 13px inherit; cursor: pointer;
  }
  .fb-drawer-done:hover { background: #15803d; }
`;

// Step-by-step tour strip on the canvas. Each step explains one
// feature AND glows the actual UI element it describes — so a user
// always sees both the words and the thing the words refer to.
//
// `target` is a CSS selector. The tour effect adds a temporary
// .fb-tour-highlight class to the matching element, which gives it a
// glowing ring (CSS keyframe). null target = no highlight (intro).
// Tour is path-based. Each path has its own ordered steps. The "main"
// path is the canvas overview. Sub-paths (e.g. "chooser") are entered
// via a step's `enterPath` directive — the demo button clicks the
// target AND switches to the sub-path. When the sub-path runs out of
// steps, the tour returns to the main path one step PAST where it
// branched (so the user moves forward, not in circles).
const TOUR_PATHS = {
  main: [
    {
      icon: "👋",
      title: "This is your flow.",
      body: (
        <>
          Each card is something that happens automatically when someone
          fills out your form. Right now it just says hi to them.
        </>
      ),
      // pinTo overrides target-anchored positioning. The intro/overview
      // step doesn't point at any single element — it talks about the
      // whole canvas. Sit it top-center near the canvas top edge.
      pinTo: "top-center",
    },
    {
      icon: "➕",
      title: "Add a step here.",
      body: (
        <>
          See the green <strong style={{ color: "#0a8a3a" }}>+ Next</strong>{" "}
          button on the card? Tap it to open a list of things you can add.
        </>
      ),
      target: ".fb-next-btn",
      demoSelector: ".fb-next-btn",
      demoLabel: "Show me what's inside",
      // After the demo click opens the chooser modal, branch into the
      // chooser sub-path so the tour keeps guiding through what's there.
      enterPath: "chooser",
    },
    {
      icon: "✏️",
      title: "Tap a card to change it.",
      body: (
        <>
          Click any card and a panel slides in to edit its message,
          wait time, or what it does.
        </>
      ),
      target: ".fb-card",
    },
    {
      icon: "💾",
      title: "We save as you build.",
      body: (
        <>
          Don't worry about losing work. When you're done, tap{" "}
          <strong>← Back to your form</strong> (top right) to keep
          building your form.
        </>
      ),
      target: ".fb-return-pill",
    },
  ],
  // Sub-path: "What comes next?" chooser modal. Tour stays visible
  // INSIDE the modal because data-sub="1" exempts the panel from
  // hide-during-modal. Targets are scoped to elements inside the modal.
  chooser: [
    {
      icon: "🎯",
      title: "Pick what happens next.",
      body: (
        <>
          Each row is a kind of step. A text, an email, a wait, an AI
          reply — pick the one that fits what you want to happen.
        </>
      ),
      target: ".fb-chooser-card",
    },
    {
      icon: "🖱️",
      title: "Tap any row to add it.",
      body: (
        <>
          Click a row and that step shows up in your flow. Don't worry —
          you can change the message later by tapping the card.
        </>
      ),
      target: ".fb-chooser-row",
    },
    {
      icon: "✨",
      title: "All set?",
      body: (
        <>
          Tap <strong>Next →</strong> and we'll close this list and
          take you back to your flow with more tips.
        </>
      ),
      target: ".fb-chooser-x, [aria-label='Close']",
      // When the user clicks Next on this step, programmatically click
      // the chooser's close button to dismiss the modal before
      // returning to the main path.
      closeOnAdvance: ".fb-chooser-x, .fb-chooser-bg [aria-label='Close']",
    },
  ],
};

// Compute tour panel position relative to its target. Tries below
// first, then above, then falls back to a viewport corner. Returns
// the {top, left} CSS values + which side the arrow points from.
function computeTourPosition(targetSelector, panelW = 360, panelH = 150) {
  const margin = 14;
  const fallback = { top: 14, left: 14, arrow: null };
  if (!targetSelector || typeof document === "undefined") return fallback;
  const el = document.querySelector(targetSelector);
  if (!el) return fallback;
  const rect = el.getBoundingClientRect();
  const vw = window.innerWidth, vh = window.innerHeight;
  // Center horizontally on the target, then clamp into viewport.
  const desiredLeft = rect.left + rect.width / 2 - panelW / 2;
  const left = Math.max(14, Math.min(desiredLeft, vw - panelW - 14));
  const spaceBelow = vh - rect.bottom;
  if (spaceBelow >= panelH + margin + 12) {
    return { top: rect.bottom + margin + 12, left, arrow: "up",
              arrowOffset: rect.left + rect.width / 2 - left };
  }
  if (rect.top >= panelH + margin + 12) {
    return { top: rect.top - panelH - margin - 12, left, arrow: "down",
              arrowOffset: rect.left + rect.width / 2 - left };
  }
  return fallback;
}

function FirstTimeGuide() {
  const [show, setShow] = React.useState(false);
  // Path-based state. `path` is a key into TOUR_PATHS. `pathHistory`
  // is the breadcrumb for "where to return when this sub-path ends."
  const [tour, setTour] = React.useState({ path: "main", step: 0, pathHistory: [] });
  const [position, setPosition] = React.useState({ top: 14, left: 14, arrow: null });
  React.useEffect(() => {
    try {
      const fromForm = !!localStorage.getItem("intake_return_form_id");
      const dismissed = localStorage.getItem("fb_tour_dismissed_v3") === "1";
      const savedRaw = localStorage.getItem("fb_tour_state_v3");
      const savedTs  = parseInt(localStorage.getItem("fb_tour_ts_v3") || "0", 10);
      let restored = null;
      if (savedRaw && savedTs && (Date.now() - savedTs) < 7*24*60*60*1000) {
        try { restored = JSON.parse(savedRaw); } catch(_){}
      }
      if (restored && TOUR_PATHS[restored.path]) {
        const max = (TOUR_PATHS[restored.path].length || 1) - 1;
        setTour({
          path: restored.path,
          step: Math.max(0, Math.min(restored.step|0, max)),
          pathHistory: Array.isArray(restored.pathHistory) ? restored.pathHistory : [],
        });
      }
      setShow(fromForm || !dismissed);
    } catch (_) { setShow(true); }
  }, []);
  // Listen for the floating ? button's replay event. Resets state to
  // step 0 of main path and shows the tour, without reloading the page.
  React.useEffect(() => {
    const onReplay = () => {
      setTour({ path: "main", step: 0, pathHistory: [] });
      setShow(true);
    };
    window.addEventListener("fb-tour-replay", onReplay);
    return () => window.removeEventListener("fb-tour-replay", onReplay);
  }, []);
  const persistTour = React.useCallback((t) => {
    try {
      localStorage.setItem("fb_tour_state_v3", JSON.stringify(t));
      localStorage.setItem("fb_tour_ts_v3", String(Date.now()));
    } catch (_) {}
  }, []);
  const dismiss = React.useCallback(() => {
    try {
      localStorage.setItem("fb_tour_dismissed_v3", "1");
      localStorage.removeItem("fb_tour_state_v3");
      localStorage.removeItem("fb_tour_ts_v3");
    } catch (_) {}
    setShow(false);
  }, []);
  // Resolve the active step from the current path.
  const steps = TOUR_PATHS[tour.path] || TOUR_PATHS.main;
  const cur = steps[tour.step] || steps[0];
  const isLastInPath = tour.step >= steps.length - 1;
  const isOnSubPath = tour.path !== "main";
  // Highlight effect — applies .fb-tour-highlight to the current
  // step's target AND positions the tour panel next to that target
  // with an arrow tip. Retries because ReactFlow / chooser modal
  // may not have painted yet. Re-positions on window resize.
  React.useEffect(() => {
    if (!show) return;
    const sel = cur && cur.target;
    if (!sel) {
      setPosition({ top: 14, left: 14, arrow: null });
      return;
    }
    const cleanup = [];
    let attempts = 0;
    let stop = false;
    const recomputePosition = () => {
      setPosition(computeTourPosition(sel));
    };
    const apply = () => {
      if (stop) return;
      const el = document.querySelector(sel);
      if (el) {
        el.classList.add("fb-tour-highlight");
        cleanup.push(() => el.classList.remove("fb-tour-highlight"));
        recomputePosition();
        // Re-compute on resize/scroll while this step is active.
        window.addEventListener("resize", recomputePosition);
        window.addEventListener("scroll", recomputePosition, true);
        cleanup.push(() => {
          window.removeEventListener("resize", recomputePosition);
          window.removeEventListener("scroll", recomputePosition, true);
        });
        return;
      }
      if (attempts++ < 12) setTimeout(apply, 120);
    };
    apply();
    return () => {
      stop = true;
      cleanup.forEach((fn) => { try { fn(); } catch (_) {} });
      document.querySelectorAll(".fb-tour-highlight").forEach(
        (n) => n.classList.remove("fb-tour-highlight"));
    };
  }, [show, tour.path, tour.step, cur]);
  // If the user is on a sub-path and the modal closes (the underlying
  // element vanishes), gracefully pop back to the main path. Watch
  // for the chooser disappearing.
  React.useEffect(() => {
    if (!show || !isOnSubPath) return;
    const checker = setInterval(() => {
      if (!document.querySelector(".fb-chooser-card") &&
          !document.querySelector(".fb-template-picker") &&
          !document.querySelector(".fb-drawer")) {
        // Modal closed — pop back to main path at the saved return step.
        setTour((t) => {
          if (t.path === "main") return t;
          const popped = (t.pathHistory || []).slice();
          const ret = popped.pop() || { path: "main", returnStep: 0 };
          const next = { path: ret.path, step: ret.returnStep, pathHistory: popped };
          persistTour(next);
          return next;
        });
      }
    }, 300);
    return () => clearInterval(checker);
  }, [show, isOnSubPath, persistTour]);
  const next = React.useCallback(() => {
    setTour((t) => {
      const list = TOUR_PATHS[t.path] || TOUR_PATHS.main;
      const cur = list[t.step];
      // If this step has closeOnAdvance, click the matching element
      // before transitioning. That's how we close a modal automatically
      // when the user finishes its sub-path tour.
      if (cur && cur.closeOnAdvance) {
        const closeEl = document.querySelector(cur.closeOnAdvance);
        if (closeEl) { try { closeEl.click(); } catch (_) {} }
      }
      const ns = t.step + 1;
      if (ns >= list.length) {
        // Path complete. Pop history if any, else dismiss.
        if (t.pathHistory && t.pathHistory.length > 0) {
          const popped = t.pathHistory.slice();
          const ret = popped.pop();
          const next = { path: ret.path, step: ret.returnStep, pathHistory: popped };
          persistTour(next); return next;
        }
        dismiss(); return t;
      }
      const next = { ...t, step: ns };
      persistTour(next); return next;
    });
  }, [dismiss, persistTour]);
  const back = React.useCallback(() => {
    setTour((t) => {
      const ns = Math.max(0, t.step - 1);
      const next = { ...t, step: ns };
      persistTour(next); return next;
    });
  }, [persistTour]);
  // Click the demo target AND, if the step has enterPath, branch into
  // the sub-path so the tour continues guiding inside the modal.
  const showMe = React.useCallback((sel, enterPathName) => {
    if (!sel) return;
    let attempts = 0;
    const tryClick = () => {
      const el = document.querySelector(sel);
      if (el) {
        try { el.click(); } catch (_) {}
        if (enterPathName && TOUR_PATHS[enterPathName]) {
          // Push the current main-path position so we can return to
          // (currentStep + 1) when the sub-path ends.
          setTour((t) => {
            const next = {
              path: enterPathName,
              step: 0,
              pathHistory: (t.pathHistory || []).concat([
                { path: t.path, returnStep: Math.min(t.step + 1,
                  (TOUR_PATHS[t.path] || []).length - 1) },
              ]),
            };
            persistTour(next); return next;
          });
        }
        return;
      }
      if (attempts++ < 6) setTimeout(tryClick, 100);
    };
    tryClick();
  }, [persistTour]);
  if (!show) return null;
  // For sub-paths the panel stays VISIBLE even when a modal is open —
  // it's intentionally guiding through the modal. data-sub="1" tells
  // the hide-during-modal CSS to leave us alone.
  const isLast = isLastInPath && (tour.pathHistory || []).length === 0;
  // ONE fixed position for every step. The user doesn't have to
  // chase the Next button across the screen — Skip / Show me / Back /
  // Next sit in the SAME pixel coordinates regardless of which step
  // is active. The yellow halo on the active target tells you which
  // element is being described; the panel doesn't move.
  const panelStyle = {
    position: "fixed",
    top: 18,
    left: "50%",
    transform: "translateX(-50%)",
    zIndex: 60,
    width: "min(440px, calc(100% - 80px))",
  };
  const hasAnchor = false;  // arrow tips no longer needed
  return (
    <div
      className="fb-tour-panel"
      data-sub={isOnSubPath ? "1" : "0"}
      style={{
        ...panelStyle,
        background: "linear-gradient(135deg,#fff8db 0%,#fef0c8 100%)",
        border: "2px solid #f0c419",
        borderRadius: 14,
        padding: "14px 16px 12px 14px",
        boxShadow: "0 14px 36px rgba(160,110,0,.20), 0 4px 10px rgba(160,110,0,.12)",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      {/* Arrow tip pointing at the target. Position: arrowOffset is
          the px from the panel's LEFT to the target's center, so the
          arrow lines up regardless of clamping. */}
      {hasAnchor && position.arrow === "up" && (
        <span style={{
          position: "absolute", top: -10,
          left: Math.max(12, Math.min(position.arrowOffset - 9, 360 - 22)),
          width: 0, height: 0,
          borderLeft: "10px solid transparent",
          borderRight: "10px solid transparent",
          borderBottom: "10px solid #f0c419",
        }}>
          <span style={{
            position: "absolute", top: 2, left: -8,
            width: 0, height: 0,
            borderLeft: "8px solid transparent",
            borderRight: "8px solid transparent",
            borderBottom: "8px solid #fff8db",
          }} />
        </span>
      )}
      {hasAnchor && position.arrow === "down" && (
        <span style={{
          position: "absolute", bottom: -10,
          left: Math.max(12, Math.min(position.arrowOffset - 9, 360 - 22)),
          width: 0, height: 0,
          borderLeft: "10px solid transparent",
          borderRight: "10px solid transparent",
          borderTop: "10px solid #f0c419",
        }}>
          <span style={{
            position: "absolute", bottom: 2, left: -8,
            width: 0, height: 0,
            borderLeft: "8px solid transparent",
            borderRight: "8px solid transparent",
            borderTop: "8px solid #fef0c8",
          }} />
        </span>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div
          style={{
            fontSize: 26,
            flex: "0 0 auto",
            background: "#fff",
            width: 42,
            height: 42,
            borderRadius: 11,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 1px 3px rgba(20,40,80,.08)",
          }}
        >{cur.icon}</div>
        <div style={{ flex: 1, minWidth: 0, lineHeight: 1.4 }}>
          <div style={{ fontWeight: 700, fontSize: 14.5, color: "#0a0a0a", marginBottom: 2 }}>
            {cur.title}
          </div>
          <div style={{ fontSize: 13, color: "#5a6470" }}>
            {cur.body}
          </div>
        </div>
        <button
          type="button"
          onClick={dismiss}
          style={{
            background: "transparent",
            border: 0,
            color: "#5a6470",
            cursor: "pointer",
            fontSize: 12.5,
            fontWeight: 600,
            padding: "6px 8px",
            flex: "0 0 auto",
          }}
          aria-label="Skip the tour"
        >Skip</button>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {/* Progress dots — for current path only. Sub-paths show their
            own little progress so the user has a sense of "almost done
            with this side trip." */}
        <div style={{ display: "flex", gap: 5, flex: 1 }}>
          {steps.map((_t, i) => (
            <span
              key={i}
              style={{
                width: i === tour.step ? 22 : 6,
                height: 6,
                borderRadius: 99,
                background: i <= tour.step ? "#185fa5" : "#cdd7e3",
                transition: "width .18s ease, background .18s ease",
              }}
            />
          ))}
          {isOnSubPath && (
            <span style={{
              fontSize: 11, color: "#5a6470", fontWeight: 600,
              marginLeft: 6, alignSelf: "center",
            }}>side trip</span>
          )}
        </div>
        {cur.demoSelector && (
          <button
            type="button"
            onClick={() => showMe(cur.demoSelector, cur.enterPath)}
            style={{
              background: "#fff8db",
              color: "#7a5a00",
              border: "1px solid #f0c419",
              borderRadius: 8,
              padding: "6px 12px",
              fontWeight: 700,
              fontSize: 13,
              cursor: "pointer",
              flex: "0 0 auto",
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
            }}
            title="Show me what this does"
          >✨ {cur.demoLabel || "Show me"}</button>
        )}
        {tour.step > 0 && (
          <button
            type="button"
            onClick={back}
            style={{
              background: "transparent",
              color: "#185fa5",
              border: "1px solid #cdd7e3",
              borderRadius: 8,
              padding: "6px 12px",
              fontWeight: 600,
              fontSize: 13,
              cursor: "pointer",
              flex: "0 0 auto",
            }}
          >← Back</button>
        )}
        <button
          type="button"
          onClick={next}
          style={{
            background: isLast ? "#0a8a3a" : "#185fa5",
            color: "#fff",
            border: 0,
            borderRadius: 8,
            padding: "7px 16px",
            fontWeight: 700,
            fontSize: 13,
            cursor: "pointer",
            flex: "0 0 auto",
          }}
        >{isLast ? "Got it ✓" : "Next →"}</button>
      </div>
    </div>
  );
}

// Floating help button bottom-right of the canvas. Tap to restart
// the tour from step 0. Always visible so users can re-find guidance
// after they've dismissed it.
function TourReplayButton() {
  const replay = React.useCallback(() => {
    try {
      localStorage.removeItem("fb_tour_dismissed_v3");
      localStorage.removeItem("fb_tour_state_v3");
      localStorage.removeItem("fb_tour_ts_v3");
    } catch (_) {}
    // Tell FirstTimeGuide to re-mount its tour at step 0 — no reload.
    try {
      window.dispatchEvent(new CustomEvent("fb-tour-replay"));
    } catch (_) {}
  }, []);
  return (
    <button
      type="button"
      className="fb-tour-replay"
      onClick={replay}
      title="Show the tour again"
      aria-label="Show the tour again"
      style={{
        position: "absolute",
        top: 16,
        left: 16,
        zIndex: 25,
        width: 36, height: 36,
        borderRadius: 99,
        background: "#fff",
        border: "1.5px solid #cdd7e3",
        color: "#185fa5",
        cursor: "pointer",
        fontWeight: 700,
        fontSize: 18,
        lineHeight: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: "0 3px 10px rgba(20,40,80,.10)",
        transition: "transform .12s ease, box-shadow .12s ease",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "scale(1.08)";
        e.currentTarget.style.boxShadow = "0 6px 18px rgba(20,40,80,.16)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "";
        e.currentTarget.style.boxShadow = "0 3px 10px rgba(20,40,80,.10)";
      }}
    >?</button>
  );
}

// Pill that appears in the canvas top-right when the user arrived
// here via a form's "Add more steps" button. Tapping it returns to
// the lead-intake page; the breadcrumb (still in localStorage) makes
// the form-builder modal re-open at the form they were editing.
function ReturnToFormBanner() {
  const [show, setShow] = React.useState(false);
  React.useEffect(() => {
    try {
      const fid = localStorage.getItem("intake_return_form_id");
      const ts  = parseInt(localStorage.getItem("intake_return_form_ts") || "0", 10);
      if (fid && ts && (Date.now() - ts) < 30 * 60 * 1000) {
        setShow(true);
      }
    } catch (_) {}
  }, []);
  if (!show) return null;
  return (
    <a
      className="fb-return-pill"
      href="/dashboard#leadIntake"
      style={{
        position: "absolute",
        top: 12,
        right: 14,
        // Highest UI z-index in the canvas — must stay above tour
        // panel, save indicator, and any Vite-injected helpers so it's
        // never hidden by another popup.
        zIndex: 70,
        background: "linear-gradient(135deg,#fff7e0 0%,#fef0c8 100%)",
        border: "1.5px solid #f0c419",
        color: "#7a5a00",
        textDecoration: "none",
        padding: "8px 14px",
        borderRadius: 99,
        fontSize: 13,
        fontWeight: 600,
        boxShadow: "0 4px 14px rgba(40,30,0,.14)",
        display: "flex",
        alignItems: "center",
        gap: 8,
      }}
      title="Return to the form you were editing"
    >
      <span>← Done? Back to your form</span>
    </a>
  );
}

export default function FlowBuilder() {
  const [nodes, setNodes] = React.useState(INITIAL_NODES);
  const [edges, setEdges] = React.useState(INITIAL_EDGES);
  const [collapsed, setCollapsed] = React.useState(false);
  const [rfInstance, setRfInstance] = React.useState(null);
  const [isDropTarget, setIsDropTarget] = React.useState(false);
  // Selected node ID drives the message-editor drawer. Click a card on
  // the canvas → drawer opens. Click outside / press Esc / hit Done →
  // drawer closes.
  const [selectedNodeId, setSelectedNodeId] = React.useState(null);
  // ── Persistence ───────────────────────────────────────────────────
  // Load the saved flow from /me/flows/default on mount. After load
  // the canvas is "hydrated" — until then we suppress saves so we
  // don't overwrite the server with our pre-load empty state.
  // Declared early because showPicker (below) reads it.
  const [hydrated, setHydrated] = React.useState(false);

  // Template picker: shown when the canvas is empty AND the user
  // hasn't picked "Start blank" yet. Re-openable via the library
  // panel's "Use a template" button.
  const [pickerDismissed, setPickerDismissed] = React.useState(false);
  // Don't show the template picker until the initial load + any seed
  // has settled — otherwise it flashes for a beat on every mount and
  // the user thinks they missed a popup.
  const showPicker = hydrated && nodes.length === 0 && !pickerDismissed;

  // "What comes next?" chooser. Opened by the "+" button on any card
  // (or by the Yes/No buttons on a branch). When the user picks an
  // activity, we create the new node + edge in one shot.
  const [chooser, setChooser] = React.useState(null); // { sourceId, sourceHandle? }
  // saveStatus drives the indicator: "idle" | "saving" | "saved" | "error".
  const [saveStatus, setSaveStatus] = React.useState("idle");
  // View mode: "canvas" (drag-and-drop) or "list" (numbered arrowed list).
  // Persisted in localStorage so the user comes back to the same view.
  const [viewMode, setViewMode] = React.useState(() => {
    try { return localStorage.getItem("fb.viewMode") || "canvas"; }
    catch (_) { return "canvas"; }
  });
  React.useEffect(() => {
    try { localStorage.setItem("fb.viewMode", viewMode); } catch (_) {}
  }, [viewMode]);

  // Per-form flow routing: when the user arrived via a form's
  // "Add more steps" round-trip (intake_return_form_id breadcrumb),
  // load AND save against /me/forms/<form_id>/flow instead of the
  // shared /me/flows/default. Each form keeps its own canvas state,
  // and DELETE on the parent form cascades to clean it up.
  const formId = React.useMemo(() => {
    try {
      return localStorage.getItem("intake_return_form_id") || "";
    } catch (_) { return ""; }
  }, []);
  const flowEndpoint = formId
    ? `/me/forms/${encodeURIComponent(formId)}/flow`
    : "/me/flows/default";

  // Canvas state machine — three explicit entry-path states:
  //   STATE A (blank): no formId AND no saved flow → leave canvas
  //     empty so the TemplatePicker overlay shows. No fake seed.
  //   STATE B (loaded): saved flow exists → load and display verbatim.
  //   STATE C (form-attached): formId set and no saved flow yet →
  //     seed first_contact AND persist immediately so a refresh
  //     returns the saved flow (idempotent — never duplicates).
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      let hasSavedFlow = false;
      try {
        const r = await fetch(flowEndpoint,
          { credentials: "same-origin" });
        if (cancelled) return;
        if (r.ok) {
          const d = await r.json().catch(() => ({}));
          if (d && d.flow && Array.isArray(d.flow.nodes) && d.flow.nodes.length > 0) {
            // STATE B / form-attached-already-saved
            setNodes(d.flow.nodes);
            setEdges(Array.isArray(d.flow.edges) ? d.flow.edges : []);
            setPickerDismissed(true);
            hasSavedFlow = true;
          }
        }
      } catch (_) { /* swallow — work offline */ }
      if (!cancelled && !hasSavedFlow && formId) {
        // STATE C — auto-create the form-attached flow and persist
        // immediately so subsequent loads see it as "saved." The
        // debounced autosave covers later edits; this initial save
        // makes the auto-create idempotent.
        const seed = buildFromTemplate({ activityIds: ["first_contact"] });
        setNodes(seed.nodes);
        setEdges(seed.edges);
        setPickerDismissed(true);
        try {
          await fetch(flowEndpoint, {
            method: "POST", credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ nodes: seed.nodes, edges: seed.edges }),
          });
        } catch (_) { /* the autosave will pick this up next edit */ }
      }
      // STATE A is implicit: nodes stays empty, pickerDismissed stays
      // false, so the TemplatePicker overlay renders the "build your
      // first flow" choices.
      if (!cancelled) setHydrated(true);
    })();
    return () => { cancelled = true; };
  }, [flowEndpoint, formId]);

  // Debounced save: any change to nodes/edges schedules a save 800ms
  // after the last edit. Drag-while-dragging coalesces into one save.
  const saveTimerRef = React.useRef(null);
  React.useEffect(() => {
    if (!hydrated) return; // don't save before initial load completes
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      setSaveStatus("saving");
      try {
        const r = await fetch(flowEndpoint, {
          method: "POST", credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nodes, edges }),
        });
        if (!r.ok) throw new Error("save_failed");
        setSaveStatus("saved");
      } catch (_) {
        setSaveStatus("error");
      }
    }, 800);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [nodes, edges, hydrated, flowEndpoint]);

  const openChooser = React.useCallback((info) => setChooser(info), []);
  const closeChooser = React.useCallback(() => setChooser(null), []);

  const flowContextValue = React.useMemo(
    () => ({ openChooser }), [openChooser]);

  const applyTemplate = React.useCallback((tpl) => {
    const { nodes: tNodes, edges: tEdges } = buildFromTemplate(tpl);
    setNodes(tNodes);
    setEdges(tEdges);
    setPickerDismissed(true);
    // Re-fit so the new chain is centered.
    requestAnimationFrame(() => {
      if (rfInstance && typeof rfInstance.fitView === "function") {
        rfInstance.fitView({ padding: 0.25, duration: 280 });
      }
    });
  }, [rfInstance]);

  const onNodeClick = React.useCallback((_event, node) => {
    setSelectedNodeId(node.id);
  }, []);

  // Editor → canvas: merge edited fields into the clicked node's data.
  const updateNodeData = React.useCallback((id, patch) => {
    setNodes((ns) => ns.map(n =>
      n.id === id ? { ...n, data: { ...n.data, ...patch } } : n));
  }, []);

  // Re-stitch on delete: connect the deleted node's source(s) to its
  // target(s) so a 5-step linear flow stays a 4-step linear flow when
  // you remove one in the middle. Branching cases (multiple outputs)
  // get handled in a later milestone — for now we just drop the
  // node + all its edges and let the user redraw connections.
  const deleteNode = React.useCallback((id) => {
    setEdges((es) => {
      const incoming = es.filter(e => e.target === id);
      const outgoing = es.filter(e => e.source === id);
      const kept = es.filter(e => e.source !== id && e.target !== id);
      // If the node had exactly 1 incoming and exactly 1 outgoing edge,
      // bridge them so the flow stays connected.
      if (incoming.length === 1 && outgoing.length === 1) {
        kept.push({
          id: `e-${incoming[0].source}-${outgoing[0].target}`,
          source: incoming[0].source,
          target: outgoing[0].target,
          animated: true,
          style: { stroke: "#16a34a", strokeWidth: 2.5 },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: "#16a34a",
            width: 18,
            height: 18,
          },
        });
      }
      return kept;
    });
    setNodes((ns) => ns.filter(n => n.id !== id));
    setSelectedNodeId(null);
  }, []);

  const selectedNode = React.useMemo(
    () => nodes.find(n => n.id === selectedNodeId) || null,
    [nodes, selectedNodeId]);
  const selectedActivity = selectedNode
    ? ACTIVITY_BY_ID[selectedNode.data?.activityId] || null
    : null;

  const onNodesChange = React.useCallback(
    (changes) => setNodes((ns) => applyNodeChanges(changes, ns)), []);
  const onEdgesChange = React.useCallback(
    (changes) => setEdges((es) => applyEdgeChanges(changes, es)), []);
  const onConnect = React.useCallback(
    (params) => setEdges((es) => {
      const handle = params.sourceHandle || "";
      const stroke = handle === "no" ? "#9ca3af" : "#16a34a";
      return addEdge({
        ...params,
        animated: true,
        style: { stroke, strokeWidth: 2.5 },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: stroke,
          width: 18,
          height: 18,
        },
      }, es);
    }),
    []);

  const onDragOver = React.useCallback((event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setIsDropTarget(true);
  }, []);
  const onDragLeave = React.useCallback(() => setIsDropTarget(false), []);

  const onDrop = React.useCallback((event) => {
    event.preventDefault();
    setIsDropTarget(false);
    const activityId = event.dataTransfer.getData("application/reactflow");
    if (!activityId) return;
    const activity = ACTIVITY_BY_ID[activityId];
    if (!activity) return;

    // Refuse duplicate triggers — one "First hello" per flow makes
    // sense; if the user tries again, no-op silently.
    if (activity.oneOfAKind &&
        nodes.some(n => n.data && n.data.activityId === activityId)) {
      return;
    }

    const position = rfInstance
      ? rfInstance.screenToFlowPosition({ x: event.clientX, y: event.clientY })
      : { x: 200, y: 200 };

    const newId = `${activityId}_${shortId()}`;
    // Logic activities (branch) use a different node type with two
    // labeled outputs and a single input.
    const nodeType = activity.kind === "logic" ? "branch" : "activity";
    const newNode = {
      id: newId,
      type: nodeType,
      position,
      data: {
        activityId,
        kind: activity.kind,
        icon: activity.icon,
        title: activity.title,
        cardSub: activity.cardSub || "",
        description: activity.description,
        trigger: activity.trigger || "",
        on: false,
        // Seed editable fields from the catalog so opening the drawer
        // never starts from a blank box.
        mode: activity.defaultMode || "email",
        subject: activity.defaultSubject || "",
        body: activity.defaultBody || "",
        waitDays: activity.defaultDurationDays || 1,
        conditionId: activity.defaultConditionId || BRANCH_CONDITIONS[0].id,
      },
    };

    // Auto-connect to the rightmost orphan tail (the typical linear
    // case). Branch nodes come later — for now any node with no
    // outgoing edge counts as a tail.
    const tail = findRightmostOrphan(nodes, edges);
    setNodes((ns) => ns.concat(newNode));
    if (tail) {
      const newEdge = {
        id: `e-${tail.id}-${newId}`,
        source: tail.id,
        target: newId,
        animated: true,
        style: { stroke: "#16a34a", strokeWidth: 2.5 },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: "#16a34a",
          width: 18,
          height: 18,
        },
      };
      setEdges((es) => es.concat(newEdge));
    }
  }, [nodes, edges, rfInstance]);

  const canvasActivityIds = React.useMemo(
    () => new Set(nodes.map(n => n.data && n.data.activityId).filter(Boolean)),
    [nodes]);

  // Pick from the chooser → add a node + edge anchored to the source.
  const pickFromChooser = React.useCallback((activityId) => {
    if (!chooser) return;
    const sourceNode = nodes.find(n => n.id === chooser.sourceId);
    if (!sourceNode) { setChooser(null); return; }
    const activity = ACTIVITY_BY_ID[activityId];
    if (!activity) { setChooser(null); return; }
    if (activity.oneOfAKind &&
        nodes.some(n => n.data && n.data.activityId === activityId)) {
      setChooser(null);
      return;
    }
    // Position 380px to the right of the source. For Yes/No paths,
    // also offset vertically so the two paths don't overlap.
    const x = (sourceNode.position?.x || 0) + 380;
    let y = sourceNode.position?.y || 0;
    if (chooser.sourceHandle === "yes") y -= 120;
    if (chooser.sourceHandle === "no")  y += 120;

    const newId = `${activityId}_${shortId()}`;
    const nodeType = activity.kind === "logic" ? "branch" : "activity";
    const newNode = {
      id: newId,
      type: nodeType,
      position: { x, y },
      data: {
        activityId,
        kind: activity.kind,
        icon: activity.icon,
        title: activity.title,
        cardSub: activity.cardSub || "",
        description: activity.description,
        trigger: activity.trigger || "",
        on: false,
        mode: activity.defaultMode || "email",
        subject: activity.defaultSubject || "",
        body: activity.defaultBody || "",
        waitDays: activity.defaultDurationDays || 1,
        conditionId: activity.defaultConditionId || BRANCH_CONDITIONS[0].id,
      },
    };
    const isNoPath = chooser.sourceHandle === "no";
    const edgeColor = isNoPath ? "#9ca3af" : "#16a34a";
    const newEdge = {
      id: `e-${chooser.sourceId}-${newId}`,
      source: chooser.sourceId,
      target: newId,
      sourceHandle: chooser.sourceHandle || undefined,
      animated: true,
      style: { stroke: edgeColor, strokeWidth: 2.5 },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: edgeColor,
        width: 18,
        height: 18,
      },
    };
    setNodes(ns => ns.concat(newNode));
    setEdges(es => es.concat(newEdge));
    setChooser(null);
  }, [chooser, nodes]);

  return (
    <FlowContext.Provider value={flowContextValue}>
    <div className="fb-root">
      <style>{STYLES}</style>
      <div className="fb-view-tabs" role="tablist" aria-label="View">
        <button
          type="button"
          role="tab"
          aria-selected={viewMode === "canvas"}
          className={`fb-view-tab ${viewMode === "canvas" ? "is-active" : ""}`}
          onClick={() => setViewMode("canvas")}
        >🗂️ Canvas</button>
        <button
          type="button"
          role="tab"
          aria-selected={viewMode === "list"}
          className={`fb-view-tab ${viewMode === "list" ? "is-active" : ""}`}
          onClick={() => setViewMode("list")}
        >📋 Steps</button>
      </div>
      <div className="fb-content">
      {viewMode === "list" ? (
        <FlowList
          nodes={nodes}
          edges={edges}
          onEdit={(id) => setSelectedNodeId(id)}
        />
      ) : (
      <>
      <div
        className={`fb-canvas ${isDropTarget ? "is-drop-target" : ""} ${
          (!!chooser || showPicker || !!selectedNodeId) ? "is-modal-open" : ""
        }`}
        data-pulse-next={nodes.length === 1 && nodes[0]?.data?.kind === "trigger" ? "1" : "0"}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
      >
        <FirstTimeGuide />
        <TourReplayButton />
        <div className={`fb-save fb-save-${saveStatus}`} role="status" aria-live="polite">
          {saveStatus === "saving" && <><span className="fb-save-dot" /> Saving…</>}
          {saveStatus === "saved"  && <>✓ Saved</>}
          {saveStatus === "error"  && <>⚠ Couldn't save — will retry</>}
          {saveStatus === "idle" && hydrated && <>Don't worry, we save as you go</>}
        </div>
        <ReturnToFormBanner />

        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={NODE_TYPES}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          onInit={setRfInstance}
          fitView
          fitViewOptions={{ padding: 0.25 }}
          snapToGrid
          snapGrid={[40, 40]}
          defaultEdgeOptions={{
            animated: true,
            style: { stroke: "#16a34a", strokeWidth: 2.5 },
            markerEnd: {
              type: MarkerType.ArrowClosed,
              color: "#16a34a",
              width: 18,
              height: 18,
            },
          }}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={20} size={1} color="#d1d5db" />
          <Controls position="bottom-right" />
          <MiniMap
            position="bottom-left"
            pannable
            zoomable
            nodeColor={(n) => (n.data && n.data.on ? "#16a34a" : "#9ca3af")}
          />
        </ReactFlow>
      </div>
      <FlowLibrary
        canvasActivityIds={canvasActivityIds}
        collapsed={collapsed}
        onToggle={() => setCollapsed(c => !c)}
        onUseTemplate={() => setPickerDismissed(false)}
      />
      </>
      )}
      </div>
      {showPicker && viewMode === "canvas" && (
        <TemplatePicker
          onPick={applyTemplate}
          onDismiss={() => setPickerDismissed(true)}
        />
      )}
      {selectedNode && selectedActivity && (
        <MessageEditorDrawer
          node={selectedNode}
          activity={selectedActivity}
          onChange={updateNodeData}
          onClose={() => setSelectedNodeId(null)}
          onDelete={
            // Don't let the user delete the demo nodes — they're seeded
            // examples. Real, user-dropped nodes have ids ending with a
            // short hash; demo nodes end with "_demo".
            selectedNodeId && !selectedNodeId.endsWith("_demo")
              ? deleteNode : null
          }
        />
      )}
      {chooser && (
        <NextStepChooser
          source={chooser}
          canvasActivityIds={canvasActivityIds}
          onPick={pickFromChooser}
          onClose={closeChooser}
        />
      )}
    </div>
    </FlowContext.Provider>
  );
}
