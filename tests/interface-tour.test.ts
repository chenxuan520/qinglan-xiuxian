import assert from 'node:assert/strict';
import test from 'node:test';
import { TOUR_STEPS, tourPlacement } from '../src/interface-tour-model.ts';

test('导览完整覆盖行前、战斗、升级和结算，不增加游戏动作', () => {
  assert.equal(TOUR_STEPS[0].scene, 'home');
  assert.equal(TOUR_STEPS.at(-1)!.scene, 'result');
  for (const scene of ['settings', 'treasure', 'cultivation', 'medicine', 'battle', 'upgrade'])
    assert.ok(TOUR_STEPS.some((step) => step.scene === scene));
  for (const step of TOUR_STEPS) assert.doesNotMatch(step.copy, /广告/);
});

test('高亮与说明卡在四种视口的边角保持可见，有空位时不相互遮挡', () => {
  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 390, height: 844 },
    { width: 320, height: 640 },
    { width: 844, height: 390 },
  ]) {
    const card = { width: Math.min(310, viewport.width - 24), height: 230 };
    for (const target of [
      { left: 10, top: 10, width: 50, height: 40 },
      { left: viewport.width - 60, top: 20, width: 50, height: 40 },
      { left: 10, top: viewport.height - 60, width: 150, height: 40 },
    ]) {
      const placement = tourPlacement(target, viewport, card);
      const h = placement.hole,
        c = placement.card;
      assert.ok(
        c.x >= 0 &&
          c.y >= 0 &&
          c.x + card.width <= viewport.width &&
          c.y + card.height <= viewport.height,
      );
      assert.ok(
        h.x >= 0 &&
          h.y >= 0 &&
          h.x + h.width <= viewport.width &&
          h.y + h.height <= viewport.height,
      );
      const overlap =
        Math.max(0, Math.min(c.x + card.width, h.x + h.width) - Math.max(c.x, h.x)) *
        Math.max(0, Math.min(c.y + card.height, h.y + h.height) - Math.max(c.y, h.y));
      assert.equal(overlap, 0);
    }
  }
});
