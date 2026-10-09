import test from 'node:test';
import assert from 'node:assert/strict';
import { main } from '../scripts/balance-gate.ts';
import {
  BARE_CLEAR_TARGETS,
  balanceCases,
  caseKey,
  FULL_SEEDS,
} from '../scripts/balance-policy.ts';
import {
  acceptanceFailures,
  compareMetrics,
  growthReadiness,
  quantile,
  rootClearRows,
  summarize,
  verifyCoverage,
} from '../scripts/balance-metrics.ts';
import { initialSave, simulateCampaign } from '../scripts/balance-simulation.ts';
import type { CampaignSample } from '../scripts/balance-simulation.ts';
import type { BalanceCase } from '../scripts/balance-policy.ts';
import { CULTIVATION_PATHS, ROOT_STARTERS, SPIRIT_ROOTS, treasure } from '../src/data.ts';

function sample(index = 0): CampaignSample {
  const c: BalanceCase = {
    root: 'heaven',
    path: 'orthodox',
    starter: 'sword',
    device: 'phone',
    profile: 'bare',
    difficulty: 0,
    seed: FULL_SEEDS[index],
  };
  return {
    case: c,
    key: caseKey(c),
    complete: false,
    cleared: 1,
    stop: 'lost',
    ads: { supplies: 0, borrow: 0, revive: 0 },
    seconds: 310,
    adSeconds: 0,
    cultivation: 3300,
    battles: [
      {
        stage: 0,
        attempt: 1,
        state: 'won',
        seconds: 200,
        entryStep: 0,
        exitStep: 9,
        cultivation: 3300,
        at90: { cultivation: 31, step: 0, level: 9 },
        trials: [],
        maxAliveBosses: 1,
        firstClearCultivation: 3000,
        bosses: [{ stage: 0, at: 180, deadAt: 200, observedSeconds: 20, hpFraction: 0 }],
      },
      {
        stage: 1,
        attempt: 1,
        state: 'lost',
        seconds: 110,
        entryStep: 9,
        exitStep: 9,
        cultivation: 0,
        at90: { cultivation: 100, step: 9, level: 9 },
        trials: [],
        maxAliveBosses: 0,
        firstClearCultivation: 0,
        bosses: [],
      },
    ],
  };
}

test('灵根汇总表区分整条路线与逐关统计，异常仍保留计划分母', () => {
  const rows = [sample()];
  const plan = [rows[0].case, sample(1).case];
  const metrics = summarize(rows, plan);
  assert.ok(metrics['root/heaven/bare/0/stage-0/clear']);
  assert.deepEqual(rootClearRows(metrics), [
    {
      group: 'root/heaven/bare/0/clear',
      planned: 2,
      observed: 1,
      errors: 1,
      clearRate: '0.0%',
    },
  ]);
});

test('快速与完整计划覆盖七种灵根、三路线、十种本命、两种场地与四种投入', () => {
  for (const full of [false, true]) {
    const cases = balanceCases(full);
    assert.equal(new Set(cases.map(caseKey)).size, cases.length);
    assert.equal(cases.length, full ? 10080 : 1120);
    for (const { id: root } of SPIRIT_ROOTS)
      for (const { id: path } of CULTIVATION_PATHS)
        for (const device of ['phone', 'desktop'])
          for (const profile of ['bare', 'earned', 'ads-only', 'maxed']) {
            const rows = cases.filter(
              (c) =>
                c.root === root && c.path === path && c.device === device && c.profile === profile,
            );
            const expected = Object.values(ROOT_STARTERS).flatMap((pair) =>
              path === 'dual' ? pair : [pair[path === 'demonic' ? 1 : 0]],
            );
            assert.deepEqual([...new Set(rows.map((c) => c.starter))].sort(), expected.sort());
            assert.deepEqual([...new Set(rows.map((c) => c.difficulty))], full ? [0, 1, 2] : [0]);
            assert.ok(rows.every((c) => path === 'dual' || treasure(c.starter).school === path));
          }
  }
});

