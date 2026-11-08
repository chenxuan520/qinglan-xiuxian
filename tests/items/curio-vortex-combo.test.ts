import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../../src/battle/game.ts';
import { freshSave } from '../../src/core/progress.ts';
import { grantCurio } from '../../src/items/curio-data.ts';
import { treasure, TREASURES } from '../../src/core/data.ts';
import { comboTreasure, curioCombo } from '../../src/items/curio-combos.ts';
import { dockRumorPool, dockRumors } from '../../src/town/dock-rumors.ts';
import { drawComboVortex } from '../../src/battle/artifact-effects.ts';
import { exportSave, importSave } from '../../src/core/save-transfer.ts';
import { guideContent, GUIDE_TABS } from '../../src/guide/guide-content.ts';

const notice = '天机入阵 · 阴阳流转';
const desc = '天机屋的推演之术映入阵盘，阴阳法阵更广，牵引更急。';
const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
function fixture(held = true, acquired = true, evolved = false) {
  const save = freshSave('none', [], 'dual', () => 0.5);
  save.artifacts = TREASURES.map((t) => t.id);
  save.starter = 'vortex';
  if (held) grantCurio(save, 'heaven-house');
  const g = new Game(save, 0, 0, () => 0.99);
  g.weapons = acquired ? [{ id: 'vortex', level: evolved ? 6 : 1, evolved, timer: 9999 }] : [];
  g.spawnBudget = -10000;
  g.nextElite = 99999;
  g.bossSpawned = true;
  g.player.invincible = 9999;
  const e = g.spawnEnemy(0, false, false, { x: 150, y: 0 });
  e.speed = 0;
  e.hp = e.maxHp = 1e6;
  return { g, e };
}
for (const evolved of [false, true])
  test(`天机屋阴阳盘${evolved ? '觉醒' : '普通'}半径叠乘1.25，伤害/时长/冷却/名称保留，售出后新阵恢复`, () => {
    const plain = fixture(false, true, evolved),
      combo = fixture(true, true, evolved);
    for (const { g } of [plain, combo]) {
      g.passives.area = 3;
      g.cast(g.weapons[0]);
    }
    const a = plain.g.zones[0],
      b = combo.g.zones[0];
    near(b.radius, a.radius * 1.25);
    near(b.damage, a.damage);
    near(b.life, a.life);
    near(b.delay, a.delay);
    near(combo.g.weaponHitDamage(combo.g.weapons[0]), plain.g.weaponHitDamage(plain.g.weapons[0]));
    near(combo.g.stats.cooldown, plain.g.stats.cooldown);
    assert.equal(comboTreasure(combo.g.save, 'vortex').name, treasure('vortex').name);
    delete combo.g.save.curios.bag['heaven-house'];
    combo.g.cast(combo.g.weapons[0]);
    near(combo.g.zones.at(-1)!.radius, a.radius);
    assert.equal(comboTreasure(combo.g.save, 'vortex').desc, treasure('vortex').desc);
  });

test('牵引75只对本世持屋且本局取得阴阳盘生效；只有其一、售出均60，妖王始终不受牵引', () => {
  for (const held of [false, true])
    for (const acquired of [false, true]) {
      const { g, e } = fixture(held, acquired);
      const boss = g.spawnEnemy(10, false, true, { x: 30, y: 40 });
      const mob = { x: 30, y: 40 };
      Object.assign(e, mob);
      // 使用正式生成的法阵，让同一个在场区域在售出时立即降低牵引速度。
      g.weapons = [{ id: 'vortex', level: 1, evolved: false, timer: 9999 }];
      g.cast(g.weapons[0]);
      if (!acquired) g.weapons = [];
      Object.assign(g.zones[0], { x: 0, y: 0, delay: 0, tick: 999 });
      const speed = held && acquired ? 75 : 60;
      g.updateZones(0.1);
      near(e.x, 30 - 0.6 * speed * 0.1);
      near(e.y, 40 - 0.8 * speed * 0.1);
      near(boss.x, 30);
      near(boss.y, 40);
      Object.assign(e, mob);
      delete g.save.curios.bag['heaven-house'];
      g.updateZones(0.1);
      near(e.x, 26.4);
      near(e.y, 35.2);
    }
});

