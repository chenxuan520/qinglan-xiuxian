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
    persist: () => events.push('persist'),
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
