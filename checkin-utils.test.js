// Tests for the pure "Daily check-in" helpers. Run with: node --test
// No dependencies — uses Node's built-in test runner and assert module.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  moodLabel, moodEmoji, tagLabel, foodTagLabel, CONTEXT_TAGS, FOOD_TAGS,
  checkinsOn, latestCheckin, addDays, checkinStreak,
} = require("./checkin-utils.js");

// Build a check-in quickly. `at` defaults from the date at noon so ordering
// within a day is controllable via the override.
function ci(over) {
  return Object.assign({ id: "x", date: "2026-07-15", at: 1, mood: 3, energy: "med", tags: [] }, over);
}

test("moodLabel / moodEmoji map the 1-5 scale", () => {
  assert.equal(moodLabel(1), "Rough");
  assert.equal(moodLabel(3), "Okay");
  assert.equal(moodLabel(5), "Great");
  assert.equal(moodEmoji(5), "😄");
  assert.equal(moodLabel(9), "", "out-of-range -> empty");
  assert.equal(moodLabel(null), "", "null -> empty");
});

test("bloated is a context tag; food tags resolve their own labels", () => {
  assert.ok(CONTEXT_TAGS.some((t) => t.id === "bloated"), "bloated added to context");
  assert.equal(tagLabel("bloated"), "Bloated");
  assert.deepEqual(FOOD_TAGS.map((t) => t.id), ["heavy", "light", "skipped", "late"]);
  assert.equal(foodTagLabel("heavy"), "Heavy");
  assert.equal(foodTagLabel("late"), "Late");
  assert.equal(foodTagLabel("nope"), "nope", "unknown id falls back to itself");
});

test("checkinsOn filters by day and sorts newest moment first", () => {
  const list = [
    ci({ id: "a", date: "2026-07-15", at: 100 }),
    ci({ id: "b", date: "2026-07-15", at: 300 }),
    ci({ id: "c", date: "2026-07-14", at: 200 }),
  ];
  const today = checkinsOn(list, "2026-07-15");
  assert.deepEqual(today.map((c) => c.id), ["b", "a"], "same day, newest first");
  assert.equal(checkinsOn(list, "2026-07-13").length, 0, "empty day");
});

test("latestCheckin returns the most recent by `at`", () => {
  const list = [ci({ id: "a", at: 100 }), ci({ id: "b", at: 500 }), ci({ id: "c", at: 300 })];
  assert.equal(latestCheckin(list).id, "b");
  assert.equal(latestCheckin([]), null, "empty -> null");
});

test("addDays shifts across month/year boundaries (UTC)", () => {
  assert.equal(addDays("2026-07-15", -1), "2026-07-14");
  assert.equal(addDays("2026-07-01", -1), "2026-06-30");
  assert.equal(addDays("2026-01-01", -1), "2025-12-31");
  assert.equal(addDays("2026-07-15", 1), "2026-07-16");
});

test("checkinStreak counts consecutive days ending today", () => {
  const list = [
    ci({ date: "2026-07-15" }),
    ci({ date: "2026-07-14" }),
    ci({ date: "2026-07-13" }),
  ];
  assert.equal(checkinStreak(list, "2026-07-15"), 3);
});

test("checkinStreak stops at the first gap", () => {
  const list = [ci({ date: "2026-07-15" }), ci({ date: "2026-07-13" })];
  assert.equal(checkinStreak(list, "2026-07-15"), 1, "gap on the 14th breaks the run");
});

test("checkinStreak grace: today empty but yesterday counts", () => {
  const list = [ci({ date: "2026-07-14" }), ci({ date: "2026-07-13" })];
  assert.equal(checkinStreak(list, "2026-07-15"), 2, "morning grace keeps the run");
});

test("checkinStreak is 0 when neither today nor yesterday has one", () => {
  const list = [ci({ date: "2026-07-10" })];
  assert.equal(checkinStreak(list, "2026-07-15"), 0);
  assert.equal(checkinStreak([], "2026-07-15"), 0, "empty list -> 0");
});

test("checkinStreak counts a day once even with multiple moments", () => {
  const list = [
    ci({ id: "a", date: "2026-07-15", at: 1 }),
    ci({ id: "b", date: "2026-07-15", at: 2 }),
    ci({ id: "c", date: "2026-07-14", at: 3 }),
  ];
  assert.equal(checkinStreak(list, "2026-07-15"), 2);
});
