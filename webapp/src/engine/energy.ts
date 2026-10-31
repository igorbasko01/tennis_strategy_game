import type { Duel } from './resolution';

/** Energy runs from 1 (fresh) to 0 (exhausted) and starts full every match. */
export const FULL_ENERGY = 1;

/** Penalty on every shot and read when completely exhausted; scales linearly with lost energy. */
export const MAX_FATIGUE = 0.15;

/** Share of a wrong read's penalty a fully fresh player can still recover from. */
export const MAX_RECOVERY_SHARE = 0.5;

/** Energy a defender spends reaching each kind of ball, before any misread. */
const DEFEND_COST: Record<string, number> = {
  wide: 0.018,
  body: 0.009,
  tLine: 0.018,
  crossCourt: 0.018,
  downTheLine: 0.018,
  centerDeep: 0.012,
  dropShot: 0.03,
};

/** Extra energy per 0.1 of misread penalty: changing direction late is tiring. */
const MISREAD_COST_PER_TENTH = 0.006;

/** Energy a hitter spends on the shot and on recovering afterwards. */
const HIT_COST = 0.006;

/** Energy regained after every point, and extra at each changeover. */
export const POINT_RECOVERY = 0.02;
export const CHANGEOVER_RECOVERY = 0.08;

const round2 = (n: number) => Math.round(n * 100) / 100 || 0;
const round3 = (n: number) => Math.round(n * 1000) / 1000;
const clamp = (n: number) => Math.min(FULL_ENERGY, Math.max(0, n));

/** Penalty applied to every shot and read: 0 when fresh, -MAX_FATIGUE when exhausted. */
export const fatiguePenalty = (energy: number): number => round2(-MAX_FATIGUE * (FULL_ENERGY - energy));

/** Part of a wrong read's penalty won back by a player with energy to spare. */
export const recoveryBonus = (readModifier: number, energy: number): number =>
  readModifier < 0 ? round2(-readModifier * MAX_RECOVERY_SHARE * energy) : 0;

/** Energy each player spends in one duel. */
export const duelCost = (duel: Duel): [number, number] => {
  const cost: [number, number] = [0, 0];
  const misread = Math.max(0, -duel.readCalc.modifier);
  cost[duel.hitter] += HIT_COST;
  cost[duel.defender] += DEFEND_COST[duel.shot] + (misread / 0.1) * MISREAD_COST_PER_TENTH;
  return cost;
};

export const spend = (energy: readonly [number, number], cost: readonly [number, number]): [number, number] => [
  round3(clamp(energy[0] - cost[0])),
  round3(clamp(energy[1] - cost[1])),
];

export const regain = (energy: readonly [number, number], amount: number): [number, number] => [
  round3(clamp(energy[0] + amount)),
  round3(clamp(energy[1] + amount)),
];
