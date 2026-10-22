import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const workflows = new URL('../.github/workflows/', import.meta.url);
const read = (name: string) => readFileSync(new URL(name, workflows), 'utf8');
const testCommands =
  /npm (?:test|run (?:ui:check|format:check|balance(?::[\w:]+)?|perf:sim|check:npc-ai))\b/;

test('部署和Release只构建发布，不运行或等待测试，产物硬上限仍检查', () => {
  for (const name of ['pages.yml', 'release.yml']) {
    const source = read(name);
    assert.doesNotMatch(source, testCommands, name);
    assert.doesNotMatch(
      source,
      /^\s*(?:needs|workflow_run):|gh (?:run watch|api.*check-runs)/m,
      name,
    );
    assert.match(source, /npm run build\b/, name);
    assert.match(source, /scripts\/size-check\.ts --dir /, name);
  }
});

test('单测只在独立门禁运行，保留PR和分支/版本标签触发及独立浏览器回归', () => {
  const unitWorkflows = readdirSync(workflows).filter((name) => /npm test\b/.test(read(name)));
  assert.deepEqual(unitWorkflows, ['checks.yml']);
  const source = read('checks.yml');
  assert.match(source, /pull_request:/);
  assert.match(source, /branches: \['\*\*'\]/);
  assert.match(source, /tags: \['v\*'\]/);
  assert.match(source, /contents: read/);
  assert.doesNotMatch(source, /(?:contents|pages|id-token): write|secrets\./);
  assert.doesNotMatch(source, /^\s*needs:/m);
  for (const job of ['unit', 'static', 'interface'])
    assert.match(source, new RegExp(`^  ${job}:`, 'm'));
  for (const command of [
    'npm test',
    'npm run format:check',
    'npm run check:npc-ai',
    'npm run ui:check',
  ])
    assert.ok(source.includes(command), command);
  assert.match(source, /npm ci --prefix scripts\/browser-tools/);
  assert.match(source, /name: ui-regression/);
  assert.match(source, /if: always\(\)/);
});

test('Pages保留四类报告并从独立性能artifact恢复，二进制与平衡门禁未遗漏', () => {
  const source = read('pages.yml');
  assert.doesNotMatch(source, /MONITOR_LOCAL_CHECKS/);
  for (const script of [
    'restore-balance-report',
    'restore-monitor-performance',
    'restore-weapon-report',
    'restore-autoplay-report',
  ])
    assert.ok(source.includes(`scripts/${script}.ts`), script);
  assert.match(read('binaries.yml'), /scripts\/check-binaries\.ts/);
  for (const command of ['balance:ci', 'perf:sim', 'size:check', 'balance:gate:full'])
    assert.ok(read('balance.yml').includes(`npm run ${command}`), command);
});

test('tag只打单机包，官网仍正常联网构建，独立门禁检查单机产物', () => {
  assert.match(read('release.yml'), /npm run build:standalone -- --outDir artifacts\/release\//);
  assert.doesNotMatch(read('pages.yml'), /build:standalone|--mode standalone/);
  const checks = read('checks.yml');
  assert.match(checks, /^  standalone:/m);
  assert.match(checks, /npm run build:standalone/);
  assert.match(checks, /scripts\/standalone-check\.ts/);
});
