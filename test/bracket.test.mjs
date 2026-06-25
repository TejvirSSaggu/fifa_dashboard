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
