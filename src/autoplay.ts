import {
  treasure,
  evolutionPassives,
  MAX_WEAPON_LEVEL,
  MAX_PASSIVE_LEVEL,
  FINAL_TRIAL_STAGE,
} from './data.ts';
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
  // 六重法宝优先从领悟起补满配套功法；实际觉醒仍是最高优先级。
  if (
    c.level >= 1 &&
    c.level <= MAX_PASSIVE_LEVEL &&
    (g.passives[c.id] || 0) === c.level - 1 &&
    g.weapons.some((w) => {
      const required = evolutionPassives(treasure(w.id), g.path);
      return (
        !w.evolved &&
        w.level === MAX_WEAPON_LEVEL &&
        required.includes(c.id) &&
        !required.some((id) => (g.passives[id] || 0) >= MAX_PASSIVE_LEVEL)
      );
    })
  )
    return 50 + c.level * 5;
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
  const norm = Math.hypot(dx, dy) || 1;
  const preferred = { x: dx / norm, y: dy / norm };
  const charges = g.enemies.filter((e) => (e.boss || g.stage < 6) && !e.dead && e.charge > 0);
  const speed = g.stats.speed;
  const zones = g.zones.filter(
    (z) => z.hostile && z.life > 0 && Math.hypot(z.x - p.x, z.y - p.y) < z.radius + 8 + speed * 1.6,
  );
  if (!charges.length && !zones.length) return preferred;
  // 按剩余冲程计算整条危险带；预留两次120ms决策的移动距离，避免拾取目标把人拉回线内。
  const clearance = (e: (typeof charges)[number]) => e.radius + 13 + speed * 0.24;
  const distanceToPath = (x: number, y: number, e: (typeof charges)[number]) => {
    const along = Math.max(
      0,
      Math.min(
        Math.min(e.boss ? 0.7 : 0.55, e.charge) * (e.boss ? 820 : 380),
        (x - e.x) * e.dx + (y - e.y) * e.dy,
      ),
    );
    return Math.hypot(x - e.x - e.dx * along, y - e.y - e.dy * along);
  };
  if (!zones.length && !charges.some((e) => distanceToPath(p.x, p.y, e) < clearance(e)))
    return preferred;
  let best = preferred;
  let bestScore = Infinity;
  // 危险附近才比较方向；毒圈还比较原方向和等待，不能把所有有风险的方向一律拒绝。
  for (let i = 0; i < (zones.length ? 18 : 16); i++) {
    const x = i === 17 ? 0 : i === 16 ? preferred.x : Math.cos((i * Math.PI) / 8),
      y = i === 17 ? 0 : i === 16 ? preferred.y : Math.sin((i * Math.PI) / 8);
    let score = -(x * preferred.x + y * preferred.y) * 0.08;
    if (zones.length) {
      score -= (x * g.input.x + y * g.input.y) * 0.02;
      let risk = 0;
      for (const z of zones) {
        const zx = p.x - z.x,
          zy = p.y - z.y,
          radius = z.radius + 8;
        let enter = 0,
          exit = Infinity;
        if (x || y) {
          const along = zx * x + zy * y;
          const crossing = radius * radius - zx * zx - zy * zy + along * along;
          if (crossing <= 0) continue;
          const half = Math.sqrt(crossing);
          enter = Math.max(0, (-along - half) / speed);
          exit = (-along + half) / speed;
        } else if (zx * zx + zy * zy >= radius * radius) continue;
        // 先确认穿圈区间内有未消散的伤害tick；保留一轮决策余量。
        const delay = Math.max(0, z.delay);
        const tick = Math.max(0, z.tick);
        const nextTick = tick + Math.max(0, Math.ceil((enter - 0.12 - delay - tick) / 0.5)) * 0.5;
        // 缚根与寒霜在伤害间隔中仍持续减速，不能当作无害残影。
        if (
          !(g.stage < FINAL_TRIAL_STAGE && ['enemy-roots', 'enemy-frost'].includes(z.kind)) &&
          (nextTick > z.life || delay + nextTick > exit + 0.12)
        )
          continue;
        const exposure = Math.max(
          0,
          Math.min(exit, delay + z.life) - Math.max(enter, Math.max(0, delay - 0.12)),
        );
        risk += (exposure / 0.5) * (z.damage / Math.max(1, p.hp)) * 4;
      }
      for (const e of g.enemies) {
        if (e.dead) continue;
        const distance = Math.hypot(e.x - p.x, e.y - p.y) || 1;
        if (distance > e.radius + 13 + (speed + e.speed) * 0.36) continue;
        for (const seconds of [0.12, 0.24, 0.36]) {
          const approach = Math.min(distance, e.speed * seconds) / distance;
          const separation = Math.hypot(
            p.x + x * speed * seconds - e.x - (p.x - e.x) * approach,
            p.y + y * speed * seconds - e.y - (p.y - e.y) * approach,
          );
          risk +=
            Math.max(0, 1 - separation / (e.radius + 13 + speed * 0.12)) *
            (e.damage / Math.max(1, p.hp)) *
            4;
        }
      }
      // 无伤路线优先于拾取；所有方向都有风险时仍按累计损失选，而非停住。
      score += risk > 0 ? 1 + risk : 0;
    }
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
