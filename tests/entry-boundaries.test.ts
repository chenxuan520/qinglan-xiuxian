// 首屏入口体积有硬预算：坊市专用逻辑只能随坊市按需模块加载，不能被静态导入拉回入口。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = fileURLToPath(new URL('..', import.meta.url));
const sourceRoot = fileURLToPath(new URL('../src/', import.meta.url));
const config = ts.readConfigFile(`${root}/tsconfig.json`, ts.sys.readFile);
assert.equal(config.error, undefined);
const { options, errors } = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
assert.deepEqual(errors, []);
const source = (name: string) =>
  readFileSync(new URL(`../src/${name}.ts`, import.meta.url), 'utf8');

// 只跟随运行时静态导入；`import type`、全部为类型的具名导入与动态 import() 不计入入口。
function staticImports(name: string, content = source(name)) {
  const filename = fileURLToPath(new URL(`../src/${name}.ts`, import.meta.url));
  const file = ts.createSourceFile(filename, content, ts.ScriptTarget.Latest, true);
  const deps = new Set<string>();
  for (const node of file.statements) {
    if (!ts.isImportDeclaration(node) && !ts.isExportDeclaration(node)) continue;
    if (!node.moduleSpecifier || !ts.isStringLiteral(node.moduleSpecifier)) continue;
    if (ts.isImportDeclaration(node)) {
      const clause = node.importClause;
      if (clause?.isTypeOnly) continue;
      const named = clause?.namedBindings;
      if (
        !clause?.name &&
        named &&
        ts.isNamedImports(named) &&
        named.elements.length > 0 &&
        named.elements.every((item) => item.isTypeOnly)
      )
        continue;
    } else {
      if (node.isTypeOnly) continue;
      const named = node.exportClause;
      if (
        named &&
        ts.isNamedExports(named) &&
        named.elements.length > 0 &&
        named.elements.every((item) => item.isTypeOnly)
      )
        continue;
    }
    const resolved = ts.resolveModuleName(
      node.moduleSpecifier.text,
      filename,
      options,
      ts.sys,
    ).resolvedModule;
    if (!resolved) continue; // CSS 和外部包不属于 src TypeScript 入口图。
    const local = relative(sourceRoot, resolved.resolvedFileName).split('\\').join('/');
    if (
      !isAbsolute(local) &&
      !local.startsWith('../') &&
      local.endsWith('.ts') &&
      !local.endsWith('.d.ts')
    )
      deps.add(local.slice(0, -3));
  }
  return deps;
}

function entryModules(readSource = source) {
  const seen = new Set(['main']);
  const queue = ['main'];
  while (queue.length) {
    const name = queue.pop()!;
    for (const dep of staticImports(name, readSource(name)))
      if (!seen.has(dep)) {
        seen.add(dep);
        queue.push(dep);
      }
  }
  return seen;
}

test('副作用导入后的类型导入、类型重导出和动态加载不进入运行时入口图', () => {
  const content = `import './styles.ts';
import type { debateMarket } from './market-social.ts';
import { type MarketFellowView } from './market-fellow.ts';
export type { AuctionView } from './auction-ui.ts';
export { type MarketFellowView } from './market-fellow.ts';
export type Debate = typeof debateMarket;
void import('./market-social.ts');
// import { prepareAuction } from './auction.ts';
const text = "import { prepareAuction } from './auction.ts';";`;
  assert.deepEqual([...staticImports('main', content)], ['styles']);
});

test('运行时导入与重导出不因引号、换行、扩展名或混合类型标记漏检', () => {
  for (const content of [
    'import { marketRequest } from "./market-social"; void marketRequest;',
    "import './styles.ts'; import { marketRequest } from './market-social.ts'; void marketRequest;",
    "export { marketRequest, type MarketRiskClue } from './market-social';",
    "export * from './market-social.ts';",
    "export * as social from './market-social';",
    "import * as social from './market-social'; void social;",
    "import { marketRequest, type MarketRiskClue } from './market-social'; void marketRequest;",
  ]) {
    const entry = entryModules((name) => (name === 'main' ? content : source(name)));
    assert.ok(entry.has('market-social'), content);
    assert.ok(entry.has('auction'), '运行时依赖需继续追踪传递导入');
  }
});

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
