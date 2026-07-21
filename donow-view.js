// donow-view.js — the "Do Now" picker (Step 1). Extracted from app.js.
// Registers renderDoNow into ctx.views. Filter state (time/energy) persists
// within the module closure so returning to the view keeps your last choice.
window.DoNowView = function (ctx) {
  "use strict";
  const { $, esc, toast, store } = ctx;
  const { ENERGY_LABEL } = ctx;
  const { TIME_CHOICES, ENERGY_CHOICES, fmtMinutes, taskFits, donowSort } = window.DoNowUtils;

  function taskTags(i) {
    return [fmtMinutes(i.minutes), i.energy ? ENERGY_LABEL[i.energy] : ""].filter(Boolean).join(" · ");
  }

  // Filter state persists within the session. "" = Any.
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
    const sec = ctx.sectionById(i.sectionId);
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
    const items = await store.getItems();
    const kindOf = {};
    ctx.sections.forEach((s) => { kindOf[s.id] = s.kind; });
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
    await store.updateItem(row.dataset.id, { done: 1, doneAt: Date.now() });
    toast("Done — nice. ✨");
    renderDoNow();
  }

  ctx.views.donow = renderDoNow;

  return {
    wire() {
      $("donow-mins").addEventListener("click", onDoNowFilterClick);
      $("donow-energy").addEventListener("click", onDoNowFilterClick);
      $("donow-list").addEventListener("click", onDoNowListClick);
    },
  };
};
