import assert from 'node:assert/strict';
import test from 'node:test';
import {
  emptyObserverState,
  evaluateSnapshot,
  parseObserverConfig,
  validateObserverState,
} from '../../../scripts/observer/observe-policy.ts';
import type {
  Metric,
  Observation,
  ObserverConfig,
  ObserverState,
  Signal,
  Snapshot,
} from '../../../scripts/observer/observe-types.ts';

function at(hour: number): string {
  return new Date(Date.UTC(2026, 10, 5) + hour * 3600000).toISOString();
}

function config(): ObserverConfig {
  return {
    schemaVersion: 1,
    sources: [
      {
        id: 'report',
        title: '已采集报告',
        kind: 'json',
        url: 'https://example.test/report.json',
        maxAgeHours: 48,
        timeoutMs: 10000,
        maxBytes: 1048576,
        headersEnv: { Authorization: 'REPORT_AUTHORIZATION' },
        generatedAtPointer: '/generatedAt',
        versionPointer: '/version',
        metricRules: [
          {
            id: 'ratio',
            label: '成功率',
            pointer: '/ratio',
            samplePointer: '/samples',
            direction: 'lower',
          },
        ],
      },
    ],
    policy: {
      confirmations: 2,
      historyLimit: 20,
      maxHistoryHours: 48,
      baselineSamples: 3,
      relativeChange: 0.2,
      absoluteChange: 10,
      minMetricSamples: 100,
    },
    analysis: {
      engine: 'none',
      model: 'local-model',
      baseUrl: 'http://localhost:11434/v1',
      protocol: 'decisions',
      apiKeyEnv: 'OBSERVER_AI_KEY',
      timeoutMs: 10000,
      maxInputChars: 20000,
      maxOutputTokens: 1000,
    },
  };
}

function failure(overrides: Partial<Signal> = {}): Signal {
  return {
    id: 'gate-failure',
    sourceId: 'report',
    severity: 'critical',
    title: '报告明确失败',
    detail: '已采集报告标明失败，不重新运行验收。',
    evidenceIds: ['report'],
    immediate: true,
    ...overrides,
  };
}

function gauge(value: number, overrides: Partial<Metric> = {}): Metric {
  return {
    id: 'ratio',
    label: '成功率',
    value,
    sampleSize: 100,
    direction: 'lower',
    ...overrides,
  };
}

function source(hour: number, overrides: Partial<Observation> = {}): Observation {
  return {
    id: 'report',
    title: '已采集报告',
    kind: 'json',
    observedAt: at(hour),
    generatedAt: at(hour),
    version: 'version-a',
    comparisonKey: 'same-population',
    status: 'ready',
    metrics: [],
    signals: [],
    ...overrides,
  };
}

function snap(hour: number, overrides: Partial<Observation> = {}): Snapshot {
  return { schemaVersion: 1, at: at(hour), observations: [source(hour, overrides)] };
}

function evaluate(snapshot: Snapshot, state = emptyObserverState(), policy = config().policy) {
  return evaluateSnapshot(snapshot, state, policy);
}

function baseline(
  values = [100, 100, 100],
  overrides: Partial<Observation> = {},
  metricOverrides: Partial<Metric> = {},
) {
  let state = emptyObserverState();
  for (const [hour, value] of values.entries())
    state = evaluate(
      snap(hour, { metrics: [gauge(value, metricOverrides)], ...overrides }),
      state,
    ).state;
  return state;
}

function onlyIncident(state: ObserverState) {
  const values = Object.values(state.incidents);
  assert.equal(values.length, 1);
  return values[0];
}

test('健康采集静默；不推断游戏 gate、不重算来源过期', () => {
  const decision = evaluate(snap(100, { generatedAt: at(0), metrics: [gauge(0)] }));
  assert.deepEqual(decision.signals, []);
  assert.deepEqual(decision.notifications, []);
  assert.deepEqual(decision.recovered, []);
  assert.equal(decision.state.history.length, 1);
  assert.deepEqual(decision.state.incidents, {});
});

test('明确硬失败 immediate 首次通知，完整保留来源信号', () => {
  const signal = failure();
  const decision = evaluate(snap(0, { status: 'failed', signals: [signal] }));
  assert.deepEqual(decision.signals, [signal]);
  assert.deepEqual(decision.notifications, [signal]);
  assert.equal(onlyIncident(decision.state).confirmations, 1);
});

test('failed/unavailable/invalid 来源信号都保留，不改严重程度或 immediate', () => {
  for (const status of ['failed', 'unavailable', 'invalid'] as const) {
    const signal = failure({ id: status, severity: 'warning', immediate: false });
    const decision = evaluate(snap(0, { status, signals: [signal] }));
    assert.deepEqual(decision.signals, [signal]);
    assert.deepEqual(decision.notifications, []);
  }
});

