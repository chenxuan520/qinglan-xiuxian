import assert from 'node:assert/strict';
import { ELEMENTS, ROOT_STARTERS, TREASURES, treasure } from '../src/data.ts';
import type { WeaponKind } from '../src/data.ts';

import {
  WEAPON_REPORT_PROTOCOL,
  FOCUSED_WEAPONS,
  REPLICATED_WEAPONS,
} from '../src/weapon-report.ts';
export { FOCUSED_WEAPONS, REPLICATED_WEAPONS } from '../src/weapon-report.ts';
export const WEAPON_BENCHMARK_PROTOCOL = WEAPON_REPORT_PROTOCOL;
export const benchmarkElements = ELEMENTS.map((e) => e.id);
export const benchmarkTriples = benchmarkElements.flatMap((a, i) =>
  benchmarkElements
    .slice(i + 1)
    .flatMap((b, j) => benchmarkElements.slice(i + j + 2).map((c) => [a, b, c])),
);
assert.equal(benchmarkTriples.length, 10);
export const BENCHMARK_REFERENCES = {
  orthodox: ['sword', 'lightning', 'pagoda'],
  demonic: ['fire', 'skull', 'coffin'],
} as const;
export const BENCHMARK_TEAMS = {
  orthodox: [
    ['lightning', 'pulse', 'compass', 'fan', 'meteor', 'pearl', 'spear'],
    ['sword', 'arrow', 'flute', 'dragon', 'beads', 'ice', 'qin'],
    ['cauldron', 'umbrella', 'ice', 'pulse', 'orbit', 'qin', 'pearl'],
  ],
  demonic: [
    ['fire', 'coffin', 'brush', 'axe', 'sand', 'whip', 'bloodpool'],
    ['nail', 'shard', 'skull', 'scythe', 'blade', 'talisman', 'nest'],
    ['bloodpool', 'chain', 'vortex', 'nest', 'banner', 'poison', 'talisman'],
  ],
} as const;

interface BaseCase {
  weapon: WeaponKind;
  stage: number;
  root: 'heaven' | 'triple';
  device: 'phone' | 'desktop';
  index: number;
  seed: number;
  policy: 'stock' | 'focused';
}
export interface NaturalWeaponCase extends BaseCase {
  kind: 'natural';
}
export interface PairedWeaponCase extends BaseCase {
  kind: 'pair';
  reference: WeaponKind;
  team: number;
  evolved: boolean;
}
export type WeaponCase = NaturalWeaponCase | PairedWeaponCase;
export interface WeaponPlanOptions {
  weapons: WeaponKind[];
  seeds: number;
  extended: boolean;
  seedOffset: number;
}
export function weaponCaseKey(c: WeaponCase) {
  return [
    c.kind,
    c.weapon,
    c.stage,
    c.root,
    c.device,
    c.index,
    c.seed,
    c.policy,
    ...(c.kind === 'pair' ? [c.reference, c.team, c.evolved] : []),
  ].join('/');
}
export function selectBenchmarkWeapons(value?: string): WeaponKind[] {
  if (value === undefined) return TREASURES.map((t) => t.id);
  const names = value.split(',').map((s) => s.trim());
  assert.ok(names.length && names.every(Boolean), '法宝筛选不能为空');
  const ids = names.map((name) => {
    const item = TREASURES.find((t) => t.id === name || t.name === name);
    assert.ok(item, `未知法宝：${name}`);
    return item.id;
  });
  return [...new Set(ids)];
}
export function weaponBenchmarkPlan(options: WeaponPlanOptions) {
  assert.ok(
    Number.isSafeInteger(options.seeds) && options.seeds >= 1 && options.seeds <= 100,
    '种子数须为1～100',
  );
  assert.ok(
    Number.isSafeInteger(options.seedOffset) &&
      options.seedOffset >= 0 &&
      options.seedOffset <= 1e9,
    '种子偏移须为0～1000000000',
  );
  assert.ok(
    options.weapons.length && new Set(options.weapons).size === options.weapons.length,
    '法宝列表不能为空或重复',
  );
  assert.ok(
    options.weapons.every((id) => TREASURES.some((t) => t.id === id)),
    '法宝列表包含未知项',
  );
  const result: WeaponCase[] = [];
  const natural = (weapon: WeaponKind, policy: BaseCase['policy']) => {
    for (const stage of [0, 2, 5])
      for (const root of ['heaven', 'triple'] as const)
        for (const device of ['phone', 'desktop'] as const)
          for (let index = 0; index < options.seeds; index++)
            result.push({
              kind: 'natural',
              weapon,
              stage,
              root,
              device,
              index,
              seed:
                62801 +
                index * 104729 +
                (root === 'heaven' ? 0 : 953) +
                stage * 15485863 +
                options.seedOffset,
              policy,
            });
  };
  const pair = (weapon: WeaponKind, replicate: boolean) => {
    const school = treasure(weapon).school;
    for (let team = 0; team < 3; team++)
      for (const evolved of [false, true])
        for (let i = 0; i < options.seeds; i++)
          for (const device of ['phone', 'desktop'] as const)
            result.push({
              kind: 'pair',
              weapon,
              reference: BENCHMARK_REFERENCES[school][(team + i) % 3],
              team,
              evolved,
              stage: 4,
              root: 'triple',
              device,
              index: i + (replicate ? Math.ceil(options.seeds / 10) * 10 : 0),
              seed:
                89189 + i * 104729 + team * 65537 + options.seedOffset + (replicate ? 13021127 : 0),
              policy: 'stock',
            });
  };
  for (const id of options.weapons) natural(id, 'stock');
  for (const id of options.weapons) pair(id, false);
  if (options.extended) {
    for (const id of options.weapons.filter((id) => FOCUSED_WEAPONS.includes(id)))
      natural(id, 'focused');
    for (const id of options.weapons.filter((id) => REPLICATED_WEAPONS.includes(id)))
      pair(id, true);
  }
  assert.equal(new Set(result.map(weaponCaseKey)).size, result.length, '测评计划不能重复');
  return result;
}
export function weaponCampaignPlan(options: WeaponPlanOptions) {
  if (!options.extended) return [];
  const result = [];
  for (const starter of Object.values(ROOT_STARTERS)
    .flat()
    .filter((id) => options.weapons.includes(id)))
    for (const root of ['heaven', 'triple'] as const)
      for (const device of ['phone', 'desktop'] as const)
        for (const seed of [13021169, 13021211])
          result.push({
            starter,
            path: treasure(starter).school,
            root,
            device,
            seed: seed + options.seedOffset,
            profile: 'bare' as const,
            difficulty: 0,
          });
  return result;
}
