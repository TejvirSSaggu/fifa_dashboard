# Projected Bracket + Tabbed Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a rolling, one-stage-ahead "Projected Bracket" view (who'd meet whom, no winner guessing) and convert the long-scroll dashboard into a tabbed layout — all within the single static `index.html`.

**Architecture:** Pure bracket logic (slot parsing, round numbering, slot resolution, rolling-stage selection) lives in a marker-delimited block in `index.html` and is unit-tested in Node by extracting that block. Thin wiring reads the existing live globals (`DG`, `THIRDS`, `STATE.knockout`, `STAGE_COMPLETE`, `koRoundDone`) and feeds the pure resolver. A new render function and a vanilla-JS tab controller complete the UI. The actual-knockout sections are unchanged; they just move into a tab.

**Tech Stack:** Plain browser JS + CSS in one HTML file (no build, no framework, must still open via `file://`). Tests: Node built-in `node:test` / `node:assert` for pure logic; Playwright MCP for DOM/render/tab verification.

## Global Constraints

- Single static file: ALL feature code goes in `index.html`. No external JS/CSS, no bundler, no `package.json` runtime deps. The page must still work opened directly as `file://`.
- No winner prediction anywhere. Projections resolve slots from current standings only; knockout winners are never guessed.
- Pure-logic functions (inside the `// <bracket-pure>` … `// </bracket-pure>` markers) must not reference the DOM or module-level globals — all live data enters via a `ctx` argument. This is what makes Node extraction-testing possible.
- Third-place R32 slots render as "3rd of A/B/C/D/F" plus a "likely: …" hint — never a single forced team.
- Reuse existing helpers verbatim: `fifaOrder(g)`, `DG[group].teams`, `THIRDS` (`{group,abbr,name,rank,in}`), `koRoundDone(code)`, `STAGE_COMPLETE`, `STATE.knockout`, `koWhen(m)`.
- Node tests run with: `node --test test/` (requires Node ≥ 18).

---

## File Structure

- **Modify `index.html`** — the whole feature:
  - `buildKnockout()` (~line 738): attach a parsed `slot` to each competitor.
  - New `// <bracket-pure> … // </bracket-pure>` block (placed right after `buildKnockout`): `parseSlot`, `numberRounds`, `resolveSlot`, `projectedRound`.
  - New wiring `buildProjectedBracket()` + a `window.__bracket` test hook (after the pure block).
  - New `renderProjectedBracket()` + CSS + a panel container; call it from `renderAll()`.
  - Tab bar markup, `.tabs`/`.tabpanel` CSS, panel wrapper `<div>`s around existing sections, and a tab-controller IIFE.
- **Create `test/extract.mjs`** — loads `index.html`, slices the marker block, returns the pure functions.
- **Create `test/bracket.test.mjs`** — Node unit tests for the four pure functions.

---

## Task 1: Test harness + slot parser (`parseSlot`)

**Files:**
- Create: `test/extract.mjs`
- Create: `test/bracket.test.mjs`
- Modify: `index.html` (add `// <bracket-pure>` block with `parseSlot`, after `buildKnockout`, ~line 751)

**Interfaces:**
- Produces: `parseSlot(team) -> {kind:'pos',rank,group} | {kind:'third',eligible:string[]} | {kind:'feeder',feederRound:'R32'|'R16'|'QF'|'SF',feederNum:number,result:'winner'|'loser'} | {kind:'team',ab,nm}`. Input `team` is an ESPN competitor `team` object with `abbreviation` and `displayName`.
- Produces: `test/extract.mjs` default-exports `{parseSlot,numberRounds,resolveSlot,projectedRound}` via the named export `pure`.

- [ ] **Step 1: Write the extractor**

Create `test/extract.mjs`:

```js
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(here, '..', 'index.html'), 'utf8');
const m = html.match(/\/\/ <bracket-pure>([\s\S]*?)\/\/ <\/bracket-pure>/);
if (!m) throw new Error('bracket-pure block not found in index.html');
export const pure = new Function(
  m[1] + '\nreturn { parseSlot, numberRounds, resolveSlot, projectedRound };'
)();
```

- [ ] **Step 2: Write the failing test**

