import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderPanel } from '../src/scene-flow.ts';
import { GAME_SITE_URL } from '../src/setting.ts';
import { GAME_VERSION } from '../src/version.ts';

test('直接运行时版本号回退为开发版', () => {
  assert.equal(GAME_VERSION, 'dev');
});

test('构建注入 git describe 版本并展示在关于面板', () => {
  const config = readFileSync(new URL('../vite.config.ts', import.meta.url), 'utf8');
  assert.match(config, /git describe --tags --always/);
  assert.match(config, /__QINGLAN_VERSION__/);
  let body = '';
  renderPanel({
    panel: 'about',
    GAME_VERSION: 'v0.0.4-test',
    GAME_SITE_URL,
    URL,
    assetUrl: (value) => value,
    SUPPORT_CODE_IMAGE: '/assets/support-wechat.webp',
    telemetry: { enabled: () => true, active: true },
    telemetryRow: () => '<button data-action="telemetry-toggle">匿名统计</button>',
    panelFrame: (_title, _subtitle, html) => {
      body = html;
    },
  });
  assert.match(body, /<span>版本<\/span><button[^>]*data-action="debug-version"/);
  assert.match(body, />v0\.0\.4-test<\/button>/);
  assert.match(body, /monitor\//);
  assert.match(body, /telemetry-toggle/);
  assert.doesNotMatch(body, /单机版/);
});
