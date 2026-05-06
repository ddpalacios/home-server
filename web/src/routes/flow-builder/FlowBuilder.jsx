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
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

// Context for passing the "add next step" callback into custom node
// components AND the "delete this edge" callback into custom edges.
// Cleaner than threading callbacks through node.data / edge.data,
// which would re-render every element on every state change.
const FlowContext = React.createContext({
  openChooser: () => {},
  deleteEdge: () => {},
});

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
  // The Input card is the flow's entry point — by definition it has
  // no incoming connection, only an outgoing one. Skip the target
  // handle so nothing in the canvas can ever connect TO it.
  const isInputNode = data.activityId === "input";
  // Show the picked channel on the canvas so the user reads "Form:
  // Contact form" without opening the drawer. cardSub falls back to
  // the catalog default when nothing's been picked yet.
  let cardSub = data.cardSub || "";
  if (isInputNode) {
    if (data.channel === "form" && data.channelRef) {
      cardSub = "📝 Form: " + (data.channelLabel || "your form");
    } else if (data.channel === "instagram" && data.channelRef) {
      cardSub = "💬 Instagram: " + (data.channelLabel || data.channelRef);
    } else if (data.channel === "phone" && data.channelRef) {
      cardSub = "📞 Phone: " + (data.channelLabel || data.channelRef);
    } else {
      cardSub = "Pick where leads come from →";
    }
  }
  const onAddNext = (e) => {
    e.stopPropagation();
    ctx.openChooser({ sourceId: id });
  };
  // Pill content lives next to the text block (not at the right edge)
  // so it can never collide with the drag knob or + button.
  const pill = isInputNode
    ? <span className="fb-card-pill fb-card-pill-input">START</span>
    : <span className={`fb-card-pill ${isOn ? "is-on" : ""}`}>{isOn ? "ON" : "OFF"}</span>;
  return (
    <div className={`fb-card fb-kind-${kind} ${isOn ? "is-on" : ""} ${isInputNode ? "fb-card-input" : ""}`}>
      {!isInputNode && (
        <Handle type="target" position={Position.Left} id="in" className="fb-handle fb-handle-target" />
      )}
      <div className="fb-card-stripe" aria-hidden="true" />
      <div className="fb-card-row">
        <div className="fb-card-icoring" aria-hidden="true">
          <span>{data.icon}</span>
        </div>
        <div className="fb-card-text">
          <div className="fb-card-title">{data.title}</div>
          {cardSub ? (
            <div className="fb-card-sub">{cardSub}</div>
          ) : null}
          <div className="fb-card-meta">{pill}</div>
        </div>
      </div>
      {/* Drag knob — right-edge mid. Wraps React Flow's source Handle
          so the icon IS the connection-port (mousedown starts a
          drag-to-connect). Click does nothing; click-to-add lives on
          the separate + button below. */}
      <Handle
        type="source"
        position={Position.Right}
        id="out"
        className="fb-handle fb-knob"
        title="Drag to connect"
      >
        <span className="fb-knob-arrow" aria-hidden="true">→</span>
        <span className="fb-knob-tip" aria-hidden="true">Drag to connect</span>
      </Handle>
      {/* + Add button — bottom-right corner, click-only. Adds a new
          step right after this one via the existing chooser. */}
      <button
        type="button"
        className="fb-add-btn fb-next-btn nodrag nopan"
        onClick={onAddNext}
        aria-label="Add a step"
        title="Add a step"
      >
        <span aria-hidden="true">+</span>
        <span className="fb-add-btn-tip" aria-hidden="true">Add a step</span>
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

// ── Custom edge with hover-to-delete ✕ at the midpoint ─────────────────
// Renders a smooth bezier path (same as React Flow's default) plus a
// small ✕ button that fades in when the user hovers either the edge
// itself or the button. Click ✕ → edge is removed via the delete
// callback in FlowContext.
function DeletableEdge({
  id, source, target,
  sourceX, sourceY, targetX, targetY,
  sourcePosition, targetPosition,
  style, markerEnd,
  data,
}) {
  const ctx = React.useContext(FlowContext);
  const [hovered, setHovered] = React.useState(false);
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX, sourceY, targetX, targetY,
    sourcePosition, targetPosition,
  });
  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={style}
        markerEnd={markerEnd}
        interactionWidth={20}
      />
      <EdgeLabelRenderer>
        <div
          className={`fb-edge-x-wrap ${hovered ? "is-hovered" : ""}`}
          style={{
            position: "absolute",
            transform: `translate(-50%,-50%) translate(${labelX}px,${labelY}px)`,
            pointerEvents: "all",
          }}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
        >
          <button
            type="button"
            className="fb-edge-x nodrag nopan"
            aria-label="Remove this connection"
            title="Remove this connection"
            onClick={(e) => {
              e.stopPropagation();
              ctx.deleteEdge(id);
            }}
          >×</button>
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
const EDGE_TYPES = { default: DeletableEdge };

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
  // The Input card is the flow's entry point; it's never a "next
  // step" off another card, so hide it from the chooser entirely.
  const triggers = ACTIVITY_CATALOG.filter(a => a.kind === "trigger" && a.id !== "input");
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
  // branches where the source handle decides the path. Canvas-drop
  // (the user pulled a line out and let go on empty space) gets its
  // own headline so it reads as "fill this slot" rather than
  // "what's the next step generally."
  let headline = "What comes next?";
  if (source && source.dropAt) headline = "What goes here?";
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

// Render text with merge-tag tokens highlighted as styled chips that
// show the SAMPLE value (so the sentence still reads naturally) but
// look visually distinct. Hover tooltip shows the original token.
// Unknown tokens (not in MERGE_TAGS) render as a chip with the bare
// variable name so the user still sees them as dynamic.
const _MERGE_TAG_REGEX = /\{(\w+)\}/g;
function renderWithMergeTags(text) {
  const src = String(text || "");
  if (!src) return null;
  const out = [];
  let lastIndex = 0;
  let key = 0;
  let match;
  _MERGE_TAG_REGEX.lastIndex = 0;
  while ((match = _MERGE_TAG_REGEX.exec(src)) !== null) {
    if (match.index > lastIndex) {
      out.push(src.substring(lastIndex, match.index));
    }
    const token = match[0];
    const tagDef = MERGE_TAGS.find(t => t.token === token);
    const display = tagDef ? tagDef.sample : match[1];
    out.push(
      <span key={`tok-${key++}`} className="fb-token" title={token}>
        {display}
      </span>
    );
    lastIndex = _MERGE_TAG_REGEX.lastIndex;
  }
  if (lastIndex < src.length) out.push(src.substring(lastIndex));
  return out;
}

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

// ── Textarea with inline merge-token highlights ────────────────────────
// Native textareas can't render colored runs, so we layer two elements:
//   1. A transparent-text div BEHIND the textarea that mirrors the
//      content character-for-character. Tokens are wrapped in a
//      .fb-htxt-tok span so their background paints behind the text.
//   2. The textarea itself, sitting on top with a transparent
//      background so the token highlights show through.
// Both share identical font / padding / line-height / wrapping so
// every character lines up. Scroll position is synced both ways so
// long content stays aligned.
function TokenHighlightTextarea({
  id, taRef, className, rows, value, placeholder,
  onChange, onFocus, dataAiEditable, dataAiFieldType, autoFocus,
}) {
  const overlayRef = React.useRef(null);
  function handleScroll(e) {
    const o = overlayRef.current;
    if (!o) return;
    o.scrollTop  = e.target.scrollTop;
    o.scrollLeft = e.target.scrollLeft;
  }
  // Render the overlay content. Each token becomes a styled span; the
  // span's TEXT is the original {first_name} string so character widths
  // line up with the textarea exactly.
  const overlayParts = [];
  {
    const src = String(value || "");
    let lastIndex = 0;
    let key = 0;
    let match;
    _MERGE_TAG_REGEX.lastIndex = 0;
    while ((match = _MERGE_TAG_REGEX.exec(src)) !== null) {
      if (match.index > lastIndex) {
        overlayParts.push(src.substring(lastIndex, match.index));
      }
      overlayParts.push(
        <span key={`htxt-${key++}`} className="fb-htxt-tok">{match[0]}</span>
      );
      lastIndex = _MERGE_TAG_REGEX.lastIndex;
    }
    if (lastIndex < src.length) overlayParts.push(src.substring(lastIndex));
    // Trailing space lets a final newline render its own line in pre-wrap.
    overlayParts.push("​");
  }
  return (
    <div className="fb-htxt-wrap">
      <div
        ref={overlayRef}
        className="fb-htxt-overlay"
        aria-hidden="true"
      >{overlayParts}</div>
      <textarea
        id={id}
        ref={taRef}
        className={`${className || ""} fb-htxt-input`}
        rows={rows}
        value={value}
        placeholder={placeholder}
        onChange={onChange}
        onFocus={onFocus}
        onScroll={handleScroll}
        autoFocus={autoFocus}
        data-ai-editable={dataAiEditable ? "true" : undefined}
        data-ai-field-type={dataAiFieldType}
        spellCheck={true}
      />
    </div>
  );
}

