// insights-view.js — Pattern Insights (Step 5). Reflect, never diagnose.
// Extracted from app.js. Registers renderInsights into ctx.views and exposes
// renderDashInsights on ctx so the dashboard card can call it. The dynamic
// input-tag context comes from ctx.healthInsightsContext (Health view).
window.InsightsView = function (ctx) {
  "use strict";
  const { $, esc, store } = ctx;
  const { INPUT_TAG_LABEL, INPUT_TAG_EMOJI, OUTCOME_LABEL, OUTCOME_EMOJI } = ctx;
  const { findPatterns, bloatingClusters, weightTrend } = window.InsightsUtils;

  async function renderInsights() {
    const checkins = await store.getCheckins();
    const weights = await store.getWeights();
    const { healthDays, inputTags } = await ctx.healthInsightsContext();
    renderInsightPatterns(findPatterns(checkins, healthDays, inputTags));
    renderInsightBloating(bloatingClusters(checkins, healthDays, inputTags));
    renderInsightWeight(weights);
  }
  // One neutral sentence per reportable input->outcome pattern, strongest first.
  function insightPatternLine(p) {
    const tag = `${INPUT_TAG_EMOJI[p.tagId] || ""} ${INPUT_TAG_LABEL[p.tagId] || p.tagId}`.trim();
    const outcome = (OUTCOME_LABEL[p.outcomeId] || p.outcomeId).toLowerCase();
    const dir = p.lift >= 0 ? "more" : "less";
    const withPct = Math.round(p.withRate * 100);
    const withoutPct = Math.round(p.withoutRate * 100);
    return `On days with <strong>${esc(tag)}</strong>, ${esc(outcome)} showed up ${esc(dir)} often` +
      ` — ${p.withOut} of ${p.withN} days (${withPct}%) vs ${p.withoutOut} of ${p.withoutN} (${withoutPct}%).`;
  }
  function renderInsightPatterns(patterns) {
    const el = $("insights-patterns");
    if (!patterns.length) {
      el.innerHTML = `<p class="empty">Not enough logged yet to spot a pattern. Keep checking in — a few weeks paints a picture. 🌿</p>`;
      return;
    }
    el.innerHTML = patterns.slice(0, 6).map((p) =>
      `<div class="insight-row"><span class="insight-ico">${esc(OUTCOME_EMOJI[p.outcomeId] || "•")}</span><span class="insight-text">${insightPatternLine(p)}</span></div>`
    ).join("");
  }
  function renderInsightBloating(data) {
    const el = $("insights-bloating");
    if (!data.rows.length) {
      const msg = data.totalDays
        ? `Only ${data.totalDays} day${data.totalDays === 1 ? "" : "s"} tagged bloating so far — a few more and patterns can surface.`
        : `Nothing tagged bloating yet. If you ever do, this is where the company it keeps will show. 🎈`;
      el.innerHTML = `<p class="empty">${esc(msg)}</p>`;
      return;
    }
    const rows = data.rows.slice(0, 6).map((r) => {
      const tag = `${INPUT_TAG_EMOJI[r.tagId] || ""} ${INPUT_TAG_LABEL[r.tagId] || r.tagId}`.trim();
      return `<div class="insight-row"><span class="insight-text"><strong>${esc(tag)}</strong> on ${r.count} of ${data.totalDays} bloated days (${Math.round(r.rate * 100)}%)</span></div>`;
    }).join("");
    el.innerHTML = `<p class="hint">Across ${data.totalDays} days you tagged bloating, these turned up alongside it most:</p>${rows}`;
  }
  // A hand-rolled SVG sparkline (no goal line, no markers) plus a plain delta.
  function sparklineSVG(spark) {
    if (spark.length < 2) return "";
    const W = 260, H = 48, pad = 4;
    const pts = spark.map((s) => {
      const x = pad + s.x * (W - 2 * pad);
      const y = H - pad - s.y * (H - 2 * pad); // y=1 (highest kg) at top
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(" ");
    return `<svg class="sparkline" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">` +
      `<polyline fill="none" points="${pts}" /></svg>`;
  }
  function weightWindowCard(label, t) {
    if (t.count < 2) {
      return `<div class="insight-weight-card"><div class="insight-weight-label">${esc(label)}</div><p class="empty">Not enough entries yet.</p></div>`;
    }
    const d = t.delta;
    const arrow = d > 0 ? "↑" : d < 0 ? "↓" : "•";
    const delta = `${arrow} ${Math.abs(d).toFixed(1)} kg`;
    return `<div class="insight-weight-card">
      <div class="insight-weight-label">${esc(label)}</div>
      ${sparklineSVG(t.spark)}
      <div class="insight-weight-delta">${esc(t.first.toFixed(1))} → ${esc(t.last.toFixed(1))} kg <span class="insight-weight-change">(${esc(delta)})</span></div>
    </div>`;
  }
  function renderInsightWeight(weights) {
    const el = $("insights-weight");
    const w30 = weightTrend(weights, 30);
    if (!w30.count && !weightTrend(weights, 90).count) {
      el.innerHTML = `<p class="empty">No weight logged yet. Whenever you like — a gentle trend will build here. 🌿</p>`;
      return;
    }
    el.innerHTML = weightWindowCard("Last 30 days", w30) + weightWindowCard("Last 90 days", weightTrend(weights, 90));
  }
  // Dashboard summary card: surface the single strongest pattern (or a weight
  // delta) and link into the full Insights view. Hidden when there's nothing yet.
  async function renderDashInsights(checkins) {
    const tile = $("dash-insights");
    if (!tile) return;
    const { healthDays, inputTags } = await ctx.healthInsightsContext();
    const patterns = findPatterns(checkins, healthDays, inputTags);
    let sub = "";
    if (patterns.length) {
      const p = patterns[0];
      const tag = INPUT_TAG_LABEL[p.tagId] || p.tagId;
      const outcome = (OUTCOME_LABEL[p.outcomeId] || p.outcomeId).toLowerCase();
      sub = `${tag} tends to go with ${outcome} — see what else.`;
    } else {
      const weights = await store.getWeights();
      const t = weightTrend(weights, 30);
      if (t.count >= 2) {
        const d = t.delta;
        const arrow = d > 0 ? "↑" : d < 0 ? "↓" : "•";
        sub = `Weight ${arrow} ${Math.abs(d).toFixed(1)} kg over 30 days — see your trend.`;
      }
    }
    if (!sub) { tile.classList.add("hidden"); return; }
    $("dash-insights-sub").textContent = sub;
    tile.classList.remove("hidden");
  }

  ctx.views.insights = renderInsights;
  ctx.renderDashInsights = renderDashInsights;

  return { wire() {} };
};
