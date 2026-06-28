# Interactive Knockout Bracket — Design Spec

**Date:** 2026-06-28
**Status:** Approved, implementing
**Scope:** Upgrade the existing "Projected Bracket" tab into a zoomable, predict-the-winner bracket with a cinematic stadium "drone descent" background.

## Goal

Replace the flat "who'd meet whom" list in the Projected Bracket tab with an
interactive, symmetric World-Cup-style bracket tree. The user can pan/zoom the
whole board, pick winners to predict the path to the Final, and — as they zoom
into a specific tie — the background descends drone-style into that match's real
stadium.

## Decisions (from brainstorming)

1. **Prediction model: Hybrid.** Ties already decided by real ESPN results are
   locked; the user predicts the remaining ties forward to the title.
2. **Placement:** the existing **Projected Bracket** tab becomes the interactive
   bracket (no new tab).
3. **Team display:** emoji flag + abbreviation (e.g. 🇲🇽 MEX). No flag image assets.
4. **Pan/zoom:** free pan + pinch/scroll zoom with on-screen `+` / `−` / "Fit"
   controls, via an **inlined** `panzoom` library (anvaka, MIT, ~3KB) to preserve
   the single-file model.
5. **Persistence:** editable predictions saved to a separate
   `localStorage['wc26.bracket']`; "Clear my predictions" button; real results
   always override stale picks once a tie is actually decided.
6. **Background:** a zoom-reactive **stadium drone descent**. Each tie maps to its
   real venue (from the ESPN feed). Zooming into a tie crossfades to that
   stadium and pushes in (sky → bowl → pitch parallax). Stadium photos are
   CC-licensed `.webp` hosted in the repo (served by Vercel); a procedural
   "lights + pitch grid" canvas is the offline/failed-load fallback. Confetti on
   crowning a champion. Respects `prefers-reduced-motion`.

## Architecture

The Projected Bracket tab holds a fixed-height **stage** with three stacked layers:

- **z-0 Background canvas** — the animated drone/stadium layer. Reads the live
  pan/zoom transform each frame to drive descent + parallax, and the
  currently-centered tie to choose the active stadium.
- **z-1 Bracket board** — HTML slot nodes + one SVG connector overlay, wrapped in
  the panzoom transform container.
- **z-2 HUD** — fixed controls: `+` / `−` / "Fit", predicted-progress readout,
  "Clear my predictions".

### Components

- `buildBracketModel(knockout, myPicks)` — **pure function**. Returns
  `{ rounds: [{ code, label, ties: [{ key, home, away, winner, state }] }] }`
  where each slot is `{ ab, nm, flag, kind: 'locked'|'predicted'|'open'|'tbd' }`.
  No DOM, no globals. Lives next to the existing `<bracket-pure>` test markers.
- `resolveWinner(tie, myPicks)` — priority: real result (`locked`) → user pick
  (`predicted`) → none (`open`/`tbd`). Feeds the next round's slots.
- `applyPick(tieKey, winnerAb)` — sets the pick, then **cascades**: any downstream
  pick whose participant is no longer present is cleared. Persists to localStorage.
- `renderBracket(model)` — lays out slots in a symmetric tree (left half + right
  half converging on the Final), positions the SVG connectors from slot
  coordinates, wires click handlers.
- `bracketBackground` — canvas controller: `start()`, `stop()`,
  `onTransform(scale, x, y)`, `setActiveVenue(venue)`, `burstConfetti()`.
- Venue map: `VENUE_IMAGE[normalizedVenue] = 'stadiums/<slug>.webp'`, lazy-loaded.

### Data flow

```
STATE.knockout ─┐
                ├─> buildBracketModel ──> model ──> renderBracket ──> DOM + SVG
myPicks (LS) ───┘                                        │
                                                         ├─ click winner ─> applyPick ─> re-render
panzoom transform ──> bracketBackground.onTransform ─────┘
centered tie ───────> bracketBackground.setActiveVenue
```

## Interaction model

- **Pick:** tap a team → predicted winner of that tie; advances into the correct
  next-round slot via the feeder linkage (`parseSlot`/`numberRounds`).
- **Edit/cascade:** tap the other team → switch pick; downstream picks that
  depended on the old winner are cleared and revert to open.
- **Locked ties:** real ESPN result → fixed winner, not editable, lock/✓ marker.
- **Open/TBD slots:** show the two candidate teams ("MEX / KOR") or "TBD" until a
  feeder resolves.
- **Champion:** picking the Final winner crowns them (trophy highlight + confetti).
- **Third-place match:** small standalone node near the Final, not part of the
  predict-to-champion path.
- **Progress readout:** "predicted N / M remaining ties".

## Background: stadium drone descent

- Below a zoom threshold → "overview sky" (calm).
- Past the threshold → find the tie whose on-screen center is nearest the
  viewport center; its venue becomes active. Crossfade to that stadium image;
  push-in scales with zoom depth (deeper = closer to the pitch).
- Parallax layers (sky / bowl / pitch) move at different rates with pan.
- Lazy-load: only the active stadium image is fetched.
- Fallback: image load failure or `file://` → procedural canvas stadium
  (floodlights + pitch grid) with the same descent behavior.
- `prefers-reduced-motion` → static stadium / calm overview, no push-in.
- Canvas paused when the tab/board isn't visible.

## Assets

- 16 WC2026 knockout venues. CC-licensed photos from Wikimedia Commons,
  attributed in a `stadiums/CREDITS.md`, optimized to `.webp` (target ≤ ~150KB
  each). Stored in `stadiums/`. Served by Vercel; `.vercelignore` unaffected.
- A venue-name normalization map handles ESPN's venue strings → file slugs.

## Performance & accessibility

- `requestAnimationFrame`; canvas paused via `visibilitychange` and when the
  bracket tab is inactive.
- Lazy image loading; decode off the main path where possible.
- `prefers-reduced-motion` disables drone motion and confetti.
- Slots are real focusable DOM (keyboard-clickable); pan/zoom is pointer/wheel/touch.

## Testing

- Unit tests for the pure logic (extend `test/` alongside `<bracket-pure>`):
  - pick advances a team to the right next-round slot
  - switching a pick cascades-clears dependent downstream picks
  - a real result overrides a stale user pick for that tie
  - champion resolves only when the full path is filled
- Manual/browser verification with the existing R32 simulation harness:
  render correctness, pan/zoom, pick + cascade, persistence across reload,
  background descent + fallback, reduced-motion.

## Implementation phases

1. **Bracket core:** `buildBracketModel` + symmetric render + SVG connectors +
   inlined panzoom + pick/cascade + persistence. (Procedural-free; no background
   yet.) Test in harness.
2. **Procedural drone background:** canvas stadium (lights + pitch grid) reacting
   to zoom + centered-tie selection + confetti. This is also the offline fallback.
3. **Real stadium photos:** source/optimize/commit images, venue map, lazy-load,
   crossfade, graceful fallback to phase 2.

## Out of scope (YAGNI)

- Auto-predicting winners by seeding/ranking.
- Sharing/exporting a bracket image.
- Animating the group stage.
- Per-leg stats inside bracket slots (already covered by the Knockout tab).
