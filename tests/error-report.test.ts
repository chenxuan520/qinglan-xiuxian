import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createErrorWatch,
  describeRuntimeError,
  describeRejection,
  RUNTIME_ERROR_LIMIT,
  type ErrorWatchTarget,
} from '../src/error-report.ts';
import { TELEMETRY_DETAIL_MAX_LENGTH } from '../src/telemetry.ts';

type FakeTarget = ErrorWatchTarget & { emit(type: string, event: unknown): void };
function fakeTarget(): FakeTarget {
  const listeners = new Map<string, ((event: any) => void)[]>();
  return {
    addEventListener: (type, listener) => {
      listeners.set(type, [...(listeners.get(type) ?? []), listener]);
    },
    removeEventListener: (type, listener) => {
      listeners.set(
        type,
        (listeners.get(type) ?? []).filter((item) => item !== listener),
      );
    },
    emit: (type, event) => {
      for (const listener of listeners.get(type) ?? []) listener(event);
    },
  };
}

test('错误摘要包含名字、信息与文件名行号，省略部署 URL', () => {
  const detail = describeRuntimeError({
    message: 'x is not a function',
    filename: 'https://xiuxian.011203.xyz/assets/main-abc123.js?v=2',
    lineno: 123,
    error: new TypeError('x is not a function'),
  });
  assert.equal(detail, 'error: TypeError: x is not a function @ main-abc123.js:123');
});

test('错误摘要清洗控制字符、折叠空白并截断超长信息', () => {
  const newline = String.fromCharCode(10);
  const bell = String.fromCharCode(7);
  const raw = `第一行${newline}第二${bell}段   空`;
  assert.equal(describeRuntimeError({ message: raw }), 'error: 第一行 第二 段 空');
  const long = describeRuntimeError({ message: '很'.repeat(500) });
  assert.equal(long.length, TELEMETRY_DETAIL_MAX_LENGTH);
  assert.ok(long.endsWith('…'));
});

test('缺信息时用未知错误兜底，空文件名不带位置', () => {
  assert.equal(describeRuntimeError({}), 'error: 未知错误');
  assert.equal(
    describeRuntimeError({ message: '', error: new RangeError('越界了') }),
    'error: RangeError: 越界了',
  );
  assert.equal(
    describeRuntimeError({ message: 'Script error.', filename: '' }),
    'error: Script error.',
  );
});

test('Promise 拒绝摘要区分 Error 与其他原因', () => {
  assert.equal(describeRejection({ reason: new Error('载入失败') }), 'rejection: Error: 载入失败');
  assert.equal(describeRejection({ reason: 'plain' }), 'rejection: plain');
  assert.equal(describeRejection({}), 'rejection: 未知原因');
});

test('监听去重相同错误、达到上限后停止，detach 解除监听', () => {
  const target = fakeTarget();
  const sent: string[] = [];
  let notices = 0;
  const watch = createErrorWatch({
    target,
    track: (event) => {
      sent.push(event.detail);
    },
    onError: () => {
      notices += 1;
    },
    limit: 2,
  });
  const same = { message: '崩了', filename: 'C:\\game\\main.js', lineno: 1 };
  target.emit('error', same);
  target.emit('error', same);
  assert.deepEqual(sent, ['error: 崩了 @ main.js:1']);
  target.emit('unhandledrejection', { reason: new Error('请求失败') });
  target.emit('error', { message: '第三次' });
  assert.equal(sent.length, 2);
  assert.equal(notices, 2);
  assert.equal(watch.reported(), 2);
  watch.detach();
  target.emit('error', { message: '又崩了' });
  assert.equal(sent.length, 2);
});

test('默认上限 8 个不同错误；上报或提示抛错都被吞掉', () => {
  const target = fakeTarget();
  const sent: string[] = [];
  createErrorWatch({
    target,
    track: (event) => {
      sent.push(event.detail);
    },
  });
  for (let i = 0; i < RUNTIME_ERROR_LIMIT + 3; i += 1) target.emit('error', { message: `错${i}` });
  assert.equal(sent.length, RUNTIME_ERROR_LIMIT);

  const broken = fakeTarget();
  createErrorWatch({
    target: broken,
    track: () => {
      throw new Error('网络断了');
    },
    onError: () => {
      throw new Error('界面坏了');
    },
  });
  assert.doesNotThrow(() => broken.emit('error', { message: 'x' }));
});
