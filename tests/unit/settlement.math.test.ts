import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateIntegrityWeightedPayouts,
  calculateProportionalPayouts,
  isExactLadderSequence,
} from '../../apps/market-engine/src/settlement/settlement.math';

test('calculateIntegrityWeightedPayouts distributes by stake * integrity', () => {
  const payouts = calculateIntegrityWeightedPayouts(
    [
      { id: 'u1', stake: 100, integrityWeight: 1 },
      { id: 'u2', stake: 100, integrityWeight: 2 },
    ],
    300,
  );

  assert.equal(Math.round((payouts.get('u1') || 0) * 100) / 100, 100);
  assert.equal(Math.round((payouts.get('u2') || 0) * 100) / 100, 200);
});

test('calculateProportionalPayouts distributes by stake only', () => {
  const payouts = calculateProportionalPayouts(
    [
      { id: 'u1', stake: 20 },
      { id: 'u2', stake: 80 },
    ],
    50,
  );

  assert.equal(Math.round((payouts.get('u1') || 0) * 100) / 100, 10);
  assert.equal(Math.round((payouts.get('u2') || 0) * 100) / 100, 40);
});

test('isExactLadderSequence returns true only for exact order and full length', () => {
  const canonical = ['a', 'b', 'c'];
  assert.equal(isExactLadderSequence(['a', 'b', 'c'], canonical), true);
  assert.equal(isExactLadderSequence(['a', 'c', 'b'], canonical), false);
  assert.equal(isExactLadderSequence(['a', 'b'], canonical), false);
  assert.equal(isExactLadderSequence(undefined, canonical), false);
});
