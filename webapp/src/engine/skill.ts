export type SkillTierId = 'beginner' | 'club' | 'pro' | 'elite' | 'legend';

export interface SkillTier {
  id: SkillTierId;
  label: string;
  /** Player skill, 0.0 - 1.0. */
  skill: number;
}

export const SKILL_TIERS: readonly SkillTier[] = [
  { id: 'beginner', label: 'Beginner', skill: 0.3 },
  { id: 'club', label: 'Club', skill: 0.4 },
  { id: 'pro', label: 'Pro', skill: 0.5 },
  { id: 'elite', label: 'Elite', skill: 0.6 },
  { id: 'legend', label: 'Legend', skill: 0.7 },
];

export const skillTier = (id: string): SkillTier | undefined => SKILL_TIERS.find((t) => t.id === id);
