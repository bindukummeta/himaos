// Tests for usage-utils.js (private dogfooding-retention helpers).
const { test } = require("node:test");
const assert = require("node:assert");
const U = require("./usage-utils");

test("dayKey formats a local calendar day as YYYY-MM-DD", () => {
  const key = U.dayKey(new Date(2026, 6, 16, 9, 30)); // 16 Jul 2026 local
  assert.match(key, /^\d{4}-\d{2}-\d{2}$/);
  assert.strictEqual(key, "2026-07-16");
});

test("markDay adds a new day, sorted, without mutating the input", () => {
  const before = ["2026-07-10", "2026-07-12"];
  const after = U.markDay(before, "2026-07-11");
  assert.deepStrictEqual(after, ["2026-07-10", "2026-07-11", "2026-07-12"]);
  assert.deepStrictEqual(before, ["2026-07-10", "2026-07-12"], "input untouched");
});

test("markDay is idempotent and returns the SAME array on a repeat (no write)", () => {
  const list = ["2026-07-10", "2026-07-11"];
  const again = U.markDay(list, "2026-07-11");
  assert.strictEqual(again, list, "same identity signals a no-op to the caller");
});

test("markDay tolerates a null/undefined starting list", () => {
  assert.deepStrictEqual(U.markDay(null, "2026-07-11"), ["2026-07-11"]);
  assert.deepStrictEqual(U.markDay(undefined, "2026-07-11"), ["2026-07-11"]);
});

test("windowDayKeys returns N inclusive days ending today (today first)", () => {
  const keys = U.windowDayKeys("2026-07-16", 3);
  assert.deepStrictEqual(keys, ["2026-07-16", "2026-07-15", "2026-07-14"]);
});

test("windowDayKeys spans month boundaries correctly", () => {
  const keys = U.windowDayKeys("2026-08-01", 3);
  assert.deepStrictEqual(keys, ["2026-08-01", "2026-07-31", "2026-07-30"]);
});

test("daysActiveInWindow counts only days inside the window", () => {
  const list = ["2026-07-01", "2026-07-14", "2026-07-15", "2026-07-16"];
  // Window of 3 ending 16 Jul = {14,15,16}; the 1st is outside.
  assert.strictEqual(U.daysActiveInWindow(list, "2026-07-16", 3), 3);
  assert.strictEqual(U.daysActiveInWindow(list, "2026-07-16", 2), 2);
});

test("daysActiveInWindow returns 0 for empty/missing lists", () => {
  assert.strictEqual(U.daysActiveInWindow([], "2026-07-16", 14), 0);
  assert.strictEqual(U.daysActiveInWindow(null, "2026-07-16", 14), 0);
});

test("currentStreak counts consecutive days ending today, stopping at a gap", () => {
  const list = ["2026-07-13", "2026-07-15", "2026-07-16"]; // gap on the 14th
  assert.strictEqual(U.currentStreak(list, "2026-07-16", 14), 2);
});

test("currentStreak is 0 when today itself has no action", () => {
  const list = ["2026-07-14", "2026-07-15"]; // nothing on the 16th
  assert.strictEqual(U.currentStreak(list, "2026-07-16", 14), 0);
});

test("usageSummary reports opened/action days, streak, and action rate", () => {
  const openDays = ["2026-07-14", "2026-07-15", "2026-07-16"];
  const actionDays = ["2026-07-15", "2026-07-16"]; // opened the 14th but did nothing
  const s = U.usageSummary(openDays, actionDays, "2026-07-16", 14);
  assert.strictEqual(s.windowDays, 14);
  assert.strictEqual(s.openedDays, 3);
  assert.strictEqual(s.actionDays, 2);
  assert.strictEqual(s.streak, 2);
  assert.ok(Math.abs(s.actionRate - 2 / 3) < 1e-9);
});

test("usageSummary actionRate is 0 when there were no opens", () => {
  const s = U.usageSummary([], [], "2026-07-16", 14);
  assert.strictEqual(s.openedDays, 0);
  assert.strictEqual(s.actionDays, 0);
  assert.strictEqual(s.streak, 0);
  assert.strictEqual(s.actionRate, 0);
});
