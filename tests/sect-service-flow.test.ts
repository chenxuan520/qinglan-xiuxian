import test from 'node:test';
import assert from 'node:assert/strict';
import { freshSave, realmCost, readSave } from '../src/progress.ts';
import { joinSect } from '../src/mortal.ts';
import { sectServiceAction } from '../src/sect-service-flow.ts';
import { sectServiceQuote, sectServiceStamp } from '../src/sect-services.ts';
import type { ActionShell } from '../src/action-controller.ts';

// 调用正式办理入口，只替换 DOM 叶节点与写档；业务报价、执行及应用均用正式模块。
function harness(id: 'bone' | 'devour') {
  const save = freshSave('heaven', ['metal']);
  save.cultivation = Array.from({ length: 6 }, (_, i) => realmCost(i)).reduce((a, b) => a + b, 0);
  save.stones = 10000;
  assert.ok(joinSect(save, id));
  save.artifacts.push('orbit');
  save.medicine.bag.huanglong = 3;
  const choice = id === 'bone' ? 'orbit' : 'huanglong';
  const button = {
    disabled: false,
    dataset: { action: 'sect-service-act', id: choice, stamp: sectServiceStamp(save) },
  };
  const host = { dataset: { sect: id }, querySelectorAll: () => [button] };
  const result = { textContent: '' };
  const messages: string[] = [];
  let fail = false,
    stored = JSON.stringify(save),
    writes = 0;
  const shell = {
    save,
    inMortalWorld: true,
    inTown: false,
    inMarket: false,
    game: null,
    saveLock: null,
    panel: 'sect-service',
    pendingRun: null,
    structuredClone,
    modal: {
      querySelector: (selector: string) =>
        selector === '#sect-service-content'
          ? host
          : selector === '#sect-service-result'
            ? result
            : null,
    },
    document: { getElementById: () => ({}) },
    mortalStatus: () => '',
    panelFrame: () => {},
    toast: (message: string) => messages.push(message),
    writeSave(next: typeof save) {
      writes++;
      if (fail) throw Error('storage unavailable');
      assert.equal(readSave(JSON.stringify(next)).status, 'ok');
      stored = JSON.stringify(next);
    },
  } as unknown as ActionShell;
  return {
    shell,
    save,
    choice,
    button,
    host,
    messages,
    result,
    get stored() {
      return stored;
    },
    get writes() {
      return writes;
    },
    fail() {
      fail = true;
    },
    act() {
      sectServiceAction(shell, 'sect-service-act', choice);
    },
  };
}

test('献物连修经正式界面入口先存后应用，一次写入库存、阶数和冷却，旧按钮不重复办理', () => {
  for (const id of ['bone', 'devour'] as const) {
    const h = harness(id),
      before = structuredClone(h.save),
      q = sectServiceQuote(h.save, h.choice);
    assert.equal(q.reason, '');
    h.act();
    assert.equal(h.writes, 1);
    assert.deepEqual(JSON.parse(h.stored), h.save);
    assert.equal(h.save.stones, before.stones - q.stones - q.reserve);
    assert.ok(Math.abs(h.save.age - before.age - q.years) < 1e-8);
    if (id === 'bone') {
      assert.equal(h.save.mortal.mastery.bone, 3);
      assert.ok(!h.save.artifacts.includes('orbit'));
    } else {
      assert.equal(h.save.training.vitality, q.levels);
      assert.equal(h.save.medicine.bag.huanglong, 2);
    }
    assert.ok(h.result.textContent);
    const settled = JSON.stringify(h.save);
    h.act();
    assert.equal(h.writes, 1);
    assert.equal(JSON.stringify(h.save), settled);
  }
});

test('献物办理保存失败完整回滚；过时报价、已离场、跨宗、续局与锁档均不扣物或写入', () => {
  for (const id of ['bone', 'devour'] as const)
    for (const reason of [
      'write',
      'stale',
      'closed',
      'world',
      'member',
      'unfinished',
      'lock',
      'disabled',
    ]) {
      const h = harness(id);
      if (reason === 'write') h.fail();
      if (reason === 'stale') h.button.dataset.stamp = 'stale';
      if (reason === 'closed') h.shell.panel = null;
      if (reason === 'world') h.shell.inMortalWorld = false;
      if (reason === 'member') h.host.dataset.sect = 'guard';
      if (reason === 'unfinished') h.shell.pendingRun = {} as ActionShell['pendingRun'];
      if (reason === 'lock') h.shell.saveLock = 'changed' as ActionShell['saveLock'];
      if (reason === 'disabled') h.button.disabled = true;
      const before = JSON.stringify(h.save),
        stored = h.stored;
      h.act();
      assert.equal(JSON.stringify(h.save), before, `${id}/${reason}`);
      assert.equal(h.stored, stored, `${id}/${reason}`);
      assert.equal(h.writes, reason === 'write' ? 1 : 0, `${id}/${reason}`);
      assert.equal(h.result.textContent, '');
    }
});
