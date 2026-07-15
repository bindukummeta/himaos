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
  const VIEW_KEYS = ["dashboard", "donow", "checkin", "section", "manage", "settings"];
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

  // ============ DASHBOARD ============
  async function renderDashboard() {
    const hr = new Date().getHours();
    const greet = hr < 12 ? "Good morning" : hr < 18 ? "Good afternoon" : "Good evening";
    $("dash-greeting").textContent = greet + " 👋";
    $("dash-date").textContent = new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" });

    const checkins = await HimaStore.getCheckins();
    renderDashCheckin(checkins);

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
      .sort((a, b) => (a.order || 0) - (b.order || 0))
      .slice(0, 8);
    $("dash-todos").innerHTML = todos.length
      ? todos.map((i) => dashRow(i)).join("")
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
  function dashRow(i) {
    const sec = sectionById(i.sectionId);
    const when = fmtWhen(i);
    const meta = [when, i.note].filter(Boolean).join(" · ");
    return `<div class="mini-row">
      <span class="mini-ico">${esc(sec ? sec.icon : "•")}</span>
      <span class="mini-main"><span class="mini-title">${esc(i.title)}</span>${meta ? `<span class="mini-meta">${esc(meta)}</span>` : ""}</span>
    </div>`;
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
      if (section.kind === "checklist") { setChip("mins", it.minutes); setChip("energy", it.energy); }
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
    await refreshSections();

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

    $("export-backup").addEventListener("click", exportBackup);
    $("import-backup").addEventListener("change", importBackup);
    $("restore-starters").addEventListener("click", restoreStarters);

    // Dashboard cards + section shortcuts open the matching section.
    document.querySelector("main").addEventListener("click", (e) => {
      const card = e.target.closest("[data-section-id]");
      if (card && !card.classList.contains("nav-item")) openSection(card.dataset.sectionId);
    });

    showView("dashboard");
  }
  init();
})();