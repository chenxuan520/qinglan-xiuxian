import type { SaveData } from './progress.ts';
import type { CultivationPath, ElementId, SpiritRootId } from './data.ts';
import type { LifeMode } from './life-mode.ts';

// 版本1的事实投影：保留本函数及成就清单。未来修改计分事实时新增版本，不回写旧规则。
// 包含进行中的事实（ending=null），留名资格由调用方另判，不能用hash(null)覆盖整个游玩期。
export interface LeaderboardSnapshotV1 {
  ending: 'lifespan' | 'tribulation' | 'ambush' | 'extreme' | 'immortal' | null;
  lifeMode: LifeMode;
  cultivation: number;
  completed: number[];
  age: number;
  tribulations: number;
  path: CultivationPath;
  spiritRoot: SpiritRootId;
  rootElements: ElementId[];
  training: { vitality: number; power: number; speed: number };
  retreatBonus: { vitality: number; power: number; speed: number };
  forge: Record<string, number>;
  artifacts: string[];
  starter: string;
  curios: string[];
  acquiredCurios: string[];
  member: string | null;
  mastery: Record<string, number>;
  peiyingUsed: number;
  achievements: string[];
  inherited: boolean;
  adUsage: {
    root: number;
    revive: number;
    lifespan: number;
    supplies: number;
    bestRoot: SpiritRootId;
  };
}
const ACHIEVEMENTS = [
  'story',
  'permanent-medicine',
  'curio-three',
  'mastery',
  'three-paths',
  'level-100',
  'collection',
  'six-immortals',
  'forge',
  'training-master',
  'five-tribulations',
  'hard-immortal',
  'one-life-clear',
  'rootless-immortal',
] as const;
export const LEADERBOARD_ACHIEVEMENTS_V1: readonly string[] = ACHIEVEMENTS;

export function projectLeaderboardFactsV1(save: SaveData): LeaderboardSnapshotV1 {
  const ending =
    save.pendingReincarnation ??
    (save.journeyEnded || save.completed.includes(6) ? 'immortal' : null);
  return {
    ending,
    lifeMode: save.lifeMode,
    cultivation: save.cultivation,
    completed: [...save.completed],
    age: save.age,
    tribulations: save.tribulations,
    path: save.path,
    spiritRoot: save.spiritRoot,
    rootElements: [...save.rootElements],
    training: {
      vitality: save.training.vitality,
      power: save.training.power,
      speed: save.training.speed,
    },
    retreatBonus: {
      vitality: save.retreatBonus.vitality,
      power: save.retreatBonus.power,
      speed: save.retreatBonus.speed,
    },
    forge: { ...save.forge },
    artifacts: [...save.artifacts],
    starter: save.starter,
    curios: Object.keys(save.curios.bag).filter(
      (id) => (save.curios.bag[id as keyof typeof save.curios.bag] ?? 0) > 0,
    ),
    acquiredCurios: [...save.curios.acquired],
    member: save.mortal.member?.id ?? null,
    mastery: { ...save.mortal.mastery },
    peiyingUsed: save.medicine.used.peiying ?? 0,
    achievements: ACHIEVEMENTS.filter((id) => Object.hasOwn(save.chronicle.milestones, id)),
    inherited:
      !!save.birthInheritance || Object.hasOwn(save.chronicle.milestones, 'birth-inheritance'),
    adUsage: {
      root: save.adUsage.root,
      revive: save.adUsage.revive,
      lifespan: save.adUsage.lifespan,
      supplies: save.adUsage.supplies,
      bestRoot: save.adUsage.bestRoot,
    },
  };
}