test('缺失来源信号的异常采集状态也不能静默冒充健康', () => {
  assert.equal(evaluate(snap(0, { status: 'failed' })).notifications.length, 1);
  for (const status of ['unavailable', 'invalid'] as const) {
    const decision = evaluate(snap(0, { status }));
    assert.equal(decision.signals.length, 1);
    assert.equal(decision.notifications.length, 0);
  }
});

test('正常任务 pending 持续多次仍静默，state JSON 往返接受 pending', () => {
  let state = emptyObserverState();
  for (let hour = 0; hour < 6; hour++) {
    const decision = evaluate(snap(hour, { status: 'pending', generatedAt: at(0) }), state);
    assert.deepEqual(decision.signals, []);
    assert.deepEqual(decision.notifications, []);
    assert.deepEqual(decision.recovered, []);
    assert.deepEqual(decision.state.incidents, {});
    assert.equal(decision.state.history.at(-1)?.observations[0].status, 'pending');
    state = validateObserverState(JSON.parse(JSON.stringify(decision.state)));
    assert.deepEqual(state, decision.state);
  }
});

test('pending 不恢复原失败，也不刷新原事件确认；ready 后才能确认恢复', () => {
  for (const immediate of [true, false]) {
    let state = evaluate(snap(0, { status: 'failed', signals: [failure({ immediate })] })).state;
    const incident = structuredClone(onlyIncident(state));
    for (let hour = 1; hour < 4; hour++) {
      const decision = evaluate(snap(hour, { status: 'pending' }), state);
      assert.deepEqual(decision.signals, []);
      assert.deepEqual(decision.notifications, []);
      assert.deepEqual(decision.recovered, []);
      assert.deepEqual(onlyIncident(decision.state), incident);
      state = decision.state;
    }
    assert.equal(evaluate(snap(4), state).recovered.length, 1);
  }
});

test('pending 指标既不触发阈值或趋势，也不成为后续健康基线样本', () => {
  const current = evaluate(
    snap(3, {
      status: 'pending',
      metrics: [gauge(50, { alertBelow: 75 })],
    }),
    baseline(),
  );
  assert.deepEqual(current.signals, []);
  assert.deepEqual(current.notifications, []);
  let state = baseline([100, 100]);
  for (let hour = 2; hour < 4; hour++)
    state = evaluate(snap(hour, { status: 'pending', metrics: [gauge(100)] }), state).state;
  assert.deepEqual(evaluate(snap(4, { metrics: [gauge(50)] }), state).signals, []);
});

test('pending 后只有 collector 显式给出 unavailable/run-stuck 才开始异常确认', () => {
  let state = evaluate(snap(0, { status: 'pending' })).state;
  state = evaluate(snap(1, { status: 'pending' }), state).state;
  const stuck = failure({ id: 'run-stuck', severity: 'warning', immediate: false });
  let decision = evaluate(snap(2, { status: 'unavailable', signals: [stuck] }), state);
  assert.deepEqual(decision.signals, [stuck]);
  assert.deepEqual(decision.notifications, []);
  assert.equal(onlyIncident(decision.state).confirmations, 1);
  decision = evaluate(snap(3, { status: 'unavailable', signals: [stuck] }), decision.state);
  assert.deepEqual(decision.notifications, [stuck]);
});

test('连续确认达到策略次数才通知；已通知同一信号持续静默', () => {
  const signals = [failure({ severity: 'warning', immediate: false })];
  let decision = evaluate(snap(0, { signals }));
  assert.equal(decision.notifications.length, 0);
  decision = evaluate(snap(1, { signals }), decision.state);
  assert.equal(decision.notifications.length, 1);
  decision = evaluate(snap(2, { signals }), decision.state);
  assert.equal(decision.notifications.length, 0);
  assert.equal(onlyIncident(decision.state).confirmations, 3);
});

test('同一事件 severity 升级再提醒一次，降级再升级不 spam', () => {
  let decision = evaluate(snap(0, { signals: [failure({ severity: 'warning' })] }));
  assert.equal(decision.notifications.length, 1);
  decision = evaluate(snap(1, { signals: [failure()] }), decision.state);
  assert.equal(decision.notifications.length, 1);
  decision = evaluate(snap(2, { signals: [failure({ severity: 'warning' })] }), decision.state);
  assert.equal(decision.notifications.length, 0);
  decision = evaluate(snap(3, { signals: [failure()] }), decision.state);
  assert.equal(decision.notifications.length, 0);
});

test('健康采集确认恢复仅记录一次，恢复后复发重新通知', () => {
  let decision = evaluate(snap(0, { status: 'failed', signals: [failure()] }));
  decision = evaluate(snap(1), decision.state);
  assert.equal(decision.notifications.length, 0);
  assert.equal(decision.recovered.length, 1);
  assert.equal(decision.recovered[0].resolvedAt, at(1));
  decision = evaluate(snap(2), decision.state);
  assert.deepEqual(decision.recovered, []);
  decision = evaluate(snap(3, { status: 'failed', signals: [failure()] }), decision.state);
  assert.equal(decision.notifications.length, 1);
  assert.equal(onlyIncident(decision.state).firstSeen, at(3));
  assert.equal(onlyIncident(decision.state).resolvedAt, undefined);
});

