import test from 'node:test';
import assert from 'node:assert/strict';
import {
  freshSave,
  parseSave,
  retreat,
  retreatPlan,
  syncTribulationClock,
  tribulationDue,
} from '../src/progress.ts';
import { Game } from '../src/game.ts';
import { exportSave, importSave } from '../src/save-transfer.ts';

test('闭关免费度过年岁，三属性均可随机提升，不增加修为与根基阶数', () => {
  const save = freshSave();
  save.stones = 80;
  assert.deepEqual(
    [1, 5, 10].map((years) => retreatPlan(save, years)?.years),
    [1, 5, 10],
  );
  const values = [0.05, 0.5, 0.999];
  const result = retreat(save, 10, () => values.shift()!);
  assert.deepEqual(result, { years: 10, gains: { vitality: 0, power: 3, speed: 0 } });
  assert.equal(save.age, 10);
  assert.equal(save.stones, 80);
  assert.equal(save.cultivation, 0);
  assert.deepEqual(save.training, { vitality: 0, power: 0, speed: 0 });
  assert.deepEqual(retreat(save, 10, () => 0.1)?.gains, { vitality: 0, power: 0, speed: 0 });
  assert.deepEqual(save.retreatBonus, { vitality: 0, power: 3, speed: 0 });
  save.lifespanBonus = 30;
  assert.equal(retreatPlan(save, 13)!.years, 13);
  assert.equal(retreatPlan(save, 90)!.chance, 90 / 130);
  assert.equal(retreat(save, 1.5, () => 0.9)?.years, 1.5);
});

test('自填年数校验与寿元不足不扣时间，投入一半寿元即有50%成功率且没有概率上限', () => {
  const save = freshSave();
  save.age = 90;
  for (const option of [10, -1, 101, 0.01, 0, Infinity, NaN]) {
    const before = JSON.stringify(save);
    assert.equal(retreat(save, option), null);
    assert.equal(JSON.stringify(save), before);
  }

  assert.equal(retreat(save, 5, () => 0.9)?.years, 5);
});

test('闭关加成作用于实际气血、伤害与移速，续局及导入保留，旧档和轮回归零', () => {
  const save = freshSave();
  const source = new Game(save, 0, 0);
  source.player.hp -= 20;
  source.pause();
  const snapshot = source.snapshot();
  const damage = source.stats.damage;
  const speed = source.stats.speed;
  for (const pick of [0, 0.4, 0.9]) {
    const rolls = [0, pick, 0];
    retreat(save, 10, () => rolls.shift()!);
  }
  const resumed = Game.restore(save, snapshot)!;
  assert.equal(resumed.player.maxHp, Math.round(source.player.maxHp * 1.01));
  assert.equal(resumed.player.maxHp - resumed.player.hp, 20);
  assert.equal(resumed.stats.damage, damage * 1.01);
  assert.equal(resumed.stats.speed, speed * 1.01);
  const imported = importSave(exportSave(save, resumed));
  assert.deepEqual(imported.save.retreatBonus, save.retreatBonus);
  assert.equal(imported.run!.player.maxHp, resumed.player.maxHp);
  assert.deepEqual(
    parseSave(JSON.stringify({ ...save, retreatBonus: undefined })).retreatBonus,
    freshSave().retreatBonus,
  );
  assert.throws(() =>
    importSave(JSON.stringify({ ...save, retreatBonus: { vitality: -1, power: 0, speed: 0 } })),
  );
});

test('大乘及渡劫境闭关只快进，在下次天劫处截停，不再抽属性提升', () => {
  for (const completed of [[], [6]]) {
    const save = freshSave();
    save.cultivation = 1e9;
    save.completed = completed;
    syncTribulationClock(save);
    assert.deepEqual(
      [100, 1000, 5000].map((years) => retreatPlan(save, years)?.years),
      [100, 1000, 5000],
    );
    save.age = 19950;
    assert.equal(
      retreat(save, 5000, () => {
        throw new Error('不应抽取属性');
      })?.years,
      50,
    );
    assert.equal(save.age, 20000);
    assert.ok(tribulationDue(save));
    assert.equal(retreat(save, 1), null);
    assert.deepEqual(save.retreatBonus, freshSave().retreatBonus);
  }
});

test('100年寿元投入50年为50%整次成功率，临界抽签失败；投入80年可达80%', () => {
  const success = freshSave();
  const rolls = [0.4999, 0.9, 0.5];
  assert.equal(retreatPlan(success, 50)!.chance, 0.5);
  assert.deepEqual(retreat(success, 50, () => rolls.shift()!)?.gains, {
    vitality: 0,
    power: 0,
    speed: 2,
  });
  const failure = freshSave();
  assert.deepEqual(retreat(failure, 50, () => 0.5)?.gains, freshSave().retreatBonus);
  const high = freshSave();
  assert.equal(retreatPlan(high, 80)!.chance, 0.8);
  assert.equal(retreat(high, 80, () => 0)?.gains.vitality, 1);
});
