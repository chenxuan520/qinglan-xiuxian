import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bindSettlementDirectory,
  settlementDirectoryEntrance,
} from '../src/settlement-directory-source.ts';
import { ModuleSource } from '../src/module-source.ts';
import { freshSave } from '../src/progress.ts';
type DirectoryModule = typeof import('../src/settlement-directory.ts');
const tick = () => new Promise((resolve) => setImmediate(resolve));
const module = {
  settlementDirectory: (save: ReturnType<typeof freshSave>) => `当前年岁${save.age}`,
} as DirectoryModule;

function setup(source: ModuleSource<DirectoryModule>) {
  const retry = { onclick: null as null | (() => void) };
  const host = { innerHTML: '', querySelector: () => retry };
  const details = {
    open: false,
    isConnected: true,
    dataset: { settlementDirectory: 'market' },
    matches: () => true,
    querySelector: () => host,
  };
  let toggle: (event: { target: unknown }) => void;
  const root = {
    contains: () => details.isConnected,
    addEventListener: (_: string, callback: typeof toggle) => {
      toggle = callback;
    },
  };
  const context = { save: freshSave(), unfinished: false, locked: false };
  bindSettlementDirectory(root as unknown as HTMLElement, () => context, source);
  return { host, details, context, retry, toggle: () => toggle({ target: details }) };
}

test('去处说明不在入口加载，展开合并请求并按完成时最新状态展示', async () => {
  let calls = 0;
  let resolve!: (value: DirectoryModule) => void;
  const source = new ModuleSource<DirectoryModule>(() => {
    calls++;
    return new Promise((done) => {
      resolve = done;
    });
  });
  const s = setup(source);
  assert.match(settlementDirectoryEntrance(true), /data-settlement-directory="market"/);
  assert.doesNotMatch(settlementDirectoryEntrance(), /\bopen\b/);
  s.toggle();
  await tick();
  assert.equal(calls, 0);
  s.details.open = true;
  s.toggle();
  s.toggle();
  await tick();
  assert.equal(calls, 1);
  s.context.save.age = 99;
  resolve(module);
  await tick();
  assert.equal(s.host.innerHTML, '当前年岁99');
  s.details.open = false;
  s.toggle();
  s.context.save.age = 100;
  s.details.open = true;
  s.toggle();
  await tick();
  assert.equal(calls, 1);
  assert.equal(s.host.innerHTML, '当前年岁100');
});

test('收起、离开或锁档后的迟到加载不写界面，不自动重开', async () => {
  for (const stop of ['close', 'leave', 'lock']) {
    let resolve!: (value: DirectoryModule) => void;
    const s = setup(
      new ModuleSource<DirectoryModule>(
        () =>
          new Promise((done) => {
            resolve = done;
          }),
      ),
    );
    s.details.open = true;
    s.toggle();
    await tick();
    if (stop === 'close') s.details.open = false;
    if (stop === 'leave') s.details.isConnected = false;
    if (stop === 'lock') s.context.locked = true;
    const before = s.host.innerHTML;
    resolve(module);
    await tick();
    assert.equal(s.host.innerHTML, before);
    if (stop === 'close') assert.equal(s.details.open, false);
  }
});

test('加载失败只提供受保护的整页重新加载，不承诺能绕过失败依赖缓存', async () => {
  let attempts = 0;
  const source = new ModuleSource<DirectoryModule>(
    () => (++attempts, Promise.reject(Error('fixture-offline'))),
  );
  const s = setup(source);
  const before = structuredClone(s.context.save);
  s.details.open = true;
  s.toggle();
  s.toggle();
  await tick();
  assert.match(s.host.innerHTML, /data-resource-failure/);
  assert.match(s.host.innerHTML, /data-action="refresh-game"/);
  assert.match(s.host.innerHTML, /重新加载/);
  assert.equal((s.host.innerHTML.match(/<button/g) || []).length, 1);
  assert.equal(s.retry.onclick, null);
  s.details.open = false;
  s.toggle();
  await tick();
  assert.equal(attempts, 1);
  assert.deepEqual(s.context.save, before);
});
