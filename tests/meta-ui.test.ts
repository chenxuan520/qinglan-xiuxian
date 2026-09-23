import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { guideContent } from '../src/guide.ts';
import { GAME_SITE_URL } from '../src/setting.ts';

const source = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');

test('首页底部以轻量关于入口替代自动保存提示', () => {
  assert.match(source, /data-action="about">\$\{storageAvailable \? '关于《叩仙门》 · GitHub'/);
  assert.doesNotMatch(source, /修行进度自动保存于本机/);
  assert.match(source, /if \(action === 'about' && !game\)/);
  assert.match(source, /程序员 chenxuan，和一堆 AI 工具/);
  assert.match(source, /https:\/\/github\.com\/chenxuan520\/qinglan-xiuxian\/issues/);
  assert.equal(GAME_SITE_URL, 'https://xiuxian.011203.xyz/');
  assert.match(source, /href="\$\{GAME_SITE_URL\}"/);
  assert.match(source, /querySelector<HTMLButtonElement>\('\[data-action="about"\]'\)\?\.focus/);
});

test('洞府使用此世存档文案并保留原导入导出动作', () => {
  assert.match(source, /class="save-record"/);
  assert.match(source, /<h3>此世存档<\/h3>/);
  assert.match(source, /把这一世的修为、旧事与未尽历练收进行囊/);
  assert.match(source, /本地保存为 JSON，不会上传/);
  assert.match(source, /data-action="export-save">导出此世<\/button>/);
  assert.match(source, /data-action="import-save">导入旧档<\/button>/);
  const guide = guideContent('save');
  assert.match(guide, /洞府底部「此世存档」可用「导出此世」保存 JSON/);
  assert.match(guide, /点「导入旧档」/);
  assert.doesNotMatch(guide, /「存档备份」|「导入存档」/);
});

test('完整重开使用游戏风格的自绘复选框', () => {
  assert.match(styles, /\.reincarnate-opening input \{[^}]*appearance: none;/s);
  assert.match(styles, /\.reincarnate-opening input:checked::before/);
});
