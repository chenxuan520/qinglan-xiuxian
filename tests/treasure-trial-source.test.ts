import test from 'node:test';
import assert from 'node:assert/strict';
import { TreasureTrialSource } from '../src/treasure-trial-source.ts';
import { catalogPanel } from '../src/catalog-ui.ts';
import { freshSave } from '../src/progress.ts';
import { TREASURES } from '../src/data.ts';

function entryFixture() {
  const button = {
    disabled: false,
    isConnected: true,
    innerHTML: '试演法宝',
    textContent: '',
    focus() {},
  };
  const entry = {
    isConnected: true,
    innerHTML: '<button data-action="treasure-trial">试演法宝</button>',
    querySelector: () => button,
  };
  const modal = { querySelector: () => entry } as unknown as HTMLDivElement;
  return { ui: {} as HTMLDivElement, modal, entry, button };
}

test('藏器阁仅允许已收藏法宝试演，仙器试演不改变本命与炼器', () => {
  const save = freshSave('heaven', ['metal'], 'orthodox');
  const before = JSON.stringify(save);
  for (const item of TREASURES) {
    const view = catalogPanel(save, {
      panel: 'treasure-detail',
      catalogTreasures: TREASURES,
      schoolFilter: 'all',
      treasurePage: 0,
      selectedTreasure: item.id,
      bookTab: 'treasures',
    });
    const button = view.body.match(
      /<button[^>]*data-action="treasure-trial"[^>]*>[^<]*<\/button>/,
    )?.[0];
    assert.ok(button, item.id);
    assert.equal(/disabled/.test(button), !save.artifacts.includes(item.id), item.id);
  }
  assert.equal(JSON.stringify(save), before);
});

test('试演加载只由点击发起；连点合并，关闭后可再次打开', async (t) => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { value: { hidden: false }, configurable: true });
  t.after(() =>
    original
      ? Object.defineProperty(globalThis, 'document', original)
      : Reflect.deleteProperty(globalThis, 'document'),
  );
  const f = entryFixture();
  let finish!: (module: any) => void;
  let calls = 0;
  let starts = 0;
  let close = () => {};
  const module = {
    startTreasureTrial(_ui: unknown, _modal: unknown, id: string, onClose: () => void) {
      assert.equal(id, 'sword');
      starts++;
      close = onClose;
    },
    stopTreasureTrial() {
      close();
    },
  };
  const source = new TreasureTrialSource(() => {
    calls++;
    return new Promise((resolve) => {
      finish = resolve;
    });
  });
  assert.equal(calls, 0);
  const pending = source.open(f.ui, f.modal, 'sword', () => true);
  await source.open(f.ui, f.modal, 'sword', () => true);
  await Promise.resolve();
  assert.equal(calls, 1);
  finish(module);
  await pending;
  assert.equal(starts, 1);
  assert.equal(source.active, true);
  source.stop();
  assert.equal(source.active, false);
  await source.open(f.ui, f.modal, 'sword', () => true);
  assert.equal(starts, 2);
  assert.equal(calls, 1);
});

test('试演加载失败显示原位重试，成功后恢复原按钮且不改存档', async (t) => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { value: { hidden: false }, configurable: true });
  t.after(() =>
    original
      ? Object.defineProperty(globalThis, 'document', original)
      : Reflect.deleteProperty(globalThis, 'document'),
  );
  const f = entryFixture();
  const html = f.entry.innerHTML;
  const attempts: number[] = [];
  let starts = 0;
  const source = new TreasureTrialSource(async (attempt) => {
    attempts.push(attempt);
    if (!attempt) throw new Error('offline');
    return {
      startTreasureTrial() {
        starts++;
      },
      stopTreasureTrial() {},
    } as any;
  });
  await source.open(f.ui, f.modal, 'sword', () => true);
  assert.equal(source.active, false);
  assert.equal(f.button.disabled, false);
  assert.match(f.entry.innerHTML, /重新试演/);
  await source.open(f.ui, f.modal, 'sword', () => true);
  assert.deepEqual(attempts, [0, 1]);
  assert.equal(starts, 1);
  assert.equal(f.entry.innerHTML, html);
});

for (const reason of ['close', 'changed', 'hidden', 'detached'] as const) {
  test(`试演加载迟到不重开界面：${reason}`, async (t) => {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'document');
    const document = { hidden: false };
    Object.defineProperty(globalThis, 'document', { value: document, configurable: true });
    t.after(() =>
      original
        ? Object.defineProperty(globalThis, 'document', original)
        : Reflect.deleteProperty(globalThis, 'document'),
    );
    const f = entryFixture();
    let valid = true;
    let starts = 0;
    let finish!: (module: any) => void;
    const source = new TreasureTrialSource(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const pending = source.open(f.ui, f.modal, 'sword', () => valid);
    await Promise.resolve();
    if (reason === 'close') source.stop();
    if (reason === 'changed') valid = false;
    if (reason === 'hidden') document.hidden = true;
    if (reason === 'detached') f.button.isConnected = false;
    finish({
      startTreasureTrial() {
        starts++;
      },
      stopTreasureTrial() {},
    });
    await pending;
    assert.equal(starts, 0);
    assert.equal(source.active, false);
    assert.equal(f.button.disabled, false);
  });
}
