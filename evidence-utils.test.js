// Tests for the pure "Evidence Vault" helpers (Phase D). Run with: node --test
// No dependencies — uses Node's built-in test runner and assert module.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  PROOF_TAGS,
  proofTag, proofTagLabel, proofTagEmoji,
  weekKeyForDate, weekKeyForMs,
  inRange, filterEntries, entriesForWeek,
  weeklyDones, weekConditions, buildDespiteLine,
} = require("./evidence-utils.js");

// Build an evidence entry quickly.
function ev(over) {
  return Object.assign({ id: "e", date: "2026-07-15", at: 1, title: "Did a thing" }, over);
}

test("PROOF_TAGS lookups map ids to labels/emoji, unknown falls back", () => {
  assert.equal(proofTagLabel("resilience"), "Resilience");
  assert.equal(proofTagEmoji("discipline"), "🎯");
  assert.equal(proofTag("nope"), null);
  assert.equal(proofTagLabel("nope"), "nope");
  assert.equal(proofTagEmoji("nope"), "💠");
  assert.equal(PROOF_TAGS.length, 5);
});

test("weekKeyForDate matches known ISO-8601 weeks", () => {
  // 2026-01-01 is a Thursday -> ISO week 1 of 2026.
  assert.equal(weekKeyForDate("2026-01-01"), "2026-W01");
  // 2026-07-15 is a Wednesday -> ISO week 29.
  assert.equal(weekKeyForDate("2026-07-15"), "2026-W29");
  // 2026-01-01's Monday belongs to week 1 too (Mon 2025-12-29 is W01 boundary).
  assert.equal(weekKeyForDate("2025-12-29"), "2026-W01");
  assert.equal(weekKeyForDate(""), "");
});

test("weekKeyForMs keys off the local calendar day", () => {
  const ms = new Date(2026, 6, 15, 9, 30).getTime(); // 2026-07-15 local
  assert.equal(weekKeyForMs(ms), "2026-W29");
  assert.equal(weekKeyForMs(0), "");
});

test("inRange is inclusive and treats missing bounds as open", () => {
  const e = ev({ date: "2026-07-15" });
  assert.equal(inRange(e, "2026-07-15", "2026-07-15"), true, "inclusive both ends");
  assert.equal(inRange(e, "2026-07-16", null), false, "before from");
  assert.equal(inRange(e, null, "2026-07-14"), false, "after to");
  assert.equal(inRange(e, null, null), true, "open range");
  assert.equal(inRange(null, null, null), false, "no entry");
  assert.equal(inRange({ id: "x" }, null, null), false, "no date");
});

test("filterEntries keeps in-range rows, newest moment first", () => {
  const list = [
    ev({ id: "1", date: "2026-07-10", at: 3 }),
    ev({ id: "2", date: "2026-07-15", at: 5 }),
    ev({ id: "3", date: "2026-07-20", at: 9 }),
  ];
  const rows = filterEntries(list, "2026-07-11", "2026-07-19");
  assert.deepEqual(rows.map((r) => r.id), ["2"]);
  const all = filterEntries(list, null, null);
  assert.deepEqual(all.map((r) => r.id), ["3", "2", "1"], "newest at first");
});

test("entriesForWeek buckets by the entry's ISO week", () => {
  const list = [
    ev({ id: "1", date: "2026-07-15", at: 2 }), // W29
    ev({ id: "2", date: "2026-07-16", at: 5 }), // W29
    ev({ id: "3", date: "2026-07-22", at: 1 }), // W30
  ];
  const rows = entriesForWeek(list, "2026-W29");
  assert.deepEqual(rows.map((r) => r.id), ["2", "1"], "only W29, newest first");
});

test("weeklyDones pulls items/activities/goals for the week only", () => {
  const wk = "2026-W29";
  const doneMs = new Date(2026, 6, 15, 12, 0).getTime(); // in W29
  const otherMs = new Date(2026, 6, 22, 12, 0).getTime(); // W30
  const items = [
    { id: "i1", title: "Ship it", done: 1, doneAt: doneMs },
    { id: "i2", title: "Later", done: 1, doneAt: otherMs },
    { id: "i3", title: "Open", done: 0, doneAt: doneMs },
  ];
  const goals = [
    {
      id: "g1", title: "Fitness", status: "active", updatedAt: otherMs,
      activities: [
        { id: "a1", title: "Gym", doneWeeks: [wk, "2026-W28"] },
        { id: "a2", title: "Run", doneWeeks: ["2026-W30"] },
      ],
    },
    { id: "g2", title: "Book", status: "done", updatedAt: doneMs, activities: [] },
  ];
  const out = weeklyDones(items, goals, wk);
  const ids = out.map((d) => d.id).sort();
  assert.deepEqual(ids, ["g1:a1", "g2", "i1"], "only week-matching dones, no done:0");
});

test("weekConditions counts distinct days + sums med doses", () => {
  const wk = "2026-W29";
  const checkins = [
    { date: "2026-07-13", mood: 1, energy: "low", tags: ["slept-badly"], sleep: "poor" },
    { date: "2026-07-13", mood: 2, energy: "low", tags: [], sleep: "poor" }, // same day
    { date: "2026-07-15", mood: 4, energy: "ok", tags: [], sleep: "good" },
    { date: "2026-07-22", mood: 1, energy: "low", tags: [], sleep: "poor" }, // W30
  ];
  const health = [
    { date: "2026-07-14", kind: "med", name: "Paracetamol", count: 2 },
    { date: "2026-07-15", kind: "med", name: "Paracetamol", count: 1 },
    { date: "2026-07-22", kind: "med", name: "Paracetamol", count: 5 }, // W30
  ];
  const c = weekConditions(checkins, health, wk);
  assert.equal(c.lowMoodDays, 1, "07-13 only (distinct day)");
  assert.equal(c.lowEnergyDays, 1, "07-13 only");
  assert.equal(c.sleptBadlyDays, 1);
  assert.equal(c.poorSleepDays, 1, "07-13 only, distinct day");
  assert.equal(c.medDoses, 3, "2+1 in week, 5 excluded");
});

test("buildDespiteLine is positive-only and null when unremarkable", () => {
  assert.equal(buildDespiteLine({}, 0, 0), null, "nothing achieved");
  assert.equal(buildDespiteLine({ lowMoodDays: 0 }, 2, 0), null, "no hard conditions");
  const line = buildDespiteLine({ poorSleepDays: 2, lowMoodDays: 1 }, 3, 1);
  assert.match(line, /^Even with /);
  assert.match(line, /2 rough nights' sleep and a low-mood day/);
  assert.match(line, /got 3 things done and captured 1 piece of evidence/);
  assert.doesNotMatch(line, /fail|should|poor|bad/i, "never punitive");
});
