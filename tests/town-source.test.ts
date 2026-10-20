import test from 'node:test';
import assert from 'node:assert/strict';
import { mountTownScene, showTownArrival } from '../src/scene-flow.ts';
import { freshSave } from '../src/progress.ts';

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
test('入镇加载失败可重试，返乡提示在实际场景挂载后显示且只显示一次', async () => {
  let resolve!: (m: any) => void, reject!: (e: Error) => void;
  const host = { innerHTML: '', isConnected: true, dataset: {} as Record<string, string> };
  const arrivals: string[] = [];
  let mounts = 0;
  const shell: any = {
    save: freshSave('heaven', ['metal'], 'orthodox', () => 0.5),
    inTown: true,
    inMarket: false,
    saveLock: null,
    townScene: null,
    townPosition: { x: 600, y: 600 },
    persist: () => {},
    freshTownPopulation: () => ({ seed: 1, since: 15 }),
    document: { getElementById: () => host },
    townSource: {
      load: () =>
        new Promise((r, j) => {
          resolve = r;
          reject = j;
        }),
    },
  };
  mountTownScene(shell);
  showTownArrival(shell, '旧舍已新，炊烟如故。');
  reject(Error('offline'));
  await flush();
  assert.match(host.innerHTML, /重新加载/);
  assert.equal(shell.townScene, null);
  assert.equal(host.dataset.arrival, '旧舍已新，炊烟如故。');
  mountTownScene(shell);
  resolve({
    TownScene: class {
      constructor() {
        mounts++;
      }
      showArrival(s: string) {
        arrivals.push(s);
      }
    },
  });
  await flush();
  assert.equal(mounts, 1);
  assert.deepEqual(arrivals, ['旧舍已新，炊烟如故。']);
  assert.equal(host.dataset.arrival, undefined);
});

test('入镇加载迟到后不能重开离场、锁档或已换掉的场景', async () => {
  for (const mode of ['exit', 'lock', 'detach', 'already-mounted']) {
    let resolve!: (m: any) => void,
      mounts = 0;
    const host = { innerHTML: '', isConnected: true, dataset: {} };
    const save = freshSave('heaven', ['metal'], 'orthodox', () => 0.5);
    save.mortal.population = { seed: 1, since: 15 };
    const shell: any = {
      save,
      inTown: true,
      inMarket: false,
      saveLock: null,
      townScene: null,
      townPosition: { x: 600, y: 600 },
      document: { getElementById: () => host },
      townSource: {
        load: () =>
          new Promise((r) => {
            resolve = r;
          }),
      },
    };
    mountTownScene(shell);
    if (mode === 'exit') shell.inTown = false;
    if (mode === 'lock') shell.saveLock = 'stale';
    if (mode === 'detach') host.isConnected = false;
    if (mode === 'already-mounted') shell.townScene = {};
    resolve({
      TownScene: class {
        constructor() {
          mounts++;
        }
      },
    });
    await flush();
    assert.equal(mounts, 0, mode);
  }
});
