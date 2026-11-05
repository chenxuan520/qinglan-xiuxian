import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareImportedReport } from '../scripts/balance-import-validation.ts';
import { BALANCE_PROTOCOL, balanceCases, caseKey } from '../scripts/balance-policy.ts';
import { realmInfo } from '../src/progress.ts';
import {
  makeImportedReportFixture,
  makeImportedBattleFixture as battle,
  makeImportedCampaignFixture as sample,
} from './helpers/balance-import-fixture.ts';

const expected = {
  commit: '726acaa30b2efc3a53deff94235176f955c35fcc',
  currentHash: 'a'.repeat(64),
  importedAt: '2026-11-05T12:00:00.000Z',
  inputSha256: 'b'.repeat(64),
};
const plan = balanceCases(true);

const template = makeImportedReportFixture();
const fixture = () => structuredClone(template);
const metrics = (report: ReturnType<typeof prepareImportedReport>) =>
  report.currentMetrics as Record<string, { n: number; rate?: number; median?: number | null }>;

test('合法合成10080成功报告重算通过，保留原始时间、耗时、逐局和原生farm结构且不修改输入', () => {
  const input = fixture();
  const output = prepareImportedReport(input, expected);
  assert.equal(output.passed, true);
  assert.deepEqual(output.failures, []);
  assert.equal(output.current?.length, 10080);
  assert.equal(output.commit, expected.commit);
  assert.equal(output.currentHash, expected.currentHash);
  assert.equal(output.generatedAt, input.generatedAt);
  assert.equal(output.elapsedSeconds, input.elapsedSeconds);
  assert.deepEqual(output.current, input.current);
  assert.deepEqual(output.farms, input.farms);
  assert.deepEqual(output.nativeExtra, input.nativeExtra);
  assert.deepEqual(input, template);
  assert.notEqual(output.current, input.current);
  assert.notEqual(
    input.farms[0].case,
    input.current.find((r) => r.key === caseKey(input.farms[0].case))!.case,
  );
  assert.equal('key' in (output.farms as typeof input.farms)[0], false);
  assert.equal(metrics(output)['root/heaven/bare/0/stage-5/clear'].rate, 0.9);
  assert.equal(metrics(output)['root/none/bare/0/stage-0/boss-0/lifetime'].median, null);
  const serialized = JSON.parse(JSON.stringify(output));
  assert.equal(serialized.passed, true);
  assert.equal(serialized.current.length, 10080);
  assert.deepEqual(serialized.origin, output.origin);
});

test('合法完整失败可导入：异常替代一条计划样本，保留错误、10080分母及真实返回数', () => {
  const input = fixture();
  const missing = input.current.shift()!;
  input.simulationErrors.push({
    case: missing.case,
    key: missing.key,
    error: '续局恢复失败 原始错误',
  });
  input.passed = false;
  const output = prepareImportedReport(input, expected);
  assert.equal(output.passed, false);
  assert.equal(output.current?.length, 10079);
  assert.deepEqual(output.simulationErrors, input.simulationErrors);
  assert.ok(output.failures?.some((f) => f.includes('续局恢复失败 原始错误')));
  assert.ok(output.targetFailures?.some((f) => f.includes('不可判定')));
  assert.deepEqual(metrics(output)['root/heaven/bare/0/errors'], { n: 120, rate: 1 / 120 });
  assert.equal(metrics(output)['root/heaven/bare/0/stage-5/clear'].n, 120);
});

test('所有10080条均为明确异常时保留完整失败，不补造正常样本', () => {
  const input = fixture();
  input.simulationErrors = input.current.map((r) => ({
    case: r.case,
    key: r.key,
    error: '技术异常',
  }));
  input.current = [];
  const output = prepareImportedReport(input, expected);
  assert.equal(output.passed, false);
  assert.equal(output.current?.length, 0);
  assert.equal(output.simulationErrors?.length, 10080);
  assert.equal(metrics(output)['root/heaven/bare/0/errors'].rate, 1);
});

