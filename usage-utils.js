// Pure private-usage helpers (dogfooding retention), shared by the app and tests.
//
// This exists to answer ONE honest question for user zero: "over the last N days,
// on how many did I actually DO something in Hima OS?" Meaningful-action days —
// not raw opens — are the real retention signal (opening and bouncing isn't use).
//
// Privacy + integrity by design:
//   - Everything is on-device (recorded via HimaStore meta, like all app state).
//   - Nothing here is shown by default. The summary is computed only when the
//     user deliberately asks (a Settings button), so the metric can't quietly
//     nudge behaviour and corrupt the very signal it measures (reactivity).
//
// No browser dependencies, so this works both as a <script> tag (attaching to
// window.UsageUtils) and under Node's test runner (via module.exports). Keep
// everything here side-effect free and DOM-free.
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api; // Node (tests)
  } else {
    root.UsageUtils = api; // Browser (app.js reads window.UsageUtils)
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // The default review window. Two weeks is the minimum for a daily habit to
  // mean anything — the novelty of a new app carries the first few days.
  const WINDOW_DAYS = 14;

  // Local calendar day "YYYY-MM-DD" (local, not UTC, so "today" matches the
  // user's day). Mirrors app.js todayISO() so recorded days line up.
  function dayKey(date) {
    const d = date || new Date();
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 10);
  }

  // Idempotently add a day to a sorted-unique list (returns a NEW array so the
  // caller can detect a no-op by identity). Recording twice in a day is free.
  function markDay(list, day) {
    const arr = Array.isArray(list) ? list : [];
    if (arr.indexOf(day) >= 0) return arr; // already recorded today → no write
    return arr.concat([day]).sort();
  }

  // The set of day keys within [today - (windowDays-1), today], inclusive.
  function windowDayKeys(today, windowDays) {
    const n = windowDays || WINDOW_DAYS;
    const base = new Date(today + "T00:00:00");
    const keys = [];
    for (let i = 0; i < n; i++) {
      const d = new Date(base);
      d.setDate(base.getDate() - i);
      keys.push(dayKey(d));
    }
    return keys;
  }

  // How many days in the window appear in `list`.
  function daysActiveInWindow(list, today, windowDays) {
    const inWindow = new Set(windowDayKeys(today, windowDays));
    const seen = new Set(Array.isArray(list) ? list : []);
    let count = 0;
    inWindow.forEach((k) => { if (seen.has(k)) count++; });
    return count;
  }

  // Longest run of consecutive action-days ending on OR before today, looking
  // only within the window. A gentle "how sticky has it felt lately" read.
  function currentStreak(list, today, windowDays) {
    const seen = new Set(Array.isArray(list) ? list : []);
    const keys = windowDayKeys(today, windowDays); // today first, going back
    let streak = 0;
    for (const k of keys) {
      if (seen.has(k)) streak++;
      else break;
    }
    return streak;
  }

  // The deliberate, on-demand summary. `openDays`/`actionDays` are the two
  // recorded lists; returns plain numbers for the app to render as text.
  function usageSummary(openDays, actionDays, today, windowDays) {
    const n = windowDays || WINDOW_DAYS;
    const t = today || dayKey();
    const opened = daysActiveInWindow(openDays, t, n);
    const acted = daysActiveInWindow(actionDays, t, n);
    return {
      windowDays: n,
      openedDays: opened,
      actionDays: acted,
      streak: currentStreak(actionDays, t, n),
      // Share of opens that turned into a real action — a rough "was it useful,
      // not just a habit-tic" read. 0 when there were no opens.
      actionRate: opened ? acted / opened : 0,
    };
  }

  return {
    WINDOW_DAYS,
    dayKey, markDay, windowDayKeys,
    daysActiveInWindow, currentStreak, usageSummary,
  };
});
