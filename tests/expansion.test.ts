import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { Game } from '../src/game.ts';
import {
  TREASURES,
  PASSIVES,
  evolutionPassives,
  passive,
  allowsSchool,
  treasure,
  ENEMIES,
  STAGES,
  STAGE_ENEMIES,
  enemyRoster,
  type CultivationPath,
  type WeaponKind,
} from '../src/data.ts';
import { freshSave, parseSave } from '../src/progress.ts';
import { autoplayChoice } from '../src/autoplay.ts';
import { itemArt } from '../src/item-art.ts';
import { icon } from '../src/icons.ts';
import { SPRITE_ATLASES } from '../src/sprites.ts';

function seeded(seed = 72) {
  return () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
}
function fixture(id: WeaponKind = 'sword', path: CultivationPath = 'dual') {
  return new Game({ ...freshSave(), starter: id, path }, 0, 0, seeded());
}
function advance(g: Game, seconds: number) {
  for (let i = 0; i < seconds * 20; i++) g.update(0.05);
}
function target(g: Game, x = 100, y = 0) {
  const e = g.spawnEnemy(4, false, false, { x, y });
  e.hp = e.maxHp = 10000;
  e.speed = 0;
  e.damage = 0;
  return e;
}

test('52 种物品均有唯一图片区域，所有图标统一使用生成图集', () => {
  assert.equal(PASSIVES.length, 16);
  assert.equal(PASSIVES.filter((p) => p.school === 'orthodox').length, 8);
  const frames = [...TREASURES, ...PASSIVES].map((t) => {
    const art = itemArt(t.id)!;
    assert.ok(art && existsSync(`public${art.src}`), t.id);
    assert.match(icon(t.id), /class="icon item-art/);
    assert.ok(!icon(t.id).includes('<svg'), t.id);
    return JSON.stringify(art);
  });
  assert.equal(new Set(frames).size, 52);
});

test('三条路线同时筛选法宝和功法；各流派法宝满足配方后可觉醒', () => {
  for (const path of ['orthodox', 'demonic', 'dual'] as const) {
    const g = fixture('sword', path),
      seen = new Set<string>();
    for (let i = 0; i < 700; i++)
      for (const c of g.makeChoices()) {
        if (c.type === 'weapon') assert.ok(allowsSchool(path, treasure(c.id).school));
        if (c.type !== 'passive') continue;
        seen.add(c.id);
        assert.ok(path === 'dual' || passive(c.id).school === path);
      }
    assert.equal(seen.size, path === 'dual' ? 16 : 8);
    for (const t of TREASURES.filter((t) => allowsSchool(path, t.school))) {
      const h = fixture(t.id, path);
      h.weapons[0].level = 6;
      for (const id of evolutionPassives(t, path)) {
        h.passives = { [id]: 2 };
        assert.ok(!h.makeChoices().some((c) => c.type === 'evolve'));
        h.passives[id] = 3;
        assert.ok(h.makeChoices().some((c) => c.type === 'evolve' && c.id === t.id));
      }
    }
  }
});

test('36 件觉醒法宝均能独立战斗且对局可保存恢复', () => {
  for (const t of TREASURES) {
    const g = fixture(t.id, t.school);
    g.weapons[0].level = 6;
    g.weapons[0].evolved = true;
    g.player.hp = g.player.maxHp = 10000;
    for (let i = 0; i < 8; i++)
      target(g, Math.cos((i * Math.PI) / 4) * 100, Math.sin((i * Math.PI) / 4) * 100);
    advance(g, 4);
    assert.ok(g.damageDealt > 0, t.name);
    const restored = Game.restore(g.save, JSON.parse(JSON.stringify(g.snapshot())));
    assert.ok(restored, t.name);
    assert.equal(restored.path, t.school);
    assert.equal(restored.weapons[0].id, t.id);
    restored.resume();
    advance(restored, 1);
    assert.ok(Number.isFinite(restored.damageDealt), t.name);
  }
});

test('路线加成与存档迁移：旧档兼修，本局不受大厅改路线影响', () => {
  const orthodox = fixture('sword', 'orthodox'),
    demonic = fixture('sword', 'demonic'),
    dual = fixture();
  assert.equal(orthodox.player.maxHp, 112);
  assert.equal(orthodox.stats.regen, dual.stats.regen + 0.2);
  assert.equal(demonic.stats.damage, 1.12);
  demonic.save.path = 'orthodox';
  assert.equal(demonic.path, 'demonic');
  assert.equal(Game.restore(demonic.save, demonic.snapshot())?.path, 'demonic');
  const old = JSON.parse(JSON.stringify(dual.snapshot()));
  delete old.path;
  old.passives = { guard: 2 };
  assert.equal(Game.restore(demonic.save, old)?.path, 'dual');
  assert.equal(parseSave('{}').path, 'dual');
  assert.equal(parseSave(JSON.stringify({ ...freshSave(), path: 'unknown' })).path, 'dual');
  assert.equal(parseSave(JSON.stringify({ ...freshSave(), path: 'orthodox' })).path, 'orthodox');
  assert.equal(Game.restore(dual.save, { ...old, path: 'demonic' }), null);
});

test('魔道功法分别触发残血加速、承伤代价、骨刺反击、减速和拘魂', () => {
  const g = fixture('sword', 'demonic');
  g.passives = { frenzy: 3, blood: 2, bone: 2, abyss: 3 };
  const normalCd = g.stats.cooldown,
    normalSpeed = g.stats.speed;
  assert.equal(g.stats.armor, 1.06);
  g.player.hp = 40;
  assert.ok(g.stats.cooldown < normalCd && g.stats.speed > normalSpeed);
  const e = target(g, 90);
  g.hurtPlayer(10);
  assert.ok(e.hp < e.maxHp);
  assert.ok(Math.abs(e.slow - 0.45) < 1e-9);
  const hp = e.hp;
  g.hurtPlayer(10);
  assert.equal(e.hp, hp, '无敌间隔内不能重复反击');
  g.passives = { soul: 2, devour: 2 };
  const near = target(g, 150),
    far = target(g, 200),
    playerHp = g.player.hp;
  g.hitEnemy(near, 20000);
  g.hitEnemy(far, 20000);
  assert.ok(Math.abs(g.player.hp - playerHp - 0.6) < 1e-9);
  assert.equal(g.pickups.find((p) => p.x === 150 && p.kind === 'xp')?.pull, true);
  assert.equal(g.pickups.find((p) => p.x === 200 && p.kind === 'xp')?.pull, false);
});

test('玄天伞清除近身敌弹并反击，失效敌弹不能伤害角色', () => {
  const g = fixture('umbrella');
  target(g, 100);
  g.shots.push({
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    life: 2,
    radius: 7,
    damage: 30,
    color: '#ffffff',
    kind: 'hostile',
    pierce: 1,
    hit: new Set(),
    origin: { x: 0, y: 0 },
    age: 0,
    bounce: 0,
    crit: false,
  });
  g.update(0.05);
  assert.equal(g.player.hp, g.player.maxHp);
  assert.ok(!g.shots.some((s) => s.kind === 'hostile'));
  assert.ok(g.shots.some((s) => s.kind === 'umbrella'));
});

test('驻地灵塔周期锁敌；葬天棺延迟落地后留下持续伤害', () => {
  const tower = fixture('pagoda'),
    e = target(tower, 180);
  tower.update(0.05);
  const hp = e.hp;
  advance(tower, 0.6);
  assert.ok(e.hp < hp);
  const coffin = fixture('coffin'),
    f = target(coffin, 180);
  advance(coffin, 0.7);
  assert.equal(f.hp, f.maxHp);
  advance(coffin, 0.4);
  const after = f.hp;
  assert.ok(after < f.maxHp);
  advance(coffin, 0.7);
  assert.ok(f.hp < after);
});

test('裂魂镜仅分裂一次，摄魂镰对低血量目标伤害翻倍', () => {
  const g = fixture('shard');
  target(g, 45);
  g.update(0.05);
  advance(g, 0.2);
  assert.equal(g.shots.length, 2);
  assert.ok(g.shots.every((s) => s.bounce === 0 && s.hit.size === 1));
  const h = fixture('scythe'),
    high = target(h, 100, 10),
    low = target(h, 100, -10);
  low.hp = 2000;
  h.update(0.05);
  assert.ok(Math.abs(2000 - low.hp - (10000 - high.hp) * 2) < 1e-8);
});

test('吸血、持续恢复与地面丹药都不能让致死伤害后的角色复活', () => {
  const g = fixture('cauldron');
  g.passives = { devour: 5 };
  g.player.hp = 0.001;
  g.hurtPlayer(0.002);
  g.pickups = [{ x: 0, y: 0, kind: 'heal', value: 1, pull: false }];
  const e = target(g, 80);
  g.hitEnemy(e, 20000);
  g.update(0.05);
  assert.equal(g.state, 'lost');
  assert.equal(g.player.hp, 0);
});

test('AI 识别魔道配套功法并优先仙器进化', () => {
  const g = fixture('pagoda', 'demonic');
  g.weapons[0].level = 6;
  g.choices = [
    { type: 'weapon', id: 'sand', level: 1 },
    { type: 'passive', id: 'devour', level: 3 },
    { type: 'passive', id: 'curse', level: 1 },
  ];
  assert.equal(autoplayChoice(g)?.index, 1);
  g.choices.push({ type: 'evolve', id: 'pagoda', level: 7 });
  assert.equal(autoplayChoice(g)?.index, 3);
});

test('正魔各 18 法宝，本命不跨流派；旧对局已有装备仍保留', () => {
  for (const school of ['orthodox', 'demonic'] as const) {
    assert.equal(TREASURES.filter((t) => t.school === school).length, 18);
    const wrong = TREASURES.find((t) => t.school !== school)!;
    const g = fixture(wrong.id, school);
    assert.equal(treasure(g.weapons[0].id).school, school);
    const loaded = parseSave(JSON.stringify({ ...freshSave(), path: school, starter: wrong.id }));
    assert.equal(treasure(loaded.starter).school, school);
    const old = g.snapshot();
    old.weapons = [{ id: wrong.id, level: 2, evolved: false, timer: 0 }];
    const restored = Game.restore(g.save, old)!;
    assert.ok(restored);
    assert.equal(restored.weapons[0].id, wrong.id);
    for (let i = 0; i < 100; i++)
      for (const c of restored.makeChoices()) {
        if (c.type === 'weapon' && c.level === 1) assert.equal(treasure(c.id).school, school);
      }
  }
});

test('六境妖潮累加保留旧怪；新召唤师生成对应高阶妖物', () => {
  for (let stage = 0; stage < 6; stage++) {
    const g = new Game(freshSave(), stage, 0, seeded());
    g.time = 300;
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) {
      const e = g.spawnEnemy(undefined, i % 10 === 0);
      seen.add(e.type);
      assert.ok(STAGE_ENEMIES[stage].includes(e.type));
    }
    assert.deepEqual(
      [...seen].sort((a, b) => a - b),
      [...STAGE_ENEMIES[stage]].sort((a, b) => a - b),
    );
    assert.ok(enemyRoster(stage, 0).length < enemyRoster(stage, 300).length);
    if (stage > 0)
      for (const type of enemyRoster(stage - 1, 300))
        assert.ok(enemyRoster(stage, 300).includes(type));
  }
  const g = new Game(freshSave(), 5, 0, seeded());
  g.weapons = [];
  const summoner = g.spawnEnemy(27, false, false, { x: 250, y: 0 });
  summoner.cooldown = 0;
  g.update(0.05);
  assert.equal(g.enemies.length, 3);
  assert.ok(g.enemies.every((e) => STAGE_ENEMIES[5].includes(e.type)));
  assert.ok(g.enemies.every((e) => e.type !== 0));
});

