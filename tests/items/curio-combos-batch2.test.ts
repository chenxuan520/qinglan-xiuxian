import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../../src/battle/game.ts';
import { freshSave } from '../../src/core/progress.ts';
import { grantCurio, type CurioId } from '../../src/items/curio-data.ts';
import { treasure, TREASURES, type WeaponKind } from '../../src/core/data.ts';
import { comboTreasure, curioCombo, windThunderCombo } from '../../src/items/curio-combos.ts';
import { dockRumorPool } from '../../src/town/dock-rumors.ts';
import { choiceCard } from '../../src/ui/common-ui.ts';
import { catalogPanel } from '../../src/content/catalog-ui.ts';

const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
function fixture(id: WeaponKind = 'beads', evolved = false) {
  const s = freshSave('none', [], 'dual', () => 0.5);
  s.artifacts = TREASURES.map((t) => t.id);
  s.starter = id;
  const g = new Game(s, 0, 0, () => 0.99);
  g.weapons = [{ id, level: evolved ? 6 : 1, evolved, timer: 9999 }];
  g.spawnBudget = -10000;
  g.nextElite = 9999;
  g.player.invincible = 0;
  return g;
}
function advance(g: Game, seconds: number) {
  for (let t = 0; t < seconds - 1e-9; t += 0.05) g.update(Math.min(0.05, seconds - t));
}
function target(g: Game) {
  const e = g.spawnEnemy(0, false, false, { x: 100, y: 0 });
  e.hp = e.maxHp = 1e6;
  e.speed = 0;
  return e;
}
const pairs: [WeaponKind, CurioId][] = [
  ['beads', 'sacred-fragment'],
  ['brush', 'jade-book'],
  ['bloodpool', 'spirit-spring'],
];
test('第二批COMBOS仅同时持有奇物与本局法宝生效，售出失效，非增伤组不加伤害', () => {
  for (const [id, curio] of pairs) {
    const g = fixture(id),
      damage = g.weaponHitDamage(g.weapons[0]);
    assert.equal(curioCombo(g.save, id), undefined);
    grantCurio(g.save, curio);
    assert.ok(curioCombo(g.save, id));
    near(g.weaponHitDamage(g.weapons[0]), damage);
    assert.notEqual(comboTreasure(g.save, id).desc, treasure(id).desc);
    assert.equal(comboTreasure(g.save, id, false).desc, treasure(id).desc);
    g.weapons = [];
    assert.equal(g.buddhaShieldReady, false);
    delete g.save.curios.bag[curio];
    assert.equal(curioCombo(g.save, id), undefined);
    assert.equal(comboTreasure(g.save, id).desc, treasure(id).desc);
  }
});
test('佛光立即就绪，挡伤不触发受伤/反伤/灼烧/蚀体，12秒冷却与暂停遵守对局时间', () => {
  const g = fixture();
  grantCurio(g.save, 'sacred-fragment');
  g.passives.bone = 1;
  const e = target(g);
  let hits = 0;
  g.onEvent = (name) => {
    if (name === 'hurt') hits++;
  };
  const hp = g.player.hp;
  assert.equal(g.buddhaShieldReady, true);
  g.hurtPlayer(10, true, true);
  near(g.player.hp, hp);
  assert.equal(g.burning.life, 0);
  assert.equal(g.corroded, 0);
  near(e.hp, e.maxHp);
  assert.equal(hits, 0);
  assert.equal(g.player.invincible, 0.8);
  assert.equal(g.buddhaShieldReady, false);
  assert.ok(g.effects.some((e) => e.text === '佛光'));
  g.player.invincible = 0;
  g.hurtPlayer(10);
  assert.ok(g.player.hp < hp);
  assert.equal(hits, 1);
  g.state = 'paused';
  g.update(20);
  assert.equal(g.buddhaShieldReady, false);
  g.state = 'playing';
  advance(g, 11.9);
  assert.equal(g.buddhaShieldReady, false);
  advance(g, 0.15);
  assert.equal(g.buddhaShieldReady, true);
});
test('佛光不会被零伤害或已有受击护体消耗；出售后失效，重获立即就绪', () => {
  const g = fixture();
  grantCurio(g.save, 'sacred-fragment');
  g.hurtPlayer(0);
  assert.equal(g.buddhaShieldReady, true);
  g.player.invincible = 1;
  g.hurtPlayer(20);
  assert.equal(g.buddhaShieldReady, true);
  g.player.invincible = 0;
  g.hurtPlayer(20);
  assert.equal(g.buddhaShieldReady, false);
  delete g.save.curios.bag['sacred-fragment'];
  g.update(0.01);
  g.player.invincible = 0;
  const hp = g.player.hp;
  g.hurtPlayer(10);
  assert.ok(g.player.hp < hp);
  // 售出的唯一奇物不会自然再掉落；这里构造持有条件再次成立的状态。
  g.save.curios.bag['sacred-fragment'] = 1;
  assert.equal(g.buddhaShieldReady, true);
});
test('佛光挡已有灼烧的单次直接扣血，不改变灼烧后续时钟', () => {
  const g = fixture();
  grantCurio(g.save, 'sacred-fragment');
  g.burning = { life: 1.5, damage: 30 };
  const hp = g.player.hp;
  g.update(0.05);
  near(g.player.hp, hp);
  near(g.burning.life, 1.45);
  near(g.burning.damage, 29);
  g.update(0.05);
  assert.ok(g.player.hp < hp);
});
test('佛光挡冰弹/魂弹不附带减速封宝；毒池不附带蚀体，纯藤缠不变成免控', () => {
  for (const skill of ['frostbolt', 'soul'] as const) {
    const g = fixture();
    grantCurio(g.save, 'sacred-fragment');
    g.hostileShot(g.player, 1, 0, 0, 10).enemySkill = skill;
    const hp = g.player.hp;
    g.updateShots(0);
    near(g.player.hp, hp);
    assert.equal(g.slowed, 0);
    assert.equal(g.sealed, 0);
    assert.equal(g.buddhaShieldReady, false);
  }
  const g = fixture();
  grantCurio(g.save, 'sacred-fragment');
  g.zones.push({
    x: 0,
    y: 0,
    radius: 50,
    life: 3,
    maxLife: 3,
    damage: 10,
    tick: 0,
    color: '#ffffff',
    kind: 'poison',
    delay: 0,
    hostile: true,
  });
  const hp = g.player.hp;
  g.updateZones(0.01);
  near(g.player.hp, hp);
  assert.equal(g.corroded, 0);
  const roots = fixture();
  grantCurio(roots.save, 'sacred-fragment');
  roots.zones.push({
    x: 0,
    y: 0,
    radius: 50,
    life: 3,
    maxLife: 3,
    damage: 0,
    tick: 1,
    color: '#ffffff',
    kind: 'enemy-roots',
    delay: 0,
    hostile: true,
  });
  roots.updateZones(0.01);
  assert.ok(roots.entangled > 0);
  assert.equal(roots.buddhaShieldReady, true);
});
test('天劫雷击同样被佛光抵消；寿尽不被佛光改写', () => {
  const s = freshSave();
  s.age = s.nextTribulationAge = 90;
  grantCurio(s, 'sacred-fragment');
  s.starter = 'beads';
  s.artifacts.push('beads');
  const g = Game.createTribulation(s, null);
  g.player.invincible = 0;
  const hp = g.player.hp;
  g.hurtPlayer(g.player.maxHp * 0.8);
  near(g.player.hp, hp);
  assert.equal(g.buddhaShieldReady, false);
  const end = fixture();
  grantCurio(end.save, 'sacred-fragment');
  end.save.age = end.lifespan;
  end.update(0.01);
  assert.equal(end.state, 'lost');
  assert.equal(end.player.hp, 0);
});
test('佛光续局总从12秒冷却开始，无新增Save/Run字段，现有组合提示不重放', () => {
  const g = fixture();
  grantCurio(g.save, 'sacred-fragment');
  g.update(0.01);
  const keys = Object.keys(g.save).sort(),
    runKeys = Object.keys(g.snapshot()).sort();
  g.pause();
  const copy = Game.restore(g.save, JSON.parse(JSON.stringify(g.snapshot())));
  assert.ok(copy);
  assert.equal(copy.buddhaShieldReady, false);
  copy.resume();
  advance(copy, 11.9);
  assert.equal(copy.buddhaShieldReady, false);
  advance(copy, 0.15);
  assert.equal(copy.buddhaShieldReady, true);
  assert.deepEqual(Object.keys(copy.save).sort(), keys);
  assert.deepEqual(Object.keys(copy.snapshot()).sort(), runKeys);
  assert.equal(JSON.stringify(copy.snapshot()).includes('buddha'), false);
});
test('风雷翅各单件或两件均只取1.2，不持奇物不生效，送风拾取独立', () => {
  for (const ids of [['fan'], ['lightning'], ['fan', 'lightning']] as WeaponKind[][]) {
    const g = fixture('arrow');
    g.weapons = ids.map((id) => ({ id, level: 1, evolved: false, timer: 9999 }));
    const base = g.stats.speed;
    assert.equal(windThunderCombo(g.save, ids), false);
    grantCurio(g.save, 'wind-wings');
    near(g.stats.speed, base * 1.2);
    assert.equal(windThunderCombo(g.save, ids), true);
    grantCurio(g.save, 'jade-ruyi');
    const magnet = g.stats.magnet;
    if (ids.includes('fan')) assert.ok(curioCombo(g.save, 'fan'));
    else assert.equal(comboTreasure(g.save, 'fan', false).desc, treasure('fan').desc);
    near(g.stats.speed, base * 1.2);
    delete g.save.curios.bag['wind-wings'];
    near(g.stats.speed, base);
    near(g.stats.magnet, magnet);
  }
  const g = fixture('arrow');
  const base = g.stats.speed;
  grantCurio(g.save, 'wind-wings');
  near(g.stats.speed, base * 1.15);
  assert.equal(g.windThunderActive, false);
  assert.equal(curioCombo(g.save, 'lightning'), undefined);
});
test('判天笔普通四道/觉醒六道，间距延迟递增，单道伤害不变，出售取消未生效的额外一笔', () => {
  for (const evolved of [false, true]) {
    const g = fixture('brush', evolved);
    target(g);
    const dmg = g.weaponHitDamage(g.weapons[0]);
    g.cast(g.weapons[0]);
    assert.equal(g.zones.length, evolved ? 5 : 3);
    g.zones = [];
    grantCurio(g.save, 'jade-book');
    g.cast(g.weapons[0]);
    assert.equal(g.zones.length, evolved ? 6 : 4);
    g.zones.forEach((z, i) => {
      near(Math.hypot(z.x, z.y), (i + 1) * 85);
      near(z.delay, (i + 1) * 0.18);
      near(z.damage, dmg);
      assert.equal(z.color, '#bfe6cf');
    });
    delete g.save.curios.bag['jade-book'];
    g.updateZones(0.01);
    assert.equal(g.zones.length, evolved ? 5 : 3);
    assert.ok(g.zones.every((z) => z.color === treasure('brush').color));
  }
});
test('判天笔觉醒说明保留原文，基础态说明显示定稿，不泄露尚未获得的法宝组合', () => {
  const g = fixture('brush', true);
  grantCurio(g.save, 'jade-book');
  assert.equal(comboTreasure(g.save, 'brush', true, true).desc, treasure('brush').desc);
  const view = {
    panel: 'treasure-detail',
    catalogTreasures: TREASURES,
    schoolFilter: 'all',
    selectedTreasure: 'brush',
    bookTab: 'treasures',
    weapons: g.weapons,
  } as const;
  assert.ok(catalogPanel(g.save, view).body.includes(treasure('brush').desc));
  assert.ok(!catalogPanel(g.save, view).body.includes('连书四道'));
  g.weapons[0].evolved = false;
  const html = choiceCard(g, g.save, { type: 'weapon', id: 'brush', level: 2 }, 0);
  assert.ok(
    html.includes('金阙玉书古字为凭，一笔四印判尽天刑；沿目标方向连书四道墨印，依次爆发范围伤害。'),
  );
  g.weapons = [];
  assert.ok(
    !choiceCard(g, g.save, { type: 'weapon', id: 'brush', level: 1 }, 0).includes(
      '金阙玉书古字为凭',
    ),
  );
});
test('灵泉血池每半秒回0.2%，无组合回0.1%，神农鼎回0.15%，蚀体与售出立即生效', () => {
  for (const id of ['bloodpool', 'cauldron'] as const)
    for (const held of [false, true])
      for (const corroded of [false, true]) {
        const g = fixture(id);
        target(g);
        if (held) grantCurio(g.save, 'spirit-spring');
        g.cast(g.weapons[0]);
        g.player.hp = g.player.maxHp * 0.5;
        g.corroded = corroded ? 3 : 0;
        const before = g.player.hp;
        g.updateZones(0.01);
        near(
          g.player.hp - before,
          corroded ? 0 : g.player.maxHp * (id === 'cauldron' ? 0.0015 : held ? 0.002 : 0.001),
        );
        const first = g.player.hp;
        g.updateZones(0.49);
        near(g.player.hp, first);
        g.updateZones(0.02);
        near(
          g.player.hp - first,
          corroded ? 0 : g.player.maxHp * (id === 'cauldron' ? 0.0015 : held ? 0.002 : 0.001),
        );
        delete g.save.curios.bag['spirit-spring'];
        g.corroded = 0;
        g.updateZones(0.5);
        near(
          g.player.hp - (corroded ? before : first * 2 - before),
          g.player.maxHp * (id === 'cauldron' ? 0.0015 : 0.001),
        );
      }
});
test('新增首次提示每局仅一次，风雷与送风独立并可同时提示', () => {
  const g = fixture('arrow');
  const wanted = [
    '梵音护体 · 佛光挡劫',
    '风雷相生 · 身法更疾',
    '玉书落墨 · 判笔添字',
    '灵泉入盏 · 血池回春',
    '如意随风 · 拾取范围扩大',
  ];
  for (const [id, curio] of pairs) {
    grantCurio(g.save, curio);
    g.weapons.push({ id, level: 1, evolved: false, timer: 9999 });
  }
  g.weapons.push({ id: 'fan', level: 1, evolved: false, timer: 9999 });
  grantCurio(g.save, 'wind-wings');
  grantCurio(g.save, 'jade-ruyi');
  const seen: string[] = [];
  for (let i = 0; i < 16; i++) {
    g.noticeTime = 0;
    g.update(0.01);
    if (wanted.includes(g.notice)) seen.push(g.notice);
    g.notice = '';
  }
  assert.equal(seen.length, wanted.length);
  assert.deepEqual([...seen].sort(), [...wanted].sort());
  for (let i = 0; i < 10; i++) {
    g.noticeTime = 0;
    g.update(0.01);
    assert.ok(!wanted.includes(g.notice));
  }
  g.pause();
  const copy = Game.restore(g.save, JSON.parse(JSON.stringify(g.snapshot())));
  assert.ok(copy);
  copy.resume();
  copy.noticeTime = 0;
  copy.update(0.01);
  assert.ok(!wanted.includes(copy.notice));
});
test('旧组穿透魂火只有表现、受现有效果上限约束，出售后不再生成', () => {
  for (const held of [false, true]) {
    const g = fixture('talisman');
    if (held) grantCurio(g.save, 'soul-wood');
    const e = target(g);
    g.cast(g.weapons[0]);
    const b = g.shots[0];
    g.shots = [b];
    Object.assign(b, { x: e.x, y: e.y, vx: 0, vy: 0 });
    g.updateShots(0);
    assert.equal(g.effects.filter((e) => e.kind === 'combo-soul').length, held ? 1 : 0);
    assert.equal(g.damageBySource['combo-soul'], undefined);
  }
});
test('四条船客传闻逐字保留，无持有过滤，已有三条仍在池中', () => {
  const g = fixture();
  const entries = {
    'combo-beads': '庙里的老和尚说，佛门的东西凑在一处，光就亮了一层，连刀都砍不进来。',
    'combo-wings': '跑船的说，见过一个人背后生翅，走起来像一道雷，扇子一摇，人就到了跟前。',
    'combo-brush': '说书先生讲，好笔遇上好书，落墨时会自己多写一笔。',
    'combo-spring': '有人在血池边看见过清泉的光，说那盏子里的血，是越流越活的。',
  };
  for (const [k, text] of Object.entries(entries))
    assert.equal(dockRumorPool(g.save).find((r) => r.key === k)?.text, text);
  for (const k of ['combo-sword', 'combo-fan', 'combo-soul'])
    assert.ok(dockRumorPool(g.save).some((r) => r.key === k));
});

