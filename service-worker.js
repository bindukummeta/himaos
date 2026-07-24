const CACHE = "hima-os-v15";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./storage.js",
  "./donow-utils.js",
  "./checkin-utils.js",
  "./voice-utils.js",
  "./dreaming-utils.js",
  "./goals-utils.js",
  "./q3-utils.js",
  "./usage-utils.js",
  "./insights-utils.js",
  "./health-utils.js",
  "./evidence-utils.js",
  "./app-shell.js",
  "./health-view.js",
  "./insights-view.js",
  "./dashboard-view.js",
  "./donow-view.js",
  "./checkin-view.js",
  "./goals-view.js",
  "./q3-view.js",
  "./q3-seed.js",
  "./evidence-view.js",
  "./section-view.js",
  "./settings-view.js",
  "./app.js",
  "./sw-register.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  // Pre-cache the shell. Do NOT skipWaiting here — the page decides when to
  // activate the new SW (via the "Update available" prompt).
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Navigations / HTML → network-first: fresh when online, cache when offline.
  const isNavigation =
    req.mode === "navigate" ||
    (req.headers.get("accept") || "").includes("text/html");
  if (isNavigation) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((c) => c || caches.match("./index.html")))
    );
    return;
  }

  // Same-origin static assets → stale-while-revalidate.
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          caches.open(CACHE).then((c) => c.put(req, res.clone()));
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
