// q3-seed.js — one-time seed of the user's 10 Q3 2026 goals (Phase E).
// Compact spec below; seedQ3Goals() expands it into goal records via HimaStore.
// Milestones: string = one-time checkbox; [title, target, unit?] = numeric.
// Activities: [title, weeklyTarget] for the weekly non-negotiables.
// Idempotent: a meta flag stops a second tap from duplicating everything.
window.Q3Seed = (function () {
  "use strict";
  const DEADLINE = "2026-09-30";
  const SEED_FLAG = "q3Seeded2026";

  // [title, note, milestones[], activities[]]
  const SPEC = [
    ["❤️ Health", "Become healthy, energetic and disciplined again.",
      [["Lose weight", 5, "kg", "weightloss"], "Gym 40+ sessions", "Morning routine becomes automatic",
       "Sleep before 10pm (weekdays)", "Feel proud looking in the mirror"], []],
    ["🎓 Hima AI University", "Student #1. Build the habit of learning like an engineer.",
      ["Week 0 Assessment", "Foundation School", "Python foundations", "Linux foundations",
       "Git foundations", "Docker foundations", "First portfolio project",
       "Weekly learning journal", "Publish one lesson learned each week"], []],
    ["🤖 AI Engineering", "Apply what you're learning immediately.",
      ["AI App #1", "Improve Education Planner with AI", "Learn prompt engineering",
       "Learn API integration", "Understand RAG fundamentals"], []],
    ["📚 Education Planner", "Turn it into a real product.",
      ["Version 1 launched", ["10 real users", 10, "users"], "Feedback collected",
       ["Top improvements implemented", 5, ""]], []],
    ["✍️ Build in Public", "People can see your journey.",
      [["LinkedIn posts", 5, "posts"], "1 technical blog", "Weekly learning updates"], []],
    ["👧 L", "Not perfection — routine. By September.",
      ["Morning routine together", "Homework becomes a habit", "Reading every day",
       "Grammar preparation", "Less screen time before responsibilities",
       "One fun activity every week"], []],
    ["🏡 Home", "Not perfect — peaceful.",
      ["Daily 30-minute reset", "Laundry always under control", "Weekly meal planning",
       "House never becomes overwhelming"], []],
    ["📖 Reading", "",
      [["Finish books", 3, "books"], "Continue world history", "Weekly reflection notes"], []],
    ["❤️ Relationships", "No fixing. Just peace.",
      ["Calm communication with C", "Weekly call with Dad", "Meet friends",
       "No emotional chasing"], []],
    ["🌱 Identity", "By September 30, honestly say:",
      ["I exercise consistently", "I finish what I start", "I learn every day",
       "I build every week", "My children see discipline", "I'm becoming who I imagined"], []],
    ["📅 Weekly Non-Negotiables", "Every week, without fail.", [],
      [["Gym sessions", 4], ["AI University study sessions", 5], ["Focused work/build sessions", 5],
       ["LinkedIn post", 1], ["Family outing/activity", 1], ["Weekly Review (Sunday)", 1],
       ["Finish one small thing before starting another", 1]]],
  ];

  function milestoneRec(m) {
    if (typeof m === "string") return { title: m, target: null };
    // [title, target, unit?, kind?]
    const rec = { title: m[0], target: m[1], unit: m[2] || "" };
    if (m[3]) rec.kind = m[3];
    return rec;
  }

  // Returns the number of goals added (0 if already seeded).
  async function seedQ3Goals(store) {
    if ((await store.getMeta(SEED_FLAG)) === true) return 0;
    const now = Date.now();
    let order = now;
    for (const [title, note, milestones, activities] of SPEC) {
      const g = await store.addGoal({
        title, note, horizon: "quarter", deadline: DEADLINE,
        startedAt: now, order: order++,
      });
      for (const m of milestones) await store.addMilestone(g.id, milestoneRec(m));
      for (const [aTitle, weeklyTarget] of activities) {
        await store.addActivity(g.id, { title: aTitle, weeklyTarget: weeklyTarget || null });
      }
    }
    await store.setMeta(SEED_FLAG, true);
    return SPEC.length;
  }

  return { SEED_FLAG, seedQ3Goals };
})();
