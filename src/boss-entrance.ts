import { FINAL_TRIAL_STAGE, STAGES, TRIAL_BOSS_STAGES } from './data.ts';
import type { Game } from './game.ts';

export const BOSS_ENTRANCE_DURATION = 1.8;
export const BOSS_WARNING_DURATION = 0.8;

export const BOSS_ENTRANCE_THEMES = [
  { color: '#c5e4a2', title: '万木苏醒', particle: 'leaf' },
  { color: '#f0bb83', title: '赤焰临世', particle: 'ember' },
  { color: '#bce9f2', title: '寒魄凝霜', particle: 'ice' },
  { color: '#d1df91', title: '幽泽瘴起', particle: 'ember' },
  { color: '#d1b8ed', title: '幽门洞开', particle: 'ember' },
  { color: '#e5dcac', title: '天雷将至', particle: 'ice' },
  { color: '#f1d79b', title: '仙尊问劫', particle: 'ice' },
] as const;

// 只读取战斗时钟和瞬时效果，不耗随机数、不写存档，也不改变妖王刷新或攻击。
export function bossEntranceCue(game: Game) {
  if (game.tribulation || game.state === 'won' || game.state === 'lost') return null;
  const arrival = game.effects.filter((e) => e.kind === 'boss-entrance' && e.life > 0).at(-1);
  if (arrival && arrival.bossStage !== undefined)
    return {
      stage: arrival.bossStage,
      arriving: true,
      progress: Math.max(0, Math.min(1, 1 - arrival.life / BOSS_ENTRANCE_DURATION)),
      at: arrival,
    };
  const stage = game.isFinalTrial ? TRIAL_BOSS_STAGES[game.trialBossesSpawned] : game.stage;
  if (stage === undefined || (!game.isFinalTrial && game.bossSpawned)) return null;
  const spawnAt =
    game.stage === FINAL_TRIAL_STAGE ? game.nextTrialBossAt : STAGES[stage].minutes * 60;
  const until = spawnAt - game.time;
  if (until <= 0 || until > BOSS_WARNING_DURATION) return null;
  return { stage, arriving: false, progress: 1 - until / BOSS_WARNING_DURATION, at: null };
}
