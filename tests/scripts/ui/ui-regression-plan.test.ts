import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  UI_VIEWPORTS,
  UI_REGRESSION_SUITES,
  uiRegressionPlan,
} from '../../../scripts/ui/ui-regression-plan.ts';

test('五组并行覆盖原共享检查和四种视口各一次，默认仍执行全部检查', () => {
  const all = uiRegressionPlan();
  assert.deepEqual(all, { shared: true, viewports: [...UI_VIEWPORTS] });
  const pieces = UI_REGRESSION_SUITES.map((name) => uiRegressionPlan(name));
  assert.equal(pieces.filter((p) => p.shared).length, 1);
  assert.deepEqual(
    pieces.flatMap((p) => p.viewports),
    all.viewports,
  );
  assert.equal(new Set(pieces.flatMap((p) => p.viewports.map(([name]) => name))).size, 4);
  for (const name of UI_REGRESSION_SUITES) {
    const p = uiRegressionPlan(name);
    assert.equal(p.shared, name === 'shared');
    assert.equal(p.viewports.length, name === 'shared' ? 0 : 1);
  }
  for (const typo of ['', 'all', 'desktop,phone', 'mobile'])
    assert.throws(() => uiRegressionPlan(typo), /未知/);
});

test('CI矩阵逐组执行同一真实MCP回归，失败不取消其他组，产物互不覆盖', () => {
  const workflow = readFileSync(
    new URL('../../../.github/workflows/checks.yml', import.meta.url),
    'utf8',
  );
  const job = workflow.split('\n  interface:')[1].split('\n  hud-safe-area:')[0];
  const names = job
    .match(/suite: \[([^\]]+)\]/)![1]
    .split(',')
    .map((s) => s.trim());
  assert.deepEqual(names, UI_REGRESSION_SUITES);
  assert.match(job, /fail-fast: false/);
  assert.match(job, /UI_SUITE: \$\{\{ matrix.suite \}\}/);
  assert.match(job, /npm run ui:check/);
  assert.match(job, /name: ui-regression-\$\{\{ matrix.suite \}\}/);
  assert.doesNotMatch(job, /continue-on-error|max-parallel/);
  const script = readFileSync(
    new URL('../../../scripts/ui/ui-regression.ts', import.meta.url),
    'utf8',
  );
  assert.match(script, /uiRegressionPlan\(suite\)/);
  assert.match(script, /if \(shared\) \{[\s\S]*checkJourneyModuleRecovery\(\)/);
  assert.match(script, /for \(const \[name, viewport\] of viewports\)/);
});
