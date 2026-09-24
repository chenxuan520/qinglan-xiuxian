import { Game } from '../src/game.ts';
import { freshSave, realmInfo, settleRun } from '../src/progress.ts';
import { FINAL_TRIAL_STAGE, STAGES } from '../src/data.ts';
import { autoplayChoice, autoplayInput } from '../src/autoplay.ts';

function seeded(seed: number) {
  return () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
}
const rootIds = ['heaven', 'dual', 'triple', 'quad', 'five', 'none'] as const;
const args = process.argv.slice(2);
if (args.some((arg) => !arg.startsWith('--seeds=') && !arg.startsWith('--roots=')))
  throw new Error('仅支持 --seeds=42,73 和 --roots=heaven,five');
const seeds = (args.find((arg) => arg.startsWith('--seeds='))?.slice(8) ?? '42,73,137')
  .split(',')
  .map((value) => {
    const seed = Number(value);
    if (!/^\d+$/.test(value) || !Number.isInteger(seed) || seed > 0xffffffff)
      throw new Error(`无效种子：${value}，需为 0 至 4294967295 的整数`);
    return seed;
  });
const roots = (args.find((arg) => arg.startsWith('--roots='))?.slice(8) ?? rootIds.join(','))
  .split(',')
  .map((value) => {
    const root = rootIds.find((id) => id === value);
    if (!root) throw new Error(`无效灵根：${value}，可选 ${rootIds.join(',')}`);
    return root;
  });

const results = [];
const summary = [];
for (const root of roots) {
  const clears = Array(FINAL_TRIAL_STAGE + 1).fill(0);
  for (const seed of seeds) {
    const random = seeded(seed);
    const save = freshSave(root, undefined, 'orthodox', random);
    save.starter = 'sword';
    for (let stage = 0; stage <= FINAL_TRIAL_STAGE; stage++) {
      const startRealm = realmInfo(
        save.cultivation,
        save.completed.includes(FINAL_TRIAL_STAGE),
      ).name;
      const g = new Game(save, stage, 0, random);
      for (
        let frame = 0;
        frame < 900 * 30 && !['won', 'lost'].includes(g.state) && !g.expired;
        frame++
      ) {
        while (g.state === 'upgrade') {
          const choice = autoplayChoice(g)!;
          if (choice.reroll) g.reroll();
          else g.choose(choice.index);
        }
        if (frame % 4 === 0) g.input = autoplayInput(g);
        g.update(Math.min(1 / 30, 900 - g.time));
      }
      const state = g.expired
        ? '寿尽'
        : g.state === 'won'
          ? '胜'
          : g.state === 'lost'
            ? '负'
            : '超时';
      if (state === '胜') {
        settleRun(save, { ...g.snapshot(), victory: true });
        clears[stage]++;
      }
      results.push({
        root,
        seed,
        stage: stage + 1,
        startRealm,
        endRealm: realmInfo(save.cultivation, save.completed.includes(FINAL_TRIAL_STAGE)).name,
        seconds: Number(g.time.toFixed(1)),
        level: g.level,
        state,
        kills: g.kills,
        bossHp:
          g.enemies
            .filter((enemy) => enemy.boss && !enemy.dead)
            .map(
              (enemy) =>
                `${STAGES[enemy.bossStage ?? stage].boss} ${((100 * enemy.hp) / enemy.maxHp).toFixed(1)}%`,
            )
            .join('; ') || '无存活',
      });
      if (state !== '胜') break;
    }
  }
  summary.push({
    root,
    ...Object.fromEntries(
      clears.map((count, stage) => [`连通${stage + 1}关`, `${count}/${seeds.length}`]),
    ),
  });
}
console.table(results);
console.table(summary);
console.log(
  '固定种子 AI 顺推：正道、同本命青霄剑、初入仙途，无额外永久强化，不用丹、不复活、不换本命。每关最多 900 秒，胜后结算再进下一关，失败或寿尽或超时即停。',
  '汇总为连续通过前 N 关的种子数 / 总种子数；bossHp 列出所有存活妖王血量占比，无存活不代表尚未出场的妖王已被击败。仅供调参，不断言通关目标或真人胜率。',
);
