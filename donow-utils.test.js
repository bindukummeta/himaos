// Tests for the pure "Do Now" helpers. Run with: node --test
// No dependencies — uses Node's built-in test runner and assert module.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { fmtMinutes, taskFits, donowSort } = require("./donow-utils.js");

// A checklist section so taskFits treats items as tasks.
const KIND = { home: "checklist", cal: "schedule", books: "collection" };
// Helper to build a task item quickly.
function task(over) {
  return Object.assign({ sectionId: "home", done: 0, minutes: null, energy: null, order: 0 }, over);
}

test("fmtMinutes formats buckets and untagged", () => {
  assert.equal(fmtMinutes(null), "");
  assert.equal(fmtMinutes(undefined), "");
  assert.equal(fmtMinutes(5), "5m");
  assert.equal(fmtMinutes(15), "15m");
  assert.equal(fmtMinutes(30), "30m");
  assert.equal(fmtMinutes(60), "1h");
  assert.equal(fmtMinutes(120), "2h+");
});

test("taskFits only counts open checklist items", () => {
  const budget = { minutes: "", energy: "" }; // Any
  assert.equal(taskFits(task({ done: 1 }), KIND, budget), false, "done excluded");
  assert.equal(taskFits(task({ sectionId: "cal" }), KIND, budget), false, "schedule excluded");
  assert.equal(taskFits(task({ sectionId: "books" }), KIND, budget), false, "collection excluded");
  assert.equal(taskFits(task({}), KIND, budget), true, "open checklist included");
});

test("Any budget shows even untagged tasks", () => {
  const budget = { minutes: "", energy: "" };
  assert.equal(taskFits(task({ minutes: null, energy: null }), KIND, budget), true);
});

test("time budget is at-or-under, and excludes untagged (strict)", () => {
  const budget = { minutes: 15, energy: "" };
  assert.equal(taskFits(task({ minutes: 5 }), KIND, budget), true, "5 fits in 15");
  assert.equal(taskFits(task({ minutes: 15 }), KIND, budget), true, "15 fits in 15");
  assert.equal(taskFits(task({ minutes: 30 }), KIND, budget), false, "30 too long");
  assert.equal(taskFits(task({ minutes: null }), KIND, budget), false, "untagged excluded when not Any");
});

test("energy budget is at-or-below, and excludes untagged (strict)", () => {
  const budget = { minutes: "", energy: "med" };
  assert.equal(taskFits(task({ energy: "low" }), KIND, budget), true, "low fits under med");
  assert.equal(taskFits(task({ energy: "med" }), KIND, budget), true, "med fits med");
  assert.equal(taskFits(task({ energy: "high" }), KIND, budget), false, "high needs more");
  assert.equal(taskFits(task({ energy: null }), KIND, budget), false, "untagged excluded when not Any");
});

test("time and energy budgets combine (both must pass)", () => {
  const budget = { minutes: 30, energy: "low" };
  assert.equal(taskFits(task({ minutes: 15, energy: "low" }), KIND, budget), true);
  assert.equal(taskFits(task({ minutes: 60, energy: "low" }), KIND, budget), false, "too long");
  assert.equal(taskFits(task({ minutes: 15, energy: "high" }), KIND, budget), false, "too much energy");
});

test("donowSort: shortest first, then lowest energy, then order", () => {
  const a = task({ minutes: 5, energy: "high", order: 2 });
  const b = task({ minutes: 30, energy: "low", order: 1 });
  assert.ok(donowSort(a, b) < 0, "5m sorts before 30m regardless of energy");

  const c = task({ minutes: 15, energy: "low", order: 5 });
  const d = task({ minutes: 15, energy: "high", order: 1 });
  assert.ok(donowSort(c, d) < 0, "same time -> lower energy first");

  const e = task({ minutes: 15, energy: "low", order: 3 });
  const f = task({ minutes: 15, energy: "low", order: 1 });
  assert.ok(donowSort(e, f) > 0, "same time+energy -> lower order first");
});

test("donowSort: untagged time sinks to the bottom", () => {
  const tagged = task({ minutes: 120, energy: "high" });
  const untagged = task({ minutes: null });
  assert.ok(donowSort(tagged, untagged) < 0, "tagged (even 2h+) before untagged");
});
