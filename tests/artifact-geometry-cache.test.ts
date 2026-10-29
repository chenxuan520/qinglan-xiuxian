import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { drawArtifactField, drawArtifactObject } from '../src/artifact-effects.ts';
import type { Zone } from '../src/game.ts';

type Command = { method: string; args: number[] };
class TracePath {
  static created = 0;
  readonly commands: Command[] = [];
  constructor() {
    TracePath.created++;
  }
  moveTo(...args: number[]) {
    this.commands.push({ method: 'moveTo', args });
  }
  lineTo(...args: number[]) {
    this.commands.push({ method: 'lineTo', args });
  }
}

// Canonical paint records keep individual stroke/fill order, geometry, transform,
// clip, style and alpha. The mock Path2D is expanded at paint time, as Canvas does.
function capture(zone: Zone, time: number, reduced: boolean) {
  const paints: unknown[] = [];
  let path: unknown[] = [];
  let matrix = [1.4, 0.2, -0.1, 0.8, 21, -4];
  const initial = {
    globalAlpha: 0.37,
    strokeStyle: '#123456',
    fillStyle: '#abcdef',
    lineWidth: 2.3,
    lineJoin: 'bevel',
    lineCap: 'square',
    lineDash: [2, 3],
  };
  let attributes: Record<string, unknown> = structuredClone(initial);
  const stack: { attributes: Record<string, unknown>; matrix: number[] }[] = [];
  const mark = (method: string, args: unknown[]) =>
    paints.push({
      method,
      args: structuredClone(args),
      attributes: structuredClone(attributes),
      matrix: [...matrix],
    });
  const transform = (n: number[]) => {
    const [a, b, c, d, e, f] = matrix;
    matrix = [
      a * n[0] + c * n[1],
      b * n[0] + d * n[1],
      a * n[2] + c * n[3],
      b * n[2] + d * n[3],
      a * n[4] + c * n[5] + e,
      b * n[4] + d * n[5] + f,
    ];
  };
  const ctx = new Proxy(
    {},
    {
      get(_target, method: string) {
        if (method in attributes) return attributes[method];
        return (...args: any[]) => {
          if (method === 'save')
            stack.push({ attributes: structuredClone(attributes), matrix: [...matrix] });
          else if (method === 'restore') ({ attributes, matrix } = stack.pop()!);
          else if (method === 'translate') transform([1, 0, 0, 1, args[0], args[1]]);
          else if (method === 'scale') transform([args[0], 0, 0, args[1], 0, 0]);
          else if (method === 'rotate') {
            const cos = Math.cos(args[0]),
              sin = Math.sin(args[0]);
            transform([cos, sin, -sin, cos, 0, 0]);
          } else if (method === 'setLineDash') attributes.lineDash = [...args[0]];
          else if (method === 'beginPath') path = [];
          else if (['moveTo', 'lineTo', 'arc', 'closePath'].includes(method))
            path.push({ method, args, matrix: [...matrix] });
          else if (['stroke', 'fill', 'clip'].includes(method)) {
            const painted =
              args[0] instanceof TracePath
                ? args[0].commands.map((c) => ({ ...c, matrix: [...matrix] }))
                : path;
            mark(method, [painted]);
          } else if (method === 'fillRect' || method === 'strokeRect') mark(method, args);
          else assert.fail(`unexpected Canvas operation: ${method}`);
        };
      },
      set(_target, key: string, value) {
        attributes[key] = value;
        return true;
      },
    },
  ) as CanvasRenderingContext2D;
  const before = structuredClone(zone);
  drawArtifactField(ctx, zone, time, reduced);
  drawArtifactObject(ctx, zone, time, reduced);
  assert.deepEqual(zone, before);
  assert.equal(stack.length, 0);
  assert.deepEqual(attributes, initial, '完整绘制后恢复调用者样式与透明度');
  assert.deepEqual(matrix, [1.4, 0.2, -0.1, 0.8, 21, -4]);
  return { paints, path };
}

function cases() {
  const result: { zone: Zone; time: number; reduced: boolean }[] = [];
  for (const kind of ['pagoda', 'vortex'])
    for (const radius of [73.25, 300])
      for (const evolved of [false, true])
        for (const reduced of [false, true])
          for (const phase of ['charging', 'just-landed', 'active', 'fading']) {
            const zone = {
              kind,
              radius,
              x: 37,
              y: -21,
              color: '#83a2cb',
              hostile: false,
              castDelay: 0.6,
              castAngle: -0.9,
              castEvolved: evolved,
              life: phase === 'fading' ? 0.01 : phase === 'active' ? 2 : 4.5,
              maxLife: 4.5,
              delay: phase === 'charging' ? 0.3 : 0,
              tick: 0,
              damage: 10,
            } as Zone;
            result.push({ zone, time: phase === 'active' ? 31.7 : 0, reduced });
          }
  return result;
}
function withPath<T>(value: unknown, run: () => T) {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'Path2D');
  Object.defineProperty(globalThis, 'Path2D', { configurable: true, value });
  try {
    return run();
  } finally {
    if (original) Object.defineProperty(globalThis, 'Path2D', original);
    else Reflect.deleteProperty(globalThis, 'Path2D');
  }
}

// Reference hash captured from the unmodified f15b7de painter, not regenerated
// from the optimized implementation; it protects all 64 complete draw sequences.
const LEGACY_PAINT_SHA256 = 'f0d519471cecbfba558db66485fc1162801fd47962f3606ce23b700b07138f56';

test('塔与太极64种状态的路径、边界、透明度和层次保持原始绘制；无Path2D时正常回退', () => {
  const scenarios = cases();
  const fallback = withPath(undefined, () =>
    scenarios.map(({ zone, time, reduced }) => capture(zone, time, reduced)),
  );
  assert.equal(
    createHash('sha256').update(JSON.stringify(fallback)).digest('hex'),
    LEGACY_PAINT_SHA256,
  );
  const native = withPath(TracePath, () =>
    scenarios.map(({ zone, time, reduced }) => capture(zone, time, reduced)),
  );
  assert.deepEqual(native, fallback, '惰性Path2D保留各条独立描边、剪裁、矩阵和最终默认路径');
});

test('固定Path2D惰性复用，太极半径最多缓存16种；新上下文无需重建独立几何', () =>
  withPath(TracePath, () => {
    const shape = cases().find((c) => c.zone.kind === 'vortex' && c.zone.delay === 0)!;
    const zone = { ...shape.zone, radius: 1000.25 };
    const before = TracePath.created;
    capture(zone, 10, false);
    assert.equal(TracePath.created - before, 36);
    const warmed = TracePath.created;
    for (let i = 0; i < 50; i++) capture(zone, i / 10, i % 2 === 0);
    assert.equal(TracePath.created, warmed, '时间/减少动态变化不创建新笔画或纹理');
    for (let i = 1; i <= 16; i++) capture({ ...zone, radius: zone.radius + i }, 10, false);
    const full = TracePath.created;
    capture({ ...zone, radius: zone.radius + 16 }, 10, false);
    assert.equal(TracePath.created, full, '最近半径仍复用');
    capture(zone, 10, false);
    assert.equal(TracePath.created - full, 36, '第17种半径后最早一组已被驱逐');
    const pagoda = cases().find((c) => c.zone.kind === 'pagoda')!;
    capture(pagoda.zone, 10, false);
    const pagodaWarmed = TracePath.created;
    capture({ ...pagoda.zone, castEvolved: true, radius: 500 }, 20, true);
    assert.equal(TracePath.created, pagodaWarmed, '塔的六条固定笔画跨形态、半径与上下文共享');
  }));
