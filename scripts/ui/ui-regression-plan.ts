import assert from 'node:assert/strict';

export const UI_VIEWPORTS = [
  ['desktop', '1440x1000x1'],
  ['phone', '390x844x1,mobile,touch'],
  ['narrow', '320x640x1,mobile,touch'],
  ['landscape', '844x390x1,mobile,touch,landscape'],
] as const;

export const UI_REGRESSION_SUITES = ['shared', ...UI_VIEWPORTS.map(([name]) => name)] as const;

export function uiRegressionPlan(suite?: string) {
  assert.ok(
    suite === undefined || UI_REGRESSION_SUITES.some((name) => name === suite),
    `未知界面回归分组：${suite}`,
  );
  return {
    shared: suite === undefined || suite === 'shared',
    viewports: UI_VIEWPORTS.filter(([name]) => suite === undefined || name === suite),
  };
}
