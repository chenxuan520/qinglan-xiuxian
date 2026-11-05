import test from 'node:test';
import assert from 'node:assert/strict';
import type { Zone } from '../src/game-types.ts';
import { prepareRegionalExposure, regionalExposure, rotateZone } from '../src/regional-hazards.ts';

function sweep(overrides: Partial<Zone> = {}): Zone {
  const z: Zone = {
    x: 0,
    y: 0,
    radius: 16,
    life: 3,
    maxLife: 3,
    damage: 10,
    tick: 0,
    delay: 0,
    kind: 'boss-sweep',
    color: '#fff',
    hostile: true,
    spinCenter: { x: 120.5, y: -70.25 },
    spinAngle: Math.PI / 2,
    spinSpeed: -Math.PI / 3,
    spinInner: 75,
    spinOuter: 900,
    ...overrides,
  };
  rotateZone(z);
  return z;
}

test('星轨预计算保留原始风险值、等待方向及75边界，不改变浮点时间网格', () => {
  // 694c897原始实现的固定结果；包含不足一个采样步长的尾段。
  const cases: {
    p: [number, number];
    direction: [number, number];
    expected: number;
    zone?: Partial<Zone>;
  }[] = [
    { p: [300, 0], direction: [0, 0], expected: 0.15999999999999936 },
    { p: [300, 0], direction: [-1, 0], expected: 0.08 },
    { p: [300, 0], direction: [0, -1], expected: 0 },
    { p: [300, 0], direction: [0, 1], expected: 0.12 },
    { p: [160, 0], direction: [-Math.SQRT1_2, Math.SQRT1_2], expected: 0.2 },
    { p: [50, 0], direction: [0, 0], expected: 0 },
    { p: [75, 0], direction: [0, 0], expected: 1.6, zone: { spinAngle: 0, spinSpeed: 0 } },
    { p: [74.999999, 0], direction: [0, 0], expected: 0, zone: { spinAngle: 0, spinSpeed: 0 } },
    { p: [300, 0], direction: [0, 0], expected: 0, zone: { delay: 0.83 } },
    { p: [300, 0], direction: [0, 0], expected: 0, zone: { delay: 1 } },
    { p: [300, 0], direction: [0, 0], expected: 0, zone: { life: 0.55 } },
    {
      p: [900, 20],
      direction: [-1, 0],
      expected: 0.08,
      zone: { spinAngle: 0, spinSpeed: Math.PI / 3 },
    },
    {
      p: [300, 0],
      direction: [0, 0],
      expected: 0.15999999999999936,
      zone: { spinAngle: -Math.PI / 2, spinSpeed: Math.PI / 3 },
    },
  ];
  for (const c of cases) {
    const z = sweep(c.zone),
      p = { x: 120.5 + c.p[0], y: -70.25 + c.p[1] };
    assert.equal(regionalExposure(z, p, ...c.direction, 180), c.expected);
    assert.equal(prepareRegionalExposure(p, 180)(z, ...c.direction), c.expected);
  }
});

test('单次决策两轨的三角函数仅计算一次，跨18个候选方向共享', () => {
  const p = { x: 420.5, y: -70.25 },
    zones = [sweep(), sweep({ spinAngle: -Math.PI / 2 })];
  const directions = Array.from({ length: 18 }, (_, i) =>
    i === 17 ? [0, 0] : [Math.cos((i * Math.PI) / 8), Math.sin((i * Math.PI) / 8)],
  );
  const expected = zones.map((z) => directions.map(([x, y]) => regionalExposure(z, p, x, y, 180)));
  const cos = Math.cos,
    sin = Math.sin;
  let cosCalls = 0,
    sinCalls = 0;
  Math.cos = (x) => {
    cosCalls++;
    return cos(x);
  };
  Math.sin = (x) => {
    sinCalls++;
    return sin(x);
  };
  try {
    const exposure = prepareRegionalExposure(p, 180);
    for (const [i, z] of zones.entries())
      for (const [j, [x, y]] of directions.entries())
        assert.equal(exposure(z, x, y), expected[i][j]);
    assert.equal(cosCalls, 80);
    assert.equal(sinCalls, 80);
  } finally {
    Math.cos = cos;
    Math.sin = sin;
  }
});

test('下一次决策重新读取旋转、预警、寿命、玩家位置和速度，不写入区域或存档字段', () => {
  const z = sweep(),
    p = { x: 420.5, y: -70.25 };
  const before = structuredClone(z);
  assert.equal(prepareRegionalExposure(p, 180)(z, 0, 0), 0.15999999999999936);
  assert.deepEqual(z, before);
  for (const change of [
    () => {
      z.spinAngle = 0.1;
      z.spinSpeed = Math.PI / 3;
    },
    () => {
      z.delay = 1.2;
    },
    () => {
      z.delay = 0;
      z.life = 0.037;
    },
    () => {
      p.x = z.spinCenter!.x + 30;
      p.y = z.spinCenter!.y;
    },
  ]) {
    change();
    for (const speed of [0, 180, 360]) {
      const exposure = prepareRegionalExposure(p, speed);
      for (const [x, y] of [
        [0, 0],
        [1, 0],
        [0, -1],
      ])
        assert.equal(exposure(z, x, y), regionalExposure(z, p, x, y, speed));
    }
  }
});

test('星轨与漂移雷路、冰路、毒瘴混合时独立评分，保留控制与端点行为', () => {
  const p = { x: 420.5, y: -70.25 };
  const zones = [
    sweep(),
    ...['enemy-thunderpath', 'enemy-frost', 'boss-miasma'].map((kind) => ({
      ...sweep(),
      kind,
      x: 200,
      y: -120,
      endX: 600,
      endY: 100,
      vx: -90,
      vy: 0,
      delay: 0.37,
      tick: 0.12,
    })),
  ];
  const exposure = prepareRegionalExposure(p, 180);
  for (let i = 0; i < 18; i++) {
    const x = i === 17 ? 0 : Math.cos((i * Math.PI) / 8),
      y = i === 17 ? 0 : Math.sin((i * Math.PI) / 8);
    for (const z of zones) assert.equal(exposure(z, x, y), regionalExposure(z, p, x, y, 180));
  }
});
