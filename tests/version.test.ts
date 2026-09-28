import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GAME_VERSION } from '../src/version.ts';

test('直接运行时版本号回退为开发版', () => {
  assert.equal(GAME_VERSION, 'dev');
});

test('构建注入 git describe 版本并展示在关于面板', () => {
  const config = readFileSync(new URL('../vite.config.ts', import.meta.url), 'utf8');
  assert.match(config, /git describe --tags --always/);
  assert.match(config, /__QINGLAN_VERSION__/);
  const source = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
  assert.match(source, /<span>版本<\/span>\$\{GAME_VERSION\}/);
});
