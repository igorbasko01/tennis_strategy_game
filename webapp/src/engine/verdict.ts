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

export interface Verdict {
  /** Short plain-language call, e.g. "Good read, unlucky". */
  title: string;
  /** The chance, before the dice, that `me` won this duel (0-1). */
  chance: number;
  /** e.g. "to hold" or "to get it past". */
  chanceLabel: string;
  /** True when `me` won the duel. */
  won: boolean;
  /** The biggest non-luck reasons, e.g. "−0.40 misread", "+0.20 fresh legs". */
  reasons: string[];
}

const signed = (n: number) => `${n > 0 ? '+' : '−'}${Math.abs(n).toFixed(2)}`;

/** Ignore effects too small to matter. */
const NOTABLE = 0.03;

/** Explains a duel from `me`'s side: the odds before the dice, and why. */
export const duelVerdict = (d: Duel, me: PlayerIndex): Verdict => {
  const p = hitChance(d);
  const defending = d.defender === me;
  const chance = defending ? 1 - p : p;
  const won = defending ? !d.hitterWins : d.hitterWins;
  const favoured = chance >= 0.5;
  const readRight = d.readCalc.modifier > 0;
  const scramble = d.scramble;
  const readFatigue = d.readCalc.energy - scramble;

  let title: string;
  if (defending) {
    if (won) title = favoured ? (readRight ? 'Right read' : 'Saved it') : 'Lucky save';
    else title = favoured ? 'Good read, unlucky' : readRight ? 'Right read, outplayed' : 'Wrong read';
  } else if (won) title = favoured ? 'Good shot' : 'Lucky shot';
  else title = favoured ? 'Unlucky' : readRight ? 'They read it' : 'Covered anyway';

  const reasons: string[] = [];
  const readNote = readRight ? 'right read' : 'misread';
  if (defending) {
    reasons.push(`${signed(d.readCalc.modifier)} ${readNote}`);
    if (scramble >= NOTABLE) reasons.push(`${signed(scramble)} fresh legs`);
    if (readFatigue <= -NOTABLE) reasons.push(`${signed(readFatigue)} tired`);
  } else {
    reasons.push(`${signed(d.readCalc.modifier)} their ${readNote}`);
    if (scramble >= NOTABLE) reasons.push(`${signed(scramble)} their fresh legs`);
    if (Math.abs(d.shotCalc.position) >= NOTABLE) reasons.push(`${signed(d.shotCalc.position)} ${d.shotCalc.position > 0 ? 'in position' : 'stretched'}`);
    if (d.shotCalc.energy <= -NOTABLE) reasons.push(`${signed(d.shotCalc.energy)} tired`);
  }
  return { title, chance, chanceLabel: defending ? 'to hold' : 'to get it past', won, reasons };
};
