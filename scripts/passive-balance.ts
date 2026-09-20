import { Game } from '../src/game.ts';
import { freshSave, realmCost } from '../src/progress.ts';
import { TREASURES } from '../src/data.ts';
import { autoplayChoice, autoplayInput } from '../src/autoplay.ts';

const results = [];
for (const path of ['orthodox', 'demonic', 'dual'] as const)
  for (const root of ['heaven', 'triple', 'none'] as const)
    for (const seed of [41, 82, 123]) {
      let rng = seed;
      const save = freshSave(root);
      save.path = path;
      save.starter = path === 'demonic' ? 'nail' : 'sword';
      save.unlocked = 6;
      save.completed = [0, 1, 2, 3, 4, 5];
      save.cultivation = Array.from({ length: 23 }, (_, i) => realmCost(i)).reduce(
        (a, b) => a + b,
        0,
      );
      save.training = { vitality: 10, power: 10, speed: 8 };
      save.artifacts = TREASURES.map((t) => t.id);
      save.forge = Object.fromEntries(save.artifacts.map((id) => [id, 5]));
      const g = new Game(save, 6, 0, () => (rng = (rng * 1664525 + 1013904223) >>> 0) / 4294967296);
      for (let frame = 0; frame < 1140 * 30 && !['won', 'lost'].includes(g.state); frame++) {
        if (g.state === 'upgrade') {
          const choice = autoplayChoice(g)!;
          if (choice.reroll) {
            g.reroll();
            continue;
          }
          g.choose(choice.index);
        }
        if (frame % 4 === 0) g.input = autoplayInput(g);
        g.update(1 / 30);
      }
      results.push({
        path,
        root,
        seed,
        state: g.state,
        seconds: Math.round(g.time),
        bosses: g.trialBossesDefeated,
        hp: Math.round(g.player.hp),
        passives: g.passives,
      });
    }
console.log(JSON.stringify(results, null, 2));
console.error(
  '固定大乘后期、根基 10/10/8、全法宝五阶，无广告复活；三路线、天/普通三系/无灵根各三种子，不代表真人胜率。',
);
