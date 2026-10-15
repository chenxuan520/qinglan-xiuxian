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