test('来源缺失、不可用、无效、失败或仍有来源故障时均不能假装恢复', () => {
  const previous = evaluate(snap(0, { status: 'failed', signals: [failure()] })).state;
  const candidates: Snapshot[] = [
    { schemaVersion: 1, at: at(1), observations: [] },
    ...(['unavailable', 'invalid', 'failed'] as const).map((status) => snap(1, { status })),
    snap(1, { signals: [failure({ id: 'other-failure' })] }),
  ];
  for (const current of candidates) {
    const decision = evaluate(current, previous);
    assert.deepEqual(decision.recovered, []);
    assert.equal(
      Object.values(decision.state.incidents).find((entry) => entry.signal.id === 'gate-failure')
        ?.resolvedAt,
      undefined,
    );
  }
});

test('短暂故障恢复后清除连续确认，复发需要重新确认', () => {
  const signals = [failure({ severity: 'warning', immediate: false })];
  let decision = evaluate(snap(0, { signals }));
  decision = evaluate(snap(1), decision.state);
  assert.equal(decision.recovered.length, 1);
  decision = evaluate(snap(2, { signals }), decision.state);
  assert.equal(decision.notifications.length, 0);
  assert.equal(onlyIncident(decision.state).confirmations, 1);
  decision = evaluate(snap(3, { signals }), decision.state);
  assert.equal(decision.notifications.length, 1);
});

test('重复 snapshot 和倒退时间既不刷新确认也不恢复、不写历史', () => {
  const input = snap(2, { signals: [failure({ immediate: false })] });
  const first = evaluate(input).state;
  for (const replay of [
    input,
    snap(1, { signals: input.observations[0].signals }),
    snap(2),
    snap(1),
  ]) {
    const decision = evaluate(replay, first);
    assert.deepEqual(decision.state, first);
    assert.deepEqual(decision.notifications, []);
    assert.deepEqual(decision.recovered, []);
  }
});

test('新的 snapshot 时间不能让复用 observation 或倒退报告刷确认/恢复', () => {
  const first = evaluate(snap(2, { signals: [failure({ immediate: false })] })).state;
  for (const overrides of [
    { observedAt: at(2), generatedAt: at(2), signals: [failure({ immediate: false })] },
    { observedAt: at(3), generatedAt: at(1), signals: [failure({ immediate: false })] },
    { observedAt: at(2), generatedAt: at(2) },
    { observedAt: at(3), generatedAt: at(1) },
  ]) {
    const decision = evaluate(snap(3, overrides), first);
    assert.equal(onlyIncident(decision.state).confirmations, 1);
    assert.deepEqual(decision.notifications, []);
    assert.deepEqual(decision.recovered, []);
  }
});

test('不同来源的同名 signal 分别去重与恢复', () => {
  const input = snap(0, { signals: [failure()] });
  input.observations.push(
    source(0, { id: 'other', signals: [failure({ sourceId: 'other', evidenceIds: ['other'] })] }),
  );
  const first = evaluate(input);
  assert.equal(first.notifications.length, 2);
  const next = evaluate(snap(1), first.state);
  assert.equal(next.recovered.length, 1);
  assert.equal(next.recovered[0].signal.sourceId, 'report');
  assert.equal(
    Object.values(next.state.incidents).find((entry) => entry.signal.sourceId === 'other')
      ?.resolvedAt,
    undefined,
  );
});

test('倒退 observation 写入后再重放旧 observation，仍不能刷新确认', () => {
  const signals = [failure({ immediate: false })];
  let state = evaluate(snap(2, { signals })).state;
  state = evaluate(snap(3, { observedAt: at(1), generatedAt: at(1), signals }), state).state;
  const replay = evaluate(snap(4, { observedAt: at(2), generatedAt: at(2), signals }), state);
  assert.equal(onlyIncident(replay.state).confirmations, 1);
  assert.deepEqual(replay.notifications, []);
});

test('来源历史被截断后，仍不能用早于活跃事件的采集确认恢复', () => {
  const policy = { ...config().policy, historyLimit: 1, baselineSamples: 1 };
  let state = evaluate(snap(2, { signals: [failure()] }), emptyObserverState(), policy).state;
  state = evaluate({ schemaVersion: 1, at: at(3), observations: [] }, state, policy).state;
  const stale = evaluate(snap(4, { observedAt: at(1), generatedAt: at(1) }), state, policy);
  assert.deepEqual(stale.recovered, []);
});