test('缺失、重复、未知及caseKey错配拒绝，不能用数量凑满或错误覆盖正常样本', () => {
  for (const kind of [
    'missing',
    'duplicate',
    'unknown',
    'wrong-key',
    'wrong-case',
    'overlap',
    'error-key',
    'error-case',
    'error-duplicate',
  ]) {
    const input = fixture();
    const first = input.current[0];
    if (kind === 'missing') input.current.pop();
    if (kind === 'duplicate') input.current[1] = structuredClone(first);
    if (kind === 'unknown') {
      first.case.seed = 999;
      first.key = caseKey(first.case);
    }
    if (kind === 'wrong-key') first.key = input.current[1].key;
    if (kind === 'wrong-case') first.case = structuredClone(input.current[1].case);
    if (kind === 'overlap') {
      input.current.pop();
      input.simulationErrors.push({ case: first.case, key: first.key, error: '不能重复占位' });
    }
    if (kind.startsWith('error-')) {
      input.current.shift();
      input.simulationErrors.push({ case: first.case, key: first.key, error: '原异常' });
      if (kind === 'error-key') input.simulationErrors[0].key = '伪造key';
      if (kind === 'error-case') input.simulationErrors[0].case.seed = 999;
      if (kind === 'error-duplicate') {
        input.current.pop();
        input.simulationErrors.push(structuredClone(input.simulationErrors[0]));
      }
    }
    assert.throws(() => prepareImportedReport(input, expected), /校验失败/, kind);
  }
});

test('caseKey字符串相同但seed/difficulty类型不同也拒绝', () => {
  for (const field of ['seed', 'difficulty']) {
    const input = fixture();
    const c = input.current[0].case as unknown as Record<string, unknown>;
    c[field] = String(c[field]);
    assert.throws(() => prepareImportedReport(input, expected), /字段类型或身份错配/);
  }
});

test('840快检、把840份复制到10080以及伪造full标记均不能导入', () => {
  const input = fixture();
  input.current = input.current.slice(0, 840);
  input.cases = 840;
  assert.throws(() => prepareImportedReport(input, expected), /10080/);
  input.cases = 10080;
  assert.throws(() => prepareImportedReport(input, expected), /完整覆盖 10080/);
  input.current = Array.from({ length: 10080 }, (_, i) => input.current[i % 840]);
  assert.throws(() => prepareImportedReport(input, expected), /重复/);
  for (const field of ['full', 'acceptanceRequired', 'growthTargetsRequired'] as const) {
    assert.throws(
      () => prepareImportedReport({ ...template, [field]: false }, expected),
      /完整验收/,
    );
    assert.throws(
      () => prepareImportedReport({ ...template, [field]: 'true' }, expected),
      /完整验收/,
    );
  }
});

test('protocol、commit与源码hash必须严格匹配调用方的实际核验值', () => {
  for (const patch of [
    { protocol: BALANCE_PROTOCOL + 1 },
    { protocol: String(BALANCE_PROTOCOL) },
    { commit: 'f'.repeat(40) },
    { commit: expected.commit.slice(0, 7) },
    { currentHash: 'f'.repeat(64) },
    { currentHash: 'z'.repeat(64) },
    { currentHash: undefined },
  ])
    assert.throws(() => prepareImportedReport({ ...template, ...patch }, expected), /校验失败/);
  for (const patch of [
    { commit: 'short' },
    { currentHash: 'short' },
    { inputSha256: 'short' },
    { importedAt: 'invalid' },
    { runId: '' },
  ])
    assert.throws(() => prepareImportedReport(template, { ...expected, ...patch }), /expected/);
});

