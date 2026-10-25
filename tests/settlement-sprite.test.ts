import test from 'node:test';
import assert from 'node:assert/strict';
import { SettlementSprite, settlementSpriteVisible } from '../src/settlement-sprite.ts';

function element() {
  const writes: string[] = [];
  const style = new Proxy<Record<string, string>>(
    {},
    {
      set(target, key: string, value: string) {
        writes.push(key);
        target[key] = value;
        return true;
      },
    },
  );
  return { node: { hidden: false, style } as unknown as HTMLElement, writes };
}

test('移动保持脚点锚定和前后层级，连续帧只更新合成位移，不重排 left/top', () => {
  const { node, writes } = element();
  const sprite = new SettlementSprite(node, { x: 600, y: 600 });
  writes.length = 0;
  sprite.move({ x: 603.25, y: 600 });
  assert.equal(node.style.transform, 'translate(603.25px,600px) translate(-50%,-100%)');
  assert.deepEqual(writes, ['transform']);
  writes.length = 0;
  sprite.move({ x: 603.25, y: 601.8 });
  assert.equal(node.style.zIndex, '602');
  assert.deepEqual(writes, ['transform', 'zIndex']);
  assert.equal(node.style.left, '0px');
  assert.equal(node.style.top, '0px');
});

test('静止或暂停后重复呈现同一坐标不再写样式；离屏重返仍显示当前真实位置', () => {
  const { node, writes } = element();
  const point = { x: 1200, y: 790 };
  const sprite = new SettlementSprite(node, point);
  writes.length = 0;
  for (let i = 0; i < 120; i++) {
    sprite.show(true);
    sprite.move(point);
  }
  assert.deepEqual(writes, []);
  assert.equal(sprite.show(false), false);
  assert.equal(node.hidden, true);
  assert.equal(node.style.willChange, '');
  assert.equal(sprite.show(true), true);
  assert.equal(node.style.willChange, 'transform');
  sprite.move({ x: 1300, y: 820 });
  assert.equal(node.hidden, false);
  assert.equal(node.style.transform, 'translate(1300px,820px) translate(-50%,-100%)');
  assert.equal(sprite.show(true), false);
});

test('屏外裁剪使用当前镜头与缩放，保留长名字和立绘余量，转屏后可重新显现', () => {
  const point = { x: 1000, y: 790 };
  const view = { x: -1500, y: -1000, scale: 0.68, width: 390, height: 844 };
  assert.equal(settlementSpriteVisible(point, view), false);
  assert.equal(settlementSpriteVisible(point, { ...view, x: -600, y: -100 }), true);
  assert.equal(settlementSpriteVisible({ x: 0, y: 0 }, { ...view, x: -200, y: -200 }), true);
  assert.equal(settlementSpriteVisible({ x: 0, y: 0 }, { ...view, x: -201, y: 0 }), false);
  assert.equal(
    settlementSpriteVisible(point, { ...view, width: 3440, height: 1440, x: 0, y: 0, scale: 1 }),
    true,
  );
});