test('alertAbove/Below 使用显式数值，零和负值合法，等于边界静默', () => {
  for (const [value, overrides, count] of [
    [11, { alertAbove: 10 }, 1],
    [10, { alertAbove: 10 }, 0],
    [9, { alertBelow: 10 }, 1],
    [10, { alertBelow: 10 }, 0],
    [1, { alertAbove: 0 }, 1],
    [-2, { alertBelow: -1 }, 1],
  ] as const) {
    const decision = evaluate(snap(0, { metrics: [gauge(value, overrides)] }));
    assert.equal(decision.signals.length, count);
  }
});

test('绝对错误率阈值遵守 minSamples；普通连续指标可不提供 sampleSize', () => {
  for (const bounds of [{ alertAbove: 0.1 }, { alertBelow: 0.9 }]) {
    for (const sampleSize of [0, 1, 99, undefined]) {
      const metric = gauge(0.5, { ...bounds, minSamples: 100 });
      if (sampleSize === undefined) delete metric.sampleSize;
      else metric.sampleSize = sampleSize;
      assert.deepEqual(evaluate(snap(0, { metrics: [metric] })).signals, []);
    }
    assert.equal(
      evaluate(snap(0, { metrics: [gauge(0.5, { ...bounds, minSamples: 100 })] })).signals.length,
      1,
    );
    const continuous = gauge(0.5, bounds);
    delete continuous.sampleSize;
    assert.equal(evaluate(snap(0, { metrics: [continuous] })).signals.length, 1);
  }
  const previous = evaluate(
    snap(0, { metrics: [gauge(0.5, { alertAbove: 0.1, minSamples: 100 })] }),
  ).state;
  assert.deepEqual(
    evaluate(
      snap(1, { metrics: [gauge(0, { alertAbove: 0.1, minSamples: 100, sampleSize: 1 })] }),
      previous,
    ).recovered,
    [],
  );
});

test('新指标非有限值或无效结构产生 invalid，不能恢复原事件；历史不存 NaN', () => {
  const previous = evaluate(snap(0, { signals: [failure()] })).state;
  for (const invalid of [
    gauge(NaN),
    gauge(Infinity),
    gauge(-Infinity),
    gauge(1, { sampleSize: -1 }),
    { ...gauge(1), value: '1' },
    { ...gauge(1), alertAbove: true },
    null,
  ]) {
    const decision = evaluate(snap(1, { metrics: [invalid as Metric] }), previous);
    assert.ok(decision.signals.some((signal) => signal.id.endsWith(':invalid-metrics')));
    assert.deepEqual(decision.recovered, []);
    assert.equal(decision.state.history.at(-1)?.observations[0].status, 'invalid');
    assert.deepEqual(
      validateObserverState(JSON.parse(JSON.stringify(decision.state))),
      decision.state,
    );
  }
});

test('不合法历史指标绝不当正常数据继续判恢复', () => {
  for (const invalid of [NaN, Infinity, -Infinity, null, '100']) {
    const state = baseline();
    state.history[0].observations[0].metrics[0].value = invalid as number;
    assert.throws(() => validateObserverState(state), /metrics/);
    assert.throws(() => evaluate(snap(4), state), /metrics/);
  }
});

test('至少 baselineSamples 个不同生成批次才比较；重复下载同一报告不算样本', () => {
  assert.deepEqual(evaluate(snap(2, { metrics: [gauge(50)] }), baseline([100, 100])).signals, []);
  let state = emptyObserverState();
  for (let hour = 0; hour < 5; hour++)
    state = evaluate(snap(hour, { generatedAt: at(0), metrics: [gauge(100)] }), state).state;
  assert.deepEqual(evaluate(snap(5, { metrics: [gauge(50)] }), state).signals, []);
});

test('汇总发布时间多次变化，同一 metric 生成批次不能建立虚假 baseline', () => {
  let state = emptyObserverState();
  for (let hour = 0; hour < 5; hour++) {
    const generatedAt = hour % 2 ? '2026-11-05T08:00:00+08:00' : at(0);
    state = evaluate(snap(hour, { metrics: [gauge(100, { generatedAt })] }), state).state;
  }
  const decision = evaluate(snap(5, { metrics: [gauge(50, { generatedAt: at(5) })] }), state);
  assert.deepEqual(decision.signals, []);
  assert.deepEqual(decision.notifications, []);
  assert.deepEqual(validateObserverState(JSON.parse(JSON.stringify(state))), state);
});

test('同一汇总中的各 metric 按自己的生成批次独立去重', () => {
  let state = emptyObserverState();
  for (let hour = 0; hour < 3; hour++)
    state = evaluate(
      snap(hour, {
        metrics: [
          gauge(100, { id: 'render', generatedAt: at(0) }),
          gauge(100, { id: 'simulation', generatedAt: at(hour) }),
        ],
      }),
      state,
    ).state;
  const decision = evaluate(
    snap(3, {
      metrics: [
        gauge(50, { id: 'render', generatedAt: at(3) }),
        gauge(50, { id: 'simulation', generatedAt: at(3) }),
      ],
    }),
    state,
  );
  assert.equal(decision.signals.length, 1);
  assert.equal(decision.signals[0].id, 'report:metric:simulation:trend');
});

