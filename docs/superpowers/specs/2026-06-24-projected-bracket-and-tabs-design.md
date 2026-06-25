# Projected Bracket + Tabbed Layout — Design

**Date:** 2026-06-24
**File touched:** `index.html` (single static file; no build tooling, no new data source)

## Goal

Two user-facing changes to the World Cup 2026 dashboard:

1. **Projected Bracket** — a view that always shows *who'd meet whom* in the **next** knockout
   stage, resolved from live data, with **no winner guessing**. It rolls forward one stage at a
   time: project R32 during the group stage; once R32 is under way, project R16; and so on.
2. **Tabbed layout** — replace the long vertical scroll with a sticky tab bar. Each section (or
   sensible group of sections) becomes a tab; only the active panel renders.

## Background — what the ESPN feed already gives us

The dashboard pulls the knockout bracket from ESPN's public scoreboard feed
(`...soccer/fifa.world/scoreboard?dates=20260611-20260720&limit=400`). Verified 2026-06-24,
mid-group-stage, the feed already contains the **complete bracket skeleton**: 16 R32, 8 R16, 4 QF,
2 SF, 1 third-place, 1 final. Each competitor slot carries a machine-readable identity:

- Clinched real team — e.g. `abbreviation:"BRA"`, `displayName:"Brazil"`.
- Group position — `abbreviation:"2A"`, `displayName:"Group A 2nd Place"`; `"1F"` = "Group F Winner".
- Best third — `abbreviation:"3RD"`, `displayName:"Third Place Group A/B/C/D/F"` (eligible groups
  are listed in the name).
- Feeder reference — `displayName:"Round of 32 1 Winner"`, `"Semifinal 1 Winner"`, etc. The
  number identifies the feeder match.

ESPN resolves `1X`/`2X`/`3RD` slots to real teams on its own as teams clinch, and fills feeder
slots as rounds complete. The projection only needs to fill the *not-yet-resolved* slots from our
own live standings.

**Known limitation:** the scoreboard feed has **no explicit advance-linkage** field connecting an
R32 event to the R16 slot its winner feeds. Feeder slots name their source by number
("Round of 32 **N** Winner"), but R32 events carry no number. We map number → event by **date
order** (earliest R32 match = "Round of 32 1"). This only affects projections *beyond* R32; the
R32 projection (the only one shown during the group stage) does not need it. Verify the date-order
mapping live once R32 begins (2026-06-28+).

## Part A — Projected Bracket

### A1. Capture slot identity (extend `buildKnockout`)

`buildKnockout()` currently returns matches with resolved `home`/`away` `{ab,nm,sc,win}`. Extend
each competitor with a parsed **slot** descriptor so unresolved placeholders can be filled later.
Classify from `team.displayName` / `team.abbreviation`:

| Pattern | `slot.kind` | Captured data |
|---|---|---|
| abbr matches `^([12])([A-L])$` | `pos` | `rank` (1\|2), `group` (A–L) |
| displayName starts "Third Place Group …" | `third` | `eligible` = ["A","B","C","D","F"] parsed from name |
| displayName matches "Round of 32 N Winner" / "Semifinal N Winner" / "Quarterfinal N Winner" / "Round of 16 N Winner" | `winner` | `feederRound` (R32/R16/QF/SF), `feederNum` (N) |
| otherwise (real country) | `team` | the resolved team |

Numbering: assign each knockout round's events a 1-based index by ascending `kickoffMs`, so a
`winner` slot's `feederNum` can be mapped back to a concrete event.

### A2. Slot resolver

`resolveSlot(slot)` → a render descriptor. **Never guesses a knockout winner.**

- `team` → `{kind:'team', team}` (use as-is).
- `pos` → look up the current occupant of that group position from existing state
  (`DG[group]` / `ALL` / `fifaPos`). Returns
  `{kind:'team', team, projected:true, note:'1st · Group X'}`. If the group has no standings yet,
  return an unresolved placeholder `{kind:'pos', label:'1st · Group X'}`.
