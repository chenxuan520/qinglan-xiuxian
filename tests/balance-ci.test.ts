import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ciCases, ciCsv, ciSummary, simulationHash } from '../scripts/balance-ci.ts';
import { caseKey } from '../scripts/balance-policy.ts';
import { summarize, verifyCoverage } from '../scripts/balance-metrics.ts';
import type { CampaignSample } from '../scripts/balance-simulation.ts';
import { simulateCampaign } from '../scripts/balance-simulation.ts';

test('每次提交固定840条、每根120条、初入仙途无辅助，覆盖三路两场地', () => {
  const cases = ciCases();
  assert.equal(cases.length, 840);
  assert.equal(new Set(cases.map(caseKey)).size, 840);
  assert.ok(cases.every((c) => c.profile === 'bare' && c.difficulty === 0));
  for (const root of new Set(cases.map((c) => c.root))) {
    const group = cases.filter((c) => c.root === root);
    assert.equal(group.length, 120);
    assert.equal(new Set(group.map((c) => c.path)).size, 3);
    assert.equal(new Set(group.map((c) => c.device)).size, 2);
    assert.equal(new Set(group.map((c) => c.seed)).size, 20);
  }
});
test('真实六关模拟与七关默认模拟前缀完全相同，不进入终关或假称成仙', () => {
  const c = ciCases().find(
    (c) =>
      c.root === 'heaven' &&
      c.path === 'orthodox' &&
      c.starter === 'sword' &&
      c.device === 'phone' &&
      c.seed === 41,
  )!;
  const six = simulateCampaign(c, 6),
    all = simulateCampaign(c);
  assert.equal(six.cleared, 6);
  assert.equal(six.complete, false);
  assert.equal(all.complete, true);
  assert.deepEqual(
    six.battles,
    all.battles.filter((b) => b.stage < 6),
  );
  verifyCoverage([six], [c]);
  const sixStats = summarize([six], [c], 6),
    sevenStats = summarize([six], [c]);
  assert.equal(sixStats['root/heaven/bare/0/clear'].rate, 1);
  assert.equal(sevenStats['root/heaven/bare/0/clear'].rate, 0);
  assert.ok(!Object.keys(sixStats).some((key) => key.includes('/stage-6/')));
  assert.ok(ciSummary([six], 1).includes('1/120'));
  for (const label of ['双灵根', '三灵根', '四灵根', '五灵根'])
    assert.ok(ciSummary([six], 1).includes(`| ${label} |`));
  assert.ok(ciCsv([six]).includes('妖王击杀秒'));
});
test('依赖摘要覆盖两边传递导入、重导出、字面量动态导入及require，界面文本不影响', () => {
  const root = mkdtempSync(join(tmpdir(), 'qinglan-ci-hash-'));
  try {
    mkdirSync(join(root, 'scripts'));
    mkdirSync(join(root, 'src'));
    writeFileSync(join(root, 'scripts/balance-simulation.ts'), "import '../src/a.ts';\n");
    writeFileSync(join(root, 'src/a.ts'), "export * from './b.ts';\n");
    writeFileSync(join(root, 'src/b.ts'), 'export const n=1;\n');
    const before = simulationHash(root);
    assert.deepEqual(before.files, ['scripts/balance-simulation.ts', 'src/a.ts', 'src/b.ts']);
    writeFileSync(join(root, 'src/main.ts'), '界面文本');
    assert.equal(simulationHash(root).hash, before.hash);
    writeFileSync(join(root, 'src/b.ts'), 'export const n=2;\n');
    assert.notEqual(simulationHash(root).hash, before.hash);
    const changed = simulationHash(root).hash;
    writeFileSync(join(root, 'src/c.ts'), 'export const n=3;\n');
    writeFileSync(
      join(root, 'src/b.ts'),
      "export const n=2; import('./c.ts'); require('./c.ts');\n",
    );
    assert.notEqual(simulationHash(root).hash, changed);
    assert.ok(simulationHash(root).files.includes('src/c.ts'));
    writeFileSync(join(root, 'src/b.ts'), 'import(variable);\n');
    assert.throws(() => simulationHash(root), /动态模拟依赖/);
    writeFileSync(join(root, 'src/b.ts'), "import './missing.ts';\n");
    assert.throws(() => simulationHash(root), /ENOENT/);
    writeFileSync(join(root, 'src/b.ts'), "import 'unknown-package';\n");
    assert.throws(() => simulationHash(root), /外部模拟依赖/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
test('固定六关命令拒绝增加难度、全量等参数，不悄悄变成长测试', () => {
  assert.throws(
    () =>
      execFileSync(
        process.execPath,
        ['--experimental-strip-types', 'scripts/balance-ci.ts', '--full'],
        { stdio: 'pipe' },
      ),
    /不接受参数/,
  );
  const c = ciCases()[0];
  assert.throws(() => simulateCampaign(c, 0));
  assert.throws(() => summarize([], [], 8));
});

test('前六关最新根范围含上下边界；无灵根10%通过、超出即失败，终关不参与', async () => {
  const { BARE_CLEAR_TARGETS } = await import('../scripts/balance-policy.ts');
  const { acceptanceFailures } = await import('../scripts/balance-metrics.ts');
  assert.deepEqual(BARE_CLEAR_TARGETS, {
    heaven: { min: 0.7, max: 1, target: 0.9 },
    variant: { min: 0.5, max: 0.9, target: 0.7 },
    dual: { min: 0.2, max: 0.6, target: 0.4 },
    triple: { min: 0.1, max: 0.5, target: 0.3 },
    quad: { min: 0, max: 0.3, target: 0.1 },
    five: { min: 0, max: 0.25, target: 0.05 },
    none: { min: 0, max: 0.1, target: 0 },
  });
  const plan = ciCases();
  for (const [root, bounds] of Object.entries(BARE_CLEAR_TARGETS)) {
    const cases = plan.filter((c) => c.root === root);
    const at = (won: number) =>
      cases.map(
        (c, i) =>
          ({
            case: c,
            key: caseKey(c),
            cleared: i < won ? 6 : 0,
            complete: false,
            battles: [],
            ads: { supplies: 0, borrow: 0, revive: 0 },
            stop: 'lost',
            seconds: 0,
            adSeconds: 0,
            cultivation: 0,
          }) as CampaignSample,
      );
    const ownFailures = (won: number) =>
      acceptanceFailures(at(won)).filter((f) => f.startsWith(root + '：') && f.includes('目标'));
    assert.deepEqual(ownFailures(Math.ceil(cases.length * bounds.min - 1e-9)), []);
    assert.deepEqual(ownFailures(Math.floor(cases.length * bounds.max + 1e-9)), []);
    if (bounds.min > 0)
      assert.equal(ownFailures(Math.ceil(cases.length * bounds.min - 1e-9) - 1).length, 1);
    if (bounds.max < 1)
      assert.equal(ownFailures(Math.floor(cases.length * bounds.max + 1e-9) + 1).length, 1);
  }
});
