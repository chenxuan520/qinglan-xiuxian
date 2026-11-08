import { normalizeLeaderboardName, type LeaderboardBoard } from './leaderboard-contract.ts';

export const LEADERBOARD_PROFILE_KEY = 'qinglan-leaderboard-profile-v1';
export interface LeaderboardProfile {
  name: string;
  score: number;
}
type StorageAccess = () => Pick<Storage, 'getItem' | 'setItem'>;

// 只记下服务端确认过的署名与最高分，不存匿名身份Cookie，也不进入人物存档。
export function readLeaderboardProfile(
  storage: StorageAccess = () => localStorage,
): LeaderboardProfile | null {
  try {
    const value = JSON.parse(storage().getItem(LEADERBOARD_PROFILE_KEY) ?? 'null');
    const name = normalizeLeaderboardName(value?.name);
    return name && Number.isSafeInteger(value?.score) && value.score >= 0
      ? { name: name.name, score: value.score }
      : null;
  } catch {
    return null;
  }
}

export function rememberLeaderboardProfile(
  profile: LeaderboardProfile,
  storage: StorageAccess = () => localStorage,
) {
  const name = normalizeLeaderboardName(profile.name);
  if (!name || !Number.isSafeInteger(profile.score) || profile.score < 0) return;
  try {
    const prior = readLeaderboardProfile(storage);
    const score =
      prior && normalizeLeaderboardName(prior.name)!.key === name.key
        ? Math.max(prior.score, profile.score)
        : profile.score;
    storage().setItem(LEADERBOARD_PROFILE_KEY, JSON.stringify({ name: name.name, score }));
  } catch {
    // 浏览器拒绝记住署名不撤销已确认的服务端成绩。
  }
}

export function improvesLeaderboardProfile(
  board: LeaderboardBoard,
  score: number,
  profile: LeaderboardProfile | null,
) {
  const own = board.self ?? profile;
  if (!own) return true;
  const key = normalizeLeaderboardName(own.name)!.key;
  const listed = board.entries.find((item) => normalizeLeaderboardName(item.name)!.key === key);
  return (
    score >
    Math.max(
      own.score,
      listed?.score ?? 0,
      profile && normalizeLeaderboardName(profile.name)!.key === key ? profile.score : 0,
    )
  );
}
