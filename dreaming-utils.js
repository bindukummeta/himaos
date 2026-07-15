// Pure "Dreaming collections" helpers (Step 3), shared by the app and its tests.
//
// A "dreaming collection" is just a `collection`-kind section whose contents are
// wishes rather than chores — bucket list, watchlist, places to visit, memories.
// The emotional payoff is seeing them, and celebrating the ones you've lived.
// An "achieved" dream reuses the item `done`/`doneAt` flag (a lived dream is a
// completed collection item), so no new store or migration is needed.
//
// No browser dependencies, so this works both as a <script> tag (attaching to
// window.DreamingUtils) and under Node's test runner (via module.exports). Keep
// everything here side-effect free and DOM-free.
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api; // Node (tests)
  } else {
    root.DreamingUtils = api; // Browser (app.js reads window.DreamingUtils)
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // Built-in dreaming collections. Stable `key`/`id` so restore + future
  // cross-links survive. All are `collection` kind so they reuse existing UI.
  // `order` is intentionally high so they sit after the utilitarian starters;
  // storage.js re-numbers on restore, this is just the seed ordering.
  const DREAM_STARTERS = [
    { id: "sec-bucket-list", key: "bucket-list", name: "Bucket list", icon: "🌠", kind: "collection", dreaming: true, order: 7 },
    { id: "sec-watchlist", key: "watchlist", name: "Watchlist", icon: "🎬", kind: "collection", dreaming: true, order: 8 },
    { id: "sec-places", key: "places-to-visit", name: "Places to visit", icon: "🗺️", kind: "collection", dreaming: true, order: 9 },
    { id: "sec-memories", key: "memories", name: "Memories", icon: "📸", kind: "collection", dreaming: true, order: 10 },
  ];

  // Keys of the built-in dreaming collections, for detection when the stored
  // section predates the `dreaming` flag (e.g. restored from an old backup).
  const DREAM_KEYS = DREAM_STARTERS.map((s) => s.key);

  // A section is "dreaming" if it's a collection AND either carries the explicit
  // flag or matches a known dreaming key. Non-collections are never dreaming.
  function isDreamingSection(section) {
    if (!section || section.kind !== "collection") return false;
    return section.dreaming === true || DREAM_KEYS.indexOf(section.key) >= 0;
  }

  // A collection item is "achieved" when its done flag is truthy — a dream you
  // have lived. Kept as a helper so callers don't reach into the flag directly.
  function isAchieved(item) {
    return Boolean(item && item.done);
  }

  // Counts for the section header: total, achieved (lived), someday (still open).
  function collectionStats(items) {
    const list = Array.isArray(items) ? items : [];
    const achieved = list.filter(isAchieved).length;
    return { total: list.length, achieved, someday: list.length - achieved };
  }

  // Split a collection into two ordered buckets for display:
  //  - someday: still open, oldest-added first (stable `order`, then createdAt).
  //  - achieved: lived, most-recently-achieved first (newest `doneAt` on top),
  //    so the latest celebration leads.
  function splitCollection(items) {
    const list = Array.isArray(items) ? items.slice() : [];
    const someday = list
      .filter((i) => !isAchieved(i))
      .sort((a, b) => (a.order || 0) - (b.order || 0) || (a.createdAt || 0) - (b.createdAt || 0));
    const achieved = list
      .filter(isAchieved)
      .sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));
    return { someday, achieved };
  }

  return { DREAM_STARTERS, DREAM_KEYS, isDreamingSection, isAchieved, collectionStats, splitCollection };
});
