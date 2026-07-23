// app-shell.js — the shared "app context" (ctx) that every view module receives.
//
// The app avoids a build step, so instead of ES modules we expose one object on
// window.HimaShell. It holds the shared DOM helpers, formatting utils, the store
// reference, UI-only label maps derived from the pure *-utils modules, the
// MUTABLE app state (as properties, so writes from any view are seen by all),
// navigation/drawer, common data refreshers, and silent usage tracking.
//
// A view file is: window.SomeView = function (ctx) { ...; return { wire(root) } }.
// Each view registers its top-level render fn into ctx.views so the showView
// router can dispatch across files. app.js is reduced to init() wiring.
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);

  // ---- UI-only labels/maps derived from the pure utils modules ----
  const ENERGY_LABEL = { low: "Low energy", med: "Medium energy", high: "High energy" };
  const KIND_LABEL = { checklist: "Checklist", schedule: "Schedule", collection: "Collection" };
  const { GOAL_HORIZONS } = window.GoalsUtils;
  const HORIZON_LABEL = {};
  GOAL_HORIZONS.forEach((h) => { HORIZON_LABEL[h.val] = h.label; });
  const { INPUT_TAGS, OUTCOMES } = window.InsightsUtils;
  const INPUT_TAG_LABEL = {}, INPUT_TAG_EMOJI = {}, OUTCOME_LABEL = {}, OUTCOME_EMOJI = {};
  INPUT_TAGS.forEach((t) => { INPUT_TAG_LABEL[t.id] = t.label; INPUT_TAG_EMOJI[t.id] = t.emoji; });
  OUTCOMES.forEach((o) => { OUTCOME_LABEL[o.id] = o.label; OUTCOME_EMOJI[o.id] = o.emoji; });

  // ---- usage tracking (silent, on-device) ----
  const { dayKey, markDay } = window.UsageUtils;
  const USAGE_OPEN = "usageOpenDays";
  const USAGE_ACTION = "usageActionDays";
  const MUTATION_METHODS = [
    "addItem", "updateItem", "deleteItem", "clearDone",
    "addCheckin", "deleteCheckin",
    "addGoal", "updateGoal", "deleteGoal",
    "addActivity", "updateActivity", "deleteActivity", "toggleActivityWeek",
    "addEvidence", "updateEvidence", "deleteEvidence",
  ];
  async function recordDay(metaKey) {
    try {
      const cur = (await HimaStore.getMeta(metaKey)) || [];
      const next = markDay(cur, dayKey());
      if (next !== cur) await HimaStore.setMeta(metaKey, next);
    } catch (_) { /* usage tracking must never break the app */ }
  }
  function wrapStoreForUsage() {
    MUTATION_METHODS.forEach((name) => {
      const orig = HimaStore[name];
      if (typeof orig !== "function") return;
      HimaStore[name] = function () {
        const out = orig.apply(HimaStore, arguments);
        recordDay(USAGE_ACTION);
        return out;
      };
    });
  }

  // ---- small helpers ----
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function todayISO() {
    const d = new Date();
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  }
  function fmtDate(iso) {
    if (!iso) return "";
    const d = new Date(iso + "T00:00:00");
    if (isNaN(d)) return iso;
    return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
  }
  function fmtWhen(item) {
    const parts = [];
    if (item.date) {
      const t = todayISO();
      parts.push(item.date === t ? "Today" : fmtDate(item.date));
    }
    if (item.time) parts.push(item.time);
    return parts.join(" · ");
  }
  function fmtStamp(ms) {
    if (!ms) return "";
    const d = new Date(ms);
    if (isNaN(d)) return "";
    return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  }
  function fmtClock(ms) {
    if (!ms) return "";
    return new Date(ms).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }
  let toastTimer = null;
  function toast(msg) {
    const el = $("toast");
    el.textContent = msg;
    el.classList.remove("hidden");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.add("hidden"), 2200);
  }
  const byOrder = (a, b) => (a.order || 0) - (b.order || 0);
  function normalizeLink(raw) {
    const s = (raw || "").trim();
    if (!s) return null;
    const withProto = /^https?:\/\//i.test(s) ? s : "https://" + s;
    try {
      const u = new URL(withProto);
      return u.protocol === "http:" || u.protocol === "https:" ? u.href : null;
    } catch (_) { return null; }
  }

  // ---- the shared context object ----
  // State is stored as PROPERTIES so writes from any view are visible to all.
  const ctx = {
    $, esc, toast, todayISO, fmtDate, fmtWhen, fmtStamp, fmtClock, byOrder, normalizeLink,
    store: HimaStore,
    KIND_LABEL, ENERGY_LABEL, HORIZON_LABEL,
    INPUT_TAG_LABEL, INPUT_TAG_EMOJI, OUTCOME_LABEL, OUTCOME_EMOJI,
    USAGE_OPEN, USAGE_ACTION, recordDay, wrapStoreForUsage,
    // mutable app state (was module-scoped `let`s in app.js)
    sections: [],
    currentView: "dashboard",
    currentSectionId: null,
    editingItemId: null,
    editingSectionId: null,
    goals: [],
    editingGoalId: null,
    goalFormHorizon: "quarter",
    editingEvidenceId: null,
    // per-view render fns register here so showView can dispatch across files
    views: {},
  };

  // ---- lookups / drawer / navigation (bound to ctx state) ----
  ctx.sectionById = (id) => ctx.sections.find((s) => s.id === id) || null;

  function openDrawer() {
    $("drawer").classList.add("open");
    $("drawer").setAttribute("aria-hidden", "false");
    $("drawer-backdrop").classList.remove("hidden");
    $("menu-btn").setAttribute("aria-expanded", "true");
  }
  function closeDrawer() {
    const d = $("drawer");
    if (!d) return;
    d.classList.remove("open");
    d.setAttribute("aria-hidden", "true");
    $("drawer-backdrop").classList.add("hidden");
    $("menu-btn").setAttribute("aria-expanded", "false");
  }
  function toggleDrawer() {
    if ($("drawer").classList.contains("open")) { closeDrawer(); $("menu-btn").focus(); }
    else openDrawer();
  }
  ctx.openDrawer = openDrawer;
  ctx.closeDrawer = closeDrawer;
  ctx.toggleDrawer = toggleDrawer;

  const VIEW_KEYS = ["dashboard", "donow", "checkin", "goals", "health", "evidence", "insights", "section", "manage", "settings"];
  ctx.VIEW_KEYS = VIEW_KEYS;
  function renderNav() {
    const ul = $("nav-sections");
    ul.innerHTML = ctx.sections.map((s) => `
      <li><button class="nav-item" data-section-id="${esc(s.id)}">
        <span class="nav-ico">${esc(s.icon || "📝")}</span>
        <span class="nav-label">${esc(s.name)}</span>
      </button></li>`).join("");
  }
  function highlightNav() {
    document.querySelectorAll(".nav-item").forEach((t) => {
      const isView = t.dataset.view && t.dataset.view === ctx.currentView;
      const isSec = t.dataset.sectionId && ctx.currentView === "section" && t.dataset.sectionId === ctx.currentSectionId;
      t.classList.toggle("active", Boolean(isView || isSec));
    });
  }
  function showView(name) {
    if (VIEW_KEYS.indexOf(name) < 0) name = "dashboard";
    ctx.currentView = name;
    VIEW_KEYS.forEach((v) => {
      const el = $("view-" + v);
      if (el) el.classList.toggle("hidden", v !== name);
    });
    highlightNav();
    closeDrawer();
    const render = ctx.views[name];
    if (typeof render === "function") render();
    window.scrollTo(0, 0);
  }
  function openSection(id) {
    ctx.currentSectionId = id;
    ctx.editingItemId = null;
    showView("section");
  }
  ctx.renderNav = renderNav;
  ctx.highlightNav = highlightNav;
  ctx.showView = showView;
  ctx.openSection = openSection;

  // ---- shared data refreshers ----
  async function refreshSections() {
    ctx.sections = (await HimaStore.getSections()).sort(byOrder);
    renderNav();
  }
  async function refreshGoals() {
    ctx.goals = await HimaStore.getGoals();
  }
  function visionGoal() { return ctx.goals.find((g) => g.horizon === "vision") || null; }
  async function tasksByGoal() {
    const linked = (await HimaStore.getItems()).filter((i) => i.goalId);
    const map = {};
    linked.forEach((i) => { (map[i.goalId] = map[i.goalId] || []).push(i); });
    return map;
  }
  ctx.refreshSections = refreshSections;
  ctx.refreshGoals = refreshGoals;
  ctx.visionGoal = visionGoal;
  ctx.tasksByGoal = tasksByGoal;

  window.HimaShell = ctx;
})();
