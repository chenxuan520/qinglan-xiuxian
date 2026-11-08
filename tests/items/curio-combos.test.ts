import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, type Weapon } from '../../src/battle/game.ts';
import { freshSave } from '../../src/core/progress.ts';
import { grantCurio } from '../../src/items/curio-data.ts';
import { AWAKENING_BURST, TREASURES, treasure, type WeaponKind } from '../../src/core/data.ts';
import { comboTreasure, treasureDisplayName } from '../../src/items/curio-combos.ts';
import { choiceCard, damageReport } from '../../src/ui/common-ui.ts';
import { pausePanel, settlementModal } from '../../src/ui/lobby-ui.ts';
import { catalogPanel } from '../../src/content/catalog-ui.ts';
import { dockRumorPool } from '../../src/town/dock-rumors.ts';
import { spiritPower } from '../../src/core/spirit-power.ts';
import { journeyScore } from '../../src/content/journey-score.ts';

const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);
const pairs = [
  ['sword', 'thunder-bamboo', 1.2],
  ['fan', 'jade-ruyi', 1],
  ['talisman', 'soul-wood', 1.15],
] as const;
function fixture(id: WeaponKind = 'sword', evolved = false) {
  const save = freshSave('none', [], 'dual', () => 0.5);
  save.starter = id;
  save.artifacts = TREASURES.map((t) => t.id);
  const g = new Game(save, 0, 0, () => 0.99);
  g.weapons = [{ id, evolved, level: evolved ? 6 : 1, timer: 0 }];
  g.spawnBudget = -10000;
  g.nextElite = 9999;
  g.player.invincible = 9999;
  return g;
}
function target(g: Game, elite = false, boss = false) {
  const e = g.spawnEnemy(0, elite, boss, { x: 100, y: 0 });
  e.hp = e.maxHp = 1e8;
  return e;
}

test('三个组合仅在奇物与本局法宝同时持有时生效，售出恢复，其他法宝不受增伤', () => {
  for (const [id, curio, factor] of pairs)
    for (const evolved of [false, true]) {
      const g = fixture(id, evolved),
        w = g.weapons[0];
      const base = g.weaponHitDamage(w),
        magnet = g.stats.magnet;
      grantCurio(g.save, curio);
      near(g.weaponHitDamage(w), base * factor);
      near(g.stats.magnet, magnet * (id === 'fan' ? 1.4 : 1));
      for (const elite of [false, true]) {
        const e = target(g, elite);
        g.hitEnemy(e, 100, false, id);
        near(e.maxHp - e.hp, 100 * factor * (elite ? g.eliteDamage : 1));
      }
      const other = target(g);
      g.hitEnemy(other, 100, false, 'arrow');
      near(other.maxHp - other.hp, 100);
      g.weapons = [];
      near(g.weaponHitDamage(w), base);
      near(g.stats.magnet, magnet);
      g.weapons = [w];
      delete g.save.curios.bag[curio];
      near(g.weaponHitDamage(w), base);
      near(g.stats.magnet, magnet);
    }
});

test('送风与吞天纳灵和灵眼之泉相乘，不改变芭蕉扇伤害或其他基础属性', () => {
  const g = fixture('fan');
  g.passives.magnet = 5;
  grantCurio(g.save, 'spirit-spring');
  const before = g.stats,
    hit = g.weaponHitDamage(g.weapons[0]);
  grantCurio(g.save, 'jade-ruyi');
  near(g.stats.magnet, before.magnet * 1.4);
  near(g.stats.damage, before.damage);
  near(g.weaponHitDamage(g.weapons[0]), hit);
  assert.equal(treasureDisplayName(g.save, 'fan'), treasure('fan').name);
});

