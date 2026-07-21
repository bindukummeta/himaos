// Tests for the pure "Pattern insights" helpers (Step 5). Run: node --test
// No dependencies — uses Node's built-in test runner and assert module.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  MIN_DAYS, INPUT_TAGS, OUTCOMES,
  summariseDays, dayHasOutcome, correlate, findPatterns,
  bloatingClusters, weightTrend, shiftDate,
} = require("./insights-utils.js");

// Build a check-in moment quickly.
function ci(over) {
  return Object.assign({ id: "x", date: "2026-07-15", at: 1, mood: 3, energy: "med", tags: [], foodTags: [] }, over);
}
// Build a weight entry quickly.
function w(over) {
  return Object.assign({ id: "w", date: "2026-07-15", at: 1, kg: 70, feeling: "" }, over);
}

test("shiftDate moves across boundaries (UTC)", () => {
  assert.equal(shiftDate("2026-07-15", -1), "2026-07-14");
  assert.equal(shiftDate("2026-07-01", -1), "2026-06-30");
  assert.equal(shiftDate("2026-01-01", -1), "2025-12-31");
});

test("summariseDays unions tags+foodTags and flags low mood/energy per day", () => {
  const days = summariseDays([
    ci({ date: "2026-07-15", tags: ["caffeine"], mood: 4, energy: "high" }),
    ci({ date: "2026-07-15", foodTags: ["late"], mood: 2, energy: "med" }),
    ci({ date: "2026-07-14", tags: ["exercised"], energy: "low" }),
  ]);
  assert.equal(days.length, 2);
  const d15 = days.find((d) => d.date === "2026-07-15");
  assert.ok(d15.tags.has("caffeine") && d15.tags.has("late"), "union of tags + foodTags");
  assert.equal(d15.lowMood, true, "mood 2 counts as low");
  assert.equal(d15.lowEnergy, false);
  const d14 = days.find((d) => d.date === "2026-07-14");
  assert.equal(d14.lowEnergy, true, "any low-energy moment flags the day");
  assert.deepEqual(days.map((d) => d.date), ["2026-07-14", "2026-07-15"], "sorted ascending");
});

test("dayHasOutcome reads scalars and tags", () => {
  const day = { date: "d", tags: new Set(["bloated"]), lowMood: true, lowEnergy: false };
  assert.equal(dayHasOutcome(day, "low-mood"), true);
  assert.equal(dayHasOutcome(day, "low-energy"), false);
  assert.equal(dayHasOutcome(day, "bloated"), true);
  assert.equal(dayHasOutcome(day, "unwell"), false);
});

// Helper: N days tagged with `tag`, `out` of them also low energy; then M days
// without the tag, `outNo` of them low energy.
function corpus(tag, n, out, m, outNo) {
  const list = [];
  let day = 1;
  for (let i = 0; i < n; i++, day++) {
    list.push(ci({ id: "a" + i, date: "2026-07-" + String(day).padStart(2, "0"), tags: [tag], energy: i < out ? "low" : "high" }));
  }
  for (let j = 0; j < m; j++, day++) {
    list.push(ci({ id: "b" + j, date: "2026-07-" + String(day).padStart(2, "0"), tags: [], energy: j < outNo ? "low" : "high" }));
  }
  return list;
}

test("correlate returns null below MIN_DAYS on either side", () => {
  const days = summariseDays(corpus("late", 4, 3, 10, 1)); // only 4 with-tag days
  assert.equal(correlate(days, "late", "low-energy"), null);
  const days2 = summariseDays(corpus("late", 6, 3, 3, 1)); // only 3 without-tag days
  assert.equal(correlate(days2, "late", "low-energy"), null);
});

test("correlate computes rates and lift when there is enough data", () => {
  // 6 late days, 4 low-energy; 10 non-late days, 1 low-energy.
  const days = summariseDays(corpus("late", 6, 4, 10, 1));
  const r = correlate(days, "late", "low-energy");
  assert.equal(r.withN, 6);
  assert.equal(r.withOut, 4);
  assert.equal(r.withoutN, 10);
  assert.equal(r.withoutOut, 1);
  assert.ok(Math.abs(r.withRate - 4 / 6) < 1e-9);
  assert.ok(Math.abs(r.withoutRate - 1 / 10) < 1e-9);
  assert.ok(r.lift > 0, "outcome more common on late days");
});

test("findPatterns sorts by absolute lift and only returns reportable ones", () => {
  const patterns = findPatterns(corpus("late", 6, 5, 8, 0));
  assert.ok(patterns.length >= 1);
  // Every returned pattern must clear MIN_DAYS on both sides.
  patterns.forEach((p) => {
    assert.ok(p.withN >= MIN_DAYS && p.withoutN >= MIN_DAYS);
  });
  // Sorted by |lift| descending.
  for (let i = 1; i < patterns.length; i++) {
    assert.ok(Math.abs(patterns[i - 1].lift) >= Math.abs(patterns[i].lift));
  }
});

test("bloatingClusters needs MIN_DAYS bloated days, then ranks co-occurring inputs", () => {
  const few = bloatingClusters([ci({ tags: ["bloated", "heavy"] })]);
  assert.deepEqual(few.rows, [], "under threshold => no rows");
  assert.equal(few.totalDays, 1);

  const list = [];
  for (let i = 0; i < 6; i++) {
    const tags = ["bloated"];
    if (i < 5) tags.push("heavy"); // heavy on 5 of 6 bloated days
    if (i < 2) tags.push("late");  // late on 2 of 6
    list.push(ci({ id: "d" + i, date: "2026-07-1" + i, tags }));
  }
  const c = bloatingClusters(list);
  assert.equal(c.totalDays, 6);
  assert.equal(c.rows[0].tagId, "heavy", "most common co-occurrence first");
  assert.equal(c.rows[0].count, 5);
  assert.ok(Math.abs(c.rows[0].rate - 5 / 6) < 1e-9);
});

test("weightTrend windows to N days, computes delta and normalised spark", () => {
  const empty = weightTrend([], 30);
  assert.equal(empty.count, 0);
  assert.equal(empty.delta, null);

  const weights = [
    w({ id: "1", date: "2026-05-01", at: 1, kg: 74 }), // outside 30d window
    w({ id: "2", date: "2026-07-01", at: 2, kg: 72 }),
    w({ id: "3", date: "2026-07-20", at: 3, kg: 71 }),
    w({ id: "4", date: "2026-07-30", at: 4, kg: 70 }),
  ];
  const t = weightTrend(weights, 30); // window ends at 2026-07-30 => cutoff 2026-07-01
  assert.equal(t.count, 3, "May entry excluded");
  assert.equal(t.first, 72);
  assert.equal(t.last, 70);
  assert.equal(t.delta, -2);
  assert.equal(t.spark[0].x, 0);
  assert.equal(t.spark[t.spark.length - 1].x, 1);
  assert.equal(t.spark[t.spark.length - 1].y, 0, "lowest kg maps to y=0");
  assert.equal(t.spark[0].y, 1, "highest kg maps to y=1");
});