test('metric 生成时间优先于汇总时间，同一汇总时间内的三个真实批次可比较', () => {
  let state = emptyObserverState();
  for (let hour = 0; hour < 3; hour++)
    state = evaluate(
      snap(hour + 10, {
        generatedAt: at(9),
        metrics: [gauge(100, { generatedAt: at(hour) })],
      }),
      state,
    ).state;
  const decision = evaluate(
    snap(13, {
      generatedAt: at(9),
      metrics: [gauge(50, { generatedAt: at(3) })],
    }),
    state,
  );
  assert.equal(decision.signals.length, 1);
  assert.equal(decision.signals[0].id, 'report:metric:ratio:trend');
});

test('metric 同一批次或倒退批次不能因汇总发布较新就拿未来批次作 baseline', () => {
  let state = emptyObserverState();
  for (let hour = 0; hour < 3; hour++)
    state = evaluate(snap(hour, { metrics: [gauge(100, { generatedAt: at(hour) })] }), state).state;
  for (const generatedAt of [at(2), at(1)]) {
    const decision = evaluate(snap(3, { metrics: [gauge(50, { generatedAt })] }), state);
    assert.deepEqual(decision.signals, []);
    assert.deepEqual(decision.notifications, []);
  }
});

test('metric.generatedAt 严格校验时间；当前非法数据不恢复，历史非法数据拒绝', () => {
  const failed = evaluate(snap(0, { signals: [failure()] })).state;
  for (const generatedAt of ['invalid', '2026-02-30T00:00:00Z', 42, null]) {
    const invalid = gauge(100, { generatedAt: generatedAt as string });
    const decision = evaluate(snap(1, { metrics: [invalid] }), failed);
    assert.deepEqual(decision.recovered, []);
    assert.equal(decision.state.history.at(-1)?.observations[0].status, 'invalid');
    assert.ok(decision.signals.some((signal) => signal.id.endsWith(':invalid-metrics')));
    const state = baseline();
    state.history[0].observations[0].metrics[0] = invalid;
    assert.throws(() => validateObserverState(state), /generatedAt/);
    const value = config();
    value.sources[0].metricRules![0].generatedAt = generatedAt as string;
    assert.throws(() => parseObserverConfig(value), /generatedAt/);
  }
});

test('缺少 generatedAt 时按 observedAt 去重而非 snapshot 时间', () => {
  const state = baseline();
  for (const entry of state.history) {
    delete entry.observations[0].generatedAt;
    entry.observations[0].observedAt = at(0);
  }
  assert.deepEqual(evaluate(snap(4, { metrics: [gauge(50)] }), state).signals, []);
});

test('当前或历史样本不足、缺失样本数不能触发趋势', () => {
  const state = baseline();
  for (const sampleSize of [0, 99, undefined]) {
    const metric = gauge(50);
    if (sampleSize === undefined) delete metric.sampleSize;
    else metric.sampleSize = sampleSize;
    assert.deepEqual(evaluate(snap(3, { metrics: [metric] }), state).signals, []);
  }
  assert.deepEqual(
    evaluate(snap(3, { metrics: [gauge(50)] }), baseline([100, 100, 100], {}, { sampleSize: 99 }))
      .signals,
    [],
  );
  assert.deepEqual(
    evaluate(snap(3, { metrics: [gauge(50, { minSamples: 101 })] }), state).signals,
    [],
  );
});

test('不同来源、指标、comparisonKey、版本、单位或方向不能混进同一基线', () => {
  const state = baseline();
  for (const overrides of [
    { id: 'other' },
    { version: 'version-b' },
    { comparisonKey: 'other-population' },
    { metrics: [gauge(50, { id: 'other' })] },
    { metrics: [gauge(50, { comparisonKey: 'other' })] },
    { metrics: [gauge(50, { unit: 'ms' })] },
    { metrics: [gauge(200, { direction: 'higher' })] },
  ])
    assert.deepEqual(evaluate(snap(3, { metrics: [gauge(50)], ...overrides }), state).signals, []);
  const current = snap(3, { metrics: [gauge(50)] });
  delete current.observations[0].version;
  delete current.observations[0].comparisonKey;
  assert.deepEqual(evaluate(current, state).signals, []);
});

test('同版本同批群下降同时越过相对和绝对门槛才提示；改善不提示', () => {
  const state = baseline();
  for (const value of [81, 110])
    assert.deepEqual(evaluate(snap(3, { metrics: [gauge(value)] }), state).signals, []);
  const decision = evaluate(snap(3, { metrics: [gauge(80)] }), state);
  assert.equal(decision.signals.length, 1);
  assert.ok(decision.signals[0].id.endsWith(':trend'));
  assert.equal(decision.notifications.length, 0);
  assert.deepEqual(
    evaluate(snap(3, { metrics: [gauge(50, { absoluteChange: 60 })] }), state).signals,
    [],
  );
  assert.deepEqual(
    evaluate(snap(3, { metrics: [gauge(50, { relativeChange: 0.6 })] }), state).signals,
    [],
  );
});

