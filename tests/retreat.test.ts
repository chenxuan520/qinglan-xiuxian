import test from 'node:test';
import assert from 'node:assert/strict';
import {
  freshSave,
  parseSave,
  retreat,
  retreatPlan,
  realmCost,
  realmInfo,
  lifespanInfo,
  bossCultivationReward,
  syncTribulationClock,
  tribulationDue,
} from '../src/progress.ts';
import { Game } from '../src/game.ts';
import { exportSave, importSave } from '../src/save-transfer.ts';
import { SPIRIT_ROOTS } from '../src/data.ts';

test('闭关免费度过年岁，获得少量随机修为，三属性均可随机提升且不增加根基阶数', () => {
  const save = freshSave();
  save.stones = 80;
  assert.deepEqual(
    [1, 5, 10].map((years) => retreatPlan(save, years)?.years),
    [1, 5, 10],
  );
  const values = [0.05, 0.5, 0.999, 0.5];
  const result = retreat(save, 10, () => values.shift()!);
  assert.equal(result!.years, 10);
  assert.deepEqual(result!.gains, { vitality: 0, power: 3, speed: 0 });
  assert.equal(result!.cultivation, 8);
  assert.equal(save.age, 25);
  assert.equal(save.stones, 80);
  assert.equal(save.cultivation, 8);
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
    const rolls = [0, pick, 0, 0];
    retreat(save, 10, () => rolls.shift()!);
  }
  const resumed = Game.restore(save, snapshot)!;
  assert.equal(resumed.player.maxHp, Math.round(source.player.maxHp * 1.01));
  assert.equal(resumed.player.maxHp - resumed.player.hp, 20);
  assert.equal(resumed.stats.damage, damage * 1.01);
  assert.equal(resumed.stats.speed, speed * 1.01);
  const imported = importSave(exportSave(save, resumed));
  assert.deepEqual(imported.save.retreatBonus, save.retreatBonus);
  assert.equal(imported.save.cultivation, save.cultivation);
  assert.ok(imported.save.cultivation > 0);
  assert.equal(imported.run!.player.maxHp, resumed.player.maxHp);
  assert.deepEqual(
    parseSave(JSON.stringify({ ...save, retreatBonus: undefined })).retreatBonus,
    freshSave().retreatBonus,
  );
  assert.throws(() =>
    importSave(JSON.stringify({ ...save, retreatBonus: { vitality: -1, power: 0, speed: 0 } })),
  );
});

test('大乘闭关在天劫处截停，通关后的真仙境自由快进，两者不再抽取收益', () => {
  for (const completed of [[], [6]]) {
    const save = freshSave();
    save.age = 0; // 既有存档的天劫计时从零岁开始。
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
      completed.length ? 5000 : 50,
    );
    assert.equal(save.age, completed.length ? 24950 : 20000);
    assert.equal(save.cultivation, 1e9);
    assert.equal(tribulationDue(save), !completed.length);
    if (!completed.length) assert.equal(retreat(save, 1), null);
    else assert.equal(retreatPlan(save, 50000)!.years, 50000);
    assert.deepEqual(save.retreatBonus, freshSave().retreatBonus);
  }
});

test('100年寿元投入50年为50%整次成功率，临界抽签失败；投入80年可达80%', () => {
  const success = freshSave();
  const rolls = [0.4999, 0.9, 0.5, 0.5];
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

test('相同投入的闭关修为随资质递减，收益符合预览的随机百分比范围', () => {
  const expected = [42, 35, 29, 23, 16, 12, 8];
  for (const [i, root] of SPIRIT_ROOTS.entries()) {
    for (const roll of [0, 0.5, 0.999999]) {
      const save = freshSave();
      save.spiritRoot = root.id;
      const plan = retreatPlan(save, 50)!;
      assert.equal(plan.cultivation.minPercent, 8 * root.rate);
      assert.equal(plan.cultivation.maxPercent, 16 * root.rate);
      const rolls = [0.9, roll]; // 属性未提升时，仍可获得修为。
      const result = retreat(save, 50, () => rolls.shift()!)!;
      assert.ok(result.cultivation >= plan.cultivation.min);
      assert.ok(result.cultivation <= plan.cultivation.max);
      assert.equal(result.cultivationPercent, (result.cultivation / 352) * 100);
      assert.deepEqual(result.gains, freshSave().retreatBonus);
      if (roll === 0.5) assert.equal(result.cultivation, expected[i]);
    }
  }
});

test('七个有限寿元境界整段或拆分闭关最多推进一个小阶段，不能跨大境界且收益低于对应妖王', () => {
  for (let major = 0; major < 7; major++) {
    const start = Array.from({ length: major * 3 }, (_, i) => realmCost(i)).reduce(
      (a, b) => a + b,
      0,
    );
    for (const root of SPIRIT_ROOTS) {
      for (const parts of [1, 10]) {
        const save = freshSave();
        save.cultivation = start;
        save.spiritRoot = root.id;
        const years = Math.floor(((lifespanInfo(save).remaining - 0.1) / parts) * 10) / 10;
        const gainPerRetreat = retreatPlan(save, years)!.cultivation.max;
        for (let i = 0; i < parts; i++)
          assert.equal(retreat(save, years, () => 0.999999)?.cultivation, gainPerRetreat);
        const step = realmInfo(save.cultivation).step;
        assert.ok(step >= major * 3 && step <= major * 3 + 1);
        assert.equal(save.cultivation - start, gainPerRetreat * parts);
        assert.ok(
          save.cultivation - start < bossCultivationReward(Math.max(0, major - 1)) * root.rate,
        );
      }
    }
  }
});

test('极短闭关不保底送修为，借寿后的收益仍按延长后的寿元比例计算', () => {
  const save = freshSave();
  for (let i = 0; i < 100; i++) assert.equal(retreat(save, 0.1, () => 0.999999)!.cultivation, 0);
  const before = retreatPlan(save, 50)!.cultivation;
  save.lifespanBonus = 100;
  const after = retreatPlan(save, 50)!.cultivation;
  assert.equal(after.minPercent, before.minPercent / 2);
  assert.equal(after.maxPercent, before.maxPercent / 2);
});

test('接近突破时可用闭关补足修为，突破大乘从出关年岁起计算天劫', () => {
  for (const target of [3, 21]) {
    const save = freshSave();
    const threshold = Array.from({ length: target }, (_, i) => realmCost(i)).reduce(
      (a, b) => a + b,
      0,
    );
    save.cultivation = threshold - 1;
    const before = lifespanInfo(save).limit;
    const result = retreat(save, before / 10, () => 0.5)!;
    assert.ok(result.cultivation > 1);
    assert.equal(realmInfo(save.cultivation).step, target);
    assert.ok(lifespanInfo(save).limit > before);
    if (target === 21) assert.equal(save.nextTribulationAge, save.age + 20000);
    const restored = parseSave(JSON.stringify(save));
    assert.equal(restored.cultivation, save.cultivation);
    assert.equal(restored.nextTribulationAge, save.nextTribulationAge);
  }
});
