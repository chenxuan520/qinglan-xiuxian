import { Game } from '../src/game.ts';
import { freshSave, realmInfo, settleRun, train, forge } from '../src/progress.ts';
import { DIFFICULTIES, STAGES, treasure } from '../src/data.ts';
import type { Choice } from '../src/game.ts';

function seeded(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}
const favored = ['sword', 'orbit', 'lightning', 'pulse', 'fire', 'chain'];
function rank(c: Choice, g: Game) {
  if (c.type === 'evolve') return 100;
  if (c.type === 'heal') return g.player.hp / g.player.maxHp < 0.5 ? 30 : -10;
  if (c.type === 'weapon')
    return (favored.includes(c.id) ? 15 : 1) + (c.level > 1 ? 5 : 2) + c.level;
  const needed = g.weapons.some((w) => treasure(w.id).passive === c.id && !w.evolved);
  return (
    (needed ? 16 : 0) +
    (['power', 'haste', 'guard', 'area'].includes(c.id) ? 4 : 0) +
    (c.level <= 3 ? 5 : 0)
  );
}
function steer(g: Game) {
  const p = g.player;
  let dx = 0,
    dy = 0;
  const gems = g.pickups
    .filter((i) => !i.pull)
    .sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y));
  const target = gems[0] ?? g.enemies[0];
  if (target) {
    const d = Math.hypot(target.x - p.x, target.y - p.y) || 1;
    dx += ((target.x - p.x) / d) * (gems.length ? 1 : 0.7);
    dy += ((target.y - p.y) / d) * (gems.length ? 1 : 0.7);
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
      dx -= ((z.x - p.x) / d) * 3;
      dy -= ((z.y - p.y) / d) * 3;
    }
  }
  const norm = Math.hypot(dx, dy) || 1;
  g.input = { x: dx / norm, y: dy / norm };
}
const results: Record<string, unknown>[] = [];
for (const difficulty of [0, 1, 2])
  for (const seed of [41, 82, 123]) {
    const save = freshSave();
    const game = new Game(save, 0, difficulty, seeded(seed));
    let upgrades = 0,
      minHp = 100;
    for (let i = 0; i < 420 * 30 && !['won', 'lost'].includes(game.state); i++) {
      if (game.state === 'upgrade') {
        const ranked = game.choices
          .map((c, index) => ({ index, rank: rank(c, game) }))
          .sort((a, b) => b.rank - a.rank);
        if (ranked[0].rank < 15 && game.rerolls) {
          game.reroll();
          continue;
        }
        game.choose(ranked[0].index);
        upgrades++;
      }
      if (i % 4 === 0) steer(game);
      game.update(1 / 30);
      minHp = Math.min(minHp, game.player.hp);
    }
    results.push({
      difficulty: DIFFICULTIES[difficulty].name,
      seed,
      state: game.state,
      seconds: Math.round(game.time),
      level: game.level,
      kills: game.kills,
      hp: Math.round(game.player.hp),
      minHp: Math.round(minHp),
      upgrades,
      loadout: game.weapons.map((w) => `${w.id}:${w.level}${w.evolved ? '*' : ''}`).join(' '),
    });
  }
console.table(results);
console.log(
  '模拟说明：新存档、固定种子、自动拾取与避让策略，非真人胜率。',
  '关卡',
  STAGES.length,
  '起始境界',
  realmInfo(0).name,
);

const campaignSave = freshSave();
const campaign: Record<string, unknown>[] = [];
for (let stage = 0; stage < 6; stage++) {
  for (let attempt = 0; attempt < 3; attempt++) {
    for (let i = 0; i < 12; i++) {
      train(campaignSave, 'power');
      train(campaignSave, 'vitality');
      train(campaignSave, 'speed');
    }
    for (let i = 0; i < 5; i++) for (const id of favored) forge(campaignSave, id);
    const game = new Game(campaignSave, stage, 0, seeded(73 + stage * 13 + attempt));
    for (
      let i = 0;
      i < (STAGES[stage].minutes * 60 + 180) * 30 && !['won', 'lost'].includes(game.state);
      i++
    ) {
      if (game.state === 'upgrade') {
        const ranked = game.choices
          .map((c, index) => ({ index, rank: rank(c, game) }))
          .sort((a, b) => b.rank - a.rank);
        if (ranked[0].rank < 15 && game.rerolls) {
          game.reroll();
          continue;
        }
        game.choose(ranked[0].index);
      }
      if (i % 4 === 0) steer(game);
      game.update(1 / 30);
    }
    settleRun(campaignSave, {
      stage,
      difficulty: 0,
      kills: game.kills,
      time: game.time,
      victory: game.state === 'won',
      iron: game.iron,
      level: game.level,
    });
    campaign.push({
      stage: STAGES[stage].name,
      attempt: attempt + 1,
      state: game.state,
      seconds: Math.round(game.time),
      kills: game.kills,
      level: game.level,
      realm: realmInfo(campaignSave.cultivation).name,
      training: JSON.stringify(campaignSave.training),
    });
    if (game.state === 'won') break;
  }
  if (campaignSave.unlocked < stage + 1 && stage < 5) break;
}
console.log('连续六境模拟：携带真实结算收益，局间自动修炼与炼器，每境最多三次尝试。');
console.table(campaign);
