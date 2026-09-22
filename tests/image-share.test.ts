import test from 'node:test';
import assert from 'node:assert/strict';
import { shareImage } from '../src/image-share.ts';

const file = new File([new Uint8Array([137, 80, 78, 71])], '此世留影.png', { type: 'image/png' });

test('支持图片分享时直接调用系统面板，发送PNG文件而非数据网址', async () => {
  let called = false;
  const result = shareImage(file, {
    canShare(data) {
      assert.deepEqual(data?.files, [file]);
      return true;
    },
    async share(data) {
      called = true;
      assert.equal(data?.files?.[0], file);
      assert.equal(data?.files?.[0].type, 'image/png');
      assert.equal(data?.url, undefined);
      assert.match(data?.title ?? '', /此世留影/);
    },
  });
  assert.equal(called, true, '不能先等待异步图片转换而丢失用户激活');
  assert.equal(await result, 'shared');
});

test('没有API或不能分享文件时降级保存，不尝试文本分享', async () => {
  assert.equal(await shareImage(file, {}), 'save');
  assert.equal(
    await shareImage(file, { share: async () => assert.fail('缺少文件能力检测') }),
    'save',
  );
  assert.equal(
    await shareImage(file, { canShare: () => false, share: async () => assert.fail('文件不支持') }),
    'save',
  );
});

test('用户主动取消分享不触发保存降级', async () => {
  assert.equal(
    await shareImage(file, {
      canShare: () => true,
      share: async () => {
        throw new DOMException('Cancelled', 'AbortError');
      },
    }),
    'cancelled',
  );
});

test('能力检测或系统分享失败均可降级保存', async () => {
  assert.equal(
    await shareImage(file, {
      canShare: () => {
        throw new Error('Unsupported');
      },
      share: async () => {},
    }),
    'save',
  );
  assert.equal(
    await shareImage(file, {
      canShare: () => true,
      share: async () => {
        throw new DOMException('Denied', 'NotAllowedError');
      },
    }),
    'save',
  );
});
