// Register the service worker in production only. On localhost we skip it (and
// unregister any existing one) so code edits always show up on reload.
(function () {
  if (!("serviceWorker" in navigator)) return;
  var host = location.hostname;
  var isLocal = host === "localhost" || host === "127.0.0.1" || host === "";
  if (isLocal) {
    navigator.serviceWorker.getRegistrations().then(function (regs) {
      regs.forEach(function (r) { r.unregister(); });
    });
    return;
  }

  var banner = document.getElementById("update-banner");
  var reloadBtn = document.getElementById("update-reload");
  var registration = null;
  var refreshing = false;

  function doReload() {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  }

  navigator.serviceWorker.addEventListener("controllerchange", doReload);

  function showUpdate() { if (banner) banner.classList.remove("hidden"); }

  function trackWorker(worker) {
    if (!worker) return;
    if (worker.state === "installed") { showUpdate(); return; }
    worker.addEventListener("statechange", function () {
      if (worker.state === "installed") showUpdate();
    });
  }

  function activateUpdate() {
    function messageWaiting() {
      var waiting = registration && registration.waiting;
      if (waiting) {
        waiting.addEventListener("statechange", function () {
          if (waiting.state === "activated") doReload();
        });
        waiting.postMessage("SKIP_WAITING");
      }
    }
    messageWaiting();
    if (registration && registration.update) {
      registration.update().then(messageWaiting).catch(function () {});
    }
    setTimeout(doReload, 1500);
  }

  if (reloadBtn) reloadBtn.addEventListener("click", activateUpdate);

  // Ask the browser to re-fetch service-worker.js and check for a new version.
  // Browsers only do this automatically on navigation, which an installed PWA
  // rarely triggers — so without this the update banner may never appear.
  function checkForUpdate() {
    if (registration && registration.update) {
      registration.update().catch(function () {});
    }
  }

  window.addEventListener("load", function () {
    navigator.serviceWorker.register("service-worker.js").then(function (reg) {
      registration = reg;
      if (reg.waiting) showUpdate();
      if (reg.installing) trackWorker(reg.installing);
      reg.addEventListener("updatefound", function () {
        trackWorker(reg.installing);
      });
      // Check once now, then again whenever the app is brought back to the
      // foreground — this is what surfaces new versions on phones where the app
      // stays installed and is resumed from the background rather than reloaded.
      checkForUpdate();
    });
  });

  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible") checkForUpdate();
  });
})();
