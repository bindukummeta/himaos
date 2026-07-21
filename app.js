// app.js — the thin bootstrap. After the split, the shared context lives in
// app-shell.js (window.HimaShell) and each view is its own file registering a
// render fn into ctx.views + returning a wire() that attaches its listeners.
// This file just: instantiates the views, wires them, sets up the global
// nav/drawer listeners, turns on silent usage tracking, and boots.
(function () {
  "use strict";

  const ctx = window.HimaShell;
  const { $, showView, openSection, toggleDrawer, closeDrawer } = ctx;

  // Instantiate every view with the shared ctx. Each returns { wire }.
  // Health must come before Insights/Dashboard (they read ctx.healthInsightsContext),
  // and Insights before Dashboard (it reads ctx.renderDashInsights).
  const views = [
    window.HealthView(ctx),
    window.InsightsView(ctx),
    window.DashboardView(ctx),
    window.DoNowView(ctx),
    window.CheckinView(ctx),
    window.GoalsView(ctx),
    window.SectionView(ctx),
    window.SettingsView(ctx),
  ];

  function onNavClick(e) {
    const btn = e.target.closest(".nav-item");
    if (!btn) return;
    if (btn.dataset.sectionId) openSection(btn.dataset.sectionId);
    else if (btn.dataset.view) showView(btn.dataset.view);
  }

  async function init() {
    await ctx.store.ready();
    // Silent, on-device usage recording: stamp today as an "open day", and wrap
    // store mutations so any data change stamps an "action day".
    ctx.wrapStoreForUsage();
    ctx.recordDay(ctx.USAGE_OPEN);
    await ctx.refreshSections();
    await ctx.refreshGoals();

    // Global chrome: drawer + nav.
    $("menu-btn").addEventListener("click", toggleDrawer);
    $("drawer-backdrop").addEventListener("click", closeDrawer);
    $("drawer").addEventListener("click", onNavClick);
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeDrawer(); });

    // Each view attaches its own listeners.
    views.forEach((v) => { if (v && typeof v.wire === "function") v.wire(); });

    // Dashboard cards + section shortcuts open the matching section.
    document.querySelector("main").addEventListener("click", (e) => {
      const card = e.target.closest("[data-section-id]");
      if (card && !card.classList.contains("nav-item")) openSection(card.dataset.sectionId);
    });

    showView("dashboard");
  }
  init();
})();
