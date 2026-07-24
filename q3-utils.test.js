// Tests for the pure "Q3 / deadline goals" helpers (Phase E). Run with: node --test
// No dependencies — uses Node's built-in test runner and assert module.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  weekKeyForDate, weekCountForActivity, activityWeekStatus,
  milestoneProgress, milestonesRollup,
  daysLeft, elapsedShare, paceFor, nextStepFor, q3Glance, weightLoss,
} = require("./q3-utils.js");

const WK = "2026-W30";

function goal(over) {
  return Object.assign(
    { id: "g", title: "Goal", horizon: "quarter", status: "active",
      activities: [], milestones: [], deadline: null, startedAt: null, createdAt: 1, order: 1 },
    over
  );
}

test("weekKeyForDate returns ISO YYYY-Www", () => {
  assert.match(weekKeyForDate(new Date(2026, 6, 20)), /^\d{4}-W\d{2}$/);
});

test("weekCountForActivity reads weekCounts, falls back to doneWeeks as 1", () => {
  assert.equal(weekCountForActivity({ weekCounts: { [WK]: 3 } }, WK), 3);
  assert.equal(weekCountForActivity({ doneWeeks: [WK] }, WK), 1);
  assert.equal(weekCountForActivity({ doneWeeks: [] }, WK), 0);
});

test("activityWeekStatus: binary vs weeklyTarget", () => {
  const bin = activityWeekStatus({ doneWeeks: [WK] }, WK);
  assert.equal(bin.done, true);
  assert.equal(bin.target, null);
  const t = activityWeekStatus({ weeklyTarget: 4, weekCounts: { [WK]: 3 } }, WK);
  assert.equal(t.target, 4);
  assert.equal(t.count, 3);
  assert.equal(t.done, false);
  assert.equal(t.pct, 0.75);
  const full = activityWeekStatus({ weeklyTarget: 4, weekCounts: { [WK]: 5 } }, WK);
  assert.equal(full.done, true);
  assert.equal(full.pct, 1); // capped
});

test("milestoneProgress: one-time and numeric", () => {
  assert.deepEqual(milestoneProgress({ target: null, done: true }), { pct: 1, done: true });
  assert.deepEqual(milestoneProgress({ target: null, done: false }), { pct: 0, done: false });
  const half = milestoneProgress({ target: 40, current: 20 });
  assert.equal(half.pct, 0.5);
  assert.equal(half.done, false);
  const over = milestoneProgress({ target: 3, current: 5 });
  assert.equal(over.pct, 1);
  assert.equal(over.done, true);
});

test("milestonesRollup blends milestones + weekly-target activities", () => {
  const g = goal({
    milestones: [{ target: null, done: true }, { target: 4, current: 2 }],
    activities: [{ weeklyTarget: 4, weekCounts: { [WK]: 2 } }],
  });
  const r = milestonesRollup(g, WK);
  // (1 + 0.5 + 0.5) / 3 = 0.6667
  assert.ok(Math.abs(r.pct - (2 / 3)) < 1e-9);
  assert.equal(r.totalMilestones, 2);
  assert.equal(r.doneMilestones, 1);
});

test("daysLeft is never negative and counts to deadline", () => {
  const now = Date.parse("2026-07-20T12:00:00");
  assert.equal(daysLeft("2026-07-20", now), 1); // through end of day
  assert.equal(daysLeft("2026-07-10", now), 0); // past -> clamped
  assert.equal(daysLeft(null, now), null);
});

test("elapsedShare: fraction of the goal's own window", () => {
  const start = Date.parse("2026-07-01T00:00:00");
  const g = goal({ startedAt: start, deadline: "2026-07-31" });
  const mid = Date.parse("2026-07-16T12:00:00");
  const share = elapsedShare(g, mid);
  assert.ok(share > 0.4 && share < 0.6);
  assert.equal(elapsedShare(goal({ deadline: null }), mid), null);
});

test("paceFor bands: behind, ontrack, ahead — calm labels", () => {
  const start = Date.parse("2026-07-01T00:00:00");
  const mid = Date.parse("2026-07-16T12:00:00"); // ~50% elapsed
  // 0% done at 50% elapsed -> behind
  const behind = paceFor(goal({ startedAt: start, deadline: "2026-07-31", milestones: [{ target: null, done: false }] }), WK, mid);
  assert.equal(behind.band, "behind");
  assert.match(behind.label, /behind/);
  // 100% done at 50% elapsed -> ahead
  const ahead = paceFor(goal({ startedAt: start, deadline: "2026-07-31", milestones: [{ target: null, done: true }] }), WK, mid);
  assert.equal(ahead.band, "ahead");
  // ~50% done at 50% elapsed -> ontrack
  const ok = paceFor(goal({ startedAt: start, deadline: "2026-07-31", milestones: [{ target: null, done: true }, { target: null, done: false }] }), WK, mid);
  assert.equal(ok.band, "ontrack");
});

test("nextStepFor prefers open activity, then open milestone, else null", () => {
  const g = goal({
    activities: [{ title: "Gym", weeklyTarget: 4, weekCounts: { [WK]: 1 } }],
    milestones: [{ title: "Launch", target: null, done: false }],
  });
  assert.equal(nextStepFor(g, WK), "Gym (1/4 this week)");
  const g2 = goal({ activities: [], milestones: [{ title: "Read", target: 3, current: 1, unit: "books" }] });
  assert.equal(nextStepFor(g2, WK), "Read (1/3 books)");
  const done = goal({ milestones: [{ title: "x", target: null, done: true }] });
  assert.equal(nextStepFor(done, WK), null);
});

test("q3Glance includes only deadline goals, sorted by order", () => {
  const goals = [
    goal({ id: "a", order: 2, deadline: "2026-09-30", milestones: [{ target: null, done: true }] }),
    goal({ id: "b", order: 1, deadline: "2026-09-30" }),
    goal({ id: "c", order: 3, deadline: null }), // excluded
    goal({ id: "v", horizon: "vision", deadline: "2026-09-30" }), // excluded
  ];
  const rows = q3Glance(goals, WK, Date.now());
  assert.deepEqual(rows.map((r) => r.goal.id), ["b", "a"]);
});

test("weightLoss reads start vs latest, clamps, computes pct", () => {
  const w = [ { at: 3, kg: 78 }, { at: 1, kg: 80 }, { at: 2, kg: 79 } ];
  const r = weightLoss(w, 5);
  assert.equal(r.start, 80);
  assert.equal(r.latest, 78);
  assert.equal(r.lost, 2);
  assert.equal(r.pct, 0.4);
  assert.equal(r.done, false);
  assert.equal(weightLoss([], 5), null);
  // gained weight -> lost clamped to 0
  assert.equal(weightLoss([{ at: 1, kg: 78 }, { at: 2, kg: 80 }], 5).lost, 0);
});
