import test from 'node:test';
import assert from 'node:assert/strict';
import { bestiaryPanel } from '../../src/content/bestiary-ui.ts';
import { bossSkills } from '../../src/battle/boss-skills.ts';
import { BOSS_SKILL_TEXT, BOSS_TRAITS } from '../../src/battle/boss-skill-text.ts';
import { BOSS_MECHANICS } from '../../src/battle/boss-mechanics.ts';
import { bestiaryEnemyStats } from '../../src/content/bestiary-stats.ts';
import { enemyCombatStats } from '../../src/battle/enemy-stats.ts';
import { Game } from '../../src/battle/game.ts';
import { freshSave } from '../../src/core/progress.ts';
import { formatNumber } from '../../src/core/number-format.ts';
import {
  DIFFICULTIES,
  ENEMIES,
  STAGES,
  STAGE_ENEMIES,
  TRIAL_BOSS_STAGES,
  TRIAL_BOSS_TIMES,
  enemyRoster,
} from '../../src/core/data.ts';

const seen = { enemies: ENEMIES.map((_, id) => id), bosses: STAGES.map((_, id) => id) };

test('图鉴使用关卡实战数值，不能把原始模板的气血与伤害作为入场值', () => {
  const normal = bestiaryEnemyStats(1, 0, 28)!;
  assert.equal(normal.first, 0);
  assert.equal(normal.end, 180);
  assert.ok(Math.abs(normal.hp[0] - 321.8429052 * 1.15) < 1e-8);
  assert.ok(Math.abs(normal.damage[0] - 40.4960145408 * 1.1 * 1.15) < 1e-8);
  assert.ok(Math.abs(normal.hp[1] - 544.6572241846154 * 1.15) < 1e-8);
  assert.notEqual(normal.hp[0], ENEMIES[28].hp);
  const elite = bestiaryEnemyStats(5, 0, 64, true)!;
  assert.ok(Math.abs(elite.hp[1] - 37837912.15605288 * 1.2) < 1e-6);
});

test('各境各难度普通与精英的展示范围，与解锁和生成时实际满血及触碰伤害一致', () => {
  for (let stage = 0; stage < STAGES.length; stage++) {
    for (let difficulty = 0; difficulty < DIFFICULTIES.length; difficulty++) {
      const game = new Game(freshSave(), stage, difficulty, () => 0.5);
      for (const type of STAGE_ENEMIES[stage]) {
        for (const elite of [false, true]) {
          const stats = bestiaryEnemyStats(stage, difficulty, type, elite)!;
          assert.ok(enemyRoster(stage, stats.first).includes(type));
          if (stats.first > 0) assert.ok(!enemyRoster(stage, stats.first - 0.001).includes(type));
          for (const [i, time] of [stats.first, stats.end].entries()) {
            game.time = time;
            const enemy = game.spawnEnemy(type, elite, false, { x: 0, y: 0 });
            assert.equal(enemy.maxHp, stats.hp[i]);
            assert.equal(enemy.hp, stats.hp[i]);
            assert.equal(enemy.damage, stats.damage[i]);
          }
          game.enemies = [];
        }
      }
    }
  }
  assert.equal(bestiaryEnemyStats(0, 0, 1)!.first, 20);
  assert.equal(bestiaryEnemyStats(0, 0, 3)!.first, 45);
  assert.equal(bestiaryEnemyStats(6, 0, 67)!.first, 45);
  assert.equal(bestiaryEnemyStats(6, 0, 69)!.first, 90);
  assert.equal(bestiaryEnemyStats(6, 0, 27)!.first, 150);
  assert.equal(bestiaryEnemyStats(0, 0, 65), undefined);
});

test('终关压力五分钟封顶且全为精英，前六境妖王战的新生妖物继续增强', () => {
  const trial = bestiaryEnemyStats(6, 0, 65)!;
  assert.equal(trial.end, 300);
  assert.deepEqual(trial, bestiaryEnemyStats(6, 0, 65, true));
  for (const time of [300, 330, 600]) {
    const stats = enemyCombatStats(6, 0, time, 65);
    assert.equal(stats.hp, trial.hp[1]);
    assert.equal(stats.damage, trial.damage[1]);
  }
  for (let stage = 0; stage < 6; stage++) {
    const type = STAGE_ENEMIES[stage][0];
    const stats = bestiaryEnemyStats(stage, 0, type)!;
    assert.ok(enemyCombatStats(stage, 0, stats.end + 60, type).hp > stats.hp[1]);
  }
});