test('组合描述仅在已取得时替换，不泄露到指南或未取得的法宝，传闻无条件入池并可随机抽到', () => {
  const { g } = fixture();
  assert.equal(curioCombo(g.save, 'vortex')?.notice, notice);
  assert.equal(comboTreasure(g.save, 'vortex', true).desc, desc);
  assert.equal(comboTreasure(g.save, 'vortex', false).desc, treasure('vortex').desc);
  const text = '有个算命的说，屋子里算得清天机的人，摆起阵来，连妖物都绕不出去。';
  for (const held of [false, true]) {
    const { g } = fixture(held, false);
    assert.equal(dockRumorPool(g.save).find((r) => r.key === 'combo-house')?.text, text);
  }
  let selected = false;
  for (let i = 0; i < 100; i++) {
    g.save.mortal.scenery = undefined;
    g.save.age = 15 + i;
    if (dockRumors(g.save, false).some((r) => r.key === 'combo-house')) selected = true;
  }
  assert.ok(selected);
  for (const tab of GUIDE_TABS) assert.ok(!guideContent(tab.id).includes('天机屋 + 阴阳盘'));
});

test('本局首次提示一次，卖掉再持有不重复，暂停/续局不重放，无新增保存字段', () => {
  const { g } = fixture(),
    keys = Object.keys(g.save).sort(),
    snapshotKeys = Object.keys(g.snapshot()).sort();
  g.noticeTime = 0;
  g.update(0.01);
  assert.equal(g.notice, notice);
  for (let i = 0; i < 3; i++) {
    g.notice = '';
    g.noticeTime = 0;
    g.update(0.01);
    assert.notEqual(g.notice, notice);
  }
  delete g.save.curios.bag['heaven-house'];
  g.update(0.01);
  g.save.curios.bag['heaven-house'] = 1;
  g.notice = '';
  g.noticeTime = 0;
  g.update(0.01);
  assert.notEqual(g.notice, notice);
  g.cast(g.weapons[0]);
  g.pause();
  assert.deepEqual(Object.keys(g.save).sort(), keys);
  assert.deepEqual(Object.keys(g.snapshot()).sort(), snapshotKeys);
  for (const h of [Game.restore(g.save, g.snapshot()), importSave(exportSave(g.save, g)).run]) {
    assert.ok(h);
    assert.deepEqual(h.zones, g.zones);
    h.resume();
    h.notice = '';
    h.noticeTime = 0;
    h.update(0.01);
    assert.notEqual(h.notice, notice);
  }
  const next = fixture().g;
  next.noticeTime = 0;
  next.update(0.01);
  assert.equal(next.notice, notice);
});

test('八卦叠纹八段、原色半透明、慢转，减少动态冻结且完整恢复画布状态', () => {
  const { g } = fixture();
  g.cast(g.weapons[0]);
  for (const reduced of [false, true]) {
    const rotations: number[] = [],
      segments: number[] = [],
      alphas: number[] = [],
      colors: unknown[] = [];
    const stack: Record<string, unknown>[] = [];
    const state: Record<string, unknown> = {
      globalAlpha: 1,
      strokeStyle: '#000',
      fillStyle: '#000',
      lineWidth: 7,
    };
    const c = new Proxy(state, {
      get(target, key) {
        if (key === 'save') return () => stack.push({ ...state });
        if (key === 'restore') return () => Object.assign(state, stack.pop());
        if (key === 'rotate') return (n: number) => rotations.push(n);
        if (key === 'moveTo')
          return (x: number, y: number) => {
            assert.ok(Number.isFinite(x) && Number.isFinite(y));
            segments.push(x);
          };
        if (['beginPath', 'closePath', 'translate', 'lineTo', 'arc'].includes(String(key)))
          return (...args: number[]) =>
            assert.ok(args.every((x) => typeof x === 'boolean' || Number.isFinite(x)));
        if (key === 'fill' || key === 'stroke')
          return () => {
            alphas.push(Number(state.globalAlpha));
            colors.push(state.strokeStyle);
          };
        return target[String(key)];
      },
      set(target, key, value) {
        target[String(key)] = value;
        return true;
      },
    }) as unknown as CanvasRenderingContext2D;
    const before = { ...state };
    drawComboVortex(c, g.zones[0], 5, reduced);
    near(rotations[0], reduced ? 0 : 2);
    assert.equal(segments.length, 8);
    assert.ok(alphas.every((a) => a === 0.5));
    assert.ok(colors.every((color) => color === treasure('vortex').color));
    assert.deepEqual(state, before);
    assert.equal(stack.length, 0);
  }
});
