import { RANDOM_RANGE, type Duel, type PlayerIndex } from './resolution';

/**
 * The chance the shot beats the read before the dice are rolled: everything
 * but luck is known, and each side then adds a uniform roll of ±RANDOM_RANGE.
 */
export const hitChance = (d: Duel): number => {
  const edge = d.shotCalc.total - d.shotCalc.random - (d.readCalc.total - d.readCalc.random);
  // The shot wins when its roll minus the read's roll beats -edge; that
  // difference is triangular on [-w, w].
  const w = 2 * RANDOM_RANGE;
  const x = -edge;
  if (x >= w) return 0;
  if (x <= -w) return 1;
  return x >= 0 ? (w - x) ** 2 / (2 * w * w) : 1 - (w + x) ** 2 / (2 * w * w);
};

export type FactorId = 'skill' | 'choices' | 'position' | 'energy' | 'luck';

/** One part of the gap between the two totals, from the player's side: + helped, − hurt. */
export interface Factor {
  id: FactorId;
  value: number;
}

export interface Verdict {
  /** Short plain-language call, e.g. "Good read, unlucky". */
  title: string;
  /** The chance, before the dice, that `me` won this duel (0-1). */
  chance: number;
  /** e.g. "to hold" or "to get it past". */
  chanceLabel: string;
  /** True when `me` won the duel. */
  won: boolean;
  /** What decided the duel, biggest first; parts too small to matter are left out. They add up to the final gap. */
  factors: Factor[];
}

/** Ignore parts too small to matter. */
const NOTABLE = 0.03;

/** Explains a duel from `me`'s side: the odds before the dice, the call, and what decided it. */
export const duelVerdict = (d: Duel, me: PlayerIndex, opponent = 'They'): Verdict => {
  const p = hitChance(d);
  const defending = d.defender === me;
  const chance = defending ? 1 - p : p;
  const won = defending ? !d.hitterWins : d.hitterWins;
  const favoured = chance >= 0.5;
  const readRight = d.readCalc.modifier > 0;

  let title: string;
  if (defending) {
    if (won) title = favoured ? (readRight ? 'Right read' : 'Saved it') : 'Lucky save';
    else if (favoured) title = readRight ? 'Good read, unlucky' : 'Unlucky';
    else title = readRight ? 'Right read, outplayed' : 'Wrong read';
  } else if (won) title = favoured ? 'Good shot' : 'Lucky shot';
  else title = favoured ? 'Unlucky' : readRight ? `${opponent} read it` : `${opponent} covered it`;

  // Every part of the totals, as mine minus theirs.
  const [mine, theirs] = defending ? [d.readCalc, d.shotCalc] : [d.shotCalc, d.readCalc];
  const factors: Factor[] = (
    [
      { id: 'skill', value: mine.skill - theirs.skill },
      { id: 'choices', value: mine.modifier - theirs.modifier },
      { id: 'position', value: mine.position - theirs.position },
      { id: 'energy', value: mine.energy - theirs.energy },
      { id: 'luck', value: mine.random - theirs.random },
    ] as Factor[]
  )
    .map((f) => ({ ...f, value: Math.round(f.value * 100) / 100 }))
    .filter((f) => Math.abs(f.value) >= NOTABLE)
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value));

  return { title, chance, chanceLabel: defending ? 'to hold' : 'to get it past', won, factors };
};