test('direction higher 仅上升恶化；零基线需真正正向变化并过绝对门槛', () => {
  const state = baseline([100, 100, 100], {}, { direction: 'higher' });
  assert.equal(
    evaluate(snap(3, { metrics: [gauge(120, { direction: 'higher' })] }), state).signals.length,
    1,
  );
  assert.equal(
    evaluate(snap(3, { metrics: [gauge(80, { direction: 'higher' })] }), state).signals.length,
    0,
  );
  const zero = baseline([0, 0, 0], {}, { direction: 'higher' });
  assert.equal(
    evaluate(snap(3, { metrics: [gauge(0, { direction: 'higher' })] }), zero).signals.length,
    0,
  );
  assert.equal(
    evaluate(snap(3, { metrics: [gauge(10, { direction: 'higher' })] }), zero).signals.length,
    1,
  );
});

test('未声明 direction 的累计 counter 不直接作为趋势', () => {
  const state = baseline();
  for (const entry of state.history) delete entry.observations[0].metrics[0].direction;
  const metric = gauge(1000000);
  delete metric.direction;
  assert.deepEqual(evaluate(snap(3, { metrics: [metric] }), state).signals, []);
});

test('异常批次不稀释健康基线；持续下降确认通知后静默，真正恢复才恢复', () => {
  let state = baseline();
  for (let hour = 3; hour < 8; hour++) {
    const decision = evaluate(snap(hour, { metrics: [gauge(50)] }), state);
    assert.equal(decision.signals.length, 1);
    assert.equal(decision.notifications.length, hour === 4 ? 1 : 0);
    assert.deepEqual(decision.recovered, []);
    state = decision.state;
  }
  const recovered = evaluate(snap(8, { metrics: [gauge(100)] }), state);
  assert.equal(recovered.recovered.length, 1);
});

test('低样本、缺失指标或缺少充分历史都不能误称趋势恢复', () => {
  const previous = evaluate(snap(3, { metrics: [gauge(50)] }), baseline()).state;
  for (const current of [
    snap(4),
    snap(4, { metrics: [gauge(100, { sampleSize: 1 })] }),
    snap(100, { metrics: [gauge(100)] }),
  ]) {
    const decision = evaluate(current, previous);
    assert.deepEqual(decision.recovered, []);
  }
});

test('历史数量和时间双重截断，活跃事件不会因过期而自动恢复', () => {
  const policy = { ...config().policy, historyLimit: 3, baselineSamples: 2, maxHistoryHours: 2 };
  let state = evaluate(snap(0, { signals: [failure()] }), emptyObserverState(), policy).state;
  for (let hour = 1; hour < 6; hour++) {
    const current: Snapshot = { schemaVersion: 1, at: at(hour), observations: [] };
    state = evaluate(current, state, policy).state;
    assert.ok(state.history.length <= 3);
    assert.ok(state.history.every((entry) => Date.parse(entry.at) >= Date.parse(at(hour - 2))));
  }
  assert.equal(onlyIncident(state).resolvedAt, undefined);
});

test('已恢复事件超过历史保留窗口被清理', () => {
  const first = evaluate(snap(0, { signals: [failure()] }));
  const resolved = evaluate(snap(1), first.state);
  const later = evaluate(snap(100), resolved.state);
  assert.deepEqual(later.state.incidents, {});
  assert.equal(later.state.history.length, 1);
});

test('所有 API 不修改输入，返回对象也不与输入共享引用', () => {
  const input = snap(3, { metrics: [gauge(50)] });
  const previous = baseline();
  const inputCopy = structuredClone(input),
    stateCopy = structuredClone(previous);
  const decision = evaluate(input, previous);
  assert.deepEqual(input, inputCopy);
  assert.deepEqual(previous, stateCopy);
  decision.state.history[0].observations[0].metrics[0].value = -10;
  decision.signals[0].detail = '改写结果';
  assert.deepEqual(input, inputCopy);
  assert.deepEqual(previous, stateCopy);
  const parsed = parseObserverConfig(config());
  const validated = validateObserverState(previous);
  parsed.sources[0].id = 'changed';
  validated.history[0].observations[0].title = 'changed';
  assert.deepEqual(previous, stateCopy);
  const one = emptyObserverState(),
    two = emptyObserverState();
  one.history.push(input);
  assert.deepEqual(two, { schemaVersion: 1, history: [], incidents: {} });
});

