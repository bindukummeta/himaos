// section-view.js — the generic section view (checklist/schedule/collection,
// incl. dreaming/reading split collections) plus Manage sections. Extracted
// from app.js. Registers renderSection + renderManage into ctx.views.
window.SectionView = function (ctx) {
  "use strict";
  const { $, esc, toast, fmtWhen, fmtStamp, normalizeLink, store } = ctx;
  const { KIND_LABEL, ENERGY_LABEL } = ctx;
  const { TIME_CHOICES, ENERGY_CHOICES, fmtMinutes } = window.DoNowUtils;
  const { isDreamingSection, isReadingSection, usesSplitView, splitLabels, collectionStats, splitCollection } = window.DreamingUtils;
  const { goalsByHorizon } = window.GoalsUtils;

  function taskTags(i) {
    return [fmtMinutes(i.minutes), i.energy ? ENERGY_LABEL[i.energy] : ""].filter(Boolean).join(" · ");
  }

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
      const linkable = goalsByHorizon(ctx.goals);
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
    ctx.editingItemId = null;
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
    // Optional per-section wording (dreams vs books); falls back to dream defaults.
    const L = opts.labels || null;
    const when = kind === "schedule" ? fmtWhen(i) : "";
    const tags = kind === "checklist" ? taskTags(i) : "";
    // On split collections, a done item shows when it was completed.
    const donePrefix = L ? L.livedPrefix : "Lived";
    const lived = dreaming && i.done && i.doneAt ? donePrefix + " " + fmtStamp(i.doneAt) : "";
    const meta = [when, tags, i.note, lived].filter(Boolean).join(" · ");
    // Collections show an optional link as its own clickable line (safe href).
    const link = kind === "collection" && i.link
      ? `<a class="item-link" href="${esc(i.link)}" target="_blank" rel="noopener noreferrer">${esc(prettyLink(i.link))} ↗</a>`
      : "";
    // Split collections reframe the tick (dreams: "mark as lived ✨"; books: "finished 📚").
    const doneGlyph = L ? L.checkGlyph : "✨";
    const checkGlyph = i.done ? (dreaming ? doneGlyph : "✓") : "";
    const checkLabel = dreaming ? (L ? L.checkLabel : "Mark as lived") : "Toggle done";
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
    const section = ctx.sectionById(ctx.currentSectionId);
    if (!section) { ctx.showView("dashboard"); return; }
    $("section-title").innerHTML = `${esc(section.icon || "📝")} ${esc(section.name)}`;
    if (ctx.editingItemId === null) resetItemForm(section);

    const items = await store.getItems({ sectionId: section.id });

    if (usesSplitView(section)) {
      // Dreaming/reading collections split into an "open" bucket and a
      // celebratory "done" bucket, with wording tuned per section (dreams are
      // "Someday/Lived ✨"; books are "Currently reading/Finished 📚").
      const L = splitLabels(section);
      const reading = isReadingSection(section);
      const stats = collectionStats(items);
      $("section-count").textContent = stats.total
        ? `${stats.achieved} ${reading ? "finished" : "lived"} · ${stats.someday} ${reading ? "reading" : "someday"}`
        : "";
      $("section-empty-hint").textContent = stats.total ? "" : L.emptyHint;
      const { someday, achieved } = splitCollection(items);
      const rowOpts = { dreaming: true, labels: L };
      const block = (label, rows) => rows.length
        ? `<h3 class="collection-heading">${esc(label)}</h3>` + rows.map((i) => itemRow(i, section.kind, rowOpts)).join("")
        : "";
      $("items-list").innerHTML =
        block(L.someday, someday) +
        block(L.achieved, achieved);
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
      const n = await store.clearDone(section.id);
      toast(n + " cleared");
      renderSection();
    });
  }
  async function submitItem(e) {
    e.preventDefault();
    const section = ctx.sectionById(ctx.currentSectionId);
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
    if (ctx.editingItemId) await store.updateItem(ctx.editingItemId, rec);
    else await store.addItem(rec);
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
      const it = await store.getItem(id);
      const nowDone = !(it && it.done);
      await store.updateItem(id, { done: nowDone ? 1 : 0, doneAt: nowDone ? Date.now() : null });
      // Celebrate completing a split-collection item (dreams: "Lived it. ✨";
      // books: "Finished it. 📚"), only when newly marked done.
      const sec = ctx.sectionById(ctx.currentSectionId);
      if (nowDone && usesSplitView(sec)) toast(splitLabels(sec).doneToast);
      renderSection();
    } else if (act === "del") {
      const it = await store.getItem(id);
      if (confirm(`Delete "${it ? it.title : "this item"}"?`)) { await store.deleteItem(id); renderSection(); }
    } else if (act === "edit") {
      const it = await store.getItem(id);
      if (!it) return;
      const section = ctx.sectionById(ctx.currentSectionId);
      ctx.editingItemId = id;
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

  // ---- Manage sections ----
  function resetSectionForm() {
    ctx.editingSectionId = null;
    $("sec-id").value = "";
    $("sec-icon").value = "";
    $("sec-name").value = "";
    $("sec-kind").value = "checklist";
    $("sec-kind").disabled = false;
    $("sec-submit").textContent = "Add section";
    $("sec-cancel").classList.add("hidden");
  }
  async function renderManage() {
    if (ctx.editingSectionId === null) resetSectionForm();
    const items = await store.getItems();
    const counts = {};
    items.forEach((i) => { counts[i.sectionId] = (counts[i.sectionId] || 0) + 1; });
    $("manage-list").innerHTML = ctx.sections.map((s, idx) => `
      <div class="manage-row" data-id="${esc(s.id)}">
        <span class="manage-ico">${esc(s.icon || "📝")}</span>
        <span class="manage-main">
          <span class="manage-name">${esc(s.name)}</span>
          <span class="manage-sub">${esc(isDreamingSection(s) ? "Dreaming collection" : isReadingSection(s) ? "Reading collection" : (KIND_LABEL[s.kind] || s.kind))} · ${counts[s.id] || 0} items</span>
        </span>
        <span class="manage-actions">
          <button class="icon-btn" data-act="up" ${idx === 0 ? "disabled" : ""} aria-label="Move up">↑</button>
          <button class="icon-btn" data-act="down" ${idx === ctx.sections.length - 1 ? "disabled" : ""} aria-label="Move down">↓</button>
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
    if (ctx.editingSectionId) await store.updateSection(ctx.editingSectionId, { name: rec.name, icon: rec.icon });
    else await store.addSection(rec);
    await ctx.refreshSections();
    resetSectionForm();
    renderManage();
    toast(ctx.editingSectionId ? "Section updated" : "Section added");
  }
  async function onManageClick(e) {
    const btn = e.target.closest("[data-act]");
    const row = e.target.closest(".manage-row");
    if (!btn || !row) return;
    const id = row.dataset.id;
    const act = btn.dataset.act;
    const idx = ctx.sections.findIndex((s) => s.id === id);
    if (act === "up" || act === "down") {
      const swap = act === "up" ? idx - 1 : idx + 1;
      if (swap < 0 || swap >= ctx.sections.length) return;
      const ids = ctx.sections.map((s) => s.id);
      [ids[idx], ids[swap]] = [ids[swap], ids[idx]];
      await store.reorderSections(ids);
      await ctx.refreshSections();
      renderManage();
    } else if (act === "edit") {
      const s = ctx.sectionById(id);
      if (!s) return;
      ctx.editingSectionId = id;
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
      const s = ctx.sectionById(id);
      const n = (await store.getItems({ sectionId: id })).length;
      const msg = `Delete "${s ? s.name : "this section"}"${n ? ` and its ${n} item(s)` : ""}? This cannot be undone.`;
      if (!confirm(msg)) return;
      await store.deleteSection(id);
      if (ctx.currentSectionId === id) ctx.currentSectionId = null;
      await ctx.refreshSections();
      renderManage();
      toast("Section deleted");
    }
  }

  ctx.views.section = renderSection;
  ctx.views.manage = renderManage;

  return {
    wire() {
      $("item-form").addEventListener("submit", submitItem);
      $("item-cancel").addEventListener("click", () => { const s = ctx.sectionById(ctx.currentSectionId); if (s) resetItemForm(s); });
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
    },
  };
};
