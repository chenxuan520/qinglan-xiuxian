import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { matchesGlob } from 'node:path';

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

const workerWorkflows = ['npc-ai', 'house-ads', 'leaderboard'];
function workerTriggered(worker: string, path: string) {
  const push = read(`${worker}.yml`).split('  workflow_dispatch:')[0];
  const paths = [...push.matchAll(/^ {6}-\s+(['"]?)(.+?)\1\s*$/gm)].map((m) => m[2]);
  assert.ok(paths.length > 0, `${worker} 必须按相关路径触发`);
  return paths.some((pattern) => matchesGlob(path, pattern));
}

test('三个Worker响应自己的代码、共享src与发布依赖，保留手动发布入口', () => {
  for (const worker of workerWorkflows) {
    const source = read(`${worker}.yml`);
    assert.match(source, /branches: \[master\]/);
    assert.match(source, /^  workflow_dispatch:/m);
    assert.doesNotMatch(source, /pull_request:|workflow_run:|^\s*needs:/m);
    for (const path of [
      `workers/${worker}/index.ts`,
      `workers/${worker}/wrangler.jsonc`,
      'src/data.ts',
      'src/setting.ts',
      'src/house-ad-contract.ts',
      'package.json',
      'package-lock.json',
      'tsconfig.json',
      `.github/workflows/${worker}.yml`,
    ])
      assert.ok(workerTriggered(worker, path), `${worker} 漏掉 ${path}`);
  }
});

test('广告登录页更新也部署引用它的排行榜，不因文档、素材或ads.txt验证代码发布Worker', () => {
  assert.ok(workerTriggered('house-ads', 'workers/house-ads/admin.ts'));
  assert.ok(workerTriggered('leaderboard', 'workers/house-ads/admin.ts'));
  assert.equal(workerTriggered('npc-ai', 'workers/house-ads/admin.ts'), false);
  assert.equal(workerTriggered('leaderboard', 'workers/house-ads/index.ts'), false);
  for (const worker of workerWorkflows)
    for (const path of [
      'docs/development.md',
      'README.md',
      'public/assets/terrain.webp',
      'workers/ads-verify/index.ts',
      'workers/ads-verify/wrangler.jsonc',
    ])
      assert.equal(workerTriggered(worker, path), false, `${worker} 不应因 ${path} 发布`);
});

test('Worker部署沿用既有凭据与keep-vars，缺配置明确失败，不自动改库或部署验证Worker', () => {
  const scripts = JSON.parse(
    readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
  ).scripts;
  for (const worker of workerWorkflows) {
    const source = read(`${worker}.yml`);
    assert.ok(source.includes(`run: npm run deploy:${worker}`));
    assert.match(source, /CLOUDFLARE_API_TOKEN: \$\{\{ secrets\.CLOUDFLARE_API_TOKEN \}\}/);
    assert.match(source, /if: env\.CLOUDFLARE_API_TOKEN == ''[\s\S]*?exit 1/);
    assert.match(source, /cancel-in-progress: false/);
    assert.match(source, /contents: read/);
    assert.doesNotMatch(
      source,
      /(?:contents|actions|pages|id-token): write|continue-on-error|wrangler login|secret (?:put|bulk)|migrations apply|deploy:ads-verify/,
    );
    assert.ok(
      scripts[`deploy:${worker}`].includes(`--config workers/${worker}/wrangler.jsonc --keep-vars`),
    );
  }
  assert.ok(!readdirSync(workflows).includes('ads-verify.yml'));
});
