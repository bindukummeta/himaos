// dashboard-view.js — the home dashboard. Extracted from app.js.
// Registers renderDashboard into ctx.views. Pulls the insights summary card
// from ctx.renderDashInsights (Insights view).
window.DashboardView = function (ctx) {
  "use strict";
  const { $, esc, toast, todayISO, fmtWhen, store } = ctx;
  const { ENERGY_LABEL } = ctx;
  const { moodEmoji, moodLabel, checkinsOn, checkinStreak } = window.CheckinUtils;
  const { currentWeekKey, pickOneThing } = window.GoalsUtils;

  async function renderDashboard() {
    const hr = new Date().getHours();
    const greet = hr < 12 ? "Good morning" : hr < 18 ? "Good afternoon" : "Good evening";
    $("dash-greeting").textContent = greet + " 👋";
    $("dash-date").textContent = new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" });

    const checkins = await store.getCheckins();
    renderDashCheckin(checkins);
    await ctx.renderDashInsights(checkins);

    renderDashAddSections();

    await ctx.refreshGoals();
    await renderDashOneThing();

    const items = await store.getItems();
    const kindOf = {};
    ctx.sections.forEach((s) => { kindOf[s.id] = s.kind; });
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

    $("dash-sections").innerHTML = ctx.sections.map((s) => {
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
    const map = await ctx.tasksByGoal();
    const pick = pickOneThing(ctx.goals, map, currentWeekKey());
    if (!pick) { tile.classList.add("hidden"); return; }
    const what = pick.activity ? pick.activity.title : pick.task.title;
    $("one-thing-sub").textContent = `${what} — toward “${pick.goal.title}”`;
    tile.classList.remove("hidden");
  }
  function dashRow(i, opts) {
    opts = opts || {};
    const sec = ctx.sectionById(i.sectionId);
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
    sel.innerHTML = ctx.sections.map((s) =>
      `<option value="${esc(s.id)}">${esc(s.icon || "📝")} ${esc(s.name)}</option>`
    ).join("");
    if (prev && ctx.sections.some((s) => s.id === prev)) sel.value = prev;
  }
  // Add an item to the chosen section from the dashboard. Schedule/collection
  // sections just get a plain title here; richer fields stay in the section view.
  async function submitDashAdd(e) {
    e.preventDefault();
    const title = ($("dash-add-title").value || "").trim();
    if (!title) { $("dash-add-title").focus(); return; }
    const sectionId = $("dash-add-section").value;
    if (!sectionId) { toast("Add a section first from Manage sections."); return; }
    await store.addItem({ sectionId, title });
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
    await store.updateItem(row.dataset.id, { done: 1, doneAt: Date.now() });
    toast("Done — nice. ✨");
    await renderDashboard();
  }

  ctx.views.dashboard = renderDashboard;

  return {
    wire() {
      $("dash-add-form").addEventListener("submit", submitDashAdd);
      $("dash-todos").addEventListener("click", onDashTodosClick);
      $("dash-donow").addEventListener("click", () => ctx.showView("donow"));
      $("dash-checkin").addEventListener("click", () => ctx.showView("checkin"));
      $("dash-insights").addEventListener("click", () => ctx.showView("insights"));
      $("dash-one-thing").addEventListener("click", () => ctx.showView("goals"));
    },
  };
};