test('飞剑命中仅增加金色雷光表现，伤害只乘一次，在途攻击售出立即失效', () => {
  for (const evolved of [false, true])
    for (const sell of [false, true]) {
      const g = fixture('sword', evolved),
        e = target(g);
      grantCurio(g.save, 'thunder-bamboo');
      const base = g.weaponHitDamage(g.weapons[0], false);
      g.cast(g.weapons[0]);
      const shot = g.shots[0];
      near(shot.damage, base);
      g.shots = [shot];
      Object.assign(shot, { x: e.x, y: e.y, vx: 0, vy: 0 });
      if (sell) delete g.save.curios.bag['thunder-bamboo'];
      g.updateShots(0);
      near(e.maxHp - e.hp, base * (sell ? 1 : 1.2));
      assert.equal(g.effects.filter((e) => e.kind === 'lightning').length, sell ? 0 : 1);
      if (!sell)
        assert.equal(g.effects.find((e) => e.kind === 'lightning')!.color, treasure('sword').color);
      assert.equal(g.damageBySource.lightning, undefined);
    }
});

test('镇魂符普通与觉醒每符穿透由2变3，售出与只有其一时回到2', () => {
  for (const evolved of [false, true])
    for (const held of [false, true])
      for (const sell of [false, true]) {
        const g = fixture('talisman', evolved),
          enemies = [target(g), target(g), target(g), target(g)];
        if (held) grantCurio(g.save, 'soul-wood');
        g.cast(g.weapons[0]);
        const shot = g.shots[0];
        assert.equal(shot.pierce, held ? 3 : 2);
        g.shots = [shot];
        Object.assign(shot, { x: 100, y: 0, vx: 0, vy: 0 });
        if (sell) delete g.save.curios.bag['soul-wood'];
        g.updateShots(0);
        assert.equal(enemies.filter((e) => e.hp < e.maxHp).length, held && !sell ? 3 : 2);
        for (const e of enemies.filter((e) => e.hp < e.maxHp))
          near(e.maxHp - e.hp, g.weaponHitDamage(g.weapons[0]));
      }
});

test('组合觉醒伤害仍遵守妖王5%上限', () => {
  for (const [id, curio] of pairs.filter(([id]) => id !== 'fan')) {
    const g = fixture(id, true);
    grantCurio(g.save, curio);
    const e = target(g, false, true);
    e.hp = e.maxHp = 100;
    g.awaken(g.weapons[0]);
    g.time += AWAKENING_BURST.waveSeconds;
    g.update(0.01);
    near(e.maxHp - e.hp, e.maxHp * AWAKENING_BURST.bossShare);
  }
});

const notices = ['金雷入剑 · 青竹蜂云剑', '如意随风 · 拾取范围扩大', '魂木生息 · 镇魂符更盛'];
test('三个首次提示排队且每局一次，暂停升级不弹出，续局不重复，无新增持久字段', () => {
  const g = fixture('arrow');
  const keys = Object.keys(g.save).sort(),
    snapshotKeys = Object.keys(g.snapshot()).sort();
  for (const [id, curio] of pairs) {
    grantCurio(g.save, curio);
    g.weapons.push({ id, level: 1, evolved: false, timer: 999 });
  }
  g.update(0.01);
  assert.equal(g.notice, '踏入秘境 · 妖物将至');
  const shown: string[] = [];
  for (let i = 0; i < 20; i++) {
    g.noticeTime = 0;
    g.update(0.01);
    if (notices.includes(g.notice)) shown.push(g.notice);
    g.notice = '';
  }
  assert.deepEqual(shown, notices);
  g.state = 'paused';
  g.noticeTime = 0;
  g.update(1);
  assert.equal(g.notice, '');
  assert.deepEqual(Object.keys(g.save).sort(), keys);
  assert.deepEqual(Object.keys(g.snapshot()).sort(), snapshotKeys);
  const restored = Game.restore(g.save, JSON.parse(JSON.stringify(g.snapshot())));
  assert.ok(restored, '合法四武器快照可恢复');
  assert.deepEqual(
    restored.weapons.map((w) => w.id),
    g.weapons.map((w) => w.id),
  );
  restored.state = 'playing';
  restored.noticeTime = 0;
  restored.update(0.01);
  assert.ok(!notices.includes(restored.notice));
  for (const w of restored.weapons) near(restored.weaponHitDamage(w), g.weaponHitDamage(w));
  const next = new Game(g.save, 0, 0, () => 0.99);
  next.weapons = g.weapons.map((w) => ({ ...w }));
  next.noticeTime = 0;
  next.update(0.01);
  assert.equal(next.notice, notices[0]);
});

