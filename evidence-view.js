// evidence-view.js — the Evidence Vault (Phase D). Receives the shared ctx
// (window.HimaShell) and registers renderEvidence into ctx.views. Capture form
// (date + one-line title + collapsible reflection fields + proof-tags), a
// weekly view (written entries + read-only auto-pulled "dones" + an
// encouraging "despite a rough week" line), and an all-entries list filterable
// by date range. Editing reuses ctx.editingEvidenceId (added to app-shell).
window.EvidenceView = function (ctx) {
  "use strict";
  const { $, esc, toast, todayISO, fmtDate, fmtClock, store } = ctx;
  const {
    PROOF_TAGS, proofTagLabel, proofTagEmoji,
    weekKeyForDate, filterEntries, entriesForWeek,
    weeklyDones, weekConditions, buildDespiteLine,
  } = window.EvidenceUtils;
  const { currentWeekKey, shiftWeekKey } = window.GoalsUtils;

  let weekKey = currentWeekKey(); // the week the weekly panel is showing
  let etab = "week"; // "week" | "all"

  // The five optional reflection fields, in display order: [id, elementId].
  const DETAIL_FIELDS = [
    ["challenges", "evidence-challenges"],
    ["setbacks", "evidence-setbacks"],
    ["achievements", "evidence-achievements"],
    ["lessons", "evidence-lessons"],
    ["whatItProves", "evidence-proves"],
  ];

  // ---- capture form ----
  function buildProofChips(selected) {
    const sel = new Set(selected || []);
    $("evidence-proof-tags").innerHTML = PROOF_TAGS.map((t) =>
      `<button type="button" class="chip${sel.has(t.id) ? " selected" : ""}" data-proof="${esc(t.id)}" data-multi="1">${esc(t.emoji)} ${esc(t.label)}</button>`
    ).join("");
  }
  function resetForm() {
    ctx.editingEvidenceId = null;
    $("evidence-id").value = "";
    $("evidence-date").value = todayISO();
    $("evidence-title").value = "";
    DETAIL_FIELDS.forEach(([, elId]) => { $(elId).value = ""; });
    buildProofChips([]);
    setDetailsOpen(false);
    $("evidence-submit").textContent = "Save";
    $("evidence-cancel").classList.add("hidden");
  }
  function setDetailsOpen(open) {
    $("evidence-details").classList.toggle("open", open);
    $("evidence-more-btn").setAttribute("aria-expanded", open ? "true" : "false");
    $("evidence-more-btn").textContent = open ? "Fewer details ▴" : "More details ▾";
  }
  function readForm() {
    const rec = {
      date: $("evidence-date").value || todayISO(),
      title: ($("evidence-title").value || "").trim(),
      proofTags: Array.from($("evidence-proof-tags").querySelectorAll(".chip.selected")).map((b) => b.dataset.proof),
    };
    DETAIL_FIELDS.forEach(([id, elId]) => { rec[id] = ($(elId).value || "").trim(); });
    return rec;
  }
  async function submitEvidence(e) {
    e.preventDefault();
    const rec = readForm();
    if (!rec.title) { toast("A one-line note is all it takes 📜"); return; }
    if (ctx.editingEvidenceId) {
      await store.updateEvidence(ctx.editingEvidenceId, rec);
      toast("Updated. 📜");
    } else {
      await store.addEvidence(rec);
      toast("Saved. That counts. 📜");
    }
    resetForm();
    renderEvidence();
  }
  async function startEdit(id) {
    const rec = await store.getEvidenceOne(id);
    if (!rec) return;
    ctx.editingEvidenceId = id;
    $("evidence-id").value = id;
    $("evidence-date").value = rec.date || todayISO();
    $("evidence-title").value = rec.title || "";
    DETAIL_FIELDS.forEach(([fid, elId]) => { $(elId).value = rec[fid] || ""; });
    buildProofChips(rec.proofTags || []);
    setDetailsOpen(true);
    $("evidence-submit").textContent = "Update";
    $("evidence-cancel").classList.remove("hidden");
    window.scrollTo(0, 0);
  }

  // ---- rendering ----
  function detailBits(e) {
    const bits = [];
    if (e.challenges) bits.push("Challenge: " + e.challenges);
    if (e.setbacks) bits.push("Setback: " + e.setbacks);
    if (e.achievements) bits.push("Win: " + e.achievements);
    if (e.lessons) bits.push("Lesson: " + e.lessons);
    if (e.whatItProves) bits.push("Proves: " + e.whatItProves);
    return bits;
  }
  function writtenRow(e) {
    const tags = (e.proofTags || []).map((t) => `<span class="proof-tag">${esc(proofTagEmoji(t))} ${esc(proofTagLabel(t))}</span>`).join("");
    const bits = detailBits(e);
    const meta = [fmtDate(e.date), tags].filter(Boolean).join(" · ");
    return `<div class="evidence-item evidence-written" data-id="${esc(e.id)}">
      <div class="evidence-main">
        <div class="evidence-title-row">${esc(e.title)}</div>
        <div class="evidence-meta">${meta}</div>
        ${bits.length ? `<ul class="evidence-details-list">${bits.map((b) => `<li>${esc(b)}</li>`).join("")}</ul>` : ""}
      </div>
      <div class="item-actions">
        <button class="icon-btn" data-act="edit-ev" aria-label="Edit">✏️</button>
        <button class="icon-btn" data-act="del-ev" aria-label="Delete">🗑️</button>
      </div>
    </div>`;
  }
  function autoRow(d) {
    const via = d.goalTitle ? ` · ${esc(d.goalTitle)}` : "";
    return `<div class="evidence-item evidence-auto">
      <span class="evidence-auto-ico">${esc(d.emoji)}</span>
      <div class="evidence-main"><div class="evidence-title-row">${esc(d.title || "Done")}</div><div class="evidence-meta">${esc(d.source)}${via}</div></div>
    </div>`;
  }

  async function renderEvidence() {
    if (ctx.editingEvidenceId == null) resetForm();
    // tab visibility
    $("evidence-week").classList.toggle("hidden", etab !== "week");
    $("evidence-all").classList.toggle("hidden", etab !== "all");
    document.querySelectorAll(".tab-btn[data-etab]").forEach((b) =>
      b.classList.toggle("active", b.dataset.etab === etab));

    const entries = await store.getEvidence();
    if (etab === "all") { renderAll(entries); return; }
    await renderWeek(entries);
  }
  function renderAll(entries) {
    const from = $("evidence-from").value || null;
    const to = $("evidence-to").value || null;
    const rows = filterEntries(entries, from, to);
    $("evidence-list").innerHTML = rows.length
      ? rows.map(writtenRow).join("")
      : `<p class="empty">Nothing here yet. Add a piece of evidence above. 📜</p>`;
  }
  async function renderWeek(entries) {
    $("evidence-week-label").textContent = weekKey;
    const written = entriesForWeek(entries, weekKey);
    const [items, goals, checkins, health] = await Promise.all([
      store.getItems(), store.getGoals(), store.getCheckins(), store.getHealth(),
    ]);
    const dones = weeklyDones(items, goals, weekKey);
    const conditions = weekConditions(checkins, health, weekKey);
    const despite = buildDespiteLine(conditions, dones.length, written.length);
    $("evidence-despite").textContent = despite || "";
    $("evidence-despite").classList.toggle("hidden", !despite);
    $("evidence-week-written").innerHTML = written.length
      ? written.map(writtenRow).join("")
      : `<p class="empty">No written evidence this week yet. 🌱</p>`;
    $("evidence-week-auto").innerHTML = dones.length
      ? dones.map(autoRow).join("")
      : `<p class="empty">Nothing auto-pulled for this week.</p>`;
  }

  function onFormClick(e) {
    const chip = e.target.closest(".chip[data-proof]");
    if (chip) chip.classList.toggle("selected");
  }
  async function onListClick(e) {
    const row = e.target.closest(".evidence-item[data-id]");
    if (!row) return;
    const id = row.dataset.id;
    if (e.target.closest('[data-act="edit-ev"]')) { startEdit(id); return; }
    if (e.target.closest('[data-act="del-ev"]')) {
      await store.deleteEvidence(id);
      toast("Removed.");
      renderEvidence();
    }
  }

  ctx.views.evidence = renderEvidence;

  return {
    wire() {
      $("evidence-form").addEventListener("submit", submitEvidence);
      $("evidence-form").addEventListener("click", onFormClick);
      $("evidence-more-btn").addEventListener("click", () => setDetailsOpen(!$("evidence-details").classList.contains("open")));
      $("evidence-cancel").addEventListener("click", resetForm);
      $("evidence-week-prev").addEventListener("click", () => { weekKey = shiftWeekKey(weekKey, -1); renderEvidence(); });
      $("evidence-week-next").addEventListener("click", () => { weekKey = shiftWeekKey(weekKey, 1); renderEvidence(); });
      $("evidence-list").addEventListener("click", onListClick);
      $("evidence-week-written").addEventListener("click", onListClick);
      $("evidence-from").addEventListener("change", renderEvidence);
      $("evidence-to").addEventListener("change", renderEvidence);
      $("evidence-filter-clear").addEventListener("click", () => { $("evidence-from").value = ""; $("evidence-to").value = ""; renderEvidence(); });
      document.querySelectorAll(".tab-btn[data-etab]").forEach((b) =>
        b.addEventListener("click", () => { etab = b.dataset.etab; renderEvidence(); }));
    },
  };
};