// ── Reply Widget recipient list (chip-style add/remove) ────────────────
// Used under the channel pills to manage phones and emails. Compact:
// chips for current values, an inline input for adding via Enter.
function RecipientList({ icon, values, placeholder, onAdd, onRemove }) {
  const [input, setInput] = React.useState("");
  function commit() {
    const v = input.trim();
    if (!v) return;
    onAdd(v);
    setInput("");
  }
  return (
    <div className="fb-rwprev-recip">
      <span className="fb-rwprev-recip-ico" aria-hidden="true">{icon}</span>
      <div className="fb-rwprev-recip-chips">
        {(values || []).map((v, i) => (
          <span key={`${v}-${i}`} className="fb-rwprev-recip-chip">
            <span className="fb-rwprev-recip-chip-text">{v}</span>
            <button
              type="button"
              className="fb-rwprev-recip-x"
              onClick={() => onRemove(i)}
              aria-label={`Remove ${v}`}
              title={`Remove ${v}`}
            >×</button>
          </span>
        ))}
        <input
          type="text"
          className="fb-rwprev-recip-input"
          placeholder={placeholder}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); commit(); }
          }}
          onBlur={commit}
        />
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
  fallback, customBody, globalAiMode, globalCadence,
  nudgeChannel, setNudgeChannel,
  firstNudgeBody, setFirstNudgeBody,
  secondNudgeBody, setSecondNudgeBody,
  nudgePhones, setNudgePhones,
  nudgeEmails, setNudgeEmails,
  persistNudge,
}) {
  const isAlways = globalAiMode === "ai_always";
  const isOff    = globalAiMode === "i_respond";
  const finalLabel = isOff
    ? "AI off — flow stops"
    : fallback === "ai" ? "AI replies" : "My message sends";
  const renderedBody = applyMergeTags(customBody || "");
  // In Always mode there's no nudge cadence — just a 1-min grace.
  const r1 = isAlways ? "1 min grace" : (globalCadence ? _fmtMinutes(globalCadence.first_reminder_minutes) : "—");
  const r2 = isAlways ? "—"           : (globalCadence ? _fmtMinutes(globalCadence.second_reminder_minutes) : "—");
  const rT = isAlways ? "right away"  : (globalCadence ? _fmtMinutes(globalCadence.ai_takeover_minutes) : "—");

  // Inline edit state — only one nudge open at a time.
  const [openNudge, setOpenNudge] = React.useState(null); // null | 1 | 2
  const firstNudgeRef  = React.useRef(null);
  const secondNudgeRef = React.useRef(null);
  function toggleNudge(n) { setOpenNudge(prev => prev === n ? null : n); }
  function changeNudge(which, v) {
    if (which === 1) {
      setFirstNudgeBody && setFirstNudgeBody(v);
      persistNudge && persistNudge({ first_nudge_body: v }, false);
    } else {
      setSecondNudgeBody && setSecondNudgeBody(v);
      persistNudge && persistNudge({ second_nudge_body: v }, false);
    }
  }
  function insertNudgeTag(which, token) {
    if (which === 1) {
      insertTokenAtCursor(
        firstNudgeRef, firstNudgeBody || "",
        (next) => changeNudge(1, next), token);
    } else {
      insertTokenAtCursor(
        secondNudgeRef, secondNudgeBody || "",
        (next) => changeNudge(2, next), token);
    }
  }
  function pickChannel(ch) {
    setNudgeChannel && setNudgeChannel(ch);
    persistNudge && persistNudge({ nudge_channel: ch }, true);
  }
  function addPhone(v) {
    const s = (v || "").trim();
    if (!s) return;
    if ((nudgePhones || []).includes(s)) return;
    const next = [...(nudgePhones || []), s];
    setNudgePhones && setNudgePhones(next);
    persistNudge && persistNudge({ nudge_phones: next }, true);
  }
  function removePhone(i) {
    const next = (nudgePhones || []).filter((_, idx) => idx !== i);
    setNudgePhones && setNudgePhones(next);
    persistNudge && persistNudge({ nudge_phones: next }, true);
  }
  function addEmail(v) {
    const s = (v || "").trim();
    if (!s) return;
    if ((nudgeEmails || []).includes(s)) return;
    const next = [...(nudgeEmails || []), s];
    setNudgeEmails && setNudgeEmails(next);
    persistNudge && persistNudge({ nudge_emails: next }, true);
  }
  function removeEmail(i) {
    const next = (nudgeEmails || []).filter((_, idx) => idx !== i);
    setNudgeEmails && setNudgeEmails(next);
    persistNudge && persistNudge({ nudge_emails: next }, true);
  }
  const editable = !isAlways && !isOff;
  const channelLabel =
    nudgeChannel === "email" ? "📧 Email" :
    nudgeChannel === "both"  ? "📱+📧 Both" :
    "📱 Text";
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
        {!isAlways && !isOff && fallback === "ai" && (() => {
          const isFirstDefault  = !(firstNudgeBody  && firstNudgeBody.trim());
          const isSecondDefault = !(secondNudgeBody && secondNudgeBody.trim());
          const effectiveFirst  = firstNudgeBody  && firstNudgeBody.trim()  ? firstNudgeBody  : DEFAULT_FIRST_NUDGE_BODY;
          const effectiveSecond = secondNudgeBody && secondNudgeBody.trim() ? secondNudgeBody : DEFAULT_SECOND_NUDGE_BODY;
          return (
            <>
              <li className={`fb-rwprev-nudge ${openNudge === 1 ? "is-open" : ""}`}>
                <span className="fb-rwprev-dot" />
                <div>
                  <button
                    type="button"
                    className="fb-rwprev-nudge-head"
                    onClick={() => toggleNudge(1)}
                    aria-expanded={openNudge === 1}
                    aria-controls="fb-rwprev-nudge-body-1"
                    title="Click to edit"
                  >
                    <strong>Nudge 1</strong>
                    <span>{r1}</span>
                    <span className="fb-rwprev-edit-ico" aria-hidden="true">✏️</span>
                  </button>
                  {openNudge === 1 ? (
                    <div id="fb-rwprev-nudge-body-1" className="fb-rwprev-nudge-body">
                      <TokenHighlightTextarea
                        taRef={firstNudgeRef}
                        className="fb-rwprev-nudge-ta"
                        rows={3}
                        value={firstNudgeBody || ""}
                        onChange={(e) => changeNudge(1, e.target.value)}
                        placeholder={DEFAULT_FIRST_NUDGE_BODY}
                        autoFocus
                        dataAiEditable
                        dataAiFieldType="general"
                      />
                      <div className="fb-rwprev-nudge-chips">
                        <span className="fb-rwprev-nudge-chips-l">+ Add lead info:</span>
                        <div className="fb-rwprev-nudge-chips-row">
                          {MERGE_TAGS.map(t => (
                            <button
                              key={t.token}
                              type="button"
                              className="fb-chip fb-rwprev-nudge-chip"
                              onClick={() => insertNudgeTag(1, t.token)}
                              title={`Adds ${t.token}`}
                            >{t.label}</button>
                          ))}
                        </div>
                      </div>
                      {isFirstDefault && (
                        <p className="fb-rwprev-nudge-hint">
                          Leave blank to use the default above.
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className={`fb-rwprev-nudge-text ${isFirstDefault ? "is-default" : ""}`}>
                      {renderWithMergeTags(effectiveFirst)}
                    </div>
                  )}
                </div>
              </li>
              <li className={`fb-rwprev-nudge ${openNudge === 2 ? "is-open" : ""}`}>
                <span className="fb-rwprev-dot" />
                <div>
                  <button
                    type="button"
                    className="fb-rwprev-nudge-head"
                    onClick={() => toggleNudge(2)}
                    aria-expanded={openNudge === 2}
                    aria-controls="fb-rwprev-nudge-body-2"
                    title="Click to edit"
                  >
                    <strong>Nudge 2</strong>
                    <span>{r2}</span>
                    <span className="fb-rwprev-edit-ico" aria-hidden="true">✏️</span>
                  </button>
                  {openNudge === 2 ? (
                    <div id="fb-rwprev-nudge-body-2" className="fb-rwprev-nudge-body">
                      <TokenHighlightTextarea
                        taRef={secondNudgeRef}
                        className="fb-rwprev-nudge-ta"
                        rows={3}
                        value={secondNudgeBody || ""}
                        onChange={(e) => changeNudge(2, e.target.value)}
                        placeholder={DEFAULT_SECOND_NUDGE_BODY}
                        autoFocus
                        dataAiEditable
                        dataAiFieldType="general"
                      />
                      <div className="fb-rwprev-nudge-chips">
                        <span className="fb-rwprev-nudge-chips-l">+ Add lead info:</span>
                        <div className="fb-rwprev-nudge-chips-row">
                          {MERGE_TAGS.map(t => (
                            <button
                              key={t.token}
                              type="button"
                              className="fb-chip fb-rwprev-nudge-chip"
                              onClick={() => insertNudgeTag(2, t.token)}
                              title={`Adds ${t.token}`}
                            >{t.label}</button>
                          ))}
                        </div>
                      </div>
                      {isSecondDefault && (
                        <p className="fb-rwprev-nudge-hint">
                          Leave blank to use the default above.
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className={`fb-rwprev-nudge-text ${isSecondDefault ? "is-default" : ""}`}>
                      {renderWithMergeTags(effectiveSecond)}
                    </div>
                  )}
                </div>
              </li>
            </>
          );
        })()}
        {isAlways && (
          <li>
            <span className="fb-rwprev-dot" />
            <div>
              <strong>1 min grace</strong>
              <span>So you can reply first if you want</span>
            </div>
          </li>
        )}
        <li>
          <span className={`fb-rwprev-dot ${isOff ? "" : (fallback === "ai" ? "is-ai" : "is-custom")}`} />
          <div>
            <strong>{finalLabel}</strong>
            <span>{rT}</span>
          </div>
        </li>
      </ol>
      {/* Custom message preview lives inline next to the textarea on the
          editor side now (fb-rwbody-grid). No duplicate here. */}
      {/* Channel + recipient lists are nudge-related — only show when
          nudges actually fire (AI replies path, not custom). */}
      {editable && fallback === "ai" && (
        <div className="fb-rwprev-channel">
          <span className="fb-rwprev-channel-l">Send nudges via</span>
          <div className="fb-rwprev-channel-pills">
            <button type="button"
              className={`fb-rwprev-cpill ${nudgeChannel === "sms" ? "is-active" : ""}`}
              onClick={() => pickChannel("sms")}>📱 Text</button>
            <button type="button"
              className={`fb-rwprev-cpill ${nudgeChannel === "email" ? "is-active" : ""}`}
              onClick={() => pickChannel("email")}>📧 Email</button>
            <button type="button"
              className={`fb-rwprev-cpill ${nudgeChannel === "both" ? "is-active" : ""}`}
              onClick={() => pickChannel("both")}>Both</button>
          </div>
        </div>
      )}
      {editable && fallback === "ai" && (nudgeChannel === "sms" || nudgeChannel === "both") && (
        <RecipientList
          icon="📱"
          values={nudgePhones || []}
          placeholder="Add phone…"
          onAdd={addPhone}
          onRemove={removePhone}
        />
      )}
      {editable && fallback === "ai" && (nudgeChannel === "email" || nudgeChannel === "both") && (
        <RecipientList
          icon="📧"
          values={nudgeEmails || []}
          placeholder="Add email…"
          onAdd={addEmail}
          onRemove={removeEmail}
        />
      )}
      <p className="fb-helper" style={{ textAlign: "center", marginTop: 12 }}>
        {isAlways
          ? "AI replies right away — no nudges."
          : isOff
            ? "AI is off — you'll get the message in your inbox."
            : fallback === "custom"
              ? "Reply yourself anytime → your message won't send."
              : "Reply yourself anytime → nudges stop."}
      </p>
    </div>
  );
}

// ── Input channel picker (drawer panel for the "Input" trigger) ────────
// The user picks WHERE leads enter the flow. Three options, all
// real, all using language a five-year-old reads cleanly:
//   📝 Form on your website   → /me/forms
//   💬 Instagram messages     → /me/instagram/accounts
//   📞 Phone calls or texts   → /me/intake/channels.phone
// If a channel isn't set up, the card shows ONE big "Set this up →"
// button that takes the user straight to the page that finishes
// setup (lead intake, instagram, settings/phone), with a breadcrumb
// so they come back here when they're done.
function InputChannelPanel({ nodeId, data, onChange }) {
  const [loading, setLoading] = React.useState(true);
  const [channelsStatus, setChannelsStatus] = React.useState(null);
  const [forms, setForms] = React.useState([]);
  const [igAccounts, setIgAccounts] = React.useState([]);
  const channel = data.channel || "";
  const channelRef = data.channelRef || "";

  React.useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch("/me/intake/channels", { credentials: "same-origin" })
        .then(r => r.ok ? r.json() : null).catch(() => null),
      fetch("/me/forms", { credentials: "same-origin" })
        .then(r => r.ok ? r.json() : null).catch(() => null),
      fetch("/me/instagram/accounts", { credentials: "same-origin" })
        .then(r => r.ok ? r.json() : null).catch(() => null),
    ]).then(([ch, fs, ig]) => {
      if (cancelled) return;
      setChannelsStatus(ch?.channels || null);
      setForms(Array.isArray(fs?.forms) ? fs.forms.filter(f => !f.is_draft) : []);
      setIgAccounts(Array.isArray(ig?.accounts) ? ig.accounts : []);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  const setChannel = (kind, ref, label) => {
    onChange(nodeId, {
      channel: kind,
      channelRef: ref || "",
      channelLabel: label || "",
    });
  };

  // Drop a breadcrumb so the user can come back to this flow after
  // they finish setting up the channel they just clicked into.
  const dropReturnBreadcrumb = () => {
    try {
      localStorage.setItem("fb_return_to_input", "1");
      localStorage.setItem("fb_return_to_input_ts", String(Date.now()));
    } catch (_) {}
  };

  const phoneReady = !!(channelsStatus?.phone?.ready);
  const phoneNumber = channelsStatus?.phone?.phone_number || "";

  if (loading) {
    return (
      <div className="fb-ich-loading">
        Loading your channels…
      </div>
    );
  }

  return (
    <div className="fb-ich">
      <p className="fb-ich-h">Where do your leads come from?</p>
      <p className="fb-ich-sub">
        Pick the place. The flow starts as soon as a lead shows up there.
      </p>

      {/* ── 1. Form on your website ────────────────────────── */}
      <div className={`fb-ich-card ${channel === "form" ? "is-picked" : ""}`}>
        <div className="fb-ich-card-h">
          <span className="fb-ich-ico" aria-hidden="true">📝</span>
          <div className="fb-ich-card-text">
            <div className="fb-ich-card-title">Form on your website</div>
            <div className="fb-ich-card-sub">
              Someone fills out a form. They land here.
            </div>
          </div>
          {channel === "form" && (
            <span className="fb-ich-pickdot" aria-hidden="true">✓</span>
          )}
        </div>
        {forms.length === 0 ? (
          <div className="fb-ich-empty">
            <p className="fb-ich-empty-msg">You haven't made a form yet.</p>
            <a
              className="fb-ich-setup-btn"
              href="#leadIntake"
              onClick={dropReturnBreadcrumb}
            >+ Make a form</a>
          </div>
        ) : (
          <div className="fb-ich-options" role="radiogroup" aria-label="Pick a form">
            {forms.map(f => {
              const picked = channel === "form" && channelRef === f.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  role="radio"
                  aria-checked={picked}
                  className={`fb-ich-option ${picked ? "is-picked" : ""}`}
                  onClick={() => setChannel("form", f.id, f.name || "Untitled form")}
                >
                  <span className="fb-ich-radio" aria-hidden="true" />
                  <span className="fb-ich-option-name">{f.name || "Untitled form"}</span>
                </button>
              );
            })}
            <a
              className="fb-ich-make-another"
              href="#leadIntake"
              onClick={dropReturnBreadcrumb}
            >+ Make a new form</a>
          </div>
        )}
      </div>

      {/* ── 2. Instagram messages ──────────────────────────── */}
      <div className={`fb-ich-card ${channel === "instagram" ? "is-picked" : ""}`}>
        <div className="fb-ich-card-h">
          <span className="fb-ich-ico" aria-hidden="true">💬</span>
          <div className="fb-ich-card-text">
            <div className="fb-ich-card-title">Instagram messages</div>
            <div className="fb-ich-card-sub">
              Someone DMs your Instagram. They land here.
            </div>
          </div>
          {channel === "instagram" && (
            <span className="fb-ich-pickdot" aria-hidden="true">✓</span>
          )}
        </div>
        {igAccounts.length === 0 ? (
          <div className="fb-ich-empty">
            <p className="fb-ich-empty-msg">You haven't connected Instagram yet.</p>
            <a
              className="fb-ich-setup-btn"
              href="#instagram"
              onClick={dropReturnBreadcrumb}
            >Connect Instagram →</a>
          </div>
        ) : (
          <div className="fb-ich-options" role="radiogroup" aria-label="Pick an account">
            {igAccounts.map(acc => {
              const id = acc.ig_account_id;
              const picked = channel === "instagram" && channelRef === id;
              const handle = acc.ig_username
                ? "@" + acc.ig_username
                : (acc.fb_page_name || id);
              return (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={picked}
                  className={`fb-ich-option ${picked ? "is-picked" : ""}`}
                  onClick={() => setChannel("instagram", id, handle)}
                >
                  <span className="fb-ich-radio" aria-hidden="true" />
                  <span className="fb-ich-option-name">{handle}</span>
                  {acc.needs_reconnect && (
                    <span className="fb-ich-badge-warn">Reconnect</span>
                  )}
                </button>
              );
            })}
            <a
              className="fb-ich-make-another"
              href="#instagram"
              onClick={dropReturnBreadcrumb}
            >+ Add another account</a>
          </div>
        )}
      </div>

      {/* ── 3. Phone calls or texts ────────────────────────── */}
      <div className={`fb-ich-card ${channel === "phone" ? "is-picked" : ""}`}>
        <div className="fb-ich-card-h">
          <span className="fb-ich-ico" aria-hidden="true">📞</span>
          <div className="fb-ich-card-text">
            <div className="fb-ich-card-title">Phone calls or texts</div>
            <div className="fb-ich-card-sub">
              Someone calls or texts your business number. They land here.
            </div>
          </div>
          {channel === "phone" && (
            <span className="fb-ich-pickdot" aria-hidden="true">✓</span>
          )}
        </div>
        {!phoneReady ? (
          <div className="fb-ich-empty">
            <p className="fb-ich-empty-msg">You don't have a number yet.</p>
            <a
              className="fb-ich-setup-btn"
              href="#phones"
              onClick={dropReturnBreadcrumb}
            >Get a phone number →</a>
          </div>
        ) : (
          <div className="fb-ich-options" role="radiogroup" aria-label="Pick a number">
            <button
              type="button"
              role="radio"
              aria-checked={channel === "phone" && channelRef === phoneNumber}
              className={`fb-ich-option ${channel === "phone" && channelRef === phoneNumber ? "is-picked" : ""}`}
              onClick={() => setChannel("phone", phoneNumber, phoneNumber)}
            >
              <span className="fb-ich-radio" aria-hidden="true" />
              <span className="fb-ich-option-name">{phoneNumber}</span>
            </button>
          </div>
        )}
      </div>

      <p className="fb-helper">
        You can change this any time. The flow starts when a lead shows up
        on the channel you picked.
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
  const isInput = !!activity.isInput;

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
  // Reply Widget state — only meaningful when isReply. Cadence is
  // always driven by the global setting (top-right control), so we
  // don't track per-step overrides — we just read and display them.
  const [fallback, setFallback] = React.useState(
    data.fallback || activity.defaultFallback || "ai");
  const [globalAiMode, setGlobalAiMode] = React.useState(null);
  const [globalCadence, setGlobalCadence] = React.useState(null);
  // Nudge config — also lives in ai_policy.json. Edited inline on the
  // right-side timeline; saves to the global policy.
  const [nudgeChannel,    setNudgeChannel]    = React.useState("sms");
  const [firstNudgeBody,  setFirstNudgeBody]  = React.useState("");
  const [secondNudgeBody, setSecondNudgeBody] = React.useState("");
  const [nudgePhones,     setNudgePhones]     = React.useState([]);
  const [nudgeEmails,     setNudgeEmails]     = React.useState([]);
  React.useEffect(() => {
    if (!isReply) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/me/ai/policy", { credentials: "same-origin" });
        if (!r.ok) return;
        const p = await r.json();
        if (cancelled) return;
        setGlobalAiMode((p && p.mode) || "hybrid");
        setGlobalCadence((p && p.reminder_cadence) || null);
        if (p && p.nudge_channel) setNudgeChannel(p.nudge_channel);
        if (p && typeof p.first_nudge_body  === "string") setFirstNudgeBody(p.first_nudge_body);
        if (p && typeof p.second_nudge_body === "string") setSecondNudgeBody(p.second_nudge_body);
        if (p && Array.isArray(p.nudge_phones)) setNudgePhones(p.nudge_phones);
        if (p && Array.isArray(p.nudge_emails)) setNudgeEmails(p.nudge_emails);
      } catch (_) {}
    })();
    // Live updates: any subscriber editing the global policy fires
    // `ai-policy:changed`. Reflect their changes here without a refetch.
    function onPolicyChanged(ev) {
      const d = (ev && ev.detail) || {};
      if (d.mode) setGlobalAiMode(d.mode);
      if (d.reminder_cadence) setGlobalCadence(d.reminder_cadence);
      if (d.nudge_channel) setNudgeChannel(d.nudge_channel);
      if (typeof d.first_nudge_body  === "string") setFirstNudgeBody(d.first_nudge_body);
      if (typeof d.second_nudge_body === "string") setSecondNudgeBody(d.second_nudge_body);
      if (Array.isArray(d.nudge_phones)) setNudgePhones(d.nudge_phones);
      if (Array.isArray(d.nudge_emails)) setNudgeEmails(d.nudge_emails);
    }
    window.addEventListener("ai-policy:changed", onPolicyChanged);
    return () => {
      cancelled = true;
      window.removeEventListener("ai-policy:changed", onPolicyChanged);
    };
  }, [isReply]);

  // Save nudge config. Channel = immediate; textarea edits debounce
  // 600 ms so each keystroke isn't a network round-trip.
  const _nudgeSaveTimer = React.useRef(null);
  const persistNudge = React.useCallback((payload, immediate) => {
    if (_nudgeSaveTimer.current) clearTimeout(_nudgeSaveTimer.current);
    const fire = async () => {
      try {
        const r = await fetch("/me/ai/policy", {
          method: "POST", credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!r.ok) return;
        try {
          window.dispatchEvent(new CustomEvent("ai-policy:changed", { detail: payload }));
        } catch (_) {}
      } catch (_) {}
    };
    if (immediate) fire();
    else _nudgeSaveTimer.current = setTimeout(fire, 600);
  }, []);

  const taRef = React.useRef(null);
  const subjRef = React.useRef(null);
  const [activeField, setActiveField] = React.useState("body"); // for chips

  // Push edits up to the canvas. We don't debounce — typing into a 100kB
  // node graph is fine in React.
  React.useEffect(() => {
    onChange(node.id, {
      mode, subject, body, waitDays, conditionId,
      fallback,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, subject, body, waitDays, conditionId, fallback]);

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

        <div className={`fb-drawer-body ${isInput ? "is-no-preview" : ""}`}>
          <div className="fb-drawer-edit">
            {isInput ? (
              <InputChannelPanel
                nodeId={node.id}
                data={data}
                onChange={onChange}
              />
            ) : isBranch ? (
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
                body={body} setBody={setBody}
                taRef={taRef}
                onActiveField={() => setActiveField("body")}
                globalAiMode={globalAiMode}
                globalCadence={globalCadence}
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

          {!isInput && (
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
                customBody={body}
                globalAiMode={globalAiMode}
                globalCadence={globalCadence}
                nudgeChannel={nudgeChannel}
                setNudgeChannel={setNudgeChannel}
                firstNudgeBody={firstNudgeBody}
                setFirstNudgeBody={setFirstNudgeBody}
                secondNudgeBody={secondNudgeBody}
                setSecondNudgeBody={setSecondNudgeBody}
                nudgePhones={nudgePhones}
                setNudgePhones={setNudgePhones}
                nudgeEmails={nudgeEmails}
                setNudgeEmails={setNudgeEmails}
                persistNudge={persistNudge}
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
          )}
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

// Default nudge templates — shown under each Nudge row when the user
// hasn't customized them, AND used at runtime by the engine
// (server-side mirror lives in sequences/policy.py — keep these in sync
// if you change the wording).
const DEFAULT_FIRST_NUDGE_BODY  = "{first_name} is waiting for a reply.";
const DEFAULT_SECOND_NUDGE_BODY = "Still waiting on {first_name}. AI will take over soon if you don't reply.";

const GLOBAL_MODE_LABEL = {
  ai_always: "Always reply",
  hybrid:    "Reply when I'm slow",
  i_respond: "Never reply (off)",
};

function ReplyWidgetEditor({
  fallback, setFallback,
  body, setBody, taRef, onActiveField,
  globalAiMode, globalCadence,
}) {
  const aiOff = globalAiMode === "i_respond";

  // If global AI is Off, the "AI replies" choice is unrunnable. Auto-
  // flip to "Send this" so the user lands on a valid default. Runs both
  // on initial policy load AND on any live change (top-right → Off).
  React.useEffect(() => {
    if (aiOff && fallback === "ai") setFallback("custom");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiOff]);

  // Inline AI tester — same /me/ai/test-reply endpoint the AI Settings
  // page uses, just rendered in the drawer so users can sanity-check
  // without leaving the flow.
  const [testInput, setTestInput] = React.useState("");
  const [testReply, setTestReply] = React.useState({
    state: "empty",
    text: "Reply shows here. Nothing gets sent.",
  });
  const [testing, setTesting] = React.useState(false);

  async function runTest() {
    const msg = (testInput || "").trim();
    if (!msg) return;
    setTesting(true);
    setTestReply({ state: "loading", text: "Generating…" });
    try {
      const r = await fetch("/me/ai/test-reply", {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setTestReply({ state: "declined",
          text: "Couldn't generate: " + (d.error || r.status) });
      } else if (d.declined) {
        setTestReply({ state: "declined",
          text: "AI declined — would hand back to you." });
      } else {
        setTestReply({ state: "ok", text: d.reply || "(empty reply)" });
      }
    } catch (_) {
      setTestReply({ state: "declined", text: "Network error." });
    } finally {
      setTesting(false);
    }
  }

  function insertChip(token) {
    onActiveField && onActiveField();
    insertTokenAtCursor(taRef, body, setBody, token);
  }

  return (
    <div>
      {/* "If I don't reply" — primary choice, top of drawer */}
      <div className="fb-replywidget-section">
        <label className="fb-drawer-l">If I don't reply</label>
        <div className="fb-replywidget-fallback">
          <label
            className={`fb-replywidget-fbcard${
              fallback === "ai" ? " is-active" : ""}${
              aiOff ? " is-disabled" : ""}`}
            aria-disabled={aiOff || undefined}
          >
            <input
              type="radio"
              name="rwFallback"
              checked={fallback === "ai"}
              disabled={aiOff}
              onChange={() => { if (!aiOff) setFallback("ai"); }}
            />
            <div>
              <div className="fb-replywidget-fbtitle">
                🤖 AI replies
                {aiOff && <span className="fb-replywidget-fbtag">Off</span>}
              </div>
              <div className="fb-replywidget-fbsub">
                {aiOff
                  ? "Turn AI on in the top-right to use this."
                  : "Uses my Knowledge Base"}
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

      {/* AI test panel — shown when fallback is AI */}
      {fallback === "ai" && (
        <div className="fb-replywidget-section">
          <label className="fb-drawer-l">Try it</label>
          <div className="fb-rwtest-row">
            <input
              type="text"
              className="fb-rwtest-input"
              data-ai-editable="true"
              data-ai-field-type="general"
              placeholder="Ask anything a customer might ask."
              value={testInput}
              onChange={(e) => setTestInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); runTest(); }
              }}
            />
            <button
              type="button"
              className="fb-rwtest-btn"
              onClick={runTest}
              disabled={testing}
            >{testing ? "…" : "Try →"}</button>
          </div>
          <div
            className="fb-rwtest-preview"
            data-state={testReply.state}
          >{testReply.text}</div>
        </div>
      )}

      {/* Custom body + live preview side-by-side. The two columns
          collapse to stacked on narrow widths via @media. */}
      {fallback === "custom" && (
        <div className="fb-replywidget-section fb-rwbody-grid">
          <div className="fb-rwbody-edit">
            <label className="fb-drawer-l" htmlFor="fb-rw-body">Your message</label>
            <TokenHighlightTextarea
              id="fb-rw-body"
              taRef={taRef}
              className="fb-input fb-textarea fb-rwbody-ta"
              dataAiEditable
              dataAiFieldType="reply_body"
              rows={9}
              value={body}
              onFocus={onActiveField}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Hey {first_name}, sorry I missed you — I'll be in touch soon."
            />
            <div className="fb-chips-row fb-rwbody-chips">
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
          <div className="fb-rwbody-prev">
            <label className="fb-drawer-l">Preview</label>
            <div className="fb-rwbody-preview">
              <div className="fb-rwbody-preview-eye">As your customer would see it</div>
              <div className="fb-rwbody-preview-body">
                {body
                  ? renderWithMergeTags(body)
                  : (
                    <span style={{ color: "#94a3b8", fontStyle: "italic" }}>
                      Write a message and it'll appear here.
                    </span>
                  )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Nudge messages + channel are edited on the right-side timeline.
          Click the ✏️ icon next to Nudge 1 / Nudge 2 to open a small
          inline editor. The channel pill sits below the timeline. */}

      {/* Read-only summary of the global AI mode. Only relevant when
          the fallback is AI — for "Send this" the user has chosen
          their own message and the AI cadence is irrelevant. */}
      {fallback === "ai" && (
        <div className={`fb-replywidget-cadinfo is-${globalAiMode || "hybrid"}`}>
          <div className="fb-replywidget-cadinfo-head">
            <span className="fb-replywidget-cadinfo-h">
              {globalAiMode === "ai_always" ? "AI mode"
                : globalAiMode === "i_respond" ? "AI mode"
                : "Reminders before takeover"}
            </span>
            <span className="fb-replywidget-cadinfo-dot" aria-hidden="true" />
          </div>
          <div className="fb-replywidget-cadinfo-times">
            {globalAiMode === "ai_always" ? (
              <span className="fb-replywidget-cadinfo-mode">
                Always reply — <strong>AI replies right away</strong>
              </span>
            ) : globalAiMode === "i_respond" ? (
              <span className="fb-replywidget-cadinfo-mode">
                Off — <strong>you'll handle replies</strong>
              </span>
            ) : globalCadence ? (
              <>
                <span>{_fmtMinutes(globalCadence.first_reminder_minutes)}</span>
                <span className="fb-replywidget-cadinfo-sep">·</span>
                <span>{_fmtMinutes(globalCadence.second_reminder_minutes)}</span>
                <span className="fb-replywidget-cadinfo-sep">·</span>
                <span>{_fmtMinutes(globalCadence.ai_takeover_minutes)} (takeover)</span>
              </>
            ) : <span style={{ color: "#94a3b8" }}>Loading…</span>}
          </div>
          <div className="fb-replywidget-cadinfo-link">
            Change in top-right ↗
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
  /* Pill row sits BELOW the subtitle — own line, never crowds the
     drag knob or + Add button on the right edge. */
  .fb-card-meta {
    margin-top: 8px;
    display: inline-flex;
  }
  .fb-card-pill {
    flex-shrink: 0;
    padding: 4px 10px; border-radius: 999px;
    background: #f3f4f6; color: #6b7280;
    font-size: 10.5px; font-weight: 800; letter-spacing: .06em;
    text-transform: uppercase;
  }
  .fb-card-pill.is-on {
    background: var(--kind-color); color: #fff;
    box-shadow: 0 0 0 3px var(--kind-ring);
  }
  /* Input card always shows a green "START" badge so the user reads
     it instantly as the entry point, regardless of on/off state. */
  .fb-card-pill-input {
    background: #10b981; color: #fff;
    box-shadow: 0 0 0 3px rgba(16,185,129,.20);
  }

  /* ── Right-edge drag knob ───────────────────────────────────────────
     Wraps React Flow's source Handle so the visible knob IS the port
     the user drags from. Single purpose: drag-to-connect. Click does
     nothing here. Click-to-add lives on the separate + button below. */
  .fb-knob.react-flow__handle {
    width: 28px; height: 28px;
    right: -14px;                 /* center on the card's right edge */
    top: 50%;
    transform: translateY(-50%);
    background: #fff;
    border: 2px solid var(--fb-green);
    box-shadow: 0 2px 6px rgba(15,23,42,.10),
                0 0 0 0 rgba(22,163,74,0);
    border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    cursor: grab;
    transition: transform .12s, box-shadow .12s, background .12s, border-color .12s;
    z-index: 3;
  }
  .fb-knob.react-flow__handle:hover {
    background: var(--fb-green);
    border-color: var(--fb-green);
    transform: translateY(-50%) scale(1.12);
    box-shadow: 0 4px 12px rgba(15,23,42,.18),
                0 0 0 4px rgba(22,163,74,.20);
  }
  .fb-knob.react-flow__handle:hover .fb-knob-arrow { color: #fff; }
  .fb-knob.react-flow__handle:active { cursor: grabbing; }
  .fb-knob-arrow {
    color: var(--fb-green);
    font-size: 14px; font-weight: 900; line-height: 1;
    pointer-events: none;
    transition: color .12s;
  }
  /* Hover-only "Drag to connect" tooltip — no flash on first paint. */
  .fb-knob-tip {
    position: absolute;
    left: 50%; top: -34px;
    transform: translateX(-50%) translateY(4px);
    padding: 5px 10px; border-radius: 8px;
    background: #0f172a; color: #fff;
    font-size: 11.5px; font-weight: 600; white-space: nowrap;
    opacity: 0; pointer-events: none;
    transition: opacity .15s ease, transform .15s ease;
    box-shadow: 0 4px 12px rgba(15,23,42,.20);
  }
  .fb-knob.react-flow__handle:hover .fb-knob-tip {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
    transition-delay: .35s;
  }

  /* Tame the default left-edge target handle — small, subtle dot.
     Stays grabbable but reads as a passive port, not an action. */
  .fb-handle-target.react-flow__handle {
    width: 12px; height: 12px;
    background: #fff;
    border: 2px solid var(--fb-green);
    box-shadow: 0 0 0 2px rgba(22,163,74,.18);
  }
  .fb-handle-target.react-flow__handle:hover {
    background: var(--fb-green);
    transform: scale(1.2);
  }

  /* ── + Add button — bottom-right corner, click-only ─────────────────
     Lives slightly outside the card's bottom-right corner so it reads
     as an action that PRODUCES a new card, not a port that connects
     to one. Solid green fill = "do this." Distinct from the outlined
     drag knob = "drag from this." */
  .fb-add-btn {
    position: absolute;
    right: -12px; bottom: -12px;
    z-index: 2;
    display: inline-flex; align-items: center; justify-content: center;
    width: 32px; height: 32px;
    background: var(--fb-green); color: #fff;
    border: 2px solid #fff; border-radius: 50%;
    font: 800 18px -apple-system, BlinkMacSystemFont, "Segoe UI",
          Roboto, sans-serif;
    line-height: 1;
    box-shadow: 0 4px 12px rgba(15,23,42,.18),
                0 0 0 1px rgba(22,163,74,.25);
    cursor: pointer;
    white-space: nowrap;
    transition: transform .12s, box-shadow .12s, background .12s;
  }
  .fb-add-btn:hover {
    background: #15803d;
    transform: scale(1.1);
    box-shadow: 0 6px 16px rgba(15,23,42,.22),
                0 0 0 2px rgba(22,163,74,.35);
  }
  .fb-add-btn-tip {
    position: absolute;
    right: 0; bottom: calc(100% + 8px);
    padding: 5px 10px; border-radius: 8px;
    background: #0f172a; color: #fff;
    font: 600 11.5px -apple-system, BlinkMacSystemFont, "Segoe UI",
          Roboto, sans-serif;
    letter-spacing: 0;
    white-space: nowrap;
    opacity: 0; pointer-events: none;
    transition: opacity .15s ease, transform .15s ease;
    transform: translateY(4px);
    box-shadow: 0 4px 12px rgba(15,23,42,.20);
  }
  .fb-add-btn:hover .fb-add-btn-tip {
    opacity: 1; transform: translateY(0);
    transition-delay: .35s;
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

  /* Loading bar — pinned to the top edge of the canvas during the
     hydrate window (between mount and the first /me/flows fetch
     resolving). The bar is an indeterminate slider, so the user
     gets visible feedback that "the canvas is doing something" even
     when total wait is sub-second. Disappears the moment the flow
     is rendered. */
  .fb-loading {
    position: absolute; top: 0; left: 0; right: 0;
    z-index: 8;
    pointer-events: none;
    display: flex; flex-direction: column; align-items: stretch;
  }
  .fb-loading-bar {
    height: 3px;
    background: rgba(22,163,74,.10);
    overflow: hidden;
    position: relative;
  }
  .fb-loading-bar-fill {
    position: absolute;
    top: 0; bottom: 0;
    left: -40%;
    width: 40%;
    background: linear-gradient(90deg, transparent 0%, var(--fb-green) 50%, transparent 100%);
    animation: fbLoadingSlide 1.1s ease-in-out infinite;
  }
  @keyframes fbLoadingSlide {
    from { left: -40%; }
    to   { left: 100%; }
  }
  .fb-loading-label {
    align-self: flex-start;
    margin: 8px 0 0 12px;
    padding: 5px 12px;
    background: rgba(255,255,255,.92);
    backdrop-filter: blur(6px);
    border: 1px solid var(--fb-border);
    border-radius: 999px;
    font-size: 12px; font-weight: 600; color: #4b5563;
  }

  /* ✕ button at the midpoint of every edge. Hidden by default;
     fades in when the user hovers the 32×32 wrap area sitting on
     top of the edge midpoint. Click → the edge is removed and the
     autosave fires. */
  .fb-edge-x-wrap {
    display: flex; align-items: center; justify-content: center;
    width: 32px; height: 32px;
  }
  .fb-edge-x {
    width: 22px; height: 22px;
    display: inline-flex; align-items: center; justify-content: center;
    background: #fff;
    color: #b91c1c;
    border: 1.5px solid #ef4444;
    border-radius: 50%;
    font-size: 14px; font-weight: 700; line-height: 1;
    font-family: inherit;
    cursor: pointer;
    box-shadow: 0 2px 6px rgba(15,23,42,.12);
    opacity: 0;
    transform: scale(.7);
    transition: opacity .12s ease, transform .12s ease, background .12s, color .12s;
    padding: 0;
  }
  .fb-edge-x-wrap.is-hovered .fb-edge-x {
    opacity: 1;
    transform: scale(1);
  }
  /* Selected edges (clicked once) thicken so keyboard-only users see
     which edge will be removed when they press Delete/Backspace. The
     ✕ also stays visible on selected edges. */
  .react-flow__edge.selected .react-flow__edge-path {
    stroke-width: 3;
  }
  .fb-edge-x:hover {
    background: #ef4444;
    color: #fff;
    transform: scale(1.1);
    box-shadow: 0 4px 10px rgba(239,68,68,.30);
  }

  /* "That would create a loop." toast — slides up from the bottom
     when the user drops a connection that would cycle back to its
     own source. Subtle, not alarming. */
  .fb-loop-toast {
    position: absolute;
    left: 50%; bottom: 24px;
    transform: translateX(-50%);
    padding: 10px 18px;
    background: #0f172a; color: #fff;
    font-size: 13px; font-weight: 600;
    border-radius: 999px;
    box-shadow: 0 10px 30px rgba(15,23,42,.30),
                0 0 0 1px rgba(15,23,42,.06);
    z-index: 50;
    pointer-events: none;
    animation: fb-loop-toast-in .22s ease-out;
  }
  @keyframes fb-loop-toast-in {
    from { opacity: 0; transform: translateX(-50%) translateY(8px); }
    to   { opacity: 1; transform: translateX(-50%) translateY(0); }
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
    width: min(1000px, 100%);
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
  /* Input drawer doesn't render a preview pane — collapse the grid
     so the channel picker uses the full drawer width. */
  .fb-drawer-body.is-no-preview {
    grid-template-columns: minmax(0, 1fr);
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
  /* ── Input channel picker (drawer) ──────────────────────────────────
     Three big cards — Form / Instagram / Phone — each showing real
     status and a clear path to set up if not ready. Plain language,
     short copy, one decision per card. */
  .fb-ich-loading {
    padding: 24px 6px;
    text-align: center;
    color: #6b7280;
    font-size: 13.5px;
  }
  .fb-ich-h {
    margin: 0 0 6px;
    font-size: 16px; font-weight: 700; color: #0a0a0a;
    letter-spacing: -0.01em;
  }
  .fb-ich-sub {
    margin: 0 0 16px;
    font-size: 13px; color: #4b5563; line-height: 1.5;
  }
  .fb-ich-card {
    background: #fff;
    border: 1.5px solid #e5e7eb;
    border-radius: 14px;
    padding: 14px 16px;
    margin-bottom: 12px;
    transition: border-color .14s ease, box-shadow .14s ease, background .14s ease;
  }
  .fb-ich-card.is-picked {
    border-color: #10b981;
    background: #f0fdf4;
    box-shadow: 0 0 0 3px rgba(16,185,129,.10);
  }
  .fb-ich-card-h {
    display: flex; align-items: flex-start; gap: 12px;
  }
  .fb-ich-ico {
    font-size: 24px; line-height: 1; flex-shrink: 0;
  }
  .fb-ich-card-text {
    flex: 1; min-width: 0;
  }
  .fb-ich-card-title {
    font-size: 14.5px; font-weight: 700; color: #0a0a0a;
    line-height: 1.2;
  }
  .fb-ich-card-sub {
    margin-top: 2px;
    font-size: 12.5px; color: #4b5563; line-height: 1.4;
  }
  .fb-ich-pickdot {
    display: inline-flex; align-items: center; justify-content: center;
    width: 22px; height: 22px;
    background: #10b981; color: #fff;
    border-radius: 50%;
    font-size: 12px; font-weight: 800;
    flex-shrink: 0;
  }
  .fb-ich-empty {
    margin-top: 10px;
    padding: 10px 12px;
    background: #fffbeb;
    border: 1px solid #fde68a;
    border-radius: 10px;
    display: flex; align-items: center; gap: 12px;
    flex-wrap: wrap;
  }
  .fb-ich-empty-msg {
    margin: 0; flex: 1; min-width: 0;
    font-size: 12.5px; color: #92400e; font-weight: 500;
  }
  .fb-ich-setup-btn {
    flex-shrink: 0;
    display: inline-flex; align-items: center; gap: 6px;
    padding: 8px 14px;
    background: #185FA5; color: #fff;
    border-radius: 8px;
    font-size: 12.5px; font-weight: 600;
    text-decoration: none;
    transition: background .12s ease, transform .12s ease;
  }
  .fb-ich-setup-btn:hover {
    background: #144d85;
    transform: translateY(-1px);
  }
  .fb-ich-options {
    margin-top: 10px;
    display: flex; flex-direction: column; gap: 6px;
  }
  .fb-ich-option {
    display: flex; align-items: center; gap: 10px;
    padding: 10px 12px;
    background: #fff;
    border: 1.5px solid #e5e7eb;
    border-radius: 10px;
    font-family: inherit; font-size: 13px; font-weight: 500;
    color: #0a0a0a;
    cursor: pointer;
    text-align: left;
    transition: border-color .12s ease, background .12s ease;
  }
  .fb-ich-option:hover {
    border-color: #cbd5e1;
    background: #f9fafb;
  }
  .fb-ich-option.is-picked {
    border-color: #10b981;
    background: #ecfdf5;
  }
  .fb-ich-radio {
    width: 18px; height: 18px;
    border: 2px solid #cbd5e1;
    border-radius: 50%;
    flex-shrink: 0;
    background: #fff;
    transition: border-color .12s ease, background .12s ease;
    position: relative;
  }
  .fb-ich-option.is-picked .fb-ich-radio {
    border-color: #10b981;
    background: #10b981;
    box-shadow: inset 0 0 0 3px #fff;
  }
  .fb-ich-option-name {
    flex: 1; min-width: 0;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .fb-ich-make-another {
    margin-top: 4px;
    align-self: flex-start;
    font-size: 12px; color: #185FA5; font-weight: 600;
    text-decoration: none;
  }
  .fb-ich-make-another:hover { text-decoration: underline; }
  .fb-ich-badge-warn {
    flex-shrink: 0;
    padding: 2px 8px;
    background: #fef3c7; color: #92400e;
    border-radius: 999px;
    font-size: 10.5px; font-weight: 700;
    letter-spacing: .04em; text-transform: uppercase;
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
  .fb-replywidget-section { margin-bottom: 40px; }
  .fb-replywidget-section:last-child { margin-bottom: 0; }
  .fb-replywidget-section .fb-drawer-l {
    font-size: 17px; font-weight: 700; color: #0a0a0a;
    letter-spacing: -0.01em; margin-bottom: 16px; display: block;
  }

  /* Custom body — taller textarea + spaced chip row + side-by-side preview */
  .fb-rwbody-grid {
    display: grid; grid-template-columns: 1fr 1fr; gap: 20px;
    align-items: start;
  }
  @media (max-width: 980px) {
    .fb-rwbody-grid { grid-template-columns: 1fr; }
  }
  .fb-rwbody-edit, .fb-rwbody-prev { min-width: 0; }
  .fb-rwbody-ta {
    min-height: 220px; padding: 18px 20px;
    font-size: 15px; line-height: 1.6;
  }
  .fb-rwbody-chips { margin-top: 16px; gap: 10px; }
  .fb-rwbody-preview {
    padding: 22px 24px;
    background: linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%);
    border: 1.5px solid #e2e8f0; border-radius: 16px;
    /* Match the textarea side's combined height so the columns line up.
       textarea (220) + label (~32) + chips (~46) ≈ 298. */
    min-height: 220px;
  }
  .fb-rwbody-preview-eye {
    font-size: 11.5px; font-weight: 700;
    letter-spacing: 0.08em; text-transform: uppercase;
    color: #6b7280; margin-bottom: 12px;
  }
  .fb-rwbody-preview-body {
    font-size: 15.5px; line-height: 1.65; color: #0a0a0a;
    white-space: pre-wrap; word-wrap: break-word;
  }

  /* Click-to-edit nudge rows in the right-side timeline. The row's
     content becomes a button so the whole strong+time+✏️ icon is the
     hit target. Click → expands an inline textarea below. */
  .fb-rwprev-nudge .fb-rwprev-nudge-head {
    display: flex; align-items: baseline; gap: 8px;
    width: 100%; padding: 0; margin: 0;
    background: transparent; border: 0; cursor: pointer;
    text-align: left; font: inherit;
    border-radius: 6px;
    transition: background 0.12s ease;
  }
  .fb-rwprev-nudge .fb-rwprev-nudge-head:hover {
    background: rgba(15,23,42,0.04);
  }
  .fb-rwprev-nudge .fb-rwprev-nudge-head strong {
    font-size: 16px; font-weight: 700; color: #0a0a0a;
  }
  .fb-rwprev-nudge .fb-rwprev-nudge-head span {
    font-size: 13.5px; color: #6b7280; font-weight: 500;
  }
  .fb-rwprev-edit-ico {
    margin-left: auto;
    font-size: 13px;
    opacity: 0.55;
    transition: opacity 0.12s ease, transform 0.12s ease;
  }
  .fb-rwprev-nudge .fb-rwprev-nudge-head:hover .fb-rwprev-edit-ico {
    opacity: 1; transform: scale(1.08);
  }
  .fb-rwprev-nudge.is-open .fb-rwprev-edit-ico {
    opacity: 1;
  }
  .fb-rwprev-nudge-body {
    margin-top: 10px;
    animation: fbRwExpand 0.16s ease-out;
  }
  @keyframes fbRwExpand {
    from { opacity: 0; transform: translateY(-4px); }
    to   { opacity: 1; transform: none; }
  }
  .fb-rwprev-nudge-ta {
    width: 100%; box-sizing: border-box;
    padding: 12px 14px;
    font-size: 14px; line-height: 1.5; font-family: inherit;
    color: #0a0a0a;
    background: #fff;
    border: 1.5px solid #cbd5e1; border-radius: 10px;
    resize: vertical; min-height: 70px;
    transition: border-color 0.14s ease, box-shadow 0.14s ease;
  }
  .fb-rwprev-nudge-ta:focus {
    outline: 0; border-color: #2563eb;
    box-shadow: 0 0 0 3px rgba(37,99,235,0.12);
  }
  /* Inline message text under each Nudge row when collapsed */
  .fb-rwprev-nudge-text {
    margin-top: 6px;
    font-size: 13.5px; line-height: 1.5;
    color: #0a0a0a;
    white-space: pre-wrap; word-wrap: break-word;
  }
  .fb-rwprev-nudge-text.is-default {
    color: #64748b; font-style: italic;
  }
  .fb-rwprev-nudge-hint {
    margin: 8px 0 0; font-size: 12px; color: #94a3b8;
    font-style: italic;
  }
  /* Lead-variable chip row inside a nudge editor — same family as the
     email/text editor's "Tap to add" row but laid out tighter so it
     reads "+ Add lead info: [chip] [chip] [chip] …" on one line. */
  .fb-rwprev-nudge-chips {
    margin-top: 12px;
    display: flex; flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }
  .fb-rwprev-nudge-chips-l {
    font-size: 12.5px; font-weight: 600;
    color: #1e3a8a;
    letter-spacing: 0.01em;
  }
  .fb-rwprev-nudge-chips-row {
    display: flex; flex-wrap: wrap; gap: 6px;
  }
  .fb-rwprev-nudge-chip {
    /* Inherits .fb-chip — slight variant so the chips visually echo
       the .fb-token highlights inside the textarea (same color family,
       so the connection between "click chip → insert token → token
       gets highlighted" is obvious). */
    background: linear-gradient(180deg, #eff6ff 0%, #dbeafe 100%);
    border-color: #bfdbfe;
    color: #1e3a8a;
    font-weight: 600;
  }
  .fb-rwprev-nudge-chip:hover {
    background: linear-gradient(180deg, #dbeafe 0%, #bfdbfe 100%);
    border-color: #93c5fd;
  }
  /* Highlighted merge-tag chips — used everywhere a message is
     previewed so the user can spot the dynamic bits at a glance. */
  .fb-token {
    display: inline-block;
    padding: 1px 9px;
    margin: 0 1px;
    background: linear-gradient(180deg, #dbeafe 0%, #bfdbfe 100%);
    color: #1e3a8a;
    border-radius: 999px;
    font-size: 0.92em; font-weight: 600;
    letter-spacing: 0.01em;
    cursor: help;
    box-shadow: inset 0 0 0 1px rgba(30,58,138,0.10);
    white-space: nowrap;
  }
  .fb-rwprev-nudge-text.is-default .fb-token {
    background: linear-gradient(180deg, #e0e7ff 0%, #c7d2fe 100%);
  }

  /* Textarea with inline token highlighting (overlay + textarea stack).
     The overlay mirrors the textarea content character-for-character;
     token spans paint a colored background behind the user's text. */
  .fb-htxt-wrap {
    position: relative;
    display: block;
  }
  .fb-htxt-overlay,
  .fb-htxt-input {
    /* These two MUST share identical layout so character columns line up.
       Defining shared values up front; component-specific .fb-htxt-input
       still inherits the .fb-rwbody-ta styling for padding/font/etc. */
    font-family: inherit;
    word-wrap: break-word;
    white-space: pre-wrap;
    overflow-wrap: break-word;
    box-sizing: border-box;
    margin: 0;
    border-radius: 12px;
  }
  .fb-htxt-overlay {
    position: absolute; inset: 0;
    pointer-events: none;
    z-index: 0;
    overflow: auto;
    /* Hide the overlay text but keep widths intact. The token spans
       override this color so the chip text is visible. */
    color: transparent;
    /* Mirror the textarea's padding + border-width so glyphs align.
       border-color is transparent so the only visible border is the
       textarea's. */
    border: 1.5px solid transparent;
    /* Padding/font come from the same selector as fb-rwbody-ta so they
       always match — set explicitly below. */
    padding: 18px 20px;
    font-size: 15px;
    line-height: 1.6;
    /* Chrome scrollbar gutter handling matches textarea's. */
    scrollbar-width: none;
    -ms-overflow-style: none;
  }
  .fb-htxt-overlay::-webkit-scrollbar { display: none; }
  .fb-htxt-input {
    position: relative;
    z-index: 1;
    background: transparent;
    /* Caret stays visible since text color is preserved on the input. */
  }
  .fb-htxt-tok {
    /* Inline token highlight inside the textarea. The text inside is
       transparent (parent rule) but we set color so the chip "label"
       is faintly visible above its own background — gives the user a
       gentle reassurance the highlight is on the right characters. */
    background: linear-gradient(180deg, #dbeafe 0%, #bfdbfe 100%);
    color: rgba(30,58,138,0.0);  /* invisible — textarea text shows */
    border-radius: 4px;
    box-shadow: inset 0 0 0 1px rgba(30,58,138,0.10);
    padding: 1px 0;
    margin: 0;
  }

  /* Channel pill row below the timeline */
  .fb-rwprev-channel {
    margin-top: 22px;
    padding-top: 16px;
    border-top: 1px solid #f1f5f9;
    display: flex; align-items: center; gap: 10px;
    flex-wrap: wrap;
  }
  .fb-rwprev-channel-l {
    font-size: 12.5px; font-weight: 500; color: #6b7280;
  }
  .fb-rwprev-channel-pills {
    display: flex; gap: 6px; flex-wrap: wrap;
  }
  .fb-rwprev-cpill {
    padding: 6px 11px; font: inherit;
    font-size: 12.5px; font-weight: 600;
    border-radius: 999px; border: 1.5px solid #e5e7eb;
    background: #fff; color: #374151; cursor: pointer;
    transition: all 0.12s ease;
  }
  .fb-rwprev-cpill:hover { background: #f9fafb; border-color: #cbd5e1; }
  .fb-rwprev-cpill.is-active {
    background: #0f172a; color: #fff; border-color: #0f172a;
    box-shadow: 0 2px 6px rgba(15,23,42,0.18);
  }

  /* Recipient lists — chip-style under the channel pills */
  .fb-rwprev-recip {
    margin-top: 10px;
    display: flex; align-items: flex-start; gap: 8px;
  }
  .fb-rwprev-recip-ico {
    font-size: 14px; line-height: 26px;
    flex-shrink: 0;
  }
  .fb-rwprev-recip-chips {
    flex: 1; display: flex; flex-wrap: wrap;
    gap: 6px;
    padding: 6px;
    background: #f8fafc;
    border: 1.5px dashed #e2e8f0; border-radius: 10px;
    min-height: 38px;
  }
  .fb-rwprev-recip-chip {
    display: inline-flex; align-items: center; gap: 4px;
    padding: 4px 4px 4px 10px;
    background: #fff;
    border: 1px solid #e5e7eb; border-radius: 999px;
    font-size: 12.5px; color: #0a0a0a;
    box-shadow: 0 1px 2px rgba(15,23,42,0.04);
    max-width: 100%;
  }
  .fb-rwprev-recip-chip-text {
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    max-width: 200px;
  }
  .fb-rwprev-recip-x {
    width: 18px; height: 18px; padding: 0;
    display: inline-flex; align-items: center; justify-content: center;
    border: 0; border-radius: 50%;
    background: #f1f5f9; color: #475569;
    font-size: 13px; font-weight: 700; line-height: 1; cursor: pointer;
    transition: background 0.12s ease, color 0.12s ease;
  }
  .fb-rwprev-recip-x:hover { background: #fee2e2; color: #b91c1c; }
  .fb-rwprev-recip-input {
    flex: 1; min-width: 110px;
    padding: 4px 8px;
    font: inherit; font-size: 13px;
    border: 0; outline: 0; background: transparent;
    color: #0a0a0a;
  }
  .fb-rwprev-recip-input::placeholder {
    color: #94a3b8; font-style: italic;
  }

  /* Inline AI test panel — visible when fallback="ai" */
  .fb-rwtest-row {
    display: flex; gap: 12px; align-items: stretch;
  }
  .fb-rwtest-input {
    flex: 1; padding: 14px 16px;
    font-size: 15px; color: #0a0a0a;
    border: 1.5px solid #e5e7eb; border-radius: 12px;
    background: #fff; font-family: inherit;
    transition: border-color 0.14s ease, box-shadow 0.14s ease;
  }
  .fb-rwtest-input:focus {
    outline: 0; border-color: #2563eb;
    box-shadow: 0 0 0 4px rgba(37,99,235,0.12);
  }
  .fb-rwtest-btn {
    padding: 0 22px; min-width: 92px;
    font-size: 14.5px; font-weight: 600;
    border-radius: 12px; border: 1.5px solid #0f172a;
    background: linear-gradient(180deg, #0f172a 0%, #1e293b 100%);
    color: #fff; cursor: pointer; font-family: inherit;
    transition: all 0.14s ease;
    box-shadow: 0 2px 8px rgba(15,23,42,0.16);
  }
  .fb-rwtest-btn:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 14px rgba(15,23,42,0.24);
  }
  .fb-rwtest-btn:disabled { opacity: 0.6; cursor: progress; transform: none; }
  .fb-rwtest-preview {
    margin-top: 16px; padding: 22px 24px;
    background: linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%);
    border: 1.5px solid #e2e8f0; border-radius: 16px;
    font-size: 15.5px; line-height: 1.65; color: #0a0a0a;
    white-space: pre-wrap; min-height: 76px;
  }
  .fb-rwtest-preview[data-state="empty"] {
    color: #94a3b8; font-style: italic;
  }
  .fb-rwtest-preview[data-state="loading"] {
    color: #6b7280; font-style: italic;
  }
  .fb-rwtest-preview[data-state="declined"] {
    background: linear-gradient(180deg, #fff7ed 0%, #ffedd5 100%);
    border-color: #fdba74; color: #9a3412;
  }

  /* Read-only cadence summary (driven by the global AI mode).
     Hybrid mode: 3 cadence chunks. Always: "AI replies right away".
     Off: "You'll handle replies". Each state tints the card and the
     status dot to match the top-right control's color semantics. */
  .fb-replywidget-cadinfo {
    margin-top: 8px;
    padding: 18px 20px;
    background: #f8fafc;
    border: 1.5px solid #e2e8f0; border-radius: 14px;
    transition: background 0.18s ease, border-color 0.18s ease;
  }
  .fb-replywidget-cadinfo.is-hybrid {
    background: linear-gradient(180deg, #fffbeb 0%, #fef3c7 100%);
    border-color: #fde68a;
  }
  .fb-replywidget-cadinfo.is-ai_always {
    background: linear-gradient(180deg, #f0fdf4 0%, #dcfce7 100%);
    border-color: #bbf7d0;
  }
  .fb-replywidget-cadinfo.is-i_respond {
    background: linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%);
    border-color: #cbd5e1;
  }
  .fb-replywidget-cadinfo-head {
    display: flex; align-items: center; justify-content: space-between;
    gap: 10px; margin-bottom: 10px;
  }
  .fb-replywidget-cadinfo-h {
    font-size: 11.5px; font-weight: 700;
    letter-spacing: 0.06em; text-transform: uppercase;
    color: #6b7280;
  }
  .fb-replywidget-cadinfo-dot {
    width: 10px; height: 10px; border-radius: 50%;
    background: #d97706;            /* default: hybrid (orange) */
    box-shadow: 0 0 0 3px rgba(217,119,6,0.18);
  }
  .fb-replywidget-cadinfo.is-ai_always .fb-replywidget-cadinfo-dot {
    background: #16a34a;
    box-shadow: 0 0 0 3px rgba(22,163,74,0.20);
  }
  .fb-replywidget-cadinfo.is-i_respond .fb-replywidget-cadinfo-dot {
    background: #94a3b8;
    box-shadow: 0 0 0 3px rgba(148,163,184,0.20);
  }
  .fb-replywidget-cadinfo-times {
    display: flex; flex-wrap: wrap; gap: 8px;
    align-items: baseline;
    font-size: 16px; font-weight: 600; color: #0a0a0a;
    letter-spacing: -0.01em;
  }
  .fb-replywidget-cadinfo-sep { color: #cbd5e1; }
  .fb-replywidget-cadinfo-mode {
    font-size: 16px; font-weight: 500; color: #0a0a0a;
    letter-spacing: -0.01em;
  }
  .fb-replywidget-cadinfo-mode strong {
    font-weight: 700;
  }
  .fb-replywidget-cadinfo-link {
    margin-top: 10px;
    font-size: 12.5px; color: #2563eb; font-weight: 500;
  }

  /* Hidden native radio inside fallback cards */
  .fb-replywidget-radio input {
    appearance: none; -webkit-appearance: none;
    width: 0; height: 0; margin: 0; padding: 0; opacity: 0;
    position: absolute;
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

  /* Disabled fallback card (e.g. AI replies when global mode is Off) */
  .fb-replywidget-fbcard.is-disabled {
    cursor: not-allowed;
    background: #f8fafc;
    border-color: #e5e7eb;
    box-shadow: none;
    transform: none;
  }
  .fb-replywidget-fbcard.is-disabled:hover {
    border-color: #e5e7eb; transform: none;
    box-shadow: none; background: #f8fafc;
  }
  .fb-replywidget-fbcard.is-disabled .fb-replywidget-fbtitle {
    color: #94a3b8;
  }
  .fb-replywidget-fbcard.is-disabled .fb-replywidget-fbsub {
    color: #94a3b8;
  }
  .fb-replywidget-fbtag {
    display: inline-block; margin-left: 8px;
    padding: 2px 8px;
    font-size: 11px; font-weight: 700; letter-spacing: 0.04em;
    text-transform: uppercase;
    color: #6b7280;
    background: #e5e7eb; border-radius: 999px;
    vertical-align: 2px;
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
    margin-top: 26px; padding: 22px 24px;
    background: linear-gradient(180deg, #fffbeb 0%, #fef3c7 100%);
    border: 1.5px solid #fde68a; border-radius: 14px;
  }
  .fb-rwprev-custom-h {
    font-size: 11.5px; font-weight: 700; letter-spacing: 0.08em;
    text-transform: uppercase; color: #92400e; margin-bottom: 12px;
  }
  .fb-rwprev-custom-body {
    font-size: 15px; color: #0a0a0a; line-height: 1.65;
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
    const refresh = () => {
      try {
        const fid = localStorage.getItem("intake_return_form_id");
        const ts  = parseInt(localStorage.getItem("intake_return_form_ts") || "0", 10);
        // The pill is a hand-off from a form. It only shows when this
        // session was actually started from the form's "Add more steps"
        // button — not when the user navigated to Outreach via the
        // sidebar. The sessionStorage flag is set by the form handler
        // and cleared by the sidebar nav.
        const fromForm = sessionStorage.getItem("outreach_came_from_form") === "1";
        const fresh = ts && (Date.now() - ts) < 30 * 60 * 1000;
        setShow(!!(fid && fromForm && fresh));
      } catch (_) { setShow(false); }
    };
    refresh();
    // Re-evaluate when the breadcrumb is cleared by the sidebar handler.
    window.addEventListener("fb-outreach-nav-reset", refresh);
    return () => window.removeEventListener("fb-outreach-nav-reset", refresh);
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
  // formId reads from localStorage on mount and on the
  // fb-outreach-nav-reset event (dispatched when the user clicks
  // Outreach in the sidebar). This way clicking the sidebar nav
  // pulls the canvas back to /me/flows/default — "only what we
  // most recently saved" — instead of showing whatever form-flow
  // the user happened to last open.
  const [formId, setFormId] = React.useState(() => {
    try {
      const fromForm = sessionStorage.getItem("outreach_came_from_form") === "1";
      return fromForm ? (localStorage.getItem("intake_return_form_id") || "") : "";
    } catch (_) { return ""; }
  });
  React.useEffect(() => {
    const onReset = () => {
      try {
        sessionStorage.removeItem("outreach_came_from_form");
        localStorage.removeItem("intake_return_form_id");
        localStorage.removeItem("intake_return_form_ts");
      } catch (_) {}
      setFormId("");
    };
    window.addEventListener("fb-outreach-nav-reset", onReset);
    return () => window.removeEventListener("fb-outreach-nav-reset", onReset);
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
        // Seed with the generic "Input" trigger AND pre-fill its
        // channel with this form so the user lands on a flow that's
        // already wired to the right source — no extra clicks.
        const seed = buildFromTemplate({ activityIds: ["input"] });
        // Look up the form's friendly name so the canvas card reads
        // "📝 Form: Contact form" instead of an opaque id.
        let formLabel = "your form";
        try {
          const fr = await fetch("/me/forms", { credentials: "same-origin" });
          if (fr.ok) {
            const fp = await fr.json();
            const match = (fp?.forms || []).find(f => f.id === formId);
            if (match?.name) formLabel = match.name;
          }
        } catch (_) { /* fall back to default label */ }
        if (seed.nodes && seed.nodes[0]) {
          seed.nodes[0].data = {
            ...seed.nodes[0].data,
            channel: "form",
            channelRef: formId,
            channelLabel: formLabel,
          };
        }
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

  // Used by the custom DeletableEdge (✕ button at midpoint).
  const deleteEdge = React.useCallback((edgeId) => {
    setEdges(es => es.filter(e => e.id !== edgeId));
  }, []);

  const flowContextValue = React.useMemo(
    () => ({ openChooser, deleteEdge }),
    [openChooser, deleteEdge]);

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
  // Cycle check used by both isValidConnection (live, during drag)
  // and onConnectEnd (final, on drop) so the drag preview reflects
  // reality and we can show a "loop" toast when the user lets go.
  const wouldCreateCycle = React.useCallback((source, target) => {
    if (!source || !target) return false;
    if (source === target) return true;
    const adj = {};
    edges.forEach(e => {
      (adj[e.source] = adj[e.source] || []).push(e.target);
    });
    const seen = new Set();
    const queue = [target];
    while (queue.length) {
      const n = queue.shift();
      if (n === source) return true;
      if (seen.has(n)) continue;
      seen.add(n);
      (adj[n] || []).forEach(next => queue.push(next));
    }
    return false;
  }, [edges]);

  // Live drag-preview gate. Returns false → React Flow refuses to
  // snap, so the user gets visual feedback that the drop won't take.
  const isValidConnection = React.useCallback((conn) => {
    if (!conn || conn.source === conn.target) return false;
    const targetNode = nodes.find(n => n.id === conn.target);
    if (targetNode?.data?.activityId === "input") return false;
    if (wouldCreateCycle(conn.source, conn.target)) return false;
    // Refuse a duplicate edge with the same source+target+sourceHandle.
    const sh = conn.sourceHandle || null;
    const dupe = edges.some(e =>
      e.source === conn.source &&
      e.target === conn.target &&
      ((e.sourceHandle || null) === sh));
    if (dupe) return false;
    return true;
  }, [nodes, edges, wouldCreateCycle]);

  const onConnect = React.useCallback(
    (params) => setEdges((es) => {
      // Belt-and-suspenders — isValidConnection should already gate
      // this, but a stray onConnect is cheaper to ignore than to chase.
      const targetNode = nodes.find(n => n.id === params.target);
      if (targetNode && targetNode.data?.activityId === "input") return es;
      if (params.source === params.target) return es;
      const sh = params.sourceHandle || null;
      if (es.some(e =>
        e.source === params.source &&
        e.target === params.target &&
        ((e.sourceHandle || null) === sh))) return es;
      const stroke = sh === "no" ? "#9ca3af" : "#16a34a";
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
    [nodes]);

  // ── Phase 2: drop-on-canvas opens the chooser at the drop point ──
  // React Flow fires onConnectEnd with a connectionState describing
  // whether the drop landed on a target (isValid: true → onConnect
  // already ran) or on empty canvas (isValid: false, no toNode).
  // We reuse the existing chooser modal but stash the drop-point
  // flow coords on it so pickFromChooser can spawn the new node
  // exactly where the user let go.
  const [loopToast, setLoopToast] = React.useState(false);
  const onConnectEnd = React.useCallback((event, connectionState) => {
    const fromNode = connectionState?.fromNode;
    if (!fromNode) return;
    // If the drop was a successful connection, onConnect already
    // handled it — nothing to do here.
    if (connectionState?.isValid) return;
    // If isValid is false BUT the drop landed on a target node
    // (toNode exists), it was rejected — most commonly a cycle.
    if (connectionState?.toNode) {
      if (wouldCreateCycle(fromNode.id, connectionState.toNode.id)) {
        setLoopToast(true);
        setTimeout(() => setLoopToast(false), 2400);
      }
      return;
    }
    // True empty-canvas drop. Translate cursor to flow coords and
    // open the chooser at the drop point.
    if (!rfInstance) return;
    const cx = event.clientX ?? event.changedTouches?.[0]?.clientX;
    const cy = event.clientY ?? event.changedTouches?.[0]?.clientY;
    if (cx == null || cy == null) return;
    const dropAt = rfInstance.screenToFlowPosition({ x: cx, y: cy });
    setChooser({
      sourceId: fromNode.id,
      sourceHandle: connectionState?.fromHandle?.id || null,
      dropAt,
    });
  }, [rfInstance, wouldCreateCycle]);

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
    // Exception: the Input card is the flow's entry point and must
    // never have an incoming edge. Drop it cleanly with no auto-edge
    // so the user manually drags from Input to whatever's next.
    const tail = activityId === "input" ? null : findRightmostOrphan(nodes, edges);
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
    // Default position is 380px to the right of the source. If the
    // chooser was opened by a canvas-drop (drag knob → drop on empty
    // canvas), use the recorded drop coords instead so the new card
    // lands exactly where the user let go. Yes/No vertical offset
    // only applies to "+ Then/Else" buttons, not canvas drops.
    let x, y;
    if (chooser.dropAt) {
      x = chooser.dropAt.x - 180;
      y = chooser.dropAt.y - 50;
    } else {
      x = (sourceNode.position?.x || 0) + 380;
      y = sourceNode.position?.y || 0;
      if (chooser.sourceHandle === "yes") y -= 120;
      if (chooser.sourceHandle === "no")  y += 120;
    }

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
        {!hydrated && (
          <div className="fb-loading" role="status" aria-live="polite" aria-label="Loading your flow">
            <div className="fb-loading-bar"><div className="fb-loading-bar-fill" /></div>
            <div className="fb-loading-label">Loading your flow…</div>
          </div>
        )}
        <div className={`fb-save fb-save-${saveStatus}`} role="status" aria-live="polite">
          {saveStatus === "saving" && <><span className="fb-save-dot" /> Saving…</>}
          {saveStatus === "saved"  && <>✓ Saved</>}
          {saveStatus === "error"  && <>⚠ Couldn't save — will retry</>}
          {saveStatus === "idle" && hydrated && <>Don't worry, we save as you go</>}
        </div>
        <ReturnToFormBanner />
        {loopToast && (
          <div className="fb-loop-toast" role="status" aria-live="polite">
            That would create a loop.
          </div>
        )}

        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={NODE_TYPES}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onConnectEnd={onConnectEnd}
          isValidConnection={isValidConnection}
          edgeTypes={EDGE_TYPES}
          deleteKeyCode={["Delete", "Backspace"]}
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
            // Also lock the Input card — it's the flow's entry point;
            // every other step is meant to descend from it.
            selectedNodeId && !selectedNodeId.endsWith("_demo")
              && selectedNode?.data?.activityId !== "input"
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
