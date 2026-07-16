// Tests for the pure "Dreaming collections" helpers (Step 3). Run: node --test
// No dependencies — uses Node's built-in test runner and assert module.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  DREAM_STARTERS, isDreamingSection, isReadingSection, usesSplitView, splitLabels,
  isAchieved, collectionStats, splitCollection,
} = require("./dreaming-utils.js");

// Build a collection item quickly. `done`/`doneAt` model the "achieved" state.
function item(over) {
  return Object.assign(
    { id: "x", title: "A dream", note: "", done: 0, doneAt: null, order: 1, createdAt: 1 },
    over
  );
}

test("DREAM_STARTERS are all collection-kind with stable keys", () => {
  assert.ok(DREAM_STARTERS.length >= 4);
  for (const s of DREAM_STARTERS) {
    assert.equal(s.kind, "collection");
    assert.equal(s.dreaming, true);
    assert.ok(s.id && s.key && s.name && s.icon, "has id/key/name/icon");
  }
  const keys = DREAM_STARTERS.map((s) => s.key);
  assert.deepEqual(keys, [...new Set(keys)], "keys are unique");
});

test("isDreamingSection: flag, known key, and negatives", () => {
  assert.equal(isDreamingSection({ kind: "collection", dreaming: true }), true);
  assert.equal(isDreamingSection({ kind: "collection", key: "bucket-list" }), true, "known key without flag");
  assert.equal(isDreamingSection({ kind: "collection", key: "want-to-read" }), false, "plain collection");
  assert.equal(isDreamingSection({ kind: "checklist", dreaming: true }), false, "non-collection never dreaming");
  assert.equal(isDreamingSection(null), false);
});

test("isReadingSection: flag, known key, and negatives", () => {
  assert.equal(isReadingSection({ kind: "collection", reading: true }), true);
  assert.equal(isReadingSection({ kind: "collection", key: "reading-now" }), true, "known key without flag");
  assert.equal(isReadingSection({ kind: "collection", key: "want-to-read" }), true, "known key without flag");
  assert.equal(isReadingSection({ kind: "collection", key: "bucket-list" }), false, "dreaming key is not reading");
  assert.equal(isReadingSection({ kind: "checklist", reading: true }), false, "non-collection never reading");
  assert.equal(isReadingSection(null), false);
});

test("usesSplitView is true for both dreaming and reading collections", () => {
  assert.equal(usesSplitView({ kind: "collection", key: "bucket-list" }), true, "dreaming");
  assert.equal(usesSplitView({ kind: "collection", key: "reading-now" }), true, "reading");
  assert.equal(usesSplitView({ kind: "collection", key: "misc" }), false, "plain collection");
  assert.equal(usesSplitView({ kind: "checklist" }), false, "checklist");
});

test("splitLabels: book wording for reading, dream wording otherwise", () => {
  const reading = splitLabels({ kind: "collection", key: "reading-now" });
  assert.equal(reading.someday, "Currently reading");
  assert.equal(reading.doneToast, "Finished it. 📚");
  assert.equal(reading.livedPrefix, "Finished");

  const dream = splitLabels({ kind: "collection", key: "bucket-list" });
  assert.equal(dream.someday, "Someday");
  assert.equal(dream.doneToast, "Lived it. ✨");
  assert.equal(dream.livedPrefix, "Lived");
});

test("isAchieved reflects the done flag", () => {
  assert.equal(isAchieved(item({ done: 1 })), true);
  assert.equal(isAchieved(item({ done: 0 })), false);
  assert.equal(isAchieved(null), false);
});

test("collectionStats counts total / achieved / someday", () => {
  const items = [item({ done: 0 }), item({ done: 1 }), item({ done: 1 })];
  assert.deepEqual(collectionStats(items), { total: 3, achieved: 2, someday: 1 });
  assert.deepEqual(collectionStats([]), { total: 0, achieved: 0, someday: 0 });
  assert.deepEqual(collectionStats(undefined), { total: 0, achieved: 0, someday: 0 });
});

test("splitCollection: someday oldest-first, achieved newest-first", () => {
  const items = [
    item({ id: "b", done: 0, order: 2 }),
    item({ id: "a", done: 0, order: 1 }),
    item({ id: "old", done: 1, doneAt: 100 }),
    item({ id: "new", done: 1, doneAt: 200 }),
  ];
  const { someday, achieved } = splitCollection(items);
  assert.deepEqual(someday.map((i) => i.id), ["a", "b"], "someday by ascending order");
  assert.deepEqual(achieved.map((i) => i.id), ["new", "old"], "achieved by descending doneAt");
});

test("splitCollection tolerates empty / missing input", () => {
  assert.deepEqual(splitCollection([]), { someday: [], achieved: [] });
  assert.deepEqual(splitCollection(undefined), { someday: [], achieved: [] });
});
