import { REALMS } from './data.ts';
import type { Game } from './game.ts';

export const REALM_BREAKTHROUGH_DURATION = 0.6;
export const REALM_BREAKTHROUGH_COLORS = [
  '#c5e4a2',
  '#bde0c4',
  '#ecd79b',
  '#d1c0ed',
  '#b9dfef',
  '#dfc7ed',
  '#e8d2a5',
  '#f3d68d',
] as const;

export function realmBreakthroughCue(game: Game) {
  if (game.state === 'won' || game.state === 'lost') return null;
  const effect = game.effects.filter((e) => e.kind === 'realm-breakthrough' && e.life > 0).at(-1);
  if (!effect?.realmIndex || effect.realmIndex > 7) return null;
  return {
    name: REALMS[effect.realmIndex],
    color: effect.color,
    progress: Math.max(0, Math.min(1, 1 - effect.life / REALM_BREAKTHROUGH_DURATION)),
  };
}