test('state JSON 往返保留去重/升级/恢复能力；旧版本不静默清空', () => {
  const first = evaluate(snap(0, { signals: [failure()] }));
  const persisted = validateObserverState(JSON.parse(JSON.stringify(first.state)));
  assert.equal(evaluate(snap(1, { signals: [failure()] }), persisted).notifications.length, 0);
  assert.equal(evaluate(snap(1), persisted).recovered.length, 1);
  for (const invalid of [
    null,
    {},
    { ...emptyObserverState(), schemaVersion: 0 },
    { ...emptyObserverState(), schemaVersion: 2 },
  ])
    assert.throws(() => validateObserverState(invalid));
});

test('严格校验 state 时间、结构、重复、数量边界及未知字段', () => {
  const good = evaluate(snap(0, { signals: [failure()] })).state;
  const incident = onlyIncident(good);
  const invalidStates: unknown[] = [
    { ...good, extra: true },
    { ...good, history: {} },
    { ...good, incidents: [] },
    { ...good, history: [snap(1), snap(0)] },
    { ...good, history: [snap(0), snap(0)] },
    { ...good, history: Array(1001).fill(snap(0)) },
    { ...good, incidents: { a: { ...incident, confirmations: 0 } } },
    { ...good, incidents: { a: { ...incident, confirmations: 101 } } },
    { ...good, incidents: { a: { ...incident, lastSeen: at(-1) } } },
    { ...good, incidents: { a: { ...incident, notifiedAt: at(1) } } },
    { ...good, incidents: { a: { ...incident, resolvedAt: at(-1) } } },
    { ...good, incidents: { a: incident, b: incident } },
    {
      ...good,
      incidents: Object.fromEntries(Array.from({ length: 16385 }, (_, i) => [String(i), incident])),
    },
    { ...good, history: [snap(0, { observedAt: '2026-02-30T00:00:00Z' })] },
    {
      ...good,
      history: [
        snap(0, { metrics: Array.from({ length: 257 }, (_, i) => gauge(i, { id: String(i) })) }),
      ],
    },
    {
      ...good,
      history: [
        {
          ...snap(0),
          observations: Array.from({ length: 65 }, (_, i) => source(0, { id: String(i) })),
        },
      ],
    },
  ];
  for (const invalid of invalidStates) assert.throws(() => validateObserverState(invalid));
});

test('配置显式传入所有默认值并隔离引用；支持全部 engine/protocol', () => {
  for (const engine of ['pi', 'openai', 'none'] as const)
    for (const protocol of ['responses', 'chat-completions', 'decisions'] as const) {
      const input = config();
      input.analysis = { ...input.analysis, engine, protocol };
      assert.deepEqual(parseObserverConfig(input), input);
      const parsed = parseObserverConfig(input);
      parsed.sources[0].headersEnv!.Authorization = 'DIFFERENT_ENV';
      assert.equal(input.sources[0].headersEnv!.Authorization, 'REPORT_AUTHORIZATION');
    }
});

test('配置严格拒绝未知/缺失字段、重复 ids、原始 secret 和非法 metric 规则', () => {
  const mutations: ((value: any) => void)[] = [
    (v) => {
      v.extra = true;
    },
    (v) => {
      v.schemaVersion = 2;
    },
    (v) => {
      delete v.policy.confirmations;
    },
    (v) => {
      delete v.analysis.model;
    },
    (v) => {
      v.policy.cooldown = 3;
    },
    (v) => {
      v.analysis.apiKey = 'raw-secret';
    },
    (v) => {
      v.sources[0].headers = { Authorization: 'Bearer raw' };
    },
    (v) => {
      v.sources[0].headersEnv.Authorization = 'Bearer raw';
    },
    (v) => {
      v.sources[0].headersEnv.Authorization = '${SECRET}';
    },
    (v) => {
      v.sources[0].headersEnv.Authorization = 'has-hyphen';
    },
    (v) => {
      v.sources[0].headersEnv.authorization = 'OTHER_ENV';
    },
    (v) => {
      v.sources[0].headersEnv['bad\nheader'] = 'ENV';
    },
    (v) => {
      v.sources.push(structuredClone(v.sources[0]));
    },
    (v) => {
      v.sources[0].metricRules.push(structuredClone(v.sources[0].metricRules[0]));
    },
    (v) => {
      v.sources[0].kind = 'unsupported';
    },
    (v) => {
      v.sources[0].metricRules[0].direction = 'both';
    },
    (v) => {
      v.sources[0].metricRules[0].alertAbove = true;
    },
    (v) => {
      v.sources[0].metricRules[0].value = 1;
    },
    (v) => {
      v.sources[0].metricRules[0].alertAbove = 1;
      v.sources[0].metricRules[0].alertBelow = 2;
    },
    (v) => {
      v.sources[0].id = '';
    },
    (v) => {
      v.sources = [];
    },
    (v) => {
      delete v.sources[0].url;
    },
    (v) => {
      v.analysis.engine = 'cloud';
    },
    (v) => {
      v.analysis.protocol = 'legacy';
    },
  ];
  for (const mutate of mutations) {
    const value = config();
    mutate(value);
    assert.throws(() => parseObserverConfig(value));
  }
});

