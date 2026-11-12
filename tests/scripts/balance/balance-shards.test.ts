import test from 'node:test';
import assert from 'node:assert/strict';
import { main, runCases } from '../../../scripts/balance/balance-gate.ts';
import { balanceCases, caseKey } from '../../../scripts/balance/balance-policy.ts';
import { summarize } from '../../../scripts/balance/balance-metrics.ts';
import type { BalanceCase } from '../../../scripts/balance/balance-policy.ts';
import type { CampaignSample } from '../../../scripts/balance/balance-simulation.ts';
import { TRIAL_BOSS_TIMES } from '../../../src/core/data.ts';
import { fileURLToPath } from 'node:url';
import {
  createBalanceShard,
  mergeBalanceShards,
  selectShardCases,
  shardPlanHash,
} from '../../../scripts/balance/balance-shards.ts';

const identity = {
  commit: 'a'.repeat(40),
  currentHash: 'b'.repeat(64),
  executionHash: 'c'.repeat(64),
};
const runner = {
  node: 'v22',
  platform: 'linux',
  architecture: 'x64',
  cpuModel: 'fixture',
  logicalCpus: 4,
  availableCpus: 4,
  cpuQuota: '400000 100000',
};

function sample(c: BalanceCase): CampaignSample {
  return {
    case: c,
    key: caseKey(c),
    complete: false,
    cleared: 0,
    stop: 'lost',
    seconds: 1,
    adSeconds: 0,
    cultivation: 0,
    ads: { supplies: 0, borrow: 0, revive: 0 },
    battles: [
      {
        stage: 0,
        attempt: 1,
        state: 'lost',
        seconds: 1,
        entryStep: 0,
        exitStep: 0,
        cultivation: 0,
        at90: null,
        trials: [],
        maxAliveBosses: 0,
        firstClearCultivation: 0,
        bosses: [],
      },
    ],
  };
}

const plan = balanceCases(true)
  .filter((_c, index) => index % 251 === 0)
  .slice(0, 32);
function shards() {
  return Array.from({ length: 8 }, (_v, index) => {
    const selected = selectShardCases(plan, index, 8);
    return createBalanceShard(
      plan,
      index,
      8,
      identity,
      {
        results: selected.map(sample),
        errors: [],
      },
      1000 + index * 100,
      2000 + index * 100,
      4,
      runner,
    );
  });
}

for (const count of [8, 16])
  test(`完整10080计划分成${count}片，没有改动、遗漏或重复任何种子身份`, () => {
    const cases = balanceCases(true);
    const original = structuredClone(cases);
    const parts = Array.from({ length: count }, (_v, index) =>
      selectShardCases(cases, index, count),
    );
    assert.ok(parts.every((part) => part.length === 10080 / count));
    assert.deepEqual(parts.flat().map(caseKey).sort(), cases.map(caseKey).sort());
    assert.deepEqual(cases, original);
    assert.deepEqual(selectShardCases([...cases].reverse(), 0, count), parts[0]);
    assert.equal(shardPlanHash(cases), shardPlanHash([...cases].reverse()));
    for (const part of parts) {
      assert.equal(new Set(part.map((c) => c.root)).size, 7);
      assert.equal(new Set(part.map((c) => c.profile)).size, 4);
      assert.equal(new Set(part.map((c) => c.device)).size, 2);
      assert.equal(new Set(part.map((c) => c.difficulty)).size, 3);
    }
  });

test('非法分片范围、空计划或重复计划不能运行', () => {
  for (const [index, count] of [
    [-1, 8],
    [8, 8],
    [0, 0],
    [0.5, 8],
    [0, NaN],
    [0, 100],
  ])
    assert.throws(() => selectShardCases(plan, index, count));
  assert.throws(() => selectShardCases([], 0, 1));
  assert.throws(() => selectShardCases([plan[0], plan[0]], 0, 1), /重复样本/);
});

