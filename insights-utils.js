// Pure "Pattern insights" helpers (Step 5), shared by the app and its tests.
//
// Reflect, never diagnose: these functions surface YOUR OWN co-occurrences
// between inputs (what you did/ate) and outcomes (how you felt), plus a neutral
// weight trend. They compute rates and counts only — no advice, no goals, no
// value judgements. A pattern is only reported once there is enough data to be
// worth reflecting on (MIN_DAYS), so a day or two never masquerades as a trend.
//
// No browser dependencies, so this works both as a <script> tag (attaching to
// window.InsightsUtils) and under Node's test runner (via module.exports). Keep
// everything here side-effect free and DOM-free.
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api; // Node (tests)
  } else {
    root.InsightsUtils = api; // Browser (app.js reads window.InsightsUtils)
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // Minimum days with AND without a tag before we'll report a pattern for it.
  const MIN_DAYS = 5;

  // Input tags we correlate against outcomes (things you did / ate / met).
  // Ids match CONTEXT_TAGS + FOOD_TAGS in checkin-utils.js.
  const INPUT_TAGS = [
    { id: "slept-badly", label: "Slept badly", emoji: "😴" },
    { id: "exercised", label: "Exercised", emoji: "🏃" },
    { id: "caffeine", label: "Caffeine", emoji: "☕" },
    { id: "stressed", label: "Stressed", emoji: "😰" },
    { id: "people", label: "People", emoji: "👥" },
    { id: "heavy", label: "Heavy meal", emoji: "🍽️" },
    { id: "light", label: "Light meal", emoji: "🥗" },
    { id: "skipped", label: "Skipped a meal", emoji: "⭕" },
    { id: "late", label: "Late eating", emoji: "🌙" },
  ];

  // Outcomes we measure a day against. `low-energy`/`low-mood` read the scalar
  // fields; `bloated`/`unwell` read the tag set. Kept as data so the UI can
  // offer them as toggles and label them consistently.
  const OUTCOMES = [
    { id: "low-mood", label: "Low mood", emoji: "🙁" },
    { id: "low-energy", label: "Low energy", emoji: "🔋" },
    { id: "bloated", label: "Bloating", emoji: "🎈" },
    { id: "unwell", label: "Feeling unwell", emoji: "🤒" },
  ];

  // Collapse many check-in moments into one summary per local day: the union of
  // all tags/foodTags seen that day, the lowest mood, and whether any moment was
  // low energy. Aggregating by day (not moment) is what makes a "day with X"
  // countable for correlation.
  function summariseDays(checkins) {
    const byDate = new Map();
    (checkins || []).forEach((c) => {
      if (!c || !c.date) return;
      let d = byDate.get(c.date);
      if (!d) { d = { date: c.date, tags: new Set(), lowMood: false, lowEnergy: false }; byDate.set(c.date, d); }
      (c.tags || []).forEach((t) => d.tags.add(t));
      (c.foodTags || []).forEach((t) => d.tags.add(t));
      if (typeof c.mood === "number" && c.mood <= 2) d.lowMood = true;
      if (c.energy === "low") d.lowEnergy = true;
    });
    return Array.from(byDate.values()).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  }

  // Does a day-summary show the given outcome?
  function dayHasOutcome(day, outcomeId) {
    if (outcomeId === "low-mood") return !!day.lowMood;
    if (outcomeId === "low-energy") return !!day.lowEnergy;
    return day.tags.has(outcomeId); // bloated / unwell
  }

  // For one input tag + one outcome: rate on days WITH the tag vs WITHOUT.
  // Returns null when either group is under MIN_DAYS (not enough to reflect on).
  function correlate(days, tagId, outcomeId) {
    let withN = 0, withOut = 0, withoutN = 0, withoutOut = 0;
    days.forEach((d) => {
      const has = d.tags.has(tagId);
      const out = dayHasOutcome(d, outcomeId);
      if (has) { withN += 1; if (out) withOut += 1; }
      else { withoutN += 1; if (out) withoutOut += 1; }
    });
    if (withN < MIN_DAYS || withoutN < MIN_DAYS) return null;
    const withRate = withOut / withN;
    const withoutRate = withoutN ? withoutOut / withoutN : 0;
    return {
      tagId, outcomeId,
      withN, withOut, withoutN, withoutOut,
      withRate, withoutRate,
      lift: withRate - withoutRate, // positive => outcome more common WITH the tag
    };
  }

  // All reportable input->outcome patterns, strongest absolute lift first. Only
  // patterns clearing MIN_DAYS on both sides are included.
  function findPatterns(checkins) {
    const days = summariseDays(checkins);
    const out = [];
    INPUT_TAGS.forEach((tag) => {
      OUTCOMES.forEach((oc) => {
        const r = correlate(days, tag.id, oc.id);
        if (r) out.push(r);
      });
    });
    out.sort((a, b) => Math.abs(b.lift) - Math.abs(a.lift));
    return out;
  }

  // Among days tagged `bloated`, which inputs co-occur most often. Returns rows
  // sorted by co-occurrence count; empty until there are >= MIN_DAYS bloated days.
  function bloatingClusters(checkins) {
    const days = summariseDays(checkins);
    const bloatedDays = days.filter((d) => d.tags.has("bloated"));
    if (bloatedDays.length < MIN_DAYS) return { totalDays: bloatedDays.length, rows: [] };
    const rows = INPUT_TAGS.map((tag) => {
      const n = bloatedDays.filter((d) => d.tags.has(tag.id)).length;
      return { tagId: tag.id, count: n, rate: n / bloatedDays.length };
    }).filter((r) => r.count > 0).sort((a, b) => b.count - a.count);
    return { totalDays: bloatedDays.length, rows };
  }

  // Weight trend over a window (in days) ending at the latest entry. Returns the
  // points in range, first/last kg, delta, and 0..1 normalised sparkline coords.
  function weightTrend(weights, windowDays) {
    const pts = (weights || [])
      .filter((w) => w && typeof w.kg === "number" && w.date)
      .sort((a, b) => (a.at || 0) - (b.at || 0));
    if (!pts.length) return { count: 0, first: null, last: null, delta: null, points: [], spark: [] };
    const latest = pts[pts.length - 1];
    const cutoff = shiftDate(latest.date, -(windowDays - 1));
    const inRange = pts.filter((w) => w.date >= cutoff);
    const first = inRange[0], last = inRange[inRange.length - 1];
    const kgs = inRange.map((w) => w.kg);
    const min = Math.min.apply(null, kgs), max = Math.max.apply(null, kgs);
    const span = max - min || 1;
    const spark = inRange.map((w, i) => ({
      x: inRange.length === 1 ? 0 : i / (inRange.length - 1),
      y: (w.kg - min) / span, // 0 = lowest kg, 1 = highest kg
    }));
    return { count: inRange.length, first: first.kg, last: last.kg, delta: last.kg - first.kg, points: inRange, spark };
  }

  // Shift a "YYYY-MM-DD" by n days (UTC math avoids DST drift).
  function shiftDate(iso, n) {
    const d = new Date(iso + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }

  return {
    MIN_DAYS, INPUT_TAGS, OUTCOMES,
    summariseDays, dayHasOutcome, correlate, findPatterns,
    bloatingClusters, weightTrend, shiftDate,
  };
});
