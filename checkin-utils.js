// Pure "Daily check-in" helpers, shared by the app and its tests.
//
// No browser dependencies, so it works both as a <script> tag (attaching to
// window.CheckinUtils) and under Node's test runner (via module.exports). Keep
// everything here side-effect free and DOM-free. Records carry a `date`
// ("YYYY-MM-DD", local day) so grouping needs no timezone math here.
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api; // Node (tests)
  } else {
    root.CheckinUtils = api; // Browser (app.js reads window.CheckinUtils)
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // 5-point mood scale (rough -> great). Stored as the numeric `val`.
  const MOOD_CHOICES = [
    { val: 1, emoji: "😔", label: "Rough" },
    { val: 2, emoji: "🙁", label: "Low" },
    { val: 3, emoji: "😐", label: "Okay" },
    { val: 4, emoji: "🙂", label: "Good" },
    { val: 5, emoji: "😄", label: "Great" },
  ];

  // Optional context tags (multi-select). Ids are stable for future insights.
  // `bloated` is an outcome tag (how the body feels), sitting alongside the
  // other "what's going on" signals so it can later correlate with food.
  const CONTEXT_TAGS = [
    { id: "slept-badly", emoji: "😴", label: "Slept badly" },
    { id: "hungry", emoji: "🍽️", label: "Hungry" },
    { id: "tired", emoji: "😩", label: "Tired" },
    { id: "stressed", emoji: "😰", label: "Stressed" },
    { id: "people", emoji: "👥", label: "People" },
    { id: "exercised", emoji: "🏃", label: "Exercised" },
    { id: "caffeine", emoji: "☕", label: "Caffeine" },
    { id: "bloated", emoji: "🎈", label: "Bloated" },
    { id: "unwell", emoji: "🤒", label: "Unwell" },
  ];

  // Optional food tags (multi-select), captured next to a one-line meal note.
  // Kept separate from CONTEXT_TAGS so "what I ate" stays distinct from "how I
  // feel / what's going on"; both feed future pattern insights (Step 5).
  const FOOD_TAGS = [
    { id: "heavy", emoji: "🍽️", label: "Heavy" },
    { id: "light", emoji: "🥗", label: "Light" },
    { id: "skipped", emoji: "⭕", label: "Skipped" },
    { id: "late", emoji: "🌙", label: "Late" },
  ];

  function moodChoice(n) {
    return MOOD_CHOICES.find((m) => m.val === Number(n)) || null;
  }
  function moodLabel(n) { const c = moodChoice(n); return c ? c.label : ""; }
  function moodEmoji(n) { const c = moodChoice(n); return c ? c.emoji : ""; }
  function tagLabel(id) { const t = CONTEXT_TAGS.find((x) => x.id === id); return t ? t.label : id; }
  function foodTagLabel(id) { const t = FOOD_TAGS.find((x) => x.id === id); return t ? t.label : id; }

  // All check-ins on a given local day, newest moment first.
  function checkinsOn(list, dateISO) {
    return (list || [])
      .filter((c) => c && c.date === dateISO)
      .sort((a, b) => (b.at || 0) - (a.at || 0));
  }

  // The single most recent check-in (by `at`), or null.
  function latestCheckin(list) {
    let best = null;
    (list || []).forEach((c) => {
      if (!best || (c.at || 0) > (best.at || 0)) best = c;
    });
    return best;
  }

  // Shift a "YYYY-MM-DD" string by n days (UTC math avoids DST/timezone drift).
  function addDays(dateISO, n) {
    const d = new Date(dateISO + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }

  // Consecutive days (ending today) with at least one check-in. Anti-guilt: if
  // today has none yet but yesterday does, the streak still counts from
  // yesterday, so a fresh morning doesn't wipe your run.
  function checkinStreak(list, todayISO) {
    const days = new Set((list || []).map((c) => c && c.date).filter(Boolean));
    let cursor;
    if (days.has(todayISO)) cursor = todayISO;
    else if (days.has(addDays(todayISO, -1))) cursor = addDays(todayISO, -1);
    else return 0;
    let count = 0;
    while (days.has(cursor)) {
      count += 1;
      cursor = addDays(cursor, -1);
    }
    return count;
  }

  return {
    MOOD_CHOICES: MOOD_CHOICES,
    CONTEXT_TAGS: CONTEXT_TAGS,
    FOOD_TAGS: FOOD_TAGS,
    moodChoice: moodChoice,
    moodLabel: moodLabel,
    moodEmoji: moodEmoji,
    tagLabel: tagLabel,
    foodTagLabel: foodTagLabel,
    checkinsOn: checkinsOn,
    latestCheckin: latestCheckin,
    addDays: addDays,
    checkinStreak: checkinStreak,
  };
});