test('散射发出三弹、环射发出八弹，亮盾减伤而暗盾可被全额击伤', () => {
  for (const [type, count] of [
    [13, 3],
    [15, 8],
  ]) {
    const g = fixture();
    g.weapons = [];
    const e = g.spawnEnemy(type, false, false, { x: 300, y: 0 });
    e.cooldown = 0;
    g.update(0.05);
    assert.equal(g.shots.filter((s) => s.kind === 'hostile').length, count);
  }
  const g = fixture(),
    e = g.spawnEnemy(14, false, false, { x: 300, y: 0 });
  e.hp = e.maxHp = 1000;
  e.cooldown = 3;
  g.hitEnemy(e, 100);
  assert.equal(e.hp, 955);
  e.cooldown = 1;
  g.hitEnemy(e, 100);
  assert.equal(e.hp, 855);
  assert.equal(new Set([...ENEMIES, ...STAGES].map((e) => e.sprite)).size, 34);
});

test('所有场景和人物图集真实存在且为有效 PNG，新增引用不会缺图', () => {
  for (const url of [...STAGES.map((s) => s.terrain), ...SPRITE_ATLASES.map((s) => s.url)]) {
    assert.ok(existsSync(`public${url}`), url);
    const png = readFileSync(`public${url}`);
    assert.equal(png.subarray(1, 4).toString(), 'PNG', url);
    assert.ok(png.readUInt32BE(16) > 0 && png.readUInt32BE(20) > 0, url);
  }
});
