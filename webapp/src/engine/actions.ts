// Action catalogue and modifier tables from docs/tennis_strategy_design.md.

export type ServeAction = 'wide' | 'body' | 'tLine';
export type ServeReceiveAction = 'wide' | 'neutral' | 'tLine';
export type AttackAction = 'crossCourt' | 'downTheLine' | 'centerDeep' | 'dropShot';
/** Defend actions anticipate one of the attack actions, so they share its ids. */
export type DefendAction = AttackAction;

export const SERVE_ACTIONS: readonly ServeAction[] = ['wide', 'body', 'tLine'];
export const SERVE_RECEIVE_ACTIONS: readonly ServeReceiveAction[] = ['wide', 'neutral', 'tLine'];
export const ATTACK_ACTIONS: readonly AttackAction[] = ['crossCourt', 'downTheLine', 'centerDeep', 'dropShot'];
export const DEFEND_ACTIONS: readonly DefendAction[] = ATTACK_ACTIONS;

export const SERVE_COST: Record<ServeAction, number> = {
  wide: -0.3,
  body: -0.1,
  tLine: -0.3,
};

export const ATTACK_COST: Record<AttackAction, number> = {
  crossCourt: -0.2,
  downTheLine: -0.3,
  centerDeep: -0.1,
  dropShot: -0.3,
};

/** serve -> receiver anticipation -> modifier */
export const SERVE_RECEIVE_MODIFIER: Record<ServeAction, Record<ServeReceiveAction, number>> = {
  wide: { wide: 0.3, neutral: -0.4, tLine: -0.6 },
  body: { wide: -0.3, neutral: 0.3, tLine: -0.3 },
  tLine: { wide: -0.6, neutral: -0.4, tLine: 0.3 },
};

/** attack -> defender anticipation -> modifier */
export const DEFEND_MODIFIER: Record<AttackAction, Record<DefendAction, number>> = {
  crossCourt: { crossCourt: 0.3, downTheLine: -0.6, centerDeep: -0.2, dropShot: -0.6 },
  downTheLine: { crossCourt: -0.6, downTheLine: 0.3, centerDeep: -0.4, dropShot: -0.3 },
  centerDeep: { crossCourt: -0.3, downTheLine: -0.3, centerDeep: 0.3, dropShot: -0.3 },
  dropShot: { crossCourt: -0.4, downTheLine: -0.4, centerDeep: -0.4, dropShot: 0.6 },
};

export const SERVE_LABEL: Record<ServeAction, string> = {
  wide: 'Wide',
  body: 'Body',
  tLine: 'T-Line',
};

export const SERVE_RECEIVE_LABEL: Record<ServeReceiveAction, string> = {
  wide: 'Wide',
  neutral: 'Neutral',
  tLine: 'T-Line',
};

export const ATTACK_LABEL: Record<AttackAction, string> = {
  crossCourt: 'Cross-Court',
  downTheLine: 'Down the Line',
  centerDeep: 'Center Deep',
  dropShot: 'Drop Shot',
};

export const SERVE_HINT: Record<ServeAction, string> = {
  wide: 'Pull them off the court',
  body: 'Safe, jams the returner',
  tLine: 'Down the middle',
};

export const SERVE_RECEIVE_HINT: Record<ServeReceiveAction, string> = {
  wide: 'Shade to the outside',
  neutral: 'Stay central',
  tLine: 'Shade to the middle',
};

export const ATTACK_HINT: Record<AttackAction, string> = {
  crossCourt: 'Diagonal, high margin',
  downTheLine: 'Straight, risky',
  centerDeep: 'Safe and deep',
  dropShot: 'Short over the net',
};
