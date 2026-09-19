import { Game } from '../src/game.ts';
import { freshSave, realmCost, realmInfo } from '../src/progress.ts';
import { autoplayChoice, autoplayInput } from '../src/autoplay.ts';

function seeded(seed: number) {
  return () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
}
const results = [];
for (const step of [15, 18, 21, 23]) {
  for (const seed of [41, 82, 123]) {
    const save = freshSave();
    save.unlocked = 6;
    save.completed = [0, 1, 2, 3, 4, 5];
    save.cultivation = Array.from({ length: step }, (_, i) => realmCost(i)).reduce(
      (a, b) => a + b,
      0,
    );
    save.training = { vitality: 10, power: 10, speed: 8 };
    save.forge = Object.fromEntries(
      ['sword', 'orbit', 'lightning', 'pulse', 'fire', 'chain'].map((id) => [id, 5]),
    );
    save.artifacts = [...new Set([...save.artifacts, ...Object.keys(save.forge)])];
    const g = new Game(save, 6, 0, seeded(seed));
    const startingRealm = realmInfo(save.cultivation).name;
    let minHp = g.player.hp;
    let level5m: number | null = null;
    let level10m: number | null = null;
    for (let frame = 0; frame < 1140 * 30 && !['won', 'lost'].includes(g.state); frame++) {
      if (g.state === 'upgrade') {
        const c = autoplayChoice(g)!;
        if (c.reroll) {
          g.reroll();
          continue;
        }
        g.choose(c.index);
      }
      if (frame % 4 === 0) g.input = autoplayInput(g);
      g.update(1 / 30);
      if (g.time >= 300) level5m ??= g.level;
      if (g.time >= 600) level10m ??= g.level;
      minHp = Math.min(minHp, g.player.hp);
    }
    results.push({
      realm: startingRealm,
      endRealm: realmInfo(save.cultivation).name,
      seed,
      state: g.state,
      seconds: Math.round(g.time),
      kings: g.trialBossesDefeated,
      level: g.level,
      level5m,
      level10m,
      kills: g.kills,
      minHp: Math.round(minHp),
      hp: Math.round(g.player.hp),
    });
  }
}
console.table(results);
console.log(
  '相同根基（10/10/8）、六件常用法宝五阶、兼修新局，固定种子 AI。仅比较境界收益，不代表真人胜率。',
);