test('正常样本实际执行verifyCoverage：无妖王伪造胜利、负耗时、空战斗都拒绝', () => {
  for (const kind of ['boss', 'seconds', 'empty']) {
    const input = fixture();
    const first = input.current[0];
    if (kind === 'boss') first.battles[0].bosses = [];
    if (kind === 'seconds') first.seconds = -1;
    if (kind === 'empty') {
      first.battles = [];
      first.cleared = 0;
      first.complete = false;
    }
    assert.throws(
      () => prepareImportedReport(input, expected),
      /没有击败全部妖王|非有限或负数|没有实际战斗/,
    );
  }
});

test('passed:true与伪造统计、空failures无法洗绿：按原始样本重算前六关失败', () => {
  const input = fixture();
  input.current = input.current.map((r) =>
    r.case.root === 'heaven' && r.case.profile === 'bare' && r.case.difficulty === 0
      ? sample(r.case, false)
      : r,
  );
  const output = prepareImportedReport(
    { ...input, currentMetrics: { fake: { n: 10080, rate: 1 } } },
    expected,
  );
  assert.equal(output.passed, false);
  assert.ok(output.targetFailures?.some((f) => f.startsWith('heaven：') && f.includes('0.0%')));
  assert.ok(output.failures?.some((f) => f.startsWith('heaven：')));
  assert.equal(metrics(output)['root/heaven/bare/0/stage-5/clear'].rate, 0);
  assert.equal('fake' in metrics(output), false);
});

test('90秒成长及boss/group诊断重算，boss/group沿用原生Warning规则', () => {
  const input = fixture();
  input.current[0].battles[0].at90 = null;
  const output = prepareImportedReport(input, expected);
  assert.equal(output.passed, false);
  assert.ok(output.readinessFailures?.some((f) => f.includes('90 秒成长观测缺失')));
  assert.ok(output.bossFailures?.some((f) => f.includes('存活过短')) === false);
  const warningInput = fixture();
  for (const row of warningInput.current)
    if (row.case.profile === 'bare' && row.case.difficulty === 0)
      for (const boss of row.battles[0].bosses)
        if (boss.deadAt !== null) {
          boss.deadAt = boss.at + 1;
          boss.observedSeconds = 1;
        }
  const warnings = prepareImportedReport(warningInput, expected);
  assert.equal(warnings.passed, true);
  assert.ok(warnings.bossFailures?.some((f) => f.includes('存活过短')));
  assert.ok(warnings.groupFailures?.length);
});

test('原始硬失败、分类失败、error与历史异常完整保留，绝不重算成通过', () => {
  const input = {
    ...fixture(),
    failures: ['原始源码变化失败'],
    regressionFailures: ['历史差异失败'],
    readinessFailures: ['原始成长失败'],
    targetFailures: ['原始验收失败'],
    bossFailures: ['原始妖王提示'],
    groupFailures: ['原始路线提示'],
    error: '原始任务错误',
    referenceErrors: [{ case: plan[0], key: caseKey(plan[0]), error: '历史引擎异常' }],
  };
  const output = prepareImportedReport(input, expected);
  assert.equal(output.passed, false);
  for (const text of [
    '原始源码变化失败',
    '历史差异失败',
    '原始成长失败',
    '原始验收失败',
    '原始任务错误',
  ])
    assert.ok(output.failures?.includes(text));
  assert.equal(output.error, '原始任务错误');
  assert.deepEqual(output.referenceErrors, input.referenceErrors);
  assert.ok(output.failures?.some((f) => f.includes('历史引擎异常')));
  assert.ok(output.bossFailures?.includes('原始妖王提示'));
  assert.ok(output.groupFailures?.includes('原始路线提示'));
  const bareFailure = prepareImportedReport({ ...template, passed: false }, expected);
  assert.equal(bareFailure.passed, false);
  assert.ok(bareFailure.failures?.some((f) => f.includes('原始报告')));
});

