import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.ts';
import { freshSave, realmCost } from '../src/progress.ts';
import { drawPlayerFormation } from '../src/player-formation.ts';

test('阵纹境界沿用战斗结算境界，覆盖九个大境界与真仙门槛', () => {
  let cultivation = 0;
  for (let step = 0; step <= 24; step++) {
    const save = freshSave();
    save.cultivation = cultivation;
    save.completed = [6];
    const game = new Game(save, 0, 0, () => 0.5);
    assert.equal(game.realmIndex, Math.floor(step / 3));
    // 即使存档修为外部变化，绘制不越过战斗尚未结算的境界。
    save.cultivation += 1e9;
    assert.equal(game.realmIndex, Math.floor(step / 3));
    cultivation += realmCost(step);
  }
  const save = freshSave();
  save.cultivation = 1e9;
  assert.equal(new Game(save, 0, 0).realmIndex, 7);
});

test('所有境界阵纹留在原脚下范围，并平衡画布状态', () => {
  for (let realm = 0; realm < 9; realm++) {
    let saves = 0;
    let strokes = 0;
    const point = (x: number, y: number) => assert.ok(Math.hypot(x, y) <= 29.001);
    const context = {
      save() {
        saves++;
      },
      restore() {
        saves--;
        assert.ok(saves >= 0);
      },
      translate() {},
      rotate() {},
      beginPath() {},
      moveTo: point,
      lineTo: point,
      quadraticCurveTo(cx: number, cy: number, x: number, y: number) {
        point(cx, cy);
        point(x, y);
      },
      arc(x: number, y: number, radius: number) {
        assert.ok(Math.hypot(x, y) + radius <= 29.001);
      },
      stroke() {
        strokes++;
      },
      fill() {},
    } as unknown as CanvasRenderingContext2D;
    drawPlayerFormation(context, 100, 200, realm, 30);
    assert.equal(saves, 0);
    assert.ok(strokes > 4);
  }
});
