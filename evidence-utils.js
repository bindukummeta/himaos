// Pure "Evidence Vault" helpers (Phase D), shared by the app and its tests.
//
// The Vault records date-stamped things you did. Each entry needs only a date +
// a one-line title; the reflection fields (challenges/setbacks/achievements/
// lessons/whatItProves) and proof-tags are optional. The weekly view pulls in
// the "dones" the app already tracks (finished to-dos, ticked activities,
// completed goals) beside your written entries, and caps it with an
// ENCOURAGING, reflect-not-diagnose line ("Even with a rough week, you still…").
// It is never punitive: buildDespiteLine only ever frames conditions as things
// you overcame, and returns null when there is nothing notable to celebrate.
//
// No browser dependencies, so this works both as a <script> tag (attaching to
// window.EvidenceUtils) and under Node's test runner (via module.exports). Keep
// everything here side-effect free and DOM-free.
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api; // Node (tests)
  } else {
    root.EvidenceUtils = api; // Browser (evidence-view.js reads window.EvidenceUtils)
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // med aggregation is reused from health-utils (identical need). Resolve once.
  const HU = (typeof require === "function")
    ? require("./health-utils.js")
    : (typeof self !== "undefined" ? self.HealthUtils : undefined);

  // What an entry can prove about you. Ids are stable; label/emoji for display.
  const PROOF_TAGS = [
    { id: "resilience", emoji: "💪", label: "Resilience" },
    { id: "discipline", emoji: "🎯", label: "Discipline" },
    { id: "showed-up-anyway", emoji: "🌱", label: "Showed up anyway" },
    { id: "courage", emoji: "🦁", label: "Courage" },
    { id: "kindness", emoji: "💛", label: "Kindness" },
  ];
  function proofTag(id) { return PROOF_TAGS.find((t) => t.id === id) || null; }
  function proofTagLabel(id) { const t = proofTag(id); return t ? t.label : id; }
  function proofTagEmoji(id) { const t = proofTag(id); return t ? t.emoji : "💠"; }

  // ISO-8601 week key "YYYY-Www" (weeks start Monday; week 1 holds the first
  // Thursday). Replicated from goals-utils so the module stays independently
  // testable; goals-utils.currentWeekKey takes a Date, we key off ISO/ms here.
  function isoWeekKey(d) {
    const day = d.getUTCDay() || 7; // Sun=0 -> 7
    d.setUTCDate(d.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
    return d.getUTCFullYear() + "-W" + String(week).padStart(2, "0");
  }
  function weekKeyForDate(dateISO) {
    if (!dateISO) return "";
    return isoWeekKey(new Date(dateISO + "T00:00:00Z"));
  }
  function weekKeyForMs(ms) {
    if (!ms) return "";
    const d = new Date(ms);
    return isoWeekKey(new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())));
  }

  // Inclusive date-range membership. Omit either bound to leave it open.
  function inRange(entry, fromISO, toISO) {
    if (!entry || !entry.date) return false;
    if (fromISO && entry.date < fromISO) return false;
    if (toISO && entry.date > toISO) return false;
    return true;
  }
  function filterEntries(entries, fromISO, toISO) {
    return (entries || [])
      .filter((e) => inRange(e, fromISO, toISO))
      .sort((a, b) => (b.at || 0) - (a.at || 0));
  }
  function entriesForWeek(entries, weekKey) {
    return (entries || [])
      .filter((e) => e && weekKeyForDate(e.date) === weekKey)
      .sort((a, b) => (b.at || 0) - (a.at || 0));
  }

  // The "dones" the app already tracks, folded into one read-only list for a
  // week: finished to-dos (by doneAt), ticked activities (doneWeeks), and
  // completed goals (by updatedAt — see v1 caveat: an old completion edited this
  // week can show here; accepted as a positive over-count, never a loss).
  function weeklyDones(items, goals, weekKey) {
    const out = [];
    (items || []).forEach((it) => {
      if (!it) return;
      if ((it.done ? 1 : 0) === 1 && weekKeyForMs(it.doneAt) === weekKey) {
        out.push({ source: "item", id: it.id, title: it.title, emoji: "✅", at: it.doneAt || 0, goalTitle: null });
      }
    });
    (goals || []).forEach((g) => {
      if (!g) return;
      (Array.isArray(g.activities) ? g.activities : []).forEach((a) => {
        if (a && Array.isArray(a.doneWeeks) && a.doneWeeks.indexOf(weekKey) >= 0) {
          out.push({ source: "activity", id: g.id + ":" + a.id, title: a.title, emoji: "🔁", at: 0, goalTitle: g.title });
        }
      });
      if (g.status === "done" && weekKeyForMs(g.updatedAt) === weekKey) {
        out.push({ source: "goal", id: g.id, title: g.title, emoji: "🎯", at: g.updatedAt || 0, goalTitle: null });
      }
    });
    return out.sort((a, b) => (b.at || 0) - (a.at || 0));
  }

  // The week's conditions, as DISTINCT-DAY counts (medDoses is a dose sum). Only
  // ever used to frame achievements positively; missing sleep/mood is ignored.
  function weekConditions(checkins, healthEntries, weekKey) {
    const inWeek = (c) => c && weekKeyForDate(c.date) === weekKey;
    const days = (pred) => {
      const set = new Set();
      (checkins || []).forEach((c) => { if (inWeek(c) && pred(c)) set.add(c.date); });
      return set.size;
    };
    const weekHealth = (healthEntries || []).filter((h) => h && weekKeyForDate(h.date) === weekKey);
    const medDoses = HU
      ? HU.medNames(weekHealth).reduce((s, n) => s + HU.medCount(weekHealth, n), 0)
      : 0;
    return {
      lowMoodDays: days((c) => typeof c.mood === "number" && c.mood <= 2),
      lowEnergyDays: days((c) => c.energy === "low"),
      sleptBadlyDays: days((c) => (c.tags || []).indexOf("slept-badly") >= 0),
      poorSleepDays: days((c) => c.sleep === "poor"),
      medDoses: medDoses,
    };
  }

  // Encouraging weekly line, or null when there's nothing notable to say (no
  // achievements, or a smooth week with no hard conditions). Positive-only.
  function buildDespiteLine(conditions, doneCount, writtenCount) {
    const c = conditions || {};
    const achieved = (doneCount || 0) + (writtenCount || 0);
    if (achieved === 0) return null;
    const cond = [];
    if (c.poorSleepDays > 0 || c.sleptBadlyDays > 0) {
      const n = Math.max(c.poorSleepDays || 0, c.sleptBadlyDays || 0);
      cond.push(n === 1 ? "a rough night's sleep" : n + " rough nights' sleep");
    }
    if (c.lowMoodDays > 0) cond.push(c.lowMoodDays === 1 ? "a low-mood day" : c.lowMoodDays + " low-mood days");
    if (c.lowEnergyDays > 0) cond.push(c.lowEnergyDays === 1 ? "a low-energy day" : c.lowEnergyDays + " low-energy days");
    if (c.medDoses > 0) cond.push("leaning on pain relief");
    if (!cond.length) return null;
    const X = cond.slice(0, 2).join(" and ");
    const parts = [];
    if (doneCount > 0) parts.push("got " + doneCount + " thing" + (doneCount === 1 ? "" : "s") + " done");
    if (writtenCount > 0) parts.push("captured " + writtenCount + " piece" + (writtenCount === 1 ? "" : "s") + " of evidence");
    return "Even with " + X + ", you still " + parts.join(" and ") + ".";
  }

  return {
    PROOF_TAGS: PROOF_TAGS,
    proofTag: proofTag,
    proofTagLabel: proofTagLabel,
    proofTagEmoji: proofTagEmoji,
    weekKeyForDate: weekKeyForDate,
    weekKeyForMs: weekKeyForMs,
    inRange: inRange,
    filterEntries: filterEntries,
    entriesForWeek: entriesForWeek,
    weeklyDones: weeklyDones,
    weekConditions: weekConditions,
    buildDespiteLine: buildDespiteLine,
  };
});
