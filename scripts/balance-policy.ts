import { CULTIVATION_PATHS, ROOT_STARTERS, SPIRIT_ROOTS } from '../src/data.ts';
import type { CultivationPath, SpiritRootId, WeaponKind } from '../src/data.ts';

// 对照版本只能在用户确认数值、完整实测和独立审查后更新，禁止自动接受当前结果。
export const BALANCE_REFERENCE = 'd10f276c3e28bd6a4150069c8973d2167fdfc7e7';
export const BALANCE_PROTOCOL = 1;
export const FULL_SEEDS = [
  41, 82, 123, 164, 205, 246, 287, 328, 369, 410, 451, 492, 533, 574, 615, 656, 697, 738, 779, 820,
];
export const PROFILES = ['bare', 'earned', 'ads-only', 'maxed'] as const;
export type Profile = (typeof PROFILES)[number];
export type Device = 'phone' | 'desktop';
export interface BalanceCase {
  root: SpiritRootId;
  path: CultivationPath;
  starter: WeaponKind;
  device: Device;
  profile: Profile;
  difficulty: number;
  seed: number;
}
export const LIMITS = {
  attempts: 5,
  battleSeconds: 1200,
  trialSeconds: 600,
  preparationOperations: 1000,
  supplies: 2000,
  borrows: 100,
  ratePoints: 0.1,
  starterRatePoints: 0.2,
  medianTime: 0.2,
  tailTime: 0.25,
  bossMedian: 0.25,
  bossTail: 0.3,
  growth: 0.2,
} as const;
// 用户最新确认：前六关无辅助连通率；容错为绝对百分点，终关不参与验收。
export const BARE_CLEAR_TARGETS: Record<
  SpiritRootId,
  { min: number; max: number; target: number }
> = {
  heaven: { min: 0.7, max: 1, target: 0.9 },
  variant: { min: 0.5, max: 0.9, target: 0.7 },
  dual: { min: 0.2, max: 0.6, target: 0.4 },
  triple: { min: 0.1, max: 0.5, target: 0.3 },
  quad: { min: 0, max: 0.3, target: 0.1 },
  five: { min: 0, max: 0.25, target: 0.05 },
  none: { min: 0, max: 0.1, target: 0 },
};

export function balanceCases(full: boolean, difficulties = full ? [0, 1, 2] : [0]): BalanceCase[] {
  const result: BalanceCase[] = [];
  for (const { id: root } of SPIRIT_ROOTS)
    for (const { id: path } of CULTIVATION_PATHS) {
      const starters = Object.values(ROOT_STARTERS).flatMap((pair) =>
        path === 'dual' ? pair : [pair[path === 'demonic' ? 1 : 0]],
      );
      // 快速门禁仍覆盖全部本命；完整门禁每个灵根/路线/设备/投入/难度有 20 个样本。
      const seeds = FULL_SEEDS.slice(0, full ? 20 : starters.length);
      for (const device of ['phone', 'desktop'] as const)
        for (const profile of PROFILES)
          for (const difficulty of difficulties)
            for (const [index, seed] of seeds.entries())
              result.push({
                root,
                path,
                starter: starters[index % starters.length],
                device,
                profile,
                difficulty,
                seed,
              });
    }
  return result;
}
export function caseKey(c: BalanceCase) {
  return [c.root, c.path, c.starter, c.device, c.profile, c.difficulty, c.seed].join('/');
}
export function seeded(seed: number) {
  return () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
}