test('各组灵根与本命通过正式新档和旧档校验产生，兼修魔道本命不偷换', () => {
  const cases = balanceCases(false).filter((c) => c.device === 'phone' && c.profile === 'bare');
  for (const c of cases) {
    const save = initialSave(c);
    assert.equal(save.starter, c.starter);
    assert.equal(save.spiritRoot, c.root);
    assert.equal(save.path, c.path);
    assert.ok(save.artifacts.includes(c.starter));
    assert.equal(save.rootElements.length, SPIRIT_ROOTS.find((r) => r.id === c.root)!.count);
    assert.equal(save.stones, 0);
    assert.equal(save.cultivation, 0);
    assert.ok(Object.values(save.training).every((n) => n === 0));
  }
});

test('空跑、漏跑、重复样本和伪造妖王胜利均不能通过覆盖校验', () => {
  const row = sample();
  assert.throws(() => verifyCoverage([], []), /零样本/);
  assert.throws(() => verifyCoverage([], [row.case]), /样本缺失/);
  assert.throws(() => verifyCoverage([row, row], [row.case]), /重复样本/);
  verifyCoverage([row], [row.case]);
  const fake = structuredClone(row);
  fake.battles[0].bosses = [];
  assert.throws(() => verifyCoverage([fake], [row.case]), /没有击败全部妖王/);
  fake.battles[0].bosses = [
    { stage: 0, at: 180, deadAt: null, observedSeconds: 20, hpFraction: 0.5 },
  ];
  assert.throws(() => verifyCoverage([fake], [row.case]), /没有击败全部妖王/);
  const nonfinite = structuredClone(row);
  nonfinite.seconds = NaN;
  assert.throws(() => verifyCoverage([nonfinite], [row.case]), /非有限/);
});

test('未到后关、没有出场及未击杀妖王分别统计，不伪报为零秒击杀', () => {
  const row = sample();
  row.battles[1].seconds = 230;
  row.battles[1].bosses = [
    { stage: 1, at: 180, deadAt: null, observedSeconds: 50, hpFraction: 0.5 },
  ];
  const stats = summarize([row]);
  const prefix = 'route/heaven/orthodox/phone/bare/0';
  assert.equal(stats[`${prefix}/stage-1/boss-1/killed`].rate, 0);
  assert.equal(stats[`${prefix}/stage-1/boss-1/lifetime`].median, null);
  assert.equal(stats[`${prefix}/stage-1/boss-1/alive-observed`].median, 50);
  assert.equal(stats[`${prefix}/stage-2/entered`].rate, 0);
  assert.equal(stats[`${prefix}/stage-2/clear`].n, 1);
  assert.equal(stats[`${prefix}/stage-2/seconds`].median, null);
});

test('终关必须实际覆盖七种妖王，不能拿七个同王记录充数或伪造存活时间', () => {
  const row = sample();
  row.complete = true;
  row.cleared = 7;
  row.battles = Array.from({ length: 7 }, (_, stage) => ({
    ...structuredClone(sample().battles[0]),
    stage,
    seconds: 400,
    bosses: (stage === 6 ? [0, 1, 2, 3, 4, 5, 6] : [stage]).map((king, index) => ({
      stage: king,
      at: 60 + 45 * index,
      deadAt: 70 + 45 * index,
      observedSeconds: 10,
      hpFraction: 0,
    })),
  }));
  verifyCoverage([row], [row.case]);
  const duplicate = structuredClone(row);
  duplicate.battles[6].bosses.forEach((boss) => (boss.stage = 0));
  assert.throws(() => verifyCoverage([duplicate], [row.case]), /同一妖王重复/);
  const wrongStage = structuredClone(row);
  wrongStage.battles[1].bosses[0].stage = 0;
  assert.throws(() => verifyCoverage([wrongStage], [row.case]), /身份不匹配/);
  const wrongTime = structuredClone(row);
  wrongTime.battles[6].bosses[0].observedSeconds = 1;
  assert.throws(() => verifyCoverage([wrongTime], [row.case]), /存活时间计算/);
});