test('JSON Pointer 支持空根、~0/~1 和数组路径；拒绝片段、无斜线和坏转义', () => {
  for (const pointer of ['', '/items/0/value', '/a~1b/~0key', '/~01', '/']) {
    const value = config();
    value.sources[0].generatedAtPointer = pointer;
    value.sources[0].versionPointer = pointer;
    value.sources[0].metricRules![0].pointer = pointer;
    value.sources[0].metricRules![0].samplePointer = pointer;
    assert.doesNotThrow(() => parseObserverConfig(value));
  }
  for (const pointer of ['plain', '#/field', '/bad~', '/bad~2', '/~~0'])
    for (const field of ['generatedAtPointer', 'versionPointer', 'pointer', 'samplePointer']) {
      const value: any = config();
      if (field.endsWith('Pointer') && !['samplePointer'].includes(field))
        value.sources[0][field] = pointer;
      else value.sources[0].metricRules[0][field] = pointer;
      assert.throws(() => parseObserverConfig(value), /Pointer|pointer/);
    }
});

test('URL 要求 HTTPS；HTTP 仅允许 localhost/loopback，本地 AI 兼容服务有效', () => {
  for (const address of [
    'https://example.test/data',
    'http://localhost:9000/data',
    'http://127.0.0.1:9000/v1',
    'http://[::1]:9000/v1',
  ]) {
    const value = config();
    value.sources[0].url = address;
    value.analysis.baseUrl = address;
    assert.doesNotThrow(() => parseObserverConfig(value));
  }
  for (const address of [
    'http://example.test',
    'http://localhost.example.test',
    'http://192.168.1.1',
    'ftp://localhost/a',
    '/relative',
    'https://user:password@example.test',
    'https://example.test/#token',
  ]) {
    for (const target of ['source', 'analysis']) {
      const value = config();
      if (target === 'source') value.sources[0].url = address;
      else value.analysis.baseUrl = address;
      assert.throws(() => parseObserverConfig(value), /url|baseUrl/);
    }
  }
});

test('所有 policy/threshold/budget 都有有限正数和数量上限', () => {
  const fields: [string[], number][] = [
    [['policy', 'confirmations'], 101],
    [['policy', 'historyLimit'], 1001],
    [['policy', 'maxHistoryHours'], 8761],
    [['policy', 'baselineSamples'], 21],
    [['policy', 'relativeChange'], 101],
    [['policy', 'absoluteChange'], 1e16],
    [['policy', 'minMetricSamples'], 1e10],
    [['analysis', 'timeoutMs'], 300001],
    [['analysis', 'maxInputChars'], 1000001],
    [['analysis', 'maxOutputTokens'], 65537],
    [['sources', '0', 'maxAgeHours'], 8761],
    [['sources', '0', 'timeoutMs'], 300001],
    [['sources', '0', 'maxBytes'], 32 * 1024 * 1024 + 1],
    [['sources', '0', 'metricRules', '0', 'relativeChange'], 101],
    [['sources', '0', 'metricRules', '0', 'absoluteChange'], 1e16],
    [['sources', '0', 'metricRules', '0', 'minSamples'], 1e10],
  ];
  for (const [path, above] of fields)
    for (const invalid of [0, -1, Infinity, NaN, above]) {
      const value: any = config();
      let target = value;
      for (const part of path.slice(0, -1)) target = target[part];
      target[path.at(-1)!] = invalid;
      assert.throws(() => parseObserverConfig(value), path.join('.'));
    }
  for (const field of ['confirmations', 'historyLimit', 'baselineSamples', 'minMetricSamples']) {
    const value: any = config();
    value.policy[field] = 1.5;
    assert.throws(() => parseObserverConfig(value));
  }
  const value = config();
  value.sources = Array.from({ length: 65 }, (_, i) => ({ ...value.sources[0], id: String(i) }));
  assert.throws(() => parseObserverConfig(value));
});

test('github workflow 严格校验 repository/path/branch 与运行预算，允许仅 workflow 来源', () => {
  const value = config();
  value.sources[0].kind = 'github';
  delete value.sources[0].url;
  value.sources[0].workflow = {
    repository: 'owner/repo',
    path: '.github/workflows/report.yml',
    branch: 'master',
    maxRunHours: 4,
  };
  assert.doesNotThrow(() => parseObserverConfig(value));
  for (const change of [
    { repository: '../bad/repo' },
    { path: '../report.yml' },
    { path: '/report.yml' },
    { branch: '' },
    { maxRunHours: 0 },
    { unknown: true },
  ]) {
    const input = structuredClone(value);
    Object.assign(input.sources[0].workflow!, change);
    assert.throws(() => parseObserverConfig(input));
  }
});
