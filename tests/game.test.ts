import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.ts';
import { autoplayChoice, autoplayInput } from '../src/autoplay.ts';
import {
  TREASURES,
  PASSIVES,
  STAGES,
  ENEMIES,
  STAGE_REALM_STEPS,
  tribulationRules,
  xpNeeded,
} from '../src/data.ts';
import { spriteFrame } from '../src/sprites.ts';
import { joinSect } from '../src/mortal.ts';
import {
  freshSave,
  parseSave,
  realmCost,
  realmInfo,
  realmBonuses,
  realmHealthMultiplier,
  realmDamageMultiplier,
  syncTribulationClock,
  settleRun,
  train,
  forge,
} from '../src/progress.ts';

function seeded(seed = 42) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}
const createGame = () => new Game(freshSave(), 0, 0, seeded());
function advance(game: Game, seconds: number) {
  for (let i = 0; i < seconds * 20; i++) game.update(0.05);
}

test('暂停与升级选择冻结模拟，恢复后时间继续', () => {
  const game = createGame();
  game.pause();
  advance(game, 2);
  assert.equal(game.time, 0);
  game.resume();
  game.xp = xpNeeded(1);
  game.update(0.05);
  assert.equal(game.state, 'upgrade');
  assert.equal(game.level, 2);
  const time = game.time;
  advance(game, 2);
  assert.equal(game.time, time);
  assert.equal(game.choose(8), false);
  assert.equal(game.state, 'upgrade');
  assert.equal(game.choose(0), true);
  game.update(0.05);
  assert.ok(game.time > time);
});