test('模拟异常保留计划分母和异常数，不能从通关比例里偷偷删除', () => {
  const first = sample(0),
    missing = sample(1);
  first.complete = true;
  first.cleared = 7;
  const stats = summarize([first], [first.case, missing.case]);
  const prefix = 'route/heaven/orthodox/phone/bare/0';
  assert.equal(stats[`${prefix}/clear`].n, 2);
  assert.equal(stats[`${prefix}/clear`].rate, 0.5);
  assert.equal(stats[`${prefix}/observed`].rate, 0.5);
  assert.equal(stats[`${prefix}/errors`].rate, 0.5);
  const failures = acceptanceFailures([first], [{ case: missing.case }]);
  assert.ok(failures.some((f) => f.startsWith('heaven：') && f.includes('不可判定')));
});

test('明显变易和变难、耗时拉长、妖王秒杀、修为被削均被双向门禁拦截', () => {
  const old = {
    'route/clear': { n: 20, rate: 0.7 },
    'route/seconds': { n: 14, median: 220, p90: 260 },
    'route/boss/lifetime': { n: 14, median: 20, p90: 40 },
    'route/growth90': { n: 20, median: 100, p90: 120 },
  };
  assert.deepEqual(compareMetrics(old, old), []);
  assert.deepEqual(compareMetrics({ ...old, 'route/clear': { n: 20, rate: 0.8 } }, old), []);
  assert.ok(
    compareMetrics({ ...old, 'route/clear': { n: 20, rate: 1 } }, old).some((f) =>
      f.includes('比例'),
    ),
  );
  assert.ok(compareMetrics({ ...old, 'route/clear': { n: 20, rate: 0.4 } }, old).length);
  assert.ok(
    compareMetrics({ ...old, 'route/seconds': { n: 14, median: 500, p90: 650 } }, old).length,
  );
  assert.ok(
    compareMetrics({ ...old, 'route/boss/lifetime': { n: 14, median: 0.1, p90: 1 } }, old).length,
  );
  assert.ok(
    compareMetrics({ ...old, 'route/growth90': { n: 20, median: 15, p90: 20 } }, old).length,
  );
  assert.ok(
    compareMetrics({ ...old, 'route/clear': { n: 10, rate: 0.7 } }, old).some((f) =>
      f.includes('分母改变'),
    ),
  );
});

test('百分位不会修改数据，中位数和长尾独立，不用平均数掩盖慢路线', () => {
  const values = [1000, 10, 10, 10, 10, 10, 10, 10, 1000, 10];
  const original = [...values];
  assert.equal(quantile(values, 0.5), 10);
  assert.equal(quantile(values, 0.9), 1000);
  assert.deepEqual(values, original);
  assert.equal(quantile([], 0.5), null);
});

test('用户确认的无辅助目标不能用全员通关替代，少量样本不能宣称达标', () => {
  assert.deepEqual(BARE_CLEAR_TARGETS.dual, { min: 0.2, max: 0.6, target: 0.4 });
  assert.deepEqual(BARE_CLEAR_TARGETS.triple, { min: 0.1, max: 0.5, target: 0.3 });
  assert.equal(BARE_CLEAR_TARGETS.none.max, 0.1);
  assert.ok(acceptanceFailures([sample()]).some((f) => f.includes('样本不足')));
  const rows = balanceCases(true)
    .filter((c) => c.profile === 'bare' && c.difficulty === 0)
    .map((c) => ({ ...sample(), case: c, key: caseKey(c), complete: true, cleared: 7 }));
  assert.ok(acceptanceFailures(rows).some((f) => f.startsWith('dual：')));
  assert.ok(acceptanceFailures(rows).some((f) => f.startsWith('none：')));
});

test('成长目标独立于回归基线，旧版本已知慢成长不能借原样通过掩盖', () => {
  const row = sample();
  const failures = growthReadiness([row], [{ major: 0, small: [90, 120], large: 150 }]);
  assert.ok(failures.some((f) => f.includes('跨大境界')));
  assert.ok(failures.some((f) => f.includes('90 秒')));
  row.battles[0].at90!.step = 1;
  assert.deepEqual(growthReadiness([row], [{ major: 0, small: [90, 120], large: 900 }]), []);
});