Create `test/bracket.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pure } from './extract.mjs';
const { parseSlot } = pure;

test('parseSlot: group position', () => {
  assert.deepEqual(parseSlot({ abbreviation: '2A', displayName: 'Group A 2nd Place' }),
    { kind: 'pos', rank: 2, group: 'A' });
  assert.deepEqual(parseSlot({ abbreviation: '1F', displayName: 'Group F Winner' }),
    { kind: 'pos', rank: 1, group: 'F' });
});

test('parseSlot: best third with eligible groups', () => {
  assert.deepEqual(parseSlot({ abbreviation: '3RD', displayName: 'Third Place Group A/B/C/D/F' }),
    { kind: 'third', eligible: ['A', 'B', 'C', 'D', 'F'] });
});

test('parseSlot: feeder winner references', () => {
  assert.deepEqual(parseSlot({ abbreviation: 'RD32', displayName: 'Round of 32 1 Winner' }),
    { kind: 'feeder', feederRound: 'R32', feederNum: 1, result: 'winner' });
  assert.deepEqual(parseSlot({ abbreviation: 'RD16 W7', displayName: 'Round of 16 7 Winner' }),
    { kind: 'feeder', feederRound: 'R16', feederNum: 7, result: 'winner' });
  assert.deepEqual(parseSlot({ abbreviation: 'QFW3', displayName: 'Quarterfinal 3 Winner' }),
    { kind: 'feeder', feederRound: 'QF', feederNum: 3, result: 'winner' });
  assert.deepEqual(parseSlot({ abbreviation: 'SFW2', displayName: 'Semifinal 2 Winner' }),
    { kind: 'feeder', feederRound: 'SF', feederNum: 2, result: 'winner' });
});

test('parseSlot: semifinal loser (third-place match feeder)', () => {
  assert.deepEqual(parseSlot({ abbreviation: 'SF L1', displayName: 'Semifinal 1 Loser' }),
    { kind: 'feeder', feederRound: 'SF', feederNum: 1, result: 'loser' });
});

test('parseSlot: real team', () => {
  assert.deepEqual(parseSlot({ abbreviation: 'BRA', displayName: 'Brazil' }),
    { kind: 'team', ab: 'BRA', nm: 'Brazil' });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `node --test test/`
Expected: FAIL — `Error: bracket-pure block not found in index.html` (the block doesn't exist yet).

- [ ] **Step 4: Add the pure block with `parseSlot`**

In `index.html`, immediately after the closing `}` of `buildKnockout(sb)` (~line 751, before `async function refresh`), insert:

```js
// <bracket-pure> — pure bracket logic; no DOM, no module globals (test/extract.mjs depends on these markers)
function parseSlot(team){
  const ab=((team&&team.abbreviation)||'').trim();
  const dn=((team&&team.displayName)||'').trim();
  let m;
  if(m=/^([12])([A-L])$/.exec(ab)) return {kind:'pos', rank:+m[1], group:m[2]};
  if(/^Third Place Group/i.test(dn)){
    const eligible=(dn.replace(/^Third Place Group\s*/i,'').match(/[A-L]/g))||[];
    return {kind:'third', eligible};
  }
  if(m=/^(Round of 32|Round of 16|Quarterfinal|Semifinal)\s+(\d+)\s+(Winner|Loser)$/i.exec(dn)){
    const RND={'round of 32':'R32','round of 16':'R16','quarterfinal':'QF','semifinal':'SF'};
    return {kind:'feeder', feederRound:RND[m[1].toLowerCase()], feederNum:+m[2], result:m[3].toLowerCase()};
  }
  return {kind:'team', ab, nm:dn||ab};
}
// </bracket-pure>
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test test/`
Expected: PASS — all `parseSlot` tests green.

- [ ] **Step 6: Commit**

```bash
git add test/extract.mjs test/bracket.test.mjs index.html
git commit -m "feat: parse ESPN knockout slot identities"
```

---

## Task 2: Round numbering (`numberRounds`)

**Files:**
- Modify: `index.html` (add `numberRounds` inside the `bracket-pure` block)
- Modify: `test/bracket.test.mjs` (append tests)

**Interfaces:**
- Consumes: matches shaped `{round:'R32'|'R16'|…, kickoffMs:number, ...}` (as produced by `buildKnockout`).
- Produces: `numberRounds(matches) -> { [`${round}#${n}`]: match }`, where `n` is the 1-based index of the match within its round ordered by ascending `kickoffMs`.

- [ ] **Step 1: Write the failing test**

Append to `test/bracket.test.mjs`:

```js
test('numberRounds: 1-based index per round by kickoff order', () => {
  const { numberRounds } = pure;
  const ms = [
    { round: 'R32', kickoffMs: 300 }, { round: 'R32', kickoffMs: 100 },
    { round: 'R32', kickoffMs: 200 }, { round: 'R16', kickoffMs: 999 },
  ];
  const idx = numberRounds(ms);
  assert.equal(idx['R32#1'].kickoffMs, 100);
  assert.equal(idx['R32#2'].kickoffMs, 200);
  assert.equal(idx['R32#3'].kickoffMs, 300);
  assert.equal(idx['R16#1'].kickoffMs, 999);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/`
Expected: FAIL — `numberRounds is not a function` (extractor returns `undefined` for it).

- [ ] **Step 3: Add `numberRounds` to the pure block**

Inside the `bracket-pure` block (after `parseSlot`), add:

```js
function numberRounds(matches){
  const byRound={};
  (matches||[]).forEach(m=>{ (byRound[m.round]=byRound[m.round]||[]).push(m); });
  const index={};
  Object.keys(byRound).forEach(r=>{
    byRound[r].slice().sort((a,b)=>a.kickoffMs-b.kickoffMs).forEach((m,i)=>{ index[r+'#'+(i+1)]=m; });
  });
  return index;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add index.html test/bracket.test.mjs
git commit -m "feat: number knockout matches within each round"
```

---

## Task 3: Slot resolver (`resolveSlot`)

**Files:**
- Modify: `index.html` (add `resolveSlot` inside the `bracket-pure` block)
- Modify: `test/bracket.test.mjs` (append tests)

**Interfaces:**
- Consumes: a parsed `slot` (Task 1), a `ctx`, and optional `depth` (default 0). Feeder matches carry parsed slots at `match.home.slot` / `match.away.slot` (attached in Task 5).
  - `ctx.groupPos(rank, group) -> {ab,nm} | null`
  - `ctx.thirdHint(eligible:string[]) -> {ab,nm,group} | null`
  - `ctx.feederMatch(round, num) -> { home:{slot}, away:{slot} } | null`
- Produces: `resolveSlot(slot, ctx, depth) ->`
  - `{kind:'team', ab, nm, projected?, note?}`
  - `{kind:'pos', label}` (group has no standings yet)
  - `{kind:'third', eligible:string[], hint:{ab,nm,group}|null}`
  - `{kind:'pair', a:resolved, b:resolved}` (a feeder, resolved one level deep)
  - `{kind:'feeder', label}` (feeder beyond one level, a loser feeder, or unresolved)

- [ ] **Step 1: Write the failing test**

Append to `test/bracket.test.mjs`:

```js
function makeCtx(over = {}) {
  return Object.assign({
    groupPos: () => null,
    thirdHint: () => null,
    feederMatch: () => null,
  }, over);
}

test('resolveSlot: real team passes through', () => {
  const { resolveSlot } = pure;
  assert.deepEqual(resolveSlot({ kind: 'team', ab: 'BRA', nm: 'Brazil' }, makeCtx()),
    { kind: 'team', ab: 'BRA', nm: 'Brazil' });
});

test('resolveSlot: pos resolves to current occupant, marked projected', () => {
  const { resolveSlot } = pure;
  const ctx = makeCtx({ groupPos: (r, g) => (r === 1 && g === 'A' ? { ab: 'CAN', nm: 'Canada' } : null) });
  assert.deepEqual(resolveSlot({ kind: 'pos', rank: 1, group: 'A' }, ctx),
    { kind: 'team', ab: 'CAN', nm: 'Canada', projected: true, note: '1st · Group A' });
});

test('resolveSlot: pos with no standings yet stays a placeholder', () => {
  const { resolveSlot } = pure;
  assert.deepEqual(resolveSlot({ kind: 'pos', rank: 2, group: 'B' }, makeCtx()),
    { kind: 'pos', label: '2nd · Group B' });
});

test('resolveSlot: third returns eligible set + hint', () => {
  const { resolveSlot } = pure;
  const ctx = makeCtx({ thirdHint: () => ({ ab: 'CRO', nm: 'Croatia', group: 'B' }) });
  assert.deepEqual(resolveSlot({ kind: 'third', eligible: ['A', 'B', 'C', 'D', 'F'] }, ctx),
    { kind: 'third', eligible: ['A', 'B', 'C', 'D', 'F'], hint: { ab: 'CRO', nm: 'Croatia', group: 'B' } });
});

test('resolveSlot: feeder resolves one level into a pair', () => {
  const { resolveSlot } = pure;
  const fm = { home: { slot: { kind: 'team', ab: 'USA', nm: 'United States' } },
               away: { slot: { kind: 'team', ab: 'ENG', nm: 'England' } } };
  const ctx = makeCtx({ feederMatch: (r, n) => (r === 'R32' && n === 1 ? fm : null) });
  const out = resolveSlot({ kind: 'feeder', feederRound: 'R32', feederNum: 1, result: 'winner' }, ctx, 0);
  assert.equal(out.kind, 'pair');
  assert.deepEqual(out.a, { kind: 'team', ab: 'USA', nm: 'United States' });
  assert.deepEqual(out.b, { kind: 'team', ab: 'ENG', nm: 'England' });
});

test('resolveSlot: feeder does not recurse past one level', () => {
  const { resolveSlot } = pure;
  const out = resolveSlot({ kind: 'feeder', feederRound: 'R16', feederNum: 2, result: 'winner' }, makeCtx(), 1);
  assert.equal(out.kind, 'feeder');
  assert.match(out.label, /R16 #2 winner/);
});

test('resolveSlot: loser feeder is shown as a label, never resolved', () => {
  const { resolveSlot } = pure;
  const out = resolveSlot({ kind: 'feeder', feederRound: 'SF', feederNum: 1, result: 'loser' }, makeCtx(), 0);
  assert.equal(out.kind, 'feeder');
  assert.match(out.label, /SF #1 loser/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/`
Expected: FAIL — `resolveSlot is not a function`.

- [ ] **Step 3: Add `resolveSlot` to the pure block**

Inside the `bracket-pure` block (after `numberRounds`), add:

```js
function resolveSlot(slot, ctx, depth){
  depth=depth||0;
  if(slot.kind==='team') return {kind:'team', ab:slot.ab, nm:slot.nm};
  if(slot.kind==='pos'){
    const note=(slot.rank===1?'1st':'2nd')+' · Group '+slot.group;
    const t=ctx.groupPos(slot.rank, slot.group);
    return t ? {kind:'team', ab:t.ab, nm:t.nm, projected:true, note}
             : {kind:'pos', label:note};
  }
  if(slot.kind==='third'){
    return {kind:'third', eligible:slot.eligible.slice(), hint:ctx.thirdHint(slot.eligible)||null};
  }
  if(slot.kind==='feeder'){
    if(depth>=1 || slot.result==='loser')
      return {kind:'feeder', label:slot.feederRound+' #'+slot.feederNum+' '+(slot.result||'winner')};
    const fm=ctx.feederMatch(slot.feederRound, slot.feederNum);
    if(!fm||!fm.home||!fm.away)
      return {kind:'feeder', label:slot.feederRound+' #'+slot.feederNum+' winner'};
    return {kind:'pair',
      a:resolveSlot(fm.home.slot, ctx, depth+1),
      b:resolveSlot(fm.away.slot, ctx, depth+1)};
  }
  return {kind:'feeder', label:slot.label||'TBD'};
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add index.html test/bracket.test.mjs
git commit -m "feat: resolve bracket slots from live context"
```

---

## Task 4: Rolling stage selector (`projectedRound`)

**Files:**
- Modify: `index.html` (add `projectedRound` inside the `bracket-pure` block)
- Modify: `test/bracket.test.mjs` (append tests)

**Interfaces:**
- Consumes: `state = { stageComplete:boolean, done:{ R32:boolean, R16:boolean, QF:boolean, SF:boolean } }`.
- Produces: `projectedRound(state) -> 'R32'|'R16'|'QF'|'SF'|'FINAL'|null`. Returns the next stage to project; `null` once the final is reached/decided.

- [ ] **Step 1: Write the failing test**

Append to `test/bracket.test.mjs`:

```js
test('projectedRound: rolls forward one stage at a time', () => {
  const { projectedRound } = pure;
  const done = (o = {}) => Object.assign({ R32: false, R16: false, QF: false, SF: false }, o);
  assert.equal(projectedRound({ stageComplete: false, done: done() }), 'R32');
  assert.equal(projectedRound({ stageComplete: true,  done: done() }), 'R16');
  assert.equal(projectedRound({ stageComplete: true,  done: done({ R32: true }) }), 'QF');
  assert.equal(projectedRound({ stageComplete: true,  done: done({ R32: true, R16: true }) }), 'SF');
  assert.equal(projectedRound({ stageComplete: true,  done: done({ R32: true, R16: true, QF: true }) }), 'FINAL');
  assert.equal(projectedRound({ stageComplete: true,  done: done({ R32: true, R16: true, QF: true, SF: true }) }), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/`
Expected: FAIL — `projectedRound is not a function`.

- [ ] **Step 3: Add `projectedRound` to the pure block**

Inside the `bracket-pure` block (after `resolveSlot`), add:

```js
function projectedRound(state){
  if(!state.stageComplete) return 'R32';
  if(!state.done.R32) return 'R16';
  if(!state.done.R16) return 'QF';
  if(!state.done.QF)  return 'SF';
  if(!state.done.SF)  return 'FINAL';
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/`
Expected: PASS — all four pure functions green.

- [ ] **Step 5: Commit**

```bash
git add index.html test/bracket.test.mjs
git commit -m "feat: select the next stage to project"
```

---

## Task 5: Wire pure logic to live data (`buildProjectedBracket`)

**Files:**
- Modify: `index.html` — (a) attach parsed `slot` in `buildKnockout`; (b) add `buildProjectedBracket()` + `window.__bracket` hook after the pure block.

**Interfaces:**
- Consumes: globals `STATE.knockout`, `STAGE_COMPLETE`, `koRoundDone`, `DG`, `fifaOrder`, `THIRDS`, `koWhen`; pure `numberRounds`, `resolveSlot`, `projectedRound`.
- Produces: `buildProjectedBracket() -> { round:'R32'|…|null, ties:[{ when, venue, home:resolved, away:resolved }] }`. `home`/`away` are `resolveSlot` outputs.
- Produces: `window.__bracket = { buildProjectedBracket }` (browser-only verification hook).

- [ ] **Step 1: Attach parsed slots in `buildKnockout`**

In `buildKnockout` (~line 744), change the competitor mapper to also carry the parsed slot. Replace:

```js
    const mk=x=>({ab:x.team.abbreviation||'?',nm:x.team.displayName||x.team.shortDisplayName||x.team.abbreviation||'TBD',sc:scoreOf(x),win:!!x.winner});
```

with:

```js
    const mk=x=>({ab:x.team.abbreviation||'?',nm:x.team.displayName||x.team.shortDisplayName||x.team.abbreviation||'TBD',sc:scoreOf(x),win:!!x.winner,slot:parseSlot(x.team)});
```

- [ ] **Step 2: Add the wiring after the pure block**

Immediately after the `// </bracket-pure>` line, add:

```js
function projGroupPos(rank, group){
  const g=DG[group]; if(!g||!g.teams) return null;
  const ord=fifaOrder(g); const ab=ord[rank-1]; if(!ab) return null;
  const t=g.teams.find(x=>x.abbr===ab); if(!t) return null;
  return {ab:t.abbr, nm:t.name};
}
function makeThirdHint(){
  const used=new Set();   // greedy, so the same team isn't hinted into multiple slots
  return (eligible)=>{
    const cands=(THIRDS||[]).filter(t=>t.in && eligible.indexOf(t.group)>=0 && !used.has(t.abbr))
                            .sort((a,b)=>a.rank-b.rank);
    if(!cands.length) return null;
    used.add(cands[0].abbr);
    return {ab:cands[0].abbr, nm:cands[0].name, group:cands[0].group};
  };
}
function buildProjectedBracket(){
  const matches=STATE.knockout||[];
  const round=projectedRound({stageComplete:STAGE_COMPLETE, done:{
    R32:koRoundDone('R32'), R16:koRoundDone('R16'), QF:koRoundDone('QF'), SF:koRoundDone('SF')}});
  if(!round) return {round:null, ties:[]};
  const index=numberRounds(matches);
  const ctx={
    groupPos:projGroupPos,
    thirdHint:makeThirdHint(),
    feederMatch:(r,n)=>index[r+'#'+n]||null,
  };
  const ties=matches.filter(m=>m.round===round)
    .sort((a,b)=>a.kickoffMs-b.kickoffMs)
    .map(m=>({when:koWhen(m), venue:m.venue||'',
      home:resolveSlot(m.home.slot, ctx, 0),
      away:resolveSlot(m.away.slot, ctx, 0)}));
  return {round, ties};
}
window.__bracket={buildProjectedBracket};
```

- [ ] **Step 3: Verify pure tests still pass**

Run: `node --test test/`
Expected: PASS (the wiring lives outside the marker block, so extraction is unaffected).

- [ ] **Step 4: Verify the pipeline in a real browser via Playwright MCP**

Open the file and call the hook against the live group-stage snapshot:
- `browser_navigate` to `file:///Users/tsingh/Documents/Git_Repos/fifa_dashboard/index.html`
- `browser_evaluate` with:
  ```js
  () => { const b = window.__bracket.buildProjectedBracket();
          return { round: b.round, count: b.ties.length, sample: b.ties.slice(0,3) }; }
  ```
Expected: `round` is `"R32"`, `count` is `16`, and `sample` entries have `home`/`away` objects whose `kind` is one of `team`/`pos`/`third` (no `pair` yet, since group stage projects R32). At least one tie has a `third` slot with an `eligible` array, and `pos`/projected `team` slots carry a `note` like `"1st · Group F"`.

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "feat: build projected bracket from live standings"
```

---

## Task 6: Render the Projected Bracket (`renderProjectedBracket`)

**Files:**
- Modify: `index.html` — add CSS, a panel container in the body, `renderProjectedBracket()`, and a call in `renderAll()`.

**Interfaces:**
- Consumes: `buildProjectedBracket()` (Task 5).
- Produces: `renderProjectedBracket()` — fills `#projbracket`; safe no-op if the element is absent.

- [ ] **Step 1: Add CSS**

In the `<style>` block (near the `.thirds`/knockout card styles, ~line 142), add:

```css
.pb-wrap{display:flex;flex-direction:column;gap:12px}
.pb-head{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.pb-badge{font:700 11px/1 system-ui;letter-spacing:.08em;color:#fff;background:var(--warn,#D4850A);padding:4px 8px;border-radius:999px}
.pb-cap{color:var(--dim,#718096);font-size:12px}
.pb-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:10px}
.pb-card{background:var(--surface,#fff);border:1px solid var(--line,#e2e8f0);border-radius:12px;padding:12px}
.pb-when{font-size:11px;color:var(--dim,#718096);margin-bottom:8px}
.pb-slot{display:flex;align-items:baseline;gap:8px;padding:4px 0}
.pb-ab{font-weight:800;min-width:42px}
.pb-nm{font-size:13px}
.pb-proj{font-size:10px;color:var(--dim,#718096);font-weight:600}
.pb-tbd,.pb-third,.pb-pair{font-size:12px;color:var(--dim,#718096)}
.pb-hint{display:block;font-size:11px;color:var(--warn,#D4850A);margin-top:2px}
.pb-empty{padding:22px 16px;text-align:center;color:var(--dim,#718096);font-size:13px}
```

- [ ] **Step 2: Add the panel container in the body**

In the body, add a new section block (placement finalized in Task 7's tab wrapping; for now insert right before the `<!-- 07 KNOCKOUT WATCH -->` comment, ~line 520):

```html
  <!-- PROJECTED BRACKET -->
  <div class="sec-head" id="sec-projbracket"><span class="sec-num">★</span><h2>Projected Bracket</h2>
    <span class="sub">who'd meet whom in the next round — from current standings; winners are not predicted</span></div>
  <div id="projbracket"></div>
```

- [ ] **Step 3: Add `renderProjectedBracket()` and a `roundLabel` helper**

Near the other knockout render functions (after `renderKnockoutRounds`, ~line 1271), add:

```js
const PROJ_LABEL={R32:'Round of 32',R16:'Round of 16',QF:'Quarter-finals',SF:'Semi-finals',FINAL:'Final'};
function pbSlotHTML(r){
  if(r.kind==='team') return `<span class="pb-ab">${r.ab}</span><span class="pb-nm">${r.nm}${r.projected?` <span class="pb-proj">(${r.note})</span>`:''}</span>`;
  if(r.kind==='pos')  return `<span class="pb-tbd">${r.label}</span>`;
  if(r.kind==='third')return `<span class="pb-third">3rd of ${r.eligible.join('/')}${r.hint?`<span class="pb-hint">likely ${r.hint.ab} — 3rd · Grp ${r.hint.group}</span>`:''}</span>`;
  if(r.kind==='pair'){const lab=x=>x.kind==='team'?x.ab:(x.kind==='third'?('3rd '+x.eligible.join('/')):(x.label||'TBD'));
    return `<span class="pb-pair">Winner of ${lab(r.a)} v ${lab(r.b)}</span>`;}
  return `<span class="pb-tbd">${r.label||'TBD'}</span>`;
}
function renderProjectedBracket(){
  const el=document.getElementById('projbracket'); if(!el) return;
  const {round,ties}=buildProjectedBracket();
  if(!round||!ties.length){
    el.innerHTML='<div class="pb-empty">The bracket is fully resolved — see the Knockout tab for actual results.</div>';
    return;
  }
  const cards=ties.map(t=>`<div class="pb-card">
    <div class="pb-when">${t.when&&t.when.txt?t.when.txt:''}${t.venue?` · ${t.venue}`:''}</div>
    <div class="pb-slot">${pbSlotHTML(t.home)}</div>
    <div class="pb-slot">${pbSlotHTML(t.away)}</div></div>`).join('');
  el.innerHTML=`<div class="pb-wrap">
    <div class="pb-head"><span class="pb-badge">PROJECTED</span>
      <strong>${PROJ_LABEL[round]} — who'd meet whom</strong>
      <span class="pb-cap">assumes current standings · winners not predicted</span></div>
    <div class="pb-cards">${cards}</div></div>`;
}
```

- [ ] **Step 4: Call it from `renderAll()`**

In `renderAll()` (~line 1792), add `renderProjectedBracket();` right before `renderKnockoutWatch();`:

```js
function renderAll(){recompute();renderPhase();renderLiveBanner();renderSummary();renderToday();try{renderRooting();}catch(e){console.error('renderRooting error:',e);document.getElementById('rootingList').innerHTML='<div class="root-empty">Analysis error — try refreshing.</div>';}renderBoard();renderUpdate();renderGrid();renderThirds();renderProjectedBracket();renderKnockoutWatch();renderKnockoutRounds();renderFinal();}
```

- [ ] **Step 5: Verify render in the browser via Playwright MCP**

- `browser_navigate` to the `file://` path (reload).
- `browser_evaluate`:
  ```js
  () => { const el=document.getElementById('projbracket');
          return { cards: el.querySelectorAll('.pb-card').length,
                   hasBadge: !!el.querySelector('.pb-badge'),
                   firstCard: el.querySelector('.pb-card')?.innerText }; }
  ```
Expected: `cards` is `16`, `hasBadge` is `true`, and `firstCard` text shows two slot lines (team abbreviations and/or a "3rd of …" line).
- `browser_take_screenshot` of `#projbracket` for a visual sanity check (cards render, no overflow, hint line visible on third slots).

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "feat: render the projected bracket view"
```

---

## Task 7: Tabbed layout

**Files:**
- Modify: `index.html` — tab CSS, tab bar markup, panel wrappers around the eight section groups, a tab-controller IIFE, and conversion of existing "jump" buttons to tab activation.

**Interfaces:**
- Produces: `activateTab(id)` global — shows panel `#tab-${id}`, hides siblings, sets the matching `.tab` button `aria-selected`, and persists `id` to `localStorage['wc26.tab']`.
- Panels: `today, needs, mustnotlose, standings, thirds, projbracket, knockout, how`.

- [ ] **Step 1: Add tab CSS**

In `<style>`, add:

```css
.tabs{position:sticky;top:0;z-index:20;display:flex;gap:4px;overflow-x:auto;background:var(--bg,#0b0f14);
  border-bottom:1px solid var(--line,#e2e8f0);padding:8px 4px;margin:8px 0 14px}
.tab{flex:0 0 auto;border:1px solid var(--line,#e2e8f0);background:transparent;color:var(--dim,#718096);
  font:600 13px/1 system-ui;padding:8px 12px;border-radius:999px;cursor:pointer;white-space:nowrap}
.tab[aria-selected="true"]{background:var(--accent,#E4002B);color:#fff;border-color:transparent}
.tabpanel{display:none}
.tabpanel.active{display:block}
```

- [ ] **Step 2: Insert the tab bar**

Immediately after `<div class="summary" id="summary"></div>` (~line 443), insert:

```html
  <nav class="tabs" id="tabbar" role="tablist">
    <button class="tab" role="tab" data-tab="today">Today</button>
    <button class="tab" role="tab" data-tab="needs">Who Needs What</button>
    <button class="tab" role="tab" data-tab="mustnotlose">Must-Not-Lose</button>
    <button class="tab" role="tab" data-tab="standings">Standings</button>
    <button class="tab" role="tab" data-tab="thirds">Best Thirds</button>
    <button class="tab" role="tab" data-tab="projbracket">Projected Bracket</button>
    <button class="tab" role="tab" data-tab="knockout">Knockout</button>
    <button class="tab" role="tab" data-tab="how">How it works</button>
  </nav>
```

- [ ] **Step 3: Wrap each section group in a panel**

Wrap the existing markup (do **not** alter the section internals) by inserting opening `<div class="tabpanel" id="tab-...">` before each group's first element and a closing `</div>` after its last element, per this mapping:

- `tab-today` — wraps `<!-- 01 TODAY -->` block (sec-head + `#todayList`).
- `tab-needs` — wraps `<!-- 02 ROOTING GUIDE -->` block (through `#rootingList`).
- `tab-mustnotlose` — wraps `<!-- 03 BOARD -->` block (through the `.legend`).
- `tab-standings` — wraps `<!-- 04 UPDATE -->` **and** `<!-- 05 GROUPS -->` blocks (from the 04 sec-head through `#grid`).
- `tab-thirds` — wraps `<!-- 06 BEST THIRDS -->` block (through `#thirds`).
- `tab-projbracket` — wraps the `<!-- PROJECTED BRACKET -->` block (sec-head + `#projbracket`) added in Task 6.
- `tab-knockout` — wraps `<!-- 07 KNOCKOUT WATCH -->`, `<!-- 08 KNOCKOUT ROUNDS -->`, and `<!-- 09 GRAND FINAL -->` blocks (from the 07 sec-head through `#final`).
- `tab-how` — wraps the `<div class="method">…</div>` block.

Each wrapper looks like:

```html
  <div class="tabpanel" id="tab-today">
  <!-- 01 TODAY --> … existing markup … 
  </div>
```

- [ ] **Step 4: Add the tab controller**

Just before the closing `</script>` (end of file's main script), add:

```js
(function initTabs(){
  const KEY='wc26.tab', valid=['today','needs','mustnotlose','standings','thirds','projbracket','knockout','how'];
  window.activateTab=function(id){
    if(valid.indexOf(id)<0) id='today';
    valid.forEach(t=>{
      const p=document.getElementById('tab-'+t); if(p) p.classList.toggle('active', t===id);
    });
    document.querySelectorAll('#tabbar .tab').forEach(b=>b.setAttribute('aria-selected', String(b.dataset.tab===id)));
    try{localStorage.setItem(KEY,id);}catch(e){}
  };
  document.querySelectorAll('#tabbar .tab').forEach(b=>b.addEventListener('click',()=>window.activateTab(b.dataset.tab)));
  let start='today'; try{const s=localStorage.getItem(KEY); if(s&&valid.indexOf(s)>=0) start=s;}catch(e){}
  window.activateTab(start);
})();
```

- [ ] **Step 5: Convert existing jump buttons to tab activation**

Find buttons that scroll to a now-tabbed section (search `scrollIntoView`, ~line 432 — the "Best 3rd-place race" jump). Replace the inline `onclick="document.getElementById('sec-thirds').scrollIntoView(...)"` with `onclick="activateTab('thirds')"`. Apply the same for any other `scrollIntoView` jump that targets a section now inside a non-default tab (map the target id to its panel: `sec-thirds`→`thirds`, etc.).

Run: `grep -n "scrollIntoView" index.html`
Expected after edits: no remaining `scrollIntoView` call targets a tabbed section (jumps now call `activateTab`).

- [ ] **Step 6: Verify tabs in the browser via Playwright MCP**

- `browser_navigate` (reload).
- `browser_evaluate`:
  ```js
  () => ({ tabs: document.querySelectorAll('#tabbar .tab').length,
           activePanels: document.querySelectorAll('.tabpanel.active').length,
           defaultSelected: document.querySelector('#tabbar .tab[aria-selected="true"]')?.dataset.tab }) }
  ```
  Expected: `tabs` is `8`, `activePanels` is `1`, `defaultSelected` is `"today"`.
- `browser_click` the "Projected Bracket" tab; then `browser_evaluate` to confirm `#tab-projbracket` has class `active` and `#tab-today` does not, and `localStorage['wc26.tab'] === 'projbracket'`.
- `browser_take_screenshot` to confirm only one panel shows and the tab bar is sticky.

- [ ] **Step 7: Commit**

```bash
git add index.html
git commit -m "feat: tabbed layout replacing single-scroll dashboard"
```

---

## Task 8: Full integration pass

**Files:** none changed unless a regression is found.

- [ ] **Step 1: Run the pure unit suite**

Run: `node --test test/`
Expected: PASS — all tests across Tasks 1–4 green.

- [ ] **Step 2: Browser smoke test via Playwright MCP**

- `browser_navigate` (reload), then `browser_console_messages`.
- Expected: no uncaught errors. Click through all eight tabs; each shows its content (Today list, rooting, board, standings+predict, thirds, projected R32 bracket with 16 cards, knockout empty-state during group stage, how-it-works).
- Confirm the projected bracket still shows `round:"R32"` and 16 ties (group-stage behaviour), and the actual-knockout tab shows its "Round of 32 begins once the group stage wraps up." empty-state.

- [ ] **Step 3: Note the live-verification caveat**

Add a one-line code comment above `buildProjectedBracket` (if not already present) recording that R16+ feeder linkage relies on date-order match numbering and should be eyeballed once R32 starts (2026-06-28+):

```js
// NOTE: feeder linkage maps "Round of 32 N Winner" to the Nth R32 match by kickoff order.
// Only affects projections beyond R32; verify against ESPN once R32 begins (2026-06-28+).
```

- [ ] **Step 4: Final commit**

```bash
git add index.html
git commit -m "chore: integration pass for projected bracket + tabs"
```

---

## Self-Review

**Spec coverage:**
- §A1 capture slot identity → Task 1 (`parseSlot`) + Task 5 step 1 (attach in `buildKnockout`). ✓
- §A2 slot resolver (team/pos/third-with-hint/winner-pair, one level) → Task 3 + Task 5 (`thirdHint`/`groupPos`/`feederMatch` wiring). ✓
- §A3 rolling one-stage-ahead → Task 4 (`projectedRound`) + Task 5 (driven by `STAGE_COMPLETE`/`koRoundDone`). ✓
- §A4 render with PROJECTED badge + caption, dedicated tab → Task 6 + Task 7. ✓
- §A5 coexistence with actual knockout sections → Task 7 (separate Knockout tab). ✓
- §Part B tabs, grouped (Standings absorbs Predict/Log), sticky, localStorage default Today → Task 7. ✓
- §Background date-order numbering caveat → Task 2 + Task 8 step 3 comment. ✓
- Third-place slots as eligible-set + hint, never forced → Task 3 + Task 6 (`pbSlotHTML`). ✓

**Placeholder scan:** No TBD/TODO/"add error handling" — every code step shows complete code. (The literal string `'TBD'` appears only as a user-facing fallback label, not a plan gap.) ✓

**Type consistency:** `parseSlot` output kinds (`pos`/`third`/`feeder`/`team`) match `resolveSlot` inputs; `resolveSlot` outputs (`team`/`pos`/`third`/`pair`/`feeder`) match `pbSlotHTML` branches; `buildProjectedBracket` returns `{round,ties:[{when,venue,home,away}]}` consumed by `renderProjectedBracket`; `feederMatch` returns a match with `home.slot`/`away.slot` as attached in Task 5 step 1. ✓