test('只剩一个顿悟机缘时自动领取，无需暂停或重复弹窗', () => {
  const g = createGame();
  g.weapons = TREASURES.slice(0, 6).map((t) => ({ id: t.id, level: 6, evolved: true, timer: 999 }));
  g.passives = Object.fromEntries(PASSIVES.slice(0, 4).map((p) => [p.id, 5]));
  g.player.hp = 50;
  g.xp = xpNeeded(g.level);
  const events: string[] = [];
  g.onEvent = (name) => events.push(name);
  g.update(0.01);
  assert.equal(g.state, 'playing');
  assert.equal(g.level, 2);
  assert.equal(g.iron, 1);
  assert.deepEqual(g.choices, []);
  assert.ok(g.player.hp > 50);
  assert.ok(!events.includes('upgrade'));
});
test('斜向移动不比直线快，受伤具有无敌间隔', () => {
  const straight = createGame(),
    diagonal = createGame();
  straight.input = { x: 1, y: 0 };
  diagonal.input = { x: 1, y: 1 };
  advance(straight, 0.5);
  advance(diagonal, 0.5);
  assert.ok(Math.abs(straight.player.x - Math.hypot(diagonal.player.x, diagonal.player.y)) < 0.001);
  straight.hurtPlayer(10);
  straight.hurtPlayer(10);
  assert.equal(straight.player.hp, 90);
  straight.pause();
  advance(straight, 2);
  straight.hurtPlayer(10);
  assert.equal(straight.player.hp, 90);
});
test('36 种攻击法宝均能独立对妖物造成伤害', () => {
  assert.equal(TREASURES.length, 36);
  assert.equal(new Set(TREASURES.map((t) => t.id)).size, 36);
  for (const t of TREASURES) {
    const save = freshSave();
    save.starter = t.id;
    save.artifacts.push(t.id);
    const game = new Game(save, 0, 0, seeded());
    game.player.maxHp = game.player.hp = 10000;
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      game.spawnEnemy(4, false, false, { x: Math.cos(a) * 100, y: Math.sin(a) * 100 });
    }
    advance(game, 5);
    assert.ok(game.damageDealt > 0, `${t.name} 没有造成伤害`);
  }
});
test('每个进化配方满足条件后都进入选择，未满足时不出现', () => {
  for (const t of TREASURES) {
    const game = createGame();
    game.weapons = [{ id: t.id, level: 6, timer: 0, evolved: false }];
    assert.ok(!game.makeChoices().some((c) => c.type === 'evolve'));
    game.passives[t.passive] = 4;
    assert.ok(!game.makeChoices().some((c) => c.type === 'evolve'));
    game.passives[t.passive] = 5;
    game.state = 'upgrade';
    game.choices = game.makeChoices();
    assert.equal(game.choices[0].type, 'evolve');
    assert.equal(game.choices[0].id, t.id);
    game.choose(0);
    assert.equal(game.weapons[0].evolved, true);
    assert.ok(!game.makeChoices().some((c) => c.type === 'evolve'));
  }
});
test('单局同时觉醒六件仙器后只记录一次成就', () => {
  const game = createGame();
  game.weapons = TREASURES.slice(0, 6).map((item, index) => ({
    id: item.id,
    level: 6,
    timer: 0,
    evolved: index < 5,
  }));
  game.passives[TREASURES[5].passive] = 5;
  game.state = 'upgrade';
  game.choices = [{ type: 'evolve', id: game.weapons[5].id, level: 7 }];
  assert.equal(game.choose(0), true);
  assert.ok(Object.hasOwn(game.save.chronicle.milestones, 'six-immortals'));
  assert.equal(game.save.chronicle.entries.filter((entry) => entry.title === '六仙同御').length, 1);

  const restoredSave = freshSave();
  const oldRun = new Game(restoredSave, 0, 0);
  oldRun.weapons = TREASURES.slice(0, 6).map((item) => ({
    id: item.id,
    level: 6,
    timer: 0,
    evolved: true,
  }));
  const incomplete = oldRun.snapshot();
  incomplete.weapons[0].level = 5;
  assert.ok(Game.restore(restoredSave, incomplete));
  assert.equal(Object.hasOwn(restoredSave.chronicle.milestones, 'six-immortals'), false);
  assert.ok(Game.restore(restoredSave, oldRun.snapshot()));
  assert.equal(restoredSave.chronicle.milestones['six-immortals'], restoredSave.age);
});
test('满负载不会提供第七件法宝或第五种功法，重悟次数有上限', () => {
  const game = createGame();
  game.weapons = TREASURES.slice(0, 6).map((t) => ({
    id: t.id,
    level: 6,
    timer: 0,
    evolved: true,
  }));
  game.passives = Object.fromEntries(PASSIVES.slice(0, 4).map((p) => [p.id, 5]));
  game.state = 'upgrade';
  game.choices = game.makeChoices();
  assert.deepEqual(
    game.choices.map((c) => c.type),
    ['heal'],
  );
  assert.ok(game.reroll());
  assert.ok(game.reroll());
  assert.ok(game.reroll());
  assert.equal(game.reroll(), false);
});
test('妖物掉落灵气可拾取，精英宝匣直接升阶并给玄铁', () => {
  const game = createGame();
  const enemy = game.spawnEnemy(0, true, false, { x: 0, y: 0 });
  game.hitEnemy(enemy, enemy.maxHp);
  assert.equal(game.kills, 1);
  assert.ok(game.pickups.some((p) => p.kind === 'chest'));
  game.update(0.05);
  assert.equal(game.weapons[0].level, 2);
  assert.equal(game.iron, 2);
  assert.equal(game.level, 2);
});
test('倒计时结束只召唤妖王，击败才通关', () => {
  const game = createGame();
  game.time = STAGES[0].minutes * 60 - 0.01;
  game.update(0.05);
  assert.ok(game.bossSpawned);
  assert.ok(game.boss);
  assert.equal(game.state, 'playing');
  game.hitEnemy(game.boss!, 1e6);
  assert.equal(game.state, 'won');
});
test('死亡会结算失败，回血不会复活已结束的一局', () => {
  const game = createGame();
  game.hurtPlayer(1000);
  game.update(0.05);
  assert.equal(game.state, 'lost');
  const time = game.time;
  advance(game, 3);
  assert.equal(game.time, time);
  assert.equal(game.player.hp, 0);
});
test('前八境三阶段逐级突破，真仙只有一个境界并封顶', () => {
  assert.equal(realmInfo(0).name, '炼气初期');
  assert.equal(realmInfo(realmCost(0)).name, '炼气中期');
  const toFoundation = realmCost(0) + realmCost(1) + realmCost(2);
  assert.equal(realmInfo(toFoundation).name, '筑基初期');
  assert.equal(realmInfo(1e9, true).name, '真仙');
  assert.ok(realmInfo(1e9, true).max);
  const threshold = Array.from({ length: 24 }, (_, i) => realmCost(i)).reduce((a, b) => a + b, 0);
  assert.equal(realmInfo(threshold - 1, true).name, '大乘后期');
  assert.equal(realmInfo(threshold - 1, false).name, '大乘后期');
  assert.equal(realmInfo(threshold - 1, false).ascending, false);
  assert.equal(realmInfo(threshold, true).name, '真仙');
  assert.equal(realmInfo(threshold, true).step, 24);
  assert.equal(realmInfo(threshold, true).max, true);
  assert.equal(realmInfo(threshold, false).name, '渡劫');
  assert.equal(realmInfo(threshold, false).ascending, true);
  assert.equal(realmInfo(threshold, false).step, 23);
  assert.equal(realmInfo(threshold, false).index, 7);
  assert.equal(realmInfo(threshold, false).max, false);
});
test('旧渡劫三阶段归为真仙境界，保留修为与缺血，重复续局不重复增加属性', () => {
  for (const oldStep of [24, 25, 26]) {
    const save = freshSave();
    save.completed = [6];
    save.cultivation = Array.from({ length: oldStep }, (_, i) => realmCost(i)).reduce(
      (a, b) => a + b,
      0,
    );
    const cultivation = save.cultivation;
    const old = new Game(save, 0, 0).snapshot();
    old.player.maxHp = 100 + 8 * 45 + (oldStep - 8) * 3;
    old.player.hp = old.player.maxHp - 37;
    const restored = Game.restore(save, old)!;
    assert.equal(restored.realm, 24);
    const maxHp = Math.round(693 * realmHealthMultiplier(24));
    assert.equal(restored.player.maxHp, maxHp);
    assert.equal(restored.player.hp, maxHp - 37);
    assert.ok(Math.abs(restored.stats.damage - 6.15 * realmDamageMultiplier(24)) < 1e-8);
    const again = Game.restore(save, restored.snapshot())!;
    assert.equal(again.player.hp, maxHp - 37);
    assert.equal(again.player.maxHp, maxHp);
    assert.equal(save.cultivation, cultivation);
    old.player.hp = 0;
    old.state = 'lost';
    assert.equal(Game.restore(save, old)!.player.hp, 0);
  }
});
test('旧末境加成升级为真仙，续局补齐上限且保留缺血，刷新不反复回血', () => {
  const save = freshSave();
  save.completed = [6];
  save.cultivation = 1e9;
  const old = new Game(save, 0, 0).snapshot();
  old.player.maxHp = 563;
  old.player.hp = 420;
  const restored = Game.restore(save, old)!;
  const maxHp = Math.round(693 * realmHealthMultiplier(24));
  assert.equal(restored.player.maxHp, maxHp);
  assert.equal(restored.player.hp, maxHp - 143);
  assert.ok(Math.abs(restored.stats.damage - 6.15 * realmDamageMultiplier(24)) < 1e-8);
  const again = Game.restore(save, restored.snapshot())!;
  assert.equal(again.player.hp, maxHp - 143);
  assert.equal(again.stats.damage, restored.stats.damage);
});

