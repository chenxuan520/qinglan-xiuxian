import type { TownPoint } from './town.ts';

export const SETTLEMENT_PATHS = {
  town: {
    gate: { x: 1740, y: 90 },
    arrival: { x: 1740, y: 245 },
    labelY: 230,
    name: '宗门坊市',
    arrow: '↑',
  },
  market: {
    gate: { x: 800, y: 1360 },
    arrival: { x: 800, y: 1210 },
    labelY: 1240,
    name: '青岚镇',
    arrow: '↓',
  },
} as const;

// 路牌和落点都用地图坐标；一次靠近只尝试转场一次，保存失败后可退开重试。
export class SettlementPassage {
  private entered = false;
  private open: () => boolean;
  private enter: (entry?: 'button') => void;
  private button?: HTMLButtonElement;
  private path: (typeof SETTLEMENT_PATHS)[keyof typeof SETTLEMENT_PATHS];
  constructor(
    host: HTMLElement,
    map: HTMLElement,
    source: keyof typeof SETTLEMENT_PATHS,
    open: () => boolean,
    enter: (entry?: 'button') => void,
  ) {
    this.path = SETTLEMENT_PATHS[source];
    this.open = open;
    this.enter = enter;
    const exit = host
      .closest?.('.town-scene')
      ?.querySelector<HTMLButtonElement>(
        `[data-action="${source === 'town' ? 'town-exit' : 'sect-market-exit'}"]`,
      );
    if (exit) {
      const button = document.createElement('button');
      button.className = 'secondary-button settlement-shortcut';
      button.type = 'button';
      button.dataset.destination = source === 'town' ? 'market' : 'town';
      button.textContent = source === 'town' ? '前往坊市' : '前往小镇';
      button.disabled = true;
      button.onclick = () => {
        if (!button.disabled && this.open()) this.enter('button');
      };
      exit.before(button);
      exit.parentElement?.classList.add('settlement-actions');
      this.button = button;
    }
    const sign = document.createElement('div');
    sign.className = 'town-passage';
    sign.dataset.passage = source;
    sign.style.left = `${this.path.gate.x}px`;
    sign.style.top = `${this.path.labelY}px`;
    sign.innerHTML = `<strong>${this.path.arrow} ${this.path.name}</strong><small>${open() ? '沿路走入 · 自动前往' : '踏入炼气后通行'}</small>`;
    map.append(sign);
    const marker = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    marker.setAttribute('x', String(this.path.gate.x));
    marker.setAttribute('y', String(this.path.gate.y));
    marker.setAttribute('fill', '#fff1bd');
    marker.setAttribute('font-size', source === 'town' ? '180' : '100');
    marker.setAttribute('text-anchor', 'middle');
    marker.textContent = source === 'town' ? '坊' : '镇';
    host.querySelector('.town-minimap')?.append(marker);
  }
  update(position: TownPoint, enabled: boolean) {
    if (this.button) {
      this.button.disabled = !enabled || !this.open();
      this.button.title = this.open() ? '' : '获得修为后可前往坊市';
    }
    const distance = Math.hypot(position.x - this.path.gate.x, position.y - this.path.gate.y);
    if (distance > 80) this.entered = false;
    if (!enabled || distance > 48 || this.entered || !this.open()) return;
    this.entered = true;
    this.enter();
  }

  destroy() {
    this.button?.parentElement?.classList.remove('settlement-actions');
    this.button?.remove();
  }
}
