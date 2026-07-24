// Pure "Q3 / deadline goals" helpers (Phase E), shared by the app and its tests.
//
// Extends the goals model without new stores: a goal may carry a `deadline`
// ("YYYY-MM-DD"), a `startedAt` (pace-window start, ms), embedded `milestones`
// (one-time checkbox when target is null, numeric progress otherwise), and its
// activities may carry a `weeklyTarget` with a per-week `weekCounts` tally.
//
// Everything here rolls those up into: overall completion %, a reflect-not-
// diagnose pace read (progress vs. how much of the window has elapsed), a days-
// left count, the next concrete step, and an auto weight-loss read from the
// separate weights store. Guilt-free by design: pace copy is calm, never a scold.
//
// DOM-free and side-effect free, so it works as a <script> (window.Q3Utils) and
// under Node's test runner (module.exports).
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api; // Node (tests)
  } else {
    root.Q3Utils = api; // Browser (views read window.Q3Utils)
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const DAY = 86400000;

  // ---- ISO week key (matches goals-utils; kept local so tests stay isolated) ----
  function weekKeyForDate(date) {
    const base = date || new Date();
    const d = new Date(Date.UTC(base.getFullYear(), base.getMonth(), base.getDate()));
    const day = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const week = Math.ceil(((d - yearStart) / DAY + 1) / 7);
    return d.getUTCFullYear() + "-W" + String(week).padStart(2, "0");
  }

  // ---- Weekly-target activities: how many of the target were logged this week ----
  function weekCountForActivity(activity, weekKey) {
    if (!activity) return 0;
    const counts = activity.weekCounts || {};
    if (counts[weekKey] != null) return counts[weekKey];
    // Fall back to the binary set: a ticked week counts as 1.
    return Array.isArray(activity.doneWeeks) && activity.doneWeeks.indexOf(weekKey) >= 0 ? 1 : 0;
  }
  function activityWeekStatus(activity, weekKey) {
    const target = activity && activity.weeklyTarget ? activity.weeklyTarget : null;
    const count = weekCountForActivity(activity, weekKey);
    if (!target) return { count, target: null, done: count > 0, pct: count > 0 ? 1 : 0 };
    return { count, target, done: count >= target, pct: Math.min(1, count / target) };
  }

  // ---- Milestone rollup: one-time = 1 unit; numeric = current/target fraction ----
  function milestoneProgress(m) {
    if (!m) return { pct: 0, done: false };
    if (m.target == null) return { pct: m.done ? 1 : 0, done: !!m.done };
    const pct = m.target > 0 ? Math.min(1, (m.current || 0) / m.target) : 0;
    return { pct, done: (m.current || 0) >= m.target };
  }
  function milestonesRollup(goal, weekKey) {
    const ms = (goal && Array.isArray(goal.milestones)) ? goal.milestones : [];
    let sum = 0;
    ms.forEach((m) => { sum += milestoneProgress(m).pct; });
    // Weekly-target activities contribute this-week fraction; binary ones 0/1.
    const acts = (goal && Array.isArray(goal.activities)) ? goal.activities : [];
    acts.forEach((a) => { sum += activityWeekStatus(a, weekKey).pct; });
    const total = ms.length + acts.length;
    const doneMs = ms.filter((m) => milestoneProgress(m).done).length;
    return { pct: total ? sum / total : 0, done: doneMs, total: total, doneMilestones: doneMs, totalMilestones: ms.length };
  }

  // ---- Days left + pace (progress vs. elapsed share of the goal's own window) ----
  function daysLeft(deadline, now) {
    if (!deadline) return null;
    const end = Date.parse(deadline + "T23:59:59");
    if (isNaN(end)) return null;
    return Math.max(0, Math.ceil((end - (now || Date.now())) / DAY));
  }
  function elapsedShare(goal, now) {
    if (!goal || !goal.deadline) return null;
    const start = goal.startedAt || goal.createdAt || null;
    const end = Date.parse(goal.deadline + "T23:59:59");
    if (start == null || isNaN(end) || end <= start) return null;
    const t = now || Date.now();
    return Math.min(1, Math.max(0, (t - start) / (end - start)));
  }
  // Pace is intentionally gentle: only three calm bands, encouraging copy.
  function paceFor(goal, weekKey, now) {
    const share = elapsedShare(goal, now);
    const roll = milestonesRollup(goal, weekKey);
    const left = daysLeft(goal && goal.deadline, now);
    if (share == null) return { band: "none", pct: roll.pct, daysLeft: left, label: "" };
    const gap = roll.pct - share; // >0 ahead, ~0 on-track, <0 behind
    let band, label;
    if (gap >= -0.08) { band = gap > 0.12 ? "ahead" : "ontrack"; label = band === "ahead" ? "Ahead of pace" : "On track"; }
    else { band = "behind"; label = "A little behind — room to catch up"; }
    return { band, pct: roll.pct, share, daysLeft: left, label };
  }

  // ---- Next concrete step for a goal (first open milestone/activity) ----
  function nextStepFor(goal, weekKey) {
    const acts = (goal && Array.isArray(goal.activities)) ? goal.activities : [];
    for (const a of acts) {
      const st = activityWeekStatus(a, weekKey);
      if (!st.done) return st.target ? a.title + " (" + st.count + "/" + st.target + " this week)" : a.title;
    }
    const ms = (goal && Array.isArray(goal.milestones)) ? goal.milestones : [];
    for (const m of ms) {
      const p = milestoneProgress(m);
      if (!p.done) return m.target != null ? m.title + " (" + (m.current || 0) + "/" + m.target + (m.unit ? " " + m.unit : "") + ")" : m.title;
    }
    return null;
  }

  // ---- Q3-at-a-glance: one row per goal that has a deadline ----
  function q3Glance(goals, weekKey, now) {
    return (Array.isArray(goals) ? goals : [])
      .filter((g) => g && g.deadline && g.horizon !== "vision")
      .sort((a, b) => (a.order || 0) - (b.order || 0) || (a.createdAt || 0) - (b.createdAt || 0))
      .map((g) => {
        const roll = milestonesRollup(g, weekKey);
        const pace = paceFor(g, weekKey, now);
        return { goal: g, pct: roll.pct, done: roll.doneMilestones, total: roll.totalMilestones,
          pace: pace, daysLeft: pace.daysLeft, nextStep: nextStepFor(g, weekKey) };
      });
  }

  // ---- Weight-loss auto-read from the weights store (ascending by .at) ----
  // targetKg = kg to LOSE. Returns start/latest/lost/pct or null when no data.
  function weightLoss(weights, targetKg) {
    const list = (Array.isArray(weights) ? weights : []).filter((w) => w && isFinite(w.kg) && w.kg > 0);
    if (!list.length) return null;
    const sorted = list.slice().sort((a, b) => (a.at || 0) - (b.at || 0));
    const start = sorted[0].kg;
    const latest = sorted[sorted.length - 1].kg;
    const lost = Math.max(0, start - latest);
    const pct = targetKg > 0 ? Math.min(1, lost / targetKg) : 0;
    return { start, latest, lost: Math.round(lost * 10) / 10, targetKg, pct, done: lost >= targetKg };
  }

  return {
    weekKeyForDate, weekCountForActivity, activityWeekStatus,
    milestoneProgress, milestonesRollup,
    daysLeft, elapsedShare, paceFor, nextStepFor, q3Glance, weightLoss,
  };
});
