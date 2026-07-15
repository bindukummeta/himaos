// Pure "voice check-in" parser, shared by the app and its tests.
//
// Turns a spoken transcript into a structured check-in: mood (1-5), energy
// (low/med/high), context tag ids, and the raw note. No browser deps, so it
// works as a <script> (window.VoiceUtils) and under Node's test runner. The
// Web Speech API wiring itself lives in app.js — only this pure mapping is here.
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api; // Node (tests)
  } else {
    root.VoiceUtils = api; // Browser (app.js reads window.VoiceUtils)
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // Keyword tables. Ids/values mirror checkin-utils (mood 1-5, low/med/high,
  // and the CONTEXT_TAGS ids). Multi-word phrases are matched whole.
  const MOOD_TERMS = [
    { val: 5, terms: ["great", "amazing", "wonderful", "fantastic", "excellent", "brilliant"] },
    { val: 4, terms: ["good", "happy", "nice", "content", "calm", "pretty good"] },
    { val: 3, terms: ["okay", "ok", "fine", "alright", "meh", "so so"] },
    { val: 2, terms: ["low", "down", "sad", "blue", "bad", "rubbish"] },
    { val: 1, terms: ["rough", "awful", "terrible", "horrible", "the worst"] },
  ];
  const ENERGY_TERMS = [
    { val: "high", terms: ["high energy", "lots of energy", "loads of energy", "energetic", "full of energy", "wired"] },
    { val: "med", terms: ["medium energy", "med energy", "okay energy", "ok energy", "some energy"] },
    { val: "low", terms: ["low energy", "no energy", "little energy", "drained", "running on empty"] },
  ];
  const TAG_TERMS = [
    { id: "slept-badly", terms: ["slept badly", "bad sleep", "didn't sleep", "did not sleep", "couldn't sleep", "could not sleep", "no sleep", "poor sleep", "barely slept"] },
    { id: "hungry", terms: ["hungry", "starving", "haven't eaten", "have not eaten"] },
    { id: "tired", terms: ["tired", "sleepy", "exhausted", "knackered", "worn out"] },
    { id: "stressed", terms: ["stressed", "stress", "anxious", "anxiety", "overwhelmed", "on edge"] },
    { id: "people", terms: ["people", "social", "friends", "family", "socialising", "socializing"] },
    { id: "exercised", terms: ["exercised", "exercise", "worked out", "workout", "work out", "went for a run", "ran", "gym", "yoga", "walk"] },
    { id: "caffeine", terms: ["coffee", "caffeine", "espresso", "latte", "tea"] },
    { id: "unwell", terms: ["unwell", "sick", "ill", "cold", "flu", "headache", "migraine", "nauseous"] },
  ];

  // Reduce to lowercase alphanumeric words separated by single spaces.
  function core(s) {
    return String(s == null ? "" : s).toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  }
  // Remove every whole-word occurrence of `term` from padded `hay`; report hits.
  function stripTerm(hay, term) {
    const needle = " " + core(term) + " ";
    let matched = false;
    let idx;
    while ((idx = hay.indexOf(needle)) >= 0) {
      matched = true;
      hay = hay.slice(0, idx) + " " + hay.slice(idx + needle.length);
    }
    return { hay: hay, matched: matched };
  }

  // Trim and capitalize the first letter — the note keeps the full spoken text.
  function cleanTranscript(s) {
    const t = String(s == null ? "" : s).trim();
    return t ? t[0].toUpperCase() + t.slice(1) : "";
  }

  // Parse a transcript into { mood, energy, tags, note }. Energy and tag
  // phrases are consumed first so "low energy" / "bad sleep" don't leak into
  // the mood scan (which would otherwise see the words "low" / "bad").
  function parseCheckinSpeech(transcript) {
    let hay = " " + core(transcript) + " ";
    let energy = null;
    ENERGY_TERMS.forEach((row) => {
      row.terms.forEach((term) => {
        const r = stripTerm(hay, term);
        hay = r.hay;
        if (r.matched && !energy) energy = row.val;
      });
    });
    const tags = [];
    TAG_TERMS.forEach((row) => {
      let hit = false;
      row.terms.forEach((term) => {
        const r = stripTerm(hay, term);
        hay = r.hay;
        if (r.matched) hit = true;
      });
      if (hit) tags.push(row.id);
    });
    let mood = null;
    for (let i = 0; i < MOOD_TERMS.length && !mood; i++) {
      const row = MOOD_TERMS[i];
      for (let j = 0; j < row.terms.length; j++) {
        if (hay.indexOf(" " + core(row.terms[j]) + " ") >= 0) { mood = row.val; break; }
      }
    }
    return { mood: mood, energy: energy, tags: tags, note: cleanTranscript(transcript) };
  }

  return {
    parseCheckinSpeech: parseCheckinSpeech,
    cleanTranscript: cleanTranscript,
  };
});
