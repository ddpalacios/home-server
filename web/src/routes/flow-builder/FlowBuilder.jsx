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
  // Inline rename. Double-click the title → edit; Enter / blur saves
  // via the FlowContext; Esc cancels. Empty title falls back to the
  // catalog default so a card is never nameless.
  const catalogTitle = ACTIVITY_BY_ID[data.activityId]?.title || "Step";
  const displayTitle = (data.title && data.title.trim()) || catalogTitle;
  const [editingTitle, setEditingTitle] = React.useState(false);
  const [titleDraft, setTitleDraft] = React.useState(displayTitle);
  const titleInputRef = React.useRef(null);
  React.useEffect(() => {
    if (editingTitle && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    }
  }, [editingTitle]);
  const beginRename = (e) => {
    e.stopPropagation();
    setTitleDraft(displayTitle);
    setEditingTitle(true);
  };
  const commitRename = () => {
    if (ctx.renameNode) {
      const next = (titleDraft || "").trim();
      // Only persist when the value changed AND it's different from
      // the catalog default (writing the catalog default just adds a
      // redundant override). Empty string clears the override.
      if (next !== displayTitle) {
        ctx.renameNode(id, next === catalogTitle ? "" : next);
      }
    }
    setEditingTitle(false);
  };
  const cancelRename = () => {
    setTitleDraft(displayTitle);
    setEditingTitle(false);
  };
  // Show the picked channel on the canvas so the user reads "Form:
  // Contact form" without opening the drawer. cardSub falls back to
  // the catalog default when nothing's been picked yet.
  // User-authored descriptions (set in the activity's Settings panel
  // in the drawer) win over every auto-computed subtitle below.
  let cardSub = (data.description && data.description.trim())
                 || data.cardSub || "";
  const userDescribed = !!(data.description && data.description.trim());
  if (isInputNode && !userDescribed) {
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
  // AI Agent: surface the picked bot's name (and a one-line hint of
  // what it does) on the canvas card so the operator can see at a
  // glance which bot is wired into the step. User description still
  // wins if they wrote one in Settings.
  if (data.activityId === "ai_agent" && !userDescribed) {
    if (data.agent_id && data.agent_name) {
      const job = (data.agent_job || "").trim();
      cardSub = "🤖 " + data.agent_name + (job ? " · " + job.slice(0, 60) : "");
    } else {
      cardSub = "⚙ Click to pick a bot";
    }
  }
  const onAddNext = (e) => {
    e.stopPropagation();
    ctx.openChooser({ sourceId: id });
  };
  // Pill content lives next to the text block (not at the right edge)
  // so it can never collide with the drag knob or + button. Only the
  // Input/START card carries a pill — action cards used to show
  // ON/OFF, but every saved step IS effectively "on" the moment it's
  // wired into the canvas. The label was just visual noise.
  const pill = isInputNode
    ? <span className="fb-card-pill fb-card-pill-input">START</span>
    : null;
  // Test runner state — set during a "Test this flow" simulation.
  // undefined for normal use; one of: "running" | "completed" | "failed"
  // | "skipped" | "stopped".
  const runState = data.runState;
  const runClass = runState ? `fb-card-run fb-card-run-${runState}` : "";
  const runBadge =
    runState === "running"   ? "⟳" :
    runState === "completed" ? "✓" :
    runState === "failed"    ? "✕" :
    runState === "skipped"   ? "—" :
    runState === "stopped"   ? "■" : null;
  return (
    <div className={`fb-card fb-kind-${kind} ${isOn ? "is-on" : ""} ${isInputNode ? "fb-card-input" : ""} ${runClass}`}>
      {runBadge && (
        <span
          className={`fb-card-run-badge fb-card-run-badge-${runState}`}
          aria-label={`Test status: ${runState}`}
          title={runState}
        >{runBadge}</span>
      )}
      {!isInputNode && (
        <Handle type="target" position={Position.Left} id="in" className="fb-handle fb-handle-target" />
      )}
      <div className="fb-card-stripe" aria-hidden="true" />
      <div className="fb-card-row">
        <div className="fb-card-icoring" aria-hidden="true">
          <span>{data.icon}</span>
        </div>
        <div className="fb-card-text">
          {editingTitle ? (
            <input
              ref={titleInputRef}
              type="text"
              className="fb-card-title fb-card-title-edit nodrag nopan"
              value={titleDraft}
              maxLength={80}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); commitRename(); }
                else if (e.key === "Escape") { e.preventDefault(); cancelRename(); }
              }}
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
            />
          ) : (
            <div
              className="fb-card-title"
              onDoubleClick={beginRename}
              title="Double-click to rename"
            >
              {displayTitle}
            </div>
          )}
          {cardSub ? (
            <div className="fb-card-sub">{cardSub}</div>
          ) : null}
          <div className="fb-card-meta">{pill}</div>
        </div>
      </div>
      {/* If this is a qualifier AI Agent with declared outcomes, render
          one labeled output handle per outcome (same shape as
          BranchCard's yes/no rows). The handle ids are
          "outcome_<key>" — keys are lowercased + underscored versions
          of the outcome label, matching the engine's branch_key. */}
      {(() => {
        const isQualifierAgent =
          data.activityId === "ai_agent"
          && data.agent_category === "qualifier"
          && Array.isArray(data.agent_outcomes)
          && data.agent_outcomes.length > 0;
        if (!isQualifierAgent) {
          return (
            <>
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
            </>
          );
        }
        // Qualifier path: one labeled row + handle per outcome.
        return (
          <div className="fb-branch-paths fb-aiagent-paths">
            {data.agent_outcomes.map((o, i) => {
              const label = (o.label || "").trim() || ("Outcome " + (i + 1));
              const key = label.toLowerCase()
                .replace(/[^a-z0-9]+/g, "_")
                .replace(/^_+|_+$/g, "");
              const handleId = "outcome_" + (key || ("o" + i));
              return (
                <div className="fb-branch-path is-aiagent" key={handleId}>
                  <span className="fb-branch-path-ico">{o.emoji || "•"}</span>
                  <span className="fb-branch-path-l">{label}</span>
                  <button
                    type="button"
                    className="fb-next-btn nodrag nopan"
                    onClick={(e) => {
                      e.stopPropagation();
                      ctx.openChooser({ sourceId: id, sourceHandle: handleId });
                    }}
                    aria-label={"Add the next step on the " + label + " path"}
                    title={"Add the step that runs when " + label}
                  >
                    <span aria-hidden="true">+</span>
                    <span className="fb-next-btn-l">Then</span>
                  </button>
                  <Handle
                    type="source"
                    position={Position.Right}
                    id={handleId}
                    className="fb-handle fb-handle-yes"
                  />
                </div>
              );
            })}
          </div>
        );
      })()}
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
  // Test runner overlay — when an edge's data.runState is set we draw
  // a second path on top of the BaseEdge so we don't fight React Flow's
  // base styling. "active" is the marching-ants flow effect, "completed"
  // is a soft solid trail.
  const runState = data && data.runState;
  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={style}
        markerEnd={markerEnd}
        interactionWidth={20}
      />
      {runState && (
        <path
          d={edgePath}
          className={`fb-edge-run fb-edge-run-${runState}`}
          fill="none"
        />
      )}
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
function LibraryItem({ activity, disabled, comingSoon }) {
  const isLocked = disabled || comingSoon;
  const onDragStart = (e) => {
    if (isLocked) { e.preventDefault(); return; }
    e.dataTransfer.setData("application/reactflow", activity.id);
    e.dataTransfer.effectAllowed = "move";
  };
  return (
    <div
      className={`fb-lib-item ${isLocked ? "is-locked" : ""}`}
      draggable={!isLocked}
      onDragStart={onDragStart}
      title={comingSoon ? "Coming in a future milestone" : "Drag onto the canvas"}
    >
      <span className="fb-lib-ico" aria-hidden="true">{activity.icon}</span>
      <div className="fb-lib-text">
        <div className="fb-lib-title">{activity.title}</div>
        <div className="fb-lib-sub">{activity.description}</div>
      </div>
      {comingSoon && <span className="fb-lib-badge fb-lib-badge-soon">Soon</span>}
    </div>
  );
}

function FlowLibrary({ collapsed, onToggle, onUseTemplate }) {
  // Lifecycle "trigger" activities are hidden from the sidebar EXCEPT
  // for Input — every flow needs one, and now that Input is deletable
  // the owner needs a way to drag it back in if they removed the
  // auto-seeded one. Other triggers stay out of the catalog UI.
  const inputAct = ACTIVITY_CATALOG.find(a => a.id === "input" && !a.hidden);
  const actions  = ACTIVITY_CATALOG.filter(a => a.kind === "action"  && !a.hidden);
  const logic    = ACTIVITY_CATALOG.filter(a => a.kind === "logic"   && !a.hidden);

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
          {/* Input is the flow's entry point — surfaced first so the
              owner can drag it back if they ever delete the
              auto-seeded one. Other lifecycle triggers stay hidden. */}
          {inputAct && (
            <section className="fb-library-section">
              <h3 className="fb-library-section-h">Where leads come from</h3>
              <p className="fb-library-section-sub">
                Every flow needs one. Re-add if you ever remove it.
              </p>
              <LibraryItem activity={inputAct} />
            </section>
          )}
          <section className="fb-library-section">
            <h3 className="fb-library-section-h">Building blocks</h3>
            <p className="fb-library-section-sub">
              Drop these in anywhere. You can add as many as you want.
            </p>
            {actions.map(a => (
              <LibraryItem key={a.id} activity={a} />
            ))}
          </section>
          {/* Branching section removed — every visible logic block is
              hidden, so the section was just an empty header. */}
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
function NextStepChooser({ source, onPick, onClose }) {
  // Esc closes.
  React.useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Triggers + actions can both be a "next step." The library shows
  // them grouped — same idea here.
  // Lifecycle moments (kind === "trigger") removed from the chooser EXCEPT
  // for Input, which the owner needs as a re-add path if they delete
  // the auto-seeded entry node.
  const inputAct = ACTIVITY_CATALOG.find(a => a.id === "input" && !a.hidden);
  const actions  = ACTIVITY_CATALOG.filter(a => a.kind === "action"  && !a.hidden);
  const logic    = ACTIVITY_CATALOG.filter(a => a.kind === "logic"   && !a.hidden);

  const ChooseRow = ({ a }) => (
    <button
      key={a.id}
      type="button"
      className="fb-chooser-row"
      onClick={() => onPick(a.id)}
    >
      <span className="fb-chooser-ico" aria-hidden="true">{a.icon}</span>
      <span className="fb-chooser-text">
        <span className="fb-chooser-name">{a.title}</span>
        <span className="fb-chooser-sub">{a.description}</span>
      </span>
    </button>
  );

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
          {inputAct && (
            <section className="fb-chooser-section">
              <h3 className="fb-chooser-section-h">Where leads come from</h3>
              <ChooseRow a={inputAct} />
            </section>
          )}
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

// TemplatePicker component removed by design — the canvas now opens
// directly on whatever flow the user navigated to (pack flows are
// synthesized from vertical_flows/<id>.json into nodes+edges). For
// blank starts the user drags from the Library on the left.

// ── Merge tags ──────────────────────────────────────────────────────────
// Friendly chips the user can click to insert at the cursor. Example
// values are used in the live preview so the user sees a real-feeling
// message instead of {first_name} {service_type} placeholder soup.
// Flat list (kept for the existing renderers — applyMergeTags etc.).
// The variable picker re-groups these by `group` so the dropdown
// shows them under semantic headers without us maintaining two lists.
const MERGE_TAGS = [
  { token: "{first_name}",     label: "First name",   sample: "Sam",                  group: "Customer" },
  { token: "{phone}",          label: "Their phone",  sample: "(555) 123-4567",       group: "Customer" },
  { token: "{email}",          label: "Their email",  sample: "sarah@example.com",    group: "Customer" },
  { token: "{message_text}",   label: "Their message",sample: "Hi, I'd like a quote", group: "Customer" },
  { token: "{subject}",        label: "Email subject",sample: "Quote request",        group: "Customer" },
  { token: "{source}",         label: "Lead source",  sample: "Form: Contact",        group: "Customer" },
  { token: "{trigger_channel}",label: "How it triggered", sample: "twilio_sms",       group: "Customer" },
  { token: "{service_type}",   label: "Service",      sample: "the kitchen sink",     group: "Job" },
  { token: "{appointment_at}", label: "Appointment",  sample: "Friday at 10am",       group: "Job" },
  { token: "{owner_name}",     label: "Your name",    sample: "Pat",                  group: "Business" },
  { token: "{review_link}",    label: "Review link",  sample: "g.page/r/your-shop",   group: "Business" },
];

// Phase 3 of the multi-channel Input spec: variable availability map.
// For each merge tag, lists which trigger channels are GUARANTEED to
// populate it (✓), which MIGHT populate it (?), and which leave it
// empty (—). Downstream blocks read this against the upstream Input
// node's trigger_channel to warn when a referenced field won't be
// populated by the configured trigger.
const _VAR_AVAILABILITY = {
  // token: { form: "✓"|"?"|"-", phone: "...", email: "...", multiple: "?" }
  first_name:      { form: "?", phone: "?", email: "?", multiple: "?" },
  phone:           { form: "?", phone: "✓", email: "-", multiple: "?" },
  email:           { form: "?", phone: "-", email: "✓", multiple: "?" },
  message_text:    { form: "?", phone: "✓", email: "✓", multiple: "?" },
  subject:         { form: "-", phone: "-", email: "?", multiple: "?" },
  source:          { form: "✓", phone: "✓", email: "✓", multiple: "✓" },
  trigger_channel: { form: "✓", phone: "✓", email: "✓", multiple: "✓" },
  service_type:    { form: "?", phone: "-", email: "-", multiple: "?" },
  appointment_at:  { form: "?", phone: "-", email: "-", multiple: "?" },
  owner_name:      { form: "✓", phone: "✓", email: "✓", multiple: "✓" },
  review_link:     { form: "✓", phone: "✓", email: "✓", multiple: "✓" },
};

function _availabilityForChannel(token, channel) {
  const bare = String(token || "").replace(/[{}]/g, "");
  const row = _VAR_AVAILABILITY[bare];
  if (!row) return "?";
  return row[channel || "form"] || "?";
}

// Variables surfaced as one-tap chips below the body editor — the most
// commonly used ones, so the typical message is one click to compose.
// The "+ Insert variable" button opens the full searchable picker.
const QUICK_TAGS = ["{first_name}", "{service_type}", "{appointment_at}", "{owner_name}"];

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

function applyMergeTags(text, overrides, tags) {
  // tags: optional dynamic tag list (defaults to MERGE_TAGS). The Notify
  // drawer passes the merged set including account vars so live preview
  // resolves {business_name} / {business_phone} / {business_email} etc.
  // overrides: optional {token: value} map. When provided, replaces a
  // tag's sample with the user-supplied test value.
  // De-dup by token: when the same token appears in multiple groups
  // (e.g. {owner_name} in both Account and Business), the FIRST entry
  // wins so the live account value beats the hardcoded fallback.
  const list = tags || MERGE_TAGS;
  const seen = new Set();
  let out = String(text || "");
  for (const t of list) {
    if (seen.has(t.token)) continue;
    seen.add(t.token);
    const sub = (overrides && overrides[t.token] != null && overrides[t.token] !== "")
      ? overrides[t.token]
      : (t.sample || "");
    out = out.split(t.token).join(sub);
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
function PhonePreview({ mode, subject, body, fromName, previewValues, tags, spokenMessage }) {
  const renderedBody = applyMergeTags(body || "", previewValues, tags);
  const renderedSubject = applyMergeTags(subject || "", previewValues, tags);
  const renderedSpoken = applyMergeTags(spokenMessage || "", previewValues, tags);
  // Detect channels from any mode shape: legacy single string ("sms" /
  // "email" / "both" / "call") OR notify's comma-joined multi-select
  // ("sms,email,call"). Building flags up front lets one render path
  // handle every combination.
  const m = String(mode || "").toLowerCase();
  const parts = m.split(",").map(s => s.trim()).filter(Boolean);
  const showSms   = parts.includes("sms")   || m === "both";
  const showEmail = parts.includes("email") || m === "both";
  const showCall  = parts.includes("call");
  const isWait    = m === "wait";
  const anyChannel = showSms || showEmail || showCall;

  return (
    <div className="fb-phone">
      <div className="fb-phone-notch" />
      <div className="fb-phone-screen">
        <div className="fb-phone-statusbar">
          <span>9:41</span>
          <span>● ● ●</span>
        </div>
        {isWait ? (
          <div className="fb-phone-wait">
            <div className="fb-phone-wait-ico">⏱️</div>
            <div className="fb-phone-wait-h">Nothing happens here</div>
            <div className="fb-phone-wait-p">
              We just pause before the next step.
            </div>
          </div>
        ) : !anyChannel ? (
          <div className="fb-phone-wait">
            <div className="fb-phone-wait-h">Pick a channel to preview</div>
          </div>
        ) : (
          <div className="fb-phone-both">
            {showSms && (
              <div className="fb-phone-sms">
                <div className="fb-phone-sms-from">{fromName || "Your business"}</div>
                <div className="fb-phone-sms-bubble">
                  {renderedBody || <span className="fb-phone-empty">Your message will appear here as you type</span>}
                </div>
              </div>
            )}
            {showEmail && (
              <div className="fb-phone-mail" style={{ marginTop: showSms ? 12 : 0 }}>
                <div className="fb-phone-mail-from">
                  <strong>{fromName || "Your business"}</strong>
                </div>
                <div className="fb-phone-mail-subject">
                  {renderedSubject || <span className="fb-phone-empty">Your subject will appear here</span>}
                </div>
                <div className="fb-phone-mail-body">
                  {renderedBody || <span className="fb-phone-empty">Your message will appear here as you type</span>}
                </div>
              </div>
            )}
            {showCall && (
              <div className="fb-phone-call" style={{ marginTop: (showSms || showEmail) ? 12 : 0 }}>
                <div className="fb-phone-call-h">📞 Incoming call</div>
                <div className="fb-phone-call-body">
                  {renderedSpoken || <span className="fb-phone-empty">What the AI says will appear here</span>}
                </div>
              </div>
            )}
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
  onChange, onFocus, onKeyDown,
  dataAiEditable, dataAiFieldType, autoFocus, style,
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
        onKeyDown={onKeyDown}
        onScroll={handleScroll}
        autoFocus={autoFocus}
        style={style}
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

function ReplyPhonePreview() {
  // "How this plays out" timeline + nudge editor + channel pills
  // + "Live preview" panel — all removed at owner's request. The
  // Reply block now configures purely via the left-side drawer.
  return null;
}

function _ReplyPhonePreview_LEGACY_UNUSED({
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
                              title={`Adds ${t.token}\n` +
                                `Availability — form: ${_availabilityForChannel(t.token, "form")}` +
                                `  phone: ${_availabilityForChannel(t.token, "phone")}` +
                                `  email: ${_availabilityForChannel(t.token, "email")}` +
                                `  multi: ${_availabilityForChannel(t.token, "multiple")}`}><span style={{
                                  display: "inline-block",
                                  width: 6, height: 6, borderRadius: 999,
                                  marginRight: 6, verticalAlign: "middle",
                                  background: (() => {
                                    const codes = ["form","phone","email","multiple"]
                                      .map(ch => _availabilityForChannel(t.token, ch));
                                    if (codes.every(c => c === "✓")) return "#16a34a";
                                    if (codes.some(c => c === "-")) return "#f59e0b";
                                    return "#94a3b8";
                                  })(),
                                }} />{t.label}</button>
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
                              title={`Adds ${t.token}\n` +
                                `Availability — form: ${_availabilityForChannel(t.token, "form")}` +
                                `  phone: ${_availabilityForChannel(t.token, "phone")}` +
                                `  email: ${_availabilityForChannel(t.token, "email")}` +
                                `  multi: ${_availabilityForChannel(t.token, "multiple")}`}><span style={{
                                  display: "inline-block",
                                  width: 6, height: 6, borderRadius: 999,
                                  marginRight: 6, verticalAlign: "middle",
                                  background: (() => {
                                    const codes = ["form","phone","email","multiple"]
                                      .map(ch => _availabilityForChannel(t.token, ch));
                                    if (codes.every(c => c === "✓")) return "#16a34a";
                                    if (codes.some(c => c === "-")) return "#f59e0b";
                                    return "#94a3b8";
                                  })(),
                                }} />{t.label}</button>
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

// ── Input panel (drawer for the "Input" trigger) ───────────────────────
// One-to-one with the Lead Intake form-builder modal. Same field cards,
// same Required/Optional pill toggle, same "+ Add field ▾" dropdown,
// same live-preview render. Editing a form here is the same edit you'd
// make on the Lead Intake page; both surfaces hit /me/forms/<id> with
// identical payloads.
//
// Field shape (matches dashboard_form_editor.html):
//   { key, label, type, required, options?, builtin? }
// where type ∈ {text, email, phone, address, textarea, select, date, number}
const FB_FIELD_ICON = {
  text: "📝", email: "📧", phone: "📞", address: "🏠",
  textarea: "💬", select: "📋", date: "⏰", number: "🔢",
};
const FB_FIELD_TYPE_LABEL = {
  text: "Short text", email: "Email", phone: "Phone",
  address: "Address", textarea: "Long text", select: "Pick from a list",
  date: "Date", number: "Number",
};
const FB_BUILTINS = [
  { key: "name",        label: "Name",          type: "text" },
  { key: "email",       label: "Email",         type: "email" },
  { key: "phone",       label: "Phone",         type: "phone" },
  { key: "address",     label: "Address",       type: "address" },
  { key: "message",     label: "What they need", type: "textarea" },
  { key: "service",     label: "What service",  type: "select", options: ["Service A", "Service B"] },
  { key: "date_needed", label: "When",          type: "date" },
  { key: "budget",      label: "Budget",        type: "text" },
  { key: "company",     label: "Company",       type: "text" },
];

// ── AI Agent picker panel (Phase 1) ─────────────────────────────────
// Lives inside the activity drawer when activity.id === "ai_agent".
// Fetches /me/agents, classifies each by behavior_config.job to give
// fit guidance ("Great for flows" vs. "Better used as a widget"),
// and renders a behavior preview tailored to the chosen bot. The
// picker writes agent_id + a snapshot of the bot's name/job/outcomes
// onto node.data so the canvas + Phase 2 execution can read them
// without re-fetching /me/agents on every keystroke.
//
// The owner does NOT configure bot behavior here. The "Edit bot"
// link routes to the agent's workspace where the Prompt tab lives.

// Map a free-text behavior_config.job to a category the flow can
// route around. The categories drive both fit guidance and the
// preview shape. Recognized categories:
//   widget          — Customer-facing widget, awkward in a flow
//   internal        — Internal team helper, awkward in a flow
//   qualifier       — Decides what happens next (BRANCHES the flow)
//   message_writer  — Produces a piece of text for next step
//   conversationalist — Two-way conversation with the lead
//   extractor       — Pulls structured fields out of input
//   custom          — Owner wrote their own job, can't classify
const _AI_AGENT_JOB_CATEGORIES = {
  qualifier: {
    keywords: ["qualif", "screen", "decide", "route", "score", "prioriti"],
    fit: "good",
    fitLabel: "Great for flow automation",
    icon: "🎯",
    previewVerb: "Look at each lead and decide what happens next based on the rules you set in its Prompt tab.",
    outcomesHeader: "Possible outcomes (the bot picks ONE per lead):",
    branchNote: "When you save, your flow gets one branch per outcome.",
    defaultOutcomes: [
      { emoji: "🔥", label: "Hot lead" },
      { emoji: "💬", label: "Warm lead" },
      { emoji: "📧", label: "Cold lead" },
      { emoji: "❓", label: "Unsure" },
    ],
  },
  message_writer: {
    keywords: ["outreach", "message", "write", "personali", "compose", "draft"],
    fit: "good",
    fitLabel: "Great for flow automation",
    icon: "✍️",
    previewVerb: "Write a tailored message based on the lead's info. The message is available to use in the next step (text, email, or call script).",
    extraNote: "The next step can pull this in as {ai_message}.",
  },
  conversationalist: {
    keywords: ["conversat", "chat", "interview", "intake", "talk", "book", "appoint"],
    fit: "good",
    fitLabel: "Great for flow automation",
    icon: "💬",
    previewVerb: "Have a conversation with the lead to collect details. The flow waits for the conversation to finish, then continues with the info.",
    pauseWarning: "This step waits for the lead to respond. Don't use it in flows that need to run instantly.",
  },
  extractor: {
    keywords: ["pars", "extract", "structur", "fill", "capture details", "pull out"],
    fit: "good",
    fitLabel: "Great for flow automation",
    icon: "📋",
    previewVerb: "Read the lead's input and pull out structured details. The details are available in the next steps.",
    extraNote: "The next steps can use {ai_extracted.<field>} (service, urgency, budget, etc.).",
  },
  widget: {
    keywords: ["customer", "website", "general", "service questions", "support"],
    fit: "warn",
    fitLabel: "Better used as a website widget",
    icon: "🌐",
    previewVerb: "This bot is built to answer questions on a website widget. Running it inside a flow works, but the bot likely wasn't built with a specific in-flow outcome in mind.",
  },
  internal: {
    keywords: ["internal team", "internal", "knowledge", "team chat", "find information"],
    fit: "warn",
    fitLabel: "Better used as a team chat URL",
    icon: "🧑‍💼",
    previewVerb: "This bot is built for your team to chat with. Using it inside a customer-facing flow works, but the bot likely wasn't built with a specific in-flow outcome in mind.",
  },
};

function _aiAgentCategorize(agent) {
  // Default-bots get classified by their type field (customer / internal)
  // before we look at the job text. This handles the seed bots even
  // when the job string is empty.
  const t = (agent.type || "").toLowerCase();
  if (t === "customer") return "widget";
  if (t === "internal") return "internal";
  const job = ((agent.behavior_config || {}).job || "").toLowerCase().trim();
  if (!job) return "custom";
  for (const [cat, def] of Object.entries(_AI_AGENT_JOB_CATEGORIES)) {
    for (const kw of def.keywords) {
      if (job.indexOf(kw) >= 0) return cat;
    }
  }
  return "custom";
}

function AiAgentPanel({ nodeId, data, onChange }) {
  const [loading, setLoading] = React.useState(true);
  const [agents, setAgents] = React.useState([]);
  const [selectedId, setSelectedId] = React.useState(data.agent_id || "");

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch("/me/agents", { credentials: "same-origin" })
      .then(r => r.ok ? r.json() : { agents: [] })
      .then(d => { if (!cancelled) { setAgents(d.agents || []); setLoading(false); } })
      .catch(() => { if (!cancelled) { setAgents([]); setLoading(false); } });
    return () => { cancelled = true; };
  }, []);

  const pick = (agent) => {
    setSelectedId(agent.id);
    const cat = _aiAgentCategorize(agent);
    const meta = _AI_AGENT_JOB_CATEGORIES[cat] || null;
    const outcomes = (cat === "qualifier")
      ? (agent.behavior_config?.outcomes || meta?.defaultOutcomes || [])
      : [];
    onChange(nodeId, {
      agent_id:       agent.id,
      agent_name:     agent.name || "",
      agent_job:      (agent.behavior_config || {}).job || "",
      agent_category: cat,
      agent_outcomes: outcomes,
    });
  };

  const selectedAgent = agents.find(a => a.id === selectedId) || null;

  if (loading) {
    return <div className="fb-aiagent-loading">Loading your bots…</div>;
  }

  if (!agents.length) {
    return (
      <div className="fb-aiagent-empty">
        <p>You haven't created any bots yet.</p>
        <a href="/dashboard#agents" target="_top" className="fb-aiagent-create">
          + Create a bot
        </a>
      </div>
    );
  }

  return (
    <div className="fb-aiagent">
      <div className="fb-aiagent-l">Which bot handles this step?</div>
      <div className="fb-aiagent-list">
        {agents.map(a => {
          const cat = _aiAgentCategorize(a);
          const meta = _AI_AGENT_JOB_CATEGORIES[cat];
          const isSelected = a.id === selectedId;
          const fitTag = meta
            ? (meta.fit === "good"
                ? <span className="fb-aiagent-fit is-good">✓ {meta.fitLabel}</span>
                : <span className="fb-aiagent-fit is-warn">⚠ {meta.fitLabel}</span>)
            : null;
          const job = (a.behavior_config || {}).job || "";
          return (
            <button
              key={a.id}
              type="button"
              className={`fb-aiagent-row ${isSelected ? "is-selected" : ""}`}
              onClick={() => pick(a)}
            >
              <span className="fb-aiagent-radio" aria-hidden="true">
                {isSelected ? "●" : "○"}
              </span>
              <span className="fb-aiagent-text">
                <span className="fb-aiagent-name">
                  {meta ? meta.icon + " " : "🤖 "}{a.name || "Untitled bot"}
                </span>
                {job ? <span className="fb-aiagent-job">{job}</span> : null}
                {fitTag}
              </span>
            </button>
          );
        })}
      </div>
      <div className="fb-aiagent-create-row">
        Don't have the right bot?
        {" "}
        <a href="/dashboard#agents" target="_top">+ Create a new bot</a>
      </div>

      {selectedAgent && <AiAgentPreview agent={selectedAgent} />}
    </div>
  );
}

function AiAgentPreview({ agent }) {
  const cat = _aiAgentCategorize(agent);
  const meta = _AI_AGENT_JOB_CATEGORIES[cat];
  const name = agent.name || "This bot";
  const editUrl = `/dashboard#agents/${encodeURIComponent(agent.id)}`;
  // Compact single-block preview. One sentence about what the bot
  // will do at this step, a short outcomes list for qualifiers, and
  // an Edit link. No multi-block tutorial copy.
  let blurb;
  if (cat === "qualifier") {
    const outcomes = (agent.behavior_config?.outcomes
                       && agent.behavior_config.outcomes.length
                       ? agent.behavior_config.outcomes
                       : meta.defaultOutcomes);
    blurb = (
      <>
        <p className="fb-aiagent-preview-p">Decides what happens next, one of:</p>
        <ul className="fb-aiagent-outcomes">
          {outcomes.map((o, i) => (
            <li key={i}>
              <span className="fb-aiagent-outcome-emoji">{o.emoji || "•"}</span>
              <span>{o.label}</span>
            </li>
          ))}
        </ul>
      </>
    );
  } else if (cat === "message_writer") {
    blurb = <p className="fb-aiagent-preview-p">Writes a personalized message. Next step can use it as {"{ai_message}"}.</p>;
  } else if (cat === "extractor") {
    blurb = <p className="fb-aiagent-preview-p">Pulls structured details from the lead's input. Next steps can use {"{ai_extracted.<field>}"}.</p>;
  } else if (cat === "conversationalist") {
    blurb = <p className="fb-aiagent-preview-p">Chats with the lead. The step waits until the chat ends.</p>;
  } else if (cat === "widget" || cat === "internal") {
    blurb = <p className="fb-aiagent-preview-p" style={{color:"#92400e"}}>This bot is built for a {cat === "widget" ? "website widget" : "team chat URL"} and may not produce a clean in-flow outcome.</p>;
  } else {
    const job = (agent.behavior_config || {}).job || "";
    blurb = <p className="fb-aiagent-preview-p">{job ? <>Runs your custom behavior: <em>{job}</em></> : "Runs the bot's prompt as-is."}</p>;
  }
  return (
    <div className="fb-aiagent-preview">
      {blurb}
      <a href={editUrl} target="_top" className="fb-aiagent-edit">
        Edit {name} →
      </a>
    </div>
  );
}


// Multi-channel input chooser. Dropdown of trigger types — phone is
// SPLIT into two virtual options ("sms" + "call_ended") so the user
// picks the specific event up front instead of choosing "phone" then
// configuring sub-flags. Backend matcher still sees trigger_channel=
// "phone" with on_sms / on_call_ended on channel_settings — we just
// map the virtual pick down to that shape on save and back up to the
// virtual id on load. "Multiple of these" was removed; the dropdown
// is one event per Input node (multiple Inputs in a flow handle the
// "mix and match" use case cleanly).
const _INPUT_CHANNEL_OPTIONS = [
  { id: "form",       label: "📝  A form submission",
    sub: "When someone fills out one of your forms" },
  { id: "sms",        label: "💬  An SMS to my Twilio number",
    sub: "When someone texts your Twilio business number" },
  { id: "call_ended", label: "📞  After a phone call ends",
    sub: "Notification fires when the Twilio number's call hangs up — "
         + "either a forwarded call or a direct call to your Twilio line" },
  { id: "email",      label: "✉️  An email I receive",
    sub: "When a matching email lands in your connected Gmail" },
];

// Map a virtual-channel id to a {trigger_channel, channel_settings_patch}.
// Used on save so the backend matcher sees its existing shape.
function _virtualToBackend(virtualId, currentSettings) {
  const cs = { ...(currentSettings || {}) };
  if (virtualId === "sms") {
    return {
      trigger_channel: "phone",
      channel_settings: { ...cs, on_sms: true, on_call_ended: false },
    };
  }
  if (virtualId === "call_ended") {
    return {
      trigger_channel: "phone",
      channel_settings: { ...cs, on_call_ended: true, on_sms: false },
    };
  }
  return { trigger_channel: virtualId, channel_settings: cs };
}

// Reverse mapping for hydration: read the persisted (trigger_channel +
// channel_settings) and figure out which virtual option to show.
function _backendToVirtual(triggerChannel, channelSettings) {
  if (triggerChannel === "phone") {
    const cs = channelSettings || {};
    if (cs.on_sms && !cs.on_call_ended) return "sms";
    if (cs.on_call_ended && !cs.on_sms) return "call_ended";
    if (cs.on_sms && cs.on_call_ended)  return "sms";    // legacy both-on
    return "call_ended";  // empty phone state defaults to call_ended
  }
  // "form" / "email" / unset
  return triggerChannel || "form";
}

function _InputChannelChooser({ value, onPick }) {
  const current = _INPUT_CHANNEL_OPTIONS.find(o => o.id === value)
                  || _INPUT_CHANNEL_OPTIONS[0];
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{
        display: "block", fontSize: 12, fontWeight: 700,
        color: "#475569", textTransform: "uppercase",
        letterSpacing: ".04em", marginBottom: 6,
      }}>
        Trigger
      </label>
      <select
        value={value || "form"}
        onChange={(e) => onPick(e.target.value)}
        style={{
          width: "100%", padding: "10px 12px", border: "1px solid #cbd5e1",
          borderRadius: 8, background: "#fff", color: "#0f172a",
          fontSize: 13.5, fontWeight: 500, font: "inherit", cursor: "pointer",
          outline: "none",
        }}
      >
        {_INPUT_CHANNEL_OPTIONS.map(o => (
          <option key={o.id} value={o.id}>{o.label}</option>
        ))}
      </select>
      <div style={{
        fontSize: 12, color: "#64748b", marginTop: 6, lineHeight: 1.45,
      }}>
        {current.sub}
      </div>
    </div>
  );
}

function _EmailTriggerConfig({ settings, onChange }) {
  // Pulls /me/email-connections so the owner sees WHICH inbox the
  // trigger is bound to + a connect CTA when none is wired yet.
  const [conns, setConns] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [connectUrl, setConnectUrl] = React.useState("/auth/google/connect-email");
  React.useEffect(() => {
    let cancelled = false;
    fetch("/me/email-connections", { credentials: "same-origin" })
      .then(r => r.ok ? r.json() : { connections: [] })
      .then(d => {
        if (cancelled) return;
        const list = (d.connections || []).filter(c =>
          (c.status || "active") === "active");
        setConns(list);
        if (d.connect_url) setConnectUrl(d.connect_url);
        setLoading(false);
        // If exactly one connection and the picked address isn't yet
        // set (or doesn't match any), default to it.
        if (list.length && !settings.inbox_address) {
          onChange({ ...settings, inbox_address: list[0].email_address || "" });
        }
      })
      .catch(() => { if (!cancelled) { setConns([]); setLoading(false); } });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{
      border: "1px solid #e5e7eb", background: "#fff",
      borderRadius: 10, padding: 14, fontSize: 13, color: "#374151",
    }}>
      <div style={{ fontWeight: 700, color: "#0f172a", marginBottom: 4 }}>
        ✉️ Incoming email
      </div>
      <p style={{ margin: "0 0 10px", lineHeight: 1.5,
                  fontSize: 12.5, color: "#64748b" }}>
        Triggers within ~5 minutes of an email arriving on your
        connected Gmail. All filters are optional — leave blank to
        match any.
      </p>

      {/* Inbox picker — sourced from /me/email-connections. */}
      <label style={{ display: "block", fontSize: 12, fontWeight: 600,
                      color: "#374151", marginBottom: 4 }}>
        Which inbox?
      </label>
      {loading ? (
        <div style={{ color: "#9ca3af", fontSize: 12, marginBottom: 10 }}>
          Loading your connected Gmail accounts…
        </div>
      ) : conns.length ? (
        <select
          value={settings.inbox_address || ""}
          onChange={(e) => onChange({ ...settings, inbox_address: e.target.value })}
          style={{ width: "100%", padding: "8px 10px",
                   border: "1px solid #d1d5db", borderRadius: 6,
                   fontSize: 13, marginBottom: 10, boxSizing: "border-box",
                   background: "#fff" }}
        >
          {conns.length > 1 && <option value="">Any of my inboxes</option>}
          {conns.map(c => (
            <option key={c.id || c.email_address} value={c.email_address}>
              {c.email_address}
            </option>
          ))}
        </select>
      ) : (
        <div style={{
          padding: 10, border: "1px dashed #d1d5db", borderRadius: 6,
          fontSize: 12.5, color: "#6b7280", marginBottom: 10,
        }}>
          You haven't connected a Gmail account yet.
          {" "}
          <a href={connectUrl} target="_top"
             style={{ color: "#185fa5", fontWeight: 600 }}>
            + Connect Gmail
          </a>
        </div>
      )}

      {/* Restrictions — optional filters that narrow which emails
          trigger this flow. Comma-separated, case-insensitive
          substring match. Leaving any field blank means "match
          anything for this field" (i.e. the field is ignored).
          Backed by from_match / subject_match / to_match in
          sequences/multi_channel_input.py. */}
      <div style={{
        marginTop: 4, marginBottom: 8, padding: 10,
        background: "#f8fafc", border: "1px solid #e5e7eb",
        borderRadius: 8,
      }}>
        <div style={{ fontSize: 12, fontWeight: 700,
                       color: "#0f172a", marginBottom: 2 }}>
          Restrict which emails trigger this flow
        </div>
        <div style={{ fontSize: 11.5, color: "#64748b",
                       marginBottom: 8, lineHeight: 1.4 }}>
          Without restrictions, every email to this inbox triggers
          the flow. Add at least one filter below to narrow it down.
        </div>
        {[
          { key: "from_match",
            label: "From (sender contains)",
            ph:    "jane@acme.com, @vendor.com" },
          { key: "subject_match",
            label: "Subject contains",
            ph:    "invoice, order, support" },
          { key: "to_match",
            label: "Sent to address",
            ph:    "sales@yourco.com" },
        ].map(f => (
          <label key={f.key} style={{ display: "block", marginBottom: 6 }}>
            <span style={{ display: "block", fontSize: 11.5, fontWeight: 600,
                           color: "#374151", marginBottom: 2 }}>{f.label}</span>
            <input type="text"
              value={settings[f.key] || ""}
              placeholder={f.ph}
              onChange={(e) => onChange({ ...settings, [f.key]: e.target.value })}
              style={{ width: "100%", padding: "6px 8px",
                       border: "1px solid #d1d5db", borderRadius: 6,
                       fontSize: 12.5, boxSizing: "border-box" }}
            />
          </label>
        ))}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 6 }}>
        {[
          { id: "skip_spam",        label: "Skip spam emails",                       defaultOn: true },
          { id: "skip_promotional", label: "Skip promotional emails (newsletters)",  defaultOn: true },
          { id: "skip_own_domain",  label: "Skip emails from your own team's domain", defaultOn: true },
        ].map(opt => {
          const checked = settings[opt.id] === undefined ? opt.defaultOn : !!settings[opt.id];
          return (
            <label key={opt.id} style={{ fontSize: 12.5, color: "#0f172a",
                                          display: "flex", alignItems: "center", gap: 6 }}>
              <input type="checkbox"
                checked={checked}
                onChange={(e) => onChange({ ...settings, [opt.id]: e.target.checked })}
              />
              {opt.label}
            </label>
          );
        })}
      </div>
    </div>
  );
}

function _PhoneTriggerConfig({ settings, onChange, hideEventToggles }) {
  // Pulls /me/phones once per mount to populate a number dropdown
  // and surface the voice-agent conflict warning when the picked
  // number already routes answered calls to a voice bot.
  const [phones, setPhones] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  React.useEffect(() => {
    let cancelled = false;
    fetch("/me/phones", { credentials: "same-origin" })
      .then(r => r.ok ? r.json() : { phones: [] })
      .then(d => {
        if (cancelled) return;
        setPhones(d.phones || []);
        setLoading(false);
      })
      .catch(() => { if (!cancelled) { setPhones([]); setLoading(false); } });
    return () => { cancelled = true; };
  }, []);

  const picked = phones.find(p =>
    (p.phone_number || "").replace(/\D+/g, "")
      === (settings.phone_number || "").replace(/\D+/g, ""));
  const routing = (picked && picked.routing) || {};
  const hasVoiceAgent = !!(routing.voice_agent_id || routing.voice_intent
                           || routing.voice_template);

  return (
    <div style={{
      border: "1px solid #e5e7eb", background: "#fff",
      borderRadius: 10, padding: 14, fontSize: 13, color: "#374151",
    }}>
      <div style={{ fontWeight: 700, color: "#0f172a", marginBottom: 4 }}>
        📞 Calls and texts
      </div>
      <p style={{ margin: "0 0 10px", lineHeight: 1.5,
                  fontSize: 12.5, color: "#64748b" }}>
        Triggers when an event lands on your Twilio number.
      </p>

      <label style={{ display: "block", fontSize: 12, fontWeight: 600,
                      color: "#374151", marginBottom: 4 }}>
        Phone number
      </label>
      {loading ? (
        <div style={{ color: "#9ca3af", fontSize: 12, marginBottom: 10 }}>
          Loading your numbers…
        </div>
      ) : phones.length ? (
        <select
          value={settings.phone_number || ""}
          onChange={(e) => onChange({ ...settings, phone_number: e.target.value })}
          style={{ width: "100%", padding: "8px 10px",
                   border: "1px solid #d1d5db", borderRadius: 6,
                   fontSize: 13, marginBottom: 10, boxSizing: "border-box",
                   background: "#fff" }}
        >
          <option value="">Any of my numbers</option>
          {phones.map(p => (
            <option key={p.phone_id} value={p.phone_number}>
              {p.phone_display || p.phone_number}
            </option>
          ))}
        </select>
      ) : (
        <div style={{
          padding: 10, border: "1px dashed #d1d5db", borderRadius: 6,
          fontSize: 12.5, color: "#6b7280", marginBottom: 10,
        }}>
          You don't have any Twilio numbers connected yet.
          {" "}
          <a href="/dashboard#phones" target="_top"
             style={{ color: "#185fa5", fontWeight: 600 }}>
            + Connect a number
          </a>
        </div>
      )}

      {hasVoiceAgent && (
        <div style={{
          background: "#fef3c7", border: "1px solid #fde68a",
          borderRadius: 8, padding: "8px 10px", marginBottom: 10,
          fontSize: 12, color: "#92400e", lineHeight: 1.5,
        }}>
          ⚠ A voice bot already handles live calls on this number.
          This flow will still fire <em>after the call ends</em>, so
          downstream blocks can follow up — just don't ship a step
          that texts the customer mid-call.
        </div>
      )}

      {!hideEventToggles && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {[
            { id: "on_sms",        label: "When a text message comes in" },
            { id: "on_call_ended", label: "When a phone call ends (answered, missed, voicemail)" },
          ].map(opt => (
            <label key={opt.id} style={{ fontSize: 12.5, color: "#0f172a",
                                          display: "flex", alignItems: "center", gap: 6 }}>
              <input type="checkbox"
                checked={!!settings[opt.id]}
                onChange={(e) => onChange({ ...settings, [opt.id]: e.target.checked })}
              />
              {opt.label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

function _InputChannelComingSoon({ kind, settings, onChange }) {
  // Per-channel trigger config. Phone + Email are runtime-wired:
  // configuring here means inbound events actually fire the flow.
  // Virtual phone ids ("sms" / "call_ended") share the same phone
  // config — we just hide the per-event checkboxes since the
  // dropdown already picked the event.
  if (kind === "phone" || kind === "sms" || kind === "call_ended") {
    return <_PhoneTriggerConfig settings={settings} onChange={onChange}
                                 hideEventToggles={kind === "sms" || kind === "call_ended"} />;
  }
  if (kind === "email") {
    return <_EmailTriggerConfig settings={settings} onChange={onChange} />;
  }
  // (legacy inline-email block follows — kept disabled by the early
  // return above so the new component is the only render path)
  if (false) {
    return (
      <div style={{
        border: "1px solid #e5e7eb", background: "#fff",
        borderRadius: 10, padding: 14, fontSize: 13, color: "#374151",
      }}>
        <div style={{ fontWeight: 700, color: "#0f172a", marginBottom: 4 }}>
          ✉️ Incoming email
        </div>
        <p style={{ margin: "0 0 10px", lineHeight: 1.5,
                    fontSize: 12.5, color: "#64748b" }}>
          Triggers within ~5 minutes of an email arriving on your
          connected Gmail. All filters are optional — leave blank to
          match any.
        </p>
        {[
          { key: "from_match",    label: "From these senders (comma-separated, blank = any)" },
          { key: "subject_match", label: "Subject contains (comma-separated, blank = any)" },
          { key: "to_match",      label: "Sent to this address (blank = any)" },
        ].map(f => (
          <label key={f.key} style={{ display: "block", marginBottom: 8 }}>
            <span style={{ display: "block", fontSize: 12, fontWeight: 600,
                           color: "#6b7280", marginBottom: 4 }}>{f.label}</span>
            <input type="text"
              value={settings[f.key] || ""}
              onChange={(e) => onChange({ ...settings, [f.key]: e.target.value })}
              style={{ width: "100%", padding: "8px 10px", border: "1px solid #d1d5db",
                       borderRadius: 6, fontSize: 13, boxSizing: "border-box" }}
            />
          </label>
        ))}
        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 6 }}>
          {[
            { id: "skip_spam",        label: "Skip spam emails", defaultOn: true },
            { id: "skip_promotional", label: "Skip promotional emails", defaultOn: true },
            { id: "skip_own_domain",  label: "Skip emails from your own team's domain", defaultOn: true },
          ].map(opt => {
            const checked = settings[opt.id] === undefined ? opt.defaultOn : !!settings[opt.id];
            return (
              <label key={opt.id} style={{ fontSize: 12.5, color: "#0f172a",
                                            display: "flex", alignItems: "center", gap: 6 }}>
                <input type="checkbox"
                  checked={checked}
                  onChange={(e) => onChange({ ...settings, [opt.id]: e.target.checked })}
                />
                {opt.label}
              </label>
            );
          })}
        </div>
      </div>
    );
  }
  // multiple — one Input block, multiple enabled triggers. Each
  // child trigger persists under channel_settings.<kind>; matchers
  // honor the same per-channel settings as single-channel mode.
  const multi = settings.multi || {};
  const setMultiKind = (kind, patch) =>
    onChange({
      ...settings,
      multi: { ...multi, [kind]: { ...(multi[kind] || {}), ...patch } },
    });
  const toggleKind = (kind) =>
    setMultiKind(kind, { enabled: !((multi[kind] || {}).enabled) });
  const isOn = (kind) => !!(multi[kind] && multi[kind].enabled);
  return (
    <div>
      <div style={{
        border: "1px solid #e5e7eb", background: "#fff",
        borderRadius: 10, padding: 14, fontSize: 13, color: "#374151",
        marginBottom: 10,
      }}>
        <div style={{ fontWeight: 700, color: "#0f172a", marginBottom: 4,
                      fontSize: 13.5 }}>
          🔀 Multiple triggers
        </div>
        <p style={{ margin: 0, lineHeight: 1.5, color: "#64748b", fontSize: 12.5 }}>
          This flow runs when ANY enabled trigger fires. Downstream
          blocks read the same <code>{"{{lead.message}}"}</code> and
          <code>{"{{lead.source}}"}</code> variables regardless of
          which channel triggered.
        </p>
      </div>

      {/* Phone toggle + inline config */}
      <div style={{
        border: "1px solid " + (isOn("phone") ? "#0f172a" : "#e5e7eb"),
        background: isOn("phone") ? "#f8fafc" : "#fff",
        borderRadius: 10, padding: 12, marginBottom: 8,
      }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8,
                        fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
          <input type="checkbox" checked={isOn("phone")}
                 onChange={() => toggleKind("phone")} />
          📞 A call or text to my phone number
        </label>
        {isOn("phone") && (
          <div style={{ marginTop: 8, paddingLeft: 22 }}>
            <input type="text"
              placeholder="(224) 555-1234"
              value={(multi.phone || {}).phone_number || ""}
              onChange={(e) => setMultiKind("phone", { phone_number: e.target.value })}
              style={{ width: "100%", padding: "6px 10px",
                       border: "1px solid #d1d5db", borderRadius: 6,
                       fontSize: 13, marginBottom: 6, boxSizing: "border-box" }}
            />
            {[
              { id: "on_sms",        label: "Text message received" },
              { id: "on_call_ended", label: "Phone call ended" },
            ].map(opt => (
              <label key={opt.id} style={{ display: "block", fontSize: 12,
                                            color: "#0f172a", marginTop: 2 }}>
                <input type="checkbox"
                  checked={!!(multi.phone || {})[opt.id]}
                  onChange={(e) => setMultiKind("phone", { [opt.id]: e.target.checked })}
                /> {opt.label}
              </label>
            ))}
          </div>
        )}
      </div>

      {/* Email toggle + inline config */}
      <div style={{
        border: "1px solid " + (isOn("email") ? "#0f172a" : "#e5e7eb"),
        background: isOn("email") ? "#f8fafc" : "#fff",
        borderRadius: 10, padding: 12, marginBottom: 8,
      }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8,
                        fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
          <input type="checkbox" checked={isOn("email")}
                 onChange={() => toggleKind("email")} />
          ✉️ An email I receive
        </label>
        {isOn("email") && (
          <div style={{ marginTop: 8, paddingLeft: 22, fontSize: 12,
                        color: "#6b7280", lineHeight: 1.5 }}>
            Triggers on every incoming email to your connected Gmail
            (skipping spam, promotional, and your own team's domain
            by default).
          </div>
        )}
      </div>

      {/* Form toggle — keeps the regular per-form picker out of this
          mode for now. Owners who need the form-trigger surface should
          stay on single-channel "form" mode. */}
      <div style={{
        border: "1px solid #e5e7eb", background: "#f8fafc",
        borderRadius: 10, padding: 10, fontSize: 12, color: "#6b7280",
      }}>
        💡 To also trigger from a form here, switch back to
        <strong style={{ color: "#0f172a" }}> single-channel "form"</strong>
        mode and set up the form fields. Mixing forms into the
        Multiple-triggers panel ships next.
      </div>
    </div>
  );
}

function _TestTriggerButton({ triggerChannel, channelSettings }) {
  const [busy, setBusy]   = React.useState(false);
  const [note, setNote]   = React.useState("");
  // The flow id this Input belongs to — read from localStorage
  // (FlowBuilder writes it on canvas mount as outreach_active_user_flow_id).
  const flowId = (typeof window !== "undefined")
    ? (window.localStorage.getItem("outreach_active_user_flow_id") || "")
    : "";

  if (!flowId) return null;
  if (triggerChannel === "form") return null;  // form has its own preview path

  async function fire() {
    setBusy(true);
    setNote("Firing…");
    let body = { channel: "" };
    if (triggerChannel === "phone") {
      body = {
        channel: "sms",
        from:    "+15551239999",
        to:      channelSettings.phone_number || "",
        message: "Test trigger from the Input drawer.",
      };
    } else if (triggerChannel === "email") {
      body = {
        channel: "email",
        from:    "test@example.com",
        subject: "Test trigger",
        message: "Test trigger from the Input drawer.",
      };
    } else if (triggerChannel === "multiple") {
      // Pick whichever child trigger is enabled, prefer phone.
      const m = channelSettings.multi || {};
      if ((m.phone || {}).enabled) {
        body = {
          channel: "sms",
          from:    "+15551239999",
          to:      (m.phone || {}).phone_number || "",
          message: "Test trigger from the Input drawer.",
        };
      } else if ((m.email || {}).enabled) {
        body = {
          channel: "email",
          from:    "test@example.com",
          subject: "Test trigger",
          message: "Test trigger from the Input drawer.",
        };
      } else {
        setBusy(false);
        setNote("Enable at least one channel to test.");
        return;
      }
    }
    try {
      const r = await fetch(
        "/me/flows/" + encodeURIComponent(flowId) + "/test-trigger",
        { method: "POST", credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body) });
      const d = await r.json().catch(() => ({}));
      if (r.ok && d.ok) {
        const enr = (d.enrollment_ids || []).length;
        setNote(enr
          ? `✓ Fired — ${enr} step run started, lead ${d.lead_id || "n/a"}`
          : `✓ Routed (${d.channel_routed}) but no flow enrolled — check trigger config`);
      } else {
        setNote("Couldn't fire: " + (d.error || d.notes || r.status));
      }
    } catch (_) {
      setNote("Network error.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{
      marginTop: 12, padding: "10px 12px",
      background: "#f8fafc", border: "1px solid #e5e7eb",
      borderRadius: 8, fontSize: 12.5,
    }}>
      <div style={{ display: "flex", alignItems: "center",
                    justifyContent: "space-between", gap: 8 }}>
        <span style={{ color: "#374151" }}>
          <strong style={{ color: "#0f172a" }}>Test trigger</strong>
          {" "}— fires this flow with a synthetic event so you can
          watch downstream blocks run.
        </span>
        <button type="button" onClick={fire} disabled={busy}
          style={{ padding: "6px 12px", borderRadius: 6,
                   background: "#0f172a", color: "#fff", border: 0,
                   font: "600 12.5px inherit", cursor: busy ? "wait" : "pointer" }}>
          {busy ? "…" : "Fire test event →"}
        </button>
      </div>
      {note && (
        <div style={{ marginTop: 8, color: "#475569", fontSize: 12 }}>
          {note}
        </div>
      )}
    </div>
  );
}

function InputChannelPanel({ nodeId, data, onChange }) {
  // Virtual channel id (one of the dropdown options:
  // form / sms / call_ended / email). Mapped down to the backend's
  // existing trigger_channel + channel_settings shape on save.
  const [triggerChannel, setTriggerChannelState] = React.useState(
    _backendToVirtual(data.trigger_channel, data.channel_settings));
  const [channelSettings, setChannelSettingsState] = React.useState(
    data.channel_settings || {});
  // Persist channel + settings to node data SYNCHRONOUSLY when the
  // owner picks a channel. The old effect-based persist only fired on
  // re-render — if the user picked Email and immediately backed out,
  // the patch never lands on the saved flow blob and the matcher sees
  // trigger_channel='' forever. Wrapping the setters lets us mirror
  // the new value into node.data in the same call as setState so the
  // autosave catches it on its next tick guaranteed.
  //
  // Virtual-to-backend mapping happens here too: picking "sms" or
  // "call_ended" both write trigger_channel="phone" with the right
  // event flag set on channel_settings. The matcher sees the same
  // shape it always has.
  const setTriggerChannel = (virtualId) => {
    setTriggerChannelState(virtualId);
    const mapped = _virtualToBackend(virtualId, channelSettings);
    setChannelSettingsState(mapped.channel_settings);
    onChange(nodeId, {
      trigger_channel:  mapped.trigger_channel,
      channel_settings: mapped.channel_settings,
    });
  };
  const setChannelSettings = (v) => {
    setChannelSettingsState(v);
    onChange(nodeId, { channel_settings: v });
  };
  // Mount-time stamp: if the seeded Input node has no trigger_channel
  // yet (every freshly-created flow), write the current virtual default
  // to node.data now so the autosave persists "form" even if the user
  // never opens the channel chooser.
  React.useEffect(() => {
    if (!data.trigger_channel) {
      const mapped = _virtualToBackend(triggerChannel, channelSettings);
      onChange(nodeId, {
        trigger_channel:  mapped.trigger_channel,
        channel_settings: mapped.channel_settings,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [loading, setLoading] = React.useState(true);
  const [forms, setForms] = React.useState([]);
  const [activeForm, setActiveForm] = React.useState(null);
  const [name, setName] = React.useState("");
  const [fields, setFields] = React.useState([]);
  // Extra fields the customer's WEBSITE attaches to each webhook
  // payload — distinct from form-fields the customer fills out.
  // Each entry: { key, label }.
  const [siteFields, setSiteFields] = React.useState([]);
  const [activeTab, setActiveTab] = React.useState("form");  // "form" | "site"
  const [savingTag, setSavingTag] = React.useState("idle"); // "idle" | "saving" | "saved"
  const [addMenuOpen, setAddMenuOpen] = React.useState(false);
  const [editingIdx, setEditingIdx] = React.useState(-1);
  // HTML5 drag-reorder state for the field cards. `dragIdx` is the
  // card currently being dragged; `overIdx` is the slot it'll drop
  // into (used to render the insertion line).
  const [dragIdx, setDragIdx] = React.useState(-1);
  const [overIdx, setOverIdx] = React.useState(-1);
  const channelRef = data.channelRef || "";
  const saveTimer = React.useRef(null);

  React.useEffect(() => {
    let cancelled = false;
    fetch("/me/forms", { credentials: "same-origin" })
      .then(r => r.ok ? r.json() : null).catch(() => null)
      .then(fs => {
        if (cancelled) return;
        const list = Array.isArray(fs?.forms) ? fs.forms.filter(f => !f.is_draft) : [];
        setForms(list);
        let pickId = channelRef;
        if (!pickId && list.length === 1) pickId = list[0].id;
        if (pickId && list.find(f => f.id === pickId)) {
          loadForm(pickId, list);
        } else {
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dropReturnBreadcrumb = () => {
    try {
      localStorage.setItem("fb_return_to_input", "1");
      localStorage.setItem("fb_return_to_input_ts", String(Date.now()));
    } catch (_) {}
  };

  function loadForm(id, listOverride) {
    setLoading(true);
    fetch(`/me/forms/${encodeURIComponent(id)}`, { credentials: "same-origin" })
      .then(r => r.ok ? r.json() : null).catch(() => null)
      .then(d => {
        const f = d?.form;
        if (f) {
          setActiveForm(f);
          setName(f.name || "");
          setFields(Array.isArray(f.fields) ? f.fields.map(x => ({ ...x })) : []);
          setSiteFields(Array.isArray(f.site_fields) ? f.site_fields.map(x => ({ ...x })) : []);
          const list = listOverride || forms;
          const meta = list.find(x => x.id === id);
          onChange(nodeId, {
            channel: "form",
            channelRef: id,
            channelLabel: (meta && meta.name) || f.name || "Untitled form",
          });
        }
        setLoading(false);
      });
  }

  // Pending-name ref ensures the latest typed value gets flushed on
  // unmount even if the debounce timer is still pending. Without this,
  // clicking "Save and continue" mid-debounce would lose the edit.
  const pendingNameRef = React.useRef(null);

  function doSave(patch) {
    if (!activeForm?.id) return;
    setSavingTag("saving");
    fetch(`/me/forms/${encodeURIComponent(activeForm.id)}`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    })
      .then(r => r.ok ? r.json() : null).catch(() => null)
      .finally(() => {
        setSavingTag("saved");
        setTimeout(() => setSavingTag("idle"), 1200);
      });
  }

  function flushPendingName() {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    if (pendingNameRef.current !== null) {
      doSave({ name: pendingNameRef.current });
      pendingNameRef.current = null;
    }
  }

  // Force-flush any pending name save when the panel unmounts (drawer
  // closes via "Save and continue", Esc, backdrop click, or any other
  // path). Fixes the lost-edit bug where the 400 ms debounce timer
  // hadn't fired yet at close time.
  React.useEffect(() => {
    return () => { flushPendingName(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function commitFields(next) {
    setFields(next);
    doSave({ fields: next });
  }
  function commitSiteFields(next) {
    setSiteFields(next);
    doSave({ site_fields: next });
  }
  function updateSiteField(idx, patch) {
    commitSiteFields(siteFields.map((f, i) => (i === idx ? { ...f, ...patch } : f)));
  }
  function removeSiteField(idx) {
    commitSiteFields(siteFields.filter((_, i) => i !== idx));
  }
  function addSiteField() {
    const usedKeys = new Set([
      ...fields.map(f => f.key),
      ...siteFields.map(f => f.key),
    ]);
    let i = 1;
    let key = "extra_field";
    while (usedKeys.has(key)) {
      i += 1;
      key = `extra_field_${i}`;
    }
    commitSiteFields([...siteFields, { key, label: "What this is" }]);
  }
  // Bulk add for domain presets (e.g., "+ Add all landscape pro fields").
  // Skips entries whose key is already taken by a form-field or site-field.
  function addSiteFieldsBulk(presets) {
    const usedKeys = new Set([
      ...fields.map(f => f.key),
      ...siteFields.map(f => f.key),
    ]);
    const fresh = (presets || []).filter(p => p && p.key && !usedKeys.has(p.key))
      .map(p => ({ key: String(p.key), label: String(p.label || p.key) }));
    if (!fresh.length) return;
    commitSiteFields([...siteFields, ...fresh]);
  }
  function commitName(next) {
    setName(next);
    pendingNameRef.current = next;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null;
      const v = pendingNameRef.current;
      pendingNameRef.current = null;
      if (v !== null) doSave({ name: v });
    }, 400);
    onChange(nodeId, {
      channel: "form",
      channelRef: activeForm?.id || "",
      channelLabel: next || "Untitled form",
    });
  }
  function updateField(idx, patch) {
    commitFields(fields.map((f, i) => (i === idx ? { ...f, ...patch } : f)));
  }
  function removeField(idx) {
    commitFields(fields.filter((_, i) => i !== idx));
  }
  function moveField(from, to) {
    if (from === to || from < 0 || to < 0) return;
    const next = fields.slice();
    const [item] = next.splice(from, 1);
    // After removing `from`, indices >= from shift left by 1; clamp
    // `to` so dropping below the last card lands at the end.
    const clamped = Math.max(0, Math.min(to, next.length));
    next.splice(clamped, 0, item);
    commitFields(next);
  }
  function addBuiltin(key) {
    const spec = FB_BUILTINS.find(x => x.key === key);
    if (!spec) return;
    commitFields([...fields, Object.assign({}, spec, { required: false, builtin: true })]);
  }
  // Slugify a label into a snake_case key (lowercase, alphanumeric +
  // underscores). Collision-safe: appends `_2`, `_3` ... when the
  // base key is already in use elsewhere on the form.
  function _slugifyKey(label, ignoreIdx = -1) {
    const base = String(label || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .replace(/_{2,}/g, "_")
      .slice(0, 48) || "field";
    const taken = new Set(
      fields.map((f, i) => i === ignoreIdx ? null : (f.key || ""))
            .filter(Boolean));
    if (!taken.has(base)) return base;
    for (let i = 2; i < 100; i++) {
      const candidate = `${base}_${i}`;
      if (!taken.has(candidate)) return candidate;
    }
    return `${base}_${Math.random().toString(36).slice(2, 5)}`;
  }
  function addCustom(type) {
    const label = FB_FIELD_TYPE_LABEL[type] || "New question";
    const f = {
      key:   _slugifyKey(label),
      label,
      type,
      required: false,
      // Marker that the key was auto-derived from the label. The
      // commit-label handler uses this to know whether to keep the
      // key in sync. Once a user manually edits the key (planned
      // surface) this flips to false and we stop touching it.
      auto_key: true,
    };
    if (type === "select") f.options = ["Option A", "Option B"];
    commitFields([...fields, f]);
  }

  if (loading) {
    return <div className="fb-ich-loading">Loading your forms…</div>;
  }

  const usedKeys = new Set(fields.map(f => f.key));
  const availableBuiltins = FB_BUILTINS.filter(b => !usedKeys.has(b.key));
  const customTypes = ["text", "textarea", "select", "number", "date"];

  // When the owner picks a non-form channel, render the placeholder
  // and skip the form panel entirely so no stale form configuration
  // leaks through. Form mode keeps the original surface untouched.
  if (triggerChannel !== "form") {
    return (
      <div>
        <label className="fb-drawer-l">What kicks off this flow?</label>
        <_InputChannelChooser value={triggerChannel} onPick={setTriggerChannel} />
        <_InputChannelComingSoon
          kind={triggerChannel}
          settings={channelSettings}
          onChange={setChannelSettings}
        />
        <_TestTriggerButton
          triggerChannel={triggerChannel}
          channelSettings={channelSettings}
        />
      </div>
    );
  }

  return (
    <div className="fb-ich is-form-editor">
      <label className="fb-drawer-l" style={{ paddingLeft: 16, paddingTop: 14 }}>
        What kicks off this flow?
      </label>
      <div style={{ padding: "0 16px" }}>
        <_InputChannelChooser value={triggerChannel} onPick={setTriggerChannel} />
      </div>
      <div className="fb-ich-grid">
        <div className="fb-ich-edit-pane">
          {forms.length === 0 ? (
            <div className="fb-ich-empty">
              <p className="fb-ich-empty-msg">You haven't made a form yet.</p>
              <a
                className="fb-ich-setup-btn"
                href="#outreach"
                onClick={(e) => {
                  // Navigate to #outreach AND switch to the Forms
                  // tab — without this, the user landed on the
                  // Flows view and the button "did nothing".
                  // setTimeout so the hash navigation completes
                  // before we hunt for the tab in the DOM.
                  dropReturnBreadcrumb && dropReturnBreadcrumb(e);
                  setTimeout(() => {
                    const tab = document.querySelector(
                      '[data-out-view="forms"]');
                    if (tab && typeof tab.click === "function") {
                      tab.click();
                    }
                    // Then click the "+ Create form" button so the
                    // user lands in the create flow immediately.
                    setTimeout(() => {
                      const createBtn = document.getElementById(
                        "ofCreateBtn");
                      if (createBtn && typeof createBtn.click === "function") {
                        createBtn.click();
                      }
                    }, 150);
                  }, 80);
                }}
              >+ Make a form</a>
            </div>
          ) : (
            <>
              <div className="fb-bsection-h" style={{ marginTop: 0 }}>Your form</div>
              <select
                className="fb-binput"
                value={activeForm?.id || ""}
                onChange={(e) => loadForm(e.target.value)}
              >
                {!activeForm && <option value="">Pick a form…</option>}
                {forms.map(f => (
                  <option key={f.id} value={f.id}>{f.name || "Untitled form"}</option>
                ))}
              </select>

              {activeForm && (
                <>
                  <div className="fb-bsection-h">Form name</div>
                  <input
                    className="fb-binput"
                    value={name}
                    placeholder="Contact form"
                    onChange={(e) => commitName(e.target.value)}
                    onBlur={flushPendingName}
                  />

                  <div className="fb-bsection-h fb-bsection-h-row" style={{ marginBottom: 4 }}>
                    <span>Fields</span>
                    <span className="fb-bsave-tag" aria-live="polite">
                      {savingTag === "saving" ? "Saving…" : savingTag === "saved" ? "✓ Saved" : ""}
                    </span>
                  </div>
                  <div className="fb-field-tabs" role="tablist">
                    <button
                      type="button"
                      role="tab"
                      aria-selected={activeTab === "form"}
                      className={`fb-field-tab ${activeTab === "form" ? "is-active" : ""}`}
                      onClick={() => setActiveTab("form")}
                    >📝 From the form{fields.length > 0 ? ` (${fields.length})` : ""}</button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={activeTab === "site"}
                      className={`fb-field-tab ${activeTab === "site" ? "is-active" : ""}`}
                      onClick={() => setActiveTab("site")}
                    >🌐 From your site{siteFields.length > 0 ? ` (${siteFields.length})` : ""}</button>
                  </div>

                  {activeTab === "form" && (
                  <>
                  <p className="fb-helper-tight" style={{ marginTop: 4, marginBottom: 10 }}>
                    Questions you ask the customer on the form itself.
                  </p>
                  <div className="fb-fields">
                    {fields.length === 0 ? (
                      <div className="fb-fields-empty">No fields yet — add one below.</div>
                    ) : fields.map((f, i) => (
                      <FldCard
                        key={`${f.key}-${i}`}
                        field={f}
                        index={i}
                        isEditing={editingIdx === i}
                        isDragging={dragIdx === i}
                        showDropAbove={overIdx === i && dragIdx !== i && dragIdx > i}
                        showDropBelow={overIdx === i && dragIdx !== i && dragIdx < i}
                        onStartEdit={() => setEditingIdx(i)}
                        onCommitLabel={(label) => {
                          setEditingIdx(-1);
                          const trimmed = (label || "").trim();
                          if (!trimmed) return;
                          // Re-derive the key from the new label IF
                          // the field's key is still auto-generated
                          // (auto_key=true). This is what makes the
                          // public form's `<input name="...">` use a
                          // human-meaningful name instead of an ID
                          // like q_ip2km. Builtin fields keep their
                          // canonical keys (name/email/phone/…) so we
                          // don't accidentally drift them.
                          const fld = fields[i] || {};
                          const patch = { label: trimmed };
                          const isAuto = fld.auto_key !== false && !fld.builtin;
                          if (isAuto) {
                            const newKey = _slugifyKey(trimmed, i);
                            if (newKey && newKey !== fld.key) {
                              patch.key = newKey;
                            }
                          }
                          updateField(i, patch);
                        }}
                        onCancelEdit={() => setEditingIdx(-1)}
                        onToggleRequired={() => updateField(i, { required: !f.required })}
                        onRemove={() => removeField(i)}
                        onDragStart={(e) => {
                          setDragIdx(i);
                          try {
                            e.dataTransfer.effectAllowed = "move";
                            e.dataTransfer.setData("text/plain", String(i));
                          } catch (_) {}
                        }}
                        onDragOver={(e) => {
                          if (dragIdx === -1 || dragIdx === i) return;
                          e.preventDefault();
                          try { e.dataTransfer.dropEffect = "move"; } catch (_) {}
                          if (overIdx !== i) setOverIdx(i);
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          if (dragIdx !== -1 && dragIdx !== i) {
                            // Drop ON card `i`. moveField splices, so:
                            // drag-down (dragIdx<i) lands AFTER current
                            // i; drag-up (dragIdx>i) lands BEFORE.
                            // Both resolve to the same insertion index.
                            moveField(dragIdx, i);
                          }
                          setDragIdx(-1);
                          setOverIdx(-1);
                        }}
                        onDragEnd={() => { setDragIdx(-1); setOverIdx(-1); }}
                      />
                    ))}
                  </div>

                  <div className="fb-add-fld-wrap">
                    <button
                      type="button"
                      className="fb-add-fld-btn"
                      onClick={() => setAddMenuOpen(v => !v)}
                      aria-expanded={addMenuOpen}
                    >+ Add field <span className="fb-add-fld-caret">▾</span></button>
                    {addMenuOpen && (
                      <div className="fb-add-fld-menu" role="menu">
                        <div className="fb-add-fld-section">Quick adds</div>
                        {availableBuiltins.length === 0 ? (
                          <div className="fb-add-fld-none">All quick adds are in your form.</div>
                        ) : availableBuiltins.map(b => (
                          <div
                            key={b.key}
                            role="menuitem"
                            tabIndex={0}
                            className="fb-add-fld-item"
                            onClick={() => { setAddMenuOpen(false); addBuiltin(b.key); }}
                          >
                            <span className="fb-add-fld-ico">{FB_FIELD_ICON[b.type] || "📝"}</span>
                            <span>{b.label}</span>
                          </div>
                        ))}
                        <div className="fb-add-fld-divider" />
                        <div className="fb-add-fld-section">Custom</div>
                        {customTypes.map(t => (
                          <div
                            key={t}
                            role="menuitem"
                            tabIndex={0}
                            className="fb-add-fld-item"
                            onClick={() => { setAddMenuOpen(false); addCustom(t); }}
                          >
                            <span className="fb-add-fld-ico">{FB_FIELD_ICON[t] || "📝"}</span>
                            <span>+ {FB_FIELD_TYPE_LABEL[t]}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  </>
                  )}

                  {activeTab === "site" && (
                    <SiteFieldsPane
                      siteFields={siteFields}
                      formFieldKeys={fields.map(f => f.key)}
                      webhookUrl={activeForm?.webhook_url || activeForm?.webhook_trigger_url || ""}
                      onUpdate={updateSiteField}
                      onRemove={removeSiteField}
                      onAdd={addSiteField}
                      onAddBulk={addSiteFieldsBulk}
                    />
                  )}

                  <a
                    className="fb-ich-make-another"
                    href="#outreach"
                    onClick={(e) => {
                      e.preventDefault();
                      dropReturnBreadcrumb && dropReturnBreadcrumb(e);
                      try {
                        if (typeof window.openFormEditorModal === "function") {
                          window.openFormEditorModal("");
                        } else {
                          window.location.hash = "#outreach";
                        }
                      } catch (_) {}
                    }}
                    style={{ display: "inline-block", marginTop: 14 }}
                  >+ Make a new form</a>
                </>
              )}
            </>
          )}
        </div>

        <div className="fb-ich-preview-pane">
          <FormPreview activeForm={activeForm} name={name} fields={fields} />
        </div>
      </div>
    </div>
  );
}

// Single field card. Mirrors `.fld-card` from the Lead Intake form-builder
// pixel-for-pixel: drag handle, type icon, click-to-edit label,
// Required/Optional pill toggle, hover-only delete. Builtin fields
// (name/email/phone/etc.) are deletable by design — same as Lead Intake.
//
// Drag-reorder is HTML5 native: only the handle starts the drag (so
// hovering the label/pill doesn't accidentally pick the card up). The
// parent owns dragIdx/overIdx and renders the insertion line via
// showDropAbove / showDropBelow.
function FldCard({
  field, index, isEditing, isDragging, showDropAbove, showDropBelow,
  onStartEdit, onCommitLabel, onCancelEdit, onToggleRequired, onRemove,
  onDragStart, onDragOver, onDrop, onDragEnd,
}) {
  const inputRef = React.useRef(null);
  const [draft, setDraft] = React.useState(field.label || "");
  // Only enable native draggable when the user grabs the handle —
  // otherwise click-to-edit on the label would compete with the drag.
  const [armed, setArmed] = React.useState(false);
  React.useEffect(() => {
    if (isEditing) {
      setDraft(field.label || "");
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          inputRef.current.select();
        }
      }, 0);
    }
  }, [isEditing, field.label]);
  const icon = FB_FIELD_ICON[field.type] || "📝";
  const reqOn = !!field.required;
  return (
    <div
      className={`fb-fld-card ${isDragging ? "is-dragging" : ""} ${showDropAbove ? "drop-above" : ""} ${showDropBelow ? "drop-below" : ""}`}
      draggable={armed}
      onDragStart={(e) => { onDragStart && onDragStart(e); }}
      onDragOver={(e) => { onDragOver && onDragOver(e); }}
      onDrop={(e) => { onDrop && onDrop(e); setArmed(false); }}
      onDragEnd={() => { onDragEnd && onDragEnd(); setArmed(false); }}
    >
      <span
        className="fb-fld-handle"
        aria-label="Drag to reorder"
        title="Drag to reorder"
        onMouseDown={() => setArmed(true)}
        onMouseUp={() => setArmed(false)}
        onMouseLeave={() => { /* keep armed during drag */ }}
        style={{ cursor: "grab", userSelect: "none" }}
      >⋮⋮</span>
      <span className="fb-fld-ico" aria-hidden="true">{icon}</span>
      {isEditing ? (
        <input
          ref={inputRef}
          className="fb-fld-label-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => onCommitLabel(draft)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); e.target.blur(); }
            else if (e.key === "Escape") { onCancelEdit(); }
          }}
        />
      ) : (
        <span
          className="fb-fld-label"
          tabIndex={0}
          title="Click to rename"
          onClick={onStartEdit}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onStartEdit(); }
          }}
        >{field.label || "(no label)"}</span>
      )}
      <button
        type="button"
        className={`fb-fld-req-pill ${reqOn ? "is-req" : "is-opt"}`}
        onClick={onToggleRequired}
      >
        <span className="fb-fld-req-dot" />
        {reqOn ? "Required" : "Optional"}
      </button>
      <button
        type="button"
        className="fb-fld-del"
        onClick={onRemove}
        title="Remove field"
        aria-label="Remove"
      >×</button>
    </div>
  );
}

// Domain-specific site-field presets. Each preset is a {key, label}
// pair the user can drop into "From your site" with one click — those
// keys then become merge tags ({landscape_summary} etc.) AND show up
// in the email recipient picker, the call recipient picker, and the
// Google Sheet column editor's tag suggestions.
//
// Currently only the landscaping bundle is wired. To add another
// vertical (plumber, contractor, etc.) just append another array
// here and surface it in the Quick-add section below.
const LANDSCAPING_PRO_PRESETS = [
  { key: "landscape_name",                label: "Business name" },
  { key: "landscape_email",               label: "Pro's email" },
  { key: "landscape_phonenumber",         label: "Pro's phone" },
  { key: "landscape_pro_id",              label: "Place ID" },
  { key: "landscape_website",             label: "Pro's website" },
  { key: "landscape_address",             label: "Address" },
  { key: "landscape_city",                label: "City" },
  { key: "landscape_rating",              label: "Google rating" },
  { key: "landscape_reviews",             label: "Review count" },
  { key: "landscape_services",            label: "Services (comma list)" },
  { key: "landscape_blurb",               label: "Short blurb" },
  { key: "landscape_summary",             label: "AI summary for homeowner" },
  { key: "landscape_specialties",         label: "Specialties (comma list)" },
  { key: "landscape_services_offered",    label: "Services offered (LLM)" },
  { key: "landscape_service_area",        label: "Service area" },
  { key: "landscape_years_in_business",   label: "Years in business" },
  { key: "landscape_warranty",            label: "Warranty" },
  { key: "landscape_when_to_use",         label: "When to use them" },
  { key: "landscape_certifications",      label: "Certifications" },
  { key: "landscape_licensed",            label: "Licensed claim" },
  { key: "landscape_insured",             label: "Insured claim" },
  { key: "landscape_free_estimates",      label: "Free estimates? (yes/no)" },
  { key: "landscape_pricing_quotes",      label: "Pricing quotes from site" },
  { key: "landscape_google_maps_uri",     label: "Google Maps URL" },
];

// "From your site" tab content — extra fields the customer's WEBSITE
// attaches to the webhook payload (alongside form-fields the customer
// fills out). Each row: snake_case key + friendly label + remove.
// Below the editor, an auto-generated copy-paste recipe shows how to
// send these from a generic HTML site. Platform-specific recipes
// (Wix, Squarespace, etc.) are a follow-up.
function SiteFieldsPane({ siteFields, formFieldKeys, webhookUrl, onUpdate, onRemove, onAdd, onAddBulk }) {
  const [copied, setCopied] = React.useState("");
  // Platform recipe tabs: "fetch" (vanilla JS), "wix" (Velo), "html"
  // (plain form action). Defaults to "fetch" because that's the most
  // copy-pasteable for the technically inclined; Wix users will spot
  // the dedicated tab.
  const [recipe, setRecipe] = React.useState("fetch");
  const usedKeys = new Set(formFieldKeys || []);
  // Used while typing — keeps trailing underscores so the user can
  // actually type "chosen_landscaper" one char at a time. The strict
  // strip (no leading/trailing _, no double _) runs on blur via
  // snakeifyCommit below, and again server-side on save.
  function snakeify(s) {
    return String(s || "")
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, "_");
  }
  function snakeifyCommit(s) {
    return snakeify(s)
      .replace(/^_+|_+$/g, "")
      .replace(/_{2,}/g, "_");
  }
  function isCollision(idx, candidate) {
    const otherSiteKeys = siteFields
      .filter((_, i) => i !== idx)
      .map(f => f.key);
    return usedKeys.has(candidate) || otherSiteKeys.includes(candidate);
  }
  // Snippet generator — keys regenerate on every edit.
  const url = webhookUrl || "https://your-crm.example/v1/triggers/<your-token>";
  const allKeys = [
    ...(formFieldKeys || []).map(k => ({ k, isSite: false })),
    ...siteFields.map(f => ({ k: f.key, isSite: true })),
  ];
  const jsonExample = (() => {
    if (!allKeys.length) return "";
    const lines = ["{"];
    allKeys.forEach((entry, i) => {
      const comma = i < allKeys.length - 1 ? "," : "";
      const tag = entry.isSite ? "  // ◀ from your site" : "";
      lines.push(`  "${entry.k}": "..."${comma}${tag}`);
    });
    lines.push("}");
    return lines.join("\n");
  })();
  const fetchExample = (() => {
    if (!allKeys.length) return "";
    const bodyLines = allKeys.map((e, i) => {
      const comma = i < allKeys.length - 1 ? "," : "";
      const tag = e.isSite ? "  // ◀ your site fills this in" : "";
      return `      ${e.k}: "..."${comma}${tag}`;
    }).join("\n");
    return [
      "await fetch(",
      `  "${url}",`,
      `  {`,
      `    method:  "POST",`,
      `    headers: { "Content-Type": "application/json" },`,
      `    body:    JSON.stringify({`,
      bodyLines,
      `    }),`,
      `  }`,
      `);`,
    ].join("\n");
  })();
  // Wix Velo (front-end .jsw or page code). Uses fetch from
  // wix-fetch which mirrors the browser fetch API.
  const wixExample = (() => {
    if (!allKeys.length) return "";
    const bodyLines = allKeys.map((e, i) => {
      const comma = i < allKeys.length - 1 ? "," : "";
      const src = e.isSite
        ? `someSiteValue   // ◀ your site fills this in`
        : `$w("#${e.k}Input").value`;
      return `      ${e.k}: ${src}${comma}`;
    }).join("\n");
    return [
      `// In your Wix page code (Velo). Wire this to your form's onSubmit:`,
      `import { fetch } from 'wix-fetch';`,
      ``,
      `export async function sendLead() {`,
      `  await fetch(`,
      `    "${url}",`,
      `    {`,
      `      method:  "POST",`,
      `      headers: { "Content-Type": "application/json" },`,
      `      body:    JSON.stringify({`,
      bodyLines,
      `      }),`,
      `    }`,
      `  );`,
      `}`,
    ].join("\n");
  })();
  // Plain HTML form (no JS). The customer types form fields; the
  // site fields ride along as hidden inputs your site renders with
  // the right value (server-rendered or via a templating engine).
  const htmlExample = (() => {
    if (!allKeys.length) return "";
    const inputs = allKeys.map(e => {
      if (e.isSite) {
        return `  <!-- ◀ your site fills the value attribute -->\n  <input type="hidden" name="${e.k}" value="" />`;
      }
      return `  <input type="text" name="${e.k}" placeholder="${e.k.replace(/_/g, " ")}" />`;
    }).join("\n");
    return [
      `<form method="POST" action="${url}" enctype="application/json">`,
      inputs,
      `  <button type="submit">Send</button>`,
      `</form>`,
    ].join("\n");
  })();
  // Active example based on the selected recipe tab.
  const exampleByRecipe = { fetch: fetchExample, wix: wixExample, html: htmlExample };
  const activeExample = exampleByRecipe[recipe] || fetchExample;
  const recipeLabel = { fetch: "Plain JS (fetch)", wix: "Wix Velo", html: "Plain HTML form" }[recipe];
  function copyText(text, key) {
    try {
      navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(""), 1200);
    } catch (_) {}
  }

  // Presets — keys the user can one-click add. Skip presets whose key
  // is already on the form (so the chips don't suggest duplicates).
  const existingKeys = new Set([
    ...(formFieldKeys || []),
    ...siteFields.map(f => f.key),
  ]);
  const availablePresets = LANDSCAPING_PRO_PRESETS
    .filter(p => !existingKeys.has(p.key));
  const allPresetsAdded = availablePresets.length === 0
    && LANDSCAPING_PRO_PRESETS.every(p => existingKeys.has(p.key));
  function addOnePreset(preset) {
    if (typeof onAddBulk === "function") onAddBulk([preset]);
  }
  function addAllLandscapingPresets() {
    if (typeof onAddBulk === "function") onAddBulk(LANDSCAPING_PRO_PRESETS);
  }

  return (
    <div className="fb-sitefields">
      <p className="fb-helper-tight" style={{ marginTop: 4, marginBottom: 12 }}>
        Things YOUR site sends along — the customer doesn't see or fill these in.
        Useful for data your site already knows: a chosen package, a referral source, etc.
      </p>

      {/* Quick-add for landscaping pro variables. The /landscaping
          contact form attaches all of these automatically; this
          surface lets the operator drop them onto the form so they
          appear as merge tags / picker options across the canvas. */}
      <div className="fb-sf-presets" style={{
        background:"#ecfdf5",
        border:"1px solid #a7f3d0",
        borderRadius:10,
        padding:"10px 12px",
        marginBottom:12,
      }}>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
          <span style={{fontSize:18}} aria-hidden="true">🌿</span>
          <strong style={{fontSize:13.5,color:"#13401f"}}>Landscaping pro variables</strong>
          <span style={{fontSize:11.5,color:"#2f8048",fontWeight:500,marginLeft:"auto"}}>
            {allPresetsAdded
              ? "All added ✓"
              : `${LANDSCAPING_PRO_PRESETS.length - availablePresets.length} of ${LANDSCAPING_PRO_PRESETS.length} added`}
          </span>
        </div>
        <p className="fb-helper-tight" style={{margin:"0 0 8px",fontSize:12,color:"#1f5f35"}}>
          The /landscaping contact form attaches these about the picked landscaper.
          Add them here so they show up as <code>{"{merge_tags}"}</code> and in the
          recipient / sheet-column pickers across the canvas.
        </p>
        {availablePresets.length > 0 ? (
          <>
            <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:8}}>
              {availablePresets.map(p => (
                <button
                  key={p.key}
                  type="button"
                  className="fb-sf-preset-chip"
                  onClick={() => addOnePreset(p)}
                  title={`Add ${p.key}`}
                  style={{
                    background:"#fff",
                    color:"#13401f",
                    border:"1px solid #a7f3d0",
                    borderRadius:999,
                    padding:"4px 10px",
                    fontSize:11.5,
                    fontWeight:600,
                    cursor:"pointer",
                    fontFamily:"inherit",
                  }}
                >
                  + {p.key}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={addAllLandscapingPresets}
              style={{
                background:"#1f5f35",
                color:"#fff",
                border:"none",
                borderRadius:8,
                padding:"7px 14px",
                fontSize:12.5,
                fontWeight:600,
                cursor:"pointer",
                fontFamily:"inherit",
              }}
            >
              + Add all {availablePresets.length} landscaping pro fields
            </button>
          </>
        ) : (
          <p className="fb-helper-tight" style={{margin:0,fontSize:12,color:"#2f8048"}}>
            All landscaping pro variables are on the form already.
          </p>
        )}
      </div>

      <div className="fb-sitefields-list">
        {siteFields.length === 0 ? (
          <div className="fb-fields-empty">
            No site fields yet. Add one below if your website sends extra data with the form
            (like which package the customer picked).
          </div>
        ) : siteFields.map((f, i) => {
          const dupe = isCollision(i, f.key);
          return (
            <div key={i} className="fb-sf-row">
              <div className="fb-sf-row-grid">
                <label className="fb-sf-row-l">Field name</label>
                <label className="fb-sf-row-l">What this is</label>
                <input
                  className={`fb-input fb-sf-key ${dupe ? "is-error" : ""}`}
                  value={f.key || ""}
                  onChange={(e) => onUpdate(i, { key: snakeify(e.target.value) })}
                  onBlur={(e) => onUpdate(i, { key: snakeifyCommit(e.target.value) })}
                  placeholder="chosen_landscaper"
                  autoCapitalize="off"
                  spellCheck={false}
                />
                <input
                  className="fb-input fb-sf-label"
                  value={f.label || ""}
                  onChange={(e) => onUpdate(i, { label: e.target.value })}
                  placeholder="Landscaper they picked"
                />
              </div>
              {dupe && (
                <p className="fb-sf-error">
                  That name's already taken by another field. Pick something different.
                </p>
              )}
              <button
                type="button"
                className="fb-sf-remove"
                onClick={() => onRemove(i)}
                aria-label="Remove site field"
                title="Remove"
              >×</button>
            </div>
          );
        })}
      </div>

      <button type="button" className="fb-add-fld-btn" onClick={onAdd}>
        + Add a site field
      </button>

      {siteFields.length > 0 && (
        <div className="fb-sf-snippet">
          <div className="fb-sf-snippet-h">📋 How to send these from your site</div>
          <p className="fb-helper-tight" style={{ marginTop: 0, marginBottom: 10 }}>
            Add the highlighted keys to whatever your site posts to the webhook.
            The customer-typed fields ride along automatically.
          </p>

          <div className="fb-sf-snippet-block">
            <div className="fb-sf-snippet-row">
              <span>JSON body</span>
              <button
                type="button"
                className="fb-sf-copy"
                onClick={() => copyText(jsonExample, "json")}
              >{copied === "json" ? "✓ Copied" : "⎘ Copy"}</button>
            </div>
            <pre className="fb-sf-code">{jsonExample}</pre>
          </div>

          <div className="fb-sf-snippet-block">
            <div className="fb-sf-recipe-tabs" role="tablist">
              {[
                { id: "fetch", label: "Plain JS" },
                { id: "wix",   label: "Wix" },
                { id: "html",  label: "HTML form" },
              ].map(t => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={recipe === t.id}
                  className={`fb-sf-recipe-tab ${recipe === t.id ? "is-active" : ""}`}
                  onClick={() => setRecipe(t.id)}
                >{t.label}</button>
              ))}
            </div>
            <div className="fb-sf-snippet-row">
              <span>{recipeLabel}</span>
              <button
                type="button"
                className="fb-sf-copy"
                onClick={() => copyText(activeExample, `recipe-${recipe}`)}
              >{copied === `recipe-${recipe}` ? "✓ Copied" : "⎘ Copy"}</button>
            </div>
            <pre className="fb-sf-code">{activeExample}</pre>
          </div>

          <div className="fb-sf-snippet-block">
            <div className="fb-sf-snippet-row">
              <span>Webhook URL</span>
              <button
                type="button"
                className="fb-sf-copy"
                onClick={() => copyText(url, "url")}
              >{copied === "url" ? "✓ Copied" : "⎘ Copy"}</button>
            </div>
            <pre className="fb-sf-code">{url}</pre>
          </div>
        </div>
      )}
    </div>
  );
}

// Live preview — mirrors renderPreview() in dashboard_form_editor.html
// pixel-for-pixel. Same input style, same submit button color, same
// "After they submit" thank-you note when present.
function FormPreview({ activeForm, name, fields }) {
  if (!activeForm) {
    return (
      <div className="fb-bpreview is-empty">
        <div className="fb-bpreview-empty">
          <span className="fb-bpreview-empty-ico" aria-hidden="true">📝</span>
          <p>Pick a form to see what your leads will see.</p>
        </div>
      </div>
    );
  }
  const inStyle = {
    width: "100%", padding: "10px 12px",
    border: "1px solid #e6e6ea", borderRadius: 8,
    fontSize: 14, background: "#fff", color: "#777",
    boxSizing: "border-box", fontFamily: "inherit",
  };
  return (
    <div className="fb-bpreview">
      <div className="fb-bpreview-h">Live preview</div>
      <div className="fb-bpreview-card">
        {name ? <h3 className="fb-bpreview-title">{name}</h3> : null}
        {(fields || []).length === 0 ? (
          <div className="fb-bpreview-blank">Fields you add show here.</div>
        ) : (
          (fields || []).map((f, i) => (
            <div key={i} className="fb-bpreview-field">
              <label className="fb-bpreview-label">
                {f.label || "(no label)"}
                {f.required && <span className="fb-bpreview-req"> *</span>}
              </label>
              {f.type === "textarea" ? (
                <textarea rows={3} disabled style={{ ...inStyle, resize: "vertical" }} />
              ) : f.type === "select" ? (
                <select disabled style={inStyle}>
                  <option>{(f.options && f.options[0]) || "Choose…"}</option>
                </select>
              ) : f.type === "date" ? (
                <input type="date" disabled style={inStyle} />
              ) : f.type === "number" ? (
                <input type="number" disabled style={inStyle} />
              ) : (
                <input
                  type={f.type === "email" ? "email" : f.type === "phone" ? "tel" : "text"}
                  disabled
                  style={inStyle}
                />
              )}
            </div>
          ))
        )}
        <button type="button" disabled className="fb-bpreview-submit">
          {activeForm.submit_text || "Submit"}
        </button>
      </div>
      {activeForm.thank_you ? (
        <div className="fb-bpreview-thanks">
          <div className="fb-bpreview-thanks-h">After they submit</div>
          <div className="fb-bpreview-thanks-t">{activeForm.thank_you}</div>
        </div>
      ) : null}
    </div>
  );
}

// ── RecipientChips: paste-many chip input for phones / emails ───────────
// Used by the Notify activity drawer. Behaviors:
//   - Type a value → Enter / comma / Tab commits as a chip
//   - Paste a list separated by commas / spaces / newlines → all become chips
//   - Backspace on empty input deletes the last chip
//   - Phone numbers format live (e.g., "(312) 555-0123") as the user types
//   - Invalid entries get a soft red wavy underline; saving still works
function RecipientChips({ kind, iconLabel, values, onChange, placeholder, onMisroute }) {
  // iconLabel:   "📱 Phones" / "✉️ Emails" — shown as a tiny prefix
  //              inside the field (replaces the heavy stacked label
  //              format). Stays grayed out unless the field is focused.
  // onMisroute:  optional callback fired when the user types/pastes
  //              something that clearly belongs in the OTHER field
  //              (e.g., an email into the phones field). The parent
  //              decides what to do — typically: route the value to
  //              the correct field and surface a brief toast.
  const [draft, setDraft] = React.useState("");
  const [focused, setFocused] = React.useState(false);
  const inputRef = React.useRef(null);
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  // Heuristic: a value with "@" + something after a dot is clearly an
  // email; a value with mostly digits + parens / dashes is clearly a
  // phone. Used by commitMany to route misplaced entries.
  const looksLikeEmail = (v) => EMAIL_RE.test(v.trim());
  const looksLikePhone = (v) => {
    const digits = v.replace(/\D/g, "");
    return digits.length >= 7 && !v.includes("@");
  };

  function formatPhone(raw) {
    const trimmed = String(raw || "").trim();
    if (trimmed.startsWith("+")) {
      const digits = trimmed.replace(/[^\d+]/g, "");
      return { display: digits, valid: digits.length >= 8 };
    }
    const digits = trimmed.replace(/\D/g, "");
    if (!digits) return { display: trimmed, valid: false };
    if (digits.length <= 3) return { display: digits, valid: false };
    if (digits.length <= 6) return { display: `(${digits.slice(0,3)}) ${digits.slice(3)}`, valid: false };
    const ten = digits.slice(-10);
    return {
      display: `(${ten.slice(0,3)}) ${ten.slice(3,6)}-${ten.slice(6)}`,
      valid: digits.length === 10 || digits.length === 11,
    };
  }
  function makeChip(raw) {
    const r = String(raw || "").trim();
    if (kind === "phone") {
      const { display, valid } = formatPhone(r);
      return { id: Math.random().toString(36).slice(2, 9), raw: r, display, valid };
    }
    return { id: Math.random().toString(36).slice(2, 9), raw: r, display: r, valid: EMAIL_RE.test(r) };
  }
  function commitMany(text) {
    // Phone formatting (e.g., "(122) 473-6591") contains a real space —
    // splitting on whitespace would chop one number into "(122)" + the
    // rest. Phones therefore only separate on , and ; — emails can keep
    // whitespace as a separator since addresses can't contain spaces.
    const splitter = kind === "phone" ? /[,;]+/ : /[\s,;]+/;
    const parts = String(text || "").split(splitter).map(s => s.trim()).filter(Boolean);
    if (!parts.length) return;
    // Auto-route: if any part clearly belongs in the OTHER field, hand
    // it off via onMisroute and don't add it here. Saves the user from
    // "I pasted my list and half of it ended up in the wrong place."
    const ours = []; const theirs = [];
    for (const p of parts) {
      const wrong =
        (kind === "phone" && looksLikeEmail(p)) ||
        (kind === "email" && !looksLikeEmail(p) && looksLikePhone(p));
      (wrong ? theirs : ours).push(p);
    }
    if (ours.length) onChange([...(values || []), ...ours.map(makeChip)]);
    if (theirs.length && onMisroute) onMisroute(theirs);
    setDraft("");
  }
  function onKey(e) {
    if (e.key === "Backspace" && draft === "" && (values || []).length > 0) {
      onChange((values || []).slice(0, -1)); return;
    }
    // Commit triggers: Enter / comma / Tab / blur. Deliberately NOT
    // space — formatted phones contain spaces ("(312) 555-0123") and
    // we don't want to chop "+1 312 555 0123" into four invalid chips.
    if (e.key === "Enter" || e.key === "," || e.key === "Tab") {
      if (!draft.trim()) return;
      e.preventDefault(); commitMany(draft); return;
    }
  }
  function onPaste(e) {
    const txt = e.clipboardData.getData("text");
    if (/[\s,;]/.test(txt)) {
      e.preventDefault();
      commitMany((draft + " " + txt).trim());
    }
  }
  function onDraft(v) {
    if (kind === "phone" && !v.startsWith("+")) {
      setDraft(formatPhone(v).display || v);
    } else {
      setDraft(v);
    }
  }
  function removeAt(id) {
    onChange((values || []).filter(c => c.id !== id));
  }

  const count = (values || []).length;
  return (
    <div className="fb-recip-field">
      <div className="fb-recip-box" onClick={() => inputRef.current?.focus()}>
        {/* In-field prefix label — replaces the all-caps label-above
            pattern. Stays muted unless the field is focused, so the
            field reads like a single composed input. */}
        {iconLabel && (
          <span className={`fb-recip-prefix ${focused || count > 0 ? "is-active" : ""}`}>
            {iconLabel}
            {/* Count chip only when > 0 (Polish 1). */}
            {count > 0 && <span className="fb-recip-prefix-count">{count}</span>}
          </span>
        )}
        {(values || []).map(c => (
          <span
            key={c.id}
            className={`fb-recip-chip ${c.valid ? "" : "is-invalid"} ${c.is_default ? "is-default" : ""}`}
            title={
              c.is_default
                ? "Default — your connected Gmail. Removing this stops emails to you."
                : (c.valid ? "" : "Doesn't look quite right — we'll skip it at send time.")
            }
          >
            {c.is_default && (
              <span className="fb-recip-chip-badge" aria-label="Default sender">Default</span>
            )}
            {c.display}
            <button
              type="button"
              className="fb-recip-x"
              onClick={(e) => { e.stopPropagation(); removeAt(c.id); }}
              aria-label={`Remove ${c.display}`}
            >×</button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          className="fb-recip-input"
          value={draft}
          onChange={(e) => onDraft(e.target.value)}
          onKeyDown={onKey}
          onPaste={onPaste}
          onFocus={() => setFocused(true)}
          onBlur={() => { setFocused(false); draft.trim() && commitMany(draft); }}
          placeholder={count === 0 ? placeholder : ""}
          inputMode={kind === "phone" ? "tel" : "email"}
          autoComplete={kind === "phone" ? "tel" : "email"}
          spellCheck={false}
          autoCorrect="off"
        />
      </div>
    </div>
  );
}

// ── VariablePicker: searchable, grouped variable popover ────────────────
// Opens anchored to the cursor / trigger button. Closes on outside click,
// Escape, or selection. Keyboard: ↑/↓ navigate, Enter inserts.
//
// Parameterized by `tags` (default MERGE_TAGS) so callers can inject
// account-level vars fetched at runtime. `usedTokens` lets us flag rows
// that already appear in the message body — clicking those REMOVES the
// first occurrence (toggle behavior), while clicking unused rows inserts.
function VariablePicker({ open, anchor, onPick, onClose, tags, usedTokens }) {
  const tagsList = tags || MERGE_TAGS;
  const used = usedTokens || new Set();
  const [q, setQ] = React.useState("");
  const [activeIdx, setActiveIdx] = React.useState(0);
  const rootRef = React.useRef(null);
  const inputRef = React.useRef(null);

  React.useEffect(() => {
    if (open) {
      setQ(""); setActiveIdx(0);
      setTimeout(() => inputRef.current?.focus(), 20);
    }
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    function onDocClick(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) onClose();
    }
    function onKey(e) { if (e.key === "Escape") onClose(); }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  // Group dynamic tag list by `group`, filtered by the search query.
  const filtered = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    const groups = {};
    for (const t of tagsList) {
      if (needle && !(
        t.label.toLowerCase().includes(needle) ||
        t.token.toLowerCase().includes(needle) ||
        (t.sample || "").toLowerCase().includes(needle)
      )) continue;
      const g = t.group || "Variables";
      (groups[g] = groups[g] || []).push(t);
    }
    const out = [];
    for (const g of Object.keys(groups)) {
      out.push({ kind: "header", group: g });
      for (const t of groups[g]) out.push({ kind: "row", t });
    }
    return out;
  }, [q, tagsList]);

  const rowIndices = React.useMemo(
    () => filtered.map((it, i) => it.kind === "row" ? i : -1).filter(i => i >= 0),
    [filtered]);

  function onListKey(e) {
    if (!rowIndices.length) return;
    const cur = rowIndices.indexOf(activeIdx);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx(rowIndices[Math.min(cur + 1, rowIndices.length - 1)] ?? activeIdx);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx(rowIndices[Math.max(cur - 1, 0)] ?? activeIdx);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const it = filtered[activeIdx];
      if (it && it.kind === "row") onPick(it.t.token);
    }
  }

  if (!open) return null;
  const PANEL_W = 320, PANEL_H = 360;
  const x = anchor ? Math.max(8, Math.min(anchor.x, window.innerWidth - PANEL_W - 8)) : 24;
  const y = anchor ? Math.max(8, Math.min(anchor.y, window.innerHeight - PANEL_H - 8)) : 24;

  return (
    <div
      ref={rootRef}
      className="fb-varpicker"
      style={{ left: x, top: y }}
      role="dialog"
      onKeyDown={onListKey}
    >
      <div className="fb-varpicker-search">
        <input
          ref={inputRef}
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search variables…"
        />
      </div>
      <div className="fb-varpicker-list">
        {filtered.length === 0 && (
          <div className="fb-varpicker-empty">No variables match “{q}”.</div>
        )}
        {filtered.map((it, i) => {
          if (it.kind === "header") {
            return <div key={`h-${it.group}`} className="fb-varpicker-h">{it.group}</div>;
          }
          const isActive = i === activeIdx;
          const isUsed = used.has(it.t.token);
          return (
            <button
              key={`r-${it.t.token}`}
              type="button"
              className={`fb-varpicker-row ${isActive ? "is-active" : ""} ${isUsed ? "is-used" : ""}`}
              onMouseEnter={() => setActiveIdx(i)}
              onClick={() => onPick(it.t.token)}
              title={isUsed ? "Used in your message — click to remove" : "Click to insert"}
            >
              <div className="fb-varpicker-row-l">
                <div className="fb-varpicker-row-label">
                  {isUsed && <span className="fb-varpicker-row-used" aria-hidden="true">✓</span>}
                  {it.t.label}
                </div>
                <div className="fb-varpicker-row-token">{it.t.token}</div>
              </div>
              <div className="fb-varpicker-row-r">
                <span className="fb-varpicker-row-sample">"{it.t.sample}"</span>
                <span className="fb-varpicker-row-insert">
                  {isUsed ? "Remove" : "Insert"}
                </span>
              </div>
            </button>
          );
        })}
      </div>
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
  // Reply agent state (Phase 1 of the Reply Block redesign). When the
  // owner picks "{Bot} replies" the chosen agent's id+name+job get
  // stamped on the node so the engine (Phase 2) can assemble runtime
  // context against the right bot.
  const [replyAgentId,   setReplyAgentId]   = React.useState(data.reply_agent_id   || "");
  const [replyAgentName, setReplyAgentName] = React.useState(data.reply_agent_name || "");
  const [replyAgentJob,  setReplyAgentJob]  = React.useState(data.reply_agent_job  || "");
  // Phase 3 hook: approval mode for the AI's reply ("auto" sends
  // immediately when takeover triggers; "draft" parks it in the
  // owner's inbox for review before send). Default = auto so the
  // existing behavior is unchanged for any flow that hasn't been
  // touched since the redesign.
  const [replyApproval, setReplyApproval] = React.useState(
    data.reply_approval || "auto");
  // Reply channel — "auto" matches the lead's last inbound channel
  // (legacy behavior); "email" or "sms" forces that channel regardless.
  // Read by the engine via step.reply_channel in execute_send_custom_reply.
  const [replyChannel, setReplyChannel] = React.useState(
    data.reply_channel || "auto");
  // Notify-only state: extra recipients + include-customer toggle +
  // preview source. Stored on node.data with snake_case keys so the
  // server-side execute_notify reads them verbatim — no canvas-to-engine
  // shape translation in between.
  const isNotify     = activity.id === "notify";
  const isReachOut   = activity.id === "reach_out";
  const isCall       = activity.id === "call";
  const isSendEmail  = activity.id === "send_email";
  const isAppendSheet = activity.id === "append_sheet";
  const isAiAgent    = activity.id === "ai_agent";

  // ── Google Sheet drawer state ──────────────────────────────────
  // Editable: spreadsheet URL/ID, worksheet/tab name, ordered column
  // mapping (header + token source). Header row auto-creation flag.
  const [sheetSpreadsheetId, setSheetSpreadsheetId] = React.useState(
    data.spreadsheet_id != null ? data.spreadsheet_id : (activity.defaultSpreadsheetId || ""));
  const [sheetWorksheetName, setSheetWorksheetName] = React.useState(
    data.worksheet_name != null ? data.worksheet_name : (activity.defaultWorksheetName || "Sheet1"));
  const [sheetEnsureHeader, setSheetEnsureHeader] = React.useState(
    data.ensure_header_row != null ? !!data.ensure_header_row
                                    : (activity.defaultEnsureHeaderRow !== false));
  const [sheetColumns, setSheetColumns] = React.useState(() => {
    if (Array.isArray(data.columns) && data.columns.length) {
      return data.columns.map(c => ({
        header: String(c.header || ""),
        source: String(c.source || ""),
      }));
    }
    return (activity.defaultColumns || []).map(c => ({
      header: String(c.header || ""),
      source: String(c.source || ""),
    }));
  });
  // ── Sheets OAuth connection status ─────────────────────────────
  // Polls /me/sheets-connection on drawer mount + window focus so the
  // moment the user finishes the OAuth dance and the popup/tab closes,
  // the badge flips from "Not connected" to "Connected as ...".
  const [sheetsConn, setSheetsConn] = React.useState({
    connected: false, ready: true, google_email: "", loading: true,
  });
  const refetchSheetsConn = React.useCallback(() => {
    if (!isAppendSheet) return;
    fetch("/me/sheets-connection", { credentials: "same-origin" })
      .then(r => r.ok ? r.json() : null).catch(() => null)
      .then(d => {
        if (!d) { setSheetsConn(s => ({ ...s, loading: false })); return; }
        setSheetsConn({
          connected:    !!d.connected,
          ready:        d.ready !== false,
          google_email: d.google_email || "",
          loading:      false,
        });
      });
  }, [isAppendSheet]);
  React.useEffect(() => {
    if (!isAppendSheet) return;
    refetchSheetsConn();
    const onFocus = () => refetchSheetsConn();
    window.addEventListener("focus", onFocus);
    // Detect the ?sheets_connect=<status> query the callback bounces
    // back to. Refetch on success, surface error states inline. Then
    // clean the param out of the URL so refreshing doesn't re-trigger.
    function consumeStatusFlag() {
      const m = /[?&]sheets_connect=([a-z_]+)\b/.exec(window.location.search);
      if (!m) return;
      const status = m[1];
      try {
        const u = new URL(window.location.href);
        u.searchParams.delete("sheets_connect");
        const next = u.pathname + (u.searchParams.toString() ? "?" + u.searchParams.toString() : "") + u.hash;
        window.history.replaceState({}, "", next);
      } catch (_) {}
      if (status === "ok") {
        // Server sometimes needs a beat to commit the GCS write before
        // the GET returns the new state. Couple of retries handles it.
        [200, 700, 1500].forEach(ms => setTimeout(refetchSheetsConn, ms));
      } else {
        setSheetsConn(s => ({ ...s, loading: false, _lastError: status }));
        // Surface the failure to the user.
        // eslint-disable-next-line no-console
        console.warn("[sheets-oauth] callback status:", status);
      }
    }
    consumeStatusFlag();
    return () => window.removeEventListener("focus", onFocus);
  }, [isAppendSheet, refetchSheetsConn]);
  function startSheetsOAuth() {
    const rt = window.location.pathname + window.location.search + window.location.hash;
    const url = "/auth/google/connect-sheets?return_to=" + encodeURIComponent(rt);
    // Open in same tab — Google's consent screen redirects back via
    // the callback, which lands the user on /dashboard?sheets_connect=ok
    // (or wherever return_to pointed). The drawer state listener picks
    // up the success on focus / on hash-flag.
    window.location.assign(url);
  }
  async function disconnectSheetsOAuth() {
    if (!confirm("Disconnect Google Sheets? Existing flow rows will stop logging until you reconnect.")) return;
    try {
      const r = await fetch("/me/sheets-connection", {
        method: "DELETE", credentials: "same-origin",
      });
      if (r.ok) refetchSheetsConn();
    } catch (_) {}
  }
  // `isMultiChannel` covers the two activities that pick any combo
  // of sms / email / call:
  //   - Notify Me      → owner-side (extras + include_customer)
  //   - Reach out      → customer-side (always lead, no extras)
  // `isOwnerSide` differentiates: only Notify Me shows the extra
  // phones/emails inputs and the include_customer toggle.
  const isMultiChannel = isNotify || isReachOut;
  const isOwnerSide    = isNotify;
  const [modes, setModes] = React.useState(() => {
    if (Array.isArray(data.modes) && data.modes.length) return data.modes.slice();
    if (data.mode === "both") return ["sms", "email"];
    if (data.mode) return [data.mode];
    return Array.isArray(activity.defaultModes)
      ? activity.defaultModes.slice()
      : ["sms", "email"];
  });
  const hasSms   = isMultiChannel ? modes.includes("sms")   : (mode === "sms"   || mode === "both");
  const hasEmail = isMultiChannel ? modes.includes("email") : (mode === "email" || mode === "both");
  const hasCall  = isMultiChannel ? modes.includes("call")  : (mode === "call");
  function toggleMode(m) {
    setModes(cur => {
      if (cur.includes(m)) {
        return cur.filter(x => x !== m);
      }
      return [...cur, m];
    });
  }
  const noModesPicked = isMultiChannel && modes.length === 0;
  const [callPhone, setCallPhone] = React.useState(
    data.phone_number != null ? data.phone_number : (activity.defaultPhoneNumber || ""));
  const [callMessage, setCallMessage] = React.useState(
    data.spoken_message != null ? data.spoken_message : (activity.defaultSpokenMessage || ""));
  const [callVoiceTone, setCallVoiceTone] = React.useState(
    data.voice_tone != null ? data.voice_tone : "friendly");
  const [callTarget, setCallTarget] = React.useState(
    data.call_target != null ? data.call_target : (activity.defaultCallTarget || "lead"));
  // Recipient picker for the standalone Email activity. Three modes:
  //   "lead"       — engine uses lead.email (legacy default)
  //   "custom"     — user typed a literal email address
  //   "site_field" — user picked a key from the form's site_fields;
  //                  compile pass wraps it in {curlies} so the
  //                  engine resolves against lead.fields at send time
  const [emailRecipientSource, setEmailRecipientSource] = React.useState(
    data.recipient_source || activity.defaultRecipientSource || "lead");
  const [emailRecipientValue, setEmailRecipientValue] = React.useState(
    data.recipient_value != null ? data.recipient_value
                                  : (activity.defaultRecipientValue || ""));
  // Site fields published by the Input drawer so the picker can list
  // available keys without a fetch.
  const [siteFieldsForPicker, setSiteFieldsForPicker] = React.useState([]);
  React.useEffect(() => {
    function read() {
      try {
        const sf = Array.isArray(window.__fb_input_site_fields)
          ? window.__fb_input_site_fields : [];
        setSiteFieldsForPicker(sf);
      } catch (_) {}
    }
    read();
    window.addEventListener("fb-input-fields-changed", read);
    const ts = [120, 320, 720].map(ms => setTimeout(read, ms));
    return () => {
      window.removeEventListener("fb-input-fields-changed", read);
      ts.forEach(clearTimeout);
    };
  }, []);
  // Customer-facing calls default to honoring business hours so we
  // don't dial leads at 11pm. Owner-side notify-with-call ignores
  // this on the compile side (the owner wants paged any time).
  const [respectBusinessHours, setRespectBusinessHours] = React.useState(
    data.respect_business_hours != null ? !!data.respect_business_hours : true);
  const callMsgRef = React.useRef(null);
  // ── Live voice preview ──────────────────────────────────────────
  // Lets the owner hear EXACTLY how the AI's voice will sound on a
  // real call before saving the flow. Hits /me/call/voice-preview
  // which substitutes sample lead values + the user's account vars,
  // then streams an MP3 back. Same OpenAI voice the realtime call
  // uses, so the preview matches production.
  const [voicePreviewState, setVoicePreviewState] = React.useState("idle"); // idle|loading|playing|error
  const [voicePreviewError, setVoicePreviewError] = React.useState("");
  const voicePreviewAudioRef = React.useRef(null);
  const voicePreviewUrlRef   = React.useRef("");
  React.useEffect(() => () => {
    // Cleanup on drawer unmount: stop audio + free the blob URL.
    try { voicePreviewAudioRef.current?.pause(); } catch (_) {}
    if (voicePreviewUrlRef.current) {
      try { URL.revokeObjectURL(voicePreviewUrlRef.current); } catch (_) {}
    }
  }, []);
  async function _previewVoice() {
    if (voicePreviewState === "playing") {
      // Stop a playing preview.
      try { voicePreviewAudioRef.current?.pause(); } catch (_) {}
      setVoicePreviewState("idle");
      return;
    }
    setVoicePreviewError("");
    setVoicePreviewState("loading");
    try {
      const r = await fetch("/me/call/voice-preview", {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          spoken_message: callMessage,
          voice_tone:     callVoiceTone,
        }),
      });
      if (!r.ok) {
        let msg = `Couldn't generate preview (HTTP ${r.status})`;
        try {
          const e = await r.json();
          if (e && e.error) msg = String(e.error);
        } catch (_) {}
        setVoicePreviewError(msg);
        setVoicePreviewState("error");
        return;
      }
      const blob = await r.blob();
      // Free any previous preview blob to avoid memory leaks across
      // repeated previews.
      if (voicePreviewUrlRef.current) {
        try { URL.revokeObjectURL(voicePreviewUrlRef.current); } catch (_) {}
      }
      const url = URL.createObjectURL(blob);
      voicePreviewUrlRef.current = url;
      const audio = new Audio(url);
      voicePreviewAudioRef.current = audio;
      audio.onended = () => setVoicePreviewState("idle");
      audio.onerror = () => {
        setVoicePreviewError("Couldn't play the audio.");
        setVoicePreviewState("error");
      };
      await audio.play();
      setVoicePreviewState("playing");
    } catch (exc) {
      setVoicePreviewError("Network error. Try again.");
      setVoicePreviewState("error");
    }
  }
  const [callPickerOpen, setCallPickerOpen] = React.useState(false);
  const [callPickerAnchor, setCallPickerAnchor] = React.useState({ x: 0, y: 0 });
  const [includeCustomer, setIncludeCustomer] = React.useState(
    data.include_customer != null
      ? !!data.include_customer
      : (activity.defaultIncludeCustomer != null
         ? !!activity.defaultIncludeCustomer
         : true));
  const [extraPhones, setExtraPhones] = React.useState(
    Array.isArray(data.extra_phones) ? data.extra_phones : []);
  const [extraEmails, setExtraEmails] = React.useState(
    Array.isArray(data.extra_emails) ? data.extra_emails : []);
  // Default-sender state. We fetch the owner's connected Gmail once
  // when the drawer opens and (a) seed it as a "Default" chip in the
  // email field if the field is empty AND the user hasn't dismissed
  // it before, (b) surface a "Connect your Gmail" CTA when no
  // connection exists. The dismiss flag persists on node.data so a
  // user who removed the default doesn't get it re-added next time.
  const [defaultSender, setDefaultSender] = React.useState("");
  const [emailReady, setEmailReady] = React.useState(true); // assume ready until told otherwise
  const [defaultDismissed, setDefaultDismissed] = React.useState(
    !!data.default_email_dismissed);
  const [connectUrl, setConnectUrl] = React.useState("/auth/google/connect-email");
  const [previewSource, setPreviewSource] = React.useState("sample");
  // Preview collapse — gives the form full drawer width when the user
  // doesn't need to see the iPhone mockup. Persists per-session in
  // localStorage so a user who hides it once stays hidden.
  const [previewCollapsed, setPreviewCollapsed] = React.useState(() => {
    try { return localStorage.getItem("fb_preview_collapsed") === "1"; }
    catch (_) { return false; }
  });
  React.useEffect(() => {
    try { localStorage.setItem("fb_preview_collapsed", previewCollapsed ? "1" : "0"); }
    catch (_) {}
  }, [previewCollapsed]);
  const [previewOverrides, setPreviewOverrides] = React.useState(() => {
    // Seed test-data with the same sample values, so toggling to
    // "Test data" doesn't blank out the preview.
    const seed = {};
    for (const t of MERGE_TAGS) seed[t.token] = t.sample;
    return seed;
  });
  const [varPickerOpen, setVarPickerOpen] = React.useState(false);
  const [varPickerAnchor, setVarPickerAnchor] = React.useState(null);
  const [testDataExpanded, setTestDataExpanded] = React.useState(false);
  // Account-level vars fetched once on drawer mount. Merged with the
  // hardcoded MERGE_TAGS to form the picker's full list. If the fetch
  // fails or the user is unauthenticated, we just fall back to the
  // base list — the panel still works.
  const [accountVars, setAccountVars] = React.useState([]);
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/me/account-vars",
          { credentials: "same-origin", cache: "no-store" });
        if (!r.ok) return;
        const d = await r.json();
        if (!cancelled && Array.isArray(d.vars)) setAccountVars(d.vars);
      } catch (_) {}
    })();
    return () => { cancelled = true; };
  }, []);
  // Form-bound variables — read from the FlowBuilder publisher
  // (window.__fb_input_form_fields / __fb_input_site_fields) so the
  // picker shows EXACTLY the keys this flow's input form will collect.
  // Form fields go in a "From the form" group; site fields go in
  // "From your site" so the user can see at a glance which channel
  // they're authoring against. Re-reads on mount + on a custom event
  // (`fb-input-fields-changed`) the publisher emits when the bound form
  // id flips.
  const [formVars, setFormVars] = React.useState([]);
  const [siteVars, setSiteVars] = React.useState([]);
  React.useEffect(() => {
    function read() {
      try {
        const ff = Array.isArray(window.__fb_input_form_fields)
          ? window.__fb_input_form_fields : [];
        const sf = Array.isArray(window.__fb_input_site_fields)
          ? window.__fb_input_site_fields : [];
        setFormVars(ff.map(f => ({
          token: `{${f.key}}`,
          label: f.label || f.key,
          sample: "",
          group: "From the form",
        })));
        setSiteVars(sf.map(f => ({
          token: `{${f.key}}`,
          label: f.label || f.key,
          sample: "",
          group: "From your site",
        })));
      } catch (_) {}
    }
    read();
    window.addEventListener("fb-input-fields-changed", read);
    // Late-arriving publisher: poll a few times in the first second so
    // the picker fills in even if the drawer mounts before the form
    // fetch resolves.
    const ts = [120, 320, 720, 1500].map(ms => setTimeout(read, ms));
    return () => {
      window.removeEventListener("fb-input-fields-changed", read);
      ts.forEach(clearTimeout);
    };
  }, []);
  // Combined tag list used by the picker AND the quick chips. Form
  // fields come FIRST (they're the most relevant), then site fields,
  // then account vars, then the hardcoded MERGE_TAGS. The picker
  // dedupes by token so a key declared on the form AND in MERGE_TAGS
  // shows only once (with the form's label).
  const allTags = React.useMemo(() => {
    const seen = new Set();
    const out = [];
    for (const t of [...formVars, ...siteVars, ...accountVars, ...MERGE_TAGS]) {
      if (!t || !t.token || seen.has(t.token)) continue;
      seen.add(t.token);
      out.push(t);
    }
    return out;
  }, [formVars, siteVars, accountVars]);
  // (`usedTokens` derivation is declared LATER, below `activeField` —
  // it reads body/subject/activeField, all of which need to exist
  // first or React throws a TDZ "Cannot access X before initialization"
  // when the component runs.)
  // Toast surfaced when paste auto-route moves entries to the other field.
  const [misrouteToast, setMisrouteToast] = React.useState(null);
  React.useEffect(() => {
    if (!misrouteToast) return;
    const t = setTimeout(() => setMisrouteToast(null), 1800);
    return () => clearTimeout(t);
  }, [misrouteToast]);
  // Brief "test sent" flash for the footer Send-test link.
  const [testFlash, setTestFlash] = React.useState(null);
  React.useEffect(() => {
    if (!testFlash) return;
    const t = setTimeout(() => setTestFlash(null), 3000);
    return () => clearTimeout(t);
  }, [testFlash]);
  // Flash a chip briefly when clicked so users see "I just inserted X."
  const [flashTok, setFlashTok] = React.useState(null);
  function flashChip(tok) {
    setFlashTok(tok);
    setTimeout(() => setFlashTok(null), 350);
  }
  const [globalAiMode, setGlobalAiMode] = React.useState(null);
  const [globalCadence, setGlobalCadence] = React.useState(null);
  // Customer-call business-hours window. Surfaced inline next to the
  // "Only call during business hours" toggle so the user doesn't have
  // to wonder what counts as "business hours" — they see the exact
  // start/end and can edit it without leaving the canvas.
  // Nothing hardcoded — these stay null until the policy fetch
  // resolves OR the user explicitly picks values in the editor.
  // Engine treats null/missing as "gate is off" so calls fire
  // immediately, which is the right default for someone who hasn't
  // told us what time zone they operate in.
  const [bizHourStart, setBizHourStart] = React.useState(null);
  const [bizHourEnd,   setBizHourEnd]   = React.useState(null);
  const [bizHourTz,    setBizHourTz]    = React.useState("");
  // Browser-detected zone, surfaced as a one-click suggestion in
  // the editor (not auto-applied — the owner has to pick it).
  const _detectedTz = (() => {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ""; }
    catch (_) { return ""; }
  })();
  const bizHoursConfigured = !!(bizHourTz &&
                                 typeof bizHourStart === "number" &&
                                 typeof bizHourEnd   === "number");
  const [bizHoursEditing, setBizHoursEditing] = React.useState(false);
  const [bizHoursSaving,  setBizHoursSaving]  = React.useState(false);
  // Fetch the policy whenever a call channel is active so the helper
  // text reflects the user's actual configured window (not just the
  // hardcoded default).
  React.useEffect(() => {
    if (!hasCall) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/me/ai/policy", { credentials: "same-origin" });
        if (!r.ok) return;
        const p = await r.json();
        if (cancelled) return;
        if (typeof p.call_hour_start === "number") setBizHourStart(p.call_hour_start);
        if (typeof p.call_hour_end   === "number") setBizHourEnd(p.call_hour_end);
        if (typeof p.timezone        === "string" && p.timezone) setBizHourTz(p.timezone);
      } catch (_) {}
    })();
    return () => { cancelled = true; };
  }, [hasCall]);
  function _fmt12(h) {
    const hour = ((h % 12) || 12);
    const mer  = h < 12 ? "am" : "pm";
    return `${hour}${mer}`;
  }
  // Compute "is now inside the configured window?" using the user's
  // configured timezone — the same Intl shortcut works in every
  // modern browser and avoids pulling moment-tz. Returns false when
  // the policy isn't fully configured (no zone or no hours), since
  // the engine doesn't gate in that case either.
  function _isOutsideBizHoursNow() {
    if (!bizHoursConfigured) return false;
    try {
      const fmt = new Intl.DateTimeFormat("en-US", {
        timeZone: bizHourTz, hour12: false, hour: "numeric",
      });
      const parts = fmt.formatToParts(new Date());
      const hpart = parts.find(p => p.type === "hour");
      if (!hpart) return false;
      const h = parseInt(hpart.value, 10);
      return !(bizHourStart <= h && h < bizHourEnd);
    } catch (_) { return false; }
  }
  async function _saveBizHours(start, end) {
    setBizHoursSaving(true);
    try {
      const r = await fetch("/me/ai/policy", {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          call_hour_start: start, call_hour_end: end, timezone: bizHourTz,
        }),
      });
      if (r.ok) {
        setBizHourStart(start); setBizHourEnd(end);
        setBizHoursEditing(false);
      }
    } catch (_) {}
    setBizHoursSaving(false);
  }
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

  // Tokens currently present in the active field (subject or body).
  // Drives "is-used" highlighting on chips + picker rows so the owner
  // can see at a glance which vars they've already inserted. Declared
  // here (not earlier) because it reads body/subject/activeField and
  // those need to be initialized first.
  const usedTokens = React.useMemo(() => {
    const text = (activeField === "subject" ? subject : body) || "";
    const set = new Set();
    const re = /\{(\w+)\}/g;
    let m;
    while ((m = re.exec(text)) !== null) set.add(m[0]);
    return set;
  }, [body, subject, activeField]);

  // Push edits up to the canvas. We don't debounce — typing into a 100kB
  // node graph is fine in React.
  React.useEffect(() => {
    // For notify, derive a legacy single-string `mode` from `modes` so
    // older code paths (and the saved-flow shape) still parse. The
    // canonical source is `modes` for notify, `mode` for everyone else.
    let legacyMode = mode;
    if (isMultiChannel) {
      const ms = modes.slice().sort();
      if (ms.length === 1) legacyMode = ms[0];
      else if (ms.length === 2 && ms.includes("sms") && ms.includes("email")) legacyMode = "both";
      else legacyMode = ms.join(",");
    }
    onChange(node.id, {
      mode: legacyMode,
      modes: isMultiChannel ? modes : undefined,
      subject, body, waitDays, conditionId,
      fallback,
      // Reply-only fields: the agent picked to draft AI replies, plus
      // the approval mode (auto-send vs draft-for-review).
      reply_agent_id:   replyAgentId,
      reply_agent_name: replyAgentName,
      reply_agent_job:  replyAgentJob,
      reply_approval:   replyApproval,
      reply_channel:    replyChannel,
      // Notify-only fields. Always emitted (no-op for non-notify steps,
      // ignored by the engine for those types). snake_case so the
      // server reads node.data verbatim — no shape translation needed.
      // include_customer is hard-forced to false (no UI toggle): Notify-Me
      // is internal-only — sends solely to the addresses/numbers in
      // extra_emails / extra_phones. The homeowner never receives a copy.
      include_customer: false,
      extra_phones:     extraPhones,
      extra_emails:     extraEmails,
      default_email_dismissed: defaultDismissed,
      // Call-only fields. snake_case so the engine reads node.data
      // verbatim. Ignored for non-call steps.
      phone_number:    callPhone,
      spoken_message:  callMessage,
      voice_tone:      callVoiceTone,
      call_target:     callTarget,
      respect_business_hours: respectBusinessHours,
      // Standalone Email activity recipient picker.
      recipient_source: emailRecipientSource,
      recipient_value:  emailRecipientValue,
      // Google Sheet activity. Always emitted; engine ignores for
      // non-append_sheet steps. snake_case for verbatim engine read.
      spreadsheet_id:     sheetSpreadsheetId,
      worksheet_name:     sheetWorksheetName,
      ensure_header_row:  sheetEnsureHeader,
      columns:            sheetColumns,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, modes, subject, body, waitDays, conditionId, fallback,
      replyAgentId, replyAgentName, replyAgentJob, replyApproval, replyChannel,
      includeCustomer, extraPhones, extraEmails, defaultDismissed,
      callPhone, callMessage, callVoiceTone, callTarget, respectBusinessHours,
      emailRecipientSource, emailRecipientValue,
      sheetSpreadsheetId, sheetWorksheetName, sheetEnsureHeader, sheetColumns]);

  // Owner's connected Gmail — used as the default sender for Notify
  // steps. Seeds a "Default" email chip on first open. Re-fetched on
  // window focus so the chip appears the moment the user returns from
  // the OAuth tab without having to reopen the drawer.
  const refetchConnections = React.useCallback(() => {
    if (!isNotify) return;
    fetch("/me/email-connections", { credentials: "same-origin" })
      .then(r => r.ok ? r.json() : null).catch(() => null)
      .then(d => {
        if (!d) return;
        setEmailReady(d.ready !== false);
        // Build a return-to URL that bounces back to whichever
        // dashboard hash we're on right now, so the user lands on the
        // same canvas (and can reopen the drawer to see the new chip).
        const rt = encodeURIComponent("/dashboard" + (window.location.hash || "#outreach"));
        const base = d.connect_url || "/auth/google/connect-email";
        setConnectUrl(base + (base.includes("?") ? "&" : "?") + "return_to=" + rt);
        // Prefer the server-supplied default, fall back to the first
        // active connection in the list. The fallback covers stale
        // server builds that don't yet emit the `default` field.
        let addr = (d.default || "").trim().toLowerCase();
        if (!addr && Array.isArray(d.connections)) {
          for (const c of d.connections) {
            if ((c.status || "active") === "active") {
              addr = (c.email_address || "").trim().toLowerCase();
              if (addr) break;
            }
          }
        }
        setDefaultSender(addr);
        if (!addr) return;
        // Seed only on first open: empty list + not dismissed. We
        // don't auto-add when the user already has typed/saved chips
        // — they made an explicit choice we shouldn't overwrite.
        const already = (extraEmails || []).some(c =>
          (c.raw || c.display || "").trim().toLowerCase() === addr);
        if (!already && !defaultDismissed && (extraEmails || []).length === 0) {
          setExtraEmails([{
            id:         "default-" + Math.random().toString(36).slice(2, 9),
            raw:        addr,
            display:    addr,
            valid:      true,
            is_default: true,
          }]);
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNotify, defaultDismissed]);

  React.useEffect(() => {
    if (!isNotify) return;
    refetchConnections();
    // Re-fetch when the canvas tab regains focus — covers the path
    // where the user OAuth'd in another tab and came back.
    const onFocus = () => refetchConnections();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNotify]);

  // When the user removes the default chip, remember the dismissal so
  // we don't re-seed it next time. Watches the chip list — if the
  // default address is no longer present and we previously had it, set
  // the flag.
  React.useEffect(() => {
    if (!isNotify || !defaultSender || defaultDismissed) return;
    const stillThere = (extraEmails || []).some(c =>
      (c.raw || c.display || "").trim().toLowerCase() === defaultSender);
    if (!stillThere) setDefaultDismissed(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extraEmails, defaultSender, isNotify]);

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
  // Remove the FIRST occurrence of `token` from the active field. Used
  // when the user clicks an already-inserted chip / picker row — the
  // chip acts as a toggle so they don't have to find and delete the
  // token by hand.
  function removeToken(token) {
    const isSubj = activeField === "subject";
    const cur = isSubj ? subject : body;
    const idx = (cur || "").indexOf(token);
    if (idx < 0) return;
    const next = cur.slice(0, idx) + cur.slice(idx + token.length);
    if (isSubj) setSubject(next); else setBody(next);
  }
  // Toggle insert/remove on a single click. The chips in the rail and
  // the rows in the picker both call this — same affordance everywhere.
  function toggleToken(token) {
    if (usedTokens.has(token)) {
      removeToken(token);
    } else {
      insertToken(token);
      flashChip(token);
    }
  }

  return (
    <>
      <div className="fb-drawer-backdrop" onClick={onClose} />
      <aside className="fb-drawer" role="dialog" aria-modal="true">
        <header className="fb-drawer-h">
          <div className="fb-drawer-h-text">
            <div className="fb-drawer-h-title">
              <span className="fb-drawer-h-ico" aria-hidden="true">{activity.icon}</span>
              <span>{(data.title && data.title.trim()) || activity.title}</span>
            </div>
          </div>
          <button
            type="button"
            className="fb-drawer-x"
            onClick={onClose}
            aria-label="Close"
          >×</button>
        </header>

        <div className={`fb-drawer-body ${isInput || isCall || isAiAgent ? "is-no-preview" : ""} ${previewCollapsed && !isInput && !isCall && !isAiAgent ? "is-preview-collapsed" : ""}`}>
          <div className="fb-drawer-edit">
            {/* Per-activity settings: rename + describe. Override the
                default title (shown in the drawer header + on the
                canvas node) and add a custom description that
                replaces the default subtitle. Collapsed by default
                so the activity-specific config still owns the surface. */}
            <details className="fb-activity-settings"
                     style={{ marginBottom: 14, border: "1px solid #e5e7eb",
                              borderRadius: 8, background: "#fafbfc" }}>
              <summary style={{ padding: "9px 12px", cursor: "pointer",
                                fontSize: 12, fontWeight: 700, color: "#475569",
                                textTransform: "uppercase", letterSpacing: ".04em",
                                listStyle: "none", display: "flex",
                                alignItems: "center", gap: 6 }}>
                <span aria-hidden="true">⚙</span>
                <span>Settings</span>
                <span style={{ marginLeft: "auto", color: "#94a3b8",
                               textTransform: "none", fontWeight: 500,
                               fontSize: 11, letterSpacing: 0 }}>
                  Rename · Describe
                </span>
              </summary>
              <div style={{ padding: "0 12px 12px",
                            display: "flex", flexDirection: "column", gap: 10 }}>
                <label style={{ display: "block" }}>
                  <span style={{ display: "block", fontSize: 11.5, fontWeight: 600,
                                  color: "#64748b", marginBottom: 4 }}>
                    Activity name
                  </span>
                  <input type="text"
                    value={data.title || ""}
                    placeholder={activity.title || "Activity"}
                    maxLength={120}
                    onChange={(e) => onChange(node.id, { title: e.target.value })}
                    style={{ width: "100%", padding: "8px 10px",
                              border: "1px solid #cbd5e1", borderRadius: 6,
                              fontSize: 13, fontFamily: "inherit",
                              background: "#fff", outline: "none",
                              boxSizing: "border-box" }}
                  />
                  <span style={{ fontSize: 11, color: "#94a3b8", marginTop: 4,
                                  display: "block" }}>
                    Shows in the canvas node and the drawer header. Leave
                    blank to use the default ({activity.title}).
                  </span>
                </label>
                <label style={{ display: "block" }}>
                  <span style={{ display: "block", fontSize: 11.5, fontWeight: 600,
                                  color: "#64748b", marginBottom: 4 }}>
                    Description
                  </span>
                  <textarea
                    value={data.description || ""}
                    placeholder={activity.subtitle || activity.description || "What this activity does in this flow…"}
                    maxLength={500}
                    rows={3}
                    onChange={(e) => onChange(node.id, { description: e.target.value })}
                    style={{ width: "100%", padding: "8px 10px",
                              border: "1px solid #cbd5e1", borderRadius: 6,
                              fontSize: 13, fontFamily: "inherit",
                              background: "#fff", outline: "none",
                              resize: "vertical", lineHeight: 1.45,
                              boxSizing: "border-box" }}
                  />
                  <span style={{ fontSize: 11, color: "#94a3b8", marginTop: 4,
                                  display: "block" }}>
                    Replaces the default subtitle on the canvas node.
                  </span>
                </label>
              </div>
            </details>

            {isInput ? (
              <InputChannelPanel
                nodeId={node.id}
                data={data}
                onChange={onChange}
              />
            ) : isAiAgent ? (
              <AiAgentPanel
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
                replyAgentId={replyAgentId}
                replyAgentName={replyAgentName}
                replyAgentJob={replyAgentJob}
                onPickAgent={(agent) => {
                  setReplyAgentId(agent ? (agent.id || "") : "");
                  setReplyAgentName(agent ? (agent.name || "") : "");
                  setReplyAgentJob(agent
                    ? ((agent.behavior_config || {}).job || "")
                    : "");
                }}
                replyApproval={replyApproval}
                setReplyApproval={setReplyApproval}
                replyChannel={replyChannel}
                setReplyChannel={setReplyChannel}
              />
            ) : isCall ? (
              <div className="fb-call-panel">
                {/* Step 1 — who to call. Mirror of the Email recipient
                    picker but channel-coded mint green so a glance at
                    the drawer tells you it's the call branch. */}
                <div className="fb-erecip is-call">
                  <div className="fb-erecip-h">
                    <span className="fb-erecip-h-ico" aria-hidden="true">📞</span>
                    <span>Who should the AI call?</span>
                  </div>
                  <div className="fb-erecip-cards" role="radiogroup" aria-label="Call recipient">
                    <button
                      type="button"
                      role="radio"
                      aria-checked={callTarget === "lead"}
                      className={`fb-erecip-card ${callTarget === "lead" ? "is-picked" : ""}`}
                      onClick={() => setCallTarget("lead")}
                    >
                      <span className="fb-erecip-card-ico" aria-hidden="true">👤</span>
                      <span className="fb-erecip-card-body">
                        <span className="fb-erecip-card-title">The person who filled out the form</span>
                        <span className="fb-erecip-card-sub">Uses the phone number they typed in. Skips if blank.</span>
                      </span>
                      <span className="fb-erecip-card-mark" aria-hidden="true">{callTarget === "lead" ? "✓" : ""}</span>
                    </button>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={callTarget === "custom"}
                      className={`fb-erecip-card ${callTarget === "custom" ? "is-picked" : ""}`}
                      onClick={() => setCallTarget("custom")}
                    >
                      <span className="fb-erecip-card-ico" aria-hidden="true">🎯</span>
                      <span className="fb-erecip-card-body">
                        <span className="fb-erecip-card-title">A specific number I pick</span>
                        <span className="fb-erecip-card-sub">Always dials the same number — staff hotline, partner, etc.</span>
                      </span>
                      <span className="fb-erecip-card-mark" aria-hidden="true">{callTarget === "custom" ? "✓" : ""}</span>
                    </button>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={callTarget === "site_field"}
                      className={`fb-erecip-card ${callTarget === "site_field" ? "is-picked" : ""} ${siteFieldsForPicker.length === 0 ? "is-disabled" : ""}`}
                      onClick={() => { if (siteFieldsForPicker.length > 0) setCallTarget("site_field"); }}
                      disabled={siteFieldsForPicker.length === 0}
                      title={siteFieldsForPicker.length === 0
                        ? "Add a 'From your site' field on the Input step first"
                        : ""}
                    >
                      <span className="fb-erecip-card-ico" aria-hidden="true">🌐</span>
                      <span className="fb-erecip-card-body">
                        <span className="fb-erecip-card-title">A number from your site</span>
                        <span className="fb-erecip-card-sub">
                          {siteFieldsForPicker.length === 0
                            ? "(none yet — add a 'From your site' field on the Input step)"
                            : "Pulls the phone from a value your site sends with the form."}
                        </span>
                      </span>
                      <span className="fb-erecip-card-mark" aria-hidden="true">{callTarget === "site_field" ? "✓" : ""}</span>
                    </button>
                  </div>
                  {callTarget === "custom" && (
                    <input
                      id="fb-call-phone"
                      type="tel"
                      className="fb-input fb-erecip-detail"
                      value={callPhone}
                      onChange={(e) => setCallPhone(e.target.value)}
                      placeholder="(555) 123-4567"
                      inputMode="tel"
                      autoComplete="tel"
                    />
                  )}
                  {callTarget === "site_field" && siteFieldsForPicker.length > 0 && (
                    <select
                      className="fb-input fb-erecip-detail"
                      value={callPhone}
                      onChange={(e) => setCallPhone(e.target.value)}
                    >
                      <option value="">Pick a field from your site…</option>
                      {siteFieldsForPicker.map(f => (
                        <option key={f.key} value={f.key}>
                          {f.label || f.key}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {/* Composer — matches the call sub-section used inside
                    Notify Me / Reach Out (fb-composer.fb-call-mini),
                    so the AI-script editor looks identical wherever
                    it appears. Mint section header, chip rail, the
                    same TokenHighlightTextarea pattern as the email
                    body composer. */}
                <div className="fb-composer fb-call-mini" style={{ marginTop: 12 }}>
                  <div className="fb-section-h-v2 is-call fb-call-composer-h" style={{ padding: "10px 14px 0" }}>
                    <span style={{ flex: 1 }}>📞 What the AI should say on the call</span>
                    <button
                      type="button"
                      className={`fb-voice-preview-btn ${voicePreviewState}`}
                      onClick={_previewVoice}
                      disabled={voicePreviewState === "loading" || !(callMessage || "").trim()}
                      title={(callMessage || "").trim()
                        ? "Hear the AI read this message"
                        : "Type a message first"}
                    >
                      {voicePreviewState === "loading" ? (
                        <><span className="fb-voice-preview-spinner" aria-hidden="true" /> Generating…</>
                      ) : voicePreviewState === "playing" ? (
                        <>⏸ Stop</>
                      ) : (
                        <>▶ Preview voice</>
                      )}
                    </button>
                  </div>
                  {voicePreviewError && (
                    <div className="fb-voice-preview-err" role="alert">
                      ⚠ {voicePreviewError}
                    </div>
                  )}
                  <TokenHighlightTextarea
                    id="fb-call-message"
                    taRef={callMsgRef}
                    className="fb-composer-ta"
                    rows={5}
                    value={callMessage}
                    onChange={(e) => setCallMessage(e.target.value)}
                    onFocus={() => setActiveField("call")}
                    dataAiEditable={true}
                    dataAiFieldType="reply_body"
                    onKeyDown={(e) => {
                      if (e.key === "{") {
                        e.preventDefault();
                        const r = e.currentTarget.getBoundingClientRect();
                        setCallPickerAnchor({ x: r.left + 16, y: r.top + 36 });
                        setCallPickerOpen(true);
                      }
                    }}
                    placeholder="Hi, this is your CRM with an update. Press { to insert a variable like {first_name}."
                  />
                  <div className="fb-composer-rail">
                    <span className="fb-composer-rail-l" aria-hidden="true">Insert:</span>
                    {(() => {
                      const quick = [...QUICK_TAGS];
                      for (const extra of ["{owner_name}", "{business_name}"]) {
                        if (!quick.includes(extra)) quick.push(extra);
                      }
                      const used = new Set();
                      const re = /\{[a-zA-Z_][a-zA-Z0-9_]*\}/g;
                      let m;
                      while ((m = re.exec(callMessage || "")) !== null) used.add(m[0]);
                      return quick
                        .map(tok => allTags.find(t => t.token === tok))
                        .filter(Boolean)
                        .map(t => (
                          <button
                            key={t.token}
                            type="button"
                            className={`fb-chip ${used.has(t.token) ? "is-used" : ""}`}
                            onClick={() => insertTokenAtCursor(callMsgRef, callMessage, setCallMessage, t.token)}
                            title={used.has(t.token) ? "Already in your message" : `Click to add ${t.token}`}
                          >
                            {used.has(t.token) && <span className="fb-chip-used" aria-hidden="true">✓ </span>}
                            {t.label}
                          </button>
                        ));
                    })()}
                    <button
                      type="button"
                      className="fb-chip-outline"
                      onClick={(e) => {
                        const r = e.currentTarget.getBoundingClientRect();
                        setCallPickerAnchor({ x: r.left, y: r.bottom + 6 });
                        setCallPickerOpen(true);
                      }}
                      title="Browse all variables"
                    >
                      <svg className="fb-chip-outline-ico" width="14" height="14"
                           viewBox="0 0 24 24" fill="none" stroke="currentColor"
                           strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
                           aria-hidden="true">
                        <path d="M12 5v14M5 12h14"/>
                      </svg>
                      Insert variable
                    </button>
                  </div>
                </div>
                <VariablePicker
                  open={callPickerOpen}
                  anchor={callPickerAnchor}
                  tags={allTags}
                  usedTokens={(() => {
                    const used = new Set();
                    const re = /\{[a-zA-Z_][a-zA-Z0-9_]*\}/g;
                    let m;
                    while ((m = re.exec(callMessage || "")) !== null) used.add(m[0]);
                    return used;
                  })()}
                  onClose={() => setCallPickerOpen(false)}
                  onPick={(token) => {
                    insertTokenAtCursor(callMsgRef, callMessage, setCallMessage, token);
                    setCallPickerOpen(false);
                  }}
                />

                {/* Voice tone — compact, three pills inline. Same
                    visual weight as the channel toggles elsewhere. */}
                <div className="fb-call-tone-row" style={{ marginTop: 14 }}>
                  <div className="fb-section-h-v2 is-call" style={{ padding: "0 0 8px" }}>
                    🎤 How the AI should sound
                  </div>
                  <div className="fb-tone-grid" role="radiogroup" aria-label="Voice tone">
                    {[
                      { id: "friendly",     icon: "😊", label: "Friendly" },
                      { id: "professional", icon: "👔", label: "Professional" },
                      { id: "brief",        icon: "⚡", label: "Brief" },
                    ].map(t => (
                      <button
                        key={t.id}
                        type="button"
                        role="radio"
                        aria-checked={callVoiceTone === t.id}
                        className={`fb-tone-card ${callVoiceTone === t.id ? "is-picked" : ""}`}
                        onClick={() => setCallVoiceTone(t.id)}
                      >
                        <span className="fb-tone-card-ico" aria-hidden="true">{t.icon}</span>
                        <span className="fb-tone-card-label">{t.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <>
                {canBeSms && isMultiChannel && (
                  <div className="fb-modes-multi" role="group" aria-label="Channels">
                    <p className="fb-helper-tight" style={{ marginTop: 0, marginBottom: 8 }}>
                      {isOwnerSide
                        ? "Pick one or more — we'll use whichever you want."
                        : "Pick one or more — each one uses the contact info the customer typed in the form."}
                    </p>
                    <div className="fb-modes-multi-row">
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={hasCall}
                        className={`fb-mode-toggle is-call ${hasCall ? "is-on" : ""}`}
                        onClick={() => toggleMode("call")}
                      >
                        <span className="fb-mode-toggle-check" aria-hidden="true">{hasCall ? "✓" : ""}</span>
                        <span className="fb-mode-toggle-ico" aria-hidden="true">📞</span>
                        <span className="fb-mode-toggle-label">{isOwnerSide ? "Call me" : "Call them"}</span>
                      </button>
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={hasSms}
                        className={`fb-mode-toggle is-sms ${hasSms ? "is-on" : ""}`}
                        onClick={() => toggleMode("sms")}
                      >
                        <span className="fb-mode-toggle-check" aria-hidden="true">{hasSms ? "✓" : ""}</span>
                        <span className="fb-mode-toggle-ico" aria-hidden="true">💬</span>
                        <span className="fb-mode-toggle-label">{isOwnerSide ? "Text me" : "Text them"}</span>
                      </button>
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={hasEmail}
                        className={`fb-mode-toggle is-email ${hasEmail ? "is-on" : ""}`}
                        onClick={() => toggleMode("email")}
                      >
                        <span className="fb-mode-toggle-check" aria-hidden="true">{hasEmail ? "✓" : ""}</span>
                        <span className="fb-mode-toggle-ico" aria-hidden="true">📧</span>
                        <span className="fb-mode-toggle-label">{isOwnerSide ? "Email me" : "Email them"}</span>
                      </button>
                    </div>
                    {noModesPicked && (
                      <div className="fb-modes-warn" role="alert">
                        Pick at least one channel.
                      </div>
                    )}
                  </div>
                )}
                {canBeSms && !isMultiChannel && (
                  <div className="fb-modes-3" role="tablist" aria-label="Send by">
                    <button
                      type="button"
                      role="tab"
                      aria-selected={mode === "email"}
                      className={`fb-mode3 is-email ${mode === "email" ? "is-active" : ""}`}
                      onClick={() => setMode("email")}
                    >
                      <span className="fb-mode3-ico" aria-hidden="true">✉️</span>
                      <span className="fb-mode3-label">Email</span>
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={mode === "sms"}
                      className={`fb-mode3 is-sms ${mode === "sms" ? "is-active" : ""}`}
                      onClick={() => setMode("sms")}
                    >
                      <span className="fb-mode3-ico" aria-hidden="true">💬</span>
                      <span className="fb-mode3-label">Text</span>
                    </button>
                  </div>
                )}

                {/* ── Notify-only Recipients block ────────────────────
                    Header text removed per user request; the phone +
                    email fields stay so the user can add extra
                    recipients beyond the lead. */}
                {isNotify && (
                  <div className="fb-recip-flat">
                    {(mode !== "wait") && (
                      <div className="fb-recip-also">
                        {(hasSms || hasCall) && (
                        <div className={`fb-recip-card ${hasCall && !hasSms ? "is-call" : "is-sms"}`}>
                          <RecipientChips
                            kind="phone"
                            iconLabel={
                              hasCall && hasSms
                                ? "📱 Phones (we'll text & call)"
                                : hasCall
                                ? "📞 Numbers to call"
                                : "📱 Phone numbers"
                            }
                            values={extraPhones}
                            onChange={setExtraPhones}
                            placeholder={
                              hasCall && !hasSms
                                ? "Add a phone number to call"
                                : "Add a phone number"
                            }
                            onMisroute={(parts) => {
                              setExtraEmails(prev => [
                                ...prev,
                                ...parts.map(p => ({
                                  id: Math.random().toString(36).slice(2, 9),
                                  raw: p, display: p,
                                  valid: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p),
                                })),
                              ]);
                              setMisrouteToast(`Moved ${parts.length} entr${parts.length > 1 ? "ies" : "y"} to Emails`);
                            }}
                          />
                        </div>
                        )}
                        {hasEmail && (
                          <div className="fb-recip-card is-email">
                            <RecipientChips
                              kind="email"
                              iconLabel="✉️ Emails"
                              values={extraEmails}
                              onChange={setExtraEmails}
                              placeholder="Add an email"
                              onMisroute={(parts) => {
                                setExtraPhones(prev => [
                                  ...prev,
                                  ...parts.map(p => ({
                                    id: Math.random().toString(36).slice(2, 9),
                                    raw: p,
                                    display: p,
                                    valid: p.replace(/\D/g, "").length >= 10,
                                  })),
                                ]);
                                setMisrouteToast(`Moved ${parts.length} entr${parts.length > 1 ? "ies" : "y"} to Phone numbers`);
                              }}
                            />
                            {emailReady && defaultSender && defaultDismissed && (
                              <div className="fb-recip-default-hint is-dismissed">
                                <span aria-hidden="true">✉️</span>
                                <span>
                                  Sending from your Gmail (<strong>{defaultSender}</strong>).
                                  You won't get a copy — only the addresses above will.
                                </span>
                                <button
                                  type="button"
                                  className="fb-recip-default-restore"
                                  onClick={() => {
                                    setDefaultDismissed(false);
                                    const already = (extraEmails || []).some(c =>
                                      (c.raw || c.display || "").trim().toLowerCase() === defaultSender);
                                    if (!already) {
                                      setExtraEmails(prev => [
                                        {
                                          id: "default-" + Math.random().toString(36).slice(2, 9),
                                          raw: defaultSender,
                                          display: defaultSender,
                                          valid: true,
                                          is_default: true,
                                        },
                                        ...(prev || []),
                                      ]);
                                    }
                                  }}
                                >Add me back</button>
                              </div>
                            )}
                            {emailReady && !defaultSender && (
                              <div className="fb-recip-connect">
                                <span aria-hidden="true">📨</span>
                                <span>
                                  No Gmail connected yet — connect one and we'll
                                  use it as your default sender.
                                </span>
                                <a
                                  className="fb-recip-connect-btn"
                                  href={connectUrl}
                                >Connect Gmail →</a>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                    {misrouteToast && (
                      <div className="fb-recip-toast" role="status">{misrouteToast}</div>
                    )}
                    {(() => {
                      const invalid =
                        ((hasSms || hasCall) ? extraPhones.filter(p => !p.valid).length : 0) +
                        (hasEmail ? extraEmails.filter(e => !e.valid).length : 0);
                      if (invalid === 0) return null;
                      return (
                        <div className="fb-recip-warn">
                          {invalid} recipient{invalid > 1 ? "s" : ""} look invalid.
                          You can still save — they'll be skipped at send time.
                        </div>
                      );
                    })()}
                  </div>
                )}

                {/* Email subject — labeled clearly so a new user
                    can't confuse it with the body. Visually grouped
                    with the message body below via the .fb-mail-frame
                    wrapper that the composer block opens. */}
                {/* Standalone Email — recipient picker comes FIRST,
                    before the subject. Big visual cards instead of
                    radio buttons so the choice reads at a glance.
                    Three options: the lead, a specific address, or
                    a value from a "From your site" field. */}
                {isSendEmail && (
                  <div className="fb-erecip">
                    <div className="fb-erecip-h">
                      <span className="fb-erecip-h-ico" aria-hidden="true">📬</span>
                      <span>Where should this email go?</span>
                    </div>
                    <div className="fb-erecip-cards" role="radiogroup" aria-label="Email recipient">
                      <button
                        type="button"
                        role="radio"
                        aria-checked={emailRecipientSource === "lead"}
                        className={`fb-erecip-card ${emailRecipientSource === "lead" ? "is-picked" : ""}`}
                        onClick={() => { setEmailRecipientSource("lead"); setEmailRecipientValue(""); }}
                      >
                        <span className="fb-erecip-card-ico" aria-hidden="true">👤</span>
                        <span className="fb-erecip-card-body">
                          <span className="fb-erecip-card-title">The person who filled out the form</span>
                          <span className="fb-erecip-card-sub">Use the email they typed in.</span>
                        </span>
                        <span className="fb-erecip-card-mark" aria-hidden="true">{emailRecipientSource === "lead" ? "✓" : ""}</span>
                      </button>
                      <button
                        type="button"
                        role="radio"
                        aria-checked={emailRecipientSource === "custom"}
                        className={`fb-erecip-card ${emailRecipientSource === "custom" ? "is-picked" : ""}`}
                        onClick={() => setEmailRecipientSource("custom")}
                      >
                        <span className="fb-erecip-card-ico" aria-hidden="true">✉️</span>
                        <span className="fb-erecip-card-body">
                          <span className="fb-erecip-card-title">A specific email I pick</span>
                          <span className="fb-erecip-card-sub">Always sends to the same address — staff inbox, partner, etc.</span>
                        </span>
                        <span className="fb-erecip-card-mark" aria-hidden="true">{emailRecipientSource === "custom" ? "✓" : ""}</span>
                      </button>
                      <button
                        type="button"
                        role="radio"
                        aria-checked={emailRecipientSource === "site_field"}
                        className={`fb-erecip-card ${emailRecipientSource === "site_field" ? "is-picked" : ""} ${siteFieldsForPicker.length === 0 ? "is-disabled" : ""}`}
                        onClick={() => { if (siteFieldsForPicker.length > 0) setEmailRecipientSource("site_field"); }}
                        disabled={siteFieldsForPicker.length === 0}
                        title={siteFieldsForPicker.length === 0
                          ? "Add a 'From your site' field on the Input step first"
                          : ""}
                      >
                        <span className="fb-erecip-card-ico" aria-hidden="true">🌐</span>
                        <span className="fb-erecip-card-body">
                          <span className="fb-erecip-card-title">An email from your site</span>
                          <span className="fb-erecip-card-sub">
                            {siteFieldsForPicker.length === 0
                              ? "(none yet — add a 'From your site' field on the Input step)"
                              : "Pulls the address from a value your site sends with the form."}
                          </span>
                        </span>
                        <span className="fb-erecip-card-mark" aria-hidden="true">{emailRecipientSource === "site_field" ? "✓" : ""}</span>
                      </button>
                    </div>
                    {emailRecipientSource === "custom" && (
                      <input
                        type="email"
                        className="fb-input fb-erecip-detail"
                        value={emailRecipientValue}
                        onChange={(e) => setEmailRecipientValue(e.target.value)}
                        placeholder="them@example.com"
                        autoCapitalize="off"
                        autoCorrect="off"
                        spellCheck={false}
                      />
                    )}
                    {emailRecipientSource === "site_field" && siteFieldsForPicker.length > 0 && (
                      <select
                        className="fb-input fb-erecip-detail"
                        value={emailRecipientValue}
                        onChange={(e) => setEmailRecipientValue(e.target.value)}
                      >
                        <option value="">Pick a field from your site…</option>
                        {siteFieldsForPicker.map(f => (
                          <option key={f.key} value={f.key}>
                            {f.label || f.key}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                )}

                {/* ── Google Sheets activity drawer ────────────────
                    Sheet URL + worksheet + an editable column-mapping
                    table. Each column is a {header, source} pair where
                    source is a {merge_tag} like {name} or
                    {landscape_summary}. The default columns cover the
                    standard form fields + the picked landscaper's
                    profile so the user has a working sheet on first
                    drop without configuring anything. */}
                {isAppendSheet && (
                  <div className="fb-erecip" style={{display:"flex",flexDirection:"column",gap:10}}>
                    <div className="fb-erecip-h">
                      <span className="fb-erecip-h-ico" aria-hidden="true">📊</span>
                      <span>Where should this row land?</span>
                    </div>

                    {/* Connection status. If not connected, primary CTA
                        is "Connect Google Sheets" (OAuth). When connected,
                        the badge shows the connected Google account and
                        offers a Disconnect link. */}
                    <div style={{
                      display:"flex",alignItems:"center",gap:10,
                      padding:"10px 12px",borderRadius:10,
                      background: sheetsConn.connected ? "#ecfdf5" : "#fffbeb",
                      border:"1px solid " + (sheetsConn.connected ? "#a7f3d0" : "#fde68a"),
                    }}>
                      <span style={{fontSize:18}} aria-hidden="true">
                        {sheetsConn.connected ? "✓" : "🔗"}
                      </span>
                      <div style={{flex:1,minWidth:0}}>
                        {sheetsConn.connected ? (
                          <>
                            <div style={{fontSize:13,fontWeight:700,color:"#13401f"}}>
                              Connected to Google
                            </div>
                            <div style={{fontSize:11.5,color:"#1f5f35",fontFamily:"ui-monospace, SFMono-Regular, Menlo, monospace",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                              {sheetsConn.google_email || "(unknown account)"}
                            </div>
                          </>
                        ) : (
                          <>
                            <div style={{fontSize:13,fontWeight:700,color:"#78350f"}}>
                              Connect a Google account to write rows
                            </div>
                            <div style={{fontSize:11.5,color:"#92400e"}}>
                              {sheetsConn.ready
                                ? "Sign in once. We use it to append rows to your sheets."
                                : "(Server not configured for OAuth — set EMAIL_TOKEN_ENCRYPTION_KEY.)"}
                            </div>
                          </>
                        )}
                      </div>
                      {sheetsConn.connected ? (
                        <button
                          type="button"
                          onClick={disconnectSheetsOAuth}
                          style={{background:"transparent",color:"#92400e",border:"1px solid #d8e2d4",borderRadius:8,padding:"6px 10px",fontSize:12,fontWeight:600,cursor:"pointer"}}
                        >Disconnect</button>
                      ) : (
                        <button
                          type="button"
                          onClick={startSheetsOAuth}
                          disabled={!sheetsConn.ready || sheetsConn.loading}
                          style={{background:"#1f5f35",color:"#fff",border:"none",borderRadius:8,padding:"7px 14px",fontSize:12.5,fontWeight:700,cursor:sheetsConn.ready?"pointer":"not-allowed",opacity:sheetsConn.ready?1:0.55}}
                        >
                          {sheetsConn.loading ? "Checking…" : "Connect Google Sheets"}
                        </button>
                      )}
                    </div>
                    <label style={{display:"flex",flexDirection:"column",gap:4,fontSize:13,fontWeight:600,color:"#2e4238"}}>
                      <span>Google Sheet URL or ID</span>
                      <input
                        type="text"
                        className="fb-input"
                        value={sheetSpreadsheetId}
                        onChange={(e) => setSheetSpreadsheetId(e.target.value)}
                        placeholder="https://docs.google.com/spreadsheets/d/1abc.../edit"
                        autoCapitalize="off"
                        autoCorrect="off"
                        spellCheck={false}
                      />
                      <span style={{fontWeight:500,fontSize:12,color:"#5f6f66"}}>
                        Share the sheet with the service account that runs your CRM, with Editor access.
                      </span>
                    </label>
                    <label style={{display:"flex",flexDirection:"column",gap:4,fontSize:13,fontWeight:600,color:"#2e4238"}}>
                      <span>Worksheet (tab) name</span>
                      <input
                        type="text"
                        className="fb-input"
                        value={sheetWorksheetName}
                        onChange={(e) => setSheetWorksheetName(e.target.value)}
                        placeholder="Sheet1"
                        autoCapitalize="off"
                        autoCorrect="off"
                        spellCheck={false}
                      />
                    </label>
                    <label style={{display:"inline-flex",alignItems:"center",gap:8,fontSize:13,fontWeight:500,color:"#2e4238",cursor:"pointer"}}>
                      <input
                        type="checkbox"
                        checked={!!sheetEnsureHeader}
                        onChange={(e) => setSheetEnsureHeader(e.target.checked)}
                      />
                      <span>Auto-write the header row if the sheet is empty</span>
                    </label>
                    <div style={{marginTop:6}}>
                      <div style={{fontSize:13,fontWeight:700,color:"#2e4238",marginBottom:6}}>
                        Columns (each row = one column in the sheet)
                      </div>
                      <div style={{fontSize:11.5,color:"#5f6f66",marginBottom:8,lineHeight:1.45}}>
                        Use <code>{"{merge_tags}"}</code> like <code>{"{name}"}</code>,{" "}
                        <code>{"{email}"}</code>, <code>{"{landscape_name}"}</code>,{" "}
                        <code>{"{landscape_summary}"}</code>,{" "}
                        <code>{"{landscape_phonenumber}"}</code>, plus computed{" "}
                        <code>{"{timestamp}"}</code> and <code>{"{lead_id}"}</code>.
                      </div>
                      <div style={{display:"flex",flexDirection:"column",gap:6}}>
                        {sheetColumns.map((col, idx) => (
                          <div key={idx} style={{display:"grid",gridTemplateColumns:"1fr 1fr 28px",gap:6,alignItems:"center"}}>
                            <input
                              type="text"
                              className="fb-input"
                              value={col.header}
                              placeholder="Column header"
                              onChange={(e) => {
                                const v = e.target.value;
                                setSheetColumns(cur => cur.map((c, i) => i === idx ? {...c, header: v} : c));
                              }}
                            />
                            <input
                              type="text"
                              className="fb-input"
                              value={col.source}
                              placeholder="{merge_tag}"
                              onChange={(e) => {
                                const v = e.target.value;
                                setSheetColumns(cur => cur.map((c, i) => i === idx ? {...c, source: v} : c));
                              }}
                              style={{fontFamily:"ui-monospace, SFMono-Regular, Menlo, monospace", fontSize:13}}
                            />
                            <button
                              type="button"
                              aria-label="Remove column"
                              onClick={() => setSheetColumns(cur => cur.filter((_, i) => i !== idx))}
                              style={{background:"#fff",border:"1px solid #d8e2d4",borderRadius:6,height:32,cursor:"pointer",fontWeight:700,color:"#92400e"}}
                            >×</button>
                          </div>
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={() => setSheetColumns(cur => [...cur, {header:"", source:""}])}
                        style={{marginTop:8,padding:"6px 12px",background:"#fff",color:"#1f5f35",border:"1px dashed #a7f3d0",borderRadius:6,fontWeight:600,fontSize:12.5,cursor:"pointer"}}
                      >+ Add column</button>
                    </div>
                  </div>
                )}

                {hasEmail && isMultiChannel && (
                  <div className="fb-mail-frame">
                    <div className="fb-mail-frame-row">
                      <div className="fb-section-h-v2 is-email">✉️ Email subject</div>
                      <input
                        id="fb-edit-subject"
                        ref={subjRef}
                        type="text"
                        className="fb-input fb-subject-input-v2"
                        data-ai-editable="true"
                        data-ai-field-type="post_caption"
                        value={subject}
                        onChange={(e) => setSubject(e.target.value)}
                        onFocus={() => setActiveField("subject")}
                        onKeyDown={(e) => {
                          // Press `{` in the subject → open the variable
                          // picker. activeField is already "subject" via
                          // onFocus, so toggleToken inserts there.
                          if (e.key === "{") {
                            e.preventDefault();
                            const r = e.currentTarget.getBoundingClientRect();
                            setVarPickerAnchor({ x: r.left + 16, y: r.bottom + 6 });
                            setVarPickerOpen(true);
                          }
                        }}
                        placeholder="Quick update for you (press { to insert a variable)"
                        maxLength={140}
                        aria-label="Email subject"
                      />
                    </div>
                  </div>
                )}
                {hasEmail && !isMultiChannel && (
                  <div
                    className="fb-subject-wrap"
                    title={hasSms
                      ? "Subject — only shown in the email; texts don't have one."
                      : "Subject"}
                  >
                    <span className="fb-subject-prefix" aria-hidden="true">✉️</span>
                    <input
                      id="fb-edit-subject"
                      ref={subjRef}
                      type="text"
                      className="fb-input fb-subject-input"
                      data-ai-editable="true"
                      data-ai-field-type="post_caption"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      onFocus={() => setActiveField("subject")}
                      placeholder="Subject"
                      maxLength={140}
                      aria-label="Email subject"
                    />
                  </div>
                )}


                {/* Section header dropped — the textarea placeholder +
                    char counter already communicate "this is the message"
                    and "it's sent as text and/or email". Saves 24px. */}
                {/* Composer shell: textarea + attached chip rail share a
                    single rounded border so the chips read as part of
                    the editor instead of a floating accessory.
                    For Notify Me, this section only renders if at least
                    one text/email channel is selected. The Call channel
                    has its own message section below — separate inputs
                    so the user can phrase each one differently. */}
                {(!isMultiChannel || hasSms || hasEmail) && (
                <div className="fb-composer">
                  {isMultiChannel && (
                    <div
                      className={`fb-section-h-v2 ${
                        // When paired with the email subject above
                        // (any email mode), header is blue so the
                        // whole panel reads as one email block.
                        hasEmail ? "is-email"
                        : hasSms ? "is-sms"
                        : "is-email"
                      }`}
                      style={{ padding: "10px 14px 0" }}
                    >
                      {hasSms && hasEmail
                        ? "💬 Message (text + email)"
                        : hasSms
                        ? "💬 Text message"
                        : "💬 Email message"}
                    </div>
                  )}
                  <TokenHighlightTextarea
                    id="fb-edit-body"
                    taRef={taRef}
                    className="fb-composer-ta"
                    dataAiEditable={true}
                    dataAiFieldType={hasSms && !hasEmail ? "reply_body" : "post_caption"}
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    onFocus={() => setActiveField("body")}
                    onKeyDown={(e) => {
                      // Open the variable picker when the user types `{`.
                      // The bracket is captured so it doesn't insert as
                      // literal text — selection happens via the picker.
                      if (e.key === "{") {
                        e.preventDefault();
                        const ta = e.currentTarget.getBoundingClientRect();
                        setVarPickerAnchor({
                          x: ta.left + 16,
                          y: ta.top + 36,
                        });
                        setVarPickerOpen(true);
                      }
                    }}
                    placeholder={hasSms && !hasEmail
                      ? "Type a quick note… (press { to insert a variable)"
                      : hasSms && hasEmail
                      ? "Type one message — we'll send it as a text AND an email. Press { to insert a variable."
                      : !isMultiChannel && mode === "call"
                      ? "What the AI should say first when the call connects. Press { to insert a variable like {first_name}."
                      : "Type your message here. Press { to insert a variable, or use the chips below."}
                    rows={
                      // Multi-channel (Notify Me / Reach out): keep the
                      // body textarea compact so the whole drawer fits
                      // at 1440x900. Resizable for longer messages.
                      isMultiChannel
                        ? (hasSms && !hasEmail ? 4 : 5)
                        : (mode === "sms" ? 5
                            : mode === "both" ? 7
                            : mode === "call" ? 6
                            : 10)
                    }
                  />
                  <div className="fb-composer-rail">
                    {isMultiChannel && (
                      <span className="fb-composer-rail-l" aria-hidden="true">Insert:</span>
                    )}
                    {/* Quick chips: now driven by allTags so account
                        vars surface here too if they're in QUICK_TAGS.
                        Used tokens get the .is-used highlight; clicking
                        toggles (insert ↔ remove). */}
                    {(() => {
                      // Quick set = canonical QUICK_TAGS plus owner_name
                      // and business_name (the most-used account vars),
                      // de-duped, preserving order.
                      const quick = [...QUICK_TAGS];
                      for (const extra of ["{owner_name}", "{business_name}"]) {
                        if (!quick.includes(extra)) quick.push(extra);
                      }
                      const rendered = quick
                        .map(tok => allTags.find(t => t.token === tok))
                        .filter(Boolean);
                      if (rendered.length === 0) {
                        return (
                          <span className="fb-composer-rail-empty">
                            No variables available yet — they'll appear here once your flow has data.
                          </span>
                        );
                      }
                      return rendered.map(t => {
                        const isUsed = usedTokens.has(t.token);
                        return (
                          <button
                            key={t.token}
                            type="button"
                            className={`fb-chip ${flashTok === t.token ? "is-flash" : ""} ${isUsed ? "is-used" : ""}`}
                            onClick={() => toggleToken(t.token)}
                            title={isUsed
                              ? `Already in your message — click to remove`
                              : `Click to add ${t.token}`}
                          >
                            {isUsed && <span className="fb-chip-used" aria-hidden="true">✓ </span>}
                            {t.label}
                          </button>
                        );
                      });
                    })()}
                    <button
                      type="button"
                      className="fb-chip-outline"
                      onClick={(e) => {
                        const r = e.currentTarget.getBoundingClientRect();
                        setVarPickerAnchor({ x: r.left, y: r.bottom + 6 });
                        setVarPickerOpen(true);
                      }}
                      title="Browse all variables"
                    >
                      <svg className="fb-chip-outline-ico" width="14" height="14"
                           viewBox="0 0 24 24" fill="none" stroke="currentColor"
                           strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
                           aria-hidden="true">
                        <path d="M12 5v14M5 12h14"/>
                      </svg>
                      Insert variable
                    </button>
                  </div>
                </div>
                )}

                {/* Multi-channel — Call channel gets its OWN message
                    section so the user can phrase what the AI says on
                    the call differently from the text/email. Hidden
                    until they pick the Call toggle. */}
                {isMultiChannel && hasCall && (
                  <div className="fb-composer fb-call-mini" style={{ marginTop: 12 }}>
                    <div className="fb-section-h-v2 is-call" style={{ padding: "10px 14px 0" }}>
                      📞 What the AI should say on the call
                    </div>
                    <TokenHighlightTextarea
                      id="fb-notify-call-msg"
                      taRef={callMsgRef}
                      className="fb-composer-ta"
                      rows={4}
                      value={callMessage}
                      onChange={(e) => setCallMessage(e.target.value)}
                      onFocus={() => setActiveField("call")}
                      dataAiEditable={true}
                      dataAiFieldType="reply_body"
                      onKeyDown={(e) => {
                        if (e.key === "{") {
                          e.preventDefault();
                          const r = e.currentTarget.getBoundingClientRect();
                          setCallPickerAnchor({ x: r.left + 16, y: r.top + 36 });
                          setCallPickerOpen(true);
                        }
                      }}
                      placeholder="Hi, this is your CRM with a quick update on a new lead. Press { to insert a variable like {first_name}."
                    />
                    <p className="fb-helper-tight" style={{ padding: "4px 14px 10px" }}>
                      Keep it short — under 30 seconds when read aloud.
                    </p>
                    {/* Customer-facing call only: business-hours toggle.
                        Notify Me's call channel rings the OWNER and
                        bypasses business hours by design (compile-side),
                        so we don't show this for it. */}
                    {isReachOut && (() => {
                      const outsideNow = respectBusinessHours && _isOutsideBizHoursNow();
                      const tzShort = bizHourTz
                        ? bizHourTz.split("/").pop().replace(/_/g, " ")
                        : "";
                      return (
                        <div className="fb-bh-section" style={{
                            padding: "10px 14px 12px",
                            borderTop: "1px solid #e6e9ef",
                          }}>
                          <label style={{
                              display: "flex", alignItems: "flex-start",
                              gap: 10, cursor: "pointer",
                            }}>
                            <input
                              type="checkbox"
                              checked={respectBusinessHours}
                              onChange={(e) => setRespectBusinessHours(e.target.checked)}
                              style={{ marginTop: 3 }}
                            />
                            <span style={{ fontSize: 13, lineHeight: 1.45, flex: 1 }}>
                              <strong>Only call during business hours</strong>
                              <span style={{ display: "block", color: "#5a6470", marginTop: 2 }}>
                                {respectBusinessHours
                                  ? (bizHoursConfigured
                                      ? <>Calls between <strong>{_fmt12(bizHourStart)} – {_fmt12(bizHourEnd)} {tzShort}</strong> fire immediately. Outside that window they wait until next morning so customers aren't dialed at night.</>
                                      : <>⚠ <strong>Time zone not set yet.</strong> The gate is off until you pick a time zone and window below — calls will fire whenever the engine reaches them.</>)
                                  : <>Calls fire immediately, day or night. Use only for testing or genuinely time-critical alerts. {bizHoursConfigured && <span style={{ color: "#94a3b8" }}>(Saved zone: <strong>{tzShort}</strong>.)</span>}</>}
                              </span>
                            </span>
                          </label>
                          {/* Live "you're outside the window right now" warning
                              so the user understands WHY a call deferred. */}
                          {outsideNow && (
                            <div role="alert" style={{
                                marginTop: 8, padding: "8px 12px",
                                background: "#fef3c7", border: "1px solid #fde68a",
                                borderRadius: 8, fontSize: 12.5, color: "#78350f",
                                lineHeight: 1.4,
                              }}>
                              ⚠ It's currently outside <strong>{_fmt12(bizHourStart)} – {_fmt12(bizHourEnd)} {tzShort}</strong>. Calls submitted now would defer to the next morning. Either turn this off, widen the window, or test during business hours.
                            </div>
                          )}
                          {/* Always show the change-window control when
                              Call is on — even if the user has unchecked
                              "Only call during business hours" they may
                              still want to change the time-zone (other
                              steps in the flow can opt back into the
                              window). Hiding this behind the toggle
                              made the timezone unreachable. */}
                          <div style={{ marginTop: 8 }}>
                              {bizHoursEditing ? (
                                <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12.5 }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                                    <span style={{ color: "#5a6470" }}>Window:</span>
                                    <select
                                      value={bizHourStart == null ? "" : bizHourStart}
                                      onChange={(e) => setBizHourStart(e.target.value === "" ? null : parseInt(e.target.value, 10))}
                                      style={{ padding: "4px 6px", border: "1px solid #cdd7e3", borderRadius: 6 }}
                                    >
                                      <option value="">Pick a start time…</option>
                                      {Array.from({length: 24}, (_, h) => (
                                        <option key={h} value={h}>{_fmt12(h)}</option>
                                      ))}
                                    </select>
                                    <span>to</span>
                                    <select
                                      value={bizHourEnd == null ? "" : bizHourEnd}
                                      onChange={(e) => setBizHourEnd(e.target.value === "" ? null : parseInt(e.target.value, 10))}
                                      style={{ padding: "4px 6px", border: "1px solid #cdd7e3", borderRadius: 6 }}
                                    >
                                      <option value="">Pick an end time…</option>
                                      {Array.from({length: 24}, (_, h) => (
                                        <option key={h+1} value={h+1}>{_fmt12((h+1) % 24)}</option>
                                      ))}
                                    </select>
                                  </div>
                                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                                    <span style={{ color: "#5a6470" }}>Time zone:</span>
                                    <select
                                      value={bizHourTz}
                                      onChange={(e) => setBizHourTz(e.target.value)}
                                      style={{ padding: "4px 6px", border: "1px solid #cdd7e3", borderRadius: 6, minWidth: 220 }}
                                    >
                                      <option value="">Pick a time zone…</option>
                                      {(() => {
                                        const COMMON = [
                                          ["America/New_York",     "Eastern (New York)"],
                                          ["America/Chicago",      "Central (Chicago)"],
                                          ["America/Denver",       "Mountain (Denver)"],
                                          ["America/Phoenix",      "Arizona (no DST)"],
                                          ["America/Los_Angeles",  "Pacific (Los Angeles)"],
                                          ["America/Anchorage",    "Alaska"],
                                          ["Pacific/Honolulu",     "Hawaii"],
                                          ["UTC",                  "UTC"],
                                        ];
                                        const seen = new Set(COMMON.map(c => c[0]));
                                        const opts = [];
                                        if (_detectedTz && !seen.has(_detectedTz)) {
                                          opts.push(<option key={_detectedTz} value={_detectedTz}>📍 Use my zone: {_detectedTz}</option>);
                                        }
                                        opts.push(...COMMON.map(([v, label]) => (
                                          <option key={v} value={v}>{label}</option>
                                        )));
                                        if (bizHourTz && !seen.has(bizHourTz) && bizHourTz !== _detectedTz) {
                                          opts.unshift(<option key={bizHourTz} value={bizHourTz}>{bizHourTz}</option>);
                                        }
                                        return opts;
                                      })()}
                                    </select>
                                    {_detectedTz && (
                                      <button
                                        type="button"
                                        onClick={() => setBizHourTz(_detectedTz)}
                                        title={`Use your browser's detected zone: ${_detectedTz}`}
                                        style={{
                                          background: "none", border: 0, padding: 0,
                                          color: "#185fa5", cursor: "pointer",
                                          fontSize: 12, textDecoration: "underline",
                                        }}
                                      >Use my zone</button>
                                    )}
                                  </div>
                                  {!bizHoursConfigured && (
                                    <p style={{ margin: 0, color: "#94a3b8", fontSize: 11.5, lineHeight: 1.4 }}>
                                      Until all three are filled in, the gate stays off — calls fire whenever the engine reaches them.
                                    </p>
                                  )}
                                  <div style={{ display: "flex", gap: 8 }}>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        if (bizHoursConfigured) _saveBizHours(bizHourStart, bizHourEnd);
                                      }}
                                      disabled={bizHoursSaving || !bizHoursConfigured}
                                      title={bizHoursConfigured ? "" : "Pick a start, end, and time zone first."}
                                      style={{
                                        padding: "4px 10px", borderRadius: 6,
                                        border: "1px solid #185fa5",
                                        background: bizHoursConfigured ? "#185fa5" : "#cbd5e1",
                                        color: "#fff",
                                        cursor: bizHoursConfigured ? "pointer" : "not-allowed",
                                        fontSize: 12,
                                      }}
                                    >{bizHoursSaving ? "Saving…" : "Save"}</button>
                                    <button
                                      type="button"
                                      onClick={() => setBizHoursEditing(false)}
                                      style={{
                                        padding: "4px 10px", borderRadius: 6,
                                        border: "1px solid #cdd7e3", background: "#fff",
                                        color: "#374151", cursor: "pointer", fontSize: 12,
                                      }}
                                    >Cancel</button>
                                  </div>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setBizHoursEditing(true)}
                                  style={{
                                    background: "none", border: 0, padding: 0,
                                    color: "#185fa5", cursor: "pointer",
                                    textDecoration: "underline", fontSize: 12.5,
                                  }}
                                >{bizHoursConfigured ? "Change time zone & window" : "Set time zone & window"}</button>
                              )}
                            </div>
                        </div>
                      );
                    })()}
                  </div>
                )}

                {/* Variable picker for the multi-channel Call message
                    textarea. Without this, pressing `{` in the call
                    field would open nothing — the picker rendered only
                    inside the standalone Call activity drawer. */}
                {isMultiChannel && hasCall && (
                  <VariablePicker
                    open={callPickerOpen}
                    anchor={callPickerAnchor}
                    tags={allTags}
                    usedTokens={(() => {
                      const used = new Set();
                      const re = /\{[a-zA-Z_][a-zA-Z0-9_]*\}/g;
                      let m;
                      while ((m = re.exec(callMessage || "")) !== null) {
                        used.add(m[0]);
                      }
                      return used;
                    })()}
                    onClose={() => setCallPickerOpen(false)}
                    onPick={(token) => {
                      insertTokenAtCursor(callMsgRef, callMessage, setCallMessage, token);
                      setCallPickerOpen(false);
                    }}
                  />
                )}

                {/* Polish 3 — informational char counter; shown only when
                    SMS is in play. No warning styling once we cross 160;
                    long texts are normal, just multi-segment. */}
                {hasSms && (() => {
                  const chars = body.length;
                  const segments = chars === 0 ? 0 : (chars <= 160 ? 1 : Math.ceil(chars / 153));
                  return (
                    <div className="fb-charcount">
                      {chars} character{chars === 1 ? "" : "s"}
                      {chars > 0 && (
                        <> · {segments} text message{segments === 1 ? "" : "s"}</>
                      )}
                    </div>
                  );
                })()}

                <VariablePicker
                  open={varPickerOpen}
                  anchor={varPickerAnchor}
                  tags={allTags}
                  usedTokens={usedTokens}
                  onClose={() => setVarPickerOpen(false)}
                  onPick={(token) => {
                    toggleToken(token);
                    setVarPickerOpen(false);
                  }}
                />
              </>
            )}
          </div>

          {!isInput && !isCall && !isAppendSheet && !isReply && (
          <div className={`fb-drawer-preview ${previewCollapsed ? "is-collapsed" : ""}`}>
            <button
              type="button"
              className="fb-preview-toggle"
              onClick={() => setPreviewCollapsed(v => !v)}
              title={previewCollapsed ? "Show live preview" : "Hide live preview"}
              aria-label={previewCollapsed ? "Show live preview" : "Hide live preview"}
            >{previewCollapsed ? "◂ Show preview" : "Hide preview ▸"}</button>
            <div className="fb-prev-header">
              <div className="fb-prev-header-l">Live preview</div>
            </div>
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
                <div className="fb-prev-slot">
                  {(() => {
                    // Empty-recipients message replaces the phone when
                    // the count truly is zero. Avoids showing a fake
                    // preview that promises something the engine won't
                    // deliver.
                    if (isMultiChannel) {
                      const noChannels = !hasSms && !hasEmail && !hasCall;
                      if (noChannels) {
                        return (
                          <div className="fb-prev-empty">
                            Pick a channel to see the preview.
                          </div>
                        );
                      }
                      // Notify Me's recipients = lead (if include_customer)
                      // + owner extras. Reach Out's recipients = always
                      // the lead (1), no extras concept. Skip the empty-
                      // recipient check entirely for the customer-side
                      // step; the lead always has SOMETHING.
                      if (isOwnerSide) {
                        const phoneCount =
                          (hasSms || hasCall)
                            ? (includeCustomer ? 1 : 0) + extraPhones.filter(p => p.valid).length
                            : 0;
                        const emailCount =
                          hasEmail
                            ? (includeCustomer ? 1 : 0) + extraEmails.filter(e => e.valid).length
                            : 0;
                        if (phoneCount === 0 && emailCount === 0 && !hasCall) {
                          return (
                            <div className="fb-prev-empty">
                              No recipients yet. Add at least one to send.
                            </div>
                          );
                        }
                      }
                    }
                    // For multi-channel activities, derive the preview's
                    // mode string from the live `modes` array — the
                    // local `mode` state isn't touched by toggleMode,
                    // so reading it would freeze the preview at whatever
                    // was loaded.
                    const previewMode = isMultiChannel
                      ? (() => {
                          const ms = (modes || []).slice().sort();
                          if (ms.length === 0) return "";
                          if (ms.length === 1) return ms[0];
                          if (ms.length === 2 && ms.includes("sms") && ms.includes("email")) return "both";
                          return ms.join(",");
                        })()
                      : mode;
                    return (
                      <PhonePreview
                        mode={previewMode}
                        subject={subject}
                        body={body}
                        spokenMessage={callMessage}
                        fromName="Your business"
                        previewValues={previewSource === "custom" ? previewOverrides : null}
                        tags={allTags}
                      />
                    );
                  })()}
                </div>
              </>
            )}
          </div>
          )}
        </div>

        <footer className="fb-drawer-foot">
          {testFlash && (
            <div className="fb-drawer-testflash" role="status">{testFlash}</div>
          )}
          {onDelete ? (
            <button
              type="button"
              className="fb-drawer-del"
              onClick={() => onDelete(node.id)}
            >Remove this step</button>
          ) : <span />}
          <div className="fb-drawer-foot-r">
            {/* Send-a-test link — for Notify only, where the recipient
                concept is well-defined. Real test wiring is best-effort:
                the canvas doesn't have a lead in scope, so we surface a
                summary-style confirmation that mirrors what the engine
                would actually send. */}
            {isNotify && (
              <button
                type="button"
                className="fb-drawer-test-btn"
                onClick={() => {
                  const phones = (mode === "email" ? 0 : (
                    (includeCustomer ? 1 : 0) + extraPhones.filter(p => p.valid).length
                  ));
                  const emails = (mode === "sms" ? 0 : (
                    (includeCustomer ? 1 : 0) + extraEmails.filter(e => e.valid).length
                  ));
                  if (phones === 0 && emails === 0) {
                    setTestFlash("Add at least one valid recipient first.");
                    return;
                  }
                  // Best-effort: log the would-be send for debugging.
                  // A real test endpoint can read this same shape.
                  // eslint-disable-next-line no-console
                  console.log("[Notify] send test", {
                    mode, subject, body,
                    include_customer: includeCustomer,
                    extra_phones: extraPhones,
                    extra_emails: extraEmails,
                  });
                  const parts = [];
                  if (phones) parts.push(`${phones} phone${phones > 1 ? "s" : ""}`);
                  if (emails) parts.push(`${emails} email${emails > 1 ? "s" : ""}`);
                  setTestFlash(`✓ Test queued for ${parts.join(" and ")}`);
                }}
              >Send a test</button>
            )}
            <button
              type="button"
              className="fb-drawer-done"
              disabled={noModesPicked}
              title={noModesPicked ? "Pick at least one way to be notified first." : ""}
              onClick={onClose}
            >Save and continue</button>
          </div>
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

// ── Test runner — DAG engine + parallel simulator ──────────────────────
// Pure helpers used by the "Test this flow" feature. They don't talk to
// the network or any production adapter — every "send" is rendered into
// a virtual log shown in the test summary, so a test run can never reach
// a real customer. When/if a real flow runtime exists, the same helpers
// can drive the visualization side while a server-side run does the
// real work.

// Build the DAG topological sort, grouped into BATCHES of nodes that
// can run in parallel. Throws on a cycle so the UI can surface an error
// instead of executing forever.
function buildExecutionBatches(nodes, edges) {
  const incoming = new Map();   // nodeId → number of unresolved upstream edges
  const outgoing = new Map();   // nodeId → list of downstream nodeIds
  for (const n of nodes) {
    incoming.set(n.id, 0);
    outgoing.set(n.id, []);
  }
  for (const e of (edges || [])) {
    if (!incoming.has(e.source) || !incoming.has(e.target)) continue;
    incoming.set(e.target, (incoming.get(e.target) || 0) + 1);
    outgoing.get(e.source).push(e.target);
  }
  const batches = [];
  const remaining = new Set(nodes.map(n => n.id));
  while (remaining.size > 0) {
    const batch = [];
    for (const id of remaining) {
      if ((incoming.get(id) || 0) === 0) batch.push(id);
    }
    if (batch.length === 0) {
      // Nothing has zero-incoming yet but nodes remain → cycle.
      const e = new Error("This flow has a loop in it that would run forever. Find the steps that connect back to themselves and break the loop.");
      e.code = "FLOW_HAS_CYCLE";
      throw e;
    }
    batches.push(batch);
    for (const id of batch) {
      remaining.delete(id);
      for (const downstream of (outgoing.get(id) || [])) {
        incoming.set(downstream, (incoming.get(downstream) || 0) - 1);
      }
    }
  }
  return batches;
}

// Render a template like "Hi {first_name}" against a data object.
// Missing fields render as "[missing:field]" so the test still runs and
// the user sees what's missing. Empty/null templates pass through.
function renderTemplate(template, data) {
  if (template == null) return "";
  return String(template).replace(/\{(\w+)\}/g, (_, key) => {
    if (data && Object.prototype.hasOwnProperty.call(data, key) && data[key] != null && data[key] !== "") {
      return String(data[key]);
    }
    return `[missing:${key}]`;
  });
}

// Scan all nodes for {token} references so we know which input fields
// to surface in the test modal. Always includes the canonical lead
// fields so the user gets a stable form even before they've added any.
function discoverInputFields(nodes) {
  const TOKEN_RE = /\{(\w+)\}/g;
  const found = new Set([
    "first_name", "last_name", "email", "phone",
  ]);
  for (const n of (nodes || [])) {
    const d = n.data || {};
    [d.body, d.subject, d.firstNudgeBody, d.secondNudgeBody].forEach((s) => {
      if (!s) return;
      let m;
      TOKEN_RE.lastIndex = 0;
      while ((m = TOKEN_RE.exec(String(s))) !== null) {
        found.add(m[1]);
      }
    });
  }
  return Array.from(found);
}

const SAMPLE_INPUT_DATA = {
  first_name:     "Sam",
  last_name:      "Tester",
  email:          "sam.tester@example.test",
  phone:          "+15551234567",
  service_type:   "kitchen sink repair",
  appointment_at: "Friday at 10am",
  owner_name:     "Pat (you)",
  review_link:    "g.page/r/your-shop",
};

// Per-activity simulated step time (ms). Tuned so a typical flow runs
// in 5-10 seconds visibly — long enough that the user can read each
// step's transition, short enough that they don't get bored.
const SIM_STEP_MS = {
  wait:        2000,    // compress any wait to 2s
  send_text:   700,
  send_email:  900,
  send_custom_reply: 800,
  reply:       1100,
  branch:      400,
  default:     500,
};

function simStepDurationMs(node) {
  const a = (node && node.data && node.data.activityId) || "";
  const mode = (node && node.data && node.data.defaultMode) || "";
  if (a === "wait" || mode === "wait") return SIM_STEP_MS.wait;
  if (a === "reply") return SIM_STEP_MS.reply;
  if (a === "branch") return SIM_STEP_MS.branch;
  if (a === "send_text") return SIM_STEP_MS.send_text;
  if (a === "send_email") return SIM_STEP_MS.send_email;
  if (a === "send_custom_reply") return SIM_STEP_MS.send_custom_reply;
  return SIM_STEP_MS.default;
}

const _wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Core simulator. Walks the DAG batch-by-batch; nodes within a batch
// fire concurrently via Promise.all. Calls back on each state change so
// the canvas can highlight in real time. `replyChoices` maps Reply node
// IDs to "yes" | "no" | <custom text> per the test modal.
async function runFlowSimulation({
  nodes, edges, inputs, replyChoices,
  onNodeState,         // (nodeId, state, payload) => void
  onEdgeState,         // (edgeId, state) => void   — optional
  onLog,               // (entry) => void
  isCancelled,         // () => boolean
}) {
  const summary = {
    sent:      [],     // {nodeId, channel, to, subject, body}
    waited:    [],     // {nodeId, originalDays}
    skipped:   [],     // {nodeId, reason}
    failed:    [],     // {nodeId, message}
    completed: [],     // {nodeId}
    startedAt: Date.now(),
    endedAt:   0,
    totalMs:   0,
  };
  const failedSet = new Set();    // any node that errored
  const skippedSet = new Set();   // any downstream of failed
  // Build downstream map for fast skip-propagation.
  const downstream = new Map();
  for (const n of nodes) downstream.set(n.id, []);
  for (const e of (edges || [])) {
    if (downstream.has(e.source)) downstream.get(e.source).push(e.target);
  }
  function markDownstreamSkipped(rootId) {
    const stack = [rootId];
    while (stack.length) {
      const cur = stack.pop();
      for (const d of (downstream.get(cur) || [])) {
        if (!skippedSet.has(d) && !failedSet.has(d)) {
          skippedSet.add(d);
          stack.push(d);
        }
      }
    }
  }

  const batches = buildExecutionBatches(nodes, edges);  // throws on cycle
  const nodeById = new Map(nodes.map(n => [n.id, n]));
  // Map of nodeId → list of incoming edge ids (used to flip edge state
  // when downstream node starts / completes).
  const incomingEdges = new Map(nodes.map(n => [n.id, []]));
  for (const e of (edges || [])) {
    if (incomingEdges.has(e.target)) incomingEdges.get(e.target).push(e.id);
  }
  function emitEdge(nodeId, state) {
    if (!onEdgeState) return;
    for (const eid of (incomingEdges.get(nodeId) || [])) onEdgeState(eid, state);
  }

  for (const batch of batches) {
    if (isCancelled && isCancelled()) break;
    await Promise.all(batch.map(async (nodeId) => {
      if (isCancelled && isCancelled()) return;
      // Skip if upstream failed.
      if (skippedSet.has(nodeId)) {
        emitEdge(nodeId, "skipped");
        onNodeState(nodeId, "skipped", { reason: "upstream_failed" });
        summary.skipped.push({ nodeId, reason: "upstream_failed" });
        return;
      }
      const node = nodeById.get(nodeId);
      if (!node) return;
      emitEdge(nodeId, "active");      // marching-ants while node runs
      onNodeState(nodeId, "running");

      try {
        await _wait(simStepDurationMs(node));
        if (isCancelled && isCancelled()) {
          onNodeState(nodeId, "stopped");
          return;
        }
        const data = node.data || {};
        const a = data.activityId || "";
        const isInput = a === "input" || (data.kind === "trigger");

        if (a === "wait") {
          summary.waited.push({ nodeId, originalDays: data.waitDays || 1 });
          onLog({ kind: "waited", nodeId, originalDays: data.waitDays || 1 });
        } else if (a === "reply") {
          // Use the user's choice from the modal.
          const choice = (replyChoices && replyChoices[nodeId]) || "yes";
          if (choice === "no") {
            summary.skipped.push({ nodeId, reason: "no_reply_pretend" });
            // Don't propagate as failure — user explicitly chose this branch.
          }
          onLog({ kind: "reply", nodeId, choice });
          // Custom-fallback branch: if the user picked "send custom", we
          // simulate sending the custom text now.
          if ((data.fallback || "ai") === "custom" && data.body) {
            const channel = inputs.email ? "email" : "sms";
            summary.sent.push({
              nodeId, channel,
              to: channel === "email" ? inputs.email : inputs.phone,
              subject: "(custom reply)",
              body: renderTemplate(data.body, inputs),
              testRouted: true,
            });
          }
        } else if (a === "send_text" ||
                   ((data.mode || data.defaultMode) === "sms" && a !== "notify")) {
          summary.sent.push({
            nodeId, channel: "sms",
            to: inputs.phone || "(no phone in test data)",
            subject: "",
            body: "[TEST] " + renderTemplate(data.body, inputs),
            testRouted: true,
          });
        } else if (a === "send_email" ||
                   ((data.mode || data.defaultMode) === "email" && a !== "notify")) {
          summary.sent.push({
            nodeId, channel: "email",
            to: inputs.email || "(no email in test data)",
            subject: "[TEST] " + renderTemplate(data.subject, inputs),
            body: renderTemplate(data.body, inputs),
            testRouted: true,
          });
        } else if (a === "notify") {
          // Real-send path. The simulator simulates everything else, but
          // a Notify step's whole point is to email the owner — so the
          // test fires actual emails through the user's connected Gmail
          // to whatever extra_emails they configured. SMS and the
          // customer-facing path stay simulated (no real customer
          // contact info in scope during a test).
          // Prefer the new `modes` array (multi-select); fall back to
          // legacy `mode` string for older saved nodes.
          const modeSet = new Set(
            Array.isArray(data.modes) && data.modes.length
              ? data.modes.map(s => String(s).toLowerCase())
              : (() => {
                  const m = (data.mode || data.defaultMode || "both").toLowerCase();
                  if (m === "both") return ["sms", "email"];
                  return [m];
                })()
          );
          const doEmail = modeSet.has("email");
          const doSms   = modeSet.has("sms");
          const doCall  = modeSet.has("call");
          const extraEmails = Array.isArray(data.extra_emails) ? data.extra_emails : [];
          const extraPhones = Array.isArray(data.extra_phones) ? data.extra_phones : [];
          // Call mode: each phone in extra_phones gets a real outbound
          // call via Twilio, same path as the standalone Call activity.
          // With the recipients block removed from Notify Me, extras
          // are usually empty — fall back to the lead's phone (from the
          // test inputs / form submission) so the channel still fires.
          if (doCall) {
            const fromExtras = extraPhones
              .filter(c => !c || c.valid !== false)
              .map(c => ((c && (c.raw || c.display)) || (typeof c === "string" ? c : "")).trim())
              .filter(Boolean);
            const leadPhone = ((inputs && (inputs.phone || inputs.phone_number)) || "").trim();
            const numbers = fromExtras.length ? fromExtras
              : (leadPhone ? [leadPhone] : []);
            if (numbers.length === 0) {
              summary.skipped.push({ nodeId, reason: "no_call_numbers" });
            } else {
              for (const to of numbers) {
                try {
                  const resp = await fetch("/me/call/test-place", {
                    method: "POST",
                    credentials: "same-origin",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      to_phone:       to,
                      // The Call channel uses its own dedicated field
                      // (spoken_message). data.body is the email/text
                      // message — it must NOT fall through here, or
                      // the AI ends up reading the email body on the
                      // phone call.
                      spoken_message: data.spoken_message || data.body || "",
                      voice_tone:     data.voice_tone || "friendly",
                      lead:           inputs || {},
                    }),
                  });
                  const out = resp.ok ? await resp.json() : null;
                  if (out && out.ok) {
                    summary.sent.push({
                      nodeId, channel: "phone", to: out.to || to,
                      from: out.from || "", subject: "", body: "",
                      realSend: true,
                    });
                  } else {
                    summary.sent.push({
                      nodeId, channel: "phone", to,
                      from: (out && out.from) || "", subject: "", body: "",
                      realSend: false,
                      sendError: (out && out.error) || "call_failed",
                    });
                  }
                } catch (err) {
                  summary.sent.push({
                    nodeId, channel: "phone", to, subject: "", body: "",
                    realSend: false,
                    sendError: "call_failed: " + (err.message || err),
                  });
                }
              }
            }
          }
          if (doSms) {
            summary.sent.push({
              nodeId, channel: "sms",
              to: inputs.phone || "(no phone in test data)",
              subject: "",
              body: "[TEST] " + renderTemplate(data.body, inputs),
              testRouted: true,
            });
            for (const c of extraPhones) {
              if (c && c.valid === false) continue;
              const to = (c && (c.raw || c.display)) || (typeof c === "string" ? c : "");
              if (!to) continue;
              summary.sent.push({
                nodeId, channel: "sms", to,
                subject: "", body: "[TEST] " + renderTemplate(data.body, inputs),
                testRouted: false, simulated: true,
              });
            }
          }
          if (doEmail && extraEmails.length > 0) {
            // Hit the backend test-send endpoint so the user's Gmail
            // actually fires real emails to the configured recipients.
            try {
              const resp = await fetch("/me/notify/test-send", {
                method: "POST",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  subject:      data.subject || "",
                  body:         data.body || "",
                  extra_emails: extraEmails,
                  lead:         inputs || {},
                }),
              });
              const out = resp.ok ? await resp.json() : null;
              if (out && Array.isArray(out.results)) {
                for (const r of out.results) {
                  summary.sent.push({
                    nodeId, channel: "email",
                    to:        r.to,
                    subject:   "[TEST] " + renderTemplate(data.subject, inputs),
                    body:      renderTemplate(data.body, inputs),
                    from:      out.from || "",
                    testRouted: false,
                    realSend:  !!r.sent,
                    sendError: r.sent ? "" : (r.error || "send_failed"),
                  });
                }
                if (out.error === "no_email_connection") {
                  summary.failed.push({
                    nodeId,
                    message: "No Gmail connected — open a Notify step and click Connect Gmail.",
                  });
                  failedSet.add(nodeId);
                  emitEdge(nodeId, "failed");
                  onNodeState(nodeId, "failed", {
                    message: "No Gmail connected.",
                  });
                  markDownstreamSkipped(nodeId);
                  return;
                }
              } else {
                summary.failed.push({
                  nodeId, message: "Test send failed (server error).",
                });
              }
            } catch (err) {
              summary.failed.push({
                nodeId, message: "Test send failed: " + (err.message || err),
              });
            }
          } else if (doEmail) {
            // No extras configured — fall back to a simulated owner-facing
            // "would have emailed the lead" line so the canvas still
            // shows what would happen in production.
            summary.sent.push({
              nodeId, channel: "email",
              to: inputs.email || "(no email in test data)",
              subject: "[TEST] " + renderTemplate(data.subject, inputs),
              body: renderTemplate(data.body, inputs),
              testRouted: true,
            });
          }
        } else if (a === "call") {
          // Real-send path. The Call activity dials a phone number
          // from the user's Twilio number and bridges to the AI voice
          // agent. The number comes from the form's phone field by
          // default (call_target="lead"); a "custom" target uses the
          // step's saved phone_number instead. SMS/email simulators
          // stay client-side — only this branch makes a real call.
          const target = (data.call_target || "lead").toLowerCase();
          const toPhone = (target === "custom"
            ? (data.phone_number || "")
            : ((inputs && (inputs.phone || inputs.phone_number)) || "")
          ).trim();
          if (!toPhone) {
            const reason = target === "custom"
              ? "no_phone_number"
              : "lead_has_no_phone";
            summary.skipped.push({ nodeId, reason });
            onLog({ kind: "noop", nodeId, activityId: a, reason });
          } else {
            try {
              // Strip empty values so the AI's lead block only contains
              // fields the user actually filled in. Without this, the
              // canvas was forwarding {first_name: "", service_type: "", ...}
              // for every undiscovered token, which the model treated as
              // "you have no real info" and hallucinated a lead.
              const trimmedLead = {};
              for (const [k, v] of Object.entries(inputs || {})) {
                const s = (v == null ? "" : String(v)).trim();
                if (s) trimmedLead[k] = s;
              }
              // eslint-disable-next-line no-console
              console.log("[fb-test] call lead payload:", trimmedLead);
              const resp = await fetch("/me/call/test-place", {
                method: "POST",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  to_phone:       toPhone,
                  spoken_message: data.spoken_message || "",
                  voice_tone:     data.voice_tone     || "friendly",
                  // Forward the test inputs so the AI on the other end
                  // can answer questions about the lead the call is about.
                  lead:           trimmedLead,
                }),
              });
              const out = resp.ok ? await resp.json() : null;
              if (out && out.ok) {
                summary.sent.push({
                  nodeId, channel: "phone",
                  to:       out.to || toPhone,
                  from:     out.from || "",
                  subject:  "",
                  body:     "",
                  realSend: true,
                });
              } else {
                const err = (out && out.error) || "call_failed";
                summary.sent.push({
                  nodeId, channel: "phone",
                  to:        toPhone,
                  from:      (out && out.from) || "",
                  subject:   "",
                  body:      "",
                  realSend:  false,
                  sendError: err,
                });
                summary.failed.push({
                  nodeId,
                  message: "Couldn't place call: " + err,
                });
                failedSet.add(nodeId);
              }
            } catch (err) {
              summary.failed.push({
                nodeId,
                message: "Couldn't place call: " + (err.message || err),
              });
              failedSet.add(nodeId);
            }
          }
        } else if (a === "branch") {
          // Branch passes through both edges; no message.
          onLog({ kind: "branch", nodeId });
        } else if (isInput) {
          onLog({ kind: "input", nodeId, inputs });
        } else {
          onLog({ kind: "noop", nodeId, activityId: a });
        }

        summary.completed.push({ nodeId });
        emitEdge(nodeId, "completed");
        onNodeState(nodeId, "completed");
      } catch (err) {
        failedSet.add(nodeId);
        summary.failed.push({ nodeId, message: err.message || String(err) });
        emitEdge(nodeId, "failed");
        onNodeState(nodeId, "failed", { message: err.message || String(err) });
        markDownstreamSkipped(nodeId);
      }
    }));
  }

  summary.endedAt = Date.now();
  summary.totalMs = summary.endedAt - summary.startedAt;
  return summary;
}

// ── Test runner UI components ─────────────────────────────────────────
function TestConfigModal({
  inputs, setInputs, replies, setReplies, replyNodes,
  error, onCancel, onRun, onUseSample,
}) {
  const fields = Object.keys(inputs);
  React.useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") onCancel();
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) onRun();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel, onRun]);
  // Track whether the mousedown started on the backdrop. We only close
  // the modal when BOTH mousedown AND mouseup land on the backdrop —
  // a plain onClick fires whenever the common ancestor of down+up is
  // the backdrop, so highlighting text inside the modal and releasing
  // outside used to close it mid-selection. This pattern matches the
  // form-builder modal's fix.
  const downOnBgRef = React.useRef(false);
  return (
    <div
      className="fb-test-modal-bg"
      onMouseDown={(e) => { downOnBgRef.current = (e.target === e.currentTarget); }}
      onMouseUp={(e) => {
        if (e.target === e.currentTarget && downOnBgRef.current) onCancel();
        downOnBgRef.current = false;
      }}
    >
      <div className="fb-test-modal" onClick={(e) => e.stopPropagation()}>
        <h2>Test your flow</h2>
        <p className="fb-test-modal-sub">
          We'll pretend a customer filled out your form and watch your flow run.
          Each step will light up so you can see exactly what's happening.
        </p>
        <div className="fb-test-modal-safe">
          <span aria-hidden="true">🔒</span>
          <span>Real customers won't get any messages. Test sends route to you.</span>
        </div>
        <div className="fb-test-fields">
          {fields.map((f, i) => {
            const isFull = ["service_type", "appointment_at", "review_link"].includes(f);
            const placeholder = SAMPLE_INPUT_DATA[f] != null
              ? `e.g. ${SAMPLE_INPUT_DATA[f]}` : `Your ${f}`;
            const labelText = f.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
            return (
              <label key={f} className={isFull ? "fb-test-fields-full" : ""}>
                {labelText}
                <input
                  type={f === "email" ? "email" : (f === "phone" ? "tel" : "text")}
                  inputMode={f === "phone" ? "tel" : (f === "email" ? "email" : undefined)}
                  value={inputs[f] || ""}
                  onChange={(e) => setInputs({ ...inputs, [f]: e.target.value })}
                  placeholder={placeholder}
                  autoFocus={i === 0}
                />
              </label>
            );
          })}
        </div>
        <div className="fb-test-sample-row">
          <button type="button" className="fb-test-sample-btn" onClick={onUseSample}>
            Use sample data
          </button>
        </div>

        {replyNodes && replyNodes.length > 0 && (
          <div className="fb-test-reply-section">
            <h3>What should happen at each "Reply" step?</h3>
            {replyNodes.map((rn) => (
              <div key={rn.id} className="fb-test-reply-row">
                <span>{rn.data.title || "Reply"}:</span>
                <button
                  type="button"
                  className={`fb-test-reply-pill ${(replies[rn.id] || "yes") === "yes" ? "is-active" : ""}`}
                  onClick={() => setReplies({ ...replies, [rn.id]: "yes" })}
                >Pretend they replied</button>
                <button
                  type="button"
                  className={`fb-test-reply-pill ${replies[rn.id] === "no" ? "is-active" : ""}`}
                  onClick={() => setReplies({ ...replies, [rn.id]: "no" })}
                >Pretend they didn't</button>
              </div>
            ))}
          </div>
        )}

        {error && (
          <div className="fb-test-error" role="alert">
            <strong>Can't run this test:</strong> {error}
          </div>
        )}

        <div className="fb-test-actions">
          <button type="button" className="fb-test-btn-cancel" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="fb-test-btn-run" onClick={onRun}>
            ▶ Run test
          </button>
        </div>
      </div>
    </div>
  );
}

function TestSummaryCard({ summary, error, onClose, onRunAgain, onSeeFailedStep }) {
  // Group sent rows by channel + recipient for compact display.
  const sentByChannel = {};
  let realSendFrom = "";
  if (summary && summary.sent) {
    for (const s of summary.sent) {
      const k = `${s.channel}:${s.to}`;
      sentByChannel[k] = sentByChannel[k] || {
        channel: s.channel, to: s.to, count: 0,
        anyReal: false, anyError: "",
      };
      sentByChannel[k].count++;
      if (s.realSend) sentByChannel[k].anyReal = true;
      if (s.sendError && !sentByChannel[k].anyError) sentByChannel[k].anyError = s.sendError;
      if (s.from && !realSendFrom) realSendFrom = s.from;
    }
  }
  const sentRows = Object.values(sentByChannel);
  const isFailed = !!error || (summary && summary.failed && summary.failed.length > 0);
  const completedCount = summary ? summary.completed.length : 0;
  const skippedCount   = summary ? summary.skipped.length : 0;
  const failedCount    = summary ? summary.failed.length : 0;
  const waitedCount    = summary ? summary.waited.length : 0;

  return (
    <div className="fb-test-summary" role="status" aria-live="polite">
      <div className={`fb-test-summary-h ${isFailed ? "is-failed" : ""}`}>
        <h3>{isFailed ? "Test had a problem" : "Test complete"}</h3>
        <button
          type="button"
          className="fb-test-summary-x"
          onClick={onClose}
          aria-label="Dismiss"
        >✕</button>
      </div>

      {error && (
        <div className="fb-test-summary-stat" style={{ color: "#991b1b" }}>
          {error}
        </div>
      )}

      {summary && (
        <>
          <div className="fb-test-summary-stat">
            <strong>✓ {completedCount}</strong> step{completedCount === 1 ? "" : "s"} ran
          </div>
          {failedCount > 0 && (
            <div className="fb-test-summary-stat" style={{ color: "#991b1b" }}>
              <strong>✕ {failedCount}</strong> failed
            </div>
          )}
          {skippedCount > 0 && (
            <div className="fb-test-summary-stat">
              <strong>— {skippedCount}</strong> skipped
            </div>
          )}
          {waitedCount > 0 && (
            <div className="fb-test-summary-stat">
              <strong>⏱ {waitedCount}</strong> wait{waitedCount === 1 ? "" : "s"} simulated (compressed to 2 s each)
            </div>
          )}

          {sentRows.length > 0 && (
            <div className="fb-test-sent-list">
              <div className="fb-test-summary-stat" style={{ marginBottom: 6 }}>
                <strong>Test messages:</strong>
                {realSendFrom && (
                  <span style={{ marginLeft: 6, color: "#0a8a3a", fontWeight: 600 }}>
                    real emails sent from {realSendFrom}
                  </span>
                )}
              </div>
              {sentRows.map((r, i) => (
                <div key={i} className="fb-test-sent-row">
                  {r.channel === "email" ? "📧" : r.channel === "sms" ? "💬" : "📞"}{" "}
                  {r.to}{" "}
                  <span style={{ color: "#94a3b8" }}>· {r.count} message{r.count === 1 ? "" : "s"}</span>
                  {r.anyReal && !r.anyError && (
                    <span style={{ marginLeft: 8, color: "#0a8a3a", fontWeight: 700, fontSize: 11 }}>
                      ✓ SENT
                    </span>
                  )}
                  {r.anyError && (
                    <span style={{ marginLeft: 8, color: "#991b1b", fontWeight: 700, fontSize: 11 }}>
                      ✕ {r.anyError.slice(0, 60)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="fb-test-summary-stat" style={{ marginTop: 14, fontSize: 12.5, color: "#94a3b8" }}>
            Took {(summary.totalMs / 1000).toFixed(1)}s
            {waitedCount > 0 && " (production would take longer due to wait steps)"}
          </div>
        </>
      )}

      <div className="fb-test-summary-foot">
        {failedCount > 0 && onSeeFailedStep && (
          <button type="button" onClick={onSeeFailedStep}>
            See the failed step
          </button>
        )}
        <button type="button" onClick={onClose}>Close</button>
        <button type="button" className="is-primary" onClick={onRunAgain}>
          ▶ Run again
        </button>
      </div>
    </div>
  );
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

// ── Reply-specific bot fit guidance ─────────────────────────────────
// The owner picks one of their existing bots to draft replies. We
// reuse the AI Agent flow-block job catalog (_aiAgentCategorize) so
// fit guidance is consistent across the two surfaces — but the GOOD
// vs WARN verdict is recomputed for the reply use case (a Lead
// Qualifier is "great for AI Agent" but "warn" for Reply because it
// makes routing decisions, not friendly replies).
const _REPLY_FIT = {
  conversationalist: { fit: "good", label: "Great for replying to customer messages" },
  message_writer:    { fit: "good", label: "Great for replying to customer messages" },
  widget:            { fit: "good", label: "Great for replying to customer messages" },
  qualifier:         { fit: "warn", label: "Better used for triaging, not replying"  },
  extractor:         { fit: "warn", label: "Better used for pulling structured info" },
  internal:          { fit: "warn", label: "Built for your team, not customers"      },
  custom:            { fit: "ok",   label: "Custom bot — review before relying on it" },
};

// Bot picker for the Reply drawer. Native <select> dropdown for
// "Which bot replies?" + a description block for the picked bot's
// fit, plus a stacked approval-mode picker below ("Send
// automatically" / "Show me the draft first"). Replaces an earlier
// carousel that the user found heavier than necessary — dropdown
// is faster to scan when you have more than 2-3 bots.
function BotReplyCarousel({
  bots, botsLoading, replyAgentId, replyApproval,
  onPickAgent, setReplyApproval,
}) {
  if (botsLoading) {
    return (
      <div className="fb-replywidget-section">
        <label className="fb-drawer-l">Which bot replies?</label>
        <div style={{ color: "#6b7280", fontSize: 12.5, padding: "4px 0" }}>
          Loading your bots…
        </div>
      </div>
    );
  }
  if (!bots || !bots.length) {
    return (
      <div className="fb-replywidget-section">
        <label className="fb-drawer-l" style={{
          display: "flex", alignItems: "baseline",
          justifyContent: "space-between", gap: 8,
        }}>
          <span>Which bot replies?</span>
          <a href="/dashboard#agents" target="_top"
             style={{ color: "#185fa5", fontWeight: 600, fontSize: 11.5 }}>
            + Create a new bot
          </a>
        </label>
        <div style={{
          padding: 10, border: "1px solid #e5e7eb", borderRadius: 8,
          background: "#fff", fontSize: 12.5, color: "#374151",
        }}>
          You haven't created any bots yet.{" "}
          <a href="/dashboard#agents" target="_top"
             style={{ color: "#185fa5", fontWeight: 600 }}>+ Create a bot</a>
        </div>
      </div>
    );
  }

  const pickedBot = bots.find(b => b.id === replyAgentId) || null;
  const pickedFit = pickedBot
    ? (_REPLY_FIT[_aiAgentCategorize(pickedBot)] || _REPLY_FIT.custom)
    : null;
  const pickedFitDot = pickedFit
    ? (pickedFit.fit === "good" ? "#16a34a"
       : pickedFit.fit === "warn" ? "#f59e0b" : "#94a3b8")
    : "#94a3b8";

  const handleSelectChange = (e) => {
    const next = bots.find(b => b.id === e.target.value);
    if (next && onPickAgent) onPickAgent(next);
  };

  return (
    <div className="fb-replywidget-section">
      <label className="fb-drawer-l" style={{
        display: "flex", alignItems: "baseline",
        justifyContent: "space-between", gap: 8,
      }}>
        <span>Which bot replies?</span>
        <a href="/dashboard#agents" target="_top"
           style={{ color: "#185fa5", fontWeight: 600, fontSize: 11.5 }}>
          + Create a new bot
        </a>
      </label>

      {/* Native <select> dropdown. Easier to scan than the carousel
          once a user has more than 2-3 bots. We use the native
          element so the OS dropdown handles keyboard nav,
          accessibility, mobile interaction, etc., for free. */}
      <div style={{ position: "relative" }}>
        <select
          value={replyAgentId || ""}
          onChange={handleSelectChange}
          style={{
            width: "100%",
            padding: "10px 36px 10px 12px",
            border: "1px solid #cbd5e1",
            borderRadius: 8,
            background: "#fff",
            font: "600 13px inherit",
            color: "#0f172a",
            cursor: "pointer",
            appearance: "none",
            WebkitAppearance: "none",
          }}
        >
          {!replyAgentId && (
            <option value="" disabled>Pick a bot…</option>
          )}
          {bots.map(b => (
            <option key={b.id} value={b.id}>{b.name || "Untitled bot"}</option>
          ))}
        </select>
        {/* Chevron — pure decoration, native select handles the click. */}
        <span aria-hidden="true" style={{
          position: "absolute", right: 12, top: "50%",
          transform: "translateY(-50%)",
          pointerEvents: "none",
          color: "#64748b", fontSize: 11,
        }}>▾</span>
      </div>

      {pickedBot && pickedFit && (
        <div style={{
          marginTop: 8,
          padding: "8px 10px",
          background: "#f8fafc",
          border: "1px solid #e5e7eb",
          borderRadius: 8,
          fontSize: 12.5, color: "#475569",
          display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
        }}>
          <span aria-hidden="true" style={{
            width: 8, height: 8, borderRadius: 999, background: pickedFitDot,
            flexShrink: 0,
          }} />
          <span>
            <strong style={{ color: "#0f172a" }}>{pickedBot.name}</strong>
            {" — "}{pickedFit.label.toLowerCase()}.
          </span>
          <a href={`/dashboard#agents/${encodeURIComponent(pickedBot.id)}`}
             target="_top"
             style={{ color: "#185fa5", fontWeight: 600, marginLeft: "auto" }}>
            View setup →
          </a>
        </div>
      )}

      {/* Approval mode picker — only shown once a bot is selected,
          since the approval question only makes sense in that
          context. */}
      {/* "Send automatically vs Show me the draft first" picker
          removed — AI Drafts feature has been retired. Every AI
          reply now auto-sends. */}
    </div>
  );
}

function ReplyWidgetEditor({
  fallback, setFallback,
  body, setBody, taRef, onActiveField,
  globalAiMode, globalCadence,
  replyAgentId, replyAgentName, replyAgentJob, onPickAgent,
  replyApproval, setReplyApproval,
  replyChannel, setReplyChannel,
}) {
  const aiOff = globalAiMode === "i_respond";

  // Migrate legacy saved replyChannel values ("auto" / "sms") to
  // "email" so the picker UI we removed doesn't leave behind a
  // stale value that the runtime would still try to honor.
  React.useEffect(() => {
    if (replyChannel !== "email" && setReplyChannel) {
      setReplyChannel("email");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replyChannel]);

  // Owner's bots — same /me/agents endpoint the AI Agent flow-block
  // picker uses, so the two surfaces stay in sync.
  const [botsLoading, setBotsLoading] = React.useState(false);
  const [bots, setBots] = React.useState([]);
  React.useEffect(() => {
    if (fallback !== "ai") return;
    let cancelled = false;
    setBotsLoading(true);
    fetch("/me/agents", { credentials: "same-origin" })
      .then(r => r.ok ? r.json() : { agents: [] })
      .then(d => {
        if (cancelled) return;
        setBots(d.agents || []);
        setBotsLoading(false);
      })
      .catch(() => { if (!cancelled) { setBots([]); setBotsLoading(false); } });
    return () => { cancelled = true; };
  }, [fallback]);

  const pickedBot = bots.find(b => b.id === replyAgentId) || null;

  // If global AI is Off, the "AI replies" choice is unrunnable. Auto-
  // flip to "Send this" so the user lands on a valid default. Runs both
  // on initial policy load AND on any live change (top-right → Off).
  React.useEffect(() => {
    if (aiOff && fallback === "ai") setFallback("custom");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiOff]);

  // Inline AI tester — same /me/ai/test-reply endpoint the AI Settings
  // page uses, just rendered in the drawer so users can sanity-check
  // without leaving the flow. Phase 2/3: now passes channel + agent_id
  // + customer context so the test reflects what the runtime will see.
  const [testInput,   setTestInput]   = React.useState("");
  const [testChannel, setTestChannel] = React.useState("email"); // email | sms | missed_call
  const [testSource,  setTestSource]  = React.useState("synthetic"); // synthetic | real
  const [pastMsgs,    setPastMsgs]    = React.useState([]);
  const [pastLoading, setPastLoading] = React.useState(false);
  const [testReply, setTestReply] = React.useState({
    state: "empty",
    text: "Reply shows here. Nothing gets sent.",
  });
  const [testing, setTesting] = React.useState(false);

  // Phase 3: pull a handful of recent customer messages so the owner
  // can test against real-world phrasing instead of synthetic prompts.
  React.useEffect(() => {
    if (testSource !== "real" || pastMsgs.length || pastLoading) return;
    setPastLoading(true);
    fetch("/me/leads?limit=10", { credentials: "same-origin" })
      .then(r => r.ok ? r.json() : { leads: [] })
      .then(d => {
        const out = [];
        (d.leads || d.values || []).slice(0, 10).forEach(l => {
          const msg = (l.message || l.last_message || l.notes || "").trim();
          if (!msg) return;
          out.push({
            id: l.id || l.lead_id || (l.email || "") + ":" + (l.created_at || ""),
            name: l.first_name || l.name || l.email || "Customer",
            channel: (l.source || "").toLowerCase().indexOf("sms") >= 0 ? "sms"
                    : (l.source || "").toLowerCase().indexOf("call") >= 0 ? "missed_call"
                    : "email",
            message: msg,
            when: l.created_at || l.captured_at || "",
          });
        });
        setPastMsgs(out);
        setPastLoading(false);
      })
      .catch(() => { setPastMsgs([]); setPastLoading(false); });
  }, [testSource, pastMsgs.length, pastLoading]);

  async function runTest() {
    const msg = (testInput || "").trim();
    if (!msg) return;
    setTesting(true);
    setTestReply({ state: "loading", text: "Generating…" });
    try {
      const r = await fetch("/me/ai/test-reply", {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message:  msg,
          channel:  testChannel,
          agent_id: replyAgentId || "",
        }),
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

  // Compact tab styling — replaces the previous two big radio cards.
  // Sized to a single 32px row so the picker block fits above the fold.
  const tabBtn = (id, label, opts) => {
    const isOn = fallback === id;
    const isDis = opts && opts.disabled;
    return (
      <button
        key={id}
        type="button"
        disabled={isDis}
        onClick={() => { if (!isDis) setFallback(id); }}
        style={{
          padding: "7px 14px", border: "0",
          borderBottom: "2px solid " + (isOn ? "#0f172a" : "transparent"),
          background: "transparent",
          color: isDis ? "#cbd5e1" : (isOn ? "#0f172a" : "#6b7280"),
          font: "600 13px inherit", cursor: isDis ? "not-allowed" : "pointer",
          transition: "color .12s, border-color .12s",
        }}
      >
        {label}
      </button>
    );
  };

  const channelTabBtn = (val, label) => {
    const active = (replyChannel || "auto") === val;
    return (
      <button
        type="button"
        onClick={() => setReplyChannel && setReplyChannel(val)}
        style={{
          padding: "6px 12px", fontSize: 12.5, fontWeight: 600,
          border: "1px solid " + (active ? "#0f172a" : "#e5e7eb"),
          borderRadius: 6, background: active ? "#0f172a" : "#fff",
          color: active ? "#fff" : "#334155", cursor: "pointer",
          font: "inherit",
        }}
      >{label}</button>
    );
  };

  return (
    <div>
      {/* Reply channel is locked to email — the SMS/Auto options
          were removed because the runtime only fully supports the
          email path today. Migration to "email" happens via the
          useEffect at the top of ReplyWidgetEditor. */}
      <div className="fb-replywidget-section" style={{ marginTop: 0 }}>
        <label className="fb-drawer-l">Reply on</label>
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          padding: "5px 12px", borderRadius: 999,
          background: "#eef2ff", color: "#3730a3",
          fontSize: 12, fontWeight: 600,
        }}>✉️ Email</div>
      </div>

      {/* "If I don't reply" — compact tab strip across the top. */}
      <div className="fb-replywidget-section">
        <label className="fb-drawer-l">If I don't reply</label>
        <div style={{
          display: "flex", gap: 4, borderBottom: "1px solid #e5e7eb",
          marginBottom: 4,
        }}>
          {tabBtn("ai",
            (replyAgentName ? `🤖 ${replyAgentName} replies` : "🤖 My bot replies")
              + (aiOff ? " (off)" : ""),
            { disabled: aiOff })}
          {tabBtn("custom", "📝 Send a saved message")}
        </div>
      </div>

      {/* Compact agent picker — single 2-col grid of bot pills + a
          one-line "How {bot} replies" caption + a single-row approval
          toggle. Tuned to fit the whole picker block in <300px so the
          drawer doesn't need to scroll on a typical 768-tall viewport. */}
      {fallback === "ai" && !aiOff && (
        <BotReplyCarousel
          bots={bots}
          botsLoading={botsLoading}
          replyAgentId={replyAgentId}
          replyApproval={replyApproval}
          onPickAgent={onPickAgent}
          setReplyApproval={setReplyApproval}
        />
      )}

      {/* Inline "Try it" AI tester removed (Sample/Real toggle,
          channel chips, message input, preview). The dashboard's
          Try-it-out widget at /dashboard is the canonical place to
          test agent replies — duplicating it inline added noise. */}

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
                    title={`Adds ${t.token}\n` +
                                `Availability — form: ${_availabilityForChannel(t.token, "form")}` +
                                `  phone: ${_availabilityForChannel(t.token, "phone")}` +
                                `  email: ${_availabilityForChannel(t.token, "email")}` +
                                `  multi: ${_availabilityForChannel(t.token, "multiple")}`}><span style={{
                                  display: "inline-block",
                                  width: 6, height: 6, borderRadius: 999,
                                  marginRight: 6, verticalAlign: "middle",
                                  background: (() => {
                                    const codes = ["form","phone","email","multiple"]
                                      .map(ch => _availabilityForChannel(t.token, ch));
                                    if (codes.every(c => c === "✓")) return "#16a34a";
                                    if (codes.some(c => c === "-")) return "#f59e0b";
                                    return "#94a3b8";
                                  })(),
                                }} />{t.label}</button>
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

      {/* "AI mode / Always reply right away / Change in top-right ↗"
          read-only summary removed — the global AI-mode toggle is the
          source of truth and shouldn't be restated inside every Reply
          drawer. */}
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
    cursor: text;
  }
  /* Inline rename input. Looks like the static title until focused —
     no border, transparent bg — and only reveals an outline on focus
     so the editing state is unmistakable. */
  .fb-card-title-edit {
    width: 100%;
    border: 1px solid transparent;
    background: transparent;
    padding: 1px 4px; margin: -2px -4px 1px;
    font-family: inherit;
    border-radius: 4px;
    box-sizing: border-box;
    outline: none;
  }
  .fb-card-title-edit:focus {
    border-color: var(--kind-deep, #185fa5);
    background: #fff;
    box-shadow: 0 0 0 2px rgba(24,95,165,.12);
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
     Codified so future chrome doesn't pick arbitrary values.
        20  persistent UI (save indicator, intro strip)
        25  ? help icon (bottom-left)
        30  back pill, popovers, dropdowns
        40  modals (chooser, template picker, editor panel backdrop)
        45  tour panel (above modals so it can guide through them)
        50  toasts
        51  Test this flow CTA (above tour overlay)
     When the chooser modal opens (.fb-canvas.is-modal-open), persistent
     chrome fades out so it can't visually intrude. The editor panel
     uses a different class (.is-drawer-open) and instead of fading
     chrome out, the right-side corners reflow leftward by --fb-panel-w
     so the chrome stays visible inside the narrowed canvas. */
  .fb-canvas .fb-tour-panel {
    transition: opacity .15s ease, visibility 0s linear .15s;
  }
  .fb-canvas.is-modal-open .fb-tour-panel:not([data-sub="1"]),
  .fb-canvas.is-modal-open .fb-save,
  .fb-canvas.is-modal-open .fb-tour-replay,
  .fb-canvas.is-modal-open .fb-test-btn,
  .fb-canvas.is-modal-open .fb-backpill {
    opacity: 0;
    pointer-events: none;
    visibility: hidden;
    transition: opacity .15s ease, visibility 0s linear .15s;
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

  /* ── Canvas chrome corners ──────────────────────────────────────────
     Four corners of the canvas. Each chrome element owns exactly one:

       Top-left     → BackPill (one of two: My Flows / form)
       Top-right    → Test this flow + Saved indicator (stacked)
       Bottom-left  → ? help icon (TourReplayButton)
       Bottom-right → React Flow zoom controls

     All chrome z-indexes sit BELOW the editor panel's z-index (11),
     so when a panel or modal slides in, the chrome stays anchored to
     its corner and the panel covers it. No reflow, no overlap on top
     of the panel. */

  /* Top-right secondary — Saved indicator stacked under the Test btn. */
  .fb-save {
    position: absolute; top: 64px; right: 16px;
    display: inline-flex; align-items: center; gap: 6px;
    padding: 6px 12px;
    background: rgba(255,255,255,.92);
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

  /* ── Test-this-flow runner UI ─────────────────────────────────────── */
  .fb-test-btn {
    position: absolute; top: 16px; right: 16px;
    /* Below the editor panel's z-index (11) so the panel covers the
       button when open. We deliberately don't reflow the button — it
       just gets tucked behind the panel. */
    z-index: 8;
    transition: transform .14s ease, box-shadow .14s ease, background .14s ease;
    padding: 9px 18px;
    font-size: 14px; font-weight: 700;
    border-radius: 999px;
    background: linear-gradient(180deg, #0f172a 0%, #1e293b 100%);
    color: #fff; border: 1.5px solid #0f172a;
    cursor: pointer; font-family: inherit;
    display: inline-flex; align-items: center; gap: 8px;
    box-shadow: 0 4px 14px rgba(15,23,42,0.20),
                0 1px 2px rgba(15,23,42,0.08);
  }
  .fb-test-btn:hover {
    transform: translateY(-1px);
    box-shadow: 0 6px 18px rgba(15,23,42,0.26),
                0 2px 4px rgba(15,23,42,0.10);
  }
  .fb-test-btn.is-running {
    background: linear-gradient(180deg, #b91c1c 0%, #991b1b 100%);
    border-color: #991b1b;
  }
  .fb-test-btn-ico { font-size: 12px; line-height: 1; }
  /* Top-left — back pill (one of two: My Flows or Done? Back to your
     form). Mutually exclusive — only one pill ever renders at a time. */
  .fb-backpill {
    position: absolute; top: 16px; left: 16px;
    /* Below the editor panel's z-index (11) so the panel covers it. */
    z-index: 8;
    display: inline-flex; align-items: center; gap: 6px;
    padding: 8px 14px;
    font: 600 13px inherit;
    border-radius: 999px;
    cursor: pointer;
    text-decoration: none;
    box-shadow: 0 3px 10px rgba(20,40,80,.10);
    transition: transform .12s ease, box-shadow .12s ease, background .12s ease;
  }
  .fb-backpill:hover {
    transform: translateY(-1px);
    box-shadow: 0 6px 16px rgba(20,40,80,.16);
  }
  .fb-backpill.is-from-flows {
    background: #fff; border: 1px solid #cdd7e3; color: #185fa5;
  }
  .fb-backpill.is-from-flows:hover { background: #f5f9fd; }

  /* Bottom-left — help / tour replay icon. Round 36 px button. */
  .fb-tour-replay {
    position: absolute; bottom: 16px; left: 16px;
    /* Below the panel z-index (11) — covered when panel slides in. */
    z-index: 8;
    width: 36px; height: 36px;
    border-radius: 999px;
    background: #fff;
    border: 1.5px solid #cdd7e3;
    color: #185fa5;
    cursor: pointer;
    font-weight: 700; font-size: 18px; line-height: 1;
    display: flex; align-items: center; justify-content: center;
    box-shadow: 0 3px 10px rgba(20,40,80,.10);
    transition: transform .12s ease, box-shadow .12s ease;
    padding: 0;
  }
  .fb-tour-replay:hover {
    transform: scale(1.08);
    box-shadow: 0 6px 18px rgba(20,40,80,.16);
  }

  /* Bottom-right — React Flow's built-in zoom controls. Anchor in the
     corner. The control's own z-index is below the panel's so the
     panel naturally covers it without any reflow logic. */
  .fb-canvas .react-flow__controls {
    z-index: 4;
  }

  /* Node highlighting during a test. Set by mutating node.data.runState
     so the React Flow re-render picks it up and the ActivityCard tags
     itself with .fb-card-run-running, -completed, -failed, -skipped. */
  .fb-card-run {
    transition: box-shadow .2s ease, opacity .2s ease, background .2s ease;
  }
  .fb-card-run-running {
    box-shadow:
      0 0 0 0 rgba(34,197,94,.55),
      0 8px 24px rgba(34,197,94,.18);
    animation: fbCardPulse 1.1s ease-in-out infinite;
    background: linear-gradient(180deg, rgba(220,252,231,.45) 0%, rgba(220,252,231,.20) 100%) !important;
  }
  @keyframes fbCardPulse {
    0%   { box-shadow: 0 0 0 0 rgba(34,197,94,.55), 0 8px 24px rgba(34,197,94,.18); }
    70%  { box-shadow: 0 0 0 10px rgba(34,197,94,0),  0 8px 24px rgba(34,197,94,.18); }
    100% { box-shadow: 0 0 0 0 rgba(34,197,94,0),     0 8px 24px rgba(34,197,94,.18); }
  }
  .fb-card-run-completed {
    box-shadow: inset 4px 0 0 #16a34a, 0 1px 3px rgba(22,163,74,.18);
    background: linear-gradient(180deg, rgba(220,252,231,.30) 0%, rgba(255,255,255,1) 100%) !important;
  }
  .fb-card-run-failed {
    box-shadow: inset 4px 0 0 #dc2626, 0 1px 3px rgba(220,38,38,.18);
    background: linear-gradient(180deg, rgba(254,226,226,.30) 0%, rgba(255,255,255,1) 100%) !important;
  }
  .fb-card-run-skipped {
    opacity: 0.55;
    border-style: dashed !important;
    background: repeating-linear-gradient(
      45deg,
      rgba(148,163,184,0.04) 0 6px,
      transparent 6px 12px
    ) !important;
  }
  .fb-card-run-stopped {
    opacity: 0.6;
    box-shadow: inset 4px 0 0 #94a3b8;
  }

  /* Status badge dot in the top-right of the card */
  .fb-card-run-badge {
    position: absolute; top: -10px; right: -10px;
    width: 26px; height: 26px;
    display: inline-flex; align-items: center; justify-content: center;
    border-radius: 50%;
    color: #fff; font-size: 13px; font-weight: 700;
    box-shadow: 0 4px 10px rgba(15,23,42,.18);
    z-index: 5;
    animation: fbBadgePop .26s cubic-bezier(.2,.8,.2,1) both;
  }
  @keyframes fbBadgePop {
    from { transform: scale(.5); opacity: 0; }
    to   { transform: scale(1);  opacity: 1; }
  }
  .fb-card-run-badge-running   { background: #16a34a; }
  .fb-card-run-badge-running   { animation: fbBadgePop .26s ease-out, fbBadgeSpin 1.2s linear infinite; }
  @keyframes fbBadgeSpin { to { transform: rotate(360deg); } }
  .fb-card-run-badge-completed { background: #16a34a; }
  .fb-card-run-badge-failed    { background: #dc2626; }
  .fb-card-run-badge-skipped   { background: #94a3b8; font-size: 14px; }
  .fb-card-run-badge-stopped   { background: #475569; }

  /* Reduced motion: skip the pulses and badge spins. */
  @media (prefers-reduced-motion: reduce) {
    .fb-card-run-running { animation: none; }
    .fb-card-run-badge-running { animation: fbBadgePop .26s ease-out; }
    .fb-card-run-badge { animation: none; }
  }

  /* Edge highlighting during a test — overlay path on top of the
     BaseEdge so we don't fight React Flow's default styling. */
  .fb-edge-run {
    pointer-events: none;
    fill: none;
  }
  .fb-edge-run-active {
    stroke: #16a34a;
    stroke-width: 3;
    stroke-linecap: round;
    stroke-dasharray: 6 8;
    animation: fbEdgeFlow .7s linear infinite;
    filter: drop-shadow(0 0 4px rgba(22,163,74,.45));
  }
  @keyframes fbEdgeFlow {
    to { stroke-dashoffset: -28; }
  }
  .fb-edge-run-completed {
    stroke: #16a34a;
    stroke-width: 2;
    opacity: 0.55;
  }
  .fb-edge-run-failed {
    stroke: #dc2626;
    stroke-width: 2;
    stroke-dasharray: 4 6;
    opacity: 0.7;
  }
  .fb-edge-run-skipped {
    stroke: #cbd5e1;
    stroke-width: 1.5;
    stroke-dasharray: 3 6;
  }
  @media (prefers-reduced-motion: reduce) {
    .fb-edge-run-active { animation: none; }
  }

  /* Screen-reader-only utility for ARIA live announcements during tests */
  .fb-sr-only {
    position: absolute !important;
    width: 1px; height: 1px;
    padding: 0; margin: -1px;
    overflow: hidden;
    clip: rect(0,0,0,0);
    white-space: nowrap;
    border: 0;
  }

  /* ── Test config modal ───────────────────────────────────────────── */
  .fb-test-modal-bg {
    position: fixed; inset: 0; z-index: 200;
    background: rgba(15,23,42,.45);
    display: grid; place-items: center;
    padding: 24px;
    animation: fbFade .18s ease-out;
  }
  .fb-test-modal {
    width: 540px; max-width: 100%;
    background: #fff; border-radius: 18px;
    box-shadow: 0 28px 80px rgba(15,23,42,.30);
    padding: 32px 36px 28px;
    max-height: calc(100vh - 48px); overflow-y: auto;
    animation: fbScaleIn .2s cubic-bezier(.2,.8,.2,1);
  }
  @keyframes fbScaleIn { from { transform: scale(.96); opacity: 0; } to { transform: scale(1); opacity: 1; } }
  .fb-test-modal h2 {
    font-size: 22px; font-weight: 700; color: #0a0a0a;
    margin: 0 0 8px; letter-spacing: -0.01em;
  }
  .fb-test-modal-sub {
    font-size: 14.5px; color: #64748b; line-height: 1.5;
    margin: 0 0 24px;
  }
  .fb-test-modal-safe {
    background: linear-gradient(180deg, #f0fdf4 0%, #dcfce7 100%);
    border: 1.5px solid #bbf7d0; border-radius: 12px;
    padding: 12px 14px; margin: 0 0 22px;
    font-size: 13.5px; color: #166534; font-weight: 600;
    display: flex; align-items: center; gap: 8px;
  }
  .fb-test-fields {
    display: grid; grid-template-columns: 1fr 1fr; gap: 12px;
  }
  @media (max-width: 540px) { .fb-test-fields { grid-template-columns: 1fr; } }
  .fb-test-fields label {
    display: flex; flex-direction: column; gap: 5px;
    font-size: 12.5px; font-weight: 600; color: #475569;
    letter-spacing: 0.01em;
  }
  .fb-test-fields .fb-test-fields-full { grid-column: 1 / -1; }
  .fb-test-fields input {
    padding: 11px 13px; font-size: 14.5px;
    border: 1.5px solid #e5e7eb; border-radius: 10px;
    font-family: inherit; color: #0a0a0a;
    background: #fff;
    transition: border-color .14s ease, box-shadow .14s ease;
  }
  .fb-test-fields input:focus {
    outline: 0; border-color: #2563eb;
    box-shadow: 0 0 0 3px rgba(37,99,235,.12);
  }
  .fb-test-sample-row {
    margin-top: 14px;
    display: flex; justify-content: flex-end;
  }
  .fb-test-sample-btn {
    padding: 7px 14px; font-size: 13px; font-weight: 600;
    background: #fff; color: #0f172a;
    border: 1.5px solid #e5e7eb; border-radius: 999px;
    cursor: pointer; font-family: inherit;
  }
  .fb-test-sample-btn:hover { background: #f8fafc; border-color: #cbd5e1; }
  .fb-test-reply-section {
    margin-top: 22px; padding-top: 20px;
    border-top: 1px solid #e5e7eb;
  }
  .fb-test-reply-section h3 {
    font-size: 14px; font-weight: 700; color: #0a0a0a;
    margin: 0 0 10px;
  }
  .fb-test-reply-row {
    display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 8px;
  }
  .fb-test-reply-row > span {
    font-size: 13px; color: #475569; padding: 6px 0;
    margin-right: auto;
  }
  .fb-test-reply-pill {
    padding: 6px 12px; font-size: 12.5px; font-weight: 600;
    border: 1.5px solid #e5e7eb; border-radius: 999px;
    background: #fff; color: #475569; cursor: pointer; font-family: inherit;
  }
  .fb-test-reply-pill.is-active {
    background: #0f172a; color: #fff; border-color: #0f172a;
  }
  .fb-test-actions {
    display: flex; gap: 10px; justify-content: flex-end;
    margin-top: 26px;
  }
  .fb-test-btn-cancel {
    padding: 10px 18px; font-size: 14px; font-weight: 600;
    background: #fff; color: #0a0a0a;
    border: 1.5px solid #e5e7eb; border-radius: 10px;
    cursor: pointer; font-family: inherit;
  }
  .fb-test-btn-run {
    padding: 10px 22px; font-size: 14.5px; font-weight: 700;
    background: linear-gradient(180deg, #16a34a 0%, #15803d 100%);
    color: #fff; border: 1.5px solid #15803d; border-radius: 10px;
    cursor: pointer; font-family: inherit;
    box-shadow: 0 4px 12px rgba(22,163,74,.24);
  }
  .fb-test-btn-run:hover { transform: translateY(-1px); }
  .fb-test-error {
    margin-top: 16px; padding: 12px 14px;
    background: linear-gradient(180deg, #fff7ed 0%, #ffedd5 100%);
    border: 1.5px solid #fdba74; border-radius: 10px;
    font-size: 13.5px; color: #9a3412; line-height: 1.5;
  }

  /* ── Test summary card (shows after a run completes) ─────────────── */
  .fb-test-summary {
    position: absolute; top: 80px; right: 16px;
    z-index: 49;
    width: 380px; max-width: calc(100vw - 32px);
    background: #fff; border: 1px solid #e5e7eb;
    border-radius: 16px;
    box-shadow: 0 20px 50px rgba(15,23,42,.18);
    padding: 22px 24px 20px;
    animation: fbSlideIn .26s cubic-bezier(.2,.8,.2,1);
  }
  @keyframes fbSlideIn { from { transform: translateY(-10px); opacity: 0; } to { transform: none; opacity: 1; } }
  .fb-test-summary-h {
    display: flex; align-items: center; justify-content: space-between;
    margin-bottom: 14px;
  }
  .fb-test-summary-h h3 {
    font-size: 17px; font-weight: 700; color: #0a0a0a;
    margin: 0; letter-spacing: -0.01em;
  }
  .fb-test-summary-h.is-failed h3 { color: #991b1b; }
  .fb-test-summary-x {
    background: #f1f5f9; border: 0; cursor: pointer;
    width: 26px; height: 26px; border-radius: 50%;
    display: inline-flex; align-items: center; justify-content: center;
    color: #475569; font-size: 14px;
  }
  .fb-test-summary-x:hover { background: #e2e8f0; color: #0f172a; }
  .fb-test-summary-stat {
    font-size: 13.5px; color: #475569; line-height: 1.6;
    margin: 4px 0;
  }
  .fb-test-summary-stat strong { color: #0a0a0a; }
  .fb-test-sent-list {
    margin-top: 12px; padding-top: 12px;
    border-top: 1px solid #f1f5f9;
  }
  .fb-test-sent-row {
    font-size: 13px; color: #475569; padding: 4px 0;
    line-height: 1.5;
  }
  .fb-test-sent-row strong { color: #0a0a0a; }
  .fb-test-summary-foot {
    margin-top: 16px; padding-top: 14px;
    border-top: 1px solid #f1f5f9;
    display: flex; gap: 8px; justify-content: flex-end;
  }
  .fb-test-summary-foot button {
    padding: 8px 14px; font-size: 13px; font-weight: 600;
    border-radius: 8px; border: 1.5px solid #e5e7eb;
    background: #fff; color: #0a0a0a; cursor: pointer; font-family: inherit;
  }
  .fb-test-summary-foot .is-primary {
    background: #0f172a; color: #fff; border-color: #0f172a;
  }
  .fb-test-summary-foot button:hover { transform: translateY(-1px); }

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
    animation: fbSlideIn .3s cubic-bezier(.2,.8,.2,1);
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
  /* ── AI Agent picker (Phase 1) ────────────────────────────── */
  .fb-aiagent { display: flex; flex-direction: column; gap: 14px; }
  .fb-aiagent-loading,
  .fb-aiagent-empty {
    padding: 24px 16px; text-align: center;
    color: #64748b; font-size: 13.5px;
  }
  .fb-aiagent-empty p { margin: 0 0 12px; }
  .fb-aiagent-create {
    display: inline-block; padding: 8px 14px;
    background: var(--kind-deep, #185fa5); color: #fff;
    border-radius: 8px; text-decoration: none; font-weight: 600;
  }
  .fb-aiagent-l {
    font-size: 12px; font-weight: 700; color: #4b5563;
    letter-spacing: .03em; text-transform: uppercase;
    margin: 0 0 4px;
  }
  .fb-aiagent-list {
    display: flex; flex-direction: column; gap: 8px;
  }
  .fb-aiagent-row {
    display: flex; align-items: flex-start; gap: 10px;
    width: 100%; text-align: left;
    background: #fff; border: 1.5px solid #e2e8f0; border-radius: 10px;
    padding: 12px 14px;
    cursor: pointer; font: inherit; color: inherit;
    transition: border-color .12s ease, background .12s ease;
  }
  .fb-aiagent-row:hover {
    background: #f8fafc; border-color: #94a3b8;
  }
  .fb-aiagent-row.is-selected {
    background: #eef2ff; border-color: var(--kind-deep, #185fa5);
    box-shadow: 0 0 0 2px rgba(24,95,165,.15);
  }
  .fb-aiagent-radio {
    flex-shrink: 0; font-size: 16px; line-height: 1.25;
    color: #94a3b8;
  }
  .fb-aiagent-row.is-selected .fb-aiagent-radio {
    color: var(--kind-deep, #185fa5);
  }
  .fb-aiagent-text {
    display: flex; flex-direction: column; gap: 3px; min-width: 0; flex: 1;
  }
  .fb-aiagent-name {
    font-size: 14px; font-weight: 600; color: #0f172a;
  }
  .fb-aiagent-job {
    font-size: 12.5px; color: #475569; line-height: 1.45;
  }
  .fb-aiagent-fit {
    display: inline-flex; align-items: center;
    font-size: 11px; font-weight: 600; letter-spacing: .02em;
    margin-top: 4px; padding: 2px 8px;
    border-radius: 99px; align-self: flex-start;
  }
  .fb-aiagent-fit.is-good { color: #047857; background: #d1fae5; }
  .fb-aiagent-fit.is-warn { color: #92400e; background: #fef3c7; }
  .fb-aiagent-create-row {
    font-size: 12.5px; color: #64748b;
    text-align: center; padding-top: 4px;
  }
  .fb-aiagent-create-row a {
    color: var(--kind-deep, #185fa5); text-decoration: none; font-weight: 600;
  }
  .fb-aiagent-create-row a:hover { text-decoration: underline; }

  .fb-aiagent-preview {
    margin-top: 4px;
    background: #f8fafc;
    border: 1px solid #cbd5e1; border-radius: 12px;
    padding: 14px;
  }
  .fb-aiagent-preview-h {
    font-size: 14px; font-weight: 700; color: #0f172a; margin-bottom: 6px;
  }
  .fb-aiagent-preview-p {
    margin: 0 0 10px; font-size: 13px; line-height: 1.5; color: #1f2937;
  }
  .fb-aiagent-preview-sub {
    font-size: 12.5px; color: #475569; font-weight: 600;
    margin-bottom: 6px;
  }
  .fb-aiagent-outcomes {
    list-style: none; padding: 0; margin: 0 0 10px;
    display: flex; flex-direction: column; gap: 6px;
  }
  .fb-aiagent-outcomes li {
    display: flex; align-items: center; gap: 8px;
    background: #fff; border: 1px solid #e2e8f0; border-radius: 8px;
    padding: 6px 10px;
    font-size: 13px; color: #0f172a;
  }
  .fb-aiagent-outcome-emoji { flex-shrink: 0; font-size: 14px; }
  .fb-aiagent-preview-meta {
    font-size: 12.5px;
  }
  .fb-aiagent-edit {
    color: var(--kind-deep, #185fa5); text-decoration: none; font-weight: 600;
  }
  .fb-aiagent-edit:hover { text-decoration: underline; }
  .fb-aiagent-preview-note {
    margin-top: 10px; padding: 8px 10px;
    background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px;
    font-size: 12.5px; color: #1e3a8a;
  }
  .fb-aiagent-preview-warn {
    margin-top: 10px; padding: 8px 10px;
    background: #fef3c7; border: 1px solid #fde68a; border-radius: 8px;
    font-size: 12.5px; color: #92400e;
  }
  /* Test-with-sample-lead panel */
  .fb-aiagent-test {
    margin-top: 16px; padding-top: 14px;
    border-top: 1px dashed #cbd5e1;
    display: flex; flex-direction: column; gap: 10px;
  }
  .fb-aiagent-test-h {
    font-size: 12px; font-weight: 700; color: #4b5563;
    letter-spacing: .03em; text-transform: uppercase;
  }
  .fb-aiagent-test-grid {
    display: grid; grid-template-columns: 1fr 1fr; gap: 8px;
  }
  .fb-aiagent-test-grid textarea,
  .fb-aiagent-test-grid input { font-size: 13px; padding: 8px 10px; }
  .fb-aiagent-test-grid textarea { grid-column: 1 / -1; }
  .fb-aiagent-test-btn {
    align-self: flex-start;
    background: #185fa5; color: #fff; border: 0; border-radius: 8px;
    padding: 8px 14px; font: inherit; font-size: 13px; font-weight: 600;
    cursor: pointer;
  }
  .fb-aiagent-test-btn:disabled { opacity: .6; cursor: not-allowed; }
  .fb-aiagent-test-err {
    background: #fef2f2; color: #b91c1c; border: 1px solid #fecaca;
    border-radius: 8px; padding: 8px 10px; font-size: 12.5px;
  }
  .fb-aiagent-test-out {
    background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px;
    padding: 10px 12px;
    display: flex; flex-direction: column; gap: 6px;
  }
  .fb-aiagent-test-sub {
    font-size: 10.5px; font-weight: 700; letter-spacing: .08em;
    color: #475569; text-transform: uppercase;
  }
  .fb-aiagent-test-pre {
    background: #0f172a; color: #e2e8f0;
    padding: 8px 10px; border-radius: 6px;
    font-family: ui-monospace,Menlo,Consolas,monospace;
    font-size: 11.5px; line-height: 1.45;
    margin: 0; max-height: 180px; overflow: auto; white-space: pre-wrap;
  }
  .fb-aiagent-test-routed {
    background: #ecfdf5; color: #065f46;
    border: 1px solid #a7f3d0; border-radius: 6px;
    padding: 6px 10px; font-size: 13px; font-weight: 600;
  }

  /* Qualifier-mode branch rows on the canvas card */
  .fb-aiagent-paths { padding-top: 8px; }
  .fb-aiagent-paths .fb-branch-path { background: #fafbff; }
  .fb-aiagent-paths .is-aiagent .fb-branch-path-ico { font-size: 16px; }
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
  .fb-helper-inline {
    color: #9ca3af; font-weight: 400; font-size: 12px;
  }
  .fb-chip-more {
    background: #111827 !important; border-color: #111827 !important;
    color: #fff !important; margin-left: auto;
  }
  .fb-chip-more:hover {
    background: #1f2937 !important; border-color: #1f2937 !important;
  }

  /* ── Notify recipients ────────────────────────────────────────────── */
  .fb-recip-section {
    margin-top: 14px; margin-bottom: 6px;
    padding: 12px; border-radius: 10px;
    background: #fafafa; border: 1px solid #e5e7eb;
    display: flex; flex-direction: column; gap: 10px;
  }
  .fb-recip-customer {
    display: grid; grid-template-columns: auto 1fr auto; align-items: center;
    gap: 4px 10px; padding: 10px 12px; border-radius: 8px;
    background: #fff; border: 1px solid #e5e7eb; cursor: pointer;
    text-align: left;
  }
  .fb-recip-customer.is-on { background: #f0fdf4; border-color: #86efac; }
  .fb-recip-customer-ico {
    grid-row: 1 / span 2; width: 28px; height: 28px;
    display: flex; align-items: center; justify-content: center;
    border-radius: 50%; background: #e5e7eb; color: #6b7280;
    font-size: 14px; font-weight: 700;
  }
  .fb-recip-customer.is-on .fb-recip-customer-ico {
    background: #16a34a; color: #fff;
  }
  .fb-recip-customer-label {
    font: 600 13px inherit; color: #111827;
  }
  .fb-recip-customer-sub {
    grid-column: 2; font-size: 12px; color: #6b7280;
  }
  .fb-recip-field { display: flex; flex-direction: column; gap: 6px; }
  .fb-recip-count { color: #9ca3af; font-weight: 400; }
  .fb-recip-box {
    display: flex; flex-wrap: wrap; align-items: center; gap: 6px;
    padding: 6px 8px; min-height: 40px;
    background: #fff; border: 1px solid #e5e7eb; border-radius: 8px;
  }
  .fb-recip-box:focus-within { border-color: #16a34a; box-shadow: 0 0 0 3px rgba(22,163,74,.12); }
  .fb-recip-chip {
    display: inline-flex; align-items: center; gap: 4px;
    padding: 4px 4px 4px 10px; border-radius: 6px;
    background: #f3f4f6; color: #111827; font-size: 13px;
  }
  .fb-recip-chip.is-invalid {
    background: #fef2f2; color: #b91c1c;
    text-decoration: underline wavy #fca5a5; text-underline-offset: 2px;
  }
  /* Default-sender chip — the user's connected Gmail. Subtle blue tint
     + tiny "Default" badge so the owner sees instantly that this row
     is them, not someone they typed in. */
  .fb-recip-chip.is-default {
    background: #eff6ff;
    border: 1px solid #c7dbf3;
    color: #0a3d7a;
    padding-left: 6px;
  }
  .fb-recip-chip-badge {
    display: inline-flex; align-items: center;
    padding: 1px 7px;
    background: #185fa5; color: #fff;
    border-radius: 999px;
    font-size: 10px; font-weight: 700;
    letter-spacing: .04em; text-transform: uppercase;
    line-height: 1.4;
  }
  /* Compact one-line Gmail sender notice — replaces the colored
     callout box that was eating ~52px of vertical space in the
     Notify Me drawer. Now it reads as a single helper line. */
  .fb-recip-default-hint {
    margin-top: 4px;
    display: flex; align-items: center; gap: 6px;
    padding: 0;
    background: transparent; border: 0;
    color: #475569; font-size: 12px; line-height: 1.3;
  }
  .fb-recip-default-hint.is-dismissed {
    color: #92400e;
  }
  .fb-recip-default-restore {
    margin-left: auto;
    background: #fff; border: 1px solid #d97706; color: #78350f;
    padding: 4px 10px; border-radius: 999px;
    font: inherit; font-size: 12px; font-weight: 600;
    cursor: pointer; flex-shrink: 0;
  }
  .fb-recip-default-restore:hover { background: #fef3c7; }
  .fb-recip-connect {
    margin-top: 8px;
    display: flex; align-items: center; gap: 10px;
    padding: 10px 12px; border-radius: 10px;
    background: #fefce8; border: 1px dashed #fde047;
    color: #713f12; font-size: 13px;
  }
  .fb-recip-connect-btn {
    margin-left: auto;
    background: #185fa5; color: #fff;
    padding: 6px 14px; border-radius: 999px;
    font-size: 12.5px; font-weight: 700;
    text-decoration: none; flex-shrink: 0;
    transition: background .12s;
  }
  .fb-recip-connect-btn:hover { background: #144b85; }
  .fb-recip-x {
    border: 0; background: transparent; color: #6b7280; cursor: pointer;
    width: 20px; height: 20px; line-height: 16px; border-radius: 4px;
    font-size: 16px;
  }
  .fb-recip-x:hover { background: #e5e7eb; color: #111827; }
  .fb-recip-input {
    flex: 1; min-width: 160px; border: 0; background: transparent;
    padding: 6px 4px; font: inherit; outline: none; color: #111827;
  }
  .fb-recip-warn {
    padding: 8px 10px; border-radius: 8px;
    background: #fffbeb; border: 1px solid #fcd34d;
    color: #92400e; font-size: 12.5px;
  }

  /* ── Variable picker popover ──────────────────────────────────────── */
  .fb-varpicker {
    position: fixed; z-index: 60; width: 320px; max-height: 360px;
    background: #fff; border: 1px solid #e5e7eb; border-radius: 12px;
    box-shadow: 0 12px 32px rgba(15,23,42,.18);
    display: flex; flex-direction: column; overflow: hidden;
  }
  .fb-varpicker-search {
    padding: 8px 10px; border-bottom: 1px solid #f1f5f9;
  }
  .fb-varpicker-search input {
    width: 100%; border: 0; background: transparent;
    padding: 4px; font: inherit; outline: none;
  }
  .fb-varpicker-list {
    overflow-y: auto; padding: 4px 0;
  }
  .fb-varpicker-empty {
    padding: 18px 14px; text-align: center;
    color: #6b7280; font-size: 12.5px;
  }
  .fb-varpicker-h {
    padding: 6px 12px 4px;
    font: 600 10.5px/1 inherit; color: #6b7280;
    text-transform: uppercase; letter-spacing: 0.06em;
  }
  .fb-varpicker-row {
    display: grid; grid-template-columns: 1fr auto; gap: 8px;
    align-items: center; width: 100%;
    padding: 6px 12px; background: transparent; border: 0;
    text-align: left; cursor: pointer;
  }
  .fb-varpicker-row:hover, .fb-varpicker-row.is-active {
    background: #f0fdf4;
  }
  .fb-varpicker-row-l { min-width: 0; }
  .fb-varpicker-row-label {
    font: 500 13px inherit; color: #111827;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .fb-varpicker-row-token {
    font: 400 11px monospace; color: #94a3b8;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .fb-varpicker-row-r {
    display: flex; align-items: center; gap: 6px;
  }
  .fb-varpicker-row-sample {
    font: 400 11px monospace; color: #6b7280;
    max-width: 110px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .fb-varpicker-row-insert {
    padding: 2px 8px; border-radius: 4px;
    background: #e5e7eb; color: #475569;
    font: 600 10.5px inherit;
  }
  .fb-varpicker-row.is-active .fb-varpicker-row-insert {
    background: #16a34a; color: #fff;
  }

  /* ── Preview source toggle + test data inline editor ──────────────── */
  .fb-prev-source {
    display: flex; align-items: center; gap: 8px;
    margin-bottom: 10px;
  }
  .fb-prev-source-l { font-size: 12px; color: #6b7280; }
  .fb-prev-source-pills {
    display: inline-flex; padding: 2px;
    background: #f3f4f6; border-radius: 999px;
  }
  .fb-prev-source-pill {
    background: transparent; border: 0; cursor: pointer;
    padding: 4px 10px; border-radius: 999px;
    font: 500 12px inherit; color: #6b7280;
  }
  .fb-prev-source-pill.is-active {
    background: #fff; color: #111827;
    box-shadow: 0 1px 2px rgba(15,23,42,.08);
  }
  .fb-prev-testdata {
    display: grid; gap: 4px; padding: 8px 10px; margin-bottom: 10px;
    background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px;
  }
  .fb-prev-testdata-row {
    display: grid; grid-template-columns: 110px 1fr;
    align-items: center; gap: 8px;
  }
  .fb-prev-testdata-k { font: 500 11.5px inherit; color: #6b7280; }
  .fb-prev-testdata-v {
    background: #fff; border: 1px solid #e5e7eb; border-radius: 6px;
    padding: 4px 8px; font: inherit; font-size: 12px; outline: none;
  }
  .fb-prev-testdata-v:focus { border-color: #16a34a; }
  .fb-prev-recip-sum {
    margin-top: 10px; padding: 8px 12px; border-radius: 8px;
    background: #f8fafc; border: 1px solid #e2e8f0;
    font-size: 12.5px; color: #475569; text-align: center;
  }
  .fb-prev-recip-sum-warn { color: #b45309; font-weight: 500; }
  .fb-phone-both { display: flex; flex-direction: column; }

  /* ── Polish 4: tinted 3-tab type selector ──────────────────────── */
  .fb-modes-wrap { margin-bottom: 14px; }
  .fb-modes-rec-row {
    display: grid; grid-template-columns: 1fr 1fr 1fr;
    pointer-events: none; height: 14px;
  }
  .fb-modes-rec {
    grid-column: 3; justify-self: center;
    background: #fbbf24; color: #78350f;
    font: 600 9.5px inherit; letter-spacing: 0.06em;
    text-transform: uppercase;
    padding: 1px 8px; border-radius: 999px;
    box-shadow: 0 1px 2px rgba(15,23,42,.10);
  }
  .fb-modes-3 {
    display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px;
    margin-top: 4px;
  }
  .fb-mode3 {
    display: flex; flex-direction: column; align-items: center; gap: 4px;
    padding: 12px 8px; border-radius: 12px;
    background: #fff; border: 1.5px solid #e5e7eb;
    color: #4b5563; font: 500 13.5px inherit; cursor: pointer;
    transition: background-color .12s, border-color .12s;
  }
  .fb-mode3:hover { background: #f9fafb; }
  .fb-mode3-ico { font-size: 18px; line-height: 1; }
  .fb-mode3.is-active { font-weight: 700; }
  .fb-mode3.is-email.is-active { background: #eff6ff; border-color: #3b82f6; color: #1d4ed8; }
  .fb-mode3.is-sms.is-active   { background: #f5f3ff; border-color: #8b5cf6; color: #6d28d9; }
  .fb-mode3.is-both.is-active  { background: #fffbeb; border-color: #f59e0b; color: #92400e; }
  .fb-mode3.is-call.is-active  { background: #ecfdf5; border-color: #10b981; color: #047857; }

  /* ── Notify Me multi-select channel toggles ────────────────────────
     Three independently-togglable buttons (Call / Text / Email). Each
     shows a check when on. At least one must stay selected (handled
     in toggleMode). Designed plain enough that a 5-year-old reads it
     as "what should we do, ping you which way?". */
  .fb-modes-multi { margin-bottom: 10px; }

  /* Validation warning when the user unchecks every channel. The
     Save button also disables; this banner explains why. */
  .fb-modes-warn {
    margin-top: 10px;
    padding: 8px 12px;
    background: #fef3c7; border: 1px solid #fde68a;
    color: #92400e; border-radius: 8px;
    font: 600 13px inherit;
  }

  /* Channel-coded section panels — each conditionally-rendered section
     gets a full color-tinted card so the user can ALWAYS tell which
     channel a field belongs to. Bold left-edge stripe (5px), tinted
     fill, matching saturated border. */

  /* 📧 Email subject card — top half of a merged blue panel.
     Rounded top, flat bottom, no bottom border so it visually
     continues into the body composer below. */
  .fb-mail-frame {
    border: 2px solid #60a5fa;
    border-bottom: 0;
    border-left: 6px solid #1d4ed8;
    background: #bfdbfe;
    border-radius: 12px 12px 0 0;
    padding: 12px 14px;
    margin-top: 14px;
  }
  .fb-mail-frame .fb-mail-frame-row {
    background: transparent;
    box-shadow: none;
    padding: 0;
    border-radius: 0;
  }
  /* 📧 Email message body — bottom half of the same blue panel when
     paired with the email subject above. Higher specificity than the
     standalone violet rule below so this wins for the email path. */
  .fb-mail-frame + .fb-composer {
    border: 2px solid #60a5fa;
    border-top: 0;
    border-left: 6px solid #1d4ed8;
    background: #bfdbfe;            /* SAME blue as the subject card */
    border-radius: 0 0 12px 12px;
    margin-top: 0;                  /* zero gap so they merge */
    padding: 0;
    box-shadow: none;
  }
  /* 💬 Text-only message body card — only when there's NO email
     subject above (so :not(.fb-mail-frame + .fb-composer) wins). */
  .fb-composer:not(.fb-call-mini):not(.fb-mail-frame + .fb-composer) {
    border: 2px solid #c4b5fd;
    border-left: 6px solid #7c3aed;
    background: #ddd6fe;            /* saturated violet */
    border-radius: 12px;
    padding: 0;
    margin-top: 12px;
  }
  /* 📞 Call message section card */
  .fb-composer.fb-call-mini {
    border: 2px solid #6ee7b7;
    border-left: 6px solid #059669;
    background: #a7f3d0;            /* saturated mint card fill */
    border-radius: 12px;
    padding: 0;
    margin-top: 12px;
  }
  /* Inner content — chip rail + textarea use translucent white over
     the channel tint so the user can see the card color but the text
     stays legible. */
  .fb-mail-frame .fb-htxt-input,
  .fb-composer.fb-call-mini .fb-htxt-input,
  .fb-composer:not(.fb-call-mini) .fb-htxt-input {
    background: rgba(255,255,255,.85) !important;
  }
  /* Subject input — translucent white so the card's blue fill is
     visible around it instead of a solid-white box that hides the
     channel color. */
  .fb-subject-input-v2 {
    background: rgba(255,255,255,.85);
    border-color: rgba(29,78,216,.25);
  }
  .fb-subject-input-v2:focus {
    background: #fff;
    border-color: #1d4ed8;
    box-shadow: 0 0 0 3px rgba(29,78,216,.18);
  }
  /* Composer rail (variable chips) keeps a translucent white so chips
     stay readable while the card tint shows. */
  .fb-composer .fb-composer-rail {
    background: rgba(255,255,255,.6);
  }

  /* Recipient input cards — same channel-coded card treatment as the
     message editors so phone vs email rows are visually distinct. */
  .fb-recip-card {
    padding: 10px 12px;
    border-radius: 12px;
    border: 2px solid; border-left-width: 6px;
  }
  .fb-recip-card.is-sms {
    background: #faf5ff;
    border-color: #c4b5fd;
    border-left-color: #7c3aed;
  }
  .fb-recip-card.is-call {
    background: #ecfdf5;
    border-color: #6ee7b7;
    border-left-color: #059669;
  }
  .fb-recip-card.is-email {
    background: #eff6ff;
    border-color: #93c5fd;
    border-left-color: #2563eb;
  }
  /* Inside each card, the chip input keeps a white inner fill so chips
     and the typing area stay legible against the card tint. */
  .fb-recip-card .fb-recip-box {
    background: #fff;
  }

  /* Smooth show animation for any field section that fades into view
     when a channel is toggled on. The hide path is an instant unmount
     (React removes the node) — fine for v1. */
  @keyframes fb-field-in {
    from { opacity: 0; transform: translateY(-6px); }
    to   { opacity: 1; transform: none; }
  }
  .fb-recip-flat,
  .fb-mail-frame,
  .fb-call-mini,
  .fb-call-target,
  .fb-composer.fb-call-mini { animation: fb-field-in .2s ease-out; }
  .fb-composer:not(.fb-call-mini) { animation: fb-field-in .2s ease-out; }

  /* Disabled save button — semantic feedback that an action is blocked
     without screaming about it. */
  .fb-drawer-done[disabled] {
    background: #cbd5e1 !important;
    color: #64748b !important;
    cursor: not-allowed !important;
    box-shadow: none !important;
  }
  .fb-modes-multi-h {
    font: 600 13px inherit; color: #0a0a0a;
    margin-bottom: 8px;
    display: flex; align-items: center; gap: 8px;
  }
  .fb-modes-multi-hint {
    font: 500 11.5px inherit; color: #6b7280;
    background: #f3f4f6; padding: 2px 8px; border-radius: 999px;
  }
  .fb-modes-multi-row {
    display: grid; grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
  }
  @media (max-width: 480px) {
    .fb-modes-multi-row { grid-template-columns: 1fr; }
  }
  .fb-mode-toggle {
    display: flex; align-items: center; gap: 8px;
    padding: 12px 14px;
    background: #fff; border: 1.5px solid #e5e7eb;
    border-radius: 12px; cursor: pointer;
    font: 600 14px inherit; color: #0a0a0a;
    text-align: left;
    transition: border-color .12s, background .12s, transform .12s;
  }
  .fb-mode-toggle:hover {
    border-color: #cbd5e1; transform: translateY(-1px);
  }
  .fb-mode-toggle.is-on {
    border-color: #185fa5; background: #eff6ff;
    box-shadow: 0 0 0 3px rgba(24,95,165,.12);
  }
  .fb-mode-toggle-check {
    width: 22px; height: 22px;
    border-radius: 6px;
    background: #f3f4f6; color: #fff;
    display: flex; align-items: center; justify-content: center;
    font-size: 13px; font-weight: 700;
    flex-shrink: 0;
    transition: background .12s;
  }
  .fb-mode-toggle.is-on .fb-mode-toggle-check {
    background: #185fa5;
  }
  .fb-mode-toggle-ico { font-size: 18px; line-height: 1; }
  .fb-mode-toggle-label { font-weight: 600; }

  /* Section header above each notify message editor — tells the user
     exactly which channel the textarea below maps to. */
  .fb-composer-section-h {
    padding: 8px 14px 0;
    font: 700 11.5px inherit; color: #475569;
    text-transform: uppercase; letter-spacing: .04em;
  }

  /* ── Issue 3: flat Recipients section ─────────────────────────── */
  .fb-recip-flat {
    margin-top: 10px; margin-bottom: 12px;
    display: flex; flex-direction: column; gap: 6px;
  }
  .fb-recip-flat-h {
    font: 600 14px inherit; color: #111827;
  }
  .fb-recip-lead {
    display: flex; align-items: center; gap: 12px;
    padding: 8px 4px; background: transparent; border: 0; cursor: pointer;
    text-align: left;
  }
  .fb-recip-lead-ico {
    width: 24px; height: 24px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-size: 13px; font-weight: 700; flex-none: 0;
  }
  .fb-recip-lead.is-on .fb-recip-lead-ico {
    background: #dcfce7; color: #166534;
  }
  .fb-recip-lead.is-off .fb-recip-lead-ico {
    background: #f3f4f6; color: #9ca3af;
  }
  .fb-recip-lead-text { display: flex; flex-direction: column; line-height: 1.25; }
  .fb-recip-lead-l { font: 500 13.5px inherit; color: #111827; }
  .fb-recip-lead.is-off .fb-recip-lead-l { color: #6b7280; }
  .fb-recip-lead-s { font: 400 12px inherit; color: #9ca3af; margin-top: 2px; }

  .fb-recip-also {
    display: flex; flex-direction: column; gap: 6px;
    padding-left: 0;
  }
  .fb-recip-also-l {
    font: 500 12px inherit; color: #6b7280;
  }
  .fb-recip-prefix {
    display: inline-flex; align-items: center; gap: 4px;
    color: #9ca3af; font: 500 12.5px inherit;
    padding: 0 4px;
    transition: color .12s;
    user-select: none;
  }
  .fb-recip-prefix.is-active { color: #475569; }
  .fb-recip-prefix-count {
    background: #e5e7eb; color: #475569;
    padding: 1px 6px; border-radius: 999px;
    font: 600 10.5px inherit;
  }
  .fb-recip-toast {
    align-self: center;
    padding: 4px 10px; border-radius: 999px;
    background: #f1f5f9; color: #475569;
    font: 500 11.5px inherit;
    animation: fb-recip-toast-in .15s ease-out;
  }
  @keyframes fb-recip-toast-in {
    from { opacity: 0; transform: translateY(-3px); }
    to   { opacity: 1; transform: none; }
  }

  /* ── Issue 5: subject helper ──────────────────────────────────── */
  .fb-subject-help {
    margin-top: 4px; font: 400 12px inherit; color: #6b7280;
  }

  /* ── Issues 8 + 2: composer with attached chip rail ───────────── */
  .fb-composer {
    border: 1px solid #e5e7eb; border-radius: 10px;
    background: #fff;
    transition: border-color .12s, box-shadow .12s;
  }
  .fb-composer:focus-within {
    border-color: #16a34a; box-shadow: 0 0 0 3px rgba(22,163,74,.10);
  }
  .fb-composer-ta {
    display: block; width: 100%;
    border: 0; outline: none; resize: vertical;
    padding: 12px 14px;
    font: 16px/1.5 inherit;
    border-top-left-radius: 10px; border-top-right-radius: 10px;
    background: transparent;
  }
  /* The token-highlight overlay must match the composer textarea's
     padding + font EXACTLY so highlight spans sit BEHIND the actual
     glyphs. There's a later .fb-composer-ta override that drops
     padding to 10/12 and font-size to 15 — match that, not the
     earlier 12/14 16/1.5 rule. Mismatched padding caused chips to
     drift left/down by ~2px per line. */
  .fb-composer .fb-htxt-overlay {
    padding: 10px 12px;
    font-size: 15px;
    line-height: 1.5;
    font-family: inherit;
    border-radius: 10px 10px 0 0;
    border: 0;
  }
  /* And lock the textarea side too — explicit line-height so it can't
     be browser-default. Both layers sit at 15px / 1.5 / 10px-12px
     padding now, character columns line up. */
  .fb-composer .fb-htxt-input.fb-composer-ta {
    line-height: 1.5;
  }
  .fb-composer-rail {
    display: flex; flex-wrap: wrap; align-items: center; gap: 6px;
    padding: 8px 10px;
    border-top: 1px solid #f1f5f9;
    background: #fafafa;
    border-bottom-left-radius: 10px; border-bottom-right-radius: 10px;
  }
  .fb-chip-outline {
    display: inline-flex; align-items: center; gap: 4px;
    background: transparent; border: 1px dashed #cbd5e1;
    color: #475569; font: 500 12.5px inherit;
    padding: 5px 10px; border-radius: 999px; cursor: pointer;
    margin-left: auto;
  }
  .fb-chip-outline:hover { background: #f1f5f9; border-color: #94a3b8; }
  .fb-chip.is-flash {
    animation: fb-chip-flash .35s ease-out;
  }
  @keyframes fb-chip-flash {
    0%   { background: #16a34a; color: #fff; transform: scale(1.06); }
    100% { background: #f0fdf4; color: #166534; transform: scale(1); }
  }

  /* ── Polish 3: char count line ────────────────────────────────── */
  .fb-charcount {
    margin-top: 6px;
    font: 400 12px inherit; color: #94a3b8;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  /* ── Issue 1: test-data scrolls inside preview pane ───────────── */
  .fb-prev-testdata {
    max-height: 30vh; overflow-y: auto; overflow-x: hidden;
    width: 100%; box-sizing: border-box;
  }
  .fb-prev-testdata-row {
    grid-template-columns: minmax(0, 110px) minmax(0, 1fr);
  }
  .fb-prev-testdata-v { min-width: 0; }
  .fb-prev-testdata-more {
    margin: 6px auto 0; display: block;
    background: transparent; border: 0; cursor: pointer;
    color: #16a34a; font: 600 12px inherit;
  }
  .fb-prev-testdata-more:hover { text-decoration: underline; }

  /* ── Issue 7: recipient summary pills at top of preview ───────── */
  .fb-prev-pills {
    display: flex; flex-wrap: wrap; gap: 6px;
    margin-bottom: 10px;
  }
  .fb-prev-pill {
    display: inline-flex; align-items: center; gap: 4px;
    padding: 4px 10px; border-radius: 999px;
    background: #f1f5f9; color: #334155;
    font: 500 12px inherit;
  }
  .fb-prev-pill.is-warn { background: #fef3c7; color: #92400e; }

  /* ── Issue 6: friendly empty placeholder in phone preview ─────── */
  .fb-phone-empty {
    color: #cbd5e1; font-style: italic;
  }

  /* ── Polish 5: footer Save + Send-a-test layout ───────────────── */
  .fb-drawer-foot {
    /* Sticky footer — Save and continue is always visible regardless
       of how far the user scrolls in the form. The body above scrolls;
       this footer sits at the bottom of the drawer at all times. */
    position: sticky; bottom: 0;
    background: #fff;
    border-top: 1px solid var(--fb-border);
    padding: 12px 22px;
    display: flex; align-items: center; justify-content: space-between;
    z-index: 5;
    box-shadow: 0 -2px 8px rgba(15,23,42,.04);
  }

  /* ── Standardized section header (Notify Me redesign) ────────────────
     Used by the redesigned drawer panels. Sentence case, semibold, no
     uppercase letter-spacing. One consistent treatment for every
     section so the user can predict where to look for what. */
  .fb-section-h-v2 {
    font: 700 16px inherit;
    color: #0a0a0a;
    margin: 0 0 10px;
    display: flex; align-items: center; gap: 8px;
    letter-spacing: 0;
    text-transform: none;
    line-height: 1.2;
  }
  /* Channel-tinted variants — saturated colors matching each mode
     toggle. Bigger, bolder so the section purpose reads at a glance. */
  .fb-section-h-v2.is-email { color: #1e40af; }
  .fb-section-h-v2.is-sms   { color: #5b21b6; }
  .fb-section-h-v2.is-call  { color: #065f46; }
  .fb-section-h-v2.is-both  { color: #0f172a; }
  .fb-helper-tight {
    color: #475569;
  }
  .fb-helper-tight {
    margin: 4px 0 0;
    font: 400 12.5px inherit;
    color: #6b7280;
    line-height: 1.4;
  }
  /* (Stale gray-bg .fb-mail-frame rule removed — the saturated-blue
     channel-card definition higher up is the source of truth now.) */
  .fb-mail-frame-row { margin-bottom: 6px; }
  /* Insert: label above the variable chip rail */
  .fb-composer-rail-l {
    font: 600 12px inherit; color: #475569;
    margin-right: 4px;
    align-self: center;
  }

  /* Collapsible preview — when the user clicks Hide preview, the
     right-side pane shrinks to a thin tab and the form takes the
     full drawer width. Frees up real estate for the form fields and
     reduces vertical scroll. */
  .fb-drawer-body.is-preview-collapsed {
    grid-template-columns: minmax(0, 1fr) 36px !important;
  }
  .fb-drawer-preview.is-collapsed > *:not(.fb-preview-toggle) {
    display: none !important;
  }
  .fb-preview-toggle {
    background: #f8fafc; border: 1px solid var(--fb-border);
    border-radius: 999px;
    padding: 6px 12px;
    font: 600 12px inherit;
    color: #475569; cursor: pointer;
    align-self: flex-end;
    margin-bottom: 10px;
    transition: background .12s, color .12s;
  }
  .fb-preview-toggle:hover {
    background: #eff6ff; color: #185fa5;
  }
  .fb-drawer-preview.is-collapsed .fb-preview-toggle {
    writing-mode: vertical-rl;
    transform: rotate(180deg);
    margin: 0 auto;
    padding: 12px 6px;
    height: auto;
  }
  .fb-drawer-foot-r {
    display: flex; align-items: center; gap: 8px;
  }
  .fb-drawer-test {
    background: transparent; border: 0; cursor: pointer;
    color: #475569; font: 500 13px inherit;
    padding: 8px 6px;
  }
  .fb-drawer-test:hover { color: #16a34a; text-decoration: underline; }
  .fb-drawer-testflash {
    position: absolute; left: 16px; right: 16px; bottom: calc(100% + 6px);
    background: #f0fdf4; border: 1px solid #bbf7d0;
    color: #166534; font: 500 12.5px inherit;
    padding: 6px 10px; border-radius: 8px;
    box-shadow: 0 4px 12px rgba(15,23,42,.08);
    animation: fb-recip-toast-in .15s ease-out;
  }

  /* ── Polish 6: light mobile collapse ──────────────────────────── */
  @media (max-width: 768px) {
    .fb-modes-3 { gap: 6px; }
    .fb-mode3 { padding: 10px 4px; font-size: 12.5px; }
    .fb-recip-also { padding-left: 0; }
    .fb-prev-testdata { max-height: 24vh; }
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

  /* ── Form editor + live preview (Input drawer) ─────────────────────────
     Visual rules copied 1-to-1 from the Lead Intake form-builder modal
     (.fld-card / .fld-handle / .fld-icon / .fld-label / .fld-req-pill /
     .fld-del / .b-input / .b-section-h / .add-fld-menu / .builder-preview).
     Class names are prefixed fb- to avoid colliding with the iframe's
     copies but the rules themselves are byte-equivalent. */
  .fb-ich.is-form-editor { width: 100%; }
  .fb-ich-grid {
    display: grid;
    grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
    gap: 0;
    align-items: stretch;
  }
  @media (max-width: 880px) {
    .fb-ich-grid { grid-template-columns: 1fr; }
  }
  .fb-ich-edit-pane {
    min-width: 0; padding: 4px 28px 24px 4px;
  }
  .fb-ich-preview-pane {
    min-width: 0; padding: 4px 4px 24px 28px;
    background: #fafbfc;
    border-left: 1px solid #e6e9ef;
    margin-left: 8px;
  }
  @media (max-width: 880px) {
    .fb-ich-preview-pane {
      border-left: 0; border-top: 1px solid #e6e9ef;
      margin-left: 0; padding-top: 24px;
    }
  }

  /* Section header (.b-section-h) */
  .fb-bsection-h {
    font-size: 11px; font-weight: 700; color: #9aa4b2;
    text-transform: uppercase; letter-spacing: .05em;
    margin: 24px 0 10px;
  }
  .fb-bsection-h-row {
    display: flex; align-items: center; justify-content: space-between;
  }
  .fb-bsave-tag {
    font-size: 11px; font-weight: 600; color: #0a8a3a;
    text-transform: none; letter-spacing: 0;
  }

  /* Text input (.b-input) */
  .fb-binput {
    width: 100%; padding: 10px 12px;
    border: 1px solid #e6e9ef; border-radius: 8px;
    font: inherit; font-size: 14px;
    background: #fff; color: #0a0a0a;
    box-sizing: border-box;
  }
  .fb-binput:focus {
    outline: none; border-color: #185fa5;
    box-shadow: 0 0 0 3px rgba(24,95,165,.12);
  }

  /* ── Form-fields / Site-fields tab nav ──────────────────────────── */
  .fb-field-tabs {
    display: flex; gap: 6px;
    margin: 0 0 12px;
    border-bottom: 1px solid #e6e9ef;
  }
  .fb-field-tab {
    padding: 8px 14px;
    background: transparent; border: 0;
    border-bottom: 2px solid transparent;
    margin-bottom: -1px;
    font: 600 13.5px inherit; color: #6b7280;
    cursor: pointer;
    transition: color .12s, border-color .12s, background .12s;
  }
  .fb-field-tab:hover { color: #185fa5; }
  .fb-field-tab.is-active {
    color: #0f172a;
    border-bottom-color: #185fa5;
  }

  /* Site-fields editor rows + snippet panel */
  .fb-sitefields { display: flex; flex-direction: column; gap: 10px; }
  .fb-sitefields-list { display: flex; flex-direction: column; gap: 8px; }
  .fb-sf-row {
    position: relative;
    background: #fff; border: 1px solid #e5e7eb;
    border-radius: 10px;
    padding: 10px 12px 12px;
  }
  .fb-sf-row-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.4fr);
    gap: 8px 10px;
    align-items: end;
  }
  .fb-sf-row-l {
    font: 600 11.5px inherit; color: #6b7280;
    text-transform: uppercase; letter-spacing: .04em;
  }
  .fb-sf-key {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 13px;
  }
  .fb-sf-key.is-error { border-color: #f87171; box-shadow: 0 0 0 3px rgba(248,113,113,.15); }
  .fb-sf-error { color: #b91c1c; font: 500 12px inherit; margin: 4px 0 0; }
  .fb-sf-remove {
    position: absolute; top: 6px; right: 6px;
    background: transparent; border: 0; cursor: pointer;
    width: 24px; height: 24px; border-radius: 6px;
    color: #9ca3af; font-size: 18px; line-height: 1;
  }
  .fb-sf-remove:hover { background: #fee2e2; color: #b91c1c; }

  .fb-sf-snippet {
    margin-top: 14px;
    padding: 14px 14px 4px;
    background: #f8fafc; border: 1px solid #e6e9ef;
    border-radius: 12px;
  }
  .fb-sf-snippet-h {
    font: 700 13px inherit; color: #0a0a0a;
    margin-bottom: 4px;
  }
  .fb-sf-snippet-block { margin-bottom: 12px; }
  .fb-sf-snippet-row {
    display: flex; align-items: center; justify-content: space-between;
    font: 600 11.5px inherit; color: #475569;
    text-transform: uppercase; letter-spacing: .04em;
    margin-bottom: 4px;
  }
  .fb-sf-copy {
    background: #fff; border: 1px solid #cdd7e3;
    color: #185fa5; cursor: pointer;
    padding: 3px 10px; border-radius: 999px;
    font: 600 11.5px inherit;
    text-transform: none; letter-spacing: 0;
  }
  .fb-sf-copy:hover { background: #eff6ff; }
  .fb-sf-code {
    margin: 0; padding: 10px 12px;
    background: #0f172a; color: #e2e8f0;
    border-radius: 8px;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 12px; line-height: 1.55;
    overflow-x: auto;
    white-space: pre;
  }
  .fb-sf-recipe-tabs {
    display: flex; gap: 4px;
    margin-bottom: 6px;
    background: #eef2f7;
    padding: 3px;
    border-radius: 8px;
    width: fit-content;
  }
  .fb-sf-recipe-tab {
    background: transparent; border: 0;
    color: #475569; cursor: pointer;
    padding: 5px 12px; border-radius: 6px;
    font: 600 12px inherit;
  }
  .fb-sf-recipe-tab:hover { color: #0f172a; }
  .fb-sf-recipe-tab.is-active {
    background: #fff; color: #0f172a;
    box-shadow: 0 1px 2px rgba(15,23,42,.08);
  }

  .fb-fields { /* container for field cards */ }
  .fb-fields-empty {
    text-align: center; padding: 20px 12px;
    color: #5a6470; font-size: 13px;
    border: 1px dashed #e6e9ef; border-radius: 10px;
  }

  /* Field card (.fld-card) */
  .fb-fld-card {
    background: #fff; border: 1px solid #e6e9ef;
    border-radius: 10px; padding: 10px 12px; margin-bottom: 10px;
    display: flex; align-items: center; gap: 10px;
    transition: transform .12s ease, box-shadow .12s ease, border-color .12s ease;
    position: relative;
  }
  .fb-fld-card:hover { border-color: #bcc7d4; }
  .fb-fld-card.is-dragging {
    opacity: .45; box-shadow: 0 6px 18px rgba(15,23,42,.12);
  }
  .fb-fld-card.drop-above::before,
  .fb-fld-card.drop-below::after {
    content: ""; position: absolute; left: 0; right: 0; height: 3px;
    background: #2563eb; border-radius: 2px;
    box-shadow: 0 0 0 2px rgba(37,99,235,.18);
    pointer-events: none;
  }
  .fb-fld-card.drop-above::before { top: -6px; }
  .fb-fld-card.drop-below::after  { bottom: -6px; }
  .fb-fld-handle {
    color: #9aa4b2; cursor: grab; user-select: none;
    font-size: 14px; line-height: 1;
    padding: 4px 2px;
  }
  .fb-fld-handle:hover { color: #475569; }
  .fb-fld-handle:active { cursor: grabbing; }
  .fb-fld-ico {
    width: 28px; height: 28px; border-radius: 8px; flex: 0 0 auto;
    display: flex; align-items: center; justify-content: center;
    font-size: 16px; line-height: 1; background: #f0f4f9;
  }
  .fb-fld-label {
    flex: 1; font-size: 14px; font-weight: 500; color: #0a0a0a;
    cursor: text; padding: 4px 6px; border-radius: 5px;
    border: 1px solid transparent; min-width: 0;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .fb-fld-label:hover { background: #f5f7fa; }
  .fb-fld-label-input {
    flex: 1; font: inherit; font-size: 14px; font-weight: 500;
    padding: 4px 6px; border: 1px solid #185fa5; border-radius: 5px;
    outline: none; min-width: 0; background: #fff; color: #0a0a0a;
  }
  .fb-fld-req-pill {
    background: transparent; border: 0; cursor: pointer; font: inherit;
    font-size: 11.5px; font-weight: 600; padding: 3px 9px;
    border-radius: 99px; flex: 0 0 auto;
    display: inline-flex; align-items: center; gap: 5px;
  }
  .fb-fld-req-dot { width: 5px; height: 5px; border-radius: 99px; background: currentColor; }
  .fb-fld-req-pill.is-req { background: #e6f6ec; color: #0a8a3a; }
  .fb-fld-req-pill.is-opt { background: #eef0f3; color: #5a6470; }
  .fb-fld-del {
    border: 0; background: transparent; cursor: pointer; padding: 4px 8px;
    color: #9aa4b2; font-size: 18px; line-height: 1;
    opacity: 0; transition: opacity .12s;
  }
  .fb-fld-card:hover .fb-fld-del { opacity: 1; }
  .fb-fld-del:hover { color: #c0392b; }

  /* + Add field dropdown (.add-fld-wrap / .add-fld-menu) */
  .fb-add-fld-wrap { position: relative; margin-top: 6px; }
  .fb-add-fld-btn {
    padding: 9px 14px;
    background: #fff; border: 1px solid #e6e9ef;
    border-radius: 10px; cursor: pointer;
    font: inherit; font-size: 13.5px; font-weight: 600;
    color: #0a0a0a;
    display: inline-flex; align-items: center; gap: 6px;
  }
  .fb-add-fld-btn:hover { background: #f5f7fa; border-color: #cdd7e3; }
  .fb-add-fld-caret { color: #9aa4b2; }
  .fb-add-fld-menu {
    position: absolute; top: calc(100% + 4px); left: 0;
    background: #fff; border: 1px solid #e6e9ef; border-radius: 10px;
    box-shadow: 0 6px 20px rgba(20,40,80,.10);
    min-width: 240px; padding: 8px 0; z-index: 50;
    max-height: 60vh; overflow: auto;
  }
  .fb-add-fld-section {
    font-size: 11px; font-weight: 700; color: #9aa4b2;
    text-transform: uppercase; letter-spacing: .04em;
    padding: 6px 14px;
  }
  .fb-add-fld-item {
    display: flex; align-items: center; gap: 10px;
    padding: 8px 14px; cursor: pointer; font-size: 13.5px;
    color: #0a0a0a;
  }
  .fb-add-fld-item:hover { background: #f5f7fa; }
  .fb-add-fld-ico { font-size: 18px; line-height: 1; }
  .fb-add-fld-divider { height: 1px; background: #e6e9ef; margin: 6px 0; }
  .fb-add-fld-none { padding: 8px 14px; color: #5a6470; font-size: 12.5px; }

  /* Live preview pane (.builder-preview + the in-pane card render) */
  .fb-bpreview { display: flex; flex-direction: column; gap: 14px; }
  .fb-bpreview.is-empty { min-height: 240px; }
  .fb-bpreview-empty {
    flex: 1; display: flex; flex-direction: column; align-items: center;
    justify-content: center; gap: 10px;
    padding: 40px 20px; min-height: 220px;
    border: 1.5px dashed #d4d8df; border-radius: 14px;
    background: #fff; color: #5a6470;
    font-size: 13.5px; text-align: center;
  }
  .fb-bpreview-empty-ico { font-size: 30px; }
  .fb-bpreview-empty p { margin: 0; }
  .fb-bpreview-h {
    font-size: 11px; font-weight: 700; color: #9aa4b2;
    text-transform: uppercase; letter-spacing: .05em;
  }
  .fb-bpreview-card {
    background: #fff; border: 1px solid #e6e9ef; border-radius: 12px;
    padding: 18px;
    box-shadow: 0 1px 3px rgba(20,40,80,.04);
  }
  .fb-bpreview-title { margin: 0 0 4px; font-size: 18px; font-weight: 600; color: #0a0a0a; }
  .fb-bpreview-blank {
    color: #aaa; font-size: 13px; text-align: center;
    padding: 24px 12px;
    border: 1px dashed #e6e9ef; border-radius: 8px;
  }
  .fb-bpreview-field { margin-bottom: 14px; }
  .fb-bpreview-label {
    display: block; font-size: 13px; font-weight: 600;
    color: #0a0a0a; margin-bottom: 6px;
  }
  .fb-bpreview-req { color: #c0392b; }
  .fb-bpreview-submit {
    width: 100%; padding: 11px;
    background: #185fa5; color: #fff;
    border: 0; border-radius: 8px;
    font-weight: 600; font-size: 14px;
    margin-top: 6px; cursor: not-allowed;
  }
  .fb-bpreview-thanks {
    padding: 12px 14px;
    background: #fff; border: 1px dashed #e6e9ef; border-radius: 10px;
  }
  .fb-bpreview-thanks-h {
    font-size: 11px; font-weight: 700; color: #9aa4b2;
    text-transform: uppercase; letter-spacing: .05em; margin-bottom: 6px;
  }
  .fb-bpreview-thanks-t {
    font-size: 13.5px; color: #0a0a0a; font-style: italic;
  }

  .fb-wait-row {
    display: flex; align-items: center; gap: 10px;
  }
  .fb-wait-num {
    width: 80px; text-align: center; font-size: 16px; font-weight: 700;
  }
  .fb-wait-unit { font-size: 14px; color: #4b5563; }

  /* ── Call activity panel (5-year-old simple) ─────────────────────────
     Numbered rows + a friendly tone picker + a "what'll happen" list.
     No live preview, no editable prompt — just three checkbox-easy
     decisions and a plain-language summary. */
  .fb-call-panel {
    display: flex; flex-direction: column; gap: 18px;
    max-width: 560px; margin: 0 auto;
  }
  .fb-call-row {
    display: grid; grid-template-columns: 36px 1fr; gap: 12px;
    align-items: start;
  }
  .fb-call-row-num {
    width: 30px; height: 30px; border-radius: 50%;
    background: #185fa5; color: #fff;
    display: flex; align-items: center; justify-content: center;
    font: 700 14px inherit; line-height: 1;
    flex-shrink: 0;
  }
  .fb-call-row-body { min-width: 0; }
  .fb-call-label {
    display: block; font: 600 14.5px inherit; color: #0a0a0a;
    margin-bottom: 8px;
  }
  .fb-call-target { display: flex; flex-direction: column; gap: 8px; }
  .fb-call-target-card {
    display: grid; grid-template-columns: 36px 1fr; gap: 12px;
    align-items: start;
    padding: 12px 14px;
    background: #fff; border: 1.5px solid #e5e7eb;
    border-radius: 12px; cursor: pointer;
    font: inherit; color: #0a0a0a; text-align: left;
    transition: border-color .12s, background .12s, transform .12s;
  }
  .fb-call-target-card:hover {
    border-color: #cbd5e1; transform: translateY(-1px);
  }
  .fb-call-target-card.is-picked {
    border-color: #185fa5; background: #eff6ff;
    box-shadow: 0 0 0 3px rgba(24,95,165,.12);
  }
  .fb-call-target-ico {
    font-size: 22px; line-height: 1;
    align-self: center; text-align: center;
  }
  .fb-call-target-body {
    display: flex; flex-direction: column; gap: 3px; min-width: 0;
  }
  .fb-call-target-title { font-size: 14px; font-weight: 600; }
  .fb-call-target-sub   { font-size: 12.5px; color: #5a6470; }

  /* Email recipient picker — first thing in the standalone Email
     drawer, designed to read at a glance: big icon, plain title,
     short helper line, and an obvious checkmark on the picked card.
     Bigger padding + softer borders + a friendly blue tint so it
     doesn't look like the rest of the form fields. */
  .fb-erecip {
    margin: 0 0 16px;
    padding: 16px 18px;
    border-radius: 16px;
    background: linear-gradient(180deg, #f0f7ff 0%, #ffffff 80%);
    border: 1px solid #dbeafe;
  }
  .fb-erecip-h {
    display: flex; align-items: center; gap: 8px;
    font: 700 15px inherit; color: #0a0a0a;
    margin-bottom: 12px;
  }
  .fb-erecip-h-ico { font-size: 20px; line-height: 1; }
  .fb-erecip-cards {
    display: flex; flex-direction: column; gap: 10px;
  }
  .fb-erecip-card {
    position: relative;
    display: grid;
    grid-template-columns: 44px 1fr 24px;
    align-items: center;
    gap: 14px;
    padding: 14px 16px;
    background: #fff;
    border: 2px solid #e5e7eb;
    border-radius: 14px;
    cursor: pointer;
    font: inherit; color: #0a0a0a; text-align: left;
    transition: border-color .14s, transform .14s, box-shadow .14s, background .14s;
  }
  .fb-erecip-card:hover:not(.is-disabled) {
    border-color: #93c5fd;
    transform: translateY(-1px);
    box-shadow: 0 6px 14px rgba(15,23,42,.06);
  }
  .fb-erecip-card.is-picked {
    border-color: #2563eb;
    background: #eff6ff;
    box-shadow: 0 0 0 4px rgba(37,99,235,.12);
  }
  .fb-erecip-card.is-disabled {
    opacity: .55; cursor: not-allowed;
  }
  .fb-erecip-card-ico {
    width: 44px; height: 44px; border-radius: 50%;
    background: #dbeafe;
    display: flex; align-items: center; justify-content: center;
    font-size: 22px; line-height: 1;
    flex-shrink: 0;
  }
  .fb-erecip-card.is-picked .fb-erecip-card-ico {
    background: #2563eb; color: #fff;
  }
  .fb-erecip-card-body {
    display: flex; flex-direction: column; gap: 3px; min-width: 0;
  }
  .fb-erecip-card-title {
    font-size: 14.5px; font-weight: 600; line-height: 1.25;
  }
  .fb-erecip-card-sub {
    font-size: 12.5px; color: #5a6470; line-height: 1.4;
  }
  .fb-erecip-card-mark {
    width: 24px; height: 24px; border-radius: 50%;
    background: transparent;
    display: flex; align-items: center; justify-content: center;
    font: 700 14px inherit;
    color: transparent;
  }
  .fb-erecip-card.is-picked .fb-erecip-card-mark {
    background: #2563eb; color: #fff;
  }
  .fb-erecip-detail {
    margin-top: 12px;
    width: 100%;
    padding: 12px 14px !important;
    font-size: 14px !important;
    border: 2px solid #dbeafe !important;
    border-radius: 12px;
    background: #fff;
  }
  .fb-erecip-detail:focus {
    border-color: #2563eb !important;
    box-shadow: 0 0 0 3px rgba(37,99,235,.15) !important;
  }
  /* Call-channel variant — mint-green color scheme matching the
     channel-coded cards used elsewhere on the canvas (e.g. the
     Notify Me call sub-section). */
  .fb-erecip.is-call {
    background: linear-gradient(180deg, #ecfdf5 0%, #ffffff 80%);
    border-color: #a7f3d0;
  }
  .fb-erecip.is-call .fb-erecip-card-ico {
    background: #d1fae5;
  }
  .fb-erecip.is-call .fb-erecip-card:hover:not(.is-disabled) {
    border-color: #6ee7b7;
  }
  .fb-erecip.is-call .fb-erecip-card.is-picked {
    border-color: #059669;
    background: #ecfdf5;
    box-shadow: 0 0 0 4px rgba(5,150,105,.15);
  }
  .fb-erecip.is-call .fb-erecip-card.is-picked .fb-erecip-card-ico {
    background: #059669; color: #fff;
  }
  .fb-erecip.is-call .fb-erecip-card.is-picked .fb-erecip-card-mark {
    background: #059669; color: #fff;
  }
  .fb-erecip.is-call .fb-erecip-detail {
    border-color: #a7f3d0 !important;
  }
  .fb-erecip.is-call .fb-erecip-detail:focus {
    border-color: #059669 !important;
    box-shadow: 0 0 0 3px rgba(5,150,105,.15) !important;
  }
  /* Voice preview play button — sits in the call composer header so
     the owner can hear the AI read the script with their picked
     voice + tone before saving the flow. Mint accent matches the
     rest of the call section. */
  .fb-call-composer-h {
    display: flex; align-items: center; gap: 12px;
  }
  .fb-voice-preview-btn {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 6px 12px;
    background: #059669; color: #fff;
    border: 0; border-radius: 999px;
    font: 600 12.5px inherit;
    cursor: pointer;
    box-shadow: 0 1px 2px rgba(5,150,105,.18);
    transition: background .14s, transform .14s, box-shadow .14s;
  }
  .fb-voice-preview-btn:hover:not(:disabled) {
    background: #047857;
    transform: translateY(-1px);
    box-shadow: 0 4px 10px rgba(5,150,105,.22);
  }
  .fb-voice-preview-btn:disabled {
    background: #cbd5e1; color: #fff;
    cursor: not-allowed; box-shadow: none;
  }
  .fb-voice-preview-btn.playing {
    background: #b91c1c;
  }
  .fb-voice-preview-btn.playing:hover {
    background: #991b1b;
  }
  .fb-voice-preview-spinner {
    width: 12px; height: 12px;
    border: 2px solid rgba(255,255,255,.4);
    border-top-color: #fff;
    border-radius: 50%;
    animation: fb-vp-spin .8s linear infinite;
  }
  @keyframes fb-vp-spin {
    to { transform: rotate(360deg); }
  }
  .fb-voice-preview-err {
    margin: 6px 14px 0;
    padding: 6px 10px;
    background: #fef2f2; border: 1px solid #fecaca;
    color: #991b1b;
    font-size: 12.5px;
    border-radius: 8px;
  }

  .fb-tone-grid {
    display: grid; grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
  }
  @media (max-width: 480px) {
    .fb-tone-grid { grid-template-columns: 1fr; }
  }
  .fb-tone-card {
    display: flex; flex-direction: column; align-items: center; gap: 4px;
    padding: 12px 8px;
    background: #fff; border: 1.5px solid #e5e7eb;
    border-radius: 12px; cursor: pointer;
    font: inherit; color: #0a0a0a;
    transition: border-color .12s, background .12s, transform .12s;
  }
  .fb-tone-card:hover {
    border-color: #cbd5e1; transform: translateY(-1px);
  }
  .fb-tone-card.is-picked {
    border-color: #185fa5; background: #eff6ff;
    box-shadow: 0 0 0 3px rgba(24,95,165,.12);
  }
  .fb-tone-card-ico { font-size: 24px; line-height: 1; }
  .fb-tone-card-label { font-size: 13px; font-weight: 600; }
  .fb-call-summary {
    margin-top: 4px; padding: 14px 16px;
    background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px;
  }
  .fb-call-summary-h {
    font-size: 12.5px; font-weight: 700; color: #475569;
    text-transform: uppercase; letter-spacing: .04em; margin-bottom: 8px;
  }
  .fb-call-summary-list {
    margin: 0; padding-left: 18px;
    font-size: 14px; line-height: 1.6; color: #0a0a0a;
  }
  .fb-call-summary-list li { margin-bottom: 2px; }

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
  .fb-phone-call {
    padding: 12px 14px;
    background: #ecfdf5;
    border: 1px solid #a7f3d0; border-radius: 12px;
  }
  .fb-phone-call-h {
    font: 700 12px inherit; color: #047857;
    text-transform: uppercase; letter-spacing: .04em;
    margin-bottom: 6px;
  }
  .fb-phone-call-body {
    font-size: 12.5px; color: #064e3b; line-height: 1.5;
    white-space: pre-wrap; word-wrap: break-word;
  }
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
    /* Pattern A — overlay sits BEHIND the textarea. The textarea on
       top owns the visible text AND the caret, so the cursor is
       NEVER hidden by chip backgrounds. The overlay paints chip
       backgrounds in a saturated color that shows clearly through
       the textarea's transparent background. */
    color: transparent;
    border: 1.5px solid transparent;
    padding: 18px 20px;
    font-size: 15px;
    line-height: 1.6;
    scrollbar-width: none;
    -ms-overflow-style: none;
  }
  .fb-htxt-overlay::-webkit-scrollbar { display: none; }
  .fb-htxt-input {
    position: relative;
    z-index: 1;
    background: transparent;
    /* Caret is always visible because the textarea is the top layer. */
  }
  .fb-htxt-tok,
  .fb-composer .fb-htxt-overlay .fb-htxt-tok,
  .fb-htxt-overlay .fb-htxt-tok {
    /* Variable pill — Pattern A (overlay BEHIND, textarea on top).
       Chip BG paints in the overlay layer; the textarea on top has
       background: transparent so the chip shows through. Caret is
       drawn by the textarea on top — always visible.

       Width-neutral so cursor positions line up to the visible glyph:
         - NO padding/margin/border
         - NO font-weight / letter-spacing change
         - chip text stays transparent (textarea handles glyphs)

       High-saturation yellow so the chip is unmistakable behind any
       text color. The duplicated selectors boost specificity past any
       cascade override. */
    background-color: #fde68a !important;     /* warm amber — unmissable */
    color: transparent !important;            /* textarea on top paints the text */
    border-radius: 3px !important;
    box-shadow: 0 0 0 1px #f59e0b !important; /* amber outline, no width */
    font-weight: inherit !important;
    font-style: inherit !important;
    letter-spacing: inherit !important;
    padding: 0 !important;
    margin: 0 !important;
    display: inline !important;
    -webkit-box-decoration-break: clone;
    box-decoration-break: clone;
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

  /* ════════════════════════════════════════════════════════════════
     POLISH PASS — overrides only. Each block targets a specific
     issue from the polish spec. Cascade order means these win over
     the earlier definitions without us having to mutate them.
     ════════════════════════════════════════════════════════════════ */

  /* Issue 2 — type selector tiles: horizontal, 72px, channel tints,
     better selected state. Replaces the stacked icon-over-label that
     left tiles feeling empty. */
  .fb-modes-3 {
    display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px;
    margin: 0 0 18px;
  }
  .fb-mode3 {
    position: relative;
    flex-direction: row; align-items: center; justify-content: center;
    gap: 10px; height: 72px; padding: 0 12px;
    border-width: 1px;
    transition: background-color .15s, border-color .15s;
  }
  .fb-mode3-ico { font-size: 20px; line-height: 1; }
  .fb-mode3-label { font: 500 14px inherit; }
  .fb-mode3.is-active { border-width: 2px; padding: 0 11px; font-weight: 700; }
  .fb-mode3.is-email:hover:not(.is-active) { background: #f0f7ff; border-color: #e5e7eb; }
  .fb-mode3.is-sms:hover:not(.is-active)   { background: #faf7ff; border-color: #e5e7eb; }
  .fb-mode3.is-both:hover:not(.is-active)  { background: #fffaf0; border-color: #e5e7eb; }

  /* Issue 1 — Recommended badge: inset into Both tile's top-right,
     muted amber, sparkle icon, sentence case. Slight overlap with the
     border is fine and intentional. */
  .fb-mode3-rec {
    position: absolute; top: -8px; right: 8px;
    display: inline-flex; align-items: center; gap: 3px;
    padding: 2px 7px 2px 6px;
    background: #fef3c7; color: #92400e;
    border: 1px solid #fcd34d; border-radius: 999px;
    font: 600 10px inherit; letter-spacing: 0.04em;
    line-height: 1.4; white-space: nowrap;
    box-shadow: 0 1px 2px rgba(15,23,42,.05);
  }

  /* Issue 5 — lead row hierarchy. Bigger circular icon with soft
     green fill; clearer two-line typography. */
  .fb-recip-lead {
    align-items: center; gap: 12px; padding: 6px 4px;
  }
  .fb-recip-lead-ico {
    width: 24px; height: 24px;
    flex: 0 0 24px;
  }
  .fb-recip-lead.is-on .fb-recip-lead-ico {
    background: #dcfce7; color: #16a34a;
  }
  .fb-recip-lead-text { gap: 4px; }
  .fb-recip-lead-l {
    font: 500 14px inherit; color: #111827; line-height: 1.2;
  }
  .fb-recip-lead-s {
    font: 400 13px inherit; color: #94a3b8; line-height: 1.2;
  }

  /* Issue 6 — section title system. Sentence case, 14px medium.
     "Who gets this?" already matches; add the same for "Your message". */
  .fb-section-h {
    font: 500 14px inherit; color: #111827;
    margin: 0 0 8px;
  }
  .fb-section-h-sub {
    font: 400 13px inherit; color: #9ca3af;
  }
  /* Demote "Also send to" to a regular sub-label. */
  .fb-recip-also-l {
    font: 400 12.5px inherit; color: #94a3b8;
    text-transform: none; letter-spacing: 0;
  }
  .fb-recip-flat-h { font-weight: 500; font-size: 14px; }

  /* Issue 7 — input/textarea uniformity. Single source of truth for
     border, radius, padding, focus ring. The composer textarea inherits
     these via the same focus-ring color. */
  .fb-input,
  .fb-textarea,
  .fb-composer-ta,
  .fb-recip-box,
  .fb-prev-testdata-v {
    border: 1px solid #e5e7eb; border-radius: 8px;
    background: #fff;
    transition: border-color .15s, box-shadow .15s;
  }
  .fb-input { padding: 10px 12px; font-size: 15px; }
  .fb-textarea { padding: 12px; font-size: 15px; }
  .fb-input::placeholder,
  .fb-textarea::placeholder,
  .fb-recip-input::placeholder,
  .fb-prev-testdata-v::placeholder {
    color: #9ca3af;
  }
  .fb-input:focus,
  .fb-textarea:focus,
  .fb-prev-testdata-v:focus,
  .fb-recip-box:focus-within,
  .fb-composer:focus-within {
    border-color: #16a34a;
    box-shadow: 0 0 0 3px rgba(22,163,74,.10);
  }

  /* Issue 9 — subject reveal animation. Conditional render means the
     element appears/disappears, so we wrap a CSS transition on the
     parent with grid-rows trick.  Cheap implementation: a brief
     fade+slide on every fresh mount via animation. */
  .fb-input,
  .fb-subject-help {
    animation: fb-fade-in .2s ease-out;
  }
  @keyframes fb-fade-in {
    from { opacity: 0; transform: translateY(-2px); }
    to   { opacity: 1; transform: none; }
  }

  /* Issue 4 — phone mockup: thinner bezel, ~20% smaller, dark gray (not pure black). */
  .fb-phone {
    width: 224px; height: 384px;
    background: #2a2a2a; border-radius: 28px;
    padding: 6px;
    box-shadow: none;
  }
  .fb-phone-notch {
    width: 70px; height: 16px;
    background: #2a2a2a; border-radius: 10px;
    top: 8px;
  }
  .fb-phone-screen {
    border-radius: 22px;
    padding: 28px 10px 10px;
  }
  /* Bigger relative content inside the phone — bubble + email card. */
  .fb-phone-sms-from { font-size: 12.5px; margin-bottom: 10px; }
  .fb-phone-sms-bubble {
    font-size: 14.5px; line-height: 1.45;
    padding: 10px 14px; border-radius: 18px;
    max-width: 86%;
  }
  .fb-phone-mail { padding: 12px; margin: 4px 2px; }
  .fb-phone-mail-from { font-size: 13px; }
  .fb-phone-mail-subject { font-size: 14.5px; }
  .fb-phone-mail-body { font-size: 13.5px; }

  /* Polish 4 — preview content fade. 50ms is barely perceptible but
     smooths style/layout shifts. We can't transition between two
     different React text nodes, but transitioning the container
     opacity makes typing-induced re-layouts feel less jittery. */
  .fb-phone-sms-bubble,
  .fb-phone-mail-subject,
  .fb-phone-mail-body {
    transition: opacity 50ms ease-out;
  }

  /* Issue 3 — combined right-pane header */
  .fb-prev-header {
    display: flex; align-items: center; justify-content: space-between;
    gap: 10px; width: 100%; margin-bottom: 8px;
  }
  .fb-prev-header-l {
    font: 500 13px inherit; color: #6b7280;
    text-transform: none; letter-spacing: 0;
  }
  .fb-prev-header-pills {
    display: inline-flex; gap: 6px;
  }
  .fb-drawer-preview-l { display: none !important; }   /* old eyebrow gone */
  .fb-prev-source {
    width: 100%; margin-bottom: 8px;
    display: flex; justify-content: flex-start;
  }

  /* Issue 8 — footer: Send-a-test as outlined secondary button. */
  .fb-drawer-test-btn {
    display: inline-flex; align-items: center;
    background: #fff; border: 1px solid #e5e7eb;
    color: #111827; font: 600 13px inherit; cursor: pointer;
    padding: 8px 14px; border-radius: 999px;
    transition: background-color .12s, border-color .12s;
  }
  .fb-drawer-test-btn:hover { background: #f9fafb; border-color: #cbd5e1; }
  .fb-drawer-foot-r { gap: 12px; }
  .fb-drawer-foot {
    align-items: center;
  }
  .fb-drawer-del {
    color: #b91c1c; opacity: .8;
  }
  .fb-drawer-del:hover { opacity: 1; background: #fef2f2; }

  /* Polish 1 — subtle horizontal separators between drawer sections.
     Done with a top border on the section roots so we don't have to
     insert <hr> elements. */
  .fb-recip-flat,
  .fb-section-h {
    padding-top: 18px;
    border-top: 1px solid #f1f5f9;
  }
  /* …but the very first child shouldn't have a top border. */
  .fb-drawer-edit > .fb-recip-flat:first-child,
  .fb-drawer-edit > .fb-section-h:first-child,
  .fb-modes-3 + .fb-recip-flat,
  .fb-modes-3 ~ .fb-section-h:first-of-type { border-top: none; padding-top: 0; }
  /* Type selector itself doesn't get a separator — it sits at the top. */

  /* Polish 2 — Insert variable button: lucide-style plus icon. */
  .fb-chip-outline-ico { display: inline-block; vertical-align: -2px; margin-right: 6px; }

  /* Polish 3 — variable chip pulse: scale + opacity, 300ms.
     Replaces the earlier flash that just swapped colors. */
  @keyframes fb-chip-flash {
    0%   { transform: scale(1);    opacity: 1; }
    40%  { transform: scale(1.05); opacity: 0.7; }
    100% { transform: scale(1);    opacity: 1; }
  }
  .fb-chip.is-flash { animation: fb-chip-flash 300ms ease-out; }

  /* Polish 5 — empty-state copy for the chip rail. */
  .fb-composer-rail-empty {
    color: #94a3b8; font: 400 12.5px inherit; padding: 2px 4px;
  }

  /* ════════════════════════════════════════════════════════════════
     RIGHT-PANE FIX PASS — zero scrollbars, zero layout shift.
     Splits the drawer body so each pane manages its own overflow:
     - Left pane scrolls when its content overflows
     - Right pane is fixed-height, never scrolls, content fits
     - Switching Sample/Test data SWAPS content (no stacking)
     ════════════════════════════════════════════════════════════════ */
  .fb-drawer-body {
    /* Override: don't let the whole body scroll — that put both
       panes in one scroller, defeating "right pane always visible". */
    overflow: hidden;
    min-height: 0;        /* needed for flex child to allow inner scroll */
  }
  .fb-drawer-edit {
    /* Only the left pane scrolls — right pane stays put. The
       scrollbar chrome itself is HIDDEN (Firefox + WebKit + IE) so
       the panel reads as scrollbar-free, but wheel / trackpad / touch
       scrolling still works for tall configurations. */
    overflow-y: auto;
    overflow-x: hidden;
    min-height: 0;
    padding-right: 0;
    scrollbar-width: none;          /* Firefox */
    -ms-overflow-style: none;       /* IE 10+ */
  }
  .fb-drawer-edit::-webkit-scrollbar { width: 0; height: 0; display: none; }
  .fb-drawer-preview {
    /* Fixed-height pane: header (2 rows) on top, content area below.
       Content area never produces a scrollbar — child views fit. */
    display: flex; flex-direction: column;
    min-height: 0; overflow: hidden;
    align-items: stretch !important;
    align-self: start;
    padding: 4px 4px 0;
  }

  /* Header is 2 rows max. Anything above the slot is header chrome. */
  .fb-prev-header { flex: 0 0 auto; }
  .fb-prev-source { flex: 0 0 auto; }

  /* The shared content slot. Sample customer / Test data each take
     this whole slot — never both at once. */
  .fb-prev-slot {
    flex: 1 1 auto;
    display: flex; flex-direction: column;
    align-items: center; justify-content: flex-start;
    min-height: 0;
    width: 100%;
  }

  /* Phone responsive sizing (Fix 6). The earlier override hardcoded
     224px; this one adapts to the parent pane's width. */
  .fb-phone {
    width: 280px; max-width: calc(100% - 24px);
    height: auto; aspect-ratio: 7 / 12;
    flex: 0 0 auto;
    margin: 12px auto 0;
  }
  @media (max-width: 1200px) { .fb-phone { width: 240px; } }
  @media (max-width: 768px)  { .fb-phone { width: 200px; } }

  /* Test-data pane (Fix 7): compact rows, fits the same vertical
     space as the phone — no awkward whitespace difference between
     the two views. */
  .fb-prev-testdata-pane {
    width: 100%;
    display: flex; flex-direction: column; gap: 8px;
    padding: 8px 0 0;
  }
  .fb-prev-testdata-intro {
    margin: 0; font: 400 12.5px inherit; color: #6b7280;
    line-height: 1.4;
  }
  .fb-prev-testdata-intro strong { color: #111827; font-weight: 600; }
  .fb-prev-testdata {
    /* Override: no internal scroll. The "Show N more" disclosure
       handles overflow without giving the right pane a scrollbar. */
    max-height: none; overflow: visible;
    background: transparent; border: 0; padding: 0;
    display: flex; flex-direction: column; gap: 8px;
  }
  .fb-prev-testdata-row {
    display: grid; grid-template-columns: 40% 60%;
    align-items: center; gap: 0;
    height: 36px;
  }
  .fb-prev-testdata-k {
    font: 400 13px inherit; color: #475569;
    padding-right: 10px;
  }
  .fb-prev-testdata-v {
    height: 32px; padding: 0 10px;
    font: 400 13px inherit;
  }
  .fb-prev-testdata-more {
    margin: 4px 0 0; padding: 4px 2px;
    background: transparent; border: 0; cursor: pointer;
    color: #16a34a; font: 500 12.5px inherit;
    align-self: flex-start;
  }
  .fb-prev-testdata-more:hover { text-decoration: underline; }

  /* Empty state when no recipients. */
  .fb-prev-empty {
    margin: 24px auto; padding: 18px 20px;
    color: #6b7280; font: 400 13px inherit;
    text-align: center;
    background: #f8fafc; border: 1px dashed #e2e8f0;
    border-radius: 10px; max-width: 240px;
  }

  /* ════════════════════════════════════════════════════════════════
     COMPRESSION PASS — fit the whole panel in one viewport.
     Each block matches a "Cut #" from the spec; targets are ~270px
     of vertical savings (920px → ~650px).
     ════════════════════════════════════════════════════════════════ */

  /* Container — full-height drawer (top: 0; bottom: 0 from the base
     style). Compression pass keeps the internal sections tight so the
     footer stays visible without needing a height cap or margin gap. */

  /* Cut 1 — header: drop eyebrow, single 48px row, tight padding. */
  .fb-drawer-h {
    padding: 12px 18px;
    align-items: center;
  }
  .fb-drawer-h-title { font-size: 16px; font-weight: 600; }
  .fb-drawer-h-ico { font-size: 18px; }

  /* Cut 9 — section gaps + body padding. */
  .fb-drawer-body { padding: 16px 18px; gap: 16px; }

  /* Cut 2 — type selector tiles: 56px tall, 1.5px active border. */
  .fb-modes-3 { gap: 8px; margin: 0 0 12px; }
  .fb-mode3 {
    height: 56px; padding: 0 16px; gap: 8px;
  }
  .fb-mode3-ico { font-size: 18px; }
  .fb-mode3-label { font-size: 13.5px; }
  .fb-mode3.is-active { border-width: 1.5px; padding: 0 15.5px; }

  /* Cut 3 — recipients: single-line lead toggle + 40px chip rows,
     tighter gaps, drop the "also send to" sub-label spacing. */
  .fb-recip-flat { gap: 10px; padding-top: 12px; margin-top: 0; margin-bottom: 0; }
  .fb-recip-flat-h { font-size: 13.5px; margin-bottom: 0; }
  .fb-recip-lead { height: 36px; padding: 0 4px; gap: 10px; }
  .fb-recip-lead-l { font: 400 14px inherit; line-height: 1.2; }
  .fb-recip-lead-text { gap: 0; }     /* single-line now */
  .fb-recip-lead-s { display: none; } /* sub-line removed for compression */

  .fb-recip-also { gap: 8px; padding-left: 0; }
  .fb-recip-box { min-height: 40px; padding: 4px 8px; }
  .fb-recip-prefix { font-size: 12px; }
  .fb-recip-input { font-size: 14px; padding: 4px; }
  .fb-recip-chip { padding: 3px 4px 3px 8px; font-size: 12.5px; }

  /* Cut 4 — subject row: 40px input with inline ✉️ prefix. */
  .fb-subject-wrap {
    position: relative; display: block;
  }
  .fb-subject-prefix {
    position: absolute; left: 12px; top: 50%; transform: translateY(-50%);
    color: #94a3b8; font-size: 14px; pointer-events: none;
    user-select: none;
  }
  .fb-subject-input {
    height: 40px; padding: 0 12px 0 36px !important;
    font-size: 14px !important;
  }

  /* Cut 6 — message textarea default + cap. */
  .fb-composer-ta {
    min-height: 120px; max-height: 240px;
    padding: 10px 12px;
    font-size: 15px;
  }

  /* Cut 7 — chip rail attached to textarea, tighter padding, 28px chips. */
  .fb-composer-rail { padding: 8px 8px; gap: 4px; }
  .fb-chip { height: 28px; padding: 0 10px; font-size: 12.5px; line-height: 28px; }
  .fb-chip-outline { height: 28px; padding: 0 10px; font-size: 12.5px; line-height: 26px; }
  .fb-charcount { margin-top: 4px; font-size: 11.5px; }

  /* Cut 8 — footer: 56px, 36px buttons, 16px horizontal padding. */
  .fb-drawer-foot { padding: 10px 16px; min-height: 56px; }
  .fb-drawer-done { height: 36px; padding: 0 16px; font-size: 13px; }
  .fb-drawer-test-btn { height: 36px; padding: 0 14px; font-size: 13px; }
  .fb-drawer-del { height: 36px; padding: 0 8px; font-size: 13px; }

  /* Removed visual separators between sections — the compression
     left them feeling like extra clutter rather than helpful dividers. */
  .fb-recip-flat,
  .fb-section-h,
  .fb-section-h:first-of-type {
    border-top: none;
  }

  /* Used-variable highlight: chips and picker rows. Quick chip's used
     state has a green tint + leading check; picker row's used state has
     a soft green wash. Click on either toggles (insert ↔ remove). */
  .fb-chip.is-used {
    background: #dcfce7; border-color: #86efac;
    color: #14532d; font-weight: 600;
  }
  .fb-chip.is-used:hover {
    background: #fee2e2; border-color: #fca5a5; color: #991b1b;
  }
  .fb-chip-used { color: #16a34a; }
  .fb-chip.is-used:hover .fb-chip-used { color: #b91c1c; }

  .fb-varpicker-row.is-used { background: #f0fdf4; }
  .fb-varpicker-row.is-used .fb-varpicker-row-label { color: #14532d; font-weight: 600; }
  .fb-varpicker-row-used {
    color: #16a34a; font-weight: 700; margin-right: 4px;
  }
  .fb-varpicker-row.is-used .fb-varpicker-row-insert {
    background: #fee2e2; color: #991b1b;
  }

  /* Right pane needs the same compression budget — slimmer phone +
     no extra padding. The header stays 2 rows. */
  .fb-prev-header { margin-bottom: 6px; }
  .fb-prev-source { margin-bottom: 6px; }
  .fb-phone { margin-top: 6px; }
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
          Don't worry about losing work. Use{" "}
          <strong>← My Flows</strong> (top left) to head back to your
          flow library.
        </>
      ),
      target: ".fb-backpill",
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
    >?</button>
  );
}

// Top-left pill on the canvas. Always "← My Flows" — clicking it
// dispatches `fb-back-to-flows` which the dashboard listens for to
// switch panes back to the flow list.
function BackPill() {
  const onClick = () => {
    try {
      window.dispatchEvent(new CustomEvent("fb-back-to-flows"));
    } catch (_) {}
  };
  return (
    <button
      type="button"
      className="fb-backpill is-from-flows"
      onClick={onClick}
      title="Back to your flow library"
    >← My Flows</button>
  );
}

export default function FlowBuilder() {
  const [nodes, setNodes] = React.useState(INITIAL_NODES);
  const [edges, setEdges] = React.useState(INITIAL_EDGES);

  // Whenever the bound input form changes, publish its field list on
  // window so the Ask-AI rewrite can constrain its variable suggestions
  // to the ACTUAL fields collected by this flow's form. Without this,
  // the AI would happily emit {address} or {budget} tokens that the
  // form never collects, leaving placeholders un-substituted at send
  // time.
  React.useEffect(() => {
    const inputNode = (nodes || []).find(
      n => n.data && (n.data.activityId === "input" || n.data.kind === "trigger"));
    const formId = (inputNode && inputNode.data && inputNode.data.channelRef) || "";
    if (!formId) {
      try {
        delete window.__fb_input_form_fields;
        delete window.__fb_input_site_fields;
        window.dispatchEvent(new CustomEvent("fb-input-fields-changed"));
      } catch (_) {}
      return;
    }
    let cancelled = false;
    fetch(`/me/forms/${encodeURIComponent(formId)}`, { credentials: "same-origin" })
      .then(r => r.ok ? r.json() : null).catch(() => null)
      .then(d => {
        if (cancelled) return;
        const fields = (d && d.form && Array.isArray(d.form.fields)) ? d.form.fields : [];
        const siteFields = (d && d.form && Array.isArray(d.form.site_fields)) ? d.form.site_fields : [];
        try {
          window.__fb_input_form_fields = fields.map(f => ({
            key:   String(f.key || "").trim(),
            label: String(f.label || f.key || "").trim(),
            type:  String(f.type || "text").trim(),
          })).filter(f => f.key);
          window.__fb_input_site_fields = siteFields.map(f => ({
            key:   String(f.key || "").trim(),
            label: String(f.label || f.key || "").trim(),
          })).filter(f => f.key);
          try { window.dispatchEvent(new CustomEvent("fb-input-fields-changed")); }
          catch (_) {}
        } catch (_) {}
      });
    return () => { cancelled = true; };
    // Re-run when the bound form id changes.
  }, [(nodes || []).find(n => n.data && (n.data.activityId === "input"))?.data?.channelRef]);
  const [collapsed, setCollapsed] = React.useState(false);
  const [rfInstance, setRfInstance] = React.useState(null);
  const [isDropTarget, setIsDropTarget] = React.useState(false);
  // Selected node ID drives the message-editor drawer. Click a card on
  // the canvas → drawer opens. Click outside / press Esc / hit Done →
  // drawer closes.
  const [selectedNodeId, setSelectedNodeId] = React.useState(null);

  // ── Test runner state ─────────────────────────────────────────────
  // testStatus: idle | configuring | running | done
  const [testStatus, setTestStatus]   = React.useState("idle");
  const [testInputs, setTestInputs]   = React.useState({});
  const [testReplies, setTestReplies] = React.useState({}); // nodeId → "yes" | "no"
  const [testSummary, setTestSummary] = React.useState(null);
  const [testError, setTestError]     = React.useState(null);
  const [testAnnouncement, setTestAnnouncement] = React.useState("");
  const testCancelRef = React.useRef(false);

  const TEST_INPUTS_LOCAL_KEY = "fb-test-inputs";

  function setNodeRunState(nodeId, runState, payload) {
    setNodes(ns => ns.map(n =>
      n.id === nodeId
        ? { ...n, data: { ...n.data, runState, runPayload: payload } }
        : n
    ));
  }

  function setEdgeRunState(edgeId, runState) {
    setEdges(es => es.map(e =>
      e.id === edgeId
        ? { ...e, data: { ...(e.data || {}), runState } }
        : e
    ));
  }

  function clearAllRunStates() {
    setNodes(ns => ns.map(n =>
      n.data && (n.data.runState || n.data.runPayload)
        ? { ...n, data: { ...n.data, runState: undefined, runPayload: undefined } }
        : n
    ));
    setEdges(es => es.map(e =>
      e.data && e.data.runState
        ? { ...e, data: { ...e.data, runState: undefined } }
        : e
    ));
  }

  function nodeTitleById(nodeId) {
    const n = nodes.find(x => x.id === nodeId);
    if (!n) return "Step";
    return (n.data && n.data.title)
      || (ACTIVITY_BY_ID[n.data && n.data.activityId] && ACTIVITY_BY_ID[n.data.activityId].title)
      || "Step";
  }

  function openTestModal() {
    // Seed from localStorage (last values the user actually typed), or
    // empty otherwise. We deliberately do NOT pre-fill SAMPLE_INPUT_DATA
    // — that confused the user when the AI read out "Sam Tester" / sample
    // values they hadn't entered. The modal's input placeholders still
    // surface the samples so users know the shape, and a "Use sample
    // data" button below fills them in on-demand.
    let saved = {};
    try {
      saved = JSON.parse(localStorage.getItem(TEST_INPUTS_LOCAL_KEY) || "{}");
    } catch (_) { saved = {}; }
    const fields = discoverInputFields(nodes);
    const seed = {};
    for (const f of fields) {
      seed[f] = (saved[f] != null && saved[f] !== "") ? saved[f] : "";
    }
    setTestInputs(seed);
    // Default reply behavior: "yes" for every Reply node.
    const replyDefaults = {};
    for (const n of nodes) {
      if (n.data && n.data.activityId === "reply") replyDefaults[n.id] = "yes";
    }
    setTestReplies(replyDefaults);
    setTestError(null);
    setTestSummary(null);
    setTestStatus("configuring");
  }

  function closeTestModal() {
    if (testStatus === "running") return;  // Can't close while running.
    setTestStatus("idle");
  }

  async function runTheTest() {
    setTestError(null);
    setTestSummary(null);
    clearAllRunStates();
    testCancelRef.current = false;
    setTestStatus("running");
    setTestAnnouncement("Test started");
    // Persist inputs so the user doesn't re-type them next time.
    try {
      localStorage.setItem(TEST_INPUTS_LOCAL_KEY, JSON.stringify(testInputs));
    } catch (_) {}
    try {
      const summary = await runFlowSimulation({
        nodes, edges,
        inputs: testInputs,
        replyChoices: testReplies,
        onNodeState: (nodeId, state, payload) => {
          setNodeRunState(nodeId, state, payload);
          if (state === "running")   setTestAnnouncement(`${nodeTitleById(nodeId)} started`);
          if (state === "completed") setTestAnnouncement(`${nodeTitleById(nodeId)} completed`);
          if (state === "failed")    setTestAnnouncement(`${nodeTitleById(nodeId)} failed: ${payload && payload.message ? payload.message : "error"}`);
          if (state === "skipped")   setTestAnnouncement(`${nodeTitleById(nodeId)} skipped`);
        },
        onEdgeState: (edgeId, state) => setEdgeRunState(edgeId, state),
        onLog: () => {},  // summary is enough
        isCancelled: () => testCancelRef.current,
      });
      setTestSummary(summary);
      setTestStatus("done");
      setTestAnnouncement(
        (summary.failed && summary.failed.length > 0)
          ? "Test had a problem"
          : "Test complete"
      );
    } catch (err) {
      setTestError(err.message || String(err));
      setTestStatus("done");
      setTestAnnouncement("Test stopped: " + (err.message || "error"));
    }
  }

  function stopTheTest() {
    testCancelRef.current = true;
    setTestAnnouncement("Stopping test…");
  }

  function dismissTestSummary() {
    setTestStatus("idle");
    setTestSummary(null);
    setTestError(null);
    clearAllRunStates();
  }

  function jumpToFailedStep() {
    if (!testSummary || !testSummary.failed || testSummary.failed.length === 0) return;
    const failedId = testSummary.failed[0].nodeId;
    const node = nodes.find(n => n.id === failedId);
    if (!node || !rfInstance) return;
    try {
      rfInstance.setCenter(
        (node.position && node.position.x) || 0,
        (node.position && node.position.y) || 0,
        { zoom: 1.1, duration: 400 }
      );
    } catch (_) {}
  }
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
  // showPicker is computed AFTER userFlowId is declared further down
  // (let-binding hoisting would TDZ-trap us). See the second derivation
  // below the userFlowId useState.

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
  // User-named flow id (set when the user clicks Start blank or
  // selects a flow card from My Flows). When present and there's no
  // formId, the canvas reads/writes /me/flows/user/<id> instead of
  // the singleton /me/flows/default.
  const [userFlowId, setUserFlowId] = React.useState(() => {
    try {
      const fromForm = sessionStorage.getItem("outreach_came_from_form") === "1";
      if (fromForm) return "";
      return localStorage.getItem("outreach_active_user_flow_id") || "";
    } catch (_) { return ""; }
  });
  React.useEffect(() => {
    const onReset = () => {
      // The dashboard sets exactly one breadcrumb before dispatching
      // this event (form vs. user-named vs. legacy default). Don't
      // wipe storage here — that happens at the click site so the
      // event listener can read whichever was just set.
      try {
        const fromForm = sessionStorage.getItem("outreach_came_from_form") === "1";
        if (fromForm) {
          setFormId(localStorage.getItem("intake_return_form_id") || "");
          setUserFlowId("");
        } else {
          setFormId("");
          setUserFlowId(localStorage.getItem("outreach_active_user_flow_id") || "");
        }
      } catch (_) {
        setFormId("");
        setUserFlowId("");
      }
    };
    window.addEventListener("fb-outreach-nav-reset", onReset);
    return () => window.removeEventListener("fb-outreach-nav-reset", onReset);
  }, []);
  const flowEndpoint = formId
    ? `/me/forms/${encodeURIComponent(formId)}/flow`
    : (userFlowId
        ? `/me/flows/user/${encodeURIComponent(userFlowId)}`
        : "/me/flows/default");

  // showPicker / TemplatePicker have been removed entirely — empty
  // canvases now open without an interrupting popup; users start from
  // the Library on the left or land on a synthesized pack flow.

  // Canvas state machine — three explicit entry-path states:
  //   STATE A (blank): no formId AND no saved flow → leave canvas
  //     empty so the TemplatePicker overlay shows. No fake seed.
  //   STATE B (loaded): saved flow exists → load and display verbatim.
  //   STATE C (form-attached): formId set and no saved flow yet →
  //     seed first_contact AND persist immediately so a refresh
  //     returns the saved flow (idempotent — never duplicates).
  //
  // Stale-while-revalidate: when we have a sessionStorage cache for
  // this exact flow_id, paint from cache INSTANTLY (no blank-canvas
  // flash, no GCS round-trip on the critical path) and revalidate
  // in the background. The cache key is the same `flowEndpoint` URL
  // we'd otherwise GET, so switching forms/flows automatically uses
  // the right cache slot. Cache writes happen here on fresh load
  // AND in the autosave path so edits propagate without invalidation.
  React.useEffect(() => {
    let cancelled = false;
    const cacheKey = "fbflow:" + flowEndpoint;
    let paintedFromCache = false;
    try {
      const raw = window.sessionStorage.getItem(cacheKey);
      if (raw) {
        const cached = JSON.parse(raw);
        const cflow = cached && cached.flow;
        if (cflow && Array.isArray(cflow.nodes) && cflow.nodes.length > 0) {
          setNodes(cflow.nodes);
          setEdges(Array.isArray(cflow.edges) ? cflow.edges : []);
          setPickerDismissed(true);
          setHydrated(true);
          paintedFromCache = true;
        }
      }
    } catch (_) { /* ignore corrupt cache */ }
    // No cache hit → blank the canvas first so the previous flow
    // doesn't flash. With a cache hit, we keep the cached paint
    // visible while revalidating in the background.
    if (!paintedFromCache) {
      setNodes([]);
      setEdges([]);
      setHydrated(false);
      setSelectedNodeId(null);
    }
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
            // Refresh the cache with the freshly-fetched flow so the
            // next nav paints from up-to-date data instantly.
            try {
              window.sessionStorage.setItem(
                cacheKey,
                JSON.stringify({ flow: d.flow, ts: Date.now() }));
            } catch (_) {}
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
      } else if (!cancelled && !hasSavedFlow && userFlowId) {
        // STATE C-user — user-named flow. Start blank mints the blob
        // server-side with empty nodes/edges; on first canvas mount
        // we seed an Input node so the user lands on a usable starting
        // state. The seed also persists so the My Flows card reflects
        // step_count >= 1 immediately.
        const seed = buildFromTemplate({ activityIds: ["input"] });
        setNodes(seed.nodes);
        setEdges(seed.edges);
        setPickerDismissed(true);
        try {
          await fetch(flowEndpoint, {
            method: "POST", credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ nodes: seed.nodes, edges: seed.edges }),
          });
        } catch (_) { /* autosave will catch up */ }
      }
      // STATE A is implicit (legacy default canvas, no seed): nodes
      // stays empty, pickerDismissed stays false, so the
      // TemplatePicker overlay renders the "build your first flow"
      // choices.
      if (!cancelled) setHydrated(true);
    })();
    return () => { cancelled = true; };
  }, [flowEndpoint, formId, userFlowId]);

  // Debounced save: any change to nodes/edges schedules a save 800ms
  // after the last edit. Drag-while-dragging coalesces into one save.
  const saveTimerRef = React.useRef(null);
  React.useEffect(() => {
    if (!hydrated) return; // don't save before initial load completes
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      setSaveStatus("saving");
      try {
        // Coerce to arrays defensively — the server endpoint 400s if
        // either field arrives as null/undefined, which can happen
        // briefly during state transitions (Start blank → load,
        // template apply, etc.). Sending empty lists is safe and
        // matches what the server expects on first save.
        const safeNodes = Array.isArray(nodes) ? nodes : [];
        const safeEdges = Array.isArray(edges) ? edges : [];
        const r = await fetch(flowEndpoint, {
          method: "POST", credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nodes: safeNodes, edges: safeEdges }),
        });
        if (!r.ok) throw new Error("save_failed");
        setSaveStatus("saved");
        // Keep the SWR cache in sync with the just-saved state so
        // the next time the user opens this flow, the cached paint
        // matches reality (no flashing of stale content while
        // revalidate runs).
        try {
          window.sessionStorage.setItem(
            "fbflow:" + flowEndpoint,
            JSON.stringify({
              flow: { nodes: safeNodes, edges: safeEdges },
              ts: Date.now(),
            }));
        } catch (_) {}
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

  // Inline rename — double-click the title on any activity card to
  // edit. Empty input falls back to the catalog default at render
  // time, so the user can never end up with a nameless card.
  const renameNode = React.useCallback((nodeId, nextTitle) => {
    const trimmed = (nextTitle || "").trim().slice(0, 80);
    setNodes(ns => ns.map(n =>
      n.id === nodeId ? { ...n, data: { ...n.data, title: trimmed } } : n));
  }, []);

  const flowContextValue = React.useMemo(
    () => ({ openChooser, deleteEdge, renameNode }),
    [openChooser, deleteEdge, renameNode]);

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

    // No auto-connect on drag-drop. The previous behavior wired the
    // new card to whichever orphan-tail was rightmost on the canvas,
    // which surprised users — they'd drop a fan-out branch and the
    // app would silently link it to an unrelated step. The "+" button
    // on a card (pickFromChooser, below) still anchors a deliberate
    // edge when the user explicitly chooses to extend a branch.
    setNodes((ns) => ns.concat(newNode));
  }, [nodes, edges, rfInstance]);

  // Pick from the chooser → add a node + edge anchored to the source.
  const pickFromChooser = React.useCallback((activityId) => {
    if (!chooser) return;
    const sourceNode = nodes.find(n => n.id === chooser.sourceId);
    if (!sourceNode) { setChooser(null); return; }
    const activity = ACTIVITY_BY_ID[activityId];
    if (!activity) { setChooser(null); return; }
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
          !!chooser ? "is-modal-open" : ""
        }`}
        data-pulse-next={nodes.length === 1 && nodes[0]?.data?.kind === "trigger" ? "1" : "0"}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
      >
        <FirstTimeGuide />
        <BackPill />
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

        {/* "Test this flow" button — top-right of the canvas. */}
        <button
          type="button"
          className={`fb-test-btn ${testStatus === "running" ? "is-running" : ""}`}
          onClick={() => {
            if (testStatus === "running") stopTheTest();
            else openTestModal();
          }}
          aria-label={testStatus === "running" ? "Stop the test" : "Test this flow"}
        >
          {testStatus === "running"
            ? <><span className="fb-test-btn-ico">■</span> Stop test</>
            : <><span className="fb-test-btn-ico">▶</span> Test this flow</>}
        </button>

        {/* Test config modal */}
        {testStatus === "configuring" && (
          <TestConfigModal
            inputs={testInputs}
            setInputs={setTestInputs}
            replies={testReplies}
            setReplies={setTestReplies}
            replyNodes={nodes.filter(n => n.data && n.data.activityId === "reply")}
            error={testError}
            onCancel={closeTestModal}
            onRun={runTheTest}
            onUseSample={() => {
              const fields = discoverInputFields(nodes);
              const seed = {};
              for (const f of fields) {
                seed[f] = SAMPLE_INPUT_DATA[f] != null ? SAMPLE_INPUT_DATA[f] : "";
              }
              setTestInputs(seed);
            }}
          />
        )}

        {/* Test summary card */}
        {testStatus === "done" && (testSummary || testError) && (
          <TestSummaryCard
            summary={testSummary}
            error={testError}
            onClose={dismissTestSummary}
            onRunAgain={() => {
              clearAllRunStates();
              setTestStatus("configuring");
            }}
            onSeeFailedStep={jumpToFailedStep}
          />
        )}

        {/* ARIA live region for screen-reader announcements during tests */}
        <div className="fb-sr-only" role="status" aria-live="polite" aria-atomic="true">
          {testAnnouncement}
        </div>

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
        collapsed={collapsed}
        onToggle={() => setCollapsed(c => !c)}
        onUseTemplate={() => setPickerDismissed(false)}
      />
      </>
      )}
      </div>
      {/* TemplatePicker render removed — empty canvas is fine; users
          either land on a pack flow (synthesized from the backend) or
          use the Library on the left to drag in a starter step. */}
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
            // Input cards are now removable too: the user asked for a
            // "remove this step" affordance on input activities so they
            // can swap a misconfigured trigger without rebuilding the
            // whole flow.
            selectedNodeId && !selectedNodeId.endsWith("_demo")
              ? deleteNode : null
          }
        />
      )}
      {chooser && (
        <NextStepChooser
          source={chooser}
          onPick={pickFromChooser}
          onClose={closeChooser}
        />
      )}
    </div>
    </FlowContext.Provider>
  );
}

