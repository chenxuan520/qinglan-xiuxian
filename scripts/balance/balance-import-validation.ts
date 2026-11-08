import type { DailyReport } from './balance-report.ts';
import type { BalanceCase } from './balance-policy.ts';
import { BALANCE_PROTOCOL, balanceCases, caseKey } from './balance-policy.ts';
import {
  acceptanceFailures,
  bossReadiness,
  growthReadiness,
  summarize,
  verifyCoverage,
} from './balance-metrics.ts';
import { growthShape } from './balance-simulation.ts';
import type { BattleSample, CampaignSample } from './balance-simulation.ts';
import { REALM_LIFESPANS, STAGE_YEARS_PER_MINUTE } from '../../src/core/data.ts';
import { realmInfo } from '../../src/core/progress.ts';

type RecordValue = Record<string, unknown>;
interface SimulationError {
  case: BalanceCase;
  key: string;
  error: string;
}

function requireValid(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`本地完整报告校验失败：${message}`);
}
function record(value: unknown, label: string): asserts value is RecordValue {
  requireValid(value !== null && typeof value === 'object' && !Array.isArray(value), label);
}
function nonnegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}
function integer(value: unknown): value is number {
  return nonnegative(value) && Number.isInteger(value);
}
function timestamp(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '' && Number.isFinite(Date.parse(value));
}
function hex(value: unknown, length: number): value is string {
  return typeof value === 'string' && new RegExp(`^[a-f0-9]{${length}}$`, 'i').test(value);
}
// JSON 往返前拒绝会被静默丢弃或改写的数据，也拒绝循环引用及自定义序列化对象。
function jsonValue(value: unknown, ancestors = new Set<object>()): void {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    requireValid(Number.isFinite(value), '报告包含非有限数值');
    return;
  }
  requireValid(typeof value === 'object', '报告必须仅包含 JSON 数据');
  requireValid(!ancestors.has(value), '报告包含循环引用');
  requireValid(
    Array.isArray(value) ||
      Object.getPrototypeOf(value) === Object.prototype ||
      Object.getPrototypeOf(value) === null,
    '报告必须仅包含普通 JSON 对象',
  );
  ancestors.add(value);
  for (const child of Array.isArray(value) ? value : Object.values(value))
    jsonValue(child, ancestors);
  ancestors.delete(value);
}
function messages(value: unknown, label: string): string[] {
  if (value === undefined) return [];
  requireValid(
    Array.isArray(value) && value.every((item) => typeof item === 'string' && item.trim()),
    `${label} 必须为非空错误文本数组`,
  );
  return value;
}
const merge = (...lists: string[][]) => [...new Set(lists.flat())];

function identity(value: unknown, planned: Map<string, BalanceCase>, label: string) {
  record(value, `${label} 缺少 case`);
  const key = caseKey(value as unknown as BalanceCase);
  const c = planned.get(key);
  requireValid(c, `${label} 未知计划样本：${key}`);
  requireValid(
    Object.entries(c).every(([field, expected]) => value[field] === expected),
    `${label} case 字段类型或身份错配：${key}`,
  );
  return key;
}
function battleShape(value: unknown, label: string): asserts value is BattleSample {
  record(value, `${label} 战斗记录无效`);
  requireValid(
    integer(value.entryStep) &&
      integer(value.exitStep) &&
      integer(value.maxAliveBosses) &&
      nonnegative(value.firstClearCultivation) &&
      nonnegative(value.cultivation) &&
      value.firstClearCultivation <= value.cultivation,
    `${label} 战斗成长或首通数值非法`,
  );
  requireValid(
    Array.isArray(value.bosses) && value.bosses.every((b) => b && typeof b === 'object'),
    `${label} 妖王记录无效`,
  );
  requireValid(Array.isArray(value.trials), `${label} 缺少天劫记录`);
  for (const trial of value.trials) {
    record(trial, `${label} 天劫记录无效`);
    requireValid(
      ['won', 'lost', 'timeout'].includes(trial.state as string) &&
        nonnegative(trial.seconds) &&
        integer(trial.round),
      `${label} 天劫数值或状态非法`,
    );
  }
  if (value.at90 !== null) {
    record(value.at90, `${label} 90 秒成长观测无效`);
    requireValid(
      nonnegative(value.at90.cultivation) &&
        integer(value.at90.step) &&
        integer(value.at90.level) &&
        nonnegative(value.seconds) &&
        value.seconds >= 90,
      `${label} 90 秒成长观测非法`,
    );
  }
}
function campaignShape(value: unknown): asserts value is CampaignSample {
  record(value, 'current 样本无效');
  record(value.ads, `${value.key} 缺少广告计数`);
  requireValid(
    ['supplies', 'borrow', 'revive'].every((key) => integer((value.ads as RecordValue)[key])) &&
      typeof value.stop === 'string' &&
      value.stop.length > 0 &&
      Array.isArray(value.battles),
    `${value.key} 样本字段非法`,
  );
  for (const battle of value.battles) battleShape(battle, String(value.key));
}

