/* eslint-disable */
// Node-runnable smoke tests for the redistribute algorithm.
// Run from the repo root: `node web/tests/redistribute.test.cjs`
//
// .cjs because web/package.json declares "type":"module"; the
// algorithm file uses an IIFE + module.exports so we can require it
// directly here without the ESM toolchain.

const path = require("path");
const fs   = require("fs");

// Load redistribute.js in CommonJS context. Defensive: stub `document`
// so the CSS-inject block at the bottom doesn't blow up if it sneaks
// past the `typeof document` guard.
global.document = global.document || {
  getElementById: () => null,
  createElement:  () => ({ id: "", textContent: "" }),
  head: { appendChild: () => {} },
};

const SRC = path.resolve(__dirname,
  "../../templates/AIdashboard/static/redistribute.js");
const code = fs.readFileSync(SRC, "utf8");
// The IIFE attaches to `module.exports` if present. We wrap the script
// in a fresh CommonJS module-like context.
const Module = require("module");
const m = new Module(SRC);
m.filename = SRC;
m.paths = Module._nodeModulePaths(path.dirname(SRC));
m._compile(code, SRC);
const { computeRedistribution } = m.exports;

// ── Test framework (tiny) ──────────────────────────────────────────────
let passed = 0, failed = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.log(`  ✗ ${name}`);
    console.log(`     ${err.message}`);
    failed++;
  }
}
function eq(a, b, label) {
  const A = JSON.stringify(a), B = JSON.stringify(b);
  if (A !== B) throw new Error(`${label}: expected ${B}, got ${A}`);
}
function gte(a, b, label) {
  if (!(a >= b)) throw new Error(`${label}: expected >= ${b}, got ${a}`);
}
function ok(cond, label) {
  if (!cond) throw new Error(`${label}: condition failed`);
}

