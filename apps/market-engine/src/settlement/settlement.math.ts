export type StakeInput = {
  id: string;
  stake: number;
};

export type WeightedStakeInput = StakeInput & {
  integrityWeight?: number;
};

export function calculateProportionalPayouts(entries: StakeInput[], prizePool: number) {
  const totalStake = entries.reduce((sum, entry) => sum + entry.stake, 0);
  const payouts = new Map<string, number>();

  for (const entry of entries) {
    const payout = totalStake > 0 ? (entry.stake / totalStake) * prizePool : 0;
    payouts.set(entry.id, payout);
  }

  return payouts;
}

export function calculateIntegrityWeightedPayouts(
  entries: WeightedStakeInput[],
  prizePool: number,
) {
  const weightedTotals = entries.map((entry) => ({
    id: entry.id,
    weightedStake: entry.stake * (entry.integrityWeight ?? 1),
  }));
  const totalWeightedStake = weightedTotals.reduce((sum, entry) => sum + entry.weightedStake, 0);
  const payouts = new Map<string, number>();

  for (const entry of weightedTotals) {
    const payout = totalWeightedStake > 0 ? (entry.weightedStake / totalWeightedStake) * prizePool : 0;
    payouts.set(entry.id, payout);
  }

  return payouts;
}

export function isExactLadderSequence(
  rankedOutcomeIds: string[] | undefined,
  canonicalOutcomeIds: string[],
) {
  if (!rankedOutcomeIds?.length || rankedOutcomeIds.length !== canonicalOutcomeIds.length) {
    return false;
  }

  return canonicalOutcomeIds.every(
    (outcomeId, index) => rankedOutcomeIds[index]?.toString() === outcomeId,
  );
}
