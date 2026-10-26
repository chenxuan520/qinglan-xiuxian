import test from 'node:test';
import assert from 'node:assert/strict';
import { NpcChatSource } from '../src/npc-chat-source.ts';
const chat = () => ({ closeNpcChat() {}, mountNpcChat() {}, async mountTeaStory() {} });
test('闲谈懒加载迟到时不重开旧人、已关闭或已脱离DOM的面板', async () => {
  let resolve!: (value: ReturnType<typeof chat>) => void;
  let loads = 0,
    mounts = '';
  const source = new NpcChatSource(() => {
    loads++;
    return new Promise((r) => {
      resolve = r;
    });
  });
  const first = source.show(
    { isConnected: true },
    () => {
      mounts += '旧人';
    },
    () => assert.fail(),
  );
  const second = source.show(
    { isConnected: true },
    () => {
      mounts += '新人';
    },
    () => assert.fail(),
  );
  await Promise.resolve();
  resolve(chat());
  await Promise.all([first, second]);
  assert.equal(loads, 1);
  assert.equal(mounts, '新人');
  const closed = source.show(
    { isConnected: true },
    () => assert.fail(),
    () => assert.fail(),
  );
  source.close();
  await closed;
  await source.show(
    { isConnected: false },
    () => assert.fail(),
    () => assert.fail(),
  );
});
test('载入失败可重试，旧失败不覆盖已换人的新面板', async () => {
  let reject!: (error: Error) => void;
  let loads = 0,
    errors = 0,
    mounts = 0;
  const source = new NpcChatSource(() =>
    ++loads === 1
      ? new Promise((_, r) => {
          reject = r;
        })
      : Promise.resolve(chat()),
  );
  const pending = source.show(
    { isConnected: true },
    () => assert.fail(),
    () => {
      errors++;
    },
  );
  await Promise.resolve();
  source.close();
  reject(Error('network'));
  await pending;
  assert.equal(errors, 0);
  await source.show(
    { isConnected: true },
    () => {
      mounts++;
    },
    () => assert.fail(),
  );
  assert.equal(loads, 2);
  assert.equal(mounts, 1);
});

test('闲谈连续失败后递增原构建重试次数，并发共用请求，成功后复用模块', async () => {
  const attempts: number[] = [];
  let mounts = 0,
    failures = 0;
  const source = new NpcChatSource(async (attempt) => {
    attempts.push(attempt);
    if (attempt < 2) throw Error('offline');
    return chat();
  });
  const show = () =>
    source.show(
      { isConnected: true },
      () => {
        mounts++;
      },
      () => {
        failures++;
      },
    );
  await show();
  await show();
  await Promise.all([show(), show()]);
  await show();
  assert.deepEqual(attempts, [0, 1, 2]);
  assert.equal(failures, 2);
  assert.equal(mounts, 2);
});
