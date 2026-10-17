import test from 'node:test';
import assert from 'node:assert/strict';
import { GuideSource } from '../src/guide-source.ts';
import * as guide from '../src/guide.ts';

test('首次打开指南合并并发加载，成功后重开直接复用模块', async () => {
  let finish!: (value: typeof guide) => void;
  let calls = 0;
  const source = new GuideSource(() => {
    calls++;
    return new Promise((resolve) => {
      finish = resolve;
    });
  });
  const first = source.load();
  const second = source.load();
  assert.equal(first, second);
  assert.equal(source.current, null);
  await Promise.resolve();
  finish(guide);
  assert.equal(await first, guide);
  assert.equal(source.current, guide);
  assert.equal(await source.load(), guide);
  assert.equal(calls, 1);
});

test('网络失败可以重新加载，不留下永久失败的promise；成功后保留全部说明分类', async () => {
  let calls = 0;
  const source = new GuideSource(async () => {
    if (++calls === 1) throw Error('网络失败');
    return guide;
  });
  await assert.rejects(source.load(), /网络失败/);
  assert.equal(source.current, null);
  const loaded = await source.load();
  assert.ok(loaded.GUIDE_TABS.length >= 5);
  assert.match(loaded.guideContent('basics'), /局内灵气与永久修为/);
  assert.match(loaded.guideContent('combat'), /雷路/);
  assert.equal(calls, 2);
});

test('加载器同步失败也可以重试，指南加载不在构造时发生', async () => {
  let calls = 0;
  const source = new GuideSource(() => {
    if (++calls === 1) throw Error('暂时不可用');
    return Promise.resolve(guide);
  });
  assert.equal(calls, 0);
  await assert.rejects(source.load(), /暂时不可用/);
  assert.equal(await source.load(), guide);
});

test('连续失败递增模块重试身份，并发请求只占一次尝试', async () => {
  const attempts: number[] = [];
  const source = new GuideSource(async (attempt) => {
    attempts.push(attempt);
    if (attempt < 2) throw Error('断网');
    return guide;
  });
  const first = source.load();
  assert.equal(first, source.load());
  await assert.rejects(first, /断网/);
  await assert.rejects(source.load(), /断网/);
  assert.equal(await source.load(), guide);
  assert.equal(await source.load(), guide);
  assert.deepEqual(attempts, [0, 1, 2]);
});
