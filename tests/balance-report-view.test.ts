import test from 'node:test';
import { treasure } from '../src/data.ts';
import assert from 'node:assert/strict';
import { Script } from 'node:vm';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { balanceCases, caseKey } from '../scripts/balance-policy.ts';
import { reportTables, reportChartData } from '../scripts/balance-report-view.ts';
import type { ReportLabels } from '../scripts/balance-report-view.ts';
import { reportDiagnostics } from '../scripts/balance-report-diagnostics.ts';
import { reportHtml, renderReport, refreshReport } from '../scripts/balance-report.ts';
import type { CampaignSample } from '../scripts/balance-simulation.ts';

const labels: ReportLabels = {
  roots: { heaven: '天灵根', dual: '双灵根' },
  paths: { demonic: '魔道' },
  treasures: { skull: treasure('skull').name },
  profiles: { bare: '无辅助' },
  difficulties: ['初入仙途'],
  stages: ['第一境', '第二境', '第三境', '第四境', '第五境', '第六境', '第七境'],
  bosses: ['一王', '二王', '三王', '四王', '五王', '六王', '七王'],
  targets: { heaven: { min: 0.7, max: 1 } },
};
function sample(c: ReturnType<typeof balanceCases>[number]): CampaignSample {
  return {
    case: c,
    key: caseKey(c),
    complete: false,
    cleared: 0,
    stop: 'lost',
    seconds: 100,
    adSeconds: 0,
    cultivation: 1,
    ads: { supplies: 0, borrow: 0, revive: 0 },
    battles: [
      {
        stage: 0,
        attempt: 1,
        state: 'lost',
        seconds: 100,
        entryStep: 0,
        exitStep: 0,
        cultivation: 1,
        at90: null,
        trials: [],
        maxAliveBosses: 0,
        firstClearCultivation: 0,
        bosses: [],
      },
    ],
  };
}
test('子组统计保留计划分母；不存在的路线本命组合为空而非全组胜率', () => {
  const plan = balanceCases(true).filter(
    (c) =>
      c.root === 'heaven' &&
      c.path === 'demonic' &&
      c.starter === 'skull' &&
      c.device === 'phone' &&
      c.profile === 'bare' &&
      c.difficulty === 0,
  );
  assert.equal(plan.length, 4);
  const row = sample(plan[0]);
  row.cleared = 6;
  const tables = reportTables([row], plan, labels, true);
  assert.ok(tables.roots.includes('1/4 · 25.0%'));
  assert.ok(tables.roots.includes('<td>1/4</td>'));
  assert.ok(tables.roots.includes('独立统计'));
  assert.ok(!tables.groups.includes('data-starter="stage-'));
  assert.equal((tables.groups.match(/<tr /g) ?? []).length, 2);
  assert.ok(!tables.roots.includes('70.0%～100.0%'));
  assert.deepEqual(reportTables([], [], labels, true), { roots: '', stages: '', groups: '' });
});
test('图表使用计划分母和原始中位数，未击杀与无胜局不会伪装为0秒', () => {
  const plan = balanceCases(true).slice(0, 4),
    rows = plan.slice(0, 3).map(sample);
  rows[0].cleared = 1;
  rows[1].cleared = 1;
  rows[0].battles[0].state = 'won';
  rows[0].battles[0].seconds = 130;
  rows[1].battles[0].state = 'won';
  rows[1].battles[0].seconds = 180;
  rows[2].battles[0].seconds = 5;
  rows[0].battles[0].bosses = [
    { stage: 0, at: 60, deadAt: 90, observedSeconds: 30, hpFraction: 0 },
  ];
  rows[1].battles[0].bosses = [
    { stage: 0, at: 60, deadAt: null, observedSeconds: 120, hpFraction: 0.5 },
  ];
  assert.equal(reportChartData(rows, plan, 'clear', labels).datasets[0].data[0], 50);
  assert.equal(reportChartData(rows, plan, 'time', labels).datasets[0].data[0], 130);
  assert.equal(reportChartData(rows, plan, 'time', labels).datasets[0].data[1], null);
  assert.equal(reportChartData(rows, plan, 'boss', labels).datasets[0].data[0], 30);
  assert.equal(reportChartData(rows, plan, 'boss', labels).datasets[0].data[6], null);
  assert.equal(reportChartData(rows, plan, 'boss', labels).labels.length, 13);
  const duplicate = rows[0],
    unknown = { ...rows[0], key: 'unknown' };
  assert.equal(
    reportChartData([duplicate, duplicate, unknown], plan.slice(0, 1), 'clear', labels).datasets[0]
      .data[0],
    100,
  );
  assert.equal(
    reportChartData([unknown], plan.slice(0, 1), 'clear', labels).datasets[0].data[0],
    0,
  );
});
test('诊断分级、去重、范围、原始信息与接口版本保持明确', () => {
  const plan = balanceCases(true);
  const message = '<script>bad</script>';
  const diagnostics = reportDiagnostics(
    {
      commit: 'actual-source',
      generatedAt: 'actual-time',
      currentHash: 'source-hash',
      failures: [message],
      targetFailures: [message],
      regressionFailures: [message],
      simulationErrors: [{ key: caseKey(plan[0]), error: '运行失败' }],
      groupFailures: ['dual/skull：本命裸开荒 83.3%，明显偏离目标'],
      bossFailures: ['关卡 7/妖王 1：存活 P90 过长'],
    },
    plan,
    labels,
    false,
  );
  assert.deepEqual(diagnostics.counts, { error: 2, warning: 2 });
  assert.equal(diagnostics.schemaVersion, 1);
  assert.equal(diagnostics.currentHash, 'source-hash');
  assert.deepEqual(diagnostics.items[0].scope, plan[0]);
  const warning = diagnostics.items.find((i) => i.category === 'starter')!;
  assert.equal(warning.severity, 'warning');
  assert.equal(warning.displayMessage, '双灵根 / 白骨髅：本命裸开荒 83.3%，明显偏离目标');
  assert.deepEqual(warning.scope, {
    root: 'dual',
    starter: 'skull',
    profile: 'bare',
    difficulty: 0,
  });
  assert.deepEqual(diagnostics.items.find((i) => i.category === 'boss')!.scope, {
    stage: 6,
    boss: 0,
    profile: 'bare',
    difficulty: 0,
  });
  assert.equal(diagnostics.items.filter((i) => i.message === message).length, 1);
  assert.ok(!diagnostics.items[0].displayMessage.startsWith('heaven/'));
  const target = reportDiagnostics(
    { targetFailures: ['heaven：裸开荒 50.0%，目标 70–100%'] },
    plan,
    labels,
    false,
  );
  assert.equal(target.items[0].displayMessage, '天灵根：裸开荒 50.0%，目标 70–100%');
});
test('设备、路线/设备及未知诊断不被误标成法宝', () => {
  const data = reportDiagnostics(
    {
      groupFailures: [
        'dual/phone：设备裸开荒 80.0%，超出目标容差',
        'dual/orthodox/phone：路线/设备裸开荒 80.0%，超出目标容差',
        'dual/unknown：未知格式',
      ],
    },
    balanceCases(true),
    { ...labels, paths: { ...labels.paths, orthodox: '正道' } },
    true,
  );
  assert.equal(data.items[0].category, 'device');
  assert.deepEqual(data.items[0].scope, {
    root: 'dual',
    device: 'phone',
    profile: 'bare',
    difficulty: 0,
  });
  assert.equal(data.items[1].category, 'route');
  assert.deepEqual(data.items[1].scope, {
    root: 'dual',
    path: 'orthodox',
    device: 'phone',
    profile: 'bare',
    difficulty: 0,
  });
  assert.equal(
    data.items[1].displayMessage,
    '双灵根 / 正道 / 手机：路线/设备裸开荒 80.0%，超出目标容差',
  );
  assert.deepEqual(data.items[2].scope, {});
});
test('完整覆盖但仅黄色诊断的报告仍通过；硬失败与缺失在接口和页面同时报错', () => {
  const root = mkdtempSync(join(tmpdir(), 'qinglan-report-contract-'));
  try {
    const current = balanceCases(true).map(sample);
    const input = join(root, 'input.json');
    writeFileSync(
      input,
      JSON.stringify({
        passed: true,
        current,
        commit: 'test-commit',
        generatedAt: 'test-time',
        groupFailures: ['dual/skull：本命裸开荒 83.3%，明显偏离目标'],
      }),
    );
    renderReport(input, root);
    const raw = readFileSync(join(root, 'results.json'), 'utf8');
    const json = JSON.parse(readFileSync(join(root, 'diagnostics.json'), 'utf8'));
    const html = readFileSync(join(root, 'index.html'), 'utf8');
    assert.equal(json.passed, true);
    assert.deepEqual(json.counts, { error: 0, warning: 1 });
    assert.ok(html.indexOf('id="diagnostics"') < html.indexOf('id="statistics"'));
    assert.ok(html.includes('class="diagnostic warning"'));
    assert.ok(html.includes('诊断 JSON 接口'));
    assert.ok(readFileSync(join(root, 'chart.js'), 'utf8').includes('Chart.js'));
    for (const id of ['root', 'path', 'starter', 'device', 'profile', 'difficulty'])
      assert.ok(html.includes(`id="${id}"`));
    for (const script of html.matchAll(/<script>([\s\S]*?)<\/script>/g))
      assert.doesNotThrow(() => new Script(script[1]));
    refreshReport(root);
    assert.equal(readFileSync(join(root, 'results.json'), 'utf8'), raw);
    assert.equal(
      JSON.parse(readFileSync(join(root, 'diagnostics.json'), 'utf8')).generatedAt,
      'test-time',
    );
    writeFileSync(
      input,
      JSON.stringify({ passed: true, current: [], targetFailures: ['目标不达标'] }),
    );
    renderReport(input, root);
    const failed = JSON.parse(readFileSync(join(root, 'diagnostics.json'), 'utf8'));
    assert.equal(failed.passed, false);
    assert.ok(failed.counts.error > 0);
    assert.ok(readFileSync(join(root, 'index.html'), 'utf8').includes('class="diagnostic error"'));
    assert.throws(() => refreshReport('docs/report'), /只允许/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
test('诊断和嵌入式元数据无法注入 HTML 或提前关闭脚本', () => {
  const html = reportHtml({
    passed: false,
    current: [],
    commit: '</script><img onerror=1>',
    failures: ['<img onerror=1>'],
    groupFailures: ['dual/skull：<img onerror=1>'],
  });
  assert.ok(!html.includes('<img onerror=1>'));
  assert.ok(html.includes('&lt;img onerror=1&gt;'));
  for (const script of html.matchAll(/<script>([\s\S]*?)<\/script>/g))
    assert.doesNotThrow(() => new Script(script[1]));
});
