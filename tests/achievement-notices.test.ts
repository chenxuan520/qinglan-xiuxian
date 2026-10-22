import test from 'node:test';
import assert from 'node:assert/strict';
import { freshSave } from '../src/progress.ts';
import { ACHIEVEMENT_IDS, recordChronicle } from '../src/chronicle.ts';
import { AchievementNotices } from '../src/achievement-notices.ts';
import { ChronicleSource } from '../src/chronicle-source.ts';
import * as content from '../src/chronicle-content.ts';
import { forgeTreasure, catalogPanel } from '../src/catalog-ui.ts';
import type { ActionShell } from '../src/action-controller.ts';

const drain = () => new Promise<void>((resolve) => setImmediate(resolve));
test('炼器保存失败保持资源、阶数和可重试界面，成功后才提示且连点不重复扣费颁奖', async () => {
  const save = freshSave(),
    source = new ChronicleSource(async () => content),
    messages: string[] = [];
  save.forge[save.starter] = 9;
  save.stones = save.iron = 100000;
  source.observe(save, true);
  let stored = JSON.stringify(save),
    fail = true,
    renders = 0;
  const before = stored;
  const shell = {
    save,
    selectedTreasure: save.starter,
    pendingRun: null,
    saveLock: null,
    writeSave(next: typeof save) {
      if (fail) throw Error('模拟写入失败');
      stored = JSON.stringify(next);
      source.observe(next);
    },
    renderLobby() {},
    renderPanel() {
      renders++;
    },
    toast: (text: string) => messages.push(text),
  } as unknown as ActionShell;
  forgeTreasure(shell);
  await drain();
  source.flush(true, (text) => messages.push(text));
  assert.equal(JSON.stringify(save), before);
  assert.equal(stored, before);
  assert.equal(renders, 0);
  assert.deepEqual(messages, ['炼器未保存，请重试']);
  const view = {
    panel: 'treasure-detail' as const,
    catalogTreasures: [],
    schoolFilter: 'all',
    treasurePage: 0,
    selectedTreasure: save.starter,
    bookTab: 'treasures',
  };
  assert.doesNotMatch(catalogPanel(save, view).body, /data-action="forge"[^>]*disabled/);
  fail = false;
  forgeTreasure(shell);
  await drain();
  source.flush(true, (text) => messages.push(text));
  assert.equal(save.forge[save.starter], 10);
  assert.equal(JSON.stringify(save), stored);
  assert.equal(renders, 1);
  assert.match(catalogPanel(save, view).body, /data-action="forge"[^>]*disabled/);
  const success = stored;
  forgeTreasure(shell);
  await drain();
  source.flush(true, (text) => messages.push(text));
  assert.equal(stored, success);
  assert.equal(renders, 1);
  assert.equal(messages.filter((text) => text.includes('仙途成就')).length, 1);
});
test('同批成就合并原提示，战斗/已有提示期间不消耗队列，显示后不重弹', () => {
  const save = freshSave(),
    queue = new AchievementNotices(),
    shown: string[] = [];
  for (const id of ACHIEVEMENT_IDS) save.chronicle.milestones[id] = 15;
  queue.add(save, ['peerless', 'forge']);
  queue.add(save, ['forge']);
  queue.flush(false, (text) => shown.push(text));
  assert.equal(shown.length, 0);
  queue.flush(true, (text) => shown.push(text));
  assert.deepEqual(shown, ['仙途成就 · 炉火纯青、万古独尊 · 仙途履历']);
  queue.flush(true, (text) => shown.push(text));
  assert.equal(shown.length, 1);
  queue.add(save, ACHIEVEMENT_IDS.slice());
  queue.clear();
  queue.flush(true, (text) => shown.push(text));
  assert.equal(shown.length, 1);
});

test('继承档不误提示圆满，非成就里程碑不会触发成就提示', () => {
  const save = freshSave(),
    queue = new AchievementNotices(),
    shown: string[] = [];
  for (const id of ACHIEVEMENT_IDS) save.chronicle.milestones[id] = 15;
  save.chronicle.milestones['birth-inheritance'] = 15;
  queue.add(save, ['peerless', 'forge', 'realm-1']);
  queue.flush(true, (text) => shown.push(text));
  assert.deepEqual(shown, ['仙途成就 · 炉火纯青 · 仙途履历']);
});

test('初载/重复提交不补弹；成功提交后的新增成就只提示一次', async () => {
  const save = freshSave(),
    source = new ChronicleSource(async () => content),
    shown: string[] = [];
  save.chronicle.milestones.story = 15;
  source.observe(save, true);
  source.observe(save);
  await drain();
  source.flush(true, (text) => shown.push(text));
  assert.equal(shown.length, 0);
  recordChronicle(save, '炉火纯青', '实际新增', 'forge');
  source.observe(save);
  source.observe(save);
  await drain();
  source.flush(false, (text) => shown.push(text));
  source.flush(true, (text) => shown.push(text));
  source.flush(true, (text) => shown.push(text));
  assert.deepEqual(shown, ['仙途成就 · 炉火纯青 · 仙途履历']);
});

test('导入/轮回建立新基线，异步旧模块迟到不串世，不阻止新世正常获奖', async () => {
  let finish!: (module: typeof content) => void;
  const source = new ChronicleSource(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const before = freshSave(),
    shown: string[] = [];
  source.observe(before, true);
  recordChronicle(before, '炉火纯青', '旧世新增', 'forge');
  source.observe(before);
  await drain();
  const next = freshSave();
  source.observe(next, true);
  finish(content);
  await drain();
  source.flush(true, (text) => shown.push(text));
  assert.equal(shown.length, 0);
  recordChronicle(next, '炉火纯青', '新世新增', 'forge');
  source.observe(next);
  await drain();
  source.flush(true, (text) => shown.push(text));
  assert.deepEqual(shown, ['仙途成就 · 炉火纯青 · 仙途履历']);
});

test('冷模块失败不会反向影响已保存成就，安全界面短提示兜底，下一项仍可正常加载', async () => {
  let calls = 0;
  const source = new ChronicleSource(() => {
    if (++calls === 1) throw Error('模拟离线');
    return Promise.resolve(content);
  });
  const save = freshSave(),
    shown: string[] = [];
  source.observe(save, true);
  recordChronicle(save, '炉火纯青', '新增', 'forge');
  assert.doesNotThrow(() => source.observe(save));
  await drain();
  source.flush(false, (text) => shown.push(text));
  source.flush(true, (text) => shown.push(text));
  assert.deepEqual(shown, ['成就达成']);
  assert.ok('forge' in save.chronicle.milestones);
  recordChronicle(save, '奇珍有缘', '新增', 'curio-three');
  source.observe(save);
  await drain();
  source.flush(true, (text) => shown.push(text));
  assert.deepEqual(shown, ['成就达成', '仙途成就 · 奇珍有缘 · 仙途履历']);
});
