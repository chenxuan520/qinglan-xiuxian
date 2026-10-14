import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { createContext, Script } from 'node:vm';

const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
const source = main.match(/^function shellBindings\([^]*?^\}/m);
assert.ok(source, '实际主入口必须提供状态绑定');

function harness() {
  const context = createContext({ game: null, save: { stones: 1 }, panel: '' });
  new Script(`
    globalThis.structuredClone = function(value) {
      if (this !== globalThis) throw new TypeError('Illegal invocation');
      return JSON.parse(JSON.stringify(value));
    };
    globalThis.clearInterval = function(id) {
      if (this !== globalThis) throw new TypeError('Illegal invocation');
      globalThis.cleared = id;
    };
  `).runInContext(context);
  new Script(stripTypeScriptTypes(source![0])).runInContext(context);
  return { context, shell: new Script('shellBindings()').runInContext(context) };
}

test('浏览器全局函数经过状态绑定后仍以全局对象调用', () => {
  const { context, shell } = harness();
  const original = { stones: 3, nested: { count: 2 } };
  const clone = shell.structuredClone(original);
  assert.equal(clone.stones, 3);
  assert.equal(clone.nested.count, 2);
  assert.notEqual(clone.nested, original.nested);
  shell.clearInterval(42);
  assert.equal(context.cleared, 42);
});

test('事件与HUD复用同一个绑定对象，仍实时读取并回写游戏状态', () => {
  const { context, shell } = harness();
  assert.equal(new Script('shellBindings()').runInContext(context), shell);
  context.game = { state: 'playing' };
  assert.equal(shell.game, context.game);
  const replacement = { state: 'paused' };
  shell.game = replacement;
  assert.equal(context.game, replacement);
  shell.panel = 'reward-ad';
  assert.equal(context.panel, 'reward-ad');
  context.save = { stones: 99 };
  assert.equal(shell.save.stones, 99, '导入或轮回后的存档不能沿用旧引用');
  assert.notEqual(harness().shell, shell, '不同页面的绑定不能共用');
});
