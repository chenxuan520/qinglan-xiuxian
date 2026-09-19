import { treasure, evolutionPassives } from './data.ts';
import type { Choice, Game } from './game.ts';

const favored = [
  'sword',
  'orbit',
  'lightning',
  'pulse',
  'fire',
  'chain',
  'pagoda',
  'cauldron',
  'umbrella',
  'scythe',
  'compass',
  'coffin',
];
function choiceScore(c: Choice, g: Game) {
  if (c.type === 'evolve') return 100;
  if (c.type === 'heal') return g.player.hp / g.player.maxHp < 0.5 ? 30 : -10;
  if (c.type === 'weapon')
    return (favored.includes(c.id) ? 15 : 10) + (c.level > 1 ? 8 : 2) + c.level;
  const needed = g.weapons.some(
    (w) => evolutionPassives(treasure(w.id), g.path).includes(c.id) && !w.evolved,
  );
  return (
    (needed ? 16 : 0) +
    (g.player.hp < g.player.maxHp * 0.5 && ['guard', 'bone', 'duration', 'devour'].includes(c.id)
      ? 10
      : 0) +
    (['power', 'haste', 'guard', 'area', 'blood', 'devour', 'bone', 'abyss'].includes(c.id)
      ? 4
      : 0) +
    (c.level <= 3 ? 5 : 0)
  );
}
export function autoplayInput(g: Game) {
  const p = g.player;
  let dx = 0,
    dy = 0;
  let nearest: Game['pickups'][number] | undefined;
  let nearestDistance = Infinity;
  for (const item of g.pickups) {
    if (item.pull) continue;
    const d = (item.x - p.x) ** 2 + (item.y - p.y) ** 2;
    if (d < nearestDistance) {
      nearest = item;
      nearestDistance = d;
    }
  }
  const target = nearest ?? g.enemies[0];
  if (target) {
    const d = Math.hypot(target.x - p.x, target.y - p.y) || 1;
    dx += ((target.x - p.x) / d) * (nearest ? 1 : 0.7);
    dy += ((target.y - p.y) / d) * (nearest ? 1 : 0.7);
  } else {
    dx = Math.cos(g.time * 0.3);
    dy = Math.sin(g.time * 0.3);
  }
  for (const e of g.enemies) {
    const d = Math.hypot(e.x - p.x, e.y - p.y) || 1;
    const radius = e.radius + (e.boss ? 135 : 100);
    if (d < radius) {
      const f = ((radius - d) / radius) * 2.4;
      dx -= ((e.x - p.x) / d) * f;
      dy -= ((e.y - p.y) / d) * f;
    }
  }
  for (const b of g.shots) {
    if (b.kind !== 'hostile') continue;
    const d = Math.hypot(b.x - p.x, b.y - p.y) || 1;
    if (d < 80) {
      dx -= ((b.x - p.x) / d) * 2;
      dy -= ((b.y - p.y) / d) * 2;
    }
  }
  for (const z of g.zones) {
    if (!z.hostile) continue;
    const d = Math.hypot(z.x - p.x, z.y - p.y) || 1;
    if (d < z.radius + 45) {
      dx += d < 1.01 ? 3 : ((p.x - z.x) / d) * 3;
      dy += ((p.y - z.y) / d) * 3;
    }
  }
  const norm = Math.hypot(dx, dy) || 1;
  return { x: dx / norm, y: dy / norm };
}
export function autoplayChoice(game: Game) {
  const ranked = game.choices
    .map((choice, index) => ({ index, score: choiceScore(choice, game) }))
    .sort((a, b) => b.score - a.score);
  if (!ranked.length) return null;
  return { index: ranked[0].index, reroll: ranked[0].score < 15 && game.rerolls > 0 };
}
