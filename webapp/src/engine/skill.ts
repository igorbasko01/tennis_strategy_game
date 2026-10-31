export type SkillTierId = 'beginner' | 'club' | 'pro' | 'elite' | 'legend';

export interface SkillTier {
  id: SkillTierId;
  label: string;
  /** Player skill, 0.0 - 1.0. */
  skill: number;
  /**
   * How sharply a CPU at this tier exploits what it has learned about the opponent:
   * softmax temperature for its choices, or null to choose uniformly at random.
   */
  cpuTemperature: number | null;
}

export const SKILL_TIERS: readonly SkillTier[] = [
  { id: 'beginner', label: 'Beginner', skill: 0.3, cpuTemperature: null },
  { id: 'club', label: 'Club', skill: 0.4, cpuTemperature: 0.5 },
  { id: 'pro', label: 'Pro', skill: 0.5, cpuTemperature: 0.35 },
  { id: 'elite', label: 'Elite', skill: 0.6, cpuTemperature: 0.2 },
  { id: 'legend', label: 'Legend', skill: 0.7, cpuTemperature: 0.12 },
];

export const skillTier = (id: string): SkillTier | undefined => SKILL_TIERS.find((t) => t.id === id);
