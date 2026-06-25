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
