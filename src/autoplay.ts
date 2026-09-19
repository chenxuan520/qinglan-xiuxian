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
  const preferred = { x: dx / norm, y: dy / norm };
  const charges = g.enemies.filter((e) => e.boss && !e.dead && e.charge > 0);
  if (!charges.length) return preferred;
  const speed = g.stats.speed;
  // 按剩余冲程计算整条危险带；预留两次120ms决策的移动距离，避免拾取目标把人拉回线内。
  const clearance = (e: (typeof charges)[number]) => e.radius + 13 + speed * 0.24;
  const distanceToPath = (x: number, y: number, e: (typeof charges)[number]) => {
    const along = Math.max(
      0,
      Math.min(Math.min(0.7, e.charge) * 820, (x - e.x) * e.dx + (y - e.y) * e.dy),
    );
    return Math.hypot(x - e.x - e.dx * along, y - e.y - e.dy * along);
  };
  if (!charges.some((e) => distanceToPath(p.x, p.y, e) < clearance(e))) return preferred;
  let best = preferred;
  let bestScore = Infinity;
  // 只在冲撞路径附近比较方向；同时评估所有妖王，交叉预警不会抵消成原地不动。
  for (let i = 0; i < 16; i++) {
    const x = Math.cos((i * Math.PI) / 8),
      y = Math.sin((i * Math.PI) / 8);
    let score = -(x * preferred.x + y * preferred.y) * 0.08;
    for (const e of charges) {
      for (const seconds of [0.12, 0.24, 0.36]) {
        const distance = distanceToPath(p.x + x * speed * seconds, p.y + y * speed * seconds, e);
        score += Math.max(0, 1 - distance / clearance(e));
      }
    }
    if (score < bestScore) {
      bestScore = score;
      best = { x, y };
    }
  }
  return best;
}
export function autoplayChoice(game: Game) {
  const ranked = game.choices
    .map((choice, index) => ({ index, score: choiceScore(choice, game) }))
    .sort((a, b) => b.score - a.score);
  if (!ranked.length) return null;
  return { index: ranked[0].index, reroll: ranked[0].score < 15 && game.rerolls > 0 };
}
