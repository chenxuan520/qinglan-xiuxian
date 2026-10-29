import test from 'node:test';
import assert from 'node:assert/strict';
import { freshSave, readSave, realmCost, SAVE_SCHEMA } from '../src/progress.ts';
import { exportSave, importSave } from '../src/save-transfer.ts';
import {
  claimSuppliesReward,
  suppliesCooldown,
  lifespanAdsRemaining,
  canClaimLifespanAd,
} from '../src/ad-reward-limits.ts';
import { joinSect } from '../src/mortal.ts';
import { lifespanEndPanel } from '../src/opening-ui.ts';
import { sectDuesModal } from '../src/lobby-ui.ts';
import { showSuppliesShortage, showRewardAd, showLifespanAd } from '../src/scene-flow.ts';
import { simulateCampaign } from '../scripts/balance-simulation.ts';

const cultivationFor = (major: number) =>
  Array.from({ length: major * 3 }, (_, i) => realmCost(i)).reduce((a, b) => a + b, 0);
for (const [major, years] of [10, 25, 50, 100, 200, 500, 1000, 1000, 1000].entries()) {
  test('补给按领取大境界固定冷却 / ' + major, () => {
    const s = freshSave();
    s.age = 20.25;
    s.cultivation = cultivationFor(major);
    if (major === 8) s.completed = [6];
    s.unlocked = 6;
    assert.equal(suppliesCooldown(s).years, years);
    assert.deepEqual(claimSuppliesReward(s), { stones: 2200, iron: 30 });
    assert.equal(s.adUsage.supplies, 1);
    assert.equal(s.suppliesReadyAt, 20.25 + years);
    const before = structuredClone(s);
    assert.equal(claimSuppliesReward(s), null);
    assert.deepEqual(s, before);
    // 后续突破不追延已记录的到期年岁。
    s.cultivation = cultivationFor(8);
    s.completed = [6];
    assert.equal(s.suppliesReadyAt, 20.25 + years);
    s.age = s.suppliesReadyAt - 0.5;
    assert.equal(suppliesCooldown(s).hint, '尚需不足一年');
    assert.equal(claimSuppliesReward(s), null);
    s.age = s.suppliesReadyAt;
    assert.ok(claimSuppliesReward(s));
    assert.equal(s.suppliesReadyAt, s.age + 1000);
  });
}
test('冷却和历史借寿次数同版导出回导、刷新不重置，下一世清零', () => {
  const s = freshSave();
  s.age = 20.2;
  claimSuppliesReward(s);
  s.adUsage.lifespan = 5;
  const loaded = readSave(JSON.stringify(s));
  assert.equal(loaded.status, 'ok');
  assert.equal(loaded.save.suppliesReadyAt, s.suppliesReadyAt);
  const imported = importSave(exportSave(s, null)).save;
  assert.deepEqual(imported, loaded.save);
  assert.equal(lifespanAdsRemaining(imported), 0);
  assert.equal(canClaimLifespanAd(imported), false);
  const nextLife = freshSave();
  assert.equal(nextLife.suppliesReadyAt, 0);
  assert.equal(lifespanAdsRemaining(nextLife), 3);
});
test('旧档缺少冷却可正常导入且保留已有借寿计数，损坏冷却拒绝', () => {
  const s: any = freshSave();
  s.schema = SAVE_SCHEMA - 1;
  s.adUsage.lifespan = 2;
  delete s.suppliesReadyAt;
  const upgraded = importSave(JSON.stringify(s)).save;
  assert.equal(upgraded.schema, SAVE_SCHEMA);
  assert.equal(upgraded.suppliesReadyAt, 0);
  assert.equal(lifespanAdsRemaining(upgraded), 1);
  for (const value of [-1, '30', null, {}]) {
    s.suppliesReadyAt = value;
    assert.equal(readSave(JSON.stringify(s)).status, 'unreadable');
    assert.throws(() => importSave(JSON.stringify(s)), /损坏/);
  }
});
test('所有补给与借寿入口共享额度；禁用状态不启动供给或观看', () => {
  const s = freshSave();
  claimSuppliesReward(s);
  assert.ok(joinSect(s, 'power', undefined, () => 0));
  s.mortal.member!.dues = 100;
  const c: any = {
    save: s,
    game: null,
    rewardAd: null,
    panel: 'supplies-shortage',
    modal: { innerHTML: '', querySelector: () => null },
    rememberRewardReturn() {},
    adSupplies: () => ({ stones: 300, iron: 30 }),
    AD_SECONDS: 5,
  };
  s.stones = 0;
  assert.ok(showSuppliesShortage(c, 50, 0));
  assert.match(c.modal.innerHTML, /disabled>机缘未至/);
  assert.match(c.modal.innerHTML, /再过 10 年可领取/);
  showRewardAd(c, 'supplies');
  assert.equal(c.panel, 'supplies-shortage');
  assert.equal(c.rewardAd, null);
  assert.match(sectDuesModal(s), /disabled>机缘未至/);
  assert.match(sectDuesModal(s), /供奉待缴期间年岁暂停/);
  for (const count of [0, 1, 2, 3, 99]) {
    s.adUsage.lifespan = count;
    const text = lifespanEndPanel(s).join('');
    if (count < 3) assert.match(text, new RegExp('本世剩余 ' + (3 - count) + ' 次'));
    else {
      assert.match(text, /disabled>天不常借/);
      assert.match(text, /本世三次借寿已尽。/);
      c.panel = 'lifespan-ended';
      showLifespanAd(c);
      assert.equal(c.panel, 'lifespan-ended');
    }
  }
  s.lifeMode = 'extreme';
  s.adUsage.lifespan = 0;
  s.suppliesReadyAt = 0;
  assert.equal(claimSuppliesReward(s), null);
  assert.equal(canClaimLifespanAd(s), false);
  assert.match(lifespanEndPanel(s).join(''), /极限模式不可借寿/);
});
test('满投入模拟遵守真实补给冷却，不能在同一年反复领取无限强化', () => {
  const c = {
    root: 'heaven',
    path: 'orthodox',
    starter: 'sword',
    device: 'phone',
    profile: 'maxed',
    difficulty: 0,
    seed: 41,
  } as const;
  const row = simulateCampaign(c);
  assert.equal(row.stop, 'supplies-cooldown');
  assert.equal(row.ads.supplies, 1);
  assert.equal(row.ads.borrow, 0);
  assert.equal(row.ads.revive, 0);
});

test('非整数年岁领取和整数冷却边界不因浮点误差多显示一年', () => {
  for (const age of [15.1, 15.15, 15.6, 20.2]) {
    const save = freshSave();
    save.age = age;
    claimSuppliesReward(save);
    assert.equal(suppliesCooldown(save).hint, '再过 10 年可领取');
    save.age = age + 9;
    assert.equal(suppliesCooldown(save).hint, '再过 1 年可领取');
    save.age = age + 9.5;
    assert.equal(suppliesCooldown(save).hint, '尚需不足一年');
    save.age = age + 10;
    assert.equal(suppliesCooldown(save).hint, '');
    assert.equal(suppliesCooldown(save).available, true);
  }
});
