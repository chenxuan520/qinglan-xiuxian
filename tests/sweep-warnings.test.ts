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
    test(`星轨残影同心落后15度、透明度0.25并随轨转动，方向${direction}、角度${angle}`, () => {
      const z = field(angle, direction);
      z.delay = 0;
      for (const dt of [0, 0.4])
        for (const reduced of [false, true]) {
          const copy = structuredClone(z);
          rotateZone(copy, dt);
          const c = recordingCanvas(),
            initial = { ...c.state() };
          drawRegionalField(c.ctx, copy, dt, reduced);
          const ghosts = c.strokes.filter((s) => s.alpha === 0.25);
          assert.equal(ghosts.length, 1);
          const ghost = ghosts[0],
            a = copy.spinAngle! - (direction * Math.PI) / 12;
          assert.equal(ghost.width, 2);
          assert.equal(ghost.color, STAGES[5].color);
          assert.deepEqual(ghost.dash, []);
          assert.equal(ghost.points.length, 2);
          [75, 900].forEach((radius, i) => {
            near(ghost.points[i].x, 35 + Math.cos(a) * radius);
            near(ghost.points[i].y, -20 + Math.sin(a) * radius);
          });
          assert.deepEqual(c.state(), initial);
          assert.equal(c.depth(), 0);
          const warning = recordingCanvas();
          drawRegionalField(warning.ctx, copy, dt, reduced, true);
          assert.ok(!warning.strokes.some((s) => s.alpha === 0.25), '上层不重复叠加残影');
        }
    });
  }
