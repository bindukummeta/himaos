// Tests for the pure "Goals + weekly review" helpers (Step 4). Run: node --test
// No dependencies — uses Node's built-in test runner and assert module.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  GOAL_HORIZONS, GOAL_STATUSES,
  currentWeekKey, shiftWeekKey, activitiesForWeek,
  goalProgress, goalsByHorizon, isNudgeable,
  pickOneThing, compoundedWeeks, weeklyReviewData,
} = require("./goals-utils.js");

// Build an activity with the weeks it was completed in.
function act(over) {
  return Object.assign({ id: "a", title: "Do it", doneWeeks: [], createdAt: 1 }, over);
}
// Build a goal quickly. Defaults to an active quarter goal with no activities.
function goal(over) {
  return Object.assign(
    { id: "g", title: "A goal", note: "", horizon: "quarter", status: "active",
      parentId: null, snoozedWeek: null, activities: [], order: 1, createdAt: 1 },
    over
  );
}
// Build a linked checklist task (only `done` matters for rollup).
function task(over) {
  return Object.assign({ id: "t", title: "A task", done: 0, goalId: "g" }, over);
}

const WK = "2026-W29"; // week of 2026-07-16, verified against currentWeekKey

test("GOAL_HORIZONS / GOAL_STATUSES have unique vals and labels", () => {
  for (const list of [GOAL_HORIZONS, GOAL_STATUSES]) {
    const vals = list.map((x) => x.val);
    assert.deepEqual(vals, [...new Set(vals)], "vals unique");
    for (const x of list) assert.ok(x.val && x.label, "has val + label");
  }
  assert.deepEqual(GOAL_HORIZONS.map((h) => h.val), ["vision", "year", "quarter"]);
});

test("currentWeekKey formats as YYYY-Www for a fixed date", () => {
  assert.equal(currentWeekKey(new Date(2026, 6, 16)), "2026-W29");
  assert.equal(currentWeekKey(new Date(2026, 0, 1)), "2026-W01");
});

test("shiftWeekKey wraps year boundaries both ways", () => {
  assert.equal(shiftWeekKey("2021-W01", -1), "2020-W53");
  assert.equal(shiftWeekKey("2020-W53", 1), "2021-W01");
  assert.equal(shiftWeekKey("2026-W29", -1), "2026-W28");
});

test("activitiesForWeek marks each activity done/undone for the week", () => {
  const g = goal({ activities: [
    act({ id: "x", doneWeeks: [WK] }),
    act({ id: "y", doneWeeks: ["2026-W28"] }),
  ] });
  const res = activitiesForWeek(g, WK);
  assert.equal(res.total, 2);
  assert.equal(res.done, 1);
  assert.equal(res.rows.find((r) => r.id === "x").done, true);
  assert.equal(res.rows.find((r) => r.id === "y").done, false);
});

test("goalProgress: mixed activities + linked tasks (partial)", () => {
  const g = goal({ activities: [act({ doneWeeks: [WK] }), act({ id: "b", doneWeeks: [] })] });
  const tasks = [task({ done: 1 }), task({ id: "t2", done: 0 })];
  const p = goalProgress(g, tasks, WK);
  assert.equal(p.total, 4);
  assert.equal(p.done, 2);
  assert.equal(p.pct, 0.5);
});

test("goalProgress: empty goal is 0% with no divide-by-zero", () => {
  const p = goalProgress(goal({}), [], WK);
  assert.deepEqual(p, { pct: 0, done: 0, total: 0 });
});

test("goalProgress: all done is 100%; vision has no bar", () => {
  const g = goal({ activities: [act({ doneWeeks: [WK] })] });
  assert.equal(goalProgress(g, [task({ done: 1 })], WK).pct, 1);
  assert.deepEqual(goalProgress(goal({ horizon: "vision" }), [], WK), { pct: 0, done: 0, total: 0 });
});

test("goalsByHorizon groups and sorts, tolerating unknown horizons", () => {
  const gs = [
    goal({ id: "q2", horizon: "quarter", order: 2 }),
    goal({ id: "q1", horizon: "quarter", order: 1 }),
    goal({ id: "y1", horizon: "year", order: 1 }),
    goal({ id: "v", horizon: "vision" }),
    goal({ id: "weird", horizon: "decade" }),
  ];
  const by = goalsByHorizon(gs);
  assert.deepEqual(by.quarter.map((g) => g.id), ["q1", "q2"], "sorted by order");
  assert.deepEqual(by.year.map((g) => g.id), ["y1"]);
  assert.deepEqual(by.vision.map((g) => g.id), ["v"]);
});

test("isNudgeable respects status, vision, and this-week snooze", () => {
  assert.equal(isNudgeable(goal({}), WK), true);
  assert.equal(isNudgeable(goal({ status: "paused" }), WK), false);
  assert.equal(isNudgeable(goal({ horizon: "vision" }), WK), false);
  assert.equal(isNudgeable(goal({ snoozedWeek: WK }), WK), false);
  assert.equal(isNudgeable(goal({ snoozedWeek: "2026-W28" }), WK), true);
});

test("pickOneThing prefers an undone activity of the lowest-progress goal", () => {
  const ahead = goal({ id: "ahead", order: 1, activities: [act({ doneWeeks: [WK] })] });
  const behind = goal({ id: "behind", order: 2, activities: [act({ id: "todo", title: "Run", doneWeeks: [] })] });
  const one = pickOneThing([ahead, behind], {}, WK);
  assert.equal(one.goal.id, "behind");
  assert.equal(one.activity.id, "todo");
});

test("pickOneThing falls back to an open linked task, else null", () => {
  const g = goal({ id: "g", activities: [act({ doneWeeks: [WK] })] });
  const byTask = pickOneThing([g], { g: [task({ done: 0 })] }, WK);
  assert.equal(byTask.task.id, "t");
  const done = goal({ id: "g", activities: [act({ doneWeeks: [WK] })] });
  assert.equal(pickOneThing([done], { g: [task({ done: 1 })] }, WK), null);
  assert.equal(pickOneThing([goal({ snoozedWeek: WK })], {}, WK), null);
});

test("compoundedWeeks + weeklyReviewData report wins and behind state", () => {
  const g = goal({ id: "g", activities: [
    act({ doneWeeks: ["2026-W27", "2026-W28"] }),
    act({ id: "b", doneWeeks: [] }),
  ] });
  assert.equal(compoundedWeeks(g), 2);
  const rows = weeklyReviewData([g, goal({ horizon: "vision" })], {}, WK);
  assert.equal(rows.length, 1, "vision excluded");
  assert.equal(rows[0].compounded, 2);
  assert.equal(rows[0].behind, true);
  assert.ok(rows[0].suggestion.length > 0);
});
