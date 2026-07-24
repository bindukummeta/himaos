// settings-view.js — Settings: install hint, voice toggle, backup/restore,
// starters, and the on-demand private usage summary. Extracted from app.js.
// Registers renderSettings into ctx.views.
window.SettingsView = function (ctx) {
  "use strict";
  const { $, toast, todayISO, store } = ctx;
  const { USAGE_OPEN, USAGE_ACTION } = ctx;
  const { dayKey, usageSummary, WINDOW_DAYS } = window.UsageUtils;
  function speechSupported() {
    return typeof (window.SpeechRecognition || window.webkitSpeechRecognition) === "function";
  }

  async function renderSettings() {
    const hint = $("install-hint");
    const standalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone;
    hint.textContent = standalone
      ? "Installed — Hima OS is on your home screen. 🎉"
      : "Tip: use your browser's “Add to Home Screen” to install Hima OS as an app.";
    $("app-version").textContent = "Hima OS · offline-first · data stored on this device only.";

    // Voice input toggle: disabled entirely when the browser has no speech API.
    const toggle = $("voice-toggle");
    const row = toggle.closest(".toggle-row");
    if (speechSupported()) {
      toggle.disabled = false;
      row.classList.remove("disabled");
      toggle.checked = (await store.getMeta("voiceEnabled")) === true;
      $("voice-status").textContent = toggle.checked ? "Voice input on" : "Enable voice input";
    } else {
      toggle.checked = false;
      toggle.disabled = true;
      row.classList.add("disabled");
      $("voice-status").textContent = "Not supported on this browser";
    }
  }
  async function onVoiceToggle(e) {
    const on = e.target.checked;
    await store.setMeta("voiceEnabled", on);
    $("voice-status").textContent = on ? "Voice input on" : "Enable voice input";
    toast(on ? "Voice input on 🎤" : "Voice input off");
  }
  async function exportBackup() {
    const data = await store.exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `hima-os-backup-${todayISO()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast("Backup exported");
  }
  async function importBackup(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    if (!confirm("Importing replaces ALL current sections and items with the backup. Continue?")) { e.target.value = ""; return; }
    try {
      const payload = JSON.parse(await file.text());
      await store.importAll(payload);
      await ctx.refreshSections();
      ctx.currentSectionId = null;
      ctx.showView("dashboard");
      toast("Backup imported");
    } catch (err) {
      alert("Could not import: " + (err && err.message ? err.message : "invalid file"));
    }
    e.target.value = "";
  }
  // On-demand, private usage summary — the ONLY place tracking is ever surfaced.
  // Deliberately behind a button so it can't nudge behaviour during the window.
  async function showUsageSummary() {
    const openDays = (await store.getMeta(USAGE_OPEN)) || [];
    const actionDays = (await store.getMeta(USAGE_ACTION)) || [];
    const s = usageSummary(openDays, actionDays, dayKey(), WINDOW_DAYS);
    const rate = s.openedDays ? Math.round(s.actionRate * 100) : 0;
    const out = $("usage-output");
    out.textContent =
      `Last ${s.windowDays} days: you opened Hima OS on ${s.openedDays} day(s) ` +
      `and actually did something on ${s.actionDays} of them (${rate}% of opens). ` +
      `Current action streak: ${s.streak} day(s).`;
    out.classList.remove("hidden");
  }
  async function restoreStarters() {
    const added = await store.restoreStarters();
    await ctx.refreshSections();
    renderSettings();
    toast(added ? `${added} starter section(s) restored` : "All starter sections already present");
  }
  // One-time load of the user's 10 Q3 2026 goals. Idempotent via a meta flag so
  // a second tap can't duplicate; jumps to the Q3 overview once done.
  async function seedQ3() {
    const added = await window.Q3Seed.seedQ3Goals(store);
    await ctx.refreshGoals();
    if (added) { ctx.showView("q3"); toast(`Loaded ${added} Q3 goals 🗓️`); }
    else toast("Your Q3 goals are already loaded ✅");
  }

  ctx.views.settings = renderSettings;

  return {
    wire() {
      $("voice-toggle").addEventListener("change", onVoiceToggle);
      $("export-backup").addEventListener("click", exportBackup);
      $("import-backup").addEventListener("change", importBackup);
      $("restore-starters").addEventListener("click", restoreStarters);
      $("seed-q3").addEventListener("click", seedQ3);
      $("show-usage").addEventListener("click", showUsageSummary);
    },
  };
};