test('升级、暂停、伤害、结算、藏器阁与配方名称一致，未领悟不泄露，觉醒保留仙器名', () => {
  const g = fixture();
  grantCurio(g.save, 'thunder-bamboo');
  const name = '青竹蜂云剑',
    desc = comboTreasure(g.save, 'sword').desc;
  assert.equal(treasureDisplayName(g.save, 'sword'), name);
  assert.equal(treasureDisplayName(g.save, 'sword', true), '万剑归宗');
  const view = {
    panel: 'treasure-detail',
    catalogTreasures: TREASURES,
    schoolFilter: 'all',
    selectedTreasure: 'sword',
    bookTab: 'treasures',
    weapons: g.weapons,
  } as const;
  const rewards = {
    stones: 0,
    iron: 0,
    cultivation: 0,
    cultivationRemaining: 0,
    ascensionCultivation: 0,
  };
  g.loot.artifacts = ['sword'];
  g.save.stones = 1000;
  g.save.iron = 1000;
  for (const html of [
    choiceCard(g, g.save, { type: 'weapon', id: 'sword', level: 2 }, 0),
    pausePanel(g, g.save, 60, false).join(''),
    damageReport(g),
    settlementModal(g.save, g, rewards, '凡人'),
    catalogPanel(g.save, view).body,
  ]) {
    assert.ok(html.includes(name));
    assert.ok(!html.includes('青霄剑'));
  }
  assert.ok(choiceCard(g, g.save, { type: 'weapon', id: 'sword', level: 2 }, 0).includes(desc));
  assert.ok(catalogPanel(g.save, view).body.includes(desc));
  assert.equal(catalogPanel(g.save, { ...view, weapons: [] }).title, '青霄剑');
  g.weapons = [];
  assert.ok(!choiceCard(g, g.save, { type: 'weapon', id: 'sword', level: 1 }, 0).includes(name));
  g.weapons = [{ id: 'sword', level: 6, evolved: true, timer: 999 }];
  for (const html of [pausePanel(g, g.save, 60, false).join(''), damageReport(g)]) {
    assert.ok(html.includes('万剑归宗'));
    assert.ok(!html.includes(name));
  }
});

test('隐藏组合不改变永久灵威计分和道果分数，入场伤害与名称使用真实组合口径', () => {
  const g = fixture();
  grantCurio(g.save, 'thunder-bamboo');
  const score = spiritPower(g.save).score,
    journey = journeyScore(g.save);
  const power = spiritPower(g.save);
  assert.equal(power.weapon, '青竹蜂云剑');
  near(power.weaponDamage, g.weaponHitDamage(g.weapons[0]));
  // 金雷竹本身的精英增伤既有计分保持；新组合只改变本件武器伤害。
  const s = structuredClone(g.save);
  s.starter = 'fan';
  assert.equal(spiritPower(s).score, score);
  assert.deepEqual(journeyScore(s), journey);
});

test('船客传闻新增三条原文，无条件保留在随机池', () => {
  const save = fixture().save;
  const expected = {
    'combo-sword': '有人说，金雷竹的细叶落在剑上，那剑就再不肯叫原来的名字了。',
    'combo-fan': '船上有个老人摇着一把破蒲扇说，扇子扇的是风，风认的却是手里那点温润。',
    'combo-soul': '庙里的道士讲，木头里也能养魂，魂养足了，符纸压得住的东西就多一个。',
  };
  for (const [key, text] of Object.entries(expected)) {
    assert.equal(dockRumorPool(save).find((r) => r.key === key)?.text, text);
    for (const [, id] of pairs) grantCurio(save, id);
    assert.equal(dockRumorPool(save).find((r) => r.key === key)?.text, text);
  }
});
