/**
 * Redistribute Month — pure algorithm + lightweight modal renderer.
 * Loaded as a static script by both dashboard_instagram.html and
 * dashboard_linkedin.html; both pages call window.fbRedistribute.open().
 *
 * Exposes:
 *   window.fbRedistribute.computeRedistribution(opts)
 *   window.fbRedistribute.openModal({ platform, monthAnchor, posts, onApply })
 *   window.fbRedistribute.applyMoves(platform, moves) — POSTs to backend
 */
(function () {
  "use strict";

  function dayKey(date) {
    return date.getFullYear() + "-"
      + String(date.getMonth() + 1).padStart(2, "0") + "-"
      + String(date.getDate()).padStart(2, "0");
  }
  function dayKeyFromEpoch(epoch) {
    return dayKey(new Date(epoch * 1000));
  }
  function startOfDay(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  function addDays(date, n) {
    const d = new Date(date);
    d.setDate(d.getDate() + n);
    return d;
  }

  /**
   * Compute the diff for a redistribution.
   *
   * opts:
   *   posts:          [{ id, scheduled_at (epoch s), locked?, status? }]
   *   targetPerDay:   int
   *   hoursBetween:   int (1..12)
   *   firstHour:      int (0..23)   first slot's hour
   *   firstMinute:    int (0..59)   first slot's minute
   *   scopeStart:     Date (day start)
   *   scopeEnd:       Date (day start of last day in scope)
   *   skipWeekends:   bool
   *   nowEpoch:       int (testable; defaults to current time)
   *
   * returns: { moves: [{id,oldAt,newAt}], summary, errors, warnings }
   */
  function computeRedistribution(opts) {
    const {
      posts = [],
      targetPerDay,
      hoursBetween,
      firstHour,
      firstMinute = 0,
      scopeStart,
      scopeEnd,
      skipWeekends = false,
      nowEpoch = Math.floor(Date.now() / 1000),
    } = opts;

    if (!targetPerDay || targetPerDay < 1) {
      return _empty(["Posts per day must be at least 1."]);
    }
    if (hoursBetween == null || hoursBetween < 1) {
      return _empty(["Hours between posts must be at least 1."]);
    }
    if (!scopeStart || !scopeEnd || scopeEnd < scopeStart) {
      return _empty(["Bad date range."]);
    }

    // 1. Filter to scope, drop already-published / publishing.
    const startSec = Math.floor(scopeStart.getTime() / 1000);
    const endSec   = Math.floor(scopeEnd.getTime() / 1000) + 86400;
    const inScope  = posts.filter((p) => {
      const t = p.scheduled_at || 0;
      if (t < startSec || t >= endSec) return false;
      const status = (p.status || "pending").toLowerCase();
      if (status === "published" || status === "publishing"
          || status === "sent" || status === "succeeded") return false;
      return true;
    });

    // 2. Build the day list. Past days never receive moves.
    function buildDayList(endDate) {
      const list = [];
      let cur = startOfDay(scopeStart);
      const last = startOfDay(endDate);
      while (cur <= last) {
        const isWeekend = cur.getDay() === 0 || cur.getDay() === 6;
        const dayStartSec = Math.floor(cur.getTime() / 1000);
        const isPast = dayStartSec + 86400 <= nowEpoch;
        const eligible = !isPast && !(skipWeekends && isWeekend);
        // Past days: posts stay (already happened — can't move).
        // Weekend-skipped days: posts MOVE off (the user explicitly
        // asked to skip weekends, so any movable posts get pushed to
        // weekdays).
        const reason = isPast ? "past"
                     : (!eligible ? "weekend_skip" : "");
        list.push({
          key:      dayKey(cur),
          date:     new Date(cur),
          isWeekend,
          eligible,
          reason,
          posts:    [],
        });
        cur = addDays(cur, 1);
      }
      return list;
    }

    // Respect the user's hoursBetween strictly. Figure out how many
    // slots actually fit in a day at that spacing before 11 PM (a hard
    // cutoff — nothing posts after that). If the user's targetPerDay
    // would push past, cap to what fits and warn instead of silently
    // compressing the gap.
    const ENDCAP_HOUR  = 23;            // 11 PM hard cutoff
    const slotsThatFit = (firstHour > ENDCAP_HOUR)
      ? 0
      : Math.max(1, Math.floor((ENDCAP_HOUR - firstHour) / hoursBetween) + 1);
    const effectiveTarget = Math.max(1, Math.min(targetPerDay, slotsThatFit));
    const targetWasCapped = effectiveTarget < targetPerDay;

    let dayList = buildDayList(scopeEnd);
    const movableTotal = inScope.filter(p => !p.locked).length;
    const initialCapacity =
      dayList.filter(d => d.eligible).length * effectiveTarget;

    // 3. Auto-spill: if the chosen scope can't hold every movable post,
    //    extend the end one month at a time (capped at 12 months
    //    forward) until capacity is sufficient. Better than erroring —
    //    overflow naturally cascades into the next month(s).
    let monthsExtended = 0;
    let workingEnd = scopeEnd;
    while (
      dayList.filter(d => d.eligible).length * effectiveTarget < movableTotal
      && monthsExtended < 12
    ) {
      monthsExtended++;
      const e = new Date(workingEnd);
      // Last day of the month after `workingEnd`'s month.
      workingEnd = new Date(e.getFullYear(), e.getMonth() + 2, 0);
      dayList = buildDayList(workingEnd);
    }

    const dayByKey = Object.fromEntries(dayList.map(d => [d.key, d]));
    inScope.forEach((p) => {
      const k = dayKeyFromEpoch(p.scheduled_at);
      if (dayByKey[k]) dayByKey[k].posts.push(p);
    });

    const capacity = dayList.filter(d => d.eligible).length * effectiveTarget;
    // Final guard: if even 12 months ahead can't hold these, error.
    if (movableTotal > capacity) {
      return _empty([
        `You have ${movableTotal} movable posts and even 12 months ahead `
        + `only fits ${capacity} of them. Raise posts/day or remove some posts.`,
      ], { totalPosts: inScope.length, movable: movableTotal,
            capacity, overflowDays: 0, underflowDays: 0 });
    }

    // 4. Pour movable posts into eligible days, in chronological order,
    //    up to effectiveTarget per day. This is the new "fill to target"
    //    semantic: if the user asks for 5/day, every eligible day gets
    //    exactly 5 (pulling future posts back into earlier days as
    //    needed). Locked posts on a day count toward its target —
    //    movable slots = target - locked.
    const flaggedLockedDays = [];
    const movableQueue = [];
    const lockedByDay   = {};
    const stayPosts     = [];   // on non-eligible days: never moved.

    inScope.forEach((p) => {
      const k = dayKeyFromEpoch(p.scheduled_at);
      const day = dayByKey[k];
      if (!day) {
        stayPosts.push(p);
        return;
      }
      if (day.eligible) {
        if (p.locked) (lockedByDay[k] = lockedByDay[k] || []).push(p);
        else          movableQueue.push(p);
        return;
      }
      // Non-eligible days: past stays, weekend-skip moves off (locked
      // weekend posts still stay because lock trumps skip).
      if (day.reason === "weekend_skip" && !p.locked) {
        movableQueue.push(p);
      } else {
        stayPosts.push(p);
      }
    });

    // Earlier-original-time first → preserves the user's spacing intent
    // (a 9 AM post tends to land in the early slot of its new day).
    movableQueue.sort((a, b) => (a.scheduled_at || 0) - (b.scheduled_at || 0));

    // Pour: walk eligible days in order, consume the queue.
    const finalByDay = {};
    dayList.forEach(d => {
      finalByDay[d.key] = {
        date: d.date,
        eligible: d.eligible,
        posts: [],
      };
      if (!d.eligible) return;
      const locked = lockedByDay[d.key] || [];
      const free   = Math.max(0, effectiveTarget - locked.length);
      if (locked.length > effectiveTarget) {
        // More locked here than the target — can't redistribute these
        // away. Keep them all but flag the day.
        finalByDay[d.key].posts.push(...locked);
        flaggedLockedDays.push(d.key);
        return;
      }
      finalByDay[d.key].posts.push(...locked);
      const take = movableQueue.splice(0, free);
      finalByDay[d.key].posts.push(...take);
    });

    // Non-eligible-day posts (past dates, locked weekends) keep their
    // original positions — append after the eligible-day pour so the
    // slot pass below can skip them.
    stayPosts.forEach(p => {
      const k = dayKeyFromEpoch(p.scheduled_at);
      if (finalByDay[k]) finalByDay[k].posts.push(p);
    });

    const unassigned = movableQueue.slice();   // should be empty after spill

    // 5. Time slots per day. Strict `hoursBetween` spacing — no
    //    silent compression. Non-eligible days (past, skipped weekends)
    //    keep their posts' original times.
    const moves = [];
    Object.values(finalByDay).forEach((d) => {
      if (!d.posts.length) return;
      if (!d.eligible) return;            // don't retime past/weekend posts
      const slots = [];
      for (let i = 0; i < effectiveTarget; i++) {
        slots.push({
          hour:   firstHour + i * hoursBetween,
          minute: firstMinute,
        });
      }

      // Locked posts keep their existing time. Find the slot index
      // closest to each locked time (ties: earliest open) and reserve.
      const used = new Set();
      const locked   = d.posts.filter(p => !!p.locked);
      const movable  = d.posts.filter(p => !p.locked);
      locked.forEach((p) => {
        const lt = new Date(p.scheduled_at * 1000);
        const lockMin = lt.getHours() * 60 + lt.getMinutes();
        let bestIdx = -1, bestDist = Infinity;
        slots.forEach((s, i) => {
          if (used.has(i)) return;
          const sm = s.hour * 60 + s.minute;
          const dist = Math.abs(sm - lockMin);
          if (dist < bestDist) { bestDist = dist; bestIdx = i; }
        });
        if (bestIdx >= 0) used.add(bestIdx);
      });

      // Movable: assign in chronological order to remaining slots.
      movable.sort((a, b) => (a.scheduled_at || 0) - (b.scheduled_at || 0));
      let mi = 0;
      for (let i = 0; i < slots.length && mi < movable.length; i++) {
        if (used.has(i)) continue;
        const s = slots[i];
        const newDate = new Date(d.date);
        newDate.setHours(s.hour, s.minute, 0, 0);
        const newAt = Math.floor(newDate.getTime() / 1000);
        const p = movable[mi++];
        if (newAt !== p.scheduled_at) {
          moves.push({ id: p.id, oldAt: p.scheduled_at, newAt });
        }
      }
    });

    const warnings = [];
    if (targetWasCapped) {
      warnings.push(
        `Starting at ${_fmtTime(firstHour, firstMinute)} with `
        + `${hoursBetween}-hour spacing only fits ${effectiveTarget} `
        + `post${effectiveTarget === 1 ? "" : "s"} per day before 11 PM. `
        + `We capped each day at ${effectiveTarget} so the spacing stays `
        + `${hoursBetween}h apart — earlier first time or shorter spacing `
        + `lets you fit more.`);
    }
    if (monthsExtended > 0) {
      warnings.push(
        `Not enough room in the chosen range — we extended into `
        + `${monthsExtended} extra month${monthsExtended === 1 ? "" : "s"} `
        + `so every post got a slot.`);
    }
    if (flaggedLockedDays.length) {
      warnings.push(
        `${flaggedLockedDays.length} day(s) stay over target because all `
        + `extra posts are locked.`);
    }
    if (unassigned.length) {
      warnings.push(
        `${unassigned.length} post(s) had no underflow day to land on. `
        + `Try expanding the date range.`);
    }

    // Day stats: how many days exceed / are under target after the pour.
    let daysOver = 0, daysUnder = 0, daysAtTarget = 0;
    Object.values(finalByDay).forEach(d => {
      if (!d.eligible || !d.posts.length) return;
      if (d.posts.length > effectiveTarget)        daysOver += 1;
      else if (d.posts.length < effectiveTarget)   daysUnder += 1;
      else                                          daysAtTarget += 1;
    });
    return {
      moves,
      summary: {
        totalPosts:    inScope.length,
        moved:         moves.length,
        overflowDays:  daysOver,
        underflowDays: daysUnder,
        daysAtTarget,
        targetUsed:    effectiveTarget,
      },
      errors: [],
      warnings,
    };
  }

  function _empty(errors, summary) {
    return {
      moves: [],
      summary: summary || {
        totalPosts: 0, moved: 0, overflowDays: 0, underflowDays: 0 },
      errors: errors || [],
      warnings: [],
    };
  }
  function _fmtTime(hour, minute) {
    const h12 = hour % 12 || 12;
    const m   = String(minute).padStart(2, "0");
    return `${h12}:${m} ${hour < 12 ? "AM" : "PM"}`;
  }

  // ── POST the moves to the backend bulk-update endpoint ───────────────
  async function applyMoves(platform, moves) {
    const url = `/dashboard/${platform}/api/scheduled/redistribute`;
    const r = await fetch(url, {
      method: "POST", credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        moves: moves.map(m => ({
          queue_id: m.id, scheduled_at: m.newAt,
        })),
      }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || ("HTTP " + r.status));
    return d;
  }

  // ── Modal UI (vanilla — not React, since this loads on plain HTML) ──
  function openModal({ platform, monthAnchor, posts, onApply }) {
    // Tear down any existing modal first.
    const old = document.getElementById("fbRedistBg");
    if (old) old.remove();

    // Default scope: from today (or month start, whichever is later) →
    // last day of the month.
    const now = new Date();
    const monthStart = new Date(
      monthAnchor.getFullYear(), monthAnchor.getMonth(), 1);
    const monthEnd   = new Date(
      monthAnchor.getFullYear(), monthAnchor.getMonth() + 1, 0);
    const monthLabel = monthAnchor.toLocaleDateString(undefined,
      { month: "long", year: "numeric" });

    const state = {
      targetPerDay:    3,
      hoursBetween:    3,
      firstHour:       9,
      firstMinute:     0,
      scopeMode:       "from_today",   // or "entire"
      skipWeekends:    false,
    };

    function getScope() {
      if (state.scopeMode === "entire") {
        return { start: monthStart, end: monthEnd };
      }
      const fromToday = startOfDay(now) > monthStart
        ? startOfDay(now) : monthStart;
      return { start: fromToday, end: monthEnd };
    }

    const bg = document.createElement("div");
    bg.id = "fbRedistBg";
    bg.className = "fb-redist-bg";
    bg.innerHTML = `
      <div class="fb-redist-card" role="dialog" aria-modal="true">
        <header class="fb-redist-h">
          <div>
            <div class="fb-redist-eyebrow">${esc(monthLabel)}</div>
            <div class="fb-redist-title">Redistribute Month</div>
          </div>
          <button type="button" class="fb-redist-x" aria-label="Cancel">×</button>
        </header>
        <div class="fb-redist-body">
          <div class="fb-redist-grid">
            <label class="fb-redist-l">Posts per day
              <input id="fbRedTPD" type="number" min="1" max="10"
                     value="${state.targetPerDay}" class="fb-redist-i" />
            </label>
            <label class="fb-redist-l">Hours between posts
              <input id="fbRedHB" type="number" min="1" max="12"
                     value="${state.hoursBetween}" class="fb-redist-i" />
            </label>
            <label class="fb-redist-l">First post time
              <input id="fbRedFT" type="time" value="${
                String(state.firstHour).padStart(2, "0")}:${
                String(state.firstMinute).padStart(2, "0")}"
                class="fb-redist-i" step="900" />
            </label>
          </div>
          <div class="fb-redist-row">
            <fieldset class="fb-redist-fs">
              <legend>Date range</legend>
              <label><input type="radio" name="fbRedScope" value="from_today"
                            ${state.scopeMode === "from_today" ? "checked" : ""}/>
                From today onward</label>
              <label><input type="radio" name="fbRedScope" value="entire"
                            ${state.scopeMode === "entire" ? "checked" : ""}/>
                Entire visible month</label>
            </fieldset>
            <label class="fb-redist-check">
              <input id="fbRedSkipWk" type="checkbox" />
              Skip weekends
            </label>
          </div>
          <div id="fbRedSummary" class="fb-redist-sum"></div>
          <div id="fbRedErrors" class="fb-redist-errors"></div>
          <div id="fbRedWarnings" class="fb-redist-warns"></div>
        </div>
        <footer class="fb-redist-foot">
          <button type="button" class="fb-redist-cancel">Cancel</button>
          <button type="button" id="fbRedApply" class="fb-redist-apply" disabled>
            Apply
          </button>
        </footer>
      </div>`;
    document.body.appendChild(bg);

    function close() {
      bg.remove();
      document.removeEventListener("keydown", onKey);
    }
    function onKey(e) { if (e.key === "Escape") close(); }
    document.addEventListener("keydown", onKey);
    bg.addEventListener("click", e => { if (e.target === bg) close(); });
    bg.querySelector(".fb-redist-x").onclick = close;
    bg.querySelector(".fb-redist-cancel").onclick = close;

    function readState() {
      state.targetPerDay = Math.max(1, Math.min(10,
        parseInt(document.getElementById("fbRedTPD").value, 10) || 3));
      state.hoursBetween = Math.max(1, Math.min(12,
        parseInt(document.getElementById("fbRedHB").value, 10) || 3));
      const t = (document.getElementById("fbRedFT").value || "09:00").split(":");
      state.firstHour   = Math.max(0, Math.min(23, parseInt(t[0], 10) || 0));
      state.firstMinute = Math.max(0, Math.min(59, parseInt(t[1], 10) || 0));
      const radio = bg.querySelector('input[name="fbRedScope"]:checked');
      state.scopeMode = radio ? radio.value : "from_today";
      state.skipWeekends = document.getElementById("fbRedSkipWk").checked;
    }

    let lastResult = null;
    function refresh() {
      readState();
      const { start, end } = getScope();
      const result = computeRedistribution({
        posts,
        targetPerDay: state.targetPerDay,
        hoursBetween: state.hoursBetween,
        firstHour:    state.firstHour,
        firstMinute:  state.firstMinute,
        scopeStart:   start,
        scopeEnd:     end,
        skipWeekends: state.skipWeekends,
      });
      lastResult = result;
      const sum = result.summary || {};
      document.getElementById("fbRedSummary").innerHTML =
        result.errors.length
          ? `<strong style="color:#b91c1c">No changes possible.</strong>`
          : `<strong>${result.moves.length}</strong> post${
              result.moves.length === 1 ? "" : "s"} will move. `
            + `${sum.overflowDays || 0} day(s) currently over target. `
            + `${sum.underflowDays || 0} day(s) will receive posts.`;
      document.getElementById("fbRedErrors").innerHTML =
        result.errors.map(e => `<div class="fb-redist-err">${esc(e)}</div>`).join("");
      document.getElementById("fbRedWarnings").innerHTML =
        result.warnings.map(w => `<div class="fb-redist-warn">${esc(w)}</div>`).join("");
      const apply = document.getElementById("fbRedApply");
      apply.disabled = (result.errors.length > 0 || result.moves.length === 0);
    }

    bg.querySelectorAll("input").forEach(el => {
      el.addEventListener("input",  refresh);
      el.addEventListener("change", refresh);
    });

    document.getElementById("fbRedApply").onclick = async () => {
      if (!lastResult || !lastResult.moves.length) return;
      const apply = document.getElementById("fbRedApply");
      apply.disabled = true;
      apply.textContent = "Applying…";
      try {
        await applyMoves(platform, lastResult.moves);
        if (typeof onApply === "function") onApply(lastResult);
        close();
      } catch (e) {
        apply.disabled = false;
        apply.textContent = "Apply";
        document.getElementById("fbRedErrors").innerHTML =
          `<div class="fb-redist-err">Couldn't save: ${esc(e.message || String(e))}</div>`;
      }
    };

    refresh();
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
      ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
  }

  // ── Inject CSS once ─────────────────────────────────────────────────
  // Skip when loaded outside a browser (Node test runner has no DOM).
  if (typeof document !== "undefined"
      && !document.getElementById("fb-redist-css")) {
    const style = document.createElement("style");
    style.id = "fb-redist-css";
    style.textContent = `
      .fb-redist-bg {
        position: fixed; inset: 0; background: rgba(15,23,42,.55);
        display: flex; align-items: center; justify-content: center;
        z-index: 9000; padding: 20px;
        animation: fbRedFade .15s ease-out;
      }
      @keyframes fbRedFade { from { opacity: 0; } to { opacity: 1; } }
      .fb-redist-card {
        background: #fff; border-radius: 14px;
        max-width: 540px; width: 100%;
        max-height: calc(100vh - 40px); overflow: hidden;
        display: flex; flex-direction: column;
        box-shadow: 0 24px 60px rgba(0,0,0,.25);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI",
                     Roboto, Helvetica, Arial, sans-serif;
      }
      .fb-redist-h {
        display: flex; align-items: flex-start; justify-content: space-between;
        gap: 12px; padding: 18px 22px 14px;
        border-bottom: 1px solid #e5e7eb;
      }
      .fb-redist-eyebrow {
        font-size: 11px; font-weight: 700; color: #6b7280;
        letter-spacing: .04em; text-transform: uppercase; margin-bottom: 4px;
      }
      .fb-redist-title { font-size: 18px; font-weight: 700; color: #0a0a0a; }
      .fb-redist-x {
        background: none; border: 0; font-size: 22px;
        color: #9ca3af; cursor: pointer; padding: 4px 8px; line-height: 1;
      }
      .fb-redist-x:hover { color: #0a0a0a; }
      .fb-redist-body { flex: 1; overflow-y: auto; padding: 16px 22px; }
      .fb-redist-grid {
        display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px;
        margin-bottom: 14px;
      }
      @media (max-width: 540px) {
        .fb-redist-grid { grid-template-columns: 1fr 1fr; }
      }
      .fb-redist-l {
        display: flex; flex-direction: column; gap: 6px;
        font-size: 12.5px; font-weight: 600; color: #4b5563;
      }
      .fb-redist-i {
        padding: 8px 10px; border: 1px solid #e5e7eb; border-radius: 8px;
        font: 14px inherit; background: #fff;
      }
      .fb-redist-i:focus {
        outline: none; border-color: #0a66c2;
        box-shadow: 0 0 0 3px rgba(10,102,194,.15);
      }
      .fb-redist-row {
        display: flex; gap: 16px; flex-wrap: wrap; margin-bottom: 14px;
      }
      .fb-redist-fs {
        border: 1px solid #e5e7eb; border-radius: 8px;
        padding: 8px 12px 10px; flex: 1; min-width: 220px;
      }
      .fb-redist-fs legend {
        padding: 0 6px; font-size: 11.5px; font-weight: 700; color: #4b5563;
        letter-spacing: .03em; text-transform: uppercase;
      }
      .fb-redist-fs label {
        display: block; font-size: 13px; color: #0a0a0a;
        padding: 3px 0; cursor: pointer;
      }
      .fb-redist-fs input { margin-right: 6px; }
      .fb-redist-check {
        display: inline-flex; align-items: center; gap: 6px;
        font-size: 13px; color: #0a0a0a; cursor: pointer;
        align-self: center;
      }
      .fb-redist-sum {
        background: #f0fdf4; border: 1px solid #bbf7d0;
        border-radius: 8px; padding: 10px 12px;
        font-size: 13px; color: #0a0a0a; line-height: 1.5;
      }
      .fb-redist-sum strong { color: #166534; }
      .fb-redist-err, .fb-redist-warn {
        margin-top: 8px; padding: 8px 10px; border-radius: 8px;
        font-size: 12.5px; line-height: 1.4;
      }
      .fb-redist-err {
        background: #fef2f2; color: #991b1b; border: 1px solid #fecaca;
      }
      .fb-redist-warn {
        background: #fffbeb; color: #92400e; border: 1px solid #fde68a;
      }
      .fb-redist-foot {
        display: flex; gap: 10px; justify-content: flex-end;
        padding: 12px 22px 16px; border-top: 1px solid #e5e7eb;
      }
      .fb-redist-cancel {
        background: #fff; border: 1px solid #e5e7eb; color: #0a0a0a;
        padding: 9px 16px; border-radius: 999px;
        font: 600 13px inherit; cursor: pointer;
      }
      .fb-redist-cancel:hover { background: #f9fafb; }
      .fb-redist-apply {
        background: #0a66c2; color: #fff; border: 0;
        padding: 10px 18px; border-radius: 999px;
        font: 700 13px inherit; cursor: pointer;
      }
      .fb-redist-apply:hover { background: #084c95; }
      .fb-redist-apply:disabled {
        background: #cbd5e1; cursor: not-allowed;
      }
    `;
    document.head.appendChild(style);
  }

  // ── Expose globals + commonjs export for tests ──────────────────────
  if (typeof window !== "undefined") {
    window.fbRedistribute = {
      computeRedistribution,
      applyMoves,
      openModal,
    };
  }
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { computeRedistribution, applyMoves };
  }
})();
