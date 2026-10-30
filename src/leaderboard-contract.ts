import { LEADERBOARD_ACHIEVEMENTS_V1 } from './leaderboard-facts-v1.ts';
import { projectLeaderboardFactsV2 } from './leaderboard-facts-v2.ts';
import type { SaveData } from './progress.ts';
import type { FactsSeal } from './leaderboard-integrity.ts';
import type { CultivationPath, ElementId, SpiritRootId } from './data.ts';
import type { LifeMode } from './life-mode.ts';
import type { AdUsage } from './journey-score.ts';

export const LEADERBOARD_VERSION = 1;
export const LEADERBOARD_LIMIT = 100;
export const LEADERBOARD_NAME_LIMIT = 24;
export const LEADERBOARD_MAX_BYTES = 16384;
export type LeaderboardEnding = Exclude<SaveData['pendingReincarnation'], null> | 'immortal';

// 只传重算道果所需事实，不包含存档、聊天、信件或年表正文。
export interface LeaderboardFacts {
  ending: LeaderboardEnding;
  lifeMode: LifeMode;
  cultivation: number;
  completed: number[];
  age: number;
  tribulations: number;
  path: CultivationPath;
  spiritRoot: SpiritRootId;
  rootElements: ElementId[];
  training: SaveData['training'];
  retreatBonus: SaveData['retreatBonus'];
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
  inheritanceValue: number;
  adUsage: AdUsage;
}

export interface LeaderboardEntry {
  name: string;
  score: number;
  grade: string;
  title: string;
  lifeMode: LifeMode;
  ending: LeaderboardEnding;
  updatedAt: string;
}
export interface LeaderboardBoard {
  version: 1;
  limit: 100;
  minimumScore: number;
  entries: LeaderboardEntry[];
  self?: LeaderboardEntry | null;
}
export interface LeaderboardSubmission {
  version: 1;
  name: string;
  facts: LeaderboardFacts;
  seal: FactsSeal;
}
export interface LeaderboardResult {
  version: 1;
  status: 'saved' | 'unchanged';
  entry: LeaderboardEntry;
}
export const LEADERBOARD_ACHIEVEMENTS = LEADERBOARD_ACHIEVEMENTS_V1;

export function extractLeaderboardFacts(save: SaveData): LeaderboardFacts | null {
  const facts = projectLeaderboardFactsV2(save);
  return facts.ending ? { ...facts, ending: facts.ending } : null;
}
export function normalizeLeaderboardName(value: unknown) {
  if (typeof value !== 'string' || /[\p{Cc}\p{Cf}<>]/u.test(value)) return null;
  const name = value.normalize('NFKC').trim().replace(/\s+/gu, ' ');
  if (!name || [...name].length > LEADERBOARD_NAME_LIMIT || /[\p{Cc}\p{Cf}<>]/u.test(name))
    return null;
  return { name, key: name.toLowerCase() };
}
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
export function isLeaderboardEntry(value: unknown): value is LeaderboardEntry {
  if (!record(value)) return false;
  return (
    typeof value.name === 'string' &&
    normalizeLeaderboardName(value.name)?.name === value.name &&
    Number.isSafeInteger(value.score) &&
    Number(value.score) >= 0 &&
    typeof value.grade === 'string' &&
    value.grade.length <= 8 &&
    typeof value.title === 'string' &&
    value.title.length <= 12 &&
    ['normal', 'extreme'].includes(String(value.lifeMode)) &&
    ['lifespan', 'tribulation', 'ambush', 'extreme', 'immortal'].includes(String(value.ending)) &&
    typeof value.updatedAt === 'string' &&
    Number.isFinite(Date.parse(value.updatedAt))
  );
}
export function isLeaderboardBoard(value: unknown): value is LeaderboardBoard {
  if (
    !record(value) ||
    value.version !== LEADERBOARD_VERSION ||
    value.limit !== LEADERBOARD_LIMIT ||
    !Number.isSafeInteger(value.minimumScore) ||
    Number(value.minimumScore) < 0 ||
    !Array.isArray(value.entries) ||
    value.entries.length > LEADERBOARD_LIMIT ||
    !value.entries.every(isLeaderboardEntry) ||
    (Object.hasOwn(value, 'self') && value.self !== null && !isLeaderboardEntry(value.self))
  )
    return false;
  const names = value.entries.map((entry) => normalizeLeaderboardName(entry.name)!.key);
  return (
    new Set(names).size === names.length &&
    value.entries.every((entry, i, entries) => !i || entries[i - 1].score >= entry.score) &&
    value.minimumScore ===
      (value.entries.length === LEADERBOARD_LIMIT ? value.entries.at(-1)!.score : 0)
  );
}
export function isLeaderboardResult(value: unknown): value is LeaderboardResult {
  return (
    record(value) &&
    value.version === 1 &&
    ['saved', 'unchanged'].includes(String(value.status)) &&
    isLeaderboardEntry(value.entry)
  );
}