test('斩妖和升级实时增加修为，突破立即提升气血与伤害', () => {
  const save = freshSave();
  save.cultivation = 80;
  const game = new Game(save, 0, 0, seeded());
  for (let i = 0; i < 3; i++) {
    const enemy = game.spawnEnemy(0, false, false, { x: 300, y: 0 });
    game.hitEnemy(enemy, enemy.maxHp);
  }
  assert.equal(save.cultivation, 90);
  assert.equal(game.creditedCultivation, 10);
  assert.equal(realmInfo(save.cultivation).name, '炼气中期');
  assert.equal(game.player.maxHp, Math.round(103 * realmHealthMultiplier(1)));
  assert.equal(game.player.hp, game.player.maxHp);
  assert.equal(game.stats.damage, 1.025 * realmDamageMultiplier(1));
  assert.match(game.notice, /突破.*炼气中期/);
  game.xp = xpNeeded(1);
  game.update(0.05);
  assert.equal(save.cultivation, 98);
  assert.equal(game.creditedCultivation, 18);
  game.choices = [{ type: 'passive', id: 'guard', level: 1 }];
  game.choose(0);
  assert.equal(game.player.maxHp, Math.round(103 * 1.1 * realmHealthMultiplier(1)));
});
test('各难度实时修为保留小数累计，失败和通关结算只补差额', () => {
  for (const difficulty of [0, 1, 2]) {
    for (const victory of [false, true]) {
      const save = freshSave();
      save.cultivation = 300;
      const game = new Game(save, 0, difficulty, seeded());
      for (let i = 0; i < 17; i++) {
        const enemy = game.spawnEnemy(0, false, false, { x: 300, y: 0 });
        game.hitEnemy(enemy, enemy.maxHp);
      }
      const run = {
        stage: 0,
        difficulty,
        kills: game.kills,
        time: game.time,
        victory,
        iron: game.iron,
        level: game.level,
      };
      const expected = settleRun(freshSave(), run).cultivation;
      const paid = game.creditedCultivation;
      assert.ok(paid > 0);
      assert.equal(save.cultivation, 300 + paid);
      const rewards = settleRun(save, { ...run, creditedCultivation: paid });
      assert.equal(save.cultivation, 300 + expected);
      assert.equal(rewards.cultivation, expected);
      assert.equal(rewards.cultivationRemaining, expected - paid);
    }
  }
});
test('大境界增量随境界提高，真仙气血三倍、伤害五倍，当局突破与新开局一致', () => {
  const health = [45, 50, 60, 70, 85, 105, 130, 0];
  const attacks = [0.35, 0.4, 0.5, 0.6, 0.75, 0.95, 1.2];
  let threshold = 0;
  for (let step = 1; step <= 26; step++) {
    threshold += realmCost(step - 1);
    if (step % 3 !== 0) continue;
    const save = freshSave();
    save.cultivation = threshold - 1;
    save.completed = [6];
    const game = new Game(save, 0, 0, seeded());
    game.player.hp -= 30;
    const hp = game.player.hp;
    const maxHp = game.player.maxHp;
    const damage = game.stats.damage;
    const enemy = game.spawnEnemy(0, false, false, { x: 300, y: 0 });
    game.hitEnemy(enemy, enemy.maxHp);
    assert.equal(realmBonuses(step).hp - realmBonuses(step - 1).hp, health[step / 3 - 1]);
    const increase =
      Math.round((100 + realmBonuses(step).hp) * realmHealthMultiplier(step)) - maxHp;
    assert.equal(game.player.maxHp - maxHp, increase);
    assert.equal(game.player.hp - hp, increase);
    assert.ok(
      Math.abs(
        game.stats.damage -
          (damage / realmDamageMultiplier(step - 1) + (step === 24 ? 0 : attacks[step / 3 - 1])) *
            realmDamageMultiplier(step),
      ) < 1e-10,
    );
    assert.match(game.notice, /大境界突破/);
    const next = new Game(save, 0, 0, seeded());
    assert.equal(next.player.maxHp, game.player.maxHp);
    assert.equal(next.stats.damage, game.stats.damage);
  }
});
test('旧版元婴对局补齐境界加成，保留已损失气血，重复读档不重复增加', () => {
  const save = freshSave();
  save.cultivation = Array.from({ length: 9 }, (_, step) => realmCost(step)).reduce(
    (a, b) => a + b,
    0,
  );
  save.training.vitality = 2;
  const game = new Game(save, 0, 0, seeded());
  const legacy = JSON.parse(JSON.stringify(game.snapshot()));
  legacy.passives = { guard: 2, bone: 1 };
  legacy.player.maxHp = 100 + 20 + 9 * 3 + 40 + 14;
  legacy.player.hp = legacy.player.maxHp - 37;
  const restored = Game.restore(save, legacy)!;
  assert.ok(restored);
  const maxHp = Math.round(
    (100 + realmBonuses(9).hp) * 1.1 * 1.2 * 1.18 * realmHealthMultiplier(9),
  );
  assert.equal(restored.player.maxHp, maxHp);
  assert.equal(restored.player.hp, maxHp - 37);
  assert.equal(restored.stats.damage, 2.4 * realmDamageMultiplier(9));
  const again = Game.restore(save, JSON.parse(JSON.stringify(restored.snapshot())))!;
  assert.equal(again.player.hp, maxHp - 37);
  assert.equal(again.player.maxHp, maxHp);
  assert.equal(again.stats.damage, 2.4 * realmDamageMultiplier(9));
  again.state = 'upgrade';
  again.choices = [{ type: 'passive', id: 'guard', level: 3 }];
  again.choose(0);
  assert.equal(
    again.player.maxHp,
    Math.round((100 + realmBonuses(9).hp) * 1.1 * 1.3 * 1.18 * realmHealthMultiplier(9)),
  );
});
test('通关奖励跨大境界后，下次开局获得完整加成且没有额外修为', () => {
  const save = freshSave();
  const threshold = realmCost(0) + realmCost(1) + realmCost(2);
  save.cultivation = threshold - 50;
  const reward = settleRun(save, {
    stage: 0,
    difficulty: 0,
    kills: 0,
    level: 1,
    time: 300,
    victory: true,
    iron: 0,
  });
  assert.equal(save.cultivation, threshold - 50 + reward.cultivation);
  const game = new Game(save, 0, 0, seeded());
  assert.equal(realmInfo(save.cultivation).name, '筑基初期');
  assert.equal(game.player.maxHp, Math.round(151 * realmHealthMultiplier(3)));
  assert.equal(game.stats.damage, 1.4 * realmDamageMultiplier(3));
});
test('实时修为随存档恢复，不重复入账或重复增加气血', () => {
  const save = freshSave();
  save.cultivation = 85;
  const game = new Game(save, 0, 0, seeded());
  const enemy = game.spawnEnemy(0, false, false, { x: 300, y: 0 });
  game.hitEnemy(enemy, enemy.maxHp);
  const stored = JSON.stringify({ ...save, activeRun: game.snapshot() });
  const restoredSave = parseSave(stored);
  const restored = Game.restore(restoredSave, JSON.parse(stored).activeRun)!;
  assert.ok(restored);
  assert.equal(restoredSave.cultivation, 93);
  assert.equal(restored.creditedCultivation, 8);
  assert.equal(restored.player.maxHp, Math.round(103 * realmHealthMultiplier(1)));
  assert.equal(restored.player.hp, game.player.hp);
  assert.equal(restored.stats.damage, game.stats.damage);
  restored.resume();
  restored.update(0.05);
  assert.equal(restoredSave.cultivation, 93);
  assert.equal(restored.player.maxHp, Math.round(103 * realmHealthMultiplier(1)));
});
test('旧对局补发未结算修为，连续刷新只补发一次', () => {
  const game = createGame();
  game.level = 25;
  game.kills = 500;
  const legacy = JSON.parse(JSON.stringify(game.snapshot()));
  delete legacy.creditedCultivation;
  const save = freshSave();
  const restored = Game.restore(save, legacy)!;
  assert.ok(restored);
  assert.equal(save.cultivation, 550);
  assert.equal(restored.creditedCultivation, 550);
  assert.equal(realmInfo(save.cultivation).name, '筑基中期');
  assert.equal(restored.player.maxHp, Math.round(154 * realmHealthMultiplier(4)));
  const again = Game.restore(save, JSON.parse(JSON.stringify(restored.snapshot())))!;
  assert.equal(save.cultivation, 550);
  assert.equal(again.player.maxHp, Math.round(154 * realmHealthMultiplier(4)));
  assert.equal(again.stats.damage, 1.425 * realmDamageMultiplier(4));
});
test('失败保留收益但不解锁，通关逐境解锁并保存', () => {
  const save = freshSave();
  const run = { stage: 0, difficulty: 0, kills: 100, time: 150, victory: false, iron: 2, level: 9 };
  const rewards = settleRun(save, run);
  assert.ok(rewards.stones > 0 && rewards.cultivation > 0);
  assert.equal(save.iron, 2);
  assert.equal(save.unlocked, 0);
  settleRun(save, { ...run, victory: true });
  assert.equal(save.unlocked, 1);
  assert.deepEqual(save.completed, [0]);
  assert.deepEqual(parseSave(JSON.stringify(save)), {
    ...save,
    forge: Object.fromEntries(TREASURES.map((t) => [t.id, 0])),
  });
});
test('灵石和玄铁不足不扣款，成功升级按对应成本扣款且有封顶', () => {
  const save = freshSave();
  assert.equal(train(save, 'power'), false);
  assert.equal(forge(save, 'sword'), false);
  save.stones = 100;
  save.iron = 3;
  assert.equal(forge(save, 'sword'), true);
  assert.equal(save.stones, 65);
  assert.equal(save.iron, 0);
  assert.equal(save.forge.sword, 1);
  assert.equal(train(save, 'power'), true);
  assert.equal(save.stones, 20);
  assert.equal(save.training.power, 1);
  save.training.power = 20;
  save.stones = 1000000;
  assert.equal(train(save, 'power'), false);
  save.forge.sword = 10;
  save.iron = 100;
  assert.equal(forge(save, 'sword'), false);
});
test('损坏和越界存档不会破坏游戏初始化', () => {
  for (const raw of ['{broken', 'null']) {
    const parsed = parseSave(raw),
      expected = freshSave();
    expected.medicine.recipeSeed = parsed.medicine.recipeSeed;
    expected.mortal.hometown = parsed.mortal.hometown;
    assert.deepEqual(parsed, expected);
  }
  const s = parseSave(
    JSON.stringify({
      version: 1,
      stones: -80,
      cultivation: 'bad',
      unlocked: 100,
      starter: 'bad',
      forge: { sword: 999 },
      training: { speed: 999 },
      completed: [-1, 0, 0, 70],
    }),
  );
  assert.equal(s.stones, 0);
  assert.equal(s.unlocked, STAGES.length - 1);
  assert.equal(s.starter, 'sword');
  assert.equal(s.forge.sword, 10);
  assert.equal(s.training.speed, 20);
  assert.deepEqual(s.completed, [0]);
});
test('不同难度增加妖物强度与收益，精英和妖王不会在首秒出现', () => {
  const easy = createGame(),
    hard = new Game(freshSave(), 0, 2, seeded());
  const a = easy.spawnEnemy(0),
    b = hard.spawnEnemy(0);
  assert.ok(b.hp > a.hp);
  assert.ok(b.damage > a.damage);
  advance(easy, 1);
  assert.ok(easy.enemies.every((e) => !e.elite && !e.boss));
  const s1 = freshSave(),
    s2 = freshSave();
  const run = { stage: 0, difficulty: 0, kills: 100, time: 100, victory: false, iron: 0, level: 5 };
  assert.ok(settleRun(s2, { ...run, difficulty: 2 }).stones > settleRun(s1, run).stones);
});
test('吞天纳灵自动吸取范围外的经验，未修炼时不吸取', () => {
  const plain = createGame(),
    trained = createGame();
  trained.passives.magnet = 5;
  for (const g of [plain, trained])
    g.pickups = [{ x: 180, y: 0, kind: 'xp', value: 4, pull: false }];
  plain.update(0.05);
  trained.update(0.05);
  assert.equal(plain.pickups[0].pull, false);
  assert.equal(trained.pickups[0].pull, true);
  advance(trained, 0.5);
  assert.ok(trained.xp > 4);
  assert.equal(trained.pickups.length, 0);
});
test('对局快照经过 JSON 存取后恢复位置、战斗、掉落和弹道命中集合', () => {
  const game = createGame();
  game.player.x = 45;
  game.player.y = -89;
  game.player.hp = 71;
  game.spawnEnemy(0, false, false, { x: 150, y: 0 });
  game.pickups.push({ x: 350, y: 45, kind: 'iron', value: 1, pull: false });
  game.update(0.05);
  assert.ok(game.shots.length > 0);
  game.shots[0].hit.add(777);
  const stored = JSON.parse(JSON.stringify(game.snapshot()));
  const restored = Game.restore(game.save, stored)!;
  assert.ok(restored);
  assert.equal(restored.state, 'paused');
  assert.equal(restored.player.x, 45);
  assert.equal(restored.player.y, -89);
  assert.equal(restored.player.hp, game.player.hp);
  assert.equal(restored.time, game.time);
  assert.equal(restored.enemies.length, game.enemies.length);
  assert.equal(restored.pickups.length, 1);
  assert.ok(restored.shots[0].hit instanceof Set);
  assert.ok(restored.shots[0].hit.has(777));
  advance(restored, 3);
  assert.equal(restored.time, game.time);
  restored.resume();
  restored.update(0.05);
  assert.ok(restored.time > game.time);
});
test('升级中的存档保留原有三选一和重悟次数，不会刷新选项', () => {
  const game = createGame();
  game.xp = xpNeeded(1);
  game.update(0.05);
  game.reroll();
  const restored = Game.restore(game.save, JSON.parse(JSON.stringify(game.snapshot())))!;
  assert.equal(restored.state, 'upgrade');
  assert.equal(restored.rerolls, 2);
  assert.deepEqual(restored.choices, game.choices);
  const selection = restored.choices[0];
  assert.ok(restored.choose(0));
  assert.equal(restored.state, 'playing');
  if (selection.type === 'weapon')
    assert.ok(restored.weapons.some((w) => w.id === selection.id && w.level === selection.level));
});
test('无境界标记旧局只迁移一次，保留缺血、敌人血量比例、双方弹幕领域和天劫窗口', () => {
  for (const trained of [false, true])
    for (const [step, stage, tribulation] of [
      [9, 2, false],
      [24, 6, false],
      [21, 2, true],
      [23, 6, true],
    ] as const) {
      const save = freshSave();
      save.cultivation = Array.from({ length: step }, (_, i) => realmCost(i)).reduce(
        (a, b) => a + b,
        0,
      );
      save.training.vitality = trained ? 20 : 0;
      save.unlocked = stage;
      if (step === 24) save.completed = [6];
      syncTribulationClock(save);
      if (tribulation) save.age = save.nextTribulationAge;
      const g = tribulation ? Game.createTribulation(save, null) : new Game(save, stage, 0);
      if (trained) g.passives = { power: 4, spirit: 2, guard: 3, bone: 2 };
      if (!tribulation) {
        g.spawnEnemy(0, false, false, { x: 200, y: 0 });
        g.spawnEnemy(1, true, false, { x: 300, y: 0 });
        g.spawnEnemy(10, false, true, { x: 400, y: 0 }, stage);
        g.bossSpawned = true;
        if (stage === 6) g.trialBossesSpawned = 1;
      }
      g.time = 10;
      g.tribulationNextAt = 12;
      g.pause();
      const legacy = JSON.parse(JSON.stringify(g.snapshot()));
      assert.equal(legacy.realmScaling, 3);
      delete legacy.realmScaling;
      const realmDamage = 1 + realmBonuses(step).damage;
      const passiveDamage = trained ? 4 * 0.12 + 2 * 0.04 : 0;
      const passiveGrowth = (realmDamage * (1 + passiveDamage)) / (realmDamage + passiveDamage);
      const oldDamage = (realmDamage + passiveDamage) * (step === 24 ? 2 : 1);
      legacy.player.maxHp = Math.round(
        (100 + realmBonuses(step).hp + (step === 24 ? 200 : 0) + (trained ? 260 : 0)) *
          (trained ? 1.36 : 1),
      );
      legacy.player.hp = legacy.player.maxHp - 37;
      for (const [i, enemy] of legacy.enemies.entries()) {
        enemy.maxHp = tribulation ? tribulationRules(1).hp : 1000 + i * 100;
        enemy.hp = enemy.maxHp * 0.37;
        enemy.damage = tribulation ? legacy.player.maxHp * tribulationRules(1).damage : 7 + i;
      }
      legacy.shots = ['sword', 'hostile'].map((kind) => ({
        x: 100,
        y: 0,
        vx: 10,
        vy: 0,
        life: 2,
        radius: 8,
        damage: kind === 'hostile' ? 13 : 13 * oldDamage,
        color: '#fff',
        kind,
        pierce: 0,
        hit: [777],
        origin: { x: 0, y: 0 },
        age: 0.5,
        bounce: 0,
        crit: false,
      }));
      legacy.zones = [false, true].map((hostile) => ({
        x: 200,
        y: 0,
        radius: 60,
        life: 2,
        maxLife: 3,
        damage: hostile ? 17 : 17 * oldDamage,
        tick: 0.2,
        color: '#fff',
        kind: 'poison',
        delay: 0.4,
        hostile,
      }));
      legacy.tribulationOpeningDamage = tribulation
        ? (tribulationRules(1).hp * tribulationRules(1).openingDamage) / 2
        : 0;
      const rawBefore = JSON.stringify(legacy);
      const saveBefore = JSON.stringify(save);
      const restored = Game.restore(save, legacy)!;
      assert.ok(restored);
      const enemyHealth = realmDamageMultiplier(tribulation ? 23 : STAGE_REALM_STEPS[stage]);
      const enemyDamage = realmHealthMultiplier(tribulation ? step : STAGE_REALM_STEPS[stage]);
      const playerDamage = realmDamageMultiplier(step) / (step === 24 ? 2 : 1);
      assert.equal(
        restored.player.maxHp,
        Math.round(
          (100 + realmBonuses(step).hp) *
            (trained ? 2 : 1) *
            (trained ? 1.3 : 1) *
            (trained ? 1.36 : 1) *
            realmHealthMultiplier(step),
        ),
      );
      assert.equal(restored.player.maxHp - restored.player.hp, 37);
      assert.deepEqual(
        restored.enemies,
        legacy.enemies.map((enemy) => ({
          ...enemy,
          hp: enemy.hp * enemyHealth,
          maxHp: enemy.maxHp * enemyHealth,
          damage: enemy.damage * enemyDamage,
        })),
      );
      for (const enemy of restored.enemies)
        assert.ok(Math.abs(enemy.hp / enemy.maxHp - 0.37) < 1e-12);
      const migrated = restored.snapshot();
      assert.equal(migrated.realmScaling, 3);
      assert.deepEqual(
        migrated.shots,
        legacy.shots.map((shot) => ({
          ...shot,
          damage:
            shot.kind === 'hostile'
              ? shot.damage * enemyDamage
              : shot.damage * playerDamage * passiveGrowth,
        })),
      );
      assert.deepEqual(
        migrated.zones,
        legacy.zones.map((zone) => ({
          ...zone,
          damage: zone.hostile
            ? zone.damage * enemyDamage
            : zone.damage * playerDamage * passiveGrowth,
        })),
      );
      assert.equal(
        restored.tribulationOpeningDamage,
        legacy.tribulationOpeningDamage * enemyHealth,
      );
      assert.equal(restored.time, 10);
      assert.equal(restored.tribulationStep, legacy.tribulationStep);
      assert.equal(restored.tribulationNextAt, 12);
      let raw = migrated;
      for (let i = 0; i < 3; i++) {
        raw = Game.restore(save, JSON.parse(JSON.stringify(raw)))!.snapshot();
        assert.deepEqual(raw, migrated);
      }
      assert.equal(JSON.stringify(legacy), rawBefore);
      assert.equal(JSON.stringify(save), saveBefore);
      if (tribulation) {
        restored.resume();
        const boss = restored.boss!;
        const before = boss.hp;
        const remaining =
          boss.maxHp * tribulationRules(1).openingDamage - restored.tribulationOpeningDamage;
        restored.hitEnemy(boss, boss.maxHp);
        assert.ok(Math.abs(before - boss.hp - remaining) < 1e-8);
        assert.equal(
          restored.tribulationOpeningDamage,
          boss.maxHp * tribulationRules(1).openingDamage,
        );
        restored.hitEnemy(boss, boss.maxHp);
        assert.ok(Math.abs(before - boss.hp - remaining) < 1e-8);
      }
      legacy.state = 'lost';
      legacy.player.hp = 0;
      assert.equal(Game.restore(save, legacy)!.player.hp, 0);
    }
});
test('标记1/2攻血功法旧局只迁移己方攻击，标记3不再迁移，保留缺血与敌方状态且幂等', () => {
  for (const marker of [1, 2, 3])
    for (const path of ['orthodox', 'demonic', 'dual'] as const)
      for (const trained of [false, true])
        for (const step of [0, 9, 23, 24]) {
          const save = freshSave();
          save.path = path;
          save.training.vitality = trained ? 20 : 0;
          save.cultivation = Array.from({ length: step }, (_, i) => realmCost(i)).reduce(
            (a, b) => a + b,
            0,
          );
          save.unlocked = 2;
          if (step === 24) save.completed = [6];
          const mastery = trained && step === 24 ? 1.3 : 1;
          if (mastery > 1) {
            save.stones = 1000;
            const sect = path === 'demonic' ? 'blood' : 'power';
            assert.equal(joinSect(save, sect), true);
            save.mortal.mastery[sect] = 10;
          }
          const game = new Game(save, 2, 0, seeded(), path);
          if (trained) {
            game.passives =
              path === 'demonic'
                ? { blood: 4, forbidden: 2, bone: 3 }
                : { power: 4, spirit: 2, guard: 3 };
          }
          const enemy = game.spawnEnemy(0, false, false, { x: 200, y: 0 });
          enemy.hp *= 0.37;
          game.pause();
          const legacy = JSON.parse(JSON.stringify(game.snapshot())) as ReturnType<
            Game['snapshot']
          >;
          legacy.realmScaling = marker;
          const realmDamage = 1 + realmBonuses(step).damage;
          const passiveDamage =
            (trained
              ? path === 'demonic'
                ? 4 * mastery * 0.18 + 2 * 0.08
                : 4 * mastery * 0.12 + 2 * 0.04
              : 0) + (path === 'demonic' ? 0.12 : 0);
          const passiveGrowth =
            marker === 3 ? 1 : (realmDamage * (1 + passiveDamage)) / (realmDamage + passiveDamage);
          const immortalGrowth = marker === 1 && step === 24 ? 5 / 2 : 1;
          const expectedMaxHp = Math.round(
            (100 + realmBonuses(step).hp) *
              (trained ? 2 : 1) *
              (trained && path !== 'demonic' ? 1.3 : 1) *
              (trained && path === 'demonic' ? 1.54 : 1) *
              (path === 'orthodox' ? 1.12 : 1) *
              realmHealthMultiplier(step),
          );
          legacy.player.maxHp =
            marker === 3
              ? expectedMaxHp
              : Math.round(
                  (100 +
                    realmBonuses(step).hp +
                    (marker === 1 && step === 24 ? 200 : 0) +
                    (trained ? 200 + (path === 'demonic' ? 0 : 60) : 0)) *
                    (trained && path === 'demonic' ? 1.54 : 1) *
                    (path === 'orthodox' ? 1.12 : 1) *
                    realmHealthMultiplier(marker === 1 && step === 24 ? 23 : step),
                );
          legacy.player.hp = legacy.player.maxHp - 37;
          const oldDamage =
            marker === 3
              ? game.stats.damage
              : ((realmDamage + passiveDamage) * realmDamageMultiplier(step)) / immortalGrowth;
          legacy.shots = (['sword', 'hostile'] as const).map((kind) => ({
            x: 100,
            y: 0,
            vx: 10,
            vy: 0,
            life: 2,
            radius: 8,
            damage: kind === 'hostile' ? 13 : 13 * oldDamage,
            color: '#fff',
            kind,
            pierce: 0,
            hit: [777],
            origin: { x: 0, y: 0 },
            age: 0.5,
            bounce: 0,
            crit: false,
          }));
          legacy.zones = [false, true].map((hostile) => ({
            x: 200,
            y: 0,
            radius: 60,
            life: 2,
            maxLife: 3,
            damage: hostile ? 17 : 17 * oldDamage,
            tick: 0.2,
            color: '#fff',
            kind: 'poison',
            delay: 0.4,
            hostile,
          }));
          const rawBefore = JSON.stringify(legacy);
          const saveBefore = JSON.stringify(save);
          const restored = Game.restore(save, legacy)!;
          assert.ok(restored);
          assert.equal(restored.player.maxHp, expectedMaxHp);
          assert.equal(restored.player.hp, expectedMaxHp - 37);
          assert.equal(restored.stats.damage, game.stats.damage);
          const migrated = restored.snapshot();
          assert.equal(migrated.realmScaling, 3);
          assert.deepEqual(migrated.enemies, legacy.enemies);
          assert.deepEqual(
            migrated.shots,
            legacy.shots.map((shot) => ({
              ...shot,
              damage:
                shot.kind === 'hostile'
                  ? shot.damage
                  : shot.damage * immortalGrowth * passiveGrowth,
            })),
          );
          assert.deepEqual(
            migrated.zones,
            legacy.zones.map((zone) => ({
              ...zone,
              damage: zone.hostile ? zone.damage : zone.damage * immortalGrowth * passiveGrowth,
            })),
          );
          assert.ok(Math.abs(migrated.shots[0].damage / (13 * restored.stats.damage) - 1) < 1e-12);
          assert.ok(Math.abs(migrated.zones[0].damage / (17 * restored.stats.damage) - 1) < 1e-12);
          let raw = migrated;
          for (let i = 0; i < 3; i++) {
            raw = Game.restore(save, JSON.parse(JSON.stringify(raw)))!.snapshot();
            assert.deepEqual(raw, migrated);
          }
          assert.equal(JSON.stringify(legacy), rawBefore);
          assert.equal(JSON.stringify(save), saveBefore);
          legacy.state = 'lost';
          legacy.player.hp = 0;
          const dead = Game.restore(save, legacy)!;
          assert.equal(dead.player.hp, 0);
          assert.equal(Game.restore(save, dead.snapshot())!.player.hp, 0);
        }
});
test('旧三重觉醒选项恢复时失效，选择时仍须满足五重门槛', () => {
  const game = createGame();
  game.weapons[0].level = 6;
  game.passives.power = 3;
  game.state = 'upgrade';
  game.choices = [
    { type: 'evolve', id: 'sword', level: 7 },
    { type: 'heal', id: 'heal', level: 1 },
  ];
  const restored = Game.restore(game.save, JSON.parse(JSON.stringify(game.snapshot())))!;
  assert.equal(restored.state, 'upgrade');
  assert.ok(!restored.choices.some((choice) => choice.type === 'evolve' && choice.id === 'sword'));
  restored.choices = [{ type: 'evolve', id: 'sword', level: 7 }];
  assert.equal(restored.choose(0), false);
  assert.equal(restored.weapons[0].evolved, false);
  restored.passives.power = 5;
  assert.equal(restored.choose(0), true);
  assert.equal(restored.weapons[0].evolved, true);
});
test('已结束或损坏的对局不恢复，永久进度仍可读取', () => {
  const game = createGame();
  const snapshot = game.snapshot();
  assert.equal(Game.restore(game.save, { ...snapshot, state: 'won' }), null);
  assert.equal(Game.restore(game.save, { ...snapshot, enemies: [{}] }), null);
  assert.equal(
    Game.restore(game.save, { ...snapshot, weapons: [{ id: 'missing', level: 1 }] }),
    null,
  );
  assert.equal(Game.restore(game.save, { ...snapshot, stage: 5 }), null);
  for (const realmScaling of [0, 4, 1.5, null, '1'])
    assert.equal(Game.restore(game.save, { ...snapshot, realmScaling }), null);
  assert.equal(Game.restore(game.save, null), null);
  const s = parseSave(JSON.stringify({ ...game.save, stones: 35, activeRun: { invalid: true } }));
  assert.equal(s.stones, 35);
});
test('72 种普通妖物分别使用独立立绘，图集坐标不会越界', () => {
  assert.equal(new Set(ENEMIES.map((e) => e.sprite)).size, 72);
  for (const e of [...ENEMIES, ...STAGES]) {
    const f = spriteFrame(e.sprite);
    assert.ok(f.x >= 0 && f.y >= 0);
    assert.ok(f.x + f.width <= 1536 && f.y + f.height <= 1024);
  }
});
test('AI 拾取灵气并避开近身妖物、弹道与法阵，移动向量不超速', () => {
  const game = createGame();
  game.pickups = [{ x: 300, y: 0, kind: 'xp', value: 3, pull: false }];
  assert.deepEqual(autoplayInput(game), { x: 1, y: 0 });
  game.spawnEnemy(0, false, false, { x: 30, y: 0 });
  const away = autoplayInput(game);
  assert.ok(away.x < 0);
  assert.ok(Math.hypot(away.x, away.y) <= 1);
  game.enemies = [];
  game.zones.push({
    x: 0,
    y: 0,
    radius: 100,
    life: 1,
    maxLife: 1,
    damage: 20,
    tick: 1,
    color: '#f00',
    kind: 'poison',
    delay: 0.3,
    hostile: true,
  });
  assert.ok(Math.hypot(autoplayInput(game).x, autoplayInput(game).y) > 0);
  game.zones = [];
  game.shots.push({
    x: 10,
    y: 0,
    vx: -100,
    vy: 0,
    life: 2,
    radius: 8,
    damage: 10,
    color: '#f00',
    kind: 'hostile',
    pierce: 0,
    hit: new Set(),
    origin: { x: 50, y: 0 },
    age: 0,
    bounce: 0,
    crit: false,
  });
  assert.ok(autoplayInput(game).x < 0);
});
test('AI 优先进化与配套功法，低血量选恢复，劣质选项使用有限重悟', () => {
  const game = createGame();
  game.weapons[0].level = 6;
  game.choices = [
    { type: 'weapon', id: 'poison', level: 1 },
    { type: 'passive', id: 'power', level: 3 },
    { type: 'passive', id: 'spirit', level: 1 },
  ];
  assert.deepEqual(autoplayChoice(game), { index: 1, reroll: false });
  game.choices[2] = { type: 'evolve', id: 'sword', level: 6 };
  assert.deepEqual(autoplayChoice(game), { index: 2, reroll: false });
  game.player.hp = 20;
  game.choices = [{ type: 'heal', id: 'heal', level: 1 }, game.choices[0]];
  assert.deepEqual(autoplayChoice(game), { index: 0, reroll: false });
  game.player.hp = 100;
  assert.deepEqual(autoplayChoice(game), { index: 1, reroll: true });
  game.rerolls = 0;
  assert.deepEqual(autoplayChoice(game), { index: 1, reroll: false });
  game.choices = [];
  assert.equal(autoplayChoice(game), null);
});
test('AI 为六重法宝优先补满一至五重配套功法，其他选技保持原样', () => {
  for (const path of ['orthodox', 'demonic', 'dual'] as const) {
    const save = freshSave();
    save.path = path;
    const g = new Game(save, 0, 0, seeded());
    g.weapons = [
      { id: 'sword', level: 6, evolved: false, timer: 0 },
      { id: 'orbit', level: 5, evolved: false, timer: 0 },
    ];
    const id = path === 'demonic' ? 'blood' : 'power';
    g.passives = { [id]: 2 };
    g.choices = [
      { type: 'weapon', id: 'orbit', level: 6 },
      { type: 'passive', id, level: 3 },
    ];
    assert.deepEqual(autoplayChoice(g), { index: 1, reroll: false });
    g.choices.push({ type: 'evolve', id: 'orbit', level: 7 });
    assert.equal(autoplayChoice(g)?.index, 2);
    g.choices.pop();
    g.weapons[0].level = 5;
    assert.equal(autoplayChoice(g)?.index, 0);
    g.weapons[0].level = 6;
    for (const level of [1, 2, 3, 4, 5]) {
      g.choices[1].level = level;
      g.passives[id] = level - 1;
      assert.deepEqual(autoplayChoice(g), { index: 1, reroll: false });
      g.choices.push({ type: 'evolve', id: 'orbit', level: 7 });
      assert.equal(autoplayChoice(g)?.index, 2);
      g.choices.pop();
    }
    const missing = g.choices.pop()!;
    assert.deepEqual(autoplayChoice(g), { index: 0, reroll: false });
    g.choices.push(missing);
    g.choices[1].level = 5;
    g.passives[id] = 4;
    g.weapons[0].evolved = true;
    assert.equal(autoplayChoice(g)?.index, 0);
    if (path === 'dual') {
      g.weapons[0].evolved = false;
      g.passives.blood = 5;
      assert.equal(autoplayChoice(g)?.index, 0);
    }
  }
});
test('自动历练开关保存在浏览器存档，旧存档默认手动', () => {
  assert.equal(parseSave(null).autoplay, false);
  assert.equal(parseSave(JSON.stringify({ version: 1 })).autoplay, false);
  assert.equal(parseSave(JSON.stringify({ ...freshSave(), autoplay: true })).autoplay, true);
});
test('气血已耗尽时斩妖突破不会复活角色', () => {
  const save = freshSave();
  save.cultivation = 85;
  const game = new Game(save, 0, 0, seeded());
  game.hurtPlayer(1000);
  const enemy = game.spawnEnemy(0, false, false, { x: 300, y: 0 });
  game.hitEnemy(enemy, enemy.maxHp);
  game.update(0.05);
  assert.equal(game.state, 'lost');
  assert.equal(game.player.hp, 0);
  assert.equal(save.cultivation, 93);
});
