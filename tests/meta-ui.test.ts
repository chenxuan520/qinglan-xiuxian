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
  assert.match(source, /自动历练 · \$\{save\.autoplay \? '开' : '关'\}/);
  assert.match(source, /重走十五岁那一程/);
  assert.doesNotMatch(source, /AI 代打|AI 正在挑选|从序章完整开始|自动入库|永久珍品/);
});

test('指南使用自动历练、归处与本世珍品的新称呼', () => {
  const guide = ['basics', 'medicine', 'builds', 'mortal', 'save']
    .map((tab) => guideContent(tab))
    .join('');
  assert.match(guide, /自动历练/);
  assert.match(guide, /收入藏器阁/);
  assert.match(guide, /收入丹囊/);
  assert.match(guide, /本世珍品/);
  assert.doesNotMatch(guide, /AI 代打|AI 模式|自动入库|永久珍品/);
});

test('弹窗眉题不混用英文副标题', () => {
  assert.doesNotMatch(
    source,
    /炼丹炉 \/ ALCHEMY|藏器阁 \/ ARTIFACT COLLECTION|妖物志 \/ BESTIARY|洞府 \/ CULTIVATION|道法有迹 \/ THE CULTIVATOR’S HANDBOOK|修行暂歇 \/ PAUSED/,
  );
});

test('战斗中按 E 开启自动历练且移动键仍可接管', () => {
  assert.match(source, /<kbd>E<\/kbd> 开启自动历练/);
  assert.match(
    source,
    /key === 'e' && !event\.repeat && !save\.autoplay && game\?\.state === 'playing'/,
  );
  assert.match(source, /autoplayButton\(inGame\)/);
  assert.match(source, /inGame\s+\? '按 E 或点击开启自动走位、拾取与选择升级'/);
  assert.match(source, /点击或移动键切回手动/);
  assert.match(source, /if \(save\.autoplay\) handleAction\('autoplay'\);\s+keys\.add\(key\)/);
});

test('手机竖屏战斗按钮使用固定网格，不随斩妖数字换行', () => {
  const start = styles.indexOf(
    '@media (pointer: coarse) and (max-width: 650px) and (orientation: portrait)',
  );
  const end = styles.indexOf('\n}\n.combat-actions .round-button.auto-button', start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const portraitHud = styles.slice(start, end);
  assert.match(
    portraitHud,
    /\.game-hud \.combat-actions \{[^}]*display: grid;[^}]*grid-template-columns: repeat\(4, 32px\);/s,
  );
  assert.match(
    portraitHud,
    /\.game-hud \.kill-counter \{[^}]*grid-column: 1 \/ 4;[^}]*grid-row: 1;/s,
  );
  assert.match(portraitHud, /\.game-hud \.sound-control \{[^}]*grid-column: 4;[^}]*grid-row: 1;/s);
  assert.match(portraitHud, /\.game-hud \.help-button \{[^}]*grid-column: 1;[^}]*grid-row: 2;/s);
  assert.match(portraitHud, /\.game-hud \.damage-button \{[^}]*grid-column: 2;[^}]*grid-row: 2;/s);
  assert.match(
    portraitHud,
    /\.game-hud \.fullscreen-button \{[^}]*grid-column: 3;[^}]*grid-row: 2;/s,
  );
  assert.match(
    portraitHud,
    /\.game-hud \[data-action='pause'\] \{[^}]*grid-column: 4;[^}]*grid-row: 2;/s,
  );
  assert.match(
    portraitHud,
    /\.game-hud \.auto-button \{[^}]*grid-column: 1 \/ -1;[^}]*grid-row: 3;/s,
  );
});
