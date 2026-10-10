import { BARE_CLEAR_TARGETS, caseKey, LIMITS } from './balance-policy.ts';
import type { BalanceCase } from './balance-policy.ts';
import type { CampaignSample } from './balance-simulation.ts';

export function quantile(values: number[], p: number) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)];
}
export function verifyCoverage(results: CampaignSample[], cases: BalanceCase[]) {
  if (!cases.length) throw new Error('零样本不能完成验证');
  const expected = new Set(cases.map(caseKey));
  if (expected.size !== cases.length) throw new Error('测试计划有重复样本');
  const actual = new Set<string>();
  for (const result of results) {
    if (!expected.has(result.key) || actual.has(result.key) || caseKey(result.case) !== result.key)
      throw new Error(`未知或重复样本：${result.key}`);
    actual.add(result.key);
    const valid = (n: number) => Number.isFinite(n) && n >= 0;
    if (
      ![result.seconds, result.adSeconds, result.cultivation, ...Object.values(result.ads)].every(
        valid,
      )
    )
      throw new Error(`非有限或负数结果：${result.key}`);
    if (
      !Number.isInteger(result.cleared) ||
      result.cleared < 0 ||
      result.cleared > 7 ||
      result.complete !== (result.cleared === 7)
    )
      throw new Error(`通关状态不一致：${result.key}`);
    if (
      !Array.isArray(result.battles) ||
      (result.case.profile === 'bare' && !result.battles.length)
    )
      throw new Error(`裸开荒没有实际战斗记录：${result.key}`);
    const attempts = new Set<string>();
    for (const battle of result.battles) {
      const identity = `${battle.stage}/${battle.attempt}`;
      if (
        !Number.isInteger(battle.stage) ||
        battle.stage < 0 ||
        battle.stage > 6 ||
        !Number.isInteger(battle.attempt) ||
        battle.attempt < 1 ||
        battle.attempt > LIMITS.attempts ||
        (result.case.profile === 'bare' && battle.attempt !== 1) ||
        attempts.has(identity)
      )
        throw new Error(`关卡或尝试记录非法：${result.key} ${identity}`);
      attempts.add(identity);
      if (
        ![
          'won',
          'lost',
          'expired',
          'timeout',
          'borrow-budget',
          'tribulation-lost',
          'tribulation-timeout',
        ].includes(battle.state)
      )
        throw new Error(`未知战斗状态：${battle.state}`);
      if (
        ![battle.seconds, battle.cultivation, battle.entryStep, battle.exitStep].every(valid) ||
        battle.seconds > LIMITS.battleSeconds + 0.04
      )
        throw new Error(`战斗数值越界：${result.key}`);
      if (battle.maxAliveBosses > (battle.stage === 6 ? 2 : 1))
        throw new Error(`妖王并场超过上限：${result.key}`);
      for (const boss of battle.bosses) {
        if (
          !Number.isInteger(boss.stage) ||
          boss.stage < 0 ||
          boss.stage > 6 ||
          (battle.stage !== 6 && boss.stage !== battle.stage)
        )
          throw new Error(`妖王身份不匹配：${result.key}`);
        if (
          ![boss.at, boss.observedSeconds, boss.hpFraction].every(valid) ||
          boss.at > battle.seconds ||
          boss.hpFraction > 1
        )
          throw new Error(`妖王观测非法：${result.key}`);
        if (
          boss.deadAt !== null &&
          (!valid(boss.deadAt) || boss.deadAt < boss.at || boss.deadAt > battle.seconds)
        )
          throw new Error(`妖王击杀时间非法：${result.key}`);
        if (Math.abs(boss.observedSeconds - ((boss.deadAt ?? battle.seconds) - boss.at)) > 0.04)
          throw new Error(`妖王存活时间计算不一致：${result.key}`);
      }
      if (new Set(battle.bosses.map((boss) => boss.stage)).size !== battle.bosses.length)
        throw new Error(`同一妖王重复出场：${result.key}`);
      if (
        battle.state === 'won' &&
        (battle.bosses.length !== (battle.stage === 6 ? 7 : 1) ||
          battle.bosses.some((b) => b.deadAt === null))
      )
        throw new Error(`胜利却没有击败全部妖王：${result.key}`);
      if (battle.stage === 6)
        for (let i = 1; i < battle.bosses.length; i++)
          if (battle.bosses[i].at - battle.bosses[i - 1].at < 45 - 0.04)
            throw new Error(`终关实际出王间隔不足 45 秒：${result.key}`);
    }
    const won = new Set(result.battles.filter((b) => b.state === 'won').map((b) => b.stage));
    if (won.size !== result.cleared || [...won].some((stage) => stage >= won.size))
      throw new Error(`逐关记录与通关数不一致：${result.key}`);
  }
  if (actual.size !== expected.size) throw new Error(`样本缺失：${actual.size}/${expected.size}`);
}
export interface Metric {
  n: number;
  rate?: number;
  median?: number | null;
  p90?: number | null;
}
export const distribution = (values: number[]): Metric => ({
  n: values.length,
  median: quantile(values, 0.5),
  p90: quantile(values, 0.9),
});
export function rootClearRows(metrics: Record<string, Metric>) {
  return Object.entries(metrics)
    .filter(([key]) => /^root\/[^/]+\/[^/]+\/\d+\/clear$/.test(key))
    .map(([group, metric]) => ({
      group,
      planned: metric.n,
      observed: Math.round(metric.n * (metrics[group.replace(/\/clear$/, '/observed')].rate ?? 0)),
      errors: Math.round(metric.n * (metrics[group.replace(/\/clear$/, '/errors')].rate ?? 0)),
      clearRate: `${((metric.rate ?? 0) * 100).toFixed(1)}%`,
    }));
}
export function summarize(
  results: CampaignSample[],
  planned = results.map((row) => row.case),
  stageCount = 7,
) {
  if (!Number.isInteger(stageCount) || stageCount < 1 || stageCount > 7)
    throw new Error('统计关卡数必须为 1–7');
  const groups = new Map<string, { case: BalanceCase; sample: CampaignSample | undefined }[]>();
  const byKey = new Map(results.map((row) => [row.key, row]));
  function add(key: string, row: { case: BalanceCase; sample: CampaignSample | undefined }) {
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  }
  for (const c of planned) {
    const row = { case: c, sample: byKey.get(caseKey(c)) };
    const key = [c.root, c.path, c.device, c.profile, c.difficulty].join('/');
    add(`route/${key}`, row);
    add(`starter/${key}/${c.starter}`, row);
    add(`root/${c.root}/${c.profile}/${c.difficulty}`, row);
  }
  const metrics: Record<string, Metric> = {};
  for (const [key, entries] of groups) {
    const rows = entries.flatMap((entry) => (entry.sample ? [entry.sample] : []));
    const plannedN = entries.length;
    metrics[`${key}/clear`] = {
      n: plannedN,
      rate: rows.filter((r) => r.cleared >= stageCount).length / plannedN,
    };
    metrics[`${key}/observed`] = { n: plannedN, rate: rows.length / plannedN };
    metrics[`${key}/errors`] = { n: plannedN, rate: (plannedN - rows.length) / plannedN };
    metrics[`${key}/all-seconds`] = distribution(rows.map((r) => r.seconds));
    metrics[`${key}/clear-seconds`] = distribution(
      rows.filter((r) => r.cleared >= stageCount).map((r) => r.seconds),
    );
    metrics[`${key}/ads`] = distribution(rows.map((r) => r.adSeconds));
    metrics[`${key}/cultivation`] = distribution(rows.map((r) => r.cultivation));
    for (let stage = 0; stage < stageCount; stage++) {
      const battles = rows.flatMap((r) => r.battles.filter((b) => b.stage === stage));
      const wins = battles.filter((b) => b.state === 'won');
      // 分母是原始整组人数，不能只统计成功进入后关的人。
      metrics[`${key}/stage-${stage}/clear`] = {
        n: plannedN,
        rate: rows.filter((r) => r.cleared > stage).length / plannedN,
      };
      metrics[`${key}/stage-${stage}/entered`] = {
        n: plannedN,
        rate: rows.filter((r) => r.battles.some((b) => b.stage === stage)).length / plannedN,
      };
      metrics[`${key}/stage-${stage}/seconds`] = distribution(wins.map((b) => b.seconds));
      metrics[`${key}/stage-${stage}/failed-seconds`] = distribution(
        battles.filter((b) => b.state !== 'won').map((b) => b.seconds),
      );
      metrics[`${key}/stage-${stage}/attempts`] = distribution(
        rows
          .filter((r) => r.battles.some((b) => b.stage === stage))
          .map((r) => r.battles.filter((b) => b.stage === stage).length),
      );
      metrics[`${key}/stage-${stage}/timeout`] = {
        n: plannedN,
        rate:
          rows.filter((r) => r.battles.some((b) => b.stage === stage && b.state === 'timeout'))
            .length / plannedN,
      };
      const first90 = battles.filter((b) => b.attempt === 1 && b.at90);
      metrics[`${key}/stage-${stage}/growth90`] = distribution(
        first90.map((b) => b.at90!.cultivation),
      );
      metrics[`${key}/stage-${stage}/step90`] = distribution(first90.map((b) => b.at90!.step));
      for (const king of stage === 6 ? [0, 1, 2, 3, 4, 5, 6] : [stage]) {
        const bosses = battles.flatMap((b) => b.bosses.filter((boss) => boss.stage === king));
        const killed = bosses.filter((b) => b.deadAt !== null);
        const prefix = `${key}/stage-${stage}/boss-${king}`;
        // 未击杀者有独立比例及观测下界，不能当 0 秒/忽略后声称妖王寿命正常。
        metrics[`${prefix}/killed`] = {
          n: bosses.length,
          rate: bosses.length ? killed.length / bosses.length : 0,
        };
        metrics[`${prefix}/spawn`] = distribution(bosses.map((b) => b.at));
        metrics[`${prefix}/lifetime`] = distribution(killed.map((b) => b.observedSeconds));
        metrics[`${prefix}/alive-observed`] = distribution(
          bosses.filter((b) => b.deadAt === null).map((b) => b.observedSeconds),
        );
        metrics[`${prefix}/instant`] = {
          n: killed.length,
          rate: killed.length
            ? killed.filter((b) => b.observedSeconds < 2).length / killed.length
            : 0,
        };
      }
    }
  }
  return metrics;
}
export function compareMetrics(current: Record<string, Metric>, reference: Record<string, Metric>) {
  const failures: string[] = [];
  for (const key of new Set([...Object.keys(current), ...Object.keys(reference)])) {
    const now = current[key],
      before = reference[key];
    if (!now || !before) {
      failures.push(`${key}：缺少对照统计`);
      continue;
    }
    // 观测人数变化允许由不超过 10 个百分点的胜率变化带来，不能消灭困难样本。
    if (key.endsWith('/clear') || key.endsWith('/entered')) {
      if (now.n !== before.n) {
        failures.push(`${key}：分母改变 ${before.n} → ${now.n}`);
        continue;
      }
    }
    if (
      now.rate !== undefined &&
      before.rate !== undefined &&
      Math.abs(now.rate - before.rate) > LIMITS.ratePoints + 1e-9
    )
      failures.push(
        `${key}：比例 ${(before.rate * 100).toFixed(1)}% → ${(now.rate * 100).toFixed(1)}%，允许 ±10 个百分点`,
      );
    for (const stat of ['median', 'p90'] as const) {
      const a = now[stat],
        b = before[stat];
      if (a === undefined && b === undefined) continue;
      if (a === null || b === null) {
        if (a !== b) failures.push(`${key}/${stat}：观测由 ${b} 变为 ${a}`);
        continue;
      }
      if (a === undefined || b === undefined || !Number.isFinite(a) || !Number.isFinite(b)) {
        failures.push(`${key}/${stat}：统计非法`);
        continue;
      }
      let ratio: number = stat === 'median' ? LIMITS.medianTime : LIMITS.tailTime;
      let slack = 2;
      if (key.endsWith('/lifetime') || key.endsWith('/alive-observed')) {
        ratio = stat === 'median' ? LIMITS.bossMedian : LIMITS.bossTail;
        slack = 1;
      } else if (key.endsWith('/cultivation') || key.endsWith('/growth90')) {
        ratio = LIMITS.growth;
        slack = 1;
      } else if (key.endsWith('/attempts') || key.endsWith('/step90')) {
        ratio = 0;
        slack = 1;
      }
      if (Math.abs(a - b) > Math.abs(b) * ratio + slack + 1e-9)
        failures.push(
          `${key}/${stat}：${b.toFixed(2)} → ${a.toFixed(2)}，超过 ±${Math.round(ratio * 100)}% + ${slack}`,
        );
    }
  }
  return failures;
}
export function growthReadiness(
  results: CampaignSample[],
  shape: { major: number; small: number[]; large: number }[],
) {
  const failures: string[] = [];
  for (const row of shape) {
    if (row.large < row.small[1] * 5)
      failures.push(
        `境界 ${row.major + 1}：跨大境界 ${row.large}，不足小突破 ${row.small[1]} 的五倍`,
      );
  }
  const first = results
    .filter((r) => r.case.root === 'heaven' && r.case.profile === 'bare' && r.case.difficulty === 0)
    .flatMap((r) => r.battles.filter((b) => b.stage === 0 && b.attempt === 1));
  if (!first.length || first.some((b) => !b.at90)) failures.push('天灵根首局 90 秒成长观测缺失');
  const steps = first.filter((b) => b.at90).map((b) => b.at90!.step);
  if (
    steps.length &&
    (quantile(steps, 0.5)! < 1 || steps.filter((step) => step >= 1).length / steps.length < 0.9)
  )
    failures.push('天灵根首局 90 秒至少九成达到炼气中期，当前未达标');
  return failures;
}
export function acceptanceFailures(
  results: CampaignSample[],
  errors: { case: BalanceCase }[] = [],
  checkGroups = true,
) {
  const failures: string[] = [];
  for (const [root, target] of Object.entries(BARE_CLEAR_TARGETS)) {
    const invalid = errors.filter(
      (e) => e.case.root === root && e.case.profile === 'bare' && e.case.difficulty === 0,
    );
    if (invalid.length) {
      failures.push(`${root}：${invalid.length} 条裸开荒模拟异常，胜率不可判定`);
      continue;
    }
    const rows = results.filter(
      (r) => r.case.root === root && r.case.profile === 'bare' && r.case.difficulty === 0,
    );
    if (rows.length < 100) {
      failures.push(`${root}：裸开荒样本不足 100，不能判定目标胜率`);
      continue;
    }
    const rate = rows.filter((r) => r.cleared >= 6).length / rows.length;
    if (rate < target.min - 1e-9 || rate > target.max + 1e-9)
      failures.push(
        `${root}：裸开荒 ${(rate * 100).toFixed(1)}%，目标 ${target.min * 100}–${target.max * 100}%`,
      );
    if (!checkGroups) continue;
    // 不允许总体合格但某一整条正/魔/兼修路线明显坏掉。
    for (const path of ['orthodox', 'demonic', 'dual']) {
      const route = rows.filter((r) => r.case.path === path);
      const routeRate = route.filter((r) => r.cleared >= 6).length / route.length;
      if (
        !route.length ||
        routeRate < Math.max(0, target.min - 0.1) - 1e-9 ||
        routeRate > Math.min(1, target.max + 0.1) + 1e-9
      )
        failures.push(`${root}/${path}：路线裸开荒 ${(routeRate * 100).toFixed(1)}%，超出目标容差`);
    }
    for (const device of ['phone', 'desktop']) {
      const group = rows.filter((r) => r.case.device === device);
      const rate = group.filter((r) => r.cleared >= 6).length / group.length;
      if (
        !group.length ||
        rate < Math.max(0, target.min - 0.1) - 1e-9 ||
        rate > Math.min(1, target.max + 0.1) + 1e-9
      )
        failures.push(`${root}/${device}：设备裸开荒 ${(rate * 100).toFixed(1)}%，超出目标容差`);
      for (const path of ['orthodox', 'demonic', 'dual']) {
        const route = group.filter((r) => r.case.path === path);
        const routeRate = route.filter((r) => r.cleared >= 6).length / route.length;
        if (
          !route.length ||
          routeRate < Math.max(0, target.min - 0.1) - 1e-9 ||
          routeRate > Math.min(1, target.max + 0.1) + 1e-9
        )
          failures.push(
            `${root}/${path}/${device}：路线/设备裸开荒 ${(routeRate * 100).toFixed(1)}%，超出目标容差`,
          );
      }
    }
    // 本命单组只有 12 个样本，用宽容差挡明显坏搭配，不能被其他本命平均掉。
    for (const starter of new Set(rows.map((r) => r.case.starter))) {
      const group = rows.filter((r) => r.case.starter === starter);
      const rate = group.filter((r) => r.cleared >= 6).length / group.length;
      if (
        rate < Math.max(0, target.min - LIMITS.starterRatePoints) - 1e-9 ||
        rate > Math.min(1, target.max + LIMITS.starterRatePoints) + 1e-9
      )
        failures.push(`${root}/${starter}：本命裸开荒 ${(rate * 100).toFixed(1)}%，明显偏离目标`);
    }
  }
  return failures;
}
export function bossReadiness(results: CampaignSample[]) {
  const failures: string[] = [];
  // 基本妖王演出下限与最长战斗容差，独立于历史版本，不能把旧秒杀当质量目标。
  for (let stage = 0; stage < 7; stage++) {
    const rows = results
      .filter((r) => r.case.profile === 'bare' && r.case.difficulty === 0)
      .flatMap((r) => r.battles.filter((b) => b.stage === stage));
    for (const king of stage === 6 ? [0, 1, 2, 3, 4, 5, 6] : [stage]) {
      const killed = rows.flatMap((b) =>
        b.bosses.filter((boss) => boss.stage === king && boss.deadAt !== null),
      );
      if (killed.length < 10) {
        failures.push(`关卡 ${stage + 1}/妖王 ${king + 1}：有效击杀不足 10`);
        continue;
      }
      const times = killed.map((b) => b.observedSeconds);
      if (quantile(times, 0.5)! < 5 || times.filter((time) => time < 2).length / times.length > 0.1)
        failures.push(
          `关卡 ${stage + 1}/妖王 ${king + 1}：存活过短（中位数 ${quantile(times, 0.5)!.toFixed(1)} 秒）`,
        );
      if (quantile(times, 0.9)! > (king === 6 ? 180 : 90))
        failures.push(`关卡 ${stage + 1}/妖王 ${king + 1}：存活 P90 过长`);
    }
  }
  return failures;
}
