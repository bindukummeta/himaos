// q3-view.js — "Q3 at a glance" (Phase E). Receives the shared ctx
// (window.HimaShell) and registers renderQ3 into ctx.views. A read-only overview
// of every goal that carries a deadline: overall completion %, a calm pace chip,
// days left, and each goal's next concrete step — plus an auto weight-loss card
// read from the check-in weights store. Reflect-not-diagnose throughout.
window.Q3View = function (ctx) {
  "use strict";
  const { $, esc, store } = ctx;
  const { currentWeekKey } = window.GoalsUtils;
  const { q3Glance, weightLoss } = window.Q3Utils;

  function bar(pct) {
    return `<div class="goal-progress"><div class="goal-progress-bar" style="width:${Math.round(pct * 100)}%"></div></div>`;
  }
  function glanceCard(row) {
    const g = row.goal;
    const pct = Math.round(row.pct * 100);
    const dl = row.daysLeft;
    const left = dl == null ? "" : dl === 0 ? "due today" : dl + " day" + (dl === 1 ? "" : "s") + " left";
    const paceLbl = row.pace && row.pace.label ? row.pace.label : "";
    const band = row.pace ? row.pace.band : "none";
    return `<div class="q3-card">
      <div class="q3-card-head">
        <div class="q3-card-title">${esc(g.title)}</div>
        ${left ? `<span class="q3-days">${esc(left)}</span>` : ""}
      </div>
      ${bar(row.pct)}
      <div class="q3-meta">${row.done}/${row.total} done · ${pct}%${paceLbl ? ` · <span class="pace-inline pace-${esc(band)}">${esc(paceLbl)}</span>` : ""}</div>
      ${row.nextStep ? `<div class="q3-next">Next: ${esc(row.nextStep)}</div>` : `<div class="q3-next q3-clear">All caught up here. 🌟</div>`}
    </div>`;
  }
  // The weight-loss card reads the special milestone (kind:"weightloss") for its
  // target, then computes lost kg from the check-in weights (start vs latest).
  async function weightCard() {
    let target = null;
    for (const g of ctx.goals) {
      const m = (g.milestones || []).find((x) => x.kind === "weightloss");
      if (m && m.target) { target = m.target; break; }
    }
    if (!target) return "";
    const wl = weightLoss(await store.getWeights(), target);
    if (!wl) {
      return `<div class="q3-card q3-weight">
        <div class="q3-card-title">Weight</div>
        <div class="q3-meta">Log a weight in Check-in and this will track kg lost toward ${esc(String(target))} kg. ⚖️</div>
      </div>`;
    }
    const pct = Math.round(wl.pct * 100);
    return `<div class="q3-card q3-weight">
      <div class="q3-card-head"><div class="q3-card-title">Weight</div><span class="q3-days">${wl.lost} kg of ${target}</span></div>
      ${bar(wl.pct)}
      <div class="q3-meta">Started ${esc(String(wl.start))} kg · now ${esc(String(wl.latest))} kg · ${pct}% of goal${wl.done ? " · reached 🎉" : ""}</div>
    </div>`;
  }

  async function renderQ3() {
    await ctx.refreshGoals();
    const weekKey = currentWeekKey();
    const rows = q3Glance(ctx.goals, weekKey, Date.now());
    $("q3-count").textContent = rows.length ? `${rows.length} tracked` : "";
    const list = $("q3-list");
    const wc = await weightCard();
    if (!rows.length && !wc) {
      list.innerHTML = `<p class="empty">No goals with a deadline yet. Add one in Goals (set a deadline), or load your Q3 set from Settings. 🎯</p>`;
      return;
    }
    // Overall roll-up across tracked goals.
    const overall = rows.length ? Math.round((rows.reduce((s, r) => s + r.pct, 0) / rows.length) * 100) : 0;
    const head = rows.length
      ? `<div class="q3-overall"><div class="q3-overall-label">Overall progress</div>${bar(overall / 100)}<div class="q3-meta">${overall}% across ${rows.length} goal${rows.length === 1 ? "" : "s"}</div></div>`
      : "";
    list.innerHTML = head + wc + rows.map(glanceCard).join("");
  }

  ctx.views.q3 = renderQ3;

  return {
    wire() {
      // Read-only view — nothing to wire beyond render (registered above).
    },
  };
};
