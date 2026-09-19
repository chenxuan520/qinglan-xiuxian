import { Game } from '../src/game.ts';
import { freshSave, realmInfo, settleRun, train, forge, claimArtifacts } from '../src/progress.ts';
import { DIFFICULTIES, STAGES, CULTIVATION_PATHS, treasure, allowsSchool } from '../src/data.ts';
import { autoplayChoice, autoplayInput } from '../src/autoplay.ts';

function seeded(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}
const favored = ['sword', 'orbit', 'lightning', 'pulse', 'fire', 'chain'];
const results: Record<string, unknown>[] = [];
for (const difficulty of [0, 1, 2])
  for (const seed of [41, 82, 123]) {
    const save = freshSave();
    const game = new Game(save, 0, difficulty, seeded(seed));
    let upgrades = 0,
      minHp = 100;
    for (let i = 0; i < 420 * 30 && !['won', 'lost'].includes(game.state); i++) {
      if (game.state === 'upgrade') {
        const choice = autoplayChoice(game)!;
        if (choice.reroll) {
          game.reroll();
          continue;
        }
        game.choose(choice.index);
        upgrades++;
      }
      if (i % 4 === 0) game.input = autoplayInput(game);
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
for (const path of CULTIVATION_PATHS)
  for (const [index, starter] of [
    'pagoda',
    'scythe',
    'umbrella',
    'sand',
    'qin',
    'bloodpool',
  ].entries()) {
    if (!allowsSchool(path.id, treasure(starter).school)) continue;
    const save = { ...freshSave(), path: path.id, starter, artifacts: ['sword', 'nail', starter] };
    const game = new Game(save, 0, 0, seeded(51 + index * 37));
    for (let i = 0; i < 480 * 30 && !['won', 'lost'].includes(game.state); i++) {
      if (game.state === 'upgrade') {
        const choice = autoplayChoice(game)!;
        if (choice.reroll) {
          game.reroll();
          continue;
        }
        game.choose(choice.index);
      }
      if (i % 4 === 0) game.input = autoplayInput(game);
      game.update(1 / 30);
    }
    results.push({
      difficulty: '初入仙途',
      path: path.name,
      starter,
      state: game.state,
      seconds: Math.round(game.time),
      level: game.level,
      kills: game.kills,
      hp: Math.round(game.player.hp),
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

const campaign: Record<string, unknown>[] = [];
for (const path of CULTIVATION_PATHS) {
  for (const seed of [73, 146, 219]) {
    const campaignSave = {
      ...freshSave(),
      path: path.id,
      starter: path.id === 'demonic' ? 'nail' : 'sword',
    };
    for (let stage = 0; stage < 6; stage++) {
      for (let attempt = 0; attempt < 3; attempt++) {
        for (let i = 0; i < 12; i++) {
          train(campaignSave, 'power');
          train(campaignSave, 'vitality');
          train(campaignSave, 'speed');
        }
        for (let i = 0; i < 5; i++)
          for (const id of new Set([campaignSave.starter, ...favored]))
            if (allowsSchool(path.id, treasure(id).school)) forge(campaignSave, id);
        const game = new Game(campaignSave, stage, 0, seeded(seed + stage * 13 + attempt));
        const startRealm = realmInfo(
          campaignSave.cultivation,
          campaignSave.completed.includes(6),
        ).name;
        const maxHp = game.player.maxHp;
        const damage = Math.round(game.stats.damage * 100) / 100;
        let minHp = game.player.hp;
        for (
          let i = 0;
          i < (STAGES[stage].minutes * 60 + 180) * 30 && !['won', 'lost'].includes(game.state);
          i++
        ) {
          if (game.state === 'upgrade') {
            const choice = autoplayChoice(game)!;
            if (choice.reroll) {
              game.reroll();
              continue;
            }
            game.choose(choice.index);
          }
          if (i % 4 === 0) game.input = autoplayInput(game);
          game.update(1 / 30);
          minHp = Math.min(minHp, game.player.hp);
        }
        claimArtifacts(campaignSave);
        settleRun(campaignSave, {
          stage,
          difficulty: 0,
          kills: game.kills,
          time: game.time,
          victory: game.state === 'won',
          iron: game.iron,
          level: game.level,
          creditedCultivation: game.creditedCultivation,
          combatCultivation: game.combatCultivation,
        });
        campaign.push({
          path: path.name,
          seed,
          startRealm,
          maxHp,
          damage,
          minHp: Math.round(minHp),
          stage: STAGES[stage].name,
          attempt: attempt + 1,
          state: game.state,
          seconds: Math.round(game.time),
          kills: game.kills,
          level: game.level,
          realm: realmInfo(campaignSave.cultivation, campaignSave.completed.includes(6)).name,
          training: JSON.stringify(campaignSave.training),
        });
        if (game.state === 'won') break;
      }
      if (campaignSave.unlocked < stage + 1 && stage < 5) break;
    }
  }
}
console.log(
  '三流派各三个固定种子连续六境：携带真实结算收益，局间自动修炼与炼器，每境最多三次尝试。',
);
console.table(campaign);
