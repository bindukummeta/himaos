// checkin-view.js — the daily check-in (Step 2) + neutral weight metric.
// Extracted from app.js. Registers renderCheckin into ctx.views (it renders the
// weight list too). Voice input uses the browser Web Speech API, gated behind
// the Settings toggle + browser support.
window.CheckinView = function (ctx) {
  "use strict";
  const { $, esc, toast, todayISO, fmtDate, fmtClock, store } = ctx;
  const { ENERGY_LABEL } = ctx;
  const { ENERGY_CHOICES } = window.DoNowUtils;
  const { MOOD_CHOICES, SLEEP_CHOICES, CONTEXT_TAGS, FOOD_TAGS, moodEmoji, moodLabel, sleepLabel, sleepEmoji, tagLabel, foodTagLabel, checkinsOn, checkinStreak } = window.CheckinUtils;
  const { parseCheckinSpeech } = window.VoiceUtils;
  function speechSupported() {
    return typeof (window.SpeechRecognition || window.webkitSpeechRecognition) === "function";
  }

  // Build the capture form fresh each time the view opens (clears selections).
  function buildCheckinForm() {
    $("checkin-mood").innerHTML = MOOD_CHOICES.map((m) =>
      `<button type="button" class="chip" data-cgroup="mood" data-val="${esc(m.val)}"><span class="mood-emoji">${esc(m.emoji)}</span><span class="mood-label">${esc(m.label)}</span></button>`
    ).join("");
    $("checkin-mood").dataset.val = "";
    $("checkin-energy").innerHTML = ENERGY_CHOICES.map((e) =>
      `<button type="button" class="chip" data-cgroup="energy" data-val="${esc(e)}">${esc(ENERGY_LABEL[e])}</button>`
    ).join("");
    $("checkin-energy").dataset.val = "";
    $("checkin-sleep").innerHTML = SLEEP_CHOICES.map((s) =>
      `<button type="button" class="chip" data-cgroup="sleep" data-val="${esc(s.id)}">${esc(s.emoji)} ${esc(s.label)}</button>`
    ).join("");
    $("checkin-sleep").dataset.val = "";
    $("checkin-tags").innerHTML = CONTEXT_TAGS.map((t) =>
      `<button type="button" class="chip" data-cgroup="tags" data-val="${esc(t.id)}" data-multi="1">${esc(t.emoji)} ${esc(t.label)}</button>`
    ).join("");
    $("checkin-food-tags").innerHTML = FOOD_TAGS.map((t) =>
      `<button type="button" class="chip" data-cgroup="foodTags" data-val="${esc(t.id)}" data-multi="1">${esc(t.emoji)} ${esc(t.label)}</button>`
    ).join("");
    $("checkin-food").value = "";
    $("checkin-note").value = "";
  }
  function checkinRow(c) {
    const food = [c.food, (c.foodTags || []).map(foodTagLabel).join(", ")].filter(Boolean).join(" — ");
    const bits = [
      c.energy ? ENERGY_LABEL[c.energy] : "",
      c.sleep ? sleepEmoji(c.sleep) + " " + sleepLabel(c.sleep) : "",
      (c.tags || []).map(tagLabel).join(", "),
      food ? "🍽️ " + food : "",
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
    const checkins = await store.getCheckins();
    const today = todayISO();
    const mine = checkinsOn(checkins, today);
    const streak = checkinStreak(checkins, today);
    $("checkin-streak").textContent = streak ? `${streak}-day streak 🔥` : "";
    $("checkin-today").innerHTML = mine.length
      ? mine.map((c) => checkinRow(c)).join("")
      : `<p class="empty">No check-ins yet today. Whenever you're ready. 🌿</p>`;

    // The mic only appears once voice is enabled in Settings AND supported here.
    const mic = $("checkin-mic");
    const on = speechSupported() && (await store.getMeta("voiceEnabled")) === true;
    mic.classList.toggle("hidden", !on);

    await renderWeight();
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
  // Read the food line + food chips off the check-in form.
  function readCheckinFood() {
    const food = ($("checkin-food").value || "").trim();
    const foodTags = Array.from($("checkin-food-tags").querySelectorAll(".chip.selected")).map((b) => b.dataset.val);
    return { food, foodTags };
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
    const sleep = $("checkin-sleep").dataset.val || null;
    const { food, foodTags } = readCheckinFood();
    if (!mood && !energy && !sleep && !food && !foodTags.length) { toast("Tap a mood or energy first 💗"); return; }
    const tags = Array.from($("checkin-tags").querySelectorAll(".chip.selected")).map((b) => b.dataset.val);
    const note = ($("checkin-note").value || "").trim();
    await store.addCheckin({ date: todayISO(), at: Date.now(), mood, energy, sleep, tags, food, foodTags, note });
    toast("Logged. Thanks for checking in. 💗");
    renderCheckin();
  }
  async function onCheckinTodayClick(e) {
    const btn = e.target.closest('[data-act="del-checkin"]');
    const row = e.target.closest(".checkin-row");
    if (!btn || !row) return;
    await store.deleteCheckin(row.dataset.id);
    renderCheckin();
  }

  // ---- weight (neutral trend; number + how the day felt) ----
  // A single recent-entries list, most recent first. The delta vs the previous
  // entry is shown plainly (↑/↓/•) with no goal language — anti-guilt by design.
  function weightRow(w, prevKg) {
    let delta = "";
    if (typeof w.kg === "number" && typeof prevKg === "number") {
      const d = w.kg - prevKg;
      const arrow = d > 0 ? "↑" : d < 0 ? "↓" : "•";
      delta = `${arrow} ${Math.abs(d).toFixed(1)}`;
    }
    const meta = [fmtDate(w.date), delta, w.feeling].filter(Boolean).join(" · ");
    return `<div class="checkin-row" data-id="${esc(w.id)}">
      <span class="checkin-mood-ico">⚖️</span>
      <div class="checkin-main">
        <div class="checkin-title">${esc(typeof w.kg === "number" ? w.kg.toFixed(1) + " kg" : "—")}</div>
        ${meta ? `<div class="checkin-meta">${esc(meta)}</div>` : ""}
      </div>
      <span class="checkin-time">${esc(fmtClock(w.at))}</span>
      <div class="item-actions"><button class="icon-btn" data-act="del-weight" aria-label="Delete">🗑️</button></div>
    </div>`;
  }
  async function renderWeight() {
    $("weight-kg").value = "";
    $("weight-feeling").value = "";
    const weights = await store.getWeights(); // ascending by `at`
    const recent = weights.slice(-14).reverse(); // newest first, last ~2 weeks
    $("weight-list").innerHTML = recent.length
      ? recent.map((w, i) => {
          // prev = the entry chronologically before this one (next in the reversed list).
          const prev = recent[i + 1];
          return weightRow(w, prev ? prev.kg : undefined);
        }).join("")
      : `<p class="empty">No weight logged yet. Whenever you like. 🌿</p>`;
  }
  async function submitWeight(e) {
    e.preventDefault();
    const raw = ($("weight-kg").value || "").trim();
    const kg = raw === "" ? null : Number(raw);
    if (kg == null || !isFinite(kg) || kg <= 0) { toast("Pop in a weight to log it ⚖️"); return; }
    const feeling = ($("weight-feeling").value || "").trim();
    await store.addWeight({ date: todayISO(), at: Date.now(), kg, feeling });
    toast("Logged. Just a data point. 🌿");
    renderWeight();
  }
  async function onWeightListClick(e) {
    const btn = e.target.closest('[data-act="del-weight"]');
    const row = e.target.closest(".checkin-row");
    if (!btn || !row) return;
    await store.deleteWeight(row.dataset.id);
    renderWeight();
  }

  ctx.views.checkin = renderCheckin;

  return {
    wire() {
      $("checkin-form").addEventListener("submit", submitCheckin);
      $("checkin-form").addEventListener("click", onCheckinChipClick);
      $("checkin-today").addEventListener("click", onCheckinTodayClick);
      $("checkin-mic").addEventListener("click", startCheckinVoice);
      $("weight-form").addEventListener("submit", submitWeight);
      $("weight-list").addEventListener("click", onWeightListClick);
    },
  };
};
