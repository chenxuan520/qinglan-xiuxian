import {
  ENEMIES,
  FINAL_TRIAL_STAGE,
  STAGES,
  TRIAL_ENEMY_TIMES,
  TRIAL_PRESSURE_SECONDS,
  enemyRoster,
} from './data.ts';
import { enemyCombatStats } from './enemy-stats.ts';

export function bestiaryEnemyStats(stage: number, difficulty: number, type: number, elite = false) {
  const duration = STAGES[stage].minutes * 60;
  const times =
    stage === FINAL_TRIAL_STAGE
      ? TRIAL_ENEMY_TIMES
      : [0, 20, duration * 0.25, duration * 0.5, duration * 0.75];
  const first = times.find((time) => enemyRoster(stage, time).includes(type));
  if (first === undefined || !ENEMIES[type]) return undefined;
  const end = stage === FINAL_TRIAL_STAGE ? TRIAL_PRESSURE_SECONDS : duration;
  const startStats = enemyCombatStats(stage, difficulty, first, type, elite);
  const endStats = enemyCombatStats(stage, difficulty, end, type, elite);
  return {
    first,
    end,
    hp: [startStats.hp, endStats.hp] as const,
    damage: [startStats.damage, endStats.damage] as const,
  };
}
