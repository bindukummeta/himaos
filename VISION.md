# Hima OS — Vision & Roadmap

> The living memory of this project. Read this first at the start of any new
> session to get fully caught up. Keep it updated as the vision evolves.

## What Hima OS is (in one line)

A private, offline-first planner that **learns your energy and rhythms and is
kind to you on your low days** — so it hands you the right thing at the right
moment, instead of being one more warehouse you have to maintain.

## The wedge (what makes it sellable)

Most task apps sort by priority or deadline. Most cycle apps track the body but
never touch your tasks. Most productivity apps are relentlessly upbeat and cruel
on low days. Hima OS lives in the underserved intersection:

**"A planner that adapts to your body and mind, and protects you from your own
worst days."**

This is the product. "All your lists in one place" is just the wrapper — do NOT
let the app drift into a generic "everything organizer" (that category is a
graveyard: Notion, Obsidian, Tana, etc. already own it).

## Audience: for everyone (rhythm-aware, not gender-specific)

The app is **rhythm-aware**, and the menstrual cycle is only ONE optional rhythm
among many. Frame it as "understand your own energy and what drives it." Inputs
everyone shares:

- Sleep, recurring stressors, habits (exercise/caffeine/eating), custom rhythms.
- **Trigger patterns** — the universal spine: "here's what tends to precede your
  low / reactive days." Works identically regardless of gender.
- **Cycle awareness** — a first-class OPTIONAL module a user switches on, sitting
  alongside the universal inputs. Never the headline; never assumed.

Positioning: lead with the universal promise; broad in *who*, sharp in *how*.

## Core principles (hold these firmly)

1. **Local-first privacy is the moat.** All data — especially mood, cycle, and
   trigger data — stays on-device, nothing uploaded. Ethical AND a competitive
   moat, because trust is the whole game in this category.
2. **Frictionless capture.** Jotting is always one line; tags are optional and
   can be added later. Never a "filing tax" just to write something down.
3. **Useful at retrieval.** Every feature must give something back at the moment
   of need. If it's just more filing, it doesn't belong.
4. **Adaptive, guilt-free goals.** When you fall behind, the app renegotiates
   ("move it / shrink it?") — it never scolds. Anti-guilt by design.
5. **Reflect, never diagnose.** Insights show you YOUR patterns. They never label
   or diagnose. Works alongside professional care, never as a substitute.
6. **The storage seam.** `storage.js` (`HimaStore`) is the only data interface
   app.js touches, so a future cloud-sync backend can implement the same API
   without a UI rewrite. Stable section IDs enable future interlinking.

## Roadmap (layered — each step feeds the next)

- [x] **Step 1 — Do Now (time/energy).** Tag checklist tasks with optional
      minutes + energy; "Do Now" picker pools open tasks across all sections and
      surfaces what fits your current time + energy. (Dashboard shortcut + unit
      tests done.)
- [x] **Step 2 — Daily check-in.** 5-second energy + mood tap, plus OPTIONAL
      light context tags (who/what, slept badly, hungry, tired). This is the log
      that later powers BOTH cycle windows and trigger insights. Same 5 seconds.
      (Multiple moments/day, 5-point mood scale, streak; dashboard card +
      `checkin` view; `checkins` store in backup; `checkin-utils` + unit tests done.)
- [x] **Step 3 — Dreaming collections.** Bucket list, watchlist, places to visit,
      memories. Emotional payoff; no engine needed. (Collection type already exists.)
      (Dreaming starters + `dreaming` flag; Someday/Lived ✨ split with lived/someday
      counts; optional link per item; celebratory "lived" state instead of strike-through;
      `dreaming-utils` + unit tests done.)
- [x] **Step 4 — Goals + weekly review.** Vision (5–10y) → yearly/quarterly goals
      → daily/weekly activities. Link tasks/habits up to the goal they serve.
      Morning "one thing that matters" nudge; weekly "here's your compounded
      progress, let's adjust" review. Daily earns retention; weekly earns belief.
      (Vision banner + year/quarter goal cards; embedded weekly activities ticked
      per ISO week + optional `goalId` linking checklist tasks, dual progress
      rollup; dashboard "one thing" nudge via `pickOneThing`; guilt-free review
      with move/snooze; `goals` store — DB v3 — in backup; `goals-utils` + unit
      tests done.)
- [x] **Step 5 — Pattern insights.** Overlay the daily log on rhythms to reveal,
      side by side: trigger clusters (universal) and — if enabled — cycle windows.
      Reflect-not-diagnose. This is arguably the app's most valuable output.
      (Phase A: food capture in the check-in + a neutral weight metric — DB v4.
      Phase B: an Insights view + dashboard card surfacing input→outcome patterns
      (mood/energy/bloating) with a ≥5-day threshold both sides, bloating
      co-occurrence clusters, and a 30/90-day weight sparkline — no goal line, no
      red zones; `insights-utils` + unit tests done. Cycle windows deferred.
      Phase C: a lightweight Health view — exercise (multi-select types), vitamins
      (define-once list + daily tick), and medication (name + count) — DB v5, new
      `health` store + vitamin defs in `meta`, both in backup. Health inputs fold
      into the correlation engine as presence tags (`exercise:<id>` / `vit:<id>` /
      `med:<name>`) via `health-utils`; meds correlate by presence (count kept for
      later views), reflect-not-diagnose wording throughout. Unit tests done.)
- [ ] **Step 6 — Coach (someday layer).** Start as a structured, rule-based
      companion (right question at the right time, entirely on-device). A
      conversational AI coach is a deliberate LATER fork — it must not break the
      local-only privacy promise (would require on-device models or explicit,
      opt-in cloud).

## Commercial stance

- **Base case:** a sustainable subscription business (thousands of paying users
  at ~$5–8/mo is a real living; tens of thousands is serious). Plan for this.
- **Upside, not the goal:** a multi-million acquisition IF the wedge lands, an
  audience is built, and some luck. Don't build for the exit.
- **User zero is the founder.** It must earn your own daily open first. Local-first
  means you can dogfood it from day one.
- **Moat = trust + wedge, not tech.** The tech is copyable; genuine on-device
  privacy and a product that *feels* like it understands you are not.

## Tech snapshot (for a new session to orient)

- Vanilla HTML/CSS/JS, no build step; PWA (service worker + manifest); IndexedDB.
- `storage.js` = `HimaStore` seam (sections/items/checkins/goals/weights/health/
  meta; DB v5). Pure, tested logic modules shared by app + `node --test`:
  `donow-utils`, `checkin-utils`, `voice-utils`, `dreaming-utils`, `goals-utils`,
  `usage-utils`, `insights-utils`, `health-utils`. `app.js` = routing + views.
- Matches the style of sibling apps (`education-planner-app`, `summer-holidays-app`).
