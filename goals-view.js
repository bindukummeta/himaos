// goals-view.js — Goals + weekly review (Step 4). Extracted from app.js.
// Registers renderGoals into ctx.views. Shared goal-form state (editingGoalId,
// goalFormHorizon) lives on ctx so it survives across renders + handlers.
window.GoalsView = function (ctx) {
  "use strict";
  const { $, esc, toast, store } = ctx;
  const { HORIZON_LABEL } = ctx;
  const {
    HORIZON_ORDER, currentWeekKey, activitiesForWeek,
    goalProgress, goalsByHorizon, weeklyReviewData,
  } = window.GoalsUtils;
  const { activityWeekStatus, milestoneProgress, daysLeft, paceFor } = window.Q3Utils;

  // Build the horizon chip picker for the goal form (year/quarter only — the
  // single vision lives in its own banner and is edited separately).
  function buildGoalHorizonField() {
    const chips = HORIZON_ORDER.filter((h) => h !== "vision").map((h) =>
      `<button type="button" class="chip${ctx.goalFormHorizon === h ? " selected" : ""}" data-goal-horizon="${esc(h)}">${esc(HORIZON_LABEL[h])}</button>`
    ).join("");
    $("gf-horizon-field").innerHTML = `<div class="chip-row">${chips}</div>`;
  }
  function resetGoalForm() {
    ctx.editingGoalId = null;
    ctx.goalFormHorizon = "quarter";
    $("goal-id").value = "";
    $("gf-title").value = "";
    $("gf-note").value = "";
    $("gf-deadline").value = "";
    buildGoalHorizonField();
    $("goal-form-title").textContent = "Add a goal";
    $("goal-submit").textContent = "Add goal";
    $("goal-cancel").classList.add("hidden");
  }
  // The north-star banner: show the saved vision (with an Edit affordance) or,
  // when none is set, an inline form to write one.
  function renderVision() {
    const v = ctx.visionGoal();
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
  // One embedded weekly activity row. Binary activities keep the single tick;
  // ones with a weeklyTarget show a "n/target this week" counter with −/+ steppers.
  function activityRow(goalId, a, weekKey) {
    const st = activityWeekStatus(a, weekKey);
    if (st.target) {
      return `<div class="goal-activity counted${st.done ? " done" : ""}" data-activity-id="${esc(a.id)}">
        <div class="activity-counter">
          <button class="count-step" data-act="activity-dec" aria-label="Log one less">−</button>
          <span class="count-val">${st.count}/${st.target}</span>
          <button class="count-step" data-act="activity-inc" aria-label="Log one more">+</button>
        </div>
        <span class="activity-title">${esc(a.title)}<span class="week-note"> this week</span></span>
        <div class="item-actions"><button class="icon-btn" data-act="del-activity" aria-label="Delete activity">🗑️</button></div>
      </div>`;
    }
    return `<div class="goal-activity${a.done ? " done" : ""}" data-activity-id="${esc(a.id)}">
      <button class="activity-check" data-act="toggle-activity" aria-label="Mark done this week">${a.done ? "✓" : ""}</button>
      <span class="activity-title">${esc(a.title)}</span>
      <div class="item-actions"><button class="icon-btn" data-act="del-activity" aria-label="Delete activity">🗑️</button></div>
    </div>`;
  }
  // One milestone row: a plain checkbox when target is null, a −/count/target/+
  // numeric stepper otherwise. Both reflect done state; never punitive.
  function milestoneRow(goalId, m) {
    const p = milestoneProgress(m);
    if (m.target == null) {
      return `<div class="goal-milestone${p.done ? " done" : ""}" data-milestone-id="${esc(m.id)}">
        <button class="activity-check" data-act="toggle-milestone" aria-label="Mark done">${p.done ? "✓" : ""}</button>
        <span class="activity-title">${esc(m.title)}</span>
        <div class="item-actions"><button class="icon-btn" data-act="del-milestone" aria-label="Delete milestone">🗑️</button></div>
      </div>`;
    }
    return `<div class="goal-milestone counted${p.done ? " done" : ""}" data-milestone-id="${esc(m.id)}">
      <div class="activity-counter">
        <button class="count-step" data-act="milestone-dec" aria-label="One less">−</button>
        <span class="count-val">${m.current || 0}/${m.target}${m.unit ? " " + esc(m.unit) : ""}</span>
        <button class="count-step" data-act="milestone-inc" aria-label="One more">+</button>
      </div>
      <span class="activity-title">${esc(m.title)}</span>
      <div class="item-actions"><button class="icon-btn" data-act="del-milestone" aria-label="Delete milestone">🗑️</button></div>
    </div>`;
  }
  // A calm pace chip for goals that carry a deadline (reflect-not-diagnose).
  function paceChip(g, weekKey) {
    if (!g.deadline) return "";
    const p = paceFor(g, weekKey, Date.now());
    const dl = daysLeft(g.deadline, Date.now());
    const left = dl == null ? "" : dl === 0 ? "due today" : dl + " day" + (dl === 1 ? "" : "s") + " left";
    return `<div class="pace-chip pace-${esc(p.band)}">${esc(p.label || "")}${left ? " · " + esc(left) : ""}</div>`;
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
    const acts = rows.map((a) => activityRow(g.id, a, weekKey)).join("");
    const mrows = (g.milestones || []).map((m) => milestoneRow(g.id, m)).join("");
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
      ${paceChip(g, weekKey)}
      ${mrows ? `<div class="goal-milestones">${mrows}</div>` : ""}
      <form class="add-milestone" data-goal-id="${esc(g.id)}">
        <input class="mf-title" placeholder="Add a milestone…" />
        <input class="mf-target" type="number" min="1" step="1" placeholder="#" aria-label="Optional numeric target" />
        <button type="submit" class="btn-secondary">Add</button>
      </form>
      <div class="goal-activities">${acts}</div>
      <form class="add-activity" data-goal-id="${esc(g.id)}">
        <input class="af-title" placeholder="Add a weekly activity…" />
        <input class="af-target" type="number" min="1" step="1" placeholder="×/wk" aria-label="Optional weekly target" />
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
    await ctx.refreshGoals();
    resetGoalForm();
    renderVision();

    const weekKey = currentWeekKey();
    const map = await ctx.tasksByGoal();
    const grouped = goalsByHorizon(ctx.goals);
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
    const v = ctx.visionGoal();
    if (!title) {
      if (v) { await store.deleteGoal(v.id); await renderGoals(); }
      return;
    }
    if (v) await store.updateGoal(v.id, { title, note });
    else await store.addGoal({ horizon: "vision", title, note });
    await renderGoals();
    toast("Vision saved. 🌟");
  }
  async function submitGoal(e) {
    e.preventDefault();
    const title = ($("gf-title").value || "").trim();
    if (!title) { $("gf-title").focus(); return; }
    const deadline = ($("gf-deadline").value || "").trim() || null;
    const rec = { title, note: ($("gf-note").value || "").trim(), horizon: ctx.goalFormHorizon, deadline };
    if (ctx.editingGoalId) await store.updateGoal(ctx.editingGoalId, rec);
    else await store.addGoal(rec);
    await renderGoals();
    toast(ctx.editingGoalId ? "Goal updated" : "Goal added 🎯");
  }
  async function onGoalsClick(e) {
    // Vision edit toggles the inline form back on.
    if (e.target.closest("#vision-edit")) {
      const v = ctx.visionGoal();
      $("vision-display").innerHTML = "";
      $("vision-form").classList.remove("hidden");
      $("vf-title").value = v ? v.title || "" : "";
      $("vf-note").value = v ? v.note || "" : "";
      $("vf-title").focus();
      return;
    }
    // Horizon chip picker in the goal form.
    const hChip = e.target.closest(".chip[data-goal-horizon]");
    if (hChip) { ctx.goalFormHorizon = hChip.dataset.goalHorizon; buildGoalHorizonField(); return; }

    const btn = e.target.closest("[data-act]");
    if (!btn) return;
    const act = btn.dataset.act;
    const card = e.target.closest(".goal-card");
    const goalId = card ? card.dataset.goalId : (btn.dataset.goalId || null);
    if (!goalId) return;

    if (act === "toggle-activity") {
      const arow = e.target.closest("[data-activity-id]");
      if (!arow) return;
      await store.toggleActivityWeek(goalId, arow.dataset.activityId, currentWeekKey());
      renderGoals();
    } else if (act === "activity-inc" || act === "activity-dec") {
      const arow = e.target.closest("[data-activity-id]");
      if (!arow) return;
      await store.logActivityWeek(goalId, arow.dataset.activityId, currentWeekKey(), act === "activity-inc" ? 1 : -1);
      renderGoals();
    } else if (act === "del-activity") {
      const arow = e.target.closest("[data-activity-id]");
      if (!arow) return;
      await store.deleteActivity(goalId, arow.dataset.activityId);
      renderGoals();
    } else if (act === "toggle-milestone") {
      const mrow = e.target.closest("[data-milestone-id]");
      if (!mrow) return;
      await store.toggleMilestone(goalId, mrow.dataset.milestoneId, 0);
      renderGoals();
    } else if (act === "milestone-inc" || act === "milestone-dec") {
      const mrow = e.target.closest("[data-milestone-id]");
      if (!mrow) return;
      await store.toggleMilestone(goalId, mrow.dataset.milestoneId, act === "milestone-inc" ? 1 : -1);
      renderGoals();
    } else if (act === "del-milestone") {
      const mrow = e.target.closest("[data-milestone-id]");
      if (!mrow) return;
      await store.deleteMilestone(goalId, mrow.dataset.milestoneId);
      renderGoals();
    } else if (act === "edit-goal") {
      const g = ctx.goals.find((x) => x.id === goalId);
      if (!g) return;
      ctx.editingGoalId = goalId;
      ctx.goalFormHorizon = g.horizon === "year" ? "year" : "quarter";
      $("goal-id").value = goalId;
      $("gf-title").value = g.title || "";
      $("gf-note").value = g.note || "";
      $("gf-deadline").value = g.deadline || "";
      buildGoalHorizonField();
      $("goal-form-title").textContent = "Edit goal";
      $("goal-submit").textContent = "Save";
      $("goal-cancel").classList.remove("hidden");
      $("gf-title").focus();
      window.scrollTo(0, 0);
    } else if (act === "cycle-status") {
      const g = ctx.goals.find((x) => x.id === goalId);
      if (!g) return;
      const next = g.status === "active" ? "paused" : g.status === "paused" ? "done" : "active";
      await store.updateGoal(goalId, { status: next });
      renderGoals();
    } else if (act === "del-goal") {
      const g = ctx.goals.find((x) => x.id === goalId);
      if (confirm(`Delete "${g ? g.title : "this goal"}"? Linked tasks are kept (just unlinked).`)) {
        await store.deleteGoal(goalId);
        renderGoals();
      }
    } else if (act === "review-move") {
      // "Move to next week" is guilt-free: mark this week's activities done so
      // the pressure resets, and let next week carry the intent fresh.
      const g = ctx.goals.find((x) => x.id === goalId);
      if (!g) return;
      const wk = currentWeekKey();
      const { rows } = activitiesForWeek(g, wk);
      for (const a of rows) if (!a.done) await store.toggleActivityWeek(goalId, a.id, wk);
      toast("Moved on — next week is a fresh start. 🌱");
      renderGoals();
    } else if (act === "review-snooze") {
      await store.updateGoal(goalId, { snoozedWeek: currentWeekKey() });
      toast("Snoozed for this week. No guilt. 💛");
      renderGoals();
    }
  }
  // Per-card add forms: an activity (optional weekly target) or a milestone
  // (optional numeric target). One delegated submit handler covers both.
  async function onCardFormSubmit(e) {
    const actForm = e.target.closest(".add-activity");
    if (actForm) {
      e.preventDefault();
      const input = actForm.querySelector(".af-title");
      const title = (input.value || "").trim();
      if (!title) { input.focus(); return; }
      const t = Number((actForm.querySelector(".af-target").value || "").trim());
      const weeklyTarget = isFinite(t) && t > 0 ? t : null;
      await store.addActivity(actForm.dataset.goalId, { title, weeklyTarget });
      renderGoals();
      return;
    }
    const msForm = e.target.closest(".add-milestone");
    if (msForm) {
      e.preventDefault();
      const input = msForm.querySelector(".mf-title");
      const title = (input.value || "").trim();
      if (!title) { input.focus(); return; }
      const t = Number((msForm.querySelector(".mf-target").value || "").trim());
      const target = isFinite(t) && t > 0 ? t : null;
      await store.addMilestone(msForm.dataset.goalId, { title, target });
      renderGoals();
    }
  }

  ctx.views.goals = renderGoals;

  return {
    wire() {
      $("vision-form").addEventListener("submit", submitVision);
      $("goal-form").addEventListener("submit", submitGoal);
      $("goal-cancel").addEventListener("click", resetGoalForm);
      // One delegated listener covers vision edit, horizon chips, goal cards and
      // review actions; a separate one handles the per-card add-activity/milestone forms.
      $("view-goals").addEventListener("click", onGoalsClick);
      $("goals-list").addEventListener("submit", onCardFormSubmit);
    },
  };
};
