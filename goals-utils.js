// Pure "Goals + weekly review" helpers (Step 4), shared by the app and its tests.
//
// The ladder is Vision (5-10y) -> yearly/quarterly goals -> weekly activities.
// A goal's progress rolls up from BOTH its own embedded weekly activities and any
// checklist tasks linked to it (item.goalId). Activities are recurring weekly
// commitments: an activity is "done" for a given ISO week if that week's key is
// in its `doneWeeks` list, which is why nothing here is a plain done boolean.
//
// Guilt-free by design (VISION principle #4): the weekly review reports compounded
// wins and, for goals that are behind, offers "move it / shrink it" rather than
// scolding — the copy here stays encouraging.
//
// No browser dependencies, so this works both as a <script> tag (attaching to
// window.GoalsUtils) and under Node's test runner (via module.exports). Keep
// everything here side-effect free and DOM-free.
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api; // Node (tests)
  } else {
    root.GoalsUtils = api; // Browser (app.js reads window.GoalsUtils)
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // The three rungs of the ladder. "vision" is the single north-star record;
  // "year"/"quarter" are the goals users actually work each week.
  const GOAL_HORIZONS = [
    { val: "vision", label: "Vision" },
    { val: "year", label: "This year" },
    { val: "quarter", label: "This quarter" },
  ];
  // Display order (vision lives in its own banner, so lists only use year/quarter).
  const HORIZON_ORDER = ["vision", "year", "quarter"];
  const GOAL_STATUSES = [
    { val: "active", label: "Active" },
    { val: "paused", label: "Paused" },
    { val: "done", label: "Done" },
  ];

  // ISO-8601 week key "YYYY-Www" (weeks start Monday; week 1 holds the first
  // Thursday). Used to tick recurring activities per week and to compare weeks.
  function currentWeekKey(date) {
    const d = new Date(Date.UTC(
      (date || new Date()).getFullYear(),
      (date || new Date()).getMonth(),
      (date || new Date()).getDate()
    ));
    // Thursday of this week decides the ISO year.
    const day = d.getUTCDay() || 7; // Sun=0 -> 7
    d.setUTCDate(d.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
    return d.getUTCFullYear() + "-W" + String(week).padStart(2, "0");
  }

  // Move a week key by `delta` weeks (negative = earlier), handling year/week
  // boundaries by round-tripping through a real date (the Monday of that week).
  function shiftWeekKey(weekKey, delta) {
    const m = /^(\d{4})-W(\d{2})$/.exec(weekKey || "");
    if (!m) return currentWeekKey();
    const year = Number(m[1]);
    const week = Number(m[2]);
    // Monday of the given ISO week: Jan 4th is always in week 1.
    const jan4 = new Date(Date.UTC(year, 0, 4));
    const jan4Day = jan4.getUTCDay() || 7;
    const week1Monday = new Date(jan4);
    week1Monday.setUTCDate(jan4.getUTCDate() - (jan4Day - 1));
    const monday = new Date(week1Monday);
    monday.setUTCDate(week1Monday.getUTCDate() + (week - 1 + (delta || 0)) * 7);
    return currentWeekKey(monday);
  }

  // Whether a recurring activity was completed in a given week.
  function activityDoneInWeek(activity, weekKey) {
    return Boolean(
      activity &&
      Array.isArray(activity.doneWeeks) &&
      activity.doneWeeks.indexOf(weekKey) >= 0
    );
  }

  // A goal's activities resolved for one week: counts + per-row done flags.
  function activitiesForWeek(goal, weekKey) {
    const acts = (goal && Array.isArray(goal.activities)) ? goal.activities : [];
    const rows = acts.map((a) => Object.assign({}, a, { done: activityDoneInWeek(a, weekKey) }));
    const done = rows.filter((r) => r.done).length;
    return { done, total: rows.length, rows };
  }

  // Linked checklist tasks reduced to {done,total} using the item `done` flag.
  function linkedTaskStats(linkedTasks) {
    const list = Array.isArray(linkedTasks) ? linkedTasks : [];
    const done = list.filter((t) => t && t.done).length;
    return { done, total: list.length };
  }

  // Dual rollup: (activities done this week + linked tasks done) / (both totals).
  // Vision goals have no bar; empty goals return 0% (never divide by zero).
  function goalProgress(goal, linkedTasks, weekKey) {
    if (goal && goal.horizon === "vision") return { pct: 0, done: 0, total: 0 };
    const a = activitiesForWeek(goal, weekKey);
    const t = linkedTaskStats(linkedTasks);
    const done = a.done + t.done;
    const total = a.total + t.total;
    return { pct: total ? done / total : 0, done, total };
  }

  // Group goals by horizon, each list sorted by `order` then `createdAt`.
  // Tolerant of unknown/missing horizons (dropped into their own bucket key).
  function goalsByHorizon(goals) {
    const out = { vision: [], year: [], quarter: [] };
    const list = Array.isArray(goals) ? goals.slice() : [];
    list.sort((a, b) => (a.order || 0) - (b.order || 0) || (a.createdAt || 0) - (b.createdAt || 0));
    for (const g of list) {
      const h = g && g.horizon;
      if (h === "vision" || h === "year" || h === "quarter") out[h].push(g);
    }
    return out;
  }

  // A goal wants a nudge if it's active, not done, and not snoozed this week.
  function isNudgeable(goal, weekKey) {
    if (!goal || goal.horizon === "vision") return false;
    if (goal.status && goal.status !== "active") return false;
    return goal.snoozedWeek !== weekKey;
  }

  // The single "one thing that matters today": among nudgeable goals with the
  // LEAST weekly progress first, surface the first activity not yet done this
  // week; failing that, the first open linked task. Returns null when there's
  // nothing to nudge (no goals, all done, or everything snoozed) — no nagging.
  // `tasksByGoal` maps goalId -> array of linked checklist items.
  function pickOneThing(goals, tasksByGoal, weekKey) {
    const map = tasksByGoal || {};
    const candidates = (Array.isArray(goals) ? goals : [])
      .filter((g) => isNudgeable(g, weekKey))
      .map((g) => ({ goal: g, prog: goalProgress(g, map[g.id], weekKey) }))
      // Lowest progress first, then explicit order, so the most-neglected leads.
      .sort((a, b) => a.prog.pct - b.prog.pct || (a.goal.order || 0) - (b.goal.order || 0));
    for (const c of candidates) {
      const { rows } = activitiesForWeek(c.goal, weekKey);
      const act = rows.find((r) => !r.done);
      if (act) return { goal: c.goal, activity: act };
      const task = (map[c.goal.id] || []).find((t) => t && !t.done);
      if (task) return { goal: c.goal, task: task };
    }
    return null;
  }

  // Total (activity x week) completions across a goal's whole history — the
  // "compounded wins" number that makes the weekly review feel like progress.
  function compoundedWeeks(goal) {
    const acts = (goal && Array.isArray(goal.activities)) ? goal.activities : [];
    return acts.reduce(
      (sum, a) => sum + (Array.isArray(a.doneWeeks) ? a.doneWeeks.length : 0),
      0
    );
  }

  // Per-goal rows for the weekly review (vision excluded). Each row carries this
  // week's progress, last week's for a "vs last week" read, compounded wins, a
  // `behind` flag, and a guilt-free suggestion string for the behind ones.
  function weeklyReviewData(goals, tasksByGoal, weekKey) {
    const map = tasksByGoal || {};
    const prevWeek = shiftWeekKey(weekKey, -1);
    return (Array.isArray(goals) ? goals : [])
      .filter((g) => g && g.horizon !== "vision")
      .map((g) => {
        const prog = goalProgress(g, map[g.id], weekKey);
        const last = goalProgress(g, map[g.id], prevWeek);
        const behind = prog.total > 0 && prog.pct < 1 && g.status === "active";
        const suggestion = behind
          ? "Life happens — want to move it to next week, or shrink it to something smaller?"
          : "";
        return {
          goal: g,
          pct: prog.pct,
          done: prog.done,
          total: prog.total,
          lastWeekPct: last.pct,
          compounded: compoundedWeeks(g),
          behind,
          suggestion,
        };
      });
  }

  return {
    GOAL_HORIZONS, HORIZON_ORDER, GOAL_STATUSES,
    currentWeekKey, shiftWeekKey, activityDoneInWeek, activitiesForWeek,
    linkedTaskStats, goalProgress, goalsByHorizon, isNudgeable,
    pickOneThing, compoundedWeeks, weeklyReviewData,
  };
});