test('手机全员通过不能与电脑大量失败抵消成合格的双灵根平均胜率', () => {
  const cases = balanceCases(true).filter(
    (c) => c.root === 'dual' && c.profile === 'bare' && c.difficulty === 0,
  );
  const rows = cases.map((c) => {
    const complete = c.device === 'phone';
    return { ...sample(), case: c, key: caseKey(c), complete, cleared: complete ? 7 : 1 };
  });
  assert.equal(rows.filter((r) => r.complete).length / rows.length, 0.5);
  const failures = acceptanceFailures(rows);
  assert.ok(failures.some((f) => f.startsWith('dual/phone：')));
  assert.ok(failures.some((f) => f.startsWith('dual/desktop：')));
});

test('天灵根总体九成通关仍不能掩盖某一种本命全部失败', () => {
  const cases = balanceCases(true).filter(
    (c) => c.root === 'heaven' && c.profile === 'bare' && c.difficulty === 0,
  );
  const rows = cases.map((c) => {
    const complete = c.starter !== 'ice';
    return { ...sample(), case: c, key: caseKey(c), complete, cleared: complete ? 7 : 1 };
  });
  assert.equal(rows.filter((r) => r.complete).length / rows.length, 0.9);
  const failures = acceptanceFailures(rows);
  assert.ok(!failures.some((f) => f.startsWith('heaven：')));
  assert.ok(failures.some((f) => f.startsWith('heaven/ice：')));
});

test('实际裸开荒复跑可复现，禁止预算、强化和重试混入默认胜率', () => {
  const c: BalanceCase = {
    root: 'none',
    path: 'demonic',
    starter: 'nail',
    device: 'phone',
    profile: 'bare',
    difficulty: 0,
    seed: 41,
  };
  const a = simulateCampaign(c),
    b = simulateCampaign(c);
  assert.deepEqual(a, b);
  assert.ok(a.battles.every((row) => row.attempt === 1));
  assert.deepEqual(a.ads, { supplies: 0, borrow: 0, revive: 0 });
  assert.equal(a.adSeconds, 0);
  verifyCoverage([a], [c]);
});

test('仙器选择时击杀妖王也记录死亡，本局直接胜利不能漏记成未击杀', () => {
  const c: BalanceCase = {
    root: 'heaven',
    path: 'orthodox',
    starter: 'fan',
    device: 'desktop',
    profile: 'bare',
    difficulty: 0,
    seed: 697,
  };
  const row = simulateCampaign(c);
  const first = row.battles[0];
  assert.equal(first.state, 'won');
  assert.equal(first.bosses.length, 1);
  assert.equal(first.bosses[0].deadAt, first.seconds);
  assert.equal(first.bosses[0].hpFraction, 0);
  assert.ok(first.bosses[0].observedSeconds > 0);
  verifyCoverage([row], [c]);
});

test('报告路径错误在模拟前拒绝，不能往 src/docs 创建测试结果或绕过门禁参数', async () => {
  await assert.rejects(main(['--report=src/never-write-balance.json']), /只能写入/);
  await assert.rejects(main(['--report=docs/never-write-balance.json']), /只能写入/);
  await assert.rejects(main(['--report=artifacts/../docs/never-write-balance.json']), /只能写入/);
  await assert.rejects(main(['--update-reference']), /未知参数/);
  await assert.rejects(main(['--jobs=0']), /未知参数/);
  await assert.rejects(main(['--full', '--full']), /重复参数/);
});

test('负数/非整数关卡、无效或重复尝试和空裸开荒战斗记录不能伪装完成覆盖', () => {
  const valid = sample();
  for (const stage of [-1, NaN, 7, 0.5]) {
    const row = structuredClone(valid);
    row.battles[1].stage = stage;
    assert.throws(() => verifyCoverage([row], [row.case]), /记录非法/);
  }
  for (const attempt of [0, 2, NaN]) {
    const row = structuredClone(valid);
    row.battles[1].attempt = attempt;
    assert.throws(() => verifyCoverage([row], [row.case]), /记录非法/);
  }
  const repeated = structuredClone(valid);
  repeated.battles.push(structuredClone(repeated.battles[1]));
  assert.throws(() => verifyCoverage([repeated], [repeated.case]), /记录非法/);
  const empty = { ...valid, cleared: 0, battles: [] };
  assert.throws(() => verifyCoverage([empty], [empty.case]), /没有实际战斗/);
});
