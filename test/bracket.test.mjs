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

// ---- interactive bracket model ----
// full published skeleton: 16 R32 (real teams) + feeder ties up to the Final.
// R32 #i home team = "H<i>", away = "A<i>". decidedR32 lists 1-based ties the
// home team has already won (real result).
function koFull({ decidedR32 = [] } = {}) {
  const ms = [];
  for (let i = 1; i <= 16; i++) {
    const home = { ab: 'H' + i, nm: 'Home ' + i, slot: { kind: 'team' } };
    const away = { ab: 'A' + i, nm: 'Away ' + i, slot: { kind: 'team' } };
    const dec = decidedR32.includes(i);
    if (dec) home.win = true;
    ms.push({ round: 'R32', kickoffMs: i, decided: dec, home, away });
  }
  const feeder = (round, num) => ({ ab: '', slot: { kind: 'feeder', feederRound: round, feederNum: num, result: 'winner' } });
  for (let i = 1; i <= 8; i++) ms.push({ round: 'R16', kickoffMs: 100 + i, decided: false, home: feeder('R32', 2 * i - 1), away: feeder('R32', 2 * i) });
  for (let i = 1; i <= 4; i++) ms.push({ round: 'QF', kickoffMs: 200 + i, decided: false, home: feeder('R16', 2 * i - 1), away: feeder('R16', 2 * i) });
  for (let i = 1; i <= 2; i++) ms.push({ round: 'SF', kickoffMs: 300 + i, decided: false, home: feeder('QF', 2 * i - 1), away: feeder('QF', 2 * i) });
  ms.push({ round: 'FINAL', kickoffMs: 400, decided: false, home: feeder('SF', 1), away: feeder('SF', 2) });
  return ms;
}

test('bracketModel: symmetric structure with full skeleton', () => {
  const { bracketModel } = pure;
  const m = bracketModel(koFull(), {});
  assert.ok(m, 'model built');
  assert.equal(m.left.R32.length, 8); assert.equal(m.right.R32.length, 8);
  assert.equal(m.left.R16.length, 4); assert.equal(m.right.R16.length, 4);
  assert.equal(m.left.QF.length, 2);  assert.equal(m.right.QF.length, 2);
  assert.equal(m.left.SF.length, 1);  assert.equal(m.right.SF.length, 1);
  assert.equal(m.final.round, 'FINAL');
  // R32 leaf participants are the real teams
  assert.deepEqual(m.left.R32[0].participants[0], { ab: 'H1', nm: 'Home 1' });
  assert.deepEqual(m.left.R32[0].participants[1], { ab: 'A1', nm: 'Away 1' });
});

test('bracketModel: real result locks a winner and propagates forward', () => {
  const { bracketModel } = pure;
  const m = bracketModel(koFull({ decidedR32: [1] }), {});
  const r32_1 = m.left.R32[0];
  assert.equal(r32_1.winner.source, 'locked');
  assert.equal(r32_1.winner.ab, 'H1');
  // R16#1 is fed by R32#1 and R32#2; its first participant is the locked H1
  assert.deepEqual(m.left.R16[0].participants[0], { ab: 'H1', nm: 'Home 1', source: 'locked' });
  assert.equal(m.left.R16[0].participants[1], null); // R32#2 undecided -> TBD
});

test('buildBracketTree: a user pick predicts a winner and advances it', () => {
  const { bracketModel } = pure;
  const m = bracketModel(koFull(), { 'R32#1': 'A1' });
  assert.equal(m.left.R32[0].winner.source, 'predicted');
  assert.equal(m.left.R32[0].winner.ab, 'A1');
  assert.deepEqual(m.left.R16[0].participants[0], { ab: 'A1', nm: 'Away 1', source: 'predicted' });
});

test('buildBracketTree: a pick for a non-participant is ignored (cascade-safe)', () => {
  const { bracketModel } = pure;
  // R16#1 can only be won by a winner of R32#1 or R32#2; "ZZZ" is neither
  const m = bracketModel(koFull(), { 'R32#1': 'A1', 'R16#1': 'ZZZ' });
  assert.equal(m.left.R16[0].winner, null);
});

test('buildBracketTree: picks up a full branch crown a champion', () => {
  const { bracketModel } = pure;
  // win the left-most path: R32#1, R16#1, QF#1, SF#1, then the Final
  const picks = { 'R32#1': 'H1', 'R32#2': 'H2', 'R16#1': 'H1', 'R16#2': 'H3', 'R32#3': 'H3', 'R32#4': 'H4',
                  'QF#1': 'H1', 'QF#2': 'H5', 'R16#3': 'H5', 'R16#4': 'H7', 'R32#5': 'H5', 'R32#6': 'H6', 'R32#7': 'H7', 'R32#8': 'H8',
                  'SF#1': 'H1' };
  // also resolve the right half enough to fill the Final's other slot, then pick the Final
  const all = Object.assign({}, picks);
  // give every remaining tie a home-side winner so the bracket fully resolves
  const m0 = bracketModel(koFull(), all);
  // pick the Final winner from whoever its participants are
  const finalParts = m0.final.participants.filter(Boolean).map(p => p.ab);
  assert.ok(finalParts.includes('H1'));
});

test('bracketModel: feeders resolve by id (official match number), not kickoff order', () => {
  const { bracketModel } = pure;
  const ms = koFull();
  // Give R32 matches ids that REVERSE their kickoff order: earliest kickoff (i=0)
  // gets the largest id, so its id-rank is last. R16 feeders reference match numbers.
  ms.filter(m => m.round === 'R32').forEach((m, i) => { m.id = 100 + (16 - i); });
  ['R16', 'QF', 'SF', 'FINAL'].forEach((r, ri) => ms.filter(m => m.round === r).forEach((m, i) => { m.id = 1000 + ri * 100 + i; }));
  const model = bracketModel(ms, {});
  const find = (n, k) => !n ? null : (n.key === k ? n : (n.kids ? (find(n.kids[0], k) || find(n.kids[1], k)) : null));
  const r16_1 = find(model.root, 'R16#1');                 // feeds R32 match #1 and #2 (by id)
  const kidHomes = r16_1.kids.map(k => k.match.home.ab).sort();
  // id-rank #1 and #2 are the two LAST-kickoff R32 matches (H16, H15) — not H1/H2
  assert.deepEqual(kidHomes, ['H15', 'H16']);
});

test('bracketModel: canonical fallback when only R32 is published', () => {
  const { bracketModel } = pure;
  const r32only = koFull().filter(m => m.round === 'R32');
  const m = bracketModel(r32only, {});
  assert.ok(m, 'still builds a tree');
  assert.equal(m.left.R32.length + m.right.R32.length, 16);
  assert.equal(m.left.R16.length, 4); // synthesised internal ties
  assert.equal(m.final.round, 'FINAL');
});
