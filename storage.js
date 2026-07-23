/*
 * HimaStore — a Promise-wrapped IndexedDB abstraction (the storage seam).
 * app.js only ever calls window.HimaStore.* so a future cloud-storage.js can
 * implement the same interface without any UI/logic rewrite. This is also the
 * seam that will let sections/items interlink into a "second brain" later.
 */
(function () {
  "use strict";

  const DB_NAME = "hima-os";
  const DB_VERSION = 6;
  const STORES = { sections: "sections", items: "items", meta: "meta", checkins: "checkins", goals: "goals", weights: "weights", health: "health", evidence: "evidence" };

  // Meta key holding the define-once vitamin list (Phase C). Each entry:
  // { id, name, emoji }. Ticked daily as timestamped "vitamin" health entries.
  const META_VITAMINS = "vitamins";

  // Built-in starter sections. Stable ids/keys so future cross-links survive.
  // `kind` drives which fields and controls the UI shows for a section.
  const STARTER_SECTIONS = [
    { id: "sec-shopping", key: "shopping", name: "Shopping", icon: "🛒", kind: "checklist", order: 1 },
    { id: "sec-schedule", key: "schedule", name: "Schedule", icon: "🗓️", kind: "schedule", order: 2 },
    { id: "sec-home", key: "home", name: "Home to-dos", icon: "🏠", kind: "checklist", order: 3 },
    { id: "sec-work", key: "work", name: "Work to-dos", icon: "💼", kind: "checklist", order: 4 },
    { id: "sec-reading-now", key: "reading-now", name: "Reading now", icon: "📖", kind: "collection", reading: true, order: 5 },
    { id: "sec-want-to-read", key: "want-to-read", name: "Want to read", icon: "📚", kind: "collection", reading: true, order: 6 },
    // Dreaming collections (Step 3): wishes rather than chores. `dreaming: true`
    // switches on the Someday/Achieved split UI; still plain `collection` stores.
    { id: "sec-bucket-list", key: "bucket-list", name: "Bucket list", icon: "🌠", kind: "collection", dreaming: true, order: 7 },
    { id: "sec-watchlist", key: "watchlist", name: "Watchlist", icon: "🎬", kind: "collection", dreaming: true, order: 8 },
    { id: "sec-places", key: "places-to-visit", name: "Places to visit", icon: "🗺️", kind: "collection", dreaming: true, order: 9 },
    { id: "sec-memories", key: "memories", name: "Memories", icon: "📸", kind: "collection", dreaming: true, order: 10 },
  ];

  let dbPromise = null;

  function uid() {
    return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
  }

  function reqP(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORES.sections)) {
          const s = db.createObjectStore(STORES.sections, { keyPath: "id" });
          s.createIndex("order", "order", { unique: false });
          s.createIndex("kind", "kind", { unique: false });
          // Seed the starter sections exactly once, on first creation.
          STARTER_SECTIONS.forEach((sec) => {
            const now = Date.now();
            s.put(Object.assign({ builtin: true, createdAt: now, updatedAt: now }, sec));
          });
        }
        if (!db.objectStoreNames.contains(STORES.items)) {
          const s = db.createObjectStore(STORES.items, { keyPath: "id" });
          s.createIndex("sectionId", "sectionId", { unique: false });
          s.createIndex("done", "done", { unique: false });
          s.createIndex("date", "date", { unique: false });
          s.createIndex("order", "order", { unique: false });
        }
        if (!db.objectStoreNames.contains(STORES.meta)) {
          db.createObjectStore(STORES.meta, { keyPath: "key" });
        }
        // Daily check-in log (Step 2). `date` groups moments by local day;
        // `at` is the exact moment. Multiple check-ins per day are allowed.
        if (!db.objectStoreNames.contains(STORES.checkins)) {
          const s = db.createObjectStore(STORES.checkins, { keyPath: "id" });
          s.createIndex("date", "date", { unique: false });
          s.createIndex("at", "at", { unique: false });
        }
        // Goals ladder (Step 4): Vision -> year/quarter goals. Weekly activities
        // are embedded on each goal record; no separate store. `horizon`/`status`
        // indexed for future queries; no seed data (goals are user-authored).
        if (!db.objectStoreNames.contains(STORES.goals)) {
          const s = db.createObjectStore(STORES.goals, { keyPath: "id" });
          s.createIndex("horizon", "horizon", { unique: false });
          s.createIndex("status", "status", { unique: false });
          s.createIndex("order", "order", { unique: false });
        }
        // Weight metric (Phase A of food/weight tracking). A neutral trend, not a
        // goal-vs-actual scold: each entry is a number + how it felt that day, so
        // it can later correlate with check-in context. `date`/`at` mirror checkins.
        if (!db.objectStoreNames.contains(STORES.weights)) {
          const s = db.createObjectStore(STORES.weights, { keyPath: "id" });
          s.createIndex("date", "date", { unique: false });
          s.createIndex("at", "at", { unique: false });
        }
        // Health log (Phase C): one timestamped store for all three kinds
        // (exercise / vitamin / med), like checkins. `kind` distinguishes them;
        // payload fields vary per kind (types[] / vitId / name+count). The
        // define-once vitamin list lives in meta, not here. `date`/`at` mirror
        // checkins so it joins cleanly for correlation insights.
        if (!db.objectStoreNames.contains(STORES.health)) {
          const s = db.createObjectStore(STORES.health, { keyPath: "id" });
          s.createIndex("date", "date", { unique: false });
          s.createIndex("at", "at", { unique: false });
          s.createIndex("kind", "kind", { unique: false });
        }
        // Evidence Vault (Phase D): date-stamped things you did. `date` groups by
        // local day (and drives ISO-week rollups); `at` is the exact moment. The
        // reflection fields + proofTags are optional. Additive only — this v5->v6
        // migration creates the store without touching any existing data.
        if (!db.objectStoreNames.contains(STORES.evidence)) {
          const s = db.createObjectStore(STORES.evidence, { keyPath: "id" });
          s.createIndex("date", "date", { unique: false });
          s.createIndex("at", "at", { unique: false });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }

  async function tx(store, mode) {
    const db = await openDB();
    return db.transaction(store, mode).objectStore(store);
  }

  // ---- sections ----
  async function getSections() {
    const store = await tx(STORES.sections, "readonly");
    const rows = await reqP(store.getAll());
    return rows.sort((a, b) => (a.order || 0) - (b.order || 0));
  }
  async function getSection(id) {
    const store = await tx(STORES.sections, "readonly");
    return reqP(store.get(id));
  }
  async function addSection(rec) {
    const now = Date.now();
    const all = await getSections();
    const maxOrder = all.reduce((m, s) => Math.max(m, s.order || 0), 0);
    const record = Object.assign(
      { id: uid(), icon: "📝", kind: "checklist", order: maxOrder + 1, builtin: false, createdAt: now, updatedAt: now },
      rec
    );
    const store = await tx(STORES.sections, "readwrite");
    await reqP(store.put(record));
    return record;
  }
  async function updateSection(id, patch) {
    const store = await tx(STORES.sections, "readonly");
    const cur = await reqP(store.get(id));
    if (!cur) return null;
    const record = Object.assign({}, cur, patch, { updatedAt: Date.now() });
    const rw = await tx(STORES.sections, "readwrite");
    await reqP(rw.put(record));
    return record;
  }
  async function deleteSection(id) {
    // Remove the section and every item that belongs to it.
    const items = await getItems({ sectionId: id });
    for (const it of items) {
      const iw = await tx(STORES.items, "readwrite");
      await reqP(iw.delete(it.id));
    }
    const store = await tx(STORES.sections, "readwrite");
    return reqP(store.delete(id));
  }
  async function reorderSections(orderedIds) {
    for (let i = 0; i < orderedIds.length; i++) {
      await updateSection(orderedIds[i], { order: i + 1 });
    }
    return true;
  }
  // Re-add any starter sections missing by `key`; keeps existing data intact.
  async function restoreStarters() {
    const existing = await getSections();
    const haveKeys = new Set(existing.map((s) => s.key).filter(Boolean));
    let maxOrder = existing.reduce((m, s) => Math.max(m, s.order || 0), 0);
    let added = 0;
    for (const sec of STARTER_SECTIONS) {
      if (haveKeys.has(sec.key)) continue;
      maxOrder += 1;
      const now = Date.now();
      const store = await tx(STORES.sections, "readwrite");
      await reqP(store.put(Object.assign({ builtin: true, createdAt: now, updatedAt: now }, sec, { order: maxOrder })));
      added += 1;
    }
    return added;
  }

  // ---- items ----
  async function getItems(filter) {
    filter = filter || {};
    const store = await tx(STORES.items, "readonly");
    let rows = await reqP(store.getAll());
    if (filter.sectionId) rows = rows.filter((r) => r.sectionId === filter.sectionId);
    if (typeof filter.done === "number") rows = rows.filter((r) => (r.done ? 1 : 0) === filter.done);
    if (filter.goalId) rows = rows.filter((r) => r.goalId === filter.goalId);
    return rows;
  }
  async function getItem(id) {
    const store = await tx(STORES.items, "readonly");
    return reqP(store.get(id));
  }
  async function addItem(rec) {
    const now = Date.now();
    const record = Object.assign(
      // minutes/energy are optional task attributes used by the "Do Now" picker.
      // null = untagged. minutes is a number (5/15/30/60/120); energy is low/med/high.
      // link is an optional URL for collection items (e.g. a place or trailer).
      // goalId (Step 4) optionally links a checklist task up to the goal it serves.
      { id: uid(), title: "", note: "", link: null, goalId: null, done: 0, doneAt: null, date: null, time: null, minutes: null, energy: null, order: now, createdAt: now, updatedAt: now },
      rec
    );
    const store = await tx(STORES.items, "readwrite");
    await reqP(store.put(record));
    return record;
  }
  async function updateItem(id, patch) {
    const store = await tx(STORES.items, "readonly");
    const cur = await reqP(store.get(id));
    if (!cur) return null;
    const record = Object.assign({}, cur, patch, { updatedAt: Date.now() });
    const rw = await tx(STORES.items, "readwrite");
    await reqP(rw.put(record));
    return record;
  }
  async function deleteItem(id) {
    const store = await tx(STORES.items, "readwrite");
    return reqP(store.delete(id));
  }
  async function clearDone(sectionId) {
    const done = await getItems({ sectionId, done: 1 });
    for (const it of done) {
      const rw = await tx(STORES.items, "readwrite");
      await reqP(rw.delete(it.id));
    }
    return done.length;
  }

  // ---- checkins (daily check-in log) ----
  async function getCheckins(filter) {
    filter = filter || {};
    const store = await tx(STORES.checkins, "readonly");
    let rows = await reqP(store.getAll());
    if (filter.date) rows = rows.filter((r) => r.date === filter.date);
    return rows.sort((a, b) => (a.at || 0) - (b.at || 0));
  }
  async function getCheckin(id) {
    const store = await tx(STORES.checkins, "readonly");
    return reqP(store.get(id));
  }
  async function addCheckin(rec) {
    const now = Date.now();
    const record = Object.assign(
      // date = local "YYYY-MM-DD" (set by caller); at = the exact moment.
      // mood is 1-5; energy is low/med/high; tags is an array of context ids.
      // food is a one-line meal note; foodTags is an array of food-context ids.
      // sleep is an optional quality chip (poor/ok/good); null on old records.
      { id: uid(), date: null, at: now, mood: null, energy: null, tags: [], food: "", foodTags: [], sleep: null, note: "", createdAt: now, updatedAt: now },
      rec
    );
    const store = await tx(STORES.checkins, "readwrite");
    await reqP(store.put(record));
    return record;
  }
  async function deleteCheckin(id) {
    const store = await tx(STORES.checkins, "readwrite");
    return reqP(store.delete(id));
  }

  // ---- goals (Step 4: Vision -> year/quarter goals, embedded weekly activities) ----
  async function getGoals(filter) {
    filter = filter || {};
    const store = await tx(STORES.goals, "readonly");
    let rows = await reqP(store.getAll());
    if (filter.horizon) rows = rows.filter((r) => r.horizon === filter.horizon);
    if (filter.status) rows = rows.filter((r) => r.status === filter.status);
    return rows.sort((a, b) => (a.order || 0) - (b.order || 0) || (a.createdAt || 0) - (b.createdAt || 0));
  }
  async function getGoal(id) {
    const store = await tx(STORES.goals, "readonly");
    return reqP(store.get(id));
  }
  async function addGoal(rec) {
    const now = Date.now();
    const record = Object.assign(
      // horizon: vision|year|quarter; status: active|paused|done. activities are
      // embedded {id,title,doneWeeks[]} ticked per ISO week. parentId reserved.
      { id: uid(), title: "", note: "", horizon: "quarter", status: "active", parentId: null, snoozedWeek: null, activities: [], order: now, createdAt: now, updatedAt: now },
      rec
    );
    const store = await tx(STORES.goals, "readwrite");
    await reqP(store.put(record));
    return record;
  }
  async function updateGoal(id, patch) {
    const store = await tx(STORES.goals, "readonly");
    const cur = await reqP(store.get(id));
    if (!cur) return null;
    const record = Object.assign({}, cur, patch, { updatedAt: Date.now() });
    const rw = await tx(STORES.goals, "readwrite");
    await reqP(rw.put(record));
    return record;
  }
  async function deleteGoal(id) {
    // Never cascade-delete the user's tasks — just unlink any that pointed here.
    const linked = await getItems({ goalId: id });
    for (const it of linked) await updateItem(it.id, { goalId: null });
    const store = await tx(STORES.goals, "readwrite");
    return reqP(store.delete(id));
  }
  async function reorderGoals(orderedIds) {
    for (let i = 0; i < orderedIds.length; i++) {
      await updateGoal(orderedIds[i], { order: i + 1 });
    }
    return true;
  }
  // Embedded activity ops: read the goal, mutate its activities, persist.
  async function addActivity(goalId, rec) {
    const g = await getGoal(goalId);
    if (!g) return null;
    const activity = Object.assign({ id: uid(), title: "", doneWeeks: [], createdAt: Date.now() }, rec);
    const activities = (g.activities || []).concat([activity]);
    await updateGoal(goalId, { activities });
    return activity;
  }
  async function updateActivity(goalId, activityId, patch) {
    const g = await getGoal(goalId);
    if (!g) return null;
    const activities = (g.activities || []).map((a) => (a.id === activityId ? Object.assign({}, a, patch) : a));
    return updateGoal(goalId, { activities });
  }
  async function deleteActivity(goalId, activityId) {
    const g = await getGoal(goalId);
    if (!g) return null;
    const activities = (g.activities || []).filter((a) => a.id !== activityId);
    return updateGoal(goalId, { activities });
  }
  // Toggle an activity's completion for a given ISO week key (add/remove the key).
  async function toggleActivityWeek(goalId, activityId, weekKey) {
    const g = await getGoal(goalId);
    if (!g) return null;
    const activities = (g.activities || []).map((a) => {
      if (a.id !== activityId) return a;
      const weeks = Array.isArray(a.doneWeeks) ? a.doneWeeks.slice() : [];
      const at = weeks.indexOf(weekKey);
      if (at >= 0) weeks.splice(at, 1); else weeks.push(weekKey);
      return Object.assign({}, a, { doneWeeks: weeks });
    });
    return updateGoal(goalId, { activities });
  }

  // ---- weights (neutral weight trend; number + feeling per entry) ----
  async function getWeights(filter) {
    filter = filter || {};
    const store = await tx(STORES.weights, "readonly");
    let rows = await reqP(store.getAll());
    if (filter.date) rows = rows.filter((r) => r.date === filter.date);
    return rows.sort((a, b) => (a.at || 0) - (b.at || 0));
  }
  async function addWeight(rec) {
    const now = Date.now();
    const record = Object.assign(
      // date = local "YYYY-MM-DD"; at = exact moment. kg is a number; feeling is
      // an optional free-text/tag of how the day felt (for later correlation).
      { id: uid(), date: null, at: now, kg: null, feeling: "", createdAt: now, updatedAt: now },
      rec
    );
    const store = await tx(STORES.weights, "readwrite");
    await reqP(store.put(record));
    return record;
  }
  async function deleteWeight(id) {
    const store = await tx(STORES.weights, "readwrite");
    return reqP(store.delete(id));
  }

  // ---- health (Phase C: exercise / vitamin / med, one timestamped store) ----
  async function getHealth(filter) {
    filter = filter || {};
    const store = await tx(STORES.health, "readonly");
    let rows = await reqP(store.getAll());
    if (filter.date) rows = rows.filter((r) => r.date === filter.date);
    if (filter.kind) rows = rows.filter((r) => r.kind === filter.kind);
    return rows.sort((a, b) => (a.at || 0) - (b.at || 0));
  }
  async function addHealth(rec) {
    const now = Date.now();
    const record = Object.assign(
      // date = local "YYYY-MM-DD"; at = exact moment. kind = exercise|vitamin|med.
      // Per-kind payload: exercise -> types[]; vitamin -> vitId; med -> name + count.
      { id: uid(), date: null, at: now, kind: null, types: [], vitId: null, name: "", count: 1, createdAt: now, updatedAt: now },
      rec
    );
    const store = await tx(STORES.health, "readwrite");
    await reqP(store.put(record));
    return record;
  }
  async function deleteHealth(id) {
    const store = await tx(STORES.health, "readwrite");
    return reqP(store.delete(id));
  }

  // ---- evidence (Phase D: date-stamped things you did) ----
  async function getEvidence(filter) {
    filter = filter || {};
    const store = await tx(STORES.evidence, "readonly");
    let rows = await reqP(store.getAll());
    if (filter.date) rows = rows.filter((r) => r.date === filter.date);
    if (filter.from) rows = rows.filter((r) => r.date >= filter.from);
    if (filter.to) rows = rows.filter((r) => r.date <= filter.to);
    return rows.sort((a, b) => (b.at || 0) - (a.at || 0));
  }
  async function getEvidenceOne(id) {
    const store = await tx(STORES.evidence, "readonly");
    return reqP(store.get(id));
  }
  async function addEvidence(rec) {
    const now = Date.now();
    const record = Object.assign(
      // date = local "YYYY-MM-DD" (set by caller); at = exact moment. title is the
      // required one-liner; the five reflection fields + proofTags[] are optional.
      { id: uid(), date: null, at: now, title: "", challenges: "", setbacks: "", achievements: "", lessons: "", whatItProves: "", proofTags: [], createdAt: now, updatedAt: now },
      rec
    );
    const store = await tx(STORES.evidence, "readwrite");
    await reqP(store.put(record));
    return record;
  }
  async function updateEvidence(id, patch) {
    const store = await tx(STORES.evidence, "readonly");
    const cur = await reqP(store.get(id));
    if (!cur) return null;
    const record = Object.assign({}, cur, patch, { updatedAt: Date.now() });
    const rw = await tx(STORES.evidence, "readwrite");
    await reqP(rw.put(record));
    return record;
  }
  async function deleteEvidence(id) {
    const store = await tx(STORES.evidence, "readwrite");
    return reqP(store.delete(id));
  }

  // Define-once vitamin list (stored in meta). Each: { id, name, emoji }.
  async function getVitamins() {
    const list = await getMeta(META_VITAMINS);
    return Array.isArray(list) ? list : [];
  }
  async function addVitamin(rec) {
    const list = await getVitamins();
    const vit = Object.assign({ id: uid(), name: "", emoji: "💊" }, rec);
    await setMeta(META_VITAMINS, list.concat([vit]));
    return vit;
  }
  async function deleteVitamin(id) {
    const list = await getVitamins();
    await setMeta(META_VITAMINS, list.filter((v) => v.id !== id));
    return true;
  }

  // ---- meta ----
  async function getMeta(key) {
    const store = await tx(STORES.meta, "readonly");
    const row = await reqP(store.get(key));
    return row ? row.value : undefined;
  }
  async function setMeta(key, value) {
    const store = await tx(STORES.meta, "readwrite");
    return reqP(store.put({ key, value }));
  }

  // ---- backup ----
  async function exportAll() {
    const sections = await getSections();
    const items = await getItems();
    const checkins = await getCheckins();
    const goals = await getGoals();
    const weights = await getWeights();
    const health = await getHealth();
    const evidence = await getEvidence();
    const vitamins = await getVitamins();
    return { app: "hima-os", version: DB_VERSION, exportedAt: Date.now(), sections, items, checkins, goals, weights, health, evidence, vitamins };
  }
  async function clearStore(name) {
    const store = await tx(name, "readwrite");
    return reqP(store.clear());
  }
  async function importAll(payload) {
    if (!payload || payload.app !== "hima-os") throw new Error("Not a Hima OS backup file");
    await clearStore(STORES.sections);
    await clearStore(STORES.items);
    await clearStore(STORES.checkins);
    await clearStore(STORES.goals);
    await clearStore(STORES.weights);
    await clearStore(STORES.health);
    await clearStore(STORES.evidence);
    for (const s of payload.sections || []) {
      const store = await tx(STORES.sections, "readwrite");
      await reqP(store.put(s));
    }
    for (const it of payload.items || []) {
      const store = await tx(STORES.items, "readwrite");
      await reqP(store.put(it));
    }
    for (const c of payload.checkins || []) {
      const store = await tx(STORES.checkins, "readwrite");
      await reqP(store.put(c));
    }
    for (const g of payload.goals || []) {
      const store = await tx(STORES.goals, "readwrite");
      await reqP(store.put(g));
    }
    for (const w of payload.weights || []) {
      const store = await tx(STORES.weights, "readwrite");
      await reqP(store.put(w));
    }
    for (const h of payload.health || []) {
      const store = await tx(STORES.health, "readwrite");
      await reqP(store.put(h));
    }
    for (const e of payload.evidence || []) {
      const store = await tx(STORES.evidence, "readwrite");
      await reqP(store.put(e));
    }
    // Vitamin definitions live in meta; restore them if the backup carried any.
    if (Array.isArray(payload.vitamins)) await setMeta(META_VITAMINS, payload.vitamins);
    return true;
  }

  async function ready() {
    await openDB();
    return true;
  }

  window.HimaStore = {
    ready,
    STARTER_SECTIONS,
    getSections, getSection, addSection, updateSection, deleteSection, reorderSections, restoreStarters,
    getItems, getItem, addItem, updateItem, deleteItem, clearDone,
    getCheckins, getCheckin, addCheckin, deleteCheckin,
    getWeights, addWeight, deleteWeight,
    getHealth, addHealth, deleteHealth,
    getEvidence, getEvidenceOne, addEvidence, updateEvidence, deleteEvidence,
    getVitamins, addVitamin, deleteVitamin,
    getGoals, getGoal, addGoal, updateGoal, deleteGoal, reorderGoals,
    addActivity, updateActivity, deleteActivity, toggleActivityWeek,
    getMeta, setMeta,
    exportAll, importAll,
  };
})();
