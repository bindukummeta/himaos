// Pure "Health logging" helpers (Phase C), shared by the app and its tests.
//
// Three kinds of health entry share one timestamped store (mirroring checkins):
//   - exercise: one or more types done that day (multi-select).
//   - vitamin:  a "took it" tick against a define-once vitamin id.
//   - med:      an ad-hoc medication by name + a count (e.g. paracetamol x2).
//
// Reflect, never diagnose: these fold into per-day INPUT tags that the insights
// engine correlates by PRESENCE only (a day "had" the input if it appears at
// all). Med counts are aggregated for later count-based views, but correlation
// stays presence-based.
//
// No browser dependencies, so this works both as a <script> tag (attaching to
// window.HealthUtils) and under Node's test runner (via module.exports). Keep
// everything here side-effect free and DOM-free.
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api; // Node (tests)
  } else {
    root.HealthUtils = api; // Browser (app.js reads window.HealthUtils)
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // Exercise types (multi-select). Ids are stable for future insights; the
  // per-type input tag id is "exercise:<id>". Blank day = rest (nothing logged).
  const EXERCISE_TYPES = [
    { id: "legs", emoji: "🦵", label: "Leg day" },
    { id: "upper", emoji: "💪", label: "Upper body" },
    { id: "whole", emoji: "🏋️", label: "Whole body" },
    { id: "walk", emoji: "🚶", label: "Walk" },
    { id: "other", emoji: "🧘", label: "Other / light" },
  ];

  const KINDS = { exercise: "exercise", vitamin: "vitamin", med: "med" };

  function exerciseType(id) {
    return EXERCISE_TYPES.find((t) => t.id === id) || null;
  }
  function exerciseLabel(id) { const t = exerciseType(id); return t ? t.label : id; }
  function exerciseEmoji(id) { const t = exerciseType(id); return t ? t.emoji : "🏃"; }

  // Normalise a free-text medication name into a stable id fragment: lowercased,
  // trimmed, spaces collapsed. So "Paracetamol" and " paracetamol " agree.
  function medKey(name) {
    return String(name || "").trim().toLowerCase().replace(/\s+/g, " ");
  }

  // All health entries on a given local day, newest moment first.
  function healthOn(list, dateISO) {
    return (list || [])
      .filter((h) => h && h.date === dateISO)
      .sort((a, b) => (b.at || 0) - (a.at || 0));
  }

  // The per-day INPUT tag id for each kind. These are the ids that flow into the
  // insights correlation engine alongside CONTEXT_TAGS / FOOD_TAGS.
  function exerciseTag(typeId) { return "exercise:" + typeId; }
  function vitaminTag(vitId) { return "vit:" + vitId; }
  function medTag(name) { return "med:" + medKey(name); }

  // Fold one day's health entries into a Set of presence input tags. An exercise
  // entry may carry `types` (array) or a single `type`; a vitamin entry carries
  // `vitId`; a med entry carries `name` (+ optional count, ignored for presence).
  function dayInputTags(entries) {
    const tags = new Set();
    (entries || []).forEach((h) => {
      if (!h) return;
      if (h.kind === KINDS.exercise) {
        const types = Array.isArray(h.types) ? h.types : (h.type ? [h.type] : []);
        types.forEach((t) => { if (t) tags.add(exerciseTag(t)); });
      } else if (h.kind === KINDS.vitamin) {
        if (h.vitId) tags.add(vitaminTag(h.vitId));
      } else if (h.kind === KINDS.med) {
        if (h.name) tags.add(medTag(h.name));
      }
    });
    return tags;
  }

  // Group health entries by local day -> { date, tags:Set of presence input ids }.
  // This is the shape summariseDays() in insights-utils merges into each day.
  function summariseHealthDays(entries) {
    const byDate = new Map();
    (entries || []).forEach((h) => {
      if (!h || !h.date) return;
      let d = byDate.get(h.date);
      if (!d) { d = { date: h.date, entries: [] }; byDate.set(h.date, d); }
      d.entries.push(h);
    });
    return Array.from(byDate.values())
      .map((d) => ({ date: d.date, tags: dayInputTags(d.entries) }))
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  }

  // Total count of a given medication across entries (optionally within a day).
  // Count-based, for later "heavy-paracetamol days" views; not used by presence
  // correlation. Missing/invalid counts default to 1 (one dose logged).
  function medCount(entries, name, dateISO) {
    const key = medKey(name);
    return (entries || []).reduce((sum, h) => {
      if (!h || h.kind !== KINDS.med) return sum;
      if (medKey(h.name) !== key) return sum;
      if (dateISO && h.date !== dateISO) return sum;
      const c = Number(h.count);
      return sum + (Number.isFinite(c) && c > 0 ? c : 1);
    }, 0);
  }

  // Distinct medication names seen (by display form of first occurrence), sorted.
  function medNames(entries) {
    const seen = new Map();
    (entries || []).forEach((h) => {
      if (!h || h.kind !== KINDS.med || !h.name) return;
      const key = medKey(h.name);
      if (!seen.has(key)) seen.set(key, String(h.name).trim());
    });
    return Array.from(seen.values()).sort((a, b) => a.localeCompare(b));
  }

  return {
    EXERCISE_TYPES: EXERCISE_TYPES,
    KINDS: KINDS,
    exerciseType: exerciseType,
    exerciseLabel: exerciseLabel,
    exerciseEmoji: exerciseEmoji,
    medKey: medKey,
    healthOn: healthOn,
    exerciseTag: exerciseTag,
    vitaminTag: vitaminTag,
    medTag: medTag,
    dayInputTags: dayInputTags,
    summariseHealthDays: summariseHealthDays,
    medCount: medCount,
    medNames: medNames,
  };
});