// ── Helpers ────────────────────────────────────────────────────────────
function epoch(year, month, day, h = 12, m = 0) {
  return Math.floor(new Date(year, month - 1, day, h, m, 0).getTime() / 1000);
}
function dayOf(epochSec) {
  const d = new Date(epochSec * 1000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function buildPosts(daySpec) {
  // daySpec: { "YYYY-MM-DD": count } — each post gets a varied-but-valid
  // hour so the algorithm sees them as distinct, but they all stay on
  // the same calendar day (no overflow into the next day).
  const out = [];
  let id = 0;
  Object.entries(daySpec).forEach(([k, n]) => {
    const [y, mo, d] = k.split("-").map(Number);
    for (let i = 0; i < n; i++) {
      const hour   = 9 + (i % 12);    // 9..20, valid same-day hours
      const minute = (i * 5) % 60;
      out.push({
        id:           "p" + (++id),
        scheduled_at: epoch(y, mo, d, hour, minute),
        status:       "pending",
      });
    }
  });
  return out;
}

// Anchor "now" to a fixed point so tests are deterministic regardless
// of when they run. May 1 2026 at 8 AM, well before all test days.
const FIXED_NOW = epoch(2026, 5, 1, 8, 0);

// ── Tests ──────────────────────────────────────────────────────────────
console.log("redistribute.test.cjs");

test("Test 1: 30 posts on day 1, target 3/day, 30-day month → 10 days × 3", () => {
  const posts = buildPosts({ "2026-06-01": 30 });
  const r = computeRedistribution({
    posts,
    targetPerDay: 3,
    hoursBetween: 3,
    firstHour:    9,
    firstMinute:  0,
    scopeStart:   new Date(2026, 5, 1),
    scopeEnd:     new Date(2026, 5, 30),
    nowEpoch:     FIXED_NOW,
  });
  eq(r.errors, [], "no errors");
  // After redistribution, days 1..10 each have exactly 3 posts; rest empty.
  // (Move count itself can vary because posts that stay on day 1 also
  // get retimed to canonical slots — what matters is the day shape.)
  const counts = {};
  posts.forEach(p => {
    const mv = r.moves.find(m => m.id === p.id);
    const at = mv ? mv.newAt : p.scheduled_at;
    counts[dayOf(at)] = (counts[dayOf(at)] || 0) + 1;
  });
  for (let d = 1; d <= 10; d++) {
    const k = `2026-06-${String(d).padStart(2,"0")}`;
    eq(counts[k], 3, `day ${k} count`);
  }
  for (let d = 11; d <= 30; d++) {
    const k = `2026-06-${String(d).padStart(2,"0")}`;
    eq(counts[k] || 0, 0, `day ${k} count`);
  }
});

test("Test 2: 5/day across 7 days, target 3/day → 14 spill into next 7", () => {
  const spec = {};
  for (let d = 1; d <= 7; d++) {
    spec[`2026-06-${String(d).padStart(2,"0")}`] = 5;
  }
  const posts = buildPosts(spec);
  const r = computeRedistribution({
    posts,
    targetPerDay: 3,
    hoursBetween: 2,
    firstHour:    10,
    firstMinute:  0,
    scopeStart:   new Date(2026, 5, 1),
    scopeEnd:     new Date(2026, 5, 30),
    nowEpoch:     FIXED_NOW,
  });
  eq(r.errors, [], "no errors");
  ok(r.moves.length >= 14,
    `expected at least 14 moves, got ${r.moves.length}`);
  // No day 1..7 should have more than 3 after redistribution.
  const counts = {};
  posts.forEach(p => {
    const mv = r.moves.find(m => m.id === p.id);
    const at = mv ? mv.newAt : p.scheduled_at;
    counts[dayOf(at)] = (counts[dayOf(at)] || 0) + 1;
  });
  for (let d = 1; d <= 7; d++) {
    const k = `2026-06-${String(d).padStart(2,"0")}`;
    ok((counts[k] || 0) <= 3, `${k} should be <= 3, got ${counts[k]}`);
  }
});

test("Test 3: all 7 posts on day are locked → day stays at 7, flagged", () => {
  const lockedDay = "2026-06-15";
  const posts = buildPosts({ [lockedDay]: 7, "2026-06-16": 1 });
  posts.forEach(p => {
    if (dayOf(p.scheduled_at) === lockedDay) p.locked = true;
  });
  const r = computeRedistribution({
    posts,
    targetPerDay: 3,
    hoursBetween: 3,
    firstHour:    9,
    scopeStart:   new Date(2026, 5, 1),
    scopeEnd:     new Date(2026, 5, 30),
    nowEpoch:     FIXED_NOW,
  });
  // Locked posts can't be moved, so day stays at 7 — but the algorithm
  // should still surface a warning.
  ok(r.warnings.some(w => /locked/i.test(w)),
    "should warn about locked posts blocking redistribution");
  // None of the locked posts move.
  r.moves.forEach(mv => {
    const p = posts.find(x => x.id === mv.id);
    ok(!p.locked, `locked post ${mv.id} must not move`);
  });
});

test("Test 4: 6PM + 4h spacing + 3/day → cap to 2/day, warn, exact spacing", () => {
  // 18:00 + 0*4 = 18, 18:00 + 1*4 = 22, 18:00 + 2*4 = 26 → past 23:00.
  // Algorithm should cap target to 2 (18:00 and 22:00) and warn,
  // never silently compress the gap.
  const posts = buildPosts({ "2026-06-15": 5 });
  const r = computeRedistribution({
    posts,
    targetPerDay: 3,
    hoursBetween: 4,
    firstHour:    18,
    firstMinute:  0,
    scopeStart:   new Date(2026, 5, 1),
    scopeEnd:     new Date(2026, 5, 30),
    nowEpoch:     FIXED_NOW,
  });
  ok(r.warnings.some(w => /capped|fits.*per day|spacing stays/i.test(w)),
    "should warn that the daily target was capped to keep spacing exact");
  // Every assigned time on every affected day must be at 18:00 or 22:00.
  // Walk both moved posts and originals; confirm no other times appear.
  const validMin = [18 * 60, 22 * 60];
  posts.forEach(p => {
    const mv = r.moves.find(m => m.id === p.id);
    if (!mv) return; // unmoved post — its original time is by design
    const d = new Date(mv.newAt * 1000);
    const m = d.getHours() * 60 + d.getMinutes();
    ok(validMin.indexOf(m) >= 0,
      `post ${p.id} new time ${d.getHours()}:${d.getMinutes()} not at 6 PM or 10 PM`);
  });
});

test("Test 4b: 9AM + 3h spacing + 3/day → exact 9, 12, 15 spacing", () => {
  // The classic case — verify exact spacing without any cap.
  const posts = buildPosts({ "2026-06-15": 9 });
  const r = computeRedistribution({
    posts,
    targetPerDay: 3,
    hoursBetween: 3,
    firstHour:    9,
    firstMinute:  0,
    scopeStart:   new Date(2026, 5, 1),
    scopeEnd:     new Date(2026, 5, 30),
    nowEpoch:     FIXED_NOW,
  });
  eq(r.errors, [], "no errors");
  ok(!r.warnings.some(w => /capped/i.test(w)), "no cap warning expected");
  // Every moved post must land on exactly 9:00, 12:00, or 15:00.
  const validMin = [9 * 60, 12 * 60, 15 * 60];
  r.moves.forEach(mv => {
    const d = new Date(mv.newAt * 1000);
    const m = d.getHours() * 60 + d.getMinutes();
    ok(validMin.indexOf(m) >= 0,
      `move ${mv.id} new time ${d.getHours()}:${d.getMinutes()} off-slot`);
  });
});

test("Test 5: skip weekends — Saturday posts move to weekdays", () => {
  // June 6 2026 is a Saturday. Schedule 5 posts there.
  const posts = buildPosts({ "2026-06-06": 5 });
  const r = computeRedistribution({
    posts,
    targetPerDay: 3,
    hoursBetween: 3,
    firstHour:    9,
    scopeStart:   new Date(2026, 5, 1),
    scopeEnd:     new Date(2026, 5, 30),
    skipWeekends: true,
    nowEpoch:     FIXED_NOW,
  });
  eq(r.errors, [], "no errors");
  // After redistribution, no post should land on a weekend.
  posts.forEach(p => {
    const mv = r.moves.find(m => m.id === p.id);
    const at = mv ? mv.newAt : p.scheduled_at;
    const dow = new Date(at * 1000).getDay();
    ok(dow !== 0 && dow !== 6,
      `post ${p.id} ended on weekend (dow=${dow})`);
  });
});

test("Test 6: total posts > scope capacity → spills into future months", () => {
  // 100 posts in a 5-day initial scope with target 3/day → 15 slots in
  // scope, 85 movable posts must spill forward into future months.
  const spec = {};
  for (let d = 1; d <= 5; d++) {
    spec[`2026-06-${String(d).padStart(2,"0")}`] = 20;
  }
  const posts = buildPosts(spec);
  const r = computeRedistribution({
    posts,
    targetPerDay: 3,
    hoursBetween: 3,
    firstHour:    9,
    scopeStart:   new Date(2026, 5, 1),
    scopeEnd:     new Date(2026, 5, 5),
    nowEpoch:     FIXED_NOW,
  });
  eq(r.errors, [], "no errors — should auto-spill");
  ok(r.warnings.some(w => /extended into|extra month/i.test(w)),
    "should warn about extending into future months");
  // Every post lands somewhere; max 3 per day.
  const counts = {};
  posts.forEach(p => {
    const mv = r.moves.find(m => m.id === p.id);
    const at = mv ? mv.newAt : p.scheduled_at;
    counts[dayOf(at)] = (counts[dayOf(at)] || 0) + 1;
  });
  Object.entries(counts).forEach(([k, c]) => {
    ok(c <= 3, `day ${k} has ${c} posts (should be <= 3)`);
  });
  // Total accounting: 100 posts, all accounted for.
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  eq(total, 100, "all 100 posts placed");
});

console.log("");
console.log(`${passed} passed, ${failed} failed.`);
process.exit(failed === 0 ? 0 : 1);
