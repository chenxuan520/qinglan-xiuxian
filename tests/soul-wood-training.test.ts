import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.ts';
import { grantCurio } from '../src/curio-data.ts';
import { freshSave, train, retreatPlan } from '../src/progress.ts';
import { spiritPower } from '../src/spirit-power.ts';
import { powerBreakdown } from '../src/power-breakdown.ts';
import { exportSave, importSave } from '../src/save-transfer.ts';
import { curioInfo } from '../src/curio-info.ts';
import { cultivationPanel } from '../src/cultivation-ui.ts';

const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);

test('养魂木放大三项根基各50%，零阶不增裸属性，曾得或售出不生效', () => {
  for (const [level, health, damage, speed] of [
    [0, 0, 0, 0],
    [10, 0.5, 0.2, 0.2],
    [20, 1.0375, 0.6, 0.415],
  ])
    for (const status of ['absent', 'held', 'sold', 'zero']) {
      const save = freshSave('heaven', ['metal'], 'dual', () => 0.5);
      if (status !== 'absent') grantCurio(save, 'soul-wood');
      if (status === 'sold') delete save.curios.bag['soul-wood'];
      if (status === 'zero') save.curios.bag['soul-wood'] = 0;
      save.training = { vitality: level, power: level, speed: level };
      const multiplier = status === 'held' ? 1.5 : 1;
      const base = new Game(
        freshSave('heaven', ['metal'], 'dual', () => 0.5),
        0,
        0,
      );
      const g = new Game(save, 0, 0);
      assert.equal(g.player.maxHp, Math.round(base.player.maxHp * (1 + health * multiplier)));
      near(g.stats.damage / base.stats.damage, 1 + damage * multiplier);
      near(g.stats.speed / base.stats.speed, 1 + speed * multiplier);
      const preview = spiritPower(save);
      assert.equal(preview.hp, g.player.maxHp);
      near(preview.damage, g.stats.damage);
      near(preview.speed, g.stats.speed);
    }
});

test('真实同预算修习到十阶和满阶，三项增幅进入命中、气血和实际位移', () => {
  for (const [level, spent] of [
    [10, 8256],
    [20, 53571],
  ]) {
    const games = [false, true].map((wood) => {
      const save = freshSave('heaven', ['metal'], 'dual', () => 0.5);
      save.stones = 100000;
      if (wood) grantCurio(save, 'soul-wood');
      for (const kind of ['vitality', 'power', 'speed'] as const)
        for (let i = 0; i < level; i++) assert.equal(train(save, kind), true);
      assert.equal(100000 - save.stones, spent);
      const g = new Game(save, 0, 0, () => 0.99);
      g.spawnBudget = -10000;
      g.nextElite = 99999;
      g.input = { x: 1, y: 0 };
      const speed = g.stats.speed;
      const target = g.spawnEnemy(0, false, false, { x: 100, y: 0 });
      target.hp = target.maxHp = 1e9;
      target.damage = target.speed = 0;
      g.update(0.05);
      near(g.player.x, speed * 0.05);
      g.input = { x: 0, y: 0 };
      for (let i = 0; i < 9; i++) g.update(0.05);
      assert.ok(g.damageBySource.sword > 0, '真实飞剑命中并进入伤害统计');
      return g;
    });
    const [plain, wood] = games;
    assert.equal(plain.save.age, wood.save.age);
    assert.ok(wood.player.maxHp > plain.player.maxHp);
    near(
      wood.damageBySource.sword / plain.damageBySource.sword,
      level === 10 ? 1.3 / 1.2 : 1.9 / 1.6,
    );
    near(wood.player.x / plain.player.x, level === 10 ? 1.3 / 1.2 : 1.6225 / 1.415);
  }
});

test('身法来源显示养魂木贡献，闭关同样增五成', () => {
  const save = freshSave('heaven', ['metal'], 'dual', () => 0.5);
  save.training = { vitality: 10, power: 10, speed: 10 };
  const before = retreatPlan(save, 10)!;
  grantCurio(save, 'soul-wood');
  const after = retreatPlan(save, 10)!;
  near(after.cultivation.minPercent / before.cultivation.minPercent, 1.5);
  near(after.cultivation.maxPercent / before.cultivation.maxPercent, 1.5);
  const breakdown = powerBreakdown(save);
  const wood = breakdown.rows.find((r) => r.id === 'curio:soul-wood')!;
  assert.deepEqual(wood.changes.map((c) => c.key).sort(), ['hp', 'speed', 'weaponDamage']);
  assert.equal(breakdown.rows.find((r) => r.id === 'speed')!.related, '养魂木 → 身法移速');
  assert.match(curioInfo('soul-wood')!.effect, /身法移速.*50%/);
  const html = cultivationPanel(save, 0).body;
  assert.match(html, /含养魂木：前十阶每阶移速 \+3%，满阶 \+62\.25%/);
  assert.match(html, /含养魂木：前十阶每阶气血 \+7\.5%，满阶 \+155\.625%/);
});

test('养魂木三项根基在受伤续局和导入导出中一致，不增加字段或重复补气血', () => {
  const save = freshSave('heaven', ['metal'], 'dual', () => 0.5);
  save.training = { vitality: 20, power: 20, speed: 20 };
  grantCurio(save, 'soul-wood');
  const keys = Object.keys(save).sort();
  const g = new Game(save, 0, 0, () => 0.5);
  g.player.hp -= 37;
  g.pause();
  const once = importSave(exportSave(save, g));
  const twice = importSave(exportSave(once.save, once.run));
  for (const restored of [once, twice]) {
    assert.ok(restored.run);
    assert.equal(restored.run.player.maxHp, g.player.maxHp);
    assert.equal(restored.run.player.hp, g.player.hp);
    near(restored.run.stats.damage, g.stats.damage);
    near(restored.run.stats.speed, g.stats.speed);
    assert.deepEqual(Object.keys(restored.save).sort(), keys);
  }
});