function validateFarms(value: unknown, cases: BalanceCase[]): string[] {
  // simulateFarm 不返回 key；attempt 是同一存档首关的 1..20 轮，而非五次/关的尝试。
  const plan = new Map(
    cases
      .filter(
        (c) =>
          c.profile === 'earned' &&
          c.difficulty === 0 &&
          c.seed === 41 &&
          ['sword', 'nail'].includes(c.starter),
      )
      .map((c) => [caseKey(c), c]),
  );
  requireValid(
    Array.isArray(value) && value.length === 42 && plan.size === 42,
    'farms 必须覆盖全部 42 组首关重刷',
  );
  const seen = new Set<string>();
  const failures: string[] = [];
  for (const farm of value) {
    record(farm, 'farms 记录无效');
    const key = identity(farm.case, plan, 'farms');
    requireValid(!seen.has(key), `farms 重复样本：${key}`);
    seen.add(key);
    requireValid(
      nonnegative(farm.cultivation) &&
        integer(farm.step) &&
        farm.step < 24 &&
        realmInfo(farm.cultivation).step === farm.step,
      `farms 成长结果非法：${key}`,
    );
    requireValid(
      Array.isArray(farm.battles) && farm.battles.length >= 1 && farm.battles.length <= 20,
      `farms 必须有 1–20 轮原生战斗：${key}`,
    );
    let cultivation = 0,
      seconds = 0,
      firstWon = false;
    for (const [index, battle] of farm.battles.entries()) {
      battleShape(battle, `farms ${key}`);
      requireValid(
        battle.stage === 0 && battle.attempt === index + 1,
        `farms 首关轮次缺失、重复或非法：${key}`,
      );
      requireValid(
        battle.entryStep === realmInfo(cultivation).step,
        `farms 同一存档成长不连续：${key}`,
      );
      cultivation += battle.cultivation;
      seconds += battle.seconds;
      requireValid(battle.exitStep === realmInfo(cultivation).step, `farms 战后境界错配：${key}`);
      // 仅对临时校验视图归一化 attempt；返回的原生记录完全保留，不把重刷补成 campaign。
      const c = farm.case as BalanceCase;
      verifyCoverage(
        [
          {
            case: c,
            key,
            complete: false,
            cleared: battle.state === 'won' ? 1 : 0,
            stop: battle.state,
            battles: [{ ...battle, attempt: 1 }],
            ads: { supplies: 0, borrow: 0, revive: 0 },
            seconds: battle.seconds,
            adSeconds: 0,
            cultivation,
          },
        ],
        [c],
      );
      if (battle.firstClearCultivation > 0 && (firstWon || battle.state !== 'won'))
        failures.push(`首通修为重复或非法领取：${key} 第 ${battle.attempt} 轮`);
      if (battle.state === 'won') firstWon = true;
      if (!['won', 'lost'].includes(battle.state))
        requireValid(index === farm.battles.length - 1, `farms 终止后仍有战斗：${key}`);
    }
    requireValid(
      Math.abs(cultivation - farm.cultivation) < 1e-6,
      `farms 总修为与原生逐轮记录不一致：${key}`,
    );
    const last = farm.battles.at(-1)!;
    if (farm.battles.length < 20 && ['won', 'lost'].includes(last.state)) {
      // 原生循环也会在下一轮之前因寿尽退出；初始年龄15，重刷不做备物/借寿。
      const age = 15 + (seconds * STAGE_YEARS_PER_MINUTE[0]) / 60;
      requireValid(
        age >= REALM_LIFESPANS[Math.floor(farm.step / 3)] - 0.04,
        `farms 未完成 20 轮且无原生终止原因：${key}`,
      );
    }
  }
  return failures;
}