test('farm缺失、重复、未知组、轮次断裂/重复/超限、错关和虚假截断均拒绝', () => {
  for (const kind of [
    'missing',
    'duplicate',
    'unknown',
    'gap',
    'repeat',
    'over20',
    'stage',
    'truncated',
    'total',
    'step',
  ]) {
    const input = fixture();
    const f = input.farms[0];
    if (kind === 'missing') input.farms.pop();
    if (kind === 'duplicate') input.farms[1] = structuredClone(f);
    if (kind === 'unknown') f.case.seed = 82;
    if (kind === 'gap') f.battles[1].attempt = 3;
    if (kind === 'repeat') f.battles[1].attempt = 1;
    if (kind === 'over20') f.battles.push({ ...f.battles.at(-1)!, attempt: 21 });
    if (kind === 'stage') f.battles[0].stage = 1;
    if (kind === 'truncated') {
      f.battles = f.battles.slice(0, 1);
      f.cultivation = f.battles[0].cultivation;
      f.step = f.battles[0].exitStep;
    }
    if (kind === 'total') f.cultivation++;
    if (kind === 'step') f.step = 24;
    assert.throws(() => prepareImportedReport(input, expected), /farms/, kind);
  }
});

test('farm原生提前寿尽合法，20轮不能被五次/关上限拒绝，终止后伪补齐拒绝', () => {
  const input = fixture();
  const f = input.farms[0];
  f.battles = [battle(0, false), { ...battle(0, false), attempt: 2, state: 'expired' }];
  f.battles.forEach((b, i) => {
    b.entryStep = realmInfo(i * 100).step;
    b.exitStep = realmInfo((i + 1) * 100).step;
  });
  f.cultivation = 200;
  f.step = realmInfo(200).step;
  const output = prepareImportedReport(input, expected);
  assert.equal(output.passed, true);
  assert.deepEqual((output.farms as typeof input.farms)[0], f);
  f.battles.push({ ...f.battles[1], attempt: 3 });
  assert.throws(() => prepareImportedReport(input, expected), /终止后仍有战斗/);
});

test('farm首通重复领取重算硬失败且保留原始20轮证据', () => {
  const input = fixture();
  input.farms[0].battles[1].firstClearCultivation = 50;
  const output = prepareImportedReport(input, expected);
  assert.equal(output.passed, false);
  assert.ok(output.regressionFailures?.some((f) => f.includes('首通修为重复')));
  assert.ok(output.failures?.some((f) => f.includes('首通修为重复')));
  assert.deepEqual(output.farms, input.farms);
});

test('source标注只取expected，剥离用户伪造origin且可选workflowRunId不凭空补造', () => {
  const input = {
    ...template,
    origin: { kind: 'github-actions', sourceVerified: false, forged: true },
  };
  const output = prepareImportedReport(input, { ...expected, runId: '123456' });
  assert.deepEqual(output.origin, {
    kind: 'local-import',
    importedAt: expected.importedAt,
    inputSha256: expected.inputSha256,
    sourceVerified: true,
    workflowRunId: '123456',
  });
  assert.deepEqual(prepareImportedReport(input, expected).origin, {
    kind: 'local-import',
    importedAt: expected.importedAt,
    inputSha256: expected.inputSha256,
    sourceVerified: true,
  });
  assert.equal(input.origin.kind, 'github-actions');
});

test('非法JSON数据、丢失原始时间/耗时、错误文本损坏拒绝', () => {
  const circular: Record<string, unknown> = {};
  circular.self = circular;
  for (const patch of [
    { extra: NaN },
    { extra: Infinity },
    { extra: undefined },
    { extra: BigInt(1) },
    { extra: () => true },
    { extra: new Date() },
    { extra: circular },
    { generatedAt: 'invalid' },
    { elapsedSeconds: -1 },
    { failures: [null] },
  ])
    assert.throws(() => prepareImportedReport({ ...template, ...patch }, expected), /校验失败/);
  const input = fixture();
  const row = input.current.shift()!;
  input.simulationErrors.push({ case: row.case, key: row.key, error: '' });
  assert.throws(() => prepareImportedReport(input, expected), /错误文本/);
});
