// Tests for the pure "Health logging" helpers (Phase C). Run with: node --test
// No dependencies — uses Node's built-in test runner and assert module.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  EXERCISE_TYPES, KINDS,
  exerciseType, exerciseLabel, exerciseEmoji, medKey,
  healthOn, exerciseTag, vitaminTag, medTag,
  dayInputTags, summariseHealthDays, medCount, medNames,
} = require("./health-utils.js");

// Build health entries quickly.
function ex(over) {
  return Object.assign({ id: "e", date: "2026-07-15", at: 1, kind: "exercise", types: ["walk"] }, over);
}
function vit(over) {
  return Object.assign({ id: "v", date: "2026-07-15", at: 1, kind: "vitamin", vitId: "d3" }, over);
}
function med(over) {
  return Object.assign({ id: "m", date: "2026-07-15", at: 1, kind: "med", name: "Paracetamol", count: 1 }, over);
}

test("EXERCISE_TYPES lookups map ids to labels/emoji, unknown falls back", () => {
  assert.equal(exerciseLabel("legs"), "Leg day");
  assert.equal(exerciseEmoji("walk"), "🚶");
  assert.equal(exerciseType("nope"), null);
  assert.equal(exerciseLabel("nope"), "nope");
  assert.equal(exerciseEmoji("nope"), "🏃");
  assert.ok(EXERCISE_TYPES.length >= 5);
});

test("medKey normalises name (case, trim, collapse spaces)", () => {
  assert.equal(medKey("Paracetamol"), "paracetamol");
  assert.equal(medKey("  paracetamol "), "paracetamol");
  assert.equal(medKey("Vitamin  D3"), "vitamin d3");
  assert.equal(medKey(null), "");
});

test("tag builders produce the stable input ids the insights engine reads", () => {
  assert.equal(exerciseTag("legs"), "exercise:legs");
  assert.equal(vitaminTag("d3"), "vit:d3");
  assert.equal(medTag("Paracetamol"), "med:paracetamol");
  assert.equal(medTag("  Ibu Profen "), "med:ibu profen");
});

test("healthOn filters to a day, newest moment first", () => {
  const list = [
    ex({ id: "1", date: "2026-07-15", at: 3 }),
    med({ id: "2", date: "2026-07-15", at: 5 }),
    vit({ id: "3", date: "2026-07-14", at: 9 }),
  ];
  const rows = healthOn(list, "2026-07-15");
  assert.deepEqual(rows.map((r) => r.id), ["2", "1"], "only 07-15, newest at first");
});

test("dayInputTags folds all three kinds into presence tags", () => {
  const entries = [
    ex({ types: ["walk", "legs"] }),
    ex({ id: "e2", types: undefined, type: "upper" }), // single `type` also supported
    vit({ vitId: "d3" }),
    vit({ id: "v2", vitId: "b12" }),
    med({ name: "Paracetamol", count: 2 }),
  ];
  const tags = dayInputTags(entries);
  assert.ok(tags.has("exercise:walk"));
  assert.ok(tags.has("exercise:legs"));
  assert.ok(tags.has("exercise:upper"));
  assert.ok(tags.has("vit:d3"));
  assert.ok(tags.has("vit:b12"));
  assert.ok(tags.has("med:paracetamol"));
  assert.equal(tags.size, 6, "no count leakage into presence tags");
});

test("dayInputTags ignores empty / malformed entries", () => {
  const tags = dayInputTags([null, {}, { kind: "exercise", types: [] }, { kind: "med" }, { kind: "vitamin" }]);
  assert.equal(tags.size, 0);
});

test("summariseHealthDays groups by day, sorted ascending, tags per day", () => {
  const entries = [
    ex({ date: "2026-07-16", types: ["legs"] }),
    vit({ date: "2026-07-15", vitId: "d3" }),
    med({ date: "2026-07-15", name: "Paracetamol" }),
  ];
  const days = summariseHealthDays(entries);
  assert.deepEqual(days.map((d) => d.date), ["2026-07-15", "2026-07-16"]);
  assert.ok(days[0].tags.has("vit:d3"));
  assert.ok(days[0].tags.has("med:paracetamol"));
  assert.ok(days[1].tags.has("exercise:legs"));
});

test("medCount sums doses (default 1), optionally scoped to a day", () => {
  const entries = [
    med({ id: "1", date: "2026-07-15", name: "Paracetamol", count: 2 }),
    med({ id: "2", date: "2026-07-15", name: "paracetamol" }), // no count => 1
    med({ id: "3", date: "2026-07-16", name: "Paracetamol", count: 1 }),
    med({ id: "4", date: "2026-07-15", name: "Ibuprofen", count: 1 }),
    ex({ id: "5", date: "2026-07-15" }), // non-med ignored
  ];
  assert.equal(medCount(entries, "Paracetamol"), 4, "2 + 1 + 1 across all days");
  assert.equal(medCount(entries, "paracetamol", "2026-07-15"), 3, "2 + 1 on that day");
  assert.equal(medCount(entries, "Ibuprofen"), 1);
  assert.equal(medCount(entries, "Nothing"), 0);
});

test("medNames lists distinct names by display form, sorted", () => {
  const entries = [
    med({ name: "Paracetamol" }),
    med({ name: "paracetamol" }),
    med({ name: "Ibuprofen" }),
    vit({ vitId: "d3" }),
  ];
  assert.deepEqual(medNames(entries), ["Ibuprofen", "Paracetamol"]);
});