test('风雷装饰只在实际移动中绘制，静止/暂停/减少动态时消失且不消耗战斗随机数', async () => {
  const { drawComboPlayer } = await import('../../src/battle/artifact-effects.ts');
  const g = fixture('fan');
  grantCurio(g.save, 'wind-wings');
  g.random = () => {
    throw new Error('装饰不可消耗战斗随机数');
  };
  let strokes = 0;
  const c = new Proxy({} as CanvasRenderingContext2D, {
    get: (_, key) => () => {
      if (key === 'stroke') strokes++;
    },
  });
  const before = g.snapshot();
  g.player.moving = true;
  g.input = { x: 1, y: 0 };
  drawComboPlayer(c, g, 1, false, true);
  assert.ok(strokes > 0);
  for (const state of ['stopped', 'paused', 'no-input', 'reduced'] as const) {
    strokes = 0;
    g.state = state === 'paused' ? 'paused' : 'playing';
    g.player.moving = state !== 'stopped';
    g.input = { x: state === 'no-input' ? 0 : 1, y: 0 };
    drawComboPlayer(c, g, 1, state === 'reduced', true);
    assert.equal(strokes, 0, state);
  }
  g.state = before.state;
  g.player.moving = false;
  assert.deepEqual(g.snapshot(), before);
});
