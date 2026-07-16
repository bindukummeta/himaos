(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const KIND_LABEL = { checklist: "Checklist", schedule: "Schedule", collection: "Collection" };

  // ---- time + energy (used by the "Do Now" picker) ----
  // Pure logic lives in donow-utils.js (shared with tests); the labels below
  // are UI-only so they stay here.
  const { TIME_CHOICES, ENERGY_CHOICES, ENERGY_RANK, fmtMinutes, taskFits, donowSort } = window.DoNowUtils;
  const ENERGY_LABEL = { low: "Low energy", med: "Medium energy", high: "High energy" };
  function taskTags(i) {
    // Compact tags shown on checklist rows, e.g. "15m · Low energy".
    return [fmtMinutes(i.minutes), i.energy ? ENERGY_LABEL[i.energy] : ""].filter(Boolean).join(" · ");
  }

  // ---- daily check-in (Step 2) ----
  // Pure logic (mood scale, tags, streak) lives in checkin-utils.js.
  const { MOOD_CHOICES, CONTEXT_TAGS, moodEmoji, moodLabel, tagLabel, checkinsOn, checkinStreak } = window.CheckinUtils;
  // ---- voice input (opt-in) ----
  // Pure transcript->check-in parsing lives in voice-utils.js; the browser
  // Web Speech API wiring stays here. Cloud transcription on most browsers is
  // why this is off by default and gated behind a Settings toggle.
  const { parseCheckinSpeech } = window.VoiceUtils;
  function speechSupported() {
    return typeof (window.SpeechRecognition || window.webkitSpeechRecognition) === "function";
  }
  // ---- dreaming collections (Step 3) ----
  // Pure split/stats logic lives in dreaming-utils.js; rendering stays here.
  const { isDreamingSection, isAchieved, collectionStats, splitCollection } = window.DreamingUtils;
  // ---- goals + weekly review (Step 4) ----
  // Pure ladder/rollup/review logic lives in goals-utils.js; rendering stays here.
  const {
    GOAL_HORIZONS, HORIZON_ORDER, currentWeekKey, shiftWeekKey, activitiesForWeek,
    goalProgress, goalsByHorizon, pickOneThing, weeklyReviewData,
  } = window.GoalsUtils;
  const HORIZON_LABEL = {};
  GOAL_HORIZONS.forEach((h) => { HORIZON_LABEL[h.val] = h.label; });
  // ---- private usage tracking (dogfooding retention, Step-4.5) ----
  // Pure date/summary logic lives in usage-utils.js. Recording is SILENT and
  // fully on-device; the summary is shown only when explicitly requested in
  // Settings, so the metric can't nudge behaviour and distort itself.
  const { dayKey, markDay, usageSummary, WINDOW_DAYS } = window.UsageUtils;
  // The two recorded day-lists live in meta under these keys.
  const USAGE_OPEN = "usageOpenDays";
  const USAGE_ACTION = "usageActionDays";
  // Names of HimaStore methods that represent a genuine user data change; any
  // call to one stamps today as an "action day" (see wrapStoreForUsage).
  const MUTATION_METHODS = [
    "addItem", "updateItem", "deleteItem", "clearDone",
    "addCheckin", "deleteCheckin",
    "addGoal", "updateGoal", "deleteGoal",
    "addActivity", "updateActivity", "deleteActivity", "toggleActivityWeek",
  ];
  // Append today to a meta day-list, but only when it isn't already there
  // (markDay returns the same array by identity on a no-op → skip the write).
  async function recordDay(metaKey) {
    try {
      const cur = (await HimaStore.getMeta(metaKey)) || [];
      const next = markDay(cur, dayKey());
      if (next !== cur) await HimaStore.setMeta(metaKey, next);
    } catch (_) { /* usage tracking must never break the app */ }
  }
  // Wrap each mutation method once so every data change records an action day,
  // with no scattered call-site edits to forget. Import restores from backup
  // via importAll, which is deliberately NOT wrapped (a restore isn't "use").
  function wrapStoreForUsage() {
    MUTATION_METHODS.forEach((name) => {
      const orig = HimaStore[name];
      if (typeof orig !== "function") return;
      HimaStore[name] = function () {
        const out = orig.apply(HimaStore, arguments);
        recordDay(USAGE_ACTION); // fire-and-forget; never blocks the mutation
        return out;
      };
    });
  }
  // Accept a bare "example.com" and turn it into a safe absolute http(s) link,
  // or null if it clearly isn't a web link. Keeps javascript: etc. out.
  function normalizeLink(raw) {
    const s = (raw || "").trim();
    if (!s) return null;
    const withProto = /^https?:\/\//i.test(s) ? s : "https://" + s;
    try {
      const u = new URL(withProto);
      return u.protocol === "http:" || u.protocol === "https:" ? u.href : null;
    } catch (_) { return null; }
  }

  // ---- app state ----
  let sections = [];            // cached list of sections (sorted by order)
  let currentView = "dashboard";
  let currentSectionId = null;
  let editingItemId = null;     // item being edited in the section form
  let editingSectionId = null;  // section being edited in the manage form
  let goals = [];               // cached list of goals (incl. the vision record)
  let editingGoalId = null;     // goal being edited in the goal form
  let goalFormHorizon = "quarter"; // horizon chip selection in the goal form

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
    // Calendar date from a millisecond timestamp (e.g. when a dream was lived).
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
  function sectionById(id) { return sections.find((s) => s.id === id) || null; }

  // ---- drawer ----
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

  // ---- navigation ----
  const VIEW_KEYS = ["dashboard", "donow", "checkin", "goals", "section", "manage", "settings"];
  function renderNav() {
    const ul = $("nav-sections");
    ul.innerHTML = sections.map((s) => `
      <li><button class="nav-item" data-section-id="${esc(s.id)}">
        <span class="nav-ico">${esc(s.icon || "📝")}</span>
        <span class="nav-label">${esc(s.name)}</span>
      </button></li>`).join("");
  }
  function highlightNav() {
    document.querySelectorAll(".nav-item").forEach((t) => {
      const isView = t.dataset.view && t.dataset.view === currentView;
      const isSec = t.dataset.sectionId && currentView === "section" && t.dataset.sectionId === currentSectionId;
      t.classList.toggle("active", Boolean(isView || isSec));
    });
  }
  function showView(name) {
    if (VIEW_KEYS.indexOf(name) < 0) name = "dashboard";
    currentView = name;
    VIEW_KEYS.forEach((v) => {
      const el = $("view-" + v);
      if (el) el.classList.toggle("hidden", v !== name);
    });
    highlightNav();
    closeDrawer();
    if (name === "dashboard") renderDashboard();
    else if (name === "donow") renderDoNow();
    else if (name === "checkin") renderCheckin();
    else if (name === "goals") renderGoals();
    else if (name === "section") renderSection();
    else if (name === "manage") renderManage();
    else if (name === "settings") renderSettings();
    window.scrollTo(0, 0);
  }
  function openSection(id) {
    currentSectionId = id;
    editingItemId = null;
    showView("section");
  }

  // ---- data refresh ----
  async function refreshSections() {
    sections = (await HimaStore.getSections()).sort(byOrder);
    renderNav();
  }
  async function refreshGoals() {
    goals = await HimaStore.getGoals();
  }
  // The single vision record lives in the goals store with horizon "vision".
  function visionGoal() { return goals.find((g) => g.horizon === "vision") || null; }
  // Map goalId -> its linked checklist tasks, for progress rollups + nudges.
  async function tasksByGoal() {
    const linked = (await HimaStore.getItems()).filter((i) => i.goalId);
    const map = {};
    linked.forEach((i) => { (map[i.goalId] = map[i.goalId] || []).push(i); });
    return map;
  }

  // ============ DASHBOARD ============
  async function renderDashboard() {
    const hr = new Date().getHours();
    const greet = hr < 12 ? "Good morning" : hr < 18 ? "Good afternoon" : "Good evening";
    $("dash-greeting").textContent = greet + " 👋";
    $("dash-date").textContent = new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" });

    const checkins = await HimaStore.getCheckins();
    renderDashCheckin(checkins);

    renderDashAddSections();

    await refreshGoals();
    await renderDashOneThing();

    const items = await HimaStore.getItems();
    const kindOf = {};
    sections.forEach((s) => { kindOf[s.id] = s.kind; });
    const today = todayISO();
    const open = items.filter((i) => !i.done);

    $("dash-open").innerHTML = `<span class="tile-num">${open.length}</span><span class="tile-label">open items</span>`;
    const todaySched = open.filter((i) => kindOf[i.sectionId] === "schedule" && i.date === today);
    $("dash-today").innerHTML = `<span class="tile-num">${todaySched.length}</span><span class="tile-label">on today</span>`;

    const coming = open
      .filter((i) => kindOf[i.sectionId] === "schedule" && i.date && i.date >= today)
      .sort((a, b) => (a.date + (a.time || "99:99")).localeCompare(b.date + (b.time || "99:99")))
      .slice(0, 6);
    $("dash-schedule").innerHTML = coming.length
      ? coming.map((i) => dashRow(i)).join("")
      : `<p class="empty">Nothing scheduled. Enjoy the calm. 🌿</p>`;

    const todos = open
      .filter((i) => kindOf[i.sectionId] === "checklist")
      .sort((a, b) => (a.order || 0) - (b.order || 0));
    $("dash-todos").innerHTML = todos.length
      ? todos.map((i) => dashRow(i, { tickable: true })).join("")
      : `<p class="empty">No open to-dos. 🎉</p>`;

    $("dash-sections").innerHTML = sections.map((s) => {
      const mine = items.filter((i) => i.sectionId === s.id);
      const openN = mine.filter((i) => !i.done).length;
      return `<button class="dash-card" data-section-id="${esc(s.id)}">
        <span class="dash-card-ico">${esc(s.icon || "📝")}</span>
        <span class="dash-card-name">${esc(s.name)}</span>
        <span class="dash-card-count">${openN} open · ${mine.length} total</span>
      </button>`;
    }).join("") || `<p class="empty">No sections yet. Add one from Manage sections.</p>`;
  }
  // The dashboard check-in card: prompt if nothing logged today, else the
  // latest mood/energy plus the streak (kept gentle — never a scold).
  function renderDashCheckin(checkins) {
    const today = todayISO();
    const mine = checkinsOn(checkins, today); // newest first
    const streak = checkinStreak(checkins, today);
    const ico = $("dash-checkin-ico");
    const title = $("dash-checkin-title");
    const sub = $("dash-checkin-sub");
    if (mine.length) {
      const latest = mine[0];
      ico.textContent = latest.mood ? moodEmoji(latest.mood) : "💗";
      const label = [latest.mood ? moodLabel(latest.mood) : "", latest.energy ? ENERGY_LABEL[latest.energy] : ""].filter(Boolean).join(" · ");
      title.textContent = label || "Checked in";
      const count = `${mine.length} today`;
      sub.textContent = streak > 1 ? `${count} · ${streak}-day streak 🔥` : `${count} · tap to add another`;
    } else {
      ico.textContent = "💗";
      title.textContent = "How are you feeling?";
      sub.textContent = streak > 1 ? `A 5-second energy + mood tap · ${streak}-day streak 🔥` : "A 5-second energy + mood tap.";
    }
  }
  // The dashboard "one thing that matters today" nudge: the single most-
  // neglected weekly activity (or open linked task). Hidden entirely when
  // there's nothing to nudge — the app never nags for its own sake.
  async function renderDashOneThing() {
    const tile = $("dash-one-thing");
    const map = await tasksByGoal();
    const pick = pickOneThing(goals, map, currentWeekKey());
    if (!pick) { tile.classList.add("hidden"); return; }
    const what = pick.activity ? pick.activity.title : pick.task.title;
    $("one-thing-sub").textContent = `${what} — toward “${pick.goal.title}”`;
    tile.classList.remove("hidden");
  }
  function dashRow(i, opts) {
    opts = opts || {};
    const sec = sectionById(i.sectionId);
    const when = fmtWhen(i);
    const meta = [when, i.note].filter(Boolean).join(" · ");
    // Tickable rows (Open to-dos) get a check button so they can be marked done
    // straight from the dashboard, mirroring the section list's toggle.
    const check = opts.tickable
      ? `<button class="mini-check" data-act="dash-toggle" aria-label="Mark done"></button>`
      : `<span class="mini-ico">${esc(sec ? sec.icon : "•")}</span>`;
    return `<div class="mini-row" data-id="${esc(i.id)}">
      ${check}
      <span class="mini-main"><span class="mini-title">${esc(i.title)}</span>${meta ? `<span class="mini-meta">${esc(meta)}</span>` : ""}</span>
    </div>`;
  }
  // The dashboard quick-add category picker: every checklist/schedule/collection
  // section, so a new item can be filed without leaving the dashboard. Keeps the
  // previously chosen section selected across re-renders when it still exists.
  function renderDashAddSections() {
    const sel = $("dash-add-section");
    if (!sel) return;
    const prev = sel.value;
    sel.innerHTML = sections.map((s) =>
      `<option value="${esc(s.id)}">${esc(s.icon || "📝")} ${esc(s.name)}</option>`
    ).join("");
    if (prev && sections.some((s) => s.id === prev)) sel.value = prev;
  }
  // Add an item to the chosen section from the dashboard. Schedule/collection
  // sections just get a plain title here; richer fields stay in the section view.
  async function submitDashAdd(e) {
    e.preventDefault();
    const title = ($("dash-add-title").value || "").trim();
    if (!title) { $("dash-add-title").focus(); return; }
    const sectionId = $("dash-add-section").value;
    if (!sectionId) { toast("Add a section first from Manage sections."); return; }
    await HimaStore.addItem({ sectionId, title });
    $("dash-add-title").value = "";
    toast("Added ✨");
    renderDashboard();
  }
  async function onDashTodosClick(e) {
    const btn = e.target.closest('[data-act="dash-toggle"]');
    const row = e.target.closest(".mini-row");
    if (!btn || !row) return;
    // Instant feedback: fade the row out right away, then persist + re-render so
    // it never lingers waiting on the async store write.
    row.classList.add("leaving");
    await HimaStore.updateItem(row.dataset.id, { done: 1, doneAt: Date.now() });
    toast("Done — nice. ✨");
    await renderDashboard();
  }

  // ============ DO NOW ============
  // Filter state persists within the session so returning to the view keeps
  // your last "I have this much time / energy" choice. "" = Any.
  let donowMins = "";   // "" (Any) or a number-as-string from TIME_CHOICES
  let donowEnergy = ""; // "" (Any) or low/med/high
  let donowFiltersBuilt = false;

  function donowFilterChip(name, val, label, selected) {
    return `<button type="button" class="chip${selected ? " selected" : ""}" data-donow="${esc(name)}" data-val="${esc(val)}">${esc(label)}</button>`;
  }
  function buildDoNowFilters() {
    const mins = [donowFilterChip("mins", "", "Any", donowMins === "")]
      .concat(TIME_CHOICES.map((m) => donowFilterChip("mins", String(m), fmtMinutes(m), donowMins === String(m))))
      .join("");
    const energy = [donowFilterChip("energy", "", "Any", donowEnergy === "")]
      .concat(ENERGY_CHOICES.map((e) => donowFilterChip("energy", e, ENERGY_LABEL[e], donowEnergy === e)))
      .join("");
    $("donow-mins").innerHTML = mins;
    $("donow-energy").innerHTML = energy;
    donowFiltersBuilt = true;
  }
  function donowRow(i) {
    const sec = sectionById(i.sectionId);
    const tags = taskTags(i);
    const meta = [sec ? sec.name : "", tags].filter(Boolean).join(" · ");
    return `<div class="item-row" data-id="${esc(i.id)}">
      <button class="item-check" data-act="donow-toggle" aria-label="Mark done">✓</button>
      <div class="item-main">
        <div class="item-title">${esc(i.title)}</div>
        ${meta ? `<div class="item-meta">${esc(meta)}</div>` : ""}
      </div>
    </div>`;
  }
  async function renderDoNow() {
    if (!donowFiltersBuilt) buildDoNowFilters();
    const items = await HimaStore.getItems();
    const kindOf = {};
    sections.forEach((s) => { kindOf[s.id] = s.kind; });
    const budget = { minutes: donowMins, energy: donowEnergy };
    const fits = items.filter((i) => taskFits(i, kindOf, budget)).sort(donowSort);
    $("donow-count").textContent = `${fits.length} fit${fits.length === 1 ? "s" : ""}`;
    $("donow-list").innerHTML = fits.length
      ? fits.map((i) => donowRow(i)).join("")
      : `<p class="empty">Nothing fits that pocket right now. Try widening the time or energy — or enjoy the gap. 🌿</p>`;
  }
  function onDoNowFilterClick(e) {
    const chip = e.target.closest(".chip[data-donow]");
    if (!chip) return;
    if (chip.dataset.donow === "mins") donowMins = chip.dataset.val;
    else donowEnergy = chip.dataset.val;
    buildDoNowFilters();
    renderDoNow();
  }
  async function onDoNowListClick(e) {
    const btn = e.target.closest('[data-act="donow-toggle"]');
    const row = e.target.closest(".item-row");
    if (!btn || !row) return;
    await HimaStore.updateItem(row.dataset.id, { done: 1, doneAt: Date.now() });
    toast("Done — nice. ✨");
    renderDoNow();
  }

  // ============ DAILY CHECK-IN ============
  // Build the capture form fresh each time the view opens (clears selections).
  // Mood/energy are single-select (selection held on the group's data-val);
  // context tags are multi-select (selection is the chip's own .selected class).
  function buildCheckinForm() {
    $("checkin-mood").innerHTML = MOOD_CHOICES.map((m) =>
      `<button type="button" class="chip" data-cgroup="mood" data-val="${esc(m.val)}"><span class="mood-emoji">${esc(m.emoji)}</span><span class="mood-label">${esc(m.label)}</span></button>`
    ).join("");
    $("checkin-mood").dataset.val = "";
    $("checkin-energy").innerHTML = ENERGY_CHOICES.map((e) =>
      `<button type="button" class="chip" data-cgroup="energy" data-val="${esc(e)}">${esc(ENERGY_LABEL[e])}</button>`
    ).join("");
    $("checkin-energy").dataset.val = "";
    $("checkin-tags").innerHTML = CONTEXT_TAGS.map((t) =>
      `<button type="button" class="chip" data-cgroup="tags" data-val="${esc(t.id)}" data-multi="1">${esc(t.emoji)} ${esc(t.label)}</button>`
    ).join("");
    $("checkin-note").value = "";
  }
  function checkinRow(c) {
    const bits = [
      c.energy ? ENERGY_LABEL[c.energy] : "",
      (c.tags || []).map(tagLabel).join(", "),
      c.note,
    ].filter(Boolean).join(" · ");
    return `<div class="checkin-row" data-id="${esc(c.id)}">
      <span class="checkin-mood-ico">${esc(c.mood ? moodEmoji(c.mood) : "💗")}</span>
      <div class="checkin-main">
        <div class="checkin-title">${esc(c.mood ? moodLabel(c.mood) : "Checked in")}</div>
        ${bits ? `<div class="checkin-meta">${esc(bits)}</div>` : ""}
      </div>
      <span class="checkin-time">${esc(fmtClock(c.at))}</span>
      <div class="item-actions"><button class="icon-btn" data-act="del-checkin" aria-label="Delete">🗑️</button></div>
    </div>`;
  }
  async function renderCheckin() {
    buildCheckinForm();
    const checkins = await HimaStore.getCheckins();
    const today = todayISO();
    const mine = checkinsOn(checkins, today);
    const streak = checkinStreak(checkins, today);
    $("checkin-streak").textContent = streak ? `${streak}-day streak 🔥` : "";
    $("checkin-today").innerHTML = mine.length
      ? mine.map((c) => checkinRow(c)).join("")
      : `<p class="empty">No check-ins yet today. Whenever you're ready. 🌿</p>`;

    // The mic only appears once voice is enabled in Settings AND supported here.
    const mic = $("checkin-mic");
    const on = speechSupported() && (await HimaStore.getMeta("voiceEnabled")) === true;
    mic.classList.toggle("hidden", !on);
  }
  // Set a single-select chip group (mood/energy) to a value ("" clears it).
  function setCheckinGroup(id, val) {
    const g = $(id);
    if (!g) return;
    g.dataset.val = val == null ? "" : String(val);
    g.querySelectorAll(".chip").forEach((b) => b.classList.toggle("selected", g.dataset.val !== "" && b.dataset.val === g.dataset.val));
  }
  function onCheckinChipClick(e) {
    const chip = e.target.closest(".chip[data-cgroup]");
    if (!chip) return;
    if (chip.dataset.multi) { chip.classList.toggle("selected"); return; }
    const group = chip.parentElement;
    setCheckinGroup(group.id, group.dataset.val === chip.dataset.val ? "" : chip.dataset.val);
  }
  // Fill the form from a spoken transcript (chips + note), leaving it editable.
  function applyCheckinSpeech(transcript) {
    const parsed = parseCheckinSpeech(transcript);
    if (parsed.mood) setCheckinGroup("checkin-mood", String(parsed.mood));
    if (parsed.energy) setCheckinGroup("checkin-energy", parsed.energy);
    parsed.tags.forEach((id) => {
      const chip = $("checkin-tags").querySelector('.chip[data-val="' + id + '"]');
      if (chip) chip.classList.add("selected");
    });
    if (parsed.note) $("checkin-note").value = parsed.note;
    toast("Got it — check what I filled in, then log. 🎤");
  }
  let checkinRec = null; // active SpeechRecognition, so a second tap can stop it
  function startCheckinVoice() {
    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Ctor) return;
    const btn = $("checkin-mic");
    if (checkinRec) { checkinRec.stop(); return; } // tap again to cancel
    const rec = new Ctor();
    checkinRec = rec;
    rec.lang = navigator.language || "en-US";
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    btn.classList.add("listening");
    rec.onresult = (e) => {
      const transcript = (e.results && e.results[0] && e.results[0][0] && e.results[0][0].transcript) || "";
      if (transcript) applyCheckinSpeech(transcript);
    };
    rec.onerror = (e) => {
      if (e && e.error !== "aborted" && e.error !== "no-speech") toast("Didn't catch that. Try again?");
    };
    rec.onend = () => { btn.classList.remove("listening"); checkinRec = null; };
    try { rec.start(); } catch (_) { btn.classList.remove("listening"); checkinRec = null; }
  }
  async function submitCheckin(e) {
    e.preventDefault();
    const mood = $("checkin-mood").dataset.val ? Number($("checkin-mood").dataset.val) : null;
    const energy = $("checkin-energy").dataset.val || null;
    if (!mood && !energy) { toast("Tap a mood or energy first 💗"); return; }
    const tags = Array.from($("checkin-tags").querySelectorAll(".chip.selected")).map((b) => b.dataset.val);
    const note = ($("checkin-note").value || "").trim();
    await HimaStore.addCheckin({ date: todayISO(), at: Date.now(), mood, energy, tags, note });
    toast("Logged. Thanks for checking in. 💗");
    renderCheckin();
  }
  async function onCheckinTodayClick(e) {
    const btn = e.target.closest('[data-act="del-checkin"]');
    const row = e.target.closest(".checkin-row");
    if (!btn || !row) return;
    await HimaStore.deleteCheckin(row.dataset.id);
    renderCheckin();
  }

  // ============ GOALS + WEEKLY REVIEW ============
  // Build the horizon chip picker for the goal form (year/quarter only — the
  // single vision lives in its own banner and is edited separately).
  function buildGoalHorizonField() {
    const chips = HORIZON_ORDER.filter((h) => h !== "vision").map((h) =>
      `<button type="button" class="chip${goalFormHorizon === h ? " selected" : ""}" data-goal-horizon="${esc(h)}">${esc(HORIZON_LABEL[h])}</button>`
    ).join("");
    $("gf-horizon-field").innerHTML = `<div class="chip-row">${chips}</div>`;
  }
  function resetGoalForm() {
    editingGoalId = null;
    goalFormHorizon = "quarter";
    $("goal-id").value = "";
    $("gf-title").value = "";
    $("gf-note").value = "";
    buildGoalHorizonField();
    $("goal-form-title").textContent = "Add a goal";
    $("goal-submit").textContent = "Add goal";
    $("goal-cancel").classList.add("hidden");
  }
  // The north-star banner: show the saved vision (with an Edit affordance) or,
  // when none is set, an inline form to write one.
  function renderVision() {
    const v = visionGoal();
    const display = $("vision-display");
    const form = $("vision-form");
    if (v && v.title) {
      display.innerHTML = `<div class="vision-set">
        <div class="vision-text">${esc(v.title)}</div>
        ${v.note ? `<div class="vision-note">${esc(v.note)}</div>` : ""}
        <button type="button" class="btn-link" id="vision-edit">Edit vision</button>
      </div>`;
      form.classList.add("hidden");
    } else {
      display.innerHTML = "";
      form.classList.remove("hidden");
      $("vf-title").value = v ? v.title || "" : "";
      $("vf-note").value = v ? v.note || "" : "";
    }
  }
  // One embedded weekly activity row: a per-week tick + its title.
  function activityRow(goalId, a) {
    return `<div class="goal-activity${a.done ? " done" : ""}" data-activity-id="${esc(a.id)}">
      <button class="activity-check" data-act="toggle-activity" aria-label="Mark done this week">${a.done ? "✓" : ""}</button>
      <span class="activity-title">${esc(a.title)}</span>
      <div class="item-actions"><button class="icon-btn" data-act="del-activity" aria-label="Delete activity">🗑️</button></div>
    </div>`;
  }
  function goalCard(g, linked, weekKey) {
    const prog = goalProgress(g, linked, weekKey);
    const { rows } = activitiesForWeek(g, weekKey);
    const statusCls = g.status === "done" ? " done" : g.status === "paused" ? " paused" : "";
    const statusLbl = g.status === "done" ? "Done" : g.status === "paused" ? "Paused" : "Active";
    const bar = prog.total
      ? `<div class="goal-progress"><div class="goal-progress-bar" style="width:${Math.round(prog.pct * 100)}%"></div></div>
         <div class="goal-progress-label">${prog.done}/${prog.total} this week · ${Math.round(prog.pct * 100)}%</div>`
      : `<div class="goal-progress-label">No weekly activities yet — add one below.</div>`;
    const acts = rows.map((a) => activityRow(g.id, a)).join("");
    const linkedN = (linked || []).length;
    return `<div class="goal-card" data-goal-id="${esc(g.id)}">
      <div class="goal-head">
        <div class="goal-head-main">
          <div class="goal-title">${esc(g.title)}</div>
          ${g.note ? `<div class="goal-note">${esc(g.note)}</div>` : ""}
        </div>
        <span class="goal-status-pill${statusCls}">${esc(statusLbl)}</span>
      </div>
      ${bar}
      <div class="goal-activities">${acts}</div>
      <form class="add-activity" data-goal-id="${esc(g.id)}">
        <input class="af-title" placeholder="Add a weekly activity…" />
        <button type="submit" class="btn-secondary">Add</button>
      </form>
      ${linkedN ? `<div class="goal-linked">🔗 ${linkedN} linked task${linkedN === 1 ? "" : "s"}</div>` : ""}
      <div class="item-actions" style="margin-top:8px">
        <button class="icon-btn" data-act="edit-goal" aria-label="Edit goal">✏️</button>
        <button class="icon-btn" data-act="cycle-status" aria-label="Change status" title="Active → Paused → Done">🔄</button>
        <button class="icon-btn" data-act="del-goal" aria-label="Delete goal">🗑️</button>
      </div>
    </div>`;
  }
  // The guilt-free weekly review: compounded wins up top, then per-goal rows with
  // a "vs last week" read and, for behind goals, gentle move/shrink actions.
  function renderReview(reviewRows) {
    const body = $("review-body");
    if (!reviewRows.length) {
      body.innerHTML = `<p class="empty">Add a goal with a weekly activity and your review will appear here. 🌱</p>`;
      return;
    }
    const totalCompounded = reviewRows.reduce((s, r) => s + r.compounded, 0);
    const head = totalCompounded
      ? `<p class="review-suggest">You've compounded <strong>${totalCompounded}</strong> weekly win${totalCompounded === 1 ? "" : "s"} so far. That's how big things happen. ✨</p>`
      : "";
    const rows = reviewRows.map((r) => {
      const pct = Math.round(r.pct * 100);
      const trend = r.pct > r.lastWeekPct ? "↑ up from last week"
        : r.pct < r.lastWeekPct ? "↓ down from last week" : "→ same as last week";
      const line = r.total ? `${r.done}/${r.total} this week · ${pct}% · ${trend}` : "No activities this week";
      const status = r.behind
        ? `<div class="review-suggest">${esc(r.suggestion)}</div>
           <div class="review-actions">
             <button class="btn-secondary" data-act="review-move" data-goal-id="${esc(r.goal.id)}">Move to next week</button>
             <button class="btn-secondary" data-act="review-snooze" data-goal-id="${esc(r.goal.id)}">Not this week</button>
           </div>`
        : `<div class="review-line review-ontrack">On track — keep going. 💪</div>`;
      return `<div class="review-row">
        <div class="review-title">${esc(r.goal.title)}</div>
        <div class="review-line">${esc(line)}</div>
        ${status}
      </div>`;
    }).join("");
    body.innerHTML = head + rows;
  }
  async function renderGoals() {
    await refreshGoals();
    resetGoalForm();
    renderVision();

    const weekKey = currentWeekKey();
    const map = await tasksByGoal();
    const grouped = goalsByHorizon(goals);
    const working = grouped.year.concat(grouped.quarter);
    $("goals-count").textContent = working.length
      ? `${working.length} goal${working.length === 1 ? "" : "s"}`
      : "";

    const list = $("goals-list");
    if (!working.length) {
      list.innerHTML = `<p class="empty">No goals yet. Add one above — start with a single quarter goal. 🎯</p>`;
    } else {
      list.innerHTML = ["year", "quarter"].map((h) => {
        if (!grouped[h].length) return "";
        const cards = grouped[h].map((g) => goalCard(g, map[g.id], weekKey)).join("");
        return `<h3 class="horizon-heading">${esc(HORIZON_LABEL[h])}</h3>` + cards;
      }).join("");
    }

    renderReview(weeklyReviewData(working, map, weekKey));
  }
  async function submitVision(e) {
    e.preventDefault();
    const title = ($("vf-title").value || "").trim();
    const note = ($("vf-note").value || "").trim();
    const v = visionGoal();
    if (!title) {
      if (v) { await HimaStore.deleteGoal(v.id); await renderGoals(); }
      return;
    }
    if (v) await HimaStore.updateGoal(v.id, { title, note });
    else await HimaStore.addGoal({ horizon: "vision", title, note });
    await renderGoals();
    toast("Vision saved. 🌟");
  }
  async function submitGoal(e) {
    e.preventDefault();
    const title = ($("gf-title").value || "").trim();
    if (!title) { $("gf-title").focus(); return; }
    const rec = { title, note: ($("gf-note").value || "").trim(), horizon: goalFormHorizon };
    if (editingGoalId) await HimaStore.updateGoal(editingGoalId, rec);
    else await HimaStore.addGoal(rec);
    await renderGoals();
    toast(editingGoalId ? "Goal updated" : "Goal added 🎯");
  }
  async function onGoalsClick(e) {
    // Vision edit toggles the inline form back on.
    if (e.target.closest("#vision-edit")) {
      const v = visionGoal();
      $("vision-display").innerHTML = "";
      $("vision-form").classList.remove("hidden");
      $("vf-title").value = v ? v.title || "" : "";
      $("vf-note").value = v ? v.note || "" : "";
      $("vf-title").focus();
      return;
    }
    // Horizon chip picker in the goal form.
    const hChip = e.target.closest(".chip[data-goal-horizon]");
    if (hChip) { goalFormHorizon = hChip.dataset.goalHorizon; buildGoalHorizonField(); return; }

    const btn = e.target.closest("[data-act]");
    if (!btn) return;
    const act = btn.dataset.act;
    const card = e.target.closest(".goal-card");
    const goalId = card ? card.dataset.goalId : (btn.dataset.goalId || null);
    if (!goalId) return;

    if (act === "toggle-activity") {
      const arow = e.target.closest("[data-activity-id]");
      if (!arow) return;
      await HimaStore.toggleActivityWeek(goalId, arow.dataset.activityId, currentWeekKey());
      renderGoals();
    } else if (act === "del-activity") {
      const arow = e.target.closest("[data-activity-id]");
      if (!arow) return;
      await HimaStore.deleteActivity(goalId, arow.dataset.activityId);
      renderGoals();
    } else if (act === "edit-goal") {
      const g = goals.find((x) => x.id === goalId);
      if (!g) return;
      editingGoalId = goalId;
      goalFormHorizon = g.horizon === "year" ? "year" : "quarter";
      $("goal-id").value = goalId;
      $("gf-title").value = g.title || "";
      $("gf-note").value = g.note || "";
      buildGoalHorizonField();
      $("goal-form-title").textContent = "Edit goal";
      $("goal-submit").textContent = "Save";
      $("goal-cancel").classList.remove("hidden");
      $("gf-title").focus();
      window.scrollTo(0, 0);
    } else if (act === "cycle-status") {
      const g = goals.find((x) => x.id === goalId);
      if (!g) return;
      const next = g.status === "active" ? "paused" : g.status === "paused" ? "done" : "active";
      await HimaStore.updateGoal(goalId, { status: next });
      renderGoals();
    } else if (act === "del-goal") {
      const g = goals.find((x) => x.id === goalId);
      if (confirm(`Delete "${g ? g.title : "this goal"}"? Linked tasks are kept (just unlinked).`)) {
        await HimaStore.deleteGoal(goalId);
        renderGoals();
      }
    } else if (act === "review-move") {
      // "Move to next week" is guilt-free: mark this week's activities done so
      // the pressure resets, and let next week carry the intent fresh.
      const g = goals.find((x) => x.id === goalId);
      if (!g) return;
      const wk = currentWeekKey();
      const { rows } = activitiesForWeek(g, wk);
      for (const a of rows) if (!a.done) await HimaStore.toggleActivityWeek(goalId, a.id, wk);
      toast("Moved on — next week is a fresh start. 🌱");
      renderGoals();
    } else if (act === "review-snooze") {
      await HimaStore.updateGoal(goalId, { snoozedWeek: currentWeekKey() });
      toast("Snoozed for this week. No guilt. 💛");
      renderGoals();
    }
  }
  async function onAddActivitySubmit(e) {
    const form = e.target.closest(".add-activity");
    if (!form) return;
    e.preventDefault();
    const input = form.querySelector(".af-title");
    const title = (input.value || "").trim();
    if (!title) { input.focus(); return; }
    await HimaStore.addActivity(form.dataset.goalId, { title });
    renderGoals();
  }

  // ============ SECTION (generic) ============
  const KIND_PLACEHOLDER = {
    checklist: { title: "Add an item…", note: "Note (optional)" },
    schedule: { title: "Add an event…", note: "Note (optional)" },
    collection: { title: "Add a title…", note: "Author / note (optional)" },
  };
  // A chip picker: click a chip to select; click again to clear (optional field).
  // Selection is held in data-val on the group container.
  function chipGroup(name, label, chips) {
    const buttons = chips.map((c) =>
      `<button type="button" class="chip" data-chip="${esc(name)}" data-val="${esc(c.val)}">${esc(c.label)}</button>`
    ).join("");
    return `<div class="field chip-field">
      <label>${esc(label)} <span class="chip-optional">(optional)</span></label>
      <div class="chip-row" id="chips-${esc(name)}" data-val="">${buttons}</div>
    </div>`;
  }
  function chipValue(name) { const g = $("chips-" + name); return g ? g.dataset.val : ""; }
  function setChip(name, val) {
    const g = $("chips-" + name);
    if (!g) return;
    g.dataset.val = val == null ? "" : String(val);
    g.querySelectorAll(".chip").forEach((b) => b.classList.toggle("selected", b.dataset.val === g.dataset.val));
  }
  function buildItemForm(section) {
    const ph = KIND_PLACEHOLDER[section.kind] || KIND_PLACEHOLDER.checklist;
    let html = `<div class="field"><input id="if-title" required placeholder="${esc(ph.title)}" /></div>`;
    if (section.kind === "schedule") {
      html += `<div class="grid-2">
        <div class="field"><label for="if-date">Date</label><input id="if-date" type="date" /></div>
        <div class="field"><label for="if-time">Time</label><input id="if-time" type="time" /></div>
      </div>`;
    }
    html += `<div class="field"><input id="if-note" placeholder="${esc(ph.note)}" /></div>`;
    // Checklist tasks can carry optional time + energy so "Do Now" can surface them.
    if (section.kind === "checklist") {
      html += chipGroup("mins", "How long?", TIME_CHOICES.map((m) => ({ val: m, label: fmtMinutes(m) })));
      html += chipGroup("energy", "Energy", ENERGY_CHOICES.map((e) => ({ val: e, label: ENERGY_LABEL[e] })));
      // Optionally link this task to a goal it serves (only active year/quarter goals).
      const linkable = goalsByHorizon(goals);
      const goalChips = linkable.year.concat(linkable.quarter).filter((g) => g.status === "active");
      if (goalChips.length) {
        html += chipGroup("goal", "Serves a goal", goalChips.map((g) => ({ val: g.id, label: g.title })));
      }
    }
    // Collection items can carry an optional web link (a place, a trailer, …).
    if (section.kind === "collection") {
      html += `<div class="field"><input id="if-link" type="url" inputmode="url" placeholder="Link (optional)" /></div>`;
    }
    $("item-fields").innerHTML = html;
  }
  function resetItemForm(section) {
    editingItemId = null;
    buildItemForm(section);
    $("item-id").value = "";
    $("item-submit").textContent = "Add";
    $("item-cancel").classList.add("hidden");
  }
  function sortItems(list, kind) {
    if (kind === "schedule") {
      return list.slice().sort((a, b) => {
        if (!!a.done !== !!b.done) return a.done ? 1 : -1;
        const ka = (a.date || "9999-99-99") + (a.time || "99:99");
        const kb = (b.date || "9999-99-99") + (b.time || "99:99");
        return ka.localeCompare(kb);
      });
    }
    return list.slice().sort((a, b) => {
      if (!!a.done !== !!b.done) return a.done ? 1 : -1;
      if (a.done) return (b.doneAt || 0) - (a.doneAt || 0);
      return (a.order || 0) - (b.order || 0);
    });
  }
  function itemRow(i, kind, opts) {
    opts = opts || {};
    const dreaming = opts.dreaming === true;
    const when = kind === "schedule" ? fmtWhen(i) : "";
    const tags = kind === "checklist" ? taskTags(i) : "";
    // On dreaming collections, an achieved item shows when it was lived.
    const lived = dreaming && i.done && i.doneAt ? "Lived " + fmtStamp(i.doneAt) : "";
    const meta = [when, tags, i.note, lived].filter(Boolean).join(" · ");
    // Collections show an optional link as its own clickable line (safe href).
    const link = kind === "collection" && i.link
      ? `<a class="item-link" href="${esc(i.link)}" target="_blank" rel="noopener noreferrer">${esc(prettyLink(i.link))} ↗</a>`
      : "";
    // Dreaming collections reframe the tick as "mark as lived ✨".
    const checkGlyph = i.done ? (dreaming ? "✨" : "✓") : "";
    const checkLabel = dreaming ? "Mark as lived" : "Toggle done";
    return `<div class="item-row${i.done ? " done" : ""}${dreaming ? " dream" : ""}" data-id="${esc(i.id)}">
      <button class="item-check" data-act="toggle" aria-label="${esc(checkLabel)}">${checkGlyph}</button>
      <div class="item-main" data-act="edit">
        <div class="item-title">${esc(i.title)}</div>
        ${meta ? `<div class="item-meta">${esc(meta)}</div>` : ""}
        ${link}
      </div>
      <div class="item-actions">
        <button class="icon-btn" data-act="edit" aria-label="Edit">✏️</button>
        <button class="icon-btn" data-act="del" aria-label="Delete">🗑️</button>
      </div>
    </div>`;
  }
  // Short, human display for a link (host + trimmed path), never the raw URL.
  function prettyLink(href) {
    try {
      const u = new URL(href);
      const path = u.pathname === "/" ? "" : u.pathname;
      return (u.host + path).replace(/\/$/, "");
    } catch (_) { return href; }
  }
  async function renderSection() {
    const section = sectionById(currentSectionId);
    if (!section) { showView("dashboard"); return; }
    $("section-title").innerHTML = `${esc(section.icon || "📝")} ${esc(section.name)}`;
    if (editingItemId === null) resetItemForm(section);

    const items = await HimaStore.getItems({ sectionId: section.id });
    const dreaming = isDreamingSection(section);

    if (dreaming) {
      // Dreaming collections read as a wishlist: count lived vs still-to-live,
      // and split the list into "Someday" and a celebratory "Lived ✨" section.
      const stats = collectionStats(items);
      $("section-count").textContent = stats.total
        ? `${stats.achieved} lived · ${stats.someday} someday`
        : "";
      $("section-empty-hint").textContent = stats.total ? "" : "Nothing here yet — add your first dream above. 🌠";
      const { someday, achieved } = splitCollection(items);
      const block = (label, rows) => rows.length
        ? `<h3 class="collection-heading">${esc(label)}</h3>` + rows.map((i) => itemRow(i, section.kind, { dreaming: true })).join("")
        : "";
      $("items-list").innerHTML =
        block("Someday", someday) +
        block("Lived ✨", achieved);
      $("section-toolbar").innerHTML = "";
      return;
    }

    const openN = items.filter((i) => !i.done).length;
    $("section-count").textContent = `${openN} open · ${items.length} total`;
    $("section-empty-hint").textContent = items.length ? "" : "Nothing here yet — add your first item above.";

    const sorted = sortItems(items, section.kind);
    $("items-list").innerHTML = sorted.map((i) => itemRow(i, section.kind)).join("");

    const doneN = items.length - openN;
    $("section-toolbar").innerHTML = doneN
      ? `<span class="hint">${doneN} completed</span><button class="btn-link" id="clear-done">Clear completed</button>`
      : "";
    const cd = $("clear-done");
    if (cd) cd.addEventListener("click", async () => {
      const n = await HimaStore.clearDone(section.id);
      toast(n + " cleared");
      renderSection();
    });
  }
  async function submitItem(e) {
    e.preventDefault();
    const section = sectionById(currentSectionId);
    if (!section) return;
    const title = ($("if-title").value || "").trim();
    if (!title) { $("if-title").focus(); return; }
    const rec = { sectionId: section.id, title, note: ($("if-note") ? $("if-note").value.trim() : "") };
    if (section.kind === "schedule") {
      rec.date = $("if-date").value || null;
      rec.time = $("if-time").value || null;
    }
    if (section.kind === "checklist") {
      const mins = chipValue("mins");
      rec.minutes = mins ? Number(mins) : null;
      rec.energy = chipValue("energy") || null;
      if ($("chips-goal")) rec.goalId = chipValue("goal") || null;
    }
    if (section.kind === "collection") {
      rec.link = $("if-link") ? normalizeLink($("if-link").value) : null;
    }
    if (editingItemId) await HimaStore.updateItem(editingItemId, rec);
    else await HimaStore.addItem(rec);
    resetItemForm(section);
    renderSection();
  }
  async function onItemsClick(e) {
    const btn = e.target.closest("[data-act]");
    const row = e.target.closest(".item-row");
    if (!btn || !row) return;
    const id = row.dataset.id;
    const act = btn.dataset.act;
    if (act === "toggle") {
      const it = await HimaStore.getItem(id);
      const nowDone = !(it && it.done);
      await HimaStore.updateItem(id, { done: nowDone ? 1 : 0, doneAt: nowDone ? Date.now() : null });
      // Celebrate living a dream (only when newly marked on a dreaming section).
      if (nowDone && isDreamingSection(sectionById(currentSectionId))) toast("Lived it. ✨");
      renderSection();
    } else if (act === "del") {
      const it = await HimaStore.getItem(id);
      if (confirm(`Delete "${it ? it.title : "this item"}"?`)) { await HimaStore.deleteItem(id); renderSection(); }
    } else if (act === "edit") {
      const it = await HimaStore.getItem(id);
      if (!it) return;
      const section = sectionById(currentSectionId);
      editingItemId = id;
      buildItemForm(section);
      $("if-title").value = it.title || "";
      if ($("if-note")) $("if-note").value = it.note || "";
      if (section.kind === "schedule") { $("if-date").value = it.date || ""; $("if-time").value = it.time || ""; }
      if (section.kind === "checklist") { setChip("mins", it.minutes); setChip("energy", it.energy); if ($("chips-goal")) setChip("goal", it.goalId); }
      if (section.kind === "collection" && $("if-link")) $("if-link").value = it.link || "";
      $("item-submit").textContent = "Save";
      $("item-cancel").classList.remove("hidden");
      $("if-title").focus();
      window.scrollTo(0, 0);
    }
  }

  // ============ MANAGE SECTIONS ============
  function resetSectionForm() {
    editingSectionId = null;
    $("sec-id").value = "";
    $("sec-icon").value = "";
    $("sec-name").value = "";
    $("sec-kind").value = "checklist";
    $("sec-kind").disabled = false;
    $("sec-submit").textContent = "Add section";
    $("sec-cancel").classList.add("hidden");
  }
  async function renderManage() {
    if (editingSectionId === null) resetSectionForm();
    const items = await HimaStore.getItems();
    const counts = {};
    items.forEach((i) => { counts[i.sectionId] = (counts[i.sectionId] || 0) + 1; });
    $("manage-list").innerHTML = sections.map((s, idx) => `
      <div class="manage-row" data-id="${esc(s.id)}">
        <span class="manage-ico">${esc(s.icon || "📝")}</span>
        <span class="manage-main">
          <span class="manage-name">${esc(s.name)}</span>
          <span class="manage-sub">${esc(isDreamingSection(s) ? "Dreaming collection" : (KIND_LABEL[s.kind] || s.kind))} · ${counts[s.id] || 0} items</span>
        </span>
        <span class="manage-actions">
          <button class="icon-btn" data-act="up" ${idx === 0 ? "disabled" : ""} aria-label="Move up">↑</button>
          <button class="icon-btn" data-act="down" ${idx === sections.length - 1 ? "disabled" : ""} aria-label="Move down">↓</button>
          <button class="icon-btn" data-act="edit" aria-label="Edit">✏️</button>
          <button class="icon-btn" data-act="del" aria-label="Delete">🗑️</button>
        </span>
      </div>`).join("");
  }
  async function submitSection(e) {
    e.preventDefault();
    const name = ($("sec-name").value || "").trim();
    if (!name) { $("sec-name").focus(); return; }
    const rec = { name, icon: ($("sec-icon").value || "").trim() || "📝", kind: $("sec-kind").value };
    if (editingSectionId) await HimaStore.updateSection(editingSectionId, { name: rec.name, icon: rec.icon });
    else await HimaStore.addSection(rec);
    await refreshSections();
    resetSectionForm();
    renderManage();
    toast(editingSectionId ? "Section updated" : "Section added");
  }
  async function onManageClick(e) {
    const btn = e.target.closest("[data-act]");
    const row = e.target.closest(".manage-row");
    if (!btn || !row) return;
    const id = row.dataset.id;
    const act = btn.dataset.act;
    const idx = sections.findIndex((s) => s.id === id);
    if (act === "up" || act === "down") {
      const swap = act === "up" ? idx - 1 : idx + 1;
      if (swap < 0 || swap >= sections.length) return;
      const ids = sections.map((s) => s.id);
      [ids[idx], ids[swap]] = [ids[swap], ids[idx]];
      await HimaStore.reorderSections(ids);
      await refreshSections();
      renderManage();
    } else if (act === "edit") {
      const s = sectionById(id);
      if (!s) return;
      editingSectionId = id;
      $("sec-id").value = id;
      $("sec-icon").value = s.icon || "";
      $("sec-name").value = s.name || "";
      $("sec-kind").value = s.kind;
      $("sec-kind").disabled = true; // kind is fixed after creation to keep items consistent
      $("sec-submit").textContent = "Save";
      $("sec-cancel").classList.remove("hidden");
      $("sec-name").focus();
      window.scrollTo(0, 0);
    } else if (act === "del") {
      const s = sectionById(id);
      const n = (await HimaStore.getItems({ sectionId: id })).length;
      const msg = `Delete "${s ? s.name : "this section"}"${n ? ` and its ${n} item(s)` : ""}? This cannot be undone.`;
      if (!confirm(msg)) return;
      await HimaStore.deleteSection(id);
      if (currentSectionId === id) currentSectionId = null;
      await refreshSections();
      renderManage();
      toast("Section deleted");
    }
  }

  // ============ SETTINGS ============
  async function renderSettings() {
    const hint = $("install-hint");
    const standalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone;
    hint.textContent = standalone
      ? "Installed — Hima OS is on your home screen. 🎉"
      : "Tip: use your browser's “Add to Home Screen” to install Hima OS as an app.";
    $("app-version").textContent = "Hima OS · offline-first · data stored on this device only.";

    // Voice input toggle: disabled entirely when the browser has no speech API.
    const toggle = $("voice-toggle");
    const row = toggle.closest(".toggle-row");
    if (speechSupported()) {
      toggle.disabled = false;
      row.classList.remove("disabled");
      toggle.checked = (await HimaStore.getMeta("voiceEnabled")) === true;
      $("voice-status").textContent = toggle.checked ? "Voice input on" : "Enable voice input";
    } else {
      toggle.checked = false;
      toggle.disabled = true;
      row.classList.add("disabled");
      $("voice-status").textContent = "Not supported on this browser";
    }
  }
  async function onVoiceToggle(e) {
    const on = e.target.checked;
    await HimaStore.setMeta("voiceEnabled", on);
    $("voice-status").textContent = on ? "Voice input on" : "Enable voice input";
    toast(on ? "Voice input on 🎤" : "Voice input off");
  }
  async function exportBackup() {
    const data = await HimaStore.exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `hima-os-backup-${todayISO()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast("Backup exported");
  }
  async function importBackup(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    if (!confirm("Importing replaces ALL current sections and items with the backup. Continue?")) { e.target.value = ""; return; }
    try {
      const payload = JSON.parse(await file.text());
      await HimaStore.importAll(payload);
      await refreshSections();
      currentSectionId = null;
      showView("dashboard");
      toast("Backup imported");
    } catch (err) {
      alert("Could not import: " + (err && err.message ? err.message : "invalid file"));
    }
    e.target.value = "";
  }
  // On-demand, private usage summary — the ONLY place tracking is ever surfaced.
  // Deliberately behind a button so it can't nudge behaviour during the window.
  async function showUsageSummary() {
    const openDays = (await HimaStore.getMeta(USAGE_OPEN)) || [];
    const actionDays = (await HimaStore.getMeta(USAGE_ACTION)) || [];
    const s = usageSummary(openDays, actionDays, dayKey(), WINDOW_DAYS);
    const rate = s.openedDays ? Math.round(s.actionRate * 100) : 0;
    const out = $("usage-output");
    out.textContent =
      `Last ${s.windowDays} days: you opened Hima OS on ${s.openedDays} day(s) ` +
      `and actually did something on ${s.actionDays} of them (${rate}% of opens). ` +
      `Current action streak: ${s.streak} day(s).`;
    out.classList.remove("hidden");
  }
  async function restoreStarters() {
    const added = await HimaStore.restoreStarters();
    await refreshSections();
    renderSettings();
    toast(added ? `${added} starter section(s) restored` : "All starter sections already present");
  }

  // ============ INIT ============
  function onNavClick(e) {
    const btn = e.target.closest(".nav-item");
    if (!btn) return;
    if (btn.dataset.sectionId) openSection(btn.dataset.sectionId);
    else if (btn.dataset.view) showView(btn.dataset.view);
  }
  async function init() {
    await HimaStore.ready();
    // Silent, on-device usage recording: stamp today as an "open day", and wrap
    // store mutations so any data change stamps an "action day" (see above).
    wrapStoreForUsage();
    recordDay(USAGE_OPEN);
    await refreshSections();
    await refreshGoals();

    $("menu-btn").addEventListener("click", toggleDrawer);
    $("drawer-backdrop").addEventListener("click", closeDrawer);
    $("drawer").addEventListener("click", onNavClick);
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeDrawer(); });

    $("item-form").addEventListener("submit", submitItem);
    $("item-cancel").addEventListener("click", () => { const s = sectionById(currentSectionId); if (s) resetItemForm(s); });
    $("items-list").addEventListener("click", onItemsClick);
    // Chip pickers (time/energy): click to select, click the selected one to clear.
    $("item-fields").addEventListener("click", (e) => {
      const chip = e.target.closest(".chip");
      if (!chip) return;
      const name = chip.dataset.chip;
      setChip(name, chipValue(name) === chip.dataset.val ? "" : chip.dataset.val);
    });

    $("section-form").addEventListener("submit", submitSection);
    $("sec-cancel").addEventListener("click", () => { resetSectionForm(); });
    $("manage-list").addEventListener("click", onManageClick);

    $("dash-add-form").addEventListener("submit", submitDashAdd);
    $("dash-todos").addEventListener("click", onDashTodosClick);
    $("dash-donow").addEventListener("click", () => showView("donow"));
    $("donow-mins").addEventListener("click", onDoNowFilterClick);
    $("donow-energy").addEventListener("click", onDoNowFilterClick);
    $("donow-list").addEventListener("click", onDoNowListClick);

    $("dash-checkin").addEventListener("click", () => showView("checkin"));
    $("checkin-form").addEventListener("submit", submitCheckin);
    $("checkin-form").addEventListener("click", onCheckinChipClick);
    $("checkin-today").addEventListener("click", onCheckinTodayClick);
    $("checkin-mic").addEventListener("click", startCheckinVoice);
    $("voice-toggle").addEventListener("change", onVoiceToggle);

    $("vision-form").addEventListener("submit", submitVision);
    $("goal-form").addEventListener("submit", submitGoal);
    $("goal-cancel").addEventListener("click", resetGoalForm);
    // One delegated listener covers vision edit, horizon chips, goal cards and
    // review actions; a separate one handles the per-card add-activity forms.
    $("view-goals").addEventListener("click", onGoalsClick);
    $("goals-list").addEventListener("submit", onAddActivitySubmit);
    $("dash-one-thing").addEventListener("click", () => showView("goals"));

    $("export-backup").addEventListener("click", exportBackup);
    $("import-backup").addEventListener("change", importBackup);
    $("restore-starters").addEventListener("click", restoreStarters);
    $("show-usage").addEventListener("click", showUsageSummary);

    // Dashboard cards + section shortcuts open the matching section.
    document.querySelector("main").addEventListener("click", (e) => {
      const card = e.target.closest("[data-section-id]");
      if (card && !card.classList.contains("nav-item")) openSection(card.dataset.sectionId);
    });

    showView("dashboard");
  }
  init();
})();