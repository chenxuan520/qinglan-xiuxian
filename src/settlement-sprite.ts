import type { TownPoint } from './town.ts';

export type SettlementViewport = {
  width: number;
  height: number;
  scale: number;
  x: number;
  y: number;
};

// 留足立绘和名字的边缘余量；只裁掉视觉节点，人物的移动、身份与交互仍照常计算。
export function settlementSpriteVisible(point: TownPoint, view: SettlementViewport) {
  const x = point.x * view.scale + view.x;
  const y = point.y * view.scale + view.y;
  return x >= -200 && x <= view.width + 200 && y >= -200 && y <= view.height + 200;
}

// 角色脚点保持原坐标与层级，移动只写 transform，不逐帧改 left/top 触发布局。
export class SettlementSprite {
  private element: HTMLElement;
  private x = NaN;
  private y = NaN;
  private depth = NaN;
  constructor(element: HTMLElement, point: TownPoint) {
    this.element = element;
    element.style.left = '0px';
    element.style.top = '0px';
    this.move(point);
  }
  show(visible: boolean) {
    const revealed = visible && this.element.hidden;
    if (this.element.hidden === visible) this.element.hidden = !visible;
    return revealed;
  }
  move(point: TownPoint) {
    if (point.x !== this.x || point.y !== this.y) {
      this.element.style.transform = `translate(${point.x}px,${point.y}px) translate(-50%,-100%)`;
      this.x = point.x;
      this.y = point.y;
    }
    const depth = Math.round(point.y);
    if (depth !== this.depth) {
      this.element.style.zIndex = String(depth);
      this.depth = depth;
    }
  }
}