test('妖王在原生秘境与终关使用各自数值，难度切换不漏任何首领', () => {
  for (let difficulty = 0; difficulty < DIFFICULTIES.length; difficulty++) {
    const trialHtml = bestiaryPanel(6, difficulty, [], seen).body;
    for (const [i, origin] of TRIAL_BOSS_STAGES.entries()) {
      for (const stage of origin === 6 ? [6] : [origin, 6]) {
        const game = new Game(freshSave(), stage, difficulty, () => 0.5);
        game.time = stage === 6 ? TRIAL_BOSS_TIMES[i] : STAGES[stage].minutes * 60;
        const actual = game.spawnEnemy(10, false, true, { x: 0, y: 0 }, origin);
        const html = stage === 6 ? trialHtml : bestiaryPanel(stage, difficulty, [], seen).body;
        assert.ok(html.includes(`气血 约${formatNumber(actual.maxHp)}`));
        assert.ok(html.includes(`触碰伤害 约${formatNumber(actual.damage)}`));
      }
    }
    const all = bestiaryPanel(-1, difficulty, [], seen).body;
    for (const enemy of ENEMIES) assert.ok(all.includes(enemy.name), enemy.name);
    assert.ok(all.includes(`数值按「${DIFFICULTIES[difficulty].name}」`));
  }
  assert.deepEqual(bestiaryPanel(0, -1), bestiaryPanel(0, 0));
});

test('图鉴保留本地与终关原妖王招式，说明减速、同刻精英对照和守匣例外', () => {
  assert.match(bestiaryPanel(0).body, /同刻精英对照/);
  assert.match(bestiaryPanel(0).body, /并非每种精英都会/);
  assert.match(bestiaryPanel(0).body, /守匣守卫.*七成/);
  assert.match(bestiaryPanel(2).body, /双道冰棱夹击，命中移速降低25%/);
  assert.match(bestiaryPanel(5).body, /近处突袭/);
  const trial = bestiaryPanel(6).body;
  assert.match(trial, /0:45后追加蓄势冲刺/);
  assert.match(trial, /唤来两名护卫/);
  assert.match(trial, /九尾炎扇<\/span> 快慢两层炎扇，九发与八发/);
  assert.match(trial, /踏雪突袭<\/span> 单次蓄势扑击，横移可躲/);
  for (const name of ['十字天雷', '五毒瘴池', '摄魂灵轮']) assert.ok(trial.includes(name));
  for (const name of ['三叠天雷']) assert.ok(!trial.includes(name));
});

test('妖物志妖王招式说明覆盖全部名称且卡片按特性与招式顺序输出', () => {
  assert.equal(BOSS_TRAITS.length, 7);
  const names = new Set<string>();
  for (let stage = 0; stage < 7; stage++)
    for (const trial of [false, true])
      for (const name of bossSkills(stage, trial)) {
        names.add(name);
        assert.ok(BOSS_SKILL_TEXT[name], `${name} 缺少说明`);
      }
  assert.deepEqual(new Set(Object.keys(BOSS_SKILL_TEXT)), names);

  const card = (stage: number, page = stage) => {
    const html = bestiaryPanel(page).body;
    const article = html.match(
      new RegExp(`<article class="enemy-card" data-boss-stage="${stage}">[^]*?</article>`),
    )![0];
    return article;
  };
  const wood = card(0);
  assert.match(wood, /<span class="boss-skill-name">特性<\/span>弹幕与藤圈附藤缠/);
  assert.doesNotMatch(wood, /<\/span> · /);
  const namesInCard = [...wood.matchAll(/<span class="boss-skill-name">([^<]+)<\/span>/g)].map(
    (m) => m[1],
  );
  assert.deepEqual(namesInCard, ['特性', ...bossSkills(0, false)]);

  const trialPoison = card(3, 6);
  assert.match(trialPoison, /游瘴驱逐/);
  assert.doesNotMatch(card(3), /游瘴驱逐/);
  assert.match(
    trialPoison,
    new RegExp(`持续<span class="combat-unit">${BOSS_MECHANICS.nativeMiasmaLife}秒</span>`),
  );
});
