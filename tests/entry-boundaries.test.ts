// 首屏入口体积有硬预算：坊市专用逻辑只能随坊市按需模块加载，不能被静态导入拉回入口。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = (name: string) =>
  readFileSync(new URL(`../src/${name}.ts`, import.meta.url), 'utf8');

// 只跟随运行时静态导入；`import type`、全部为类型的具名导入与动态 import() 不计入入口。
function staticImports(name: string) {
  const deps = new Set<string>();
  for (const match of source(name).matchAll(
    /^(?:import|export)\s+(type\s+)?([\s\S]*?)\s*from\s+'\.\/([\w-]+)\.ts';/gm,
  )) {
    if (match[1]) continue;
    const clause = match[2];
    const named = clause.match(/^\{([\s\S]*)\}$/);
    if (
      named &&
      named[1]
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean)
        .every((part) => part.startsWith('type '))
    )
      continue;
    deps.add(match[3]);
  }
  for (const match of source(name).matchAll(/^import\s+'\.\/([\w-]+)\.ts';/gm)) deps.add(match[1]);
  return deps;
}

function entryModules() {
  const seen = new Set(['main']);
  const queue = ['main'];
  while (queue.length)
    for (const dep of staticImports(queue.pop()!))
      if (!seen.has(dep)) {
        seen.add(dep);
        queue.push(dep);
      }
  return seen;
}

test('坊间互动、炉边故人与拍卖准备只随坊市按需模块加载', () => {
  const entry = entryModules();
  assert.ok(entry.has('game') && entry.has('progress'), '入口图应包含核心模块');
  for (const lazy of [
    'market-event-ui',
    'market-social',
    'market-social-actions',
    'market-fellow',
    'auction',
    'market-debate',
    'market-opportunities',
  ])
    assert.equal(entry.has(lazy), false, `${lazy} 被静态导入进了首屏入口`);
  const market = source('market-event-ui');
  for (const name of [
    'executeMarketSocial',
    'prepareAuction',
    'meetMarketFellow',
    'marketFellowCharacter',
    'chooseMarketFellow',
  ])
    assert.match(market, new RegExp(`\\b${name}\\b`), `market-event-ui 需导出 ${name}`);
});
