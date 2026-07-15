// Tests for the pure voice check-in parser. Run with: node --test
// No dependencies — uses Node's built-in test runner and assert module.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { parseCheckinSpeech, cleanTranscript } = require("./voice-utils.js");

test("maps mood words to the 1-5 scale", () => {
  assert.equal(parseCheckinSpeech("I feel great today").mood, 5);
  assert.equal(parseCheckinSpeech("feeling okay").mood, 3);
  assert.equal(parseCheckinSpeech("I'm feeling low").mood, 2);
  assert.equal(parseCheckinSpeech("today was rough").mood, 1);
  assert.equal(parseCheckinSpeech("nothing in particular").mood, null);
});

test("maps energy phrases", () => {
  assert.equal(parseCheckinSpeech("full of energy").energy, "high");
  assert.equal(parseCheckinSpeech("just some energy").energy, "med");
  assert.equal(parseCheckinSpeech("no energy at all").energy, "low");
  assert.equal(parseCheckinSpeech("feeling good").energy, null);
});

test("collects context tags", () => {
  const r = parseCheckinSpeech("I slept badly and I'm really hungry");
  assert.deepEqual(r.tags.sort(), ["hungry", "slept-badly"]);
});

test("energy 'low energy' does not leak into mood as 'low'", () => {
  const r = parseCheckinSpeech("hungry and low energy");
  assert.equal(r.energy, "low");
  assert.deepEqual(r.tags, ["hungry"]);
  assert.equal(r.mood, null, "'low' was consumed by energy, not mood");
});

test("tag 'bad sleep' does not leak into mood as 'bad'", () => {
  const r = parseCheckinSpeech("bad sleep last night");
  assert.deepEqual(r.tags, ["slept-badly"]);
  assert.equal(r.mood, null, "'bad' was consumed by the sleep tag");
});

test("a rich sentence fills everything", () => {
  const r = parseCheckinSpeech("I feel great, lots of energy, went for a run and had coffee");
  assert.equal(r.mood, 5);
  assert.equal(r.energy, "high");
  assert.deepEqual(r.tags.sort(), ["caffeine", "exercised"]);
});

test("note keeps the full spoken text, capitalized", () => {
  assert.equal(parseCheckinSpeech("slept badly today").note, "Slept badly today");
  assert.equal(cleanTranscript("  hello world "), "Hello world");
  assert.equal(cleanTranscript(""), "");
  assert.equal(cleanTranscript(null), "");
});

test("empty transcript yields an empty check-in", () => {
  const r = parseCheckinSpeech("");
  assert.deepEqual(r, { mood: null, energy: null, tags: [], note: "" });
});
