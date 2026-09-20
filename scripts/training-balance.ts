import { Game } from '../src/game.ts';
import {
  freshSave,
  realmCost,
  realmInfo,
  settleRun,
  train,
  forge,
  claimArtifacts,
} from '../src/progress.ts';
import { STAGES } from '../src/data.ts';
import { autoplayChoice, autoplayInput } from '../src/autoplay.ts';

function seeded(seed: number) {
  return () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
}
function fight(game: Game) {
  for (
    let frame = 0;
    frame < (STAGES[game.stage].minutes * 60 + 300) * 30 && !['won', 'lost'].includes(game.state);
    frame++
  ) {
    if (game.state === 'upgrade') {
      const choice = autoplayChoice(game)!;
      if (choice.reroll) {
        game.reroll();
        continue;
      }
      game.choose(choice.index);
    }
    if (frame % 4 === 0) game.input = autoplayInput(game);
    game.update(1 / 30);
  }
}

const campaign = [];
const trial = [];
const weapons = ['sword', 'orbit', 'lightning', 'pulse', 'fire', 'chain'];
for (const root of ['heaven', 'dual', 'triple'] as const)
  for (const seed of [73, 146, 219]) {
    const save = freshSave(root);
    for (let stage = 0; stage < 6; stage++) {
      let cleared = false;
      for (let attempt = 0; attempt < 3; attempt++) {
        for (let i = 0; i < 12; i++) {
          train(save, 'power');
          train(save, 'vitality');
          train(save, 'speed');
        }
        for (let i = 0; i < 5; i++) for (const id of weapons) forge(save, id);
        const game = new Game(save, stage, 0, seeded(seed + stage * 13 + attempt));
        const startRealm = realmInfo(save.cultivation).name;
        fight(game);
        claimArtifacts(save);
        settleRun(save, {
          stage,
          difficulty: 0,
          kills: game.kills,
          time: game.time,
          victory: game.state === 'won',
          iron: game.iron,
          level: game.level,
          creditedCultivation: game.creditedCultivation,
          combatCultivation: game.combatCultivation,
          spiritRoot: game.spiritRoot,
        });
        campaign.push({
          root,
          seed,
          stage: stage + 1,
          attempt: attempt + 1,
          startRealm,
          endRealm: realmInfo(save.cultivation).name,
          state: game.state,
          seconds: Math.round(game.time),
          level: game.level,
          training: { ...save.training },
          stones: save.stones,
        });
        cleared = game.state === 'won';
        if (cleared) break;
      }
      if (!cleared) break;
    }
    for (const power of [0, 10, 20]) {
      const late = freshSave(root);
      late.cultivation = Array.from({ length: 23 }, (_, i) => realmCost(i)).reduce(
        (a, b) => a + b,
        0,
      );
      late.unlocked = 6;
      late.completed = [0, 1, 2, 3, 4, 5];
      late.training = { vitality: 10, power, speed: 8 };
      late.forge = Object.fromEntries(weapons.map((id) => [id, 5]));
      late.artifacts = [...new Set([...late.artifacts, ...weapons])];
      const game = new Game(late, 6, 0, seeded(seed));
      const damage = game.stats.damage;
      fight(game);
      trial.push({
        root,
        seed,
        power,
        damage,
        state: game.state,
        seconds: Math.round(game.time),
        bosses: game.trialBossesDefeated,
      });
    }
  }
console.log(JSON.stringify({ campaign, trial }, null, 2));
console.error(
  '固定种子 AI 样本：三种灵根、兼修、真实收益连续六境；终关固定大乘后期、五阶炼器，比较悟道 0/10/20 阶。无广告复活，不代表真人胜率。',
);
