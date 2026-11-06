import test from 'node:test';
import assert from 'node:assert/strict';
import type { Point, Zone } from '../src/game-types.ts';
import { STAGES } from '../src/data.ts';
import { rotateZone } from '../src/regional-hazards.ts';
import { drawRegionalField } from '../src/regional-render.ts';

const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);
function recordingCanvas() {
  let state = { x: 0, y: 0, angle: 0, alpha: 1, color: 'initial', width: 5, dash: [] as number[] };
  const stack: (typeof state)[] = [];
  let path: Point[] = [];
  const strokes: {
    points: Point[];
    alpha: number;
    color: string;
    width: number;
    dash: number[];
  }[] = [];
  const ctx = new Proxy(
    {},
    {
      get: (_, key) => {
        if (key === 'save') return () => stack.push({ ...state, dash: [...state.dash] });
        if (key === 'restore')
          return () => {
            state = stack.pop()!;
          };
        if (key === 'translate')
          return (x: number, y: number) => {
            state.x += Math.cos(state.angle) * x - Math.sin(state.angle) * y;
            state.y += Math.sin(state.angle) * x + Math.cos(state.angle) * y;
          };
        if (key === 'rotate')
          return (angle: number) => {
            state.angle += angle;
          };
        if (key === 'setLineDash')
          return (dash: number[]) => {
            state.dash = dash;
          };
        if (key === 'beginPath')
          return () => {
            path = [];
          };
        if (key === 'moveTo' || key === 'lineTo')
          return (x: number, y: number) =>
            path.push({
              x: state.x + Math.cos(state.angle) * x - Math.sin(state.angle) * y,
              y: state.y + Math.sin(state.angle) * x + Math.cos(state.angle) * y,
            });
        if (key === 'stroke')
          return () =>
            strokes.push({
              points: [...path],
              alpha: state.alpha,
              color: state.color,
              width: state.width,
              dash: [...state.dash],
            });
        return () => {};
      },
      set: (_, key, value) => {
        if (key === 'globalAlpha') state.alpha = value;
        if (key === 'strokeStyle') state.color = value;
        if (key === 'lineWidth') state.width = value;
        return true;
      },
    },
  ) as CanvasRenderingContext2D;
  return { ctx, strokes, state: () => state, depth: () => stack.length };
}
function field(angle: number, direction: number): Zone {
  const z: Zone = {
    x: 0,
    y: 0,
    radius: 16,
    damage: 100,
    life: 3,
    maxLife: 3,
    delay: 1,
    tick: 0,
    hostile: true,
    color: STAGES[5].color,
    kind: 'boss-sweep',
    spinCenter: { x: 35, y: -20 },
    spinAngle: angle,
    spinStart: angle,
    spinSpeed: (direction * Math.PI) / 3,
    spinInner: 75,
    spinOuter: 900,
  };
  rotateZone(z);
  return z;
}
for (const direction of [-1, 1])
  for (const angle of [-1.2, 0, 0.7]) {
    test(`星轨预警三箭头在200/350/500处沿旋向切线，方向${direction}、角度${angle}`, () => {
      const c = recordingCanvas(),
        initial = { ...c.state() };
      for (const ray of [angle, angle + Math.PI]) {
        const z = field(ray, direction);
        drawRegionalField(c.ctx, z, 0, true, true);
      }
      const arrows = c.strokes.filter((s) => s.points.length === 9);
      assert.equal(arrows.length, 2);
      const lines = c.strokes.filter((s) => s.dash.length);
      assert.equal(lines.length, 2);
      lines.forEach((stroke, ray) => {
        const a = angle + ray * Math.PI;
        assert.equal(stroke.color, STAGES[5].color);
        assert.equal(stroke.width, 2);
        assert.equal(stroke.alpha, 1);
        assert.deepEqual(stroke.dash, [8, 5]);
        [75, 900].forEach((radius, i) => {
          near(stroke.points[i].x, 35 + Math.cos(a) * radius);
          near(stroke.points[i].y, -20 + Math.sin(a) * radius);
        });
      });
      arrows.forEach((stroke, ray) => {
        const a = angle + ray * Math.PI;
        assert.equal(stroke.color, STAGES[5].color);
        assert.equal(stroke.width, 2);
        assert.equal(stroke.alpha, 1);
        assert.deepEqual(stroke.dash, []);
        [200, 350, 500].forEach((radius, i) => {
          const [left, tip, right] = stroke.points.slice(i * 3, i * 3 + 3);
          near(tip.x, 35 + Math.cos(a) * radius);
          near(tip.y, -20 + Math.sin(a) * radius);
          near(tip.x - (left.x + right.x) / 2, -Math.sin(a) * direction * 10);
          near(tip.y - (left.y + right.y) / 2, Math.cos(a) * direction * 10);
        });
      });
      assert.ok(!c.strokes.some((s) => s.alpha === 0.25));
      assert.deepEqual(c.state(), initial);
      assert.equal(c.depth(), 0);
      const base = recordingCanvas();
      drawRegionalField(base.ctx, field(angle, direction), 0, true);
      assert.equal(base.strokes.length, 0, '预警箭头仅在上层预警绘制一次');
    });
  }

test('生效星轨在底层和上层均无alpha0.25残影，本体和边界仍绘制', () => {
  for (const direction of [-1, 1])
    for (const angle of [-1.2, 0, 0.7])
      for (const dt of [0, 0.4])
        for (const reduced of [false, true])
          for (const warning of [false, true])
            for (const color of [STAGES[5].color, '#e8d69c']) {
              const z = field(angle, direction);
              z.delay = 0;
              z.color = color;
              rotateZone(z, dt);
              const before = structuredClone(z);
              const c = recordingCanvas(),
                initial = { ...c.state() };
              assert.equal(drawRegionalField(c.ctx, z, dt, reduced, warning), true);
              assert.ok(c.strokes.length > 0, '星轨本体或危险边界仍须绘制');
              assert.ok(!c.strokes.some((s) => s.alpha === 0.25), '两层均不绘制淡残影');
              assert.deepEqual(z, before);
              assert.deepEqual(c.state(), initial);
              assert.equal(c.depth(), 0);
            }
});