- `third` → `{kind:'third', eligible:[...], hint}` where `hint` is the current best-placed third
  among the eligible groups, taken from the existing best-thirds race computation. Rendered as
  "3rd of A/B/C/D/F" with a sub-line "likely: CRO (3rd, Grp B)". **No forced one-team assignment**
  (deliberate — the official assignment isn't settled until the group stage ends).
- `winner` → resolve the feeder match's two slots **one level only** and return
  `{kind:'pair', a:resolved, b:resolved}` → rendered "Winner of (USA v ENG)". Does not recurse
  deeper than one stage.

### A3. Which stage to project (rolling, one stage ahead)

```js
function projectedRound(){
  if(!STAGE_COMPLETE)     return 'R32';   // group stage running
  if(!koRoundDone('R32')) return 'R16';   // R32 running
  if(!koRoundDone('R16')) return 'QF';
  if(!koRoundDone('QF'))  return 'SF';
  if(!koRoundDone('SF'))  return 'FINAL';
  return null;                            // bracket fully resolved
}
```

Reuses the existing `STAGE_COMPLETE` flag and `koRoundDone(code)` helper. Hand-off is automatic
and matches the requested behaviour ("as we move to the round of 32, only then show projected round
of 16", and so on).

### A4. Render `renderProjectedBracket()`

- Lives in its **own dedicated tab** ("Projected Bracket"), present from the group stage onward.
- Header with a **PROJECTED** badge and a one-line caption: "assumes current standings · winners
  not predicted".
- If `projectedRound()` is `null`, show a "bracket complete" message (defer to the Knockout tab).
- Otherwise render the projected round's matches as cards. Each card resolves its two slots:
  - both teams → "USA v ENG"
  - pos → team chip + "(proj · 1st Grp A)"
  - third → "3rd of A/B/C/D/F" + "likely: CRO"
  - winner/pair → "Winner of (USA v ENG)"
- For projected R32 (group stage) this is the full 16-match first-round bracket — the primary
  thing the user wants to see now.
- Reuses existing styling primitives (knockout card classes) where practical.

### A5. Coexistence

The existing **actual** knockout sections (Knockout Watch, Knockout Rounds, The Final) are
unchanged and move into a separate **Knockout** tab. Projected Bracket = "what's next, from live
standings"; Knockout = "what actually happened, revealed as rounds complete".

## Part B — Tabbed layout

A sticky tab bar replaces the vertical scroll. The header, live banner, and summary stay pinned
above the tabs as persistent context. Each tab shows one panel; switching hides the others.

Tabs (grouped where it reads better):

1. **Today** — Today's Matches (01)
2. **Who Needs What** — Rooting guide (02)
3. **Must-Not-Lose** — Board (03)
4. **Standings** — Standings & Games Left (05) + Predict / Log Results (04)
5. **Best Thirds** — Best Third-Placed Race (06)
6. **Projected Bracket** ⭐ — new; Part A
7. **Knockout** — Knockout Watch (07) + Knockout Rounds (08) + The Final (09); actuals
8. **How it works** — method copy

Mechanics:
- Vanilla JS matching the file's existing style; no dependencies.
- Active tab persisted to `localStorage`; default to **Today** if none saved.
- Stage-gated content (Knockout actuals) still reveals *inside* its tab exactly as today; the tab
  itself can show an empty-state until the knockout phase begins.
- `renderAll()` continues to render every panel's contents; only CSS visibility changes per tab, so
  switching tabs is instant and live updates keep flowing to hidden panels.

## Non-goals

- No winner prediction anywhere.
- No change to the live data fetch, standings math, danger ratings, or best-thirds engine — all
  reused.
- No build tooling or framework — stays a single static `index.html`.
- Not reworking the existing actual-knockout rendering beyond moving it into a tab.

## Risks

- **Feeder date-order numbering** (see Background): only affects projections beyond R32; verify
  live when R32 starts.
- **Slot string parsing** depends on ESPN's `displayName` wording staying stable. Parsing is
  defensive: anything unrecognised falls back to showing the raw slot label rather than crashing.