test('合并原始样本后统一统计，与未分片数据逐项相同，时间覆盖整个并行阶段', () => {
  const parts = shards();
  const won = parts[0].results[0];
  won.cleared = 1;
  won.seconds = 2;
  won.battles.push({ ...structuredClone(won.battles[0]), stage: 1 });
  won.battles[0].state = 'won';
  won.battles[0].maxAliveBosses = 1;
  won.battles[0].bosses = [{ stage: 0, at: 0.5, deadAt: 1, observedSeconds: 0.5, hpFraction: 0 }];
  const merged = mergeBalanceShards(parts.reverse(), plan, 8, identity);
  const original = plan.map(sample).sort((a, b) => a.key.localeCompare(b.key));
  original[original.findIndex((row) => row.key === won.key)] = won;
  assert.deepEqual(merged.results, original);
  assert.deepEqual(merged.errors, []);
  assert.deepEqual(summarize(merged.results, plan), summarize(original, plan));
  assert.equal(merged.startedAt, 1000);
  assert.equal(merged.finishedAt, 2700);
});

test('缺片、重复片、缺样本、跨片挪用与重复样本都不能合并成完整报告', () => {
  const parts = shards();
  assert.throws(() => mergeBalanceShards(parts.slice(1), plan, 8, identity), /缺失/);
  assert.throws(
    () => mergeBalanceShards([parts[0], ...parts.slice(0, 7)], plan, 8, identity),
    /重复/,
  );
  const mutations = [
    (p: typeof parts) => {
      p[0].results.pop();
    },
    (p: typeof parts) => {
      p[0].results[0] = p[1].results[0];
    },
    (p: typeof parts) => {
      p[0].results[1] = p[0].results[0];
    },
    (p: typeof parts) => {
      p[0].caseKeys.reverse();
    },
    (p: typeof parts) => {
      p[0].results[0].case.seed = String(p[0].results[0].case.seed) as unknown as number;
    },
  ];
  for (const change of mutations) {
    const invalid = structuredClone(parts);
    change(invalid);
    assert.throws(() => mergeBalanceShards(invalid, plan, 8, identity));
  }
});

test('不同提交、游戏源码、控制脚本、协议或测试计划的分片不能混用', () => {
  const parts = shards();
  for (const [field, value] of [
    ['commit', 'd'.repeat(40)],
    ['currentHash', 'e'.repeat(64)],
    ['executionHash', 'f'.repeat(64)],
    ['planHash', '0'.repeat(64)],
    ['planCount', 31],
    ['count', 7],
    ['stageCount', 6],
    ['balanceProtocol', 999],
    ['shardProtocol', 999],
    ['full', false],
    ['acceptance', false],
    ['currentOnly', false],
  ] as const) {
    const invalid = structuredClone(parts);
    Object.assign(invalid[0], { [field]: value });
    assert.throws(() => mergeBalanceShards(invalid, plan, 8, identity), /不一致/);
  }
  for (const field of ['startedAt', 'finishedAt', 'jobs']) {
    const invalid = structuredClone(parts);
    Object.assign(invalid[0], { [field]: NaN });
    assert.throws(() => mergeBalanceShards(invalid, plan, 8, identity), /无效/);
  }
});

test('执行异常保留在原计划分母中，不靠删异常或把前六关前缀冒充完整路线过关', () => {
  const parts = shards(),
    row = parts[0].results.shift()!;
  parts[0].errors.push({ case: row.case, key: row.key, error: '故障夹具' });
  const merged = mergeBalanceShards(parts, plan, 8, identity);
  assert.equal(merged.results.length + merged.errors.length, plan.length);
  assert.equal(merged.errors[0].key, row.key);
  const prefix = shards();
  prefix[0].results[0].stop = 'won';
  assert.throws(() => mergeBalanceShards(prefix, plan, 8, identity), /前六关前缀/);
});

