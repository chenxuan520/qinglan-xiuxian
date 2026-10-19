import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { createContext, Script } from 'node:vm';
import { createUpdateCheck } from '../src/update-check.ts';
import {
  resourceFailureContent,
  resourcesUpdated,
  panelUpdateNotice,
} from '../src/resource-panel.ts';

const current = 'a'.repeat(24),
  next = 'b'.repeat(24);
const source = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
const start = source.indexOf('let handledResourceFailure = false;');
const end = source.indexOf('// 展示顺序独立于图集顺序', start);
assert.ok(start >= 0 && end > start);
const flow = new Script(
  stripTypeScriptTypes(source.slice(start, end).replace('import.meta.env.BASE_URL', "'/'")),
);

function harness() {
  const target = new EventTarget();
  const note = { textContent: '暂未展开，请重试。' };
  const state = { notes: [note], panel: true, notices: 0, inserted: '', removed: 0, requests: 0 };
  const panel = {
    querySelector: () => state.notes[0] ?? null,
    insertAdjacentHTML: (_: string, html: string) => {
      state.inserted += html;
    },
  };
  const document = {
    querySelectorAll: () => state.notes,
    querySelector: () => ({ remove: () => state.removed++ }),
  };
  let release!: (value: Response) => void;
  flow.runInContext(
    createContext({
      __QINGLAN_BUILD_ID__: current,
      URL,
      location: { href: 'https://example.com/' },
      modal: { querySelector: () => (state.panel ? panel : null) },
      document,
      resourcesUpdated,
      panelUpdateNotice,
      showRuntimeErrorNotice: () => state.notices++,
      addEventListener: target.addEventListener.bind(target),
      createUpdateCheck: (build: string, url: URL, updated: () => void) =>
        createUpdateCheck(build, url, updated, async () => {
          state.requests++;
          return new Promise<Response>((resolve) => {
            release = resolve;
          });
        }),
    }),
  );
  return {
    note,
    state,
    signal: (handled = false) =>
      target.dispatchEvent(
        Object.assign(new Event('vite:preloadError'), { handledResourceFailure: handled }),
      ),
    finish: async (build = next) => {
      release(Response.json({ schema: 1, build }));
      await new Promise<void>((resolve) => setImmediate(resolve));
    },
  };
}

test('原失败内容保留重试并相邻提供刷新，不创建额外弹窗', () => {
  const html = resourceFailureContent('chronicle');
  assert.match(html, /暂未展开，请重试/);
  assert.equal((html.match(/<button\b/g) ?? []).length, 2);
  assert.match(html, /data-resource-retry data-action="chronicle"/);
  assert.match(html, /data-action="refresh-game">刷新/);
  assert.doesNotMatch(html, /role="dialog"|runtime-error/);
});

test('原生预载错误与已处理失败合并检查，只更新原面板，清除旧新版底框', async () => {
  const h = harness();
  h.signal();
  h.signal(true);
  assert.equal(h.state.requests, 1);
  assert.equal(h.state.removed, 1);
  await h.finish();
  assert.match(h.note.textContent, /游戏已更新/);
  assert.equal(h.state.notices, 0);
  assert.equal(h.state.inserted, '');
  assert.match(resourceFailureContent('chronicle'), /游戏已更新/);
});

test('关闭失败面板后换页，迟到版本结果不向新页面插入提示或重开弹框', async () => {
  const h = harness();
  h.signal(true);
  h.state.notes = [];
  await h.finish();
  assert.equal(h.state.notices, 0);
  assert.equal(h.state.inserted, '');
  const closed = harness();
  closed.signal(true);
  closed.state.panel = false;
  closed.state.notes = [];
  await closed.finish();
  assert.equal(closed.state.notices, 0);
});

test('同版失败维持重试说明，结束后允许再次核验新版', async () => {
  const h = harness();
  h.signal(true);
  await h.finish(current);
  assert.equal(h.note.textContent, '暂未展开，请重试。');
  assert.equal(h.state.notices, 0);
  h.signal(true);
  await h.finish();
  assert.equal(h.state.requests, 2);
  assert.match(h.note.textContent, /游戏已更新/);
});

test('无本地处理器时优先沿用中心面板，仅无面板才显示原全局兜底', async () => {
  const h = harness();
  h.state.notes = [];
  h.signal();
  await h.finish();
  assert.match(h.state.inserted, /data-action="refresh-game"/);
  assert.equal(h.state.notices, 0);
  const outside = harness();
  outside.state.notes = [];
  outside.state.panel = false;
  outside.signal();
  await outside.finish();
  assert.equal(outside.state.notices, 1);
});
