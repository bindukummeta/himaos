// Pure "Do Now" helpers, shared by the app and its tests.
//
// No browser dependencies, so it works both as a <script> tag (attaching to
// window.DoNowUtils) and under Node's test runner (via module.exports). Keep
// everything here side-effect free and DOM-free.
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api; // Node (tests)
  } else {
    root.DoNowUtils = api; // Browser (app.js reads window.DoNowUtils)
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // The fixed time/energy choices the pickers offer.
  const TIME_CHOICES = [5, 15, 30, 60, 120]; // minutes; 120 shown as "2h+"
  const ENERGY_CHOICES = ["low", "med", "high"];
  const ENERGY_RANK = { low: 1, med: 2, high: 3 };

  // Minutes -> short label. null/undefined -> "" (untagged).
  function fmtMinutes(m) {
    if (m == null) return "";
    if (m >= 120) return "2h+";
    if (m >= 60) return "1h";
    return m + "m";
  }

  // Does an item fit the chosen budget?
  //  - item:  a stored item ({ done, sectionId, minutes, energy })
  //  - kindOf: map of sectionId -> kind (only "checklist" items are tasks)
  //  - budget: { minutes, energy } where "" / null means "Any"
  // Strict rule: a budget that is NOT "Any" excludes untagged tasks, so what
  // Do Now hands you genuinely fits the time/energy you said you have.
  function taskFits(item, kindOf, budget) {
    if (!item || item.done) return false;
    if (kindOf[item.sectionId] !== "checklist") return false;
    const mins = budget && budget.minutes;
    const energy = budget && budget.energy;
    if (mins != null && mins !== "") {
      if (item.minutes == null || item.minutes > Number(mins)) return false;
    }
    if (energy != null && energy !== "") {
      if (!item.energy || ENERGY_RANK[item.energy] > ENERGY_RANK[energy]) return false;
    }
    return true;
  }

  // Sort comparator: shortest first, then lowest energy, then manual order.
  // Untagged time/energy sink to the bottom of their group.
  function donowSort(a, b) {
    const ma = a.minutes == null ? Infinity : a.minutes;
    const mb = b.minutes == null ? Infinity : b.minutes;
    if (ma !== mb) return ma - mb;
    const ea = a.energy ? ENERGY_RANK[a.energy] : 9;
    const eb = b.energy ? ENERGY_RANK[b.energy] : 9;
    if (ea !== eb) return ea - eb;
    return (a.order || 0) - (b.order || 0);
  }

  return {
    TIME_CHOICES: TIME_CHOICES,
    ENERGY_CHOICES: ENERGY_CHOICES,
    ENERGY_RANK: ENERGY_RANK,
    fmtMinutes: fmtMinutes,
    taskFits: taskFits,
    donowSort: donowSort,
  };
});
