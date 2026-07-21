// health-view.js — the Health view (Phase C): exercise, vitamins, meds.
// Extracted from app.js. Receives the shared ctx (window.HimaShell) and
// registers renderHealth into ctx.views so showView can dispatch to it.
// Also exposes healthInsightsContext on ctx (the Insights view + dashboard
// card build their dynamic input tags from it).
window.HealthView = function (ctx) {
  "use strict";
  const { $, esc, toast, todayISO, fmtClock, store } = ctx;
  const {
    EXERCISE_TYPES, KINDS: HEALTH_KINDS, exerciseLabel, exerciseEmoji, medKey,
    exerciseTag, vitaminTag, summariseHealthDays,
  } = window.HealthUtils;
  const { INPUT_TAGS } = window.InsightsUtils;
  const { INPUT_TAG_LABEL, INPUT_TAG_EMOJI } = ctx;

  async function renderHealth() {
    const today = todayISO();
    const [entries, vitamins] = await Promise.all([
      store.getHealth({ date: today }),
      store.getVitamins(),
    ]);
    renderExercisePicker(entries);
    renderVitamins(vitamins, entries);
    $("med-name").value = "";
    $("med-count").value = "1";
    renderHealthToday(entries, vitamins);
  }
  // Exercise chips: multi-select, pre-selected from anything logged today.
  function renderExercisePicker(entries) {
    const done = new Set();
    entries.filter((h) => h.kind === HEALTH_KINDS.exercise).forEach((h) => {
      (Array.isArray(h.types) ? h.types : (h.type ? [h.type] : [])).forEach((t) => done.add(t));
    });
    $("exercise-tags").innerHTML = EXERCISE_TYPES.map((t) =>
      `<button type="button" class="chip${done.has(t.id) ? " selected" : ""}" data-ex="${esc(t.id)}" data-multi="1">${esc(t.emoji)} ${esc(t.label)}</button>`
    ).join("");
  }
  function selectedExerciseTypes() {
    return Array.from($("exercise-tags").querySelectorAll(".chip.selected")).map((c) => c.dataset.ex);
  }
  async function submitExercise(e) {
    e.preventDefault();
    const types = selectedExerciseTypes();
    if (!types.length) { toast("Pick what you did — or skip, rest counts too. 🌿"); return; }
    // One entry per submit captures the day's session set (multi-select).
    await store.addHealth({ date: todayISO(), at: Date.now(), kind: HEALTH_KINDS.exercise, types });
    toast("Logged. Nice moving. 🌿");
    renderHealth();
  }
  // Vitamins: the define-once list, each with a "took it today" toggle.
  function renderVitamins(vitamins, entries) {
    const el = $("vitamin-list");
    if (!vitamins.length) {
      el.innerHTML = `<p class="empty">No vitamins set yet. Add your regulars below. 💊</p>`;
      return;
    }
    const tookToday = new Set(
      entries.filter((h) => h.kind === HEALTH_KINDS.vitamin).map((h) => h.vitId)
    );
    el.innerHTML = vitamins.map((v) => {
      const on = tookToday.has(v.id);
      return `<div class="vitamin-item" data-vit="${esc(v.id)}">
        <button type="button" class="vitamin-tick${on ? " on" : ""}" data-act="toggle-vit" aria-pressed="${on ? "true" : "false"}">
          <span class="vitamin-emoji">${esc(v.emoji || "💊")}</span>
          <span class="vitamin-name">${esc(v.name)}</span>
          <span class="vitamin-check">${on ? "✓" : ""}</span>
        </button>
        <button class="icon-btn" data-act="del-vit" aria-label="Remove vitamin">🗑️</button>
      </div>`;
    }).join("");
  }
  async function onVitaminListClick(e) {
    const item = e.target.closest(".vitamin-item");
    if (!item) return;
    const vitId = item.dataset.vit;
    const toggle = e.target.closest('[data-act="toggle-vit"]');
    const del = e.target.closest('[data-act="del-vit"]');
    if (toggle) {
      const today = todayISO();
      const entries = await store.getHealth({ date: today });
      const existing = entries.find((h) => h.kind === HEALTH_KINDS.vitamin && h.vitId === vitId);
      if (existing) await store.deleteHealth(existing.id);
      else await store.addHealth({ date: today, at: Date.now(), kind: HEALTH_KINDS.vitamin, vitId });
      renderHealth();
    } else if (del) {
      await store.deleteVitamin(vitId);
      toast("Removed from your list.");
      renderHealth();
    }
  }
  async function submitVitaminDef(e) {
    e.preventDefault();
    const name = ($("vitamin-name").value || "").trim();
    if (!name) { toast("Give it a name to add it 💊"); return; }
    await store.addVitamin({ name });
    $("vitamin-name").value = "";
    renderHealth();
  }
  async function submitMed(e) {
    e.preventDefault();
    const name = ($("med-name").value || "").trim();
    if (!name) { toast("Name it to log it."); return; }
    const raw = ($("med-count").value || "").trim();
    const count = Math.max(1, Math.round(Number(raw) || 1));
    await store.addHealth({ date: todayISO(), at: Date.now(), kind: HEALTH_KINDS.med, name, count });
    toast("Logged. 🌿");
    renderHealth();
  }
  // One neutral line per health entry logged today, newest first, with delete.
  function healthRow(h, vitamins) {
    let ico = "🩺", title = "", meta = "";
    if (h.kind === HEALTH_KINDS.exercise) {
      const types = Array.isArray(h.types) ? h.types : (h.type ? [h.type] : []);
      ico = types.length ? exerciseEmoji(types[0]) : "🏃";
      title = types.map(exerciseLabel).join(", ") || "Exercise";
    } else if (h.kind === HEALTH_KINDS.vitamin) {
      const v = (vitamins || []).find((x) => x.id === h.vitId);
      ico = (v && v.emoji) || "💊";
      title = (v && v.name) || "Vitamin";
    } else if (h.kind === HEALTH_KINDS.med) {
      ico = "💊";
      title = h.name || "Medication";
      const c = Number(h.count);
      if (Number.isFinite(c) && c > 0) meta = "×" + c;
    }
    return `<div class="checkin-row" data-id="${esc(h.id)}">
      <span class="checkin-mood-ico">${esc(ico)}</span>
      <div class="checkin-main">
        <div class="checkin-title">${esc(title)}</div>
        ${meta ? `<div class="checkin-meta">${esc(meta)}</div>` : ""}
      </div>
      <span class="checkin-time">${esc(fmtClock(h.at))}</span>
      <div class="item-actions"><button class="icon-btn" data-act="del-health" aria-label="Delete">🗑️</button></div>
    </div>`;
  }
  function renderHealthToday(entries, vitamins) {
    const rows = (entries || []).slice().sort((a, b) => (b.at || 0) - (a.at || 0));
    $("health-today").innerHTML = rows.length
      ? rows.map((h) => healthRow(h, vitamins)).join("")
      : `<p class="empty">Nothing logged today. Whenever you like. 🌿</p>`;
  }
  async function onHealthTodayClick(e) {
    const btn = e.target.closest('[data-act="del-health"]');
    const row = e.target.closest(".checkin-row");
    if (!btn || !row) return;
    await store.deleteHealth(row.dataset.id);
    renderHealth();
  }

  // Build the dynamic insights context: health day-summaries plus the extended
  // input-tag list (static tags + exercise types + defined vitamins + seen med
  // names) so health inputs get labels/emoji and correlate like check-in tags.
  async function healthInsightsContext() {
    const [health, vitamins] = await Promise.all([
      store.getHealth(),
      store.getVitamins(),
    ]);
    const healthDays = summariseHealthDays(health);
    const inputTags = INPUT_TAGS.slice();
    EXERCISE_TYPES.forEach((t) => inputTags.push({ id: exerciseTag(t.id), label: t.label, emoji: t.emoji }));
    (vitamins || []).forEach((v) => inputTags.push({ id: vitaminTag(v.id), label: v.name, emoji: v.emoji || "💊" }));
    // Distinct meds seen (by normalised key), labelled from their first display form.
    const medSeen = new Map();
    health.filter((h) => h.kind === HEALTH_KINDS.med && h.name).forEach((h) => {
      const key = medKey(h.name);
      if (!medSeen.has(key)) medSeen.set(key, String(h.name).trim());
    });
    medSeen.forEach((name) => inputTags.push({ id: "med:" + medKey(name), label: name, emoji: "💊" }));
    // Merge these into the label/emoji lookups the render helpers read.
    inputTags.forEach((t) => { INPUT_TAG_LABEL[t.id] = t.label; INPUT_TAG_EMOJI[t.id] = t.emoji; });
    return { healthDays, inputTags };
  }

  ctx.views.health = renderHealth;
  ctx.healthInsightsContext = healthInsightsContext;

  return {
    wire() {
      $("exercise-form").addEventListener("submit", submitExercise);
      $("exercise-tags").addEventListener("click", (e) => {
        const chip = e.target.closest(".chip[data-ex]");
        if (chip) chip.classList.toggle("selected");
      });
      $("vitamin-def-form").addEventListener("submit", submitVitaminDef);
      $("vitamin-list").addEventListener("click", onVitaminListClick);
      $("med-form").addEventListener("submit", submitMed);
      $("health-today").addEventListener("click", onHealthTodayClick);
    },
  };
};