/** expected.commit/currentHash 必须由调用方实际核验 Git 源码；本函数不访问 Git 或网络。 */
export function prepareImportedReport(
  value: unknown,
  expected: {
    commit: string;
    currentHash: string;
    importedAt: string;
    inputSha256: string;
    runId?: string;
  },
): DailyReport & Record<string, unknown> {
  requireValid(hex(expected.commit, 40), 'expected.commit 必须为 40 位十六进制提交');
  requireValid(hex(expected.currentHash, 64), 'expected.currentHash 必须为 64 位十六进制源码 hash');
  requireValid(hex(expected.inputSha256, 64), 'expected.inputSha256 必须为 64 位十六进制输入 hash');
  requireValid(timestamp(expected.importedAt), 'expected.importedAt 无效');
  requireValid(
    expected.runId === undefined || (typeof expected.runId === 'string' && expected.runId.trim()),
    'expected.runId 无效',
  );
  record(value, '报告必须为对象');
  jsonValue(value);
  const report: RecordValue = JSON.parse(JSON.stringify(value));
  requireValid(
    hex(report.commit, 40) && report.commit === expected.commit,
    'commit 与已核验源提交不匹配',
  );
  requireValid(
    hex(report.currentHash, 64) && report.currentHash === expected.currentHash,
    'currentHash 与已核验源码不匹配',
  );
  requireValid(report.protocol === BALANCE_PROTOCOL, 'protocol 版本不匹配');
  requireValid(
    report.full === true &&
      report.acceptanceRequired === true &&
      report.growthTargetsRequired === true,
    '必须为 full/acceptanceRequired/growthTargetsRequired 完整验收报告',
  );
  const cases = balanceCases(true);
  requireValid(report.cases === 10080 && cases.length === 10080, 'cases 必须为固定完整计划 10080');
  requireValid(
    timestamp(report.generatedAt) && nonnegative(report.elapsedSeconds),
    '原始生成时间或耗时无效',
  );
  requireValid(typeof report.passed === 'boolean', '原始 passed 必须为布尔值');
  requireValid(
    report.error === undefined || typeof report.error === 'string',
    '原始 error 必须为文本',
  );
  requireValid(
    Array.isArray(report.current) && Array.isArray(report.simulationErrors),
    '必须包含 current 和 simulationErrors 数组',
  );
  requireValid(
    report.current.length + report.simulationErrors.length === 10080,
    'current + simulationErrors 未完整覆盖 10080，禁止补齐或裁减样本',
  );
  const planned = new Map(cases.map((c) => [caseKey(c), c]));
  const seen = new Set<string>(),
    failed = new Set<string>();
  for (const [label, rows] of [
    ['current', report.current],
    ['simulationErrors', report.simulationErrors],
  ] as const) {
    for (const row of rows) {
      record(row, `${label} 样本无效`);
      const key = identity(row.case, planned, label);
      requireValid(row.key === key, `${label} caseKey 错配：${String(row.key)}`);
      requireValid(!seen.has(key), `${label} 重复或与正常/错误样本重叠：${key}`);
      seen.add(key);
      if (label === 'current') {
        requireValid(!('error' in row), `current 不能混入错误样本：${key}`);
        campaignShape(row);
      } else {
        requireValid(
          typeof row.error === 'string' && row.error.trim(),
          `simulationErrors 缺少错误文本：${key}`,
        );
        failed.add(key);
      }
    }
  }
  requireValid(seen.size === planned.size, '完整计划有缺失样本');
  const current = report.current as CampaignSample[];
  const errors = report.simulationErrors as SimulationError[];
  const normalCases = cases.filter((c) => !failed.has(caseKey(c)));
  if (normalCases.length) verifyCoverage(current, normalCases);
  else requireValid(current.length === 0, '全异常报告不能有正常样本');
  const farmFailures = validateFarms(report.farms, cases);
  const originalFailures = messages(report.failures, 'failures');
  const readinessFailures = merge(
    messages(report.readinessFailures, 'readinessFailures'),
    growthReadiness(current, growthShape()),
  );
  const targetFailures = merge(
    messages(report.targetFailures, 'targetFailures'),
    acceptanceFailures(current, errors, false),
  );
  const groupFailures = merge(
    messages(report.groupFailures, 'groupFailures'),
    acceptanceFailures(current, errors).filter((f) => !targetFailures.includes(f)),
  );
  const bossFailures = merge(messages(report.bossFailures, 'bossFailures'), bossReadiness(current));
  const regressionFailures = merge(
    messages(report.regressionFailures, 'regressionFailures'),
    farmFailures,
  );
  const referenceErrors: string[] = [];
  if (report.referenceErrors !== undefined) {
    requireValid(Array.isArray(report.referenceErrors), 'referenceErrors 必须为数组');
    for (const error of report.referenceErrors) {
      record(error, 'referenceErrors 错误记录无效');
      requireValid(
        typeof error.key === 'string' && typeof error.error === 'string' && error.error.trim(),
        'referenceErrors 缺少原始错误文本',
      );
      referenceErrors.push(`${error.key}：对照模拟异常 ${error.error}`);
    }
  }
  const failures = merge(
    originalFailures,
    readinessFailures,
    targetFailures,
    regressionFailures,
    errors.map((e) => `${e.key}：模拟/恢复异常 ${e.error}`),
    referenceErrors,
    report.error ? [report.error as string] : [],
  );
  if (report.passed === false && !failures.length) failures.push('原始报告标记为未通过');
  return {
    ...report,
    commit: expected.commit,
    currentHash: expected.currentHash,
    current,
    currentMetrics: summarize(current, cases),
    readinessFailures,
    targetFailures,
    groupFailures,
    bossFailures,
    regressionFailures,
    failures,
    passed: failures.length === 0,
    // 不传播上传文件声称的可信来源；输入摘要及导入时间只来自调用方。
    origin: {
      kind: 'local-import',
      importedAt: expected.importedAt,
      inputSha256: expected.inputSha256,
      sourceVerified: true,
      ...(expected.runId === undefined ? {} : { workflowRunId: expected.runId }),
    },
  };
}