test('跨作业的原始JSON拒绝截断冒充、耗时矛盾、负妖王计数与未来时间，允许真实准备中止', () => {
  const row = sample(plan[0]);
  row.battles = Array.from({ length: 7 }, (_v, stage) => {
    const times = stage === 6 ? TRIAL_BOSS_TIMES : [0.5];
    return {
      ...structuredClone(row.battles[0]),
      stage,
      state: 'won',
      seconds: times.at(-1)! + 1,
      maxAliveBosses: 1,
      bosses: times.map((at, index) => ({
        stage: stage === 6 ? index : stage,
        at,
        deadAt: at + 0.5,
        observedSeconds: 0.5,
        hpFraction: 0,
      })),
    };
  });
  row.cleared = 7;
  row.complete = true;
  row.stop = 'won';
  row.seconds = row.battles.reduce((n, b) => n + b.seconds, 0);
  const make = (value: CampaignSample, start = 1000, end = 2000) =>
    createBalanceShard(
      [row.case],
      0,
      1,
      identity,
      { results: [value], errors: [] },
      start,
      end,
      1,
      runner,
    );
  const valid = make(row);
  assert.deepEqual(mergeBalanceShards([valid], [row.case], 1, identity).results, [row]);
  const truncated = structuredClone(row);
  truncated.battles.pop();
  truncated.cleared = 6;
  truncated.complete = false;
  truncated.seconds = truncated.battles.reduce((n, b) => n + b.seconds, 0);
  truncated.stop = 'lost';
  assert.throws(() => make(truncated), /终止原因/);
  truncated.stop = 'expired';
  assert.doesNotThrow(() => make(truncated));
  truncated.stop = 'tribulation-lost';
  assert.doesNotThrow(() => make(truncated));
  for (const mutate of [
    (r: CampaignSample) => {
      r.seconds = 0;
    },
    (r: CampaignSample) => {
      r.battles[0].maxAliveBosses = -1;
    },
    (r: CampaignSample) => {
      r.battles.reverse();
    },
  ]) {
    const invalid = structuredClone(row);
    mutate(invalid);
    assert.throws(() => make(invalid));
  }
  assert.throws(() => make(row, Date.now() + 86400000, Date.now() + 86401000), /时间/);
  valid.finishedAt = Date.now() + 86400000;
  assert.throws(() => mergeBalanceShards([valid], [row.case], 1, identity), /时间/);
});

test('分片参数必须明确保留完整当前目标门禁，不混入历史对照或偷换部分分母', async () => {
  for (const args of [
    ['--shard=0/8'],
    ['--full', '--shard=0/8'],
    ['--acceptance', '--shard=0/8'],
    ['--merge-shards=artifacts/missing'],
    ['--shard-count=8'],
    ['--full', '--acceptance', '--current-only', '--shard=0/8', '--merge-shards=artifacts/missing'],
  ])
    await assert.rejects(main(args));
});

test('真实同一固定种子的模拟不受跨分片分配、结果到达顺序和并发数改变影响', async () => {
  const cases = balanceCases(true).filter(
    (c) =>
      ['heaven', 'none'].includes(c.root) &&
      c.path === 'orthodox' &&
      c.seed === 41 &&
      c.profile === 'bare' &&
      [0, 2].includes(c.difficulty),
  );
  assert.equal(cases.length, 8);
  const root = fileURLToPath(new URL('../../..', import.meta.url));
  const original = await runCases(cases, root, 2, '固定种子原分配', 1);
  const pieces = await Promise.all(
    Array.from({ length: 2 }, (_v, index) =>
      runCases(selectShardCases(cases, index, 2), root, 1, `固定种子分片${index}`, 1),
    ),
  );
  assert.deepEqual(
    pieces.flatMap((p) => p.results).sort((a, b) => a.key.localeCompare(b.key)),
    original.results,
  );
  assert.deepEqual(
    pieces.flatMap((p) => p.errors),
    original.errors,
  );
});
