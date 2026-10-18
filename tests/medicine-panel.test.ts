import test from 'node:test';
import assert from 'node:assert/strict';
import { freshSave } from '../src/progress.ts';
import { MedicinePanel } from '../src/medicine-panel.ts';

function fixture() {
  const save = freshSave('heaven', ['metal'], 'dual', () => 0.5);
  save.medicine.bag.huanglong = 3;
  const events: string[] = [];
  const modal = { querySelector: () => ({ value: '2' }) } as unknown as HTMLDivElement;
  const panel = new MedicinePanel(save, modal, {
    show: () => events.push('show'),
    render: () => events.push('render'),
    refresh: () => events.push('refresh'),
    commit: () => {
      events.push('persist');
      return true;
    },
    starterChanged: () => events.push('starter'),
    toast: () => events.push('toast'),
  });
  const context = { panel: 'medicine', hasGame: false, pendingRun: false, herbsShop: false };
  return { save, panel, events, context };
}

test('丹药操作沿用输入数量，写入一次后刷新世界并提示', () => {
  const { save, panel, events, context } = fixture();
  assert.equal(panel.handle('medicine-use', 'huanglong', context), true);
  assert.equal(save.medicine.bag.huanglong, 1);
  assert.equal(save.medicine.active.huanglong, save.age + 200);
  assert.deepEqual(events, ['persist', 'refresh', 'toast']);
});

test('续局期间不能用药或散去药效，普通战斗不处理丹囊入口', () => {
  const { save, panel, context } = fixture();
  save.medicine.active.huanglong = save.age + 100;
  const before = JSON.stringify(save);
  assert.equal(panel.handle('medicine-use', 'huanglong', { ...context, pendingRun: true }), true);
  assert.equal(
    panel.handle('medicine-discard', 'huanglong', { ...context, pendingRun: true }),
    true,
  );
  assert.equal(JSON.stringify(save), before);
  assert.equal(panel.handle('medicine', undefined, { ...context, hasGame: true }), false);
});

test('药铺入口限制于药铺人物，切换视图后重置品级筛选', () => {
  const { panel, events, context } = fixture();
  assert.equal(panel.handle('medicine-shop', undefined, context), false);
  assert.deepEqual(events, []);
  assert.equal(panel.handle('medicine-view', 'shop', context), true);
  assert.deepEqual(events, []);
  panel.handle('medicine-tier', '灵品', context);
  assert.match(panel.content(0, false, false), /data-id="灵品"[^>]*aria-pressed="true"/);
  panel.handle('medicine-view', 'craft', context);
  assert.match(panel.content(0, false, false), /data-id="all"[^>]*aria-pressed="true"/);
});

test('丹药写入失败时不扣库存、灵石或年岁，重试成功仅结算一次，补天后才切换本命显示', () => {
  for (const action of [
    'medicine-use',
    'medicine-craft',
    'medicine-recipe',
    'medicine-buy',
    'medicine-discard',
  ]) {
    for (const failure of ['false', 'throw']) {
      const save = freshSave('variant', ['metal'], 'dual', () => 0.5);
      save.stones = 10000;
      save.unlocked = 6;
      save.cultivation = 20000;
      for (const id of [
        'huanglong',
        'jinsui',
        'yangjing',
        'qingling',
        'huxin',
        'bigu',
        'yingxiang',
        'chousui',
        'butian',
        'heqi',
      ])
        save.medicine.bag[id] = 20;
      save.medicine.recipes = action === 'medicine-craft' ? ['heqi'] : [];
      save.medicine.active.huanglong = save.age + 100;
      save.medicine.shop = {
        ids: ['huanglong', 'jinsui', 'bigu'],
        refreshAt: save.age + 10,
        bought: {},
      };
      let stored = JSON.stringify(save),
        succeed = false,
        refreshes = 0,
        starters = 0;
      const original = stored;
      const messages: string[] = [];
      const panel = new MedicinePanel(
        save,
        { querySelector: () => null } as unknown as HTMLDivElement,
        {
          show: () => {},
          render: () => {},
          refresh: () => {
            refreshes++;
          },
          starterChanged: () => {
            starters++;
          },
          toast: (message) => {
            messages.push(message);
          },
          commit: (next) => {
            assert.equal(JSON.stringify(save), original, '写入前不得修改原对象');
            if (!succeed) {
              if (failure === 'throw') throw Error('storage unavailable');
              return false;
            }
            stored = JSON.stringify(next);
            return true;
          },
        },
      );
      const context = { panel: 'medicine', hasGame: false, pendingRun: false, herbsShop: true };
      if (action === 'medicine-buy') panel.handle('medicine-shop', undefined, context);
      const id =
        action === 'medicine-use'
          ? 'butian'
          : ['medicine-craft', 'medicine-recipe'].includes(action)
            ? 'heqi'
            : 'huanglong';
      assert.equal(panel.handle(action, id, context), true);
      assert.equal(JSON.stringify(save), original);
      assert.equal(stored, original);
      assert.equal(refreshes, 0);
      assert.equal(starters, 0);
      assert.ok(messages.every((message) => message.includes('未生效')));
      succeed = true;
      assert.equal(panel.handle(action, id, context), true);
      assert.equal(stored, JSON.stringify(save));
      assert.notEqual(stored, original);
      assert.equal(refreshes, 1);
      assert.equal(starters, action === 'medicine-use' ? 1 : 0);
      if (action === 'medicine-craft') {
        assert.equal(save.age, 25);
        assert.equal(save.stones, 9960);
        assert.equal(save.medicine.bag.heqi, 21);
      }
    }
  }
});

test('药铺换货也先保存后应用，保存失败不换货、不打开成功界面', () => {
  const save = freshSave();
  let succeed = false,
    shown = 0;
  const panel = new MedicinePanel(save, {} as HTMLDivElement, {
    show: () => {
      shown++;
    },
    render: () => {},
    refresh: () => {},
    starterChanged: () => {},
    toast: () => {},
    commit: () => succeed,
  });
  const context = { panel: 'medicine', hasGame: false, pendingRun: false, herbsShop: true };
  panel.handle('medicine-shop', undefined, context);
  assert.equal(save.medicine.shop, null);
  assert.equal(shown, 0);
  succeed = true;
  panel.handle('medicine-shop', undefined, context);
  assert.equal(save.medicine.shop!.ids.length, 3);
  assert.equal(shown, 1);
});
