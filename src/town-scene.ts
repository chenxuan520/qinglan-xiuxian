import { assetUrl } from './asset-url.ts';
import { spriteStyle } from './sprites.ts';
import {
  TOWN_NPCS,
  TOWN_WIDTH,
  TOWN_HEIGHT,
  TOWN_STREETS,
  TOWN_BUILDINGS,
  TOWN_PROPS,
  moveInTown,
  nearbyTownNpc,
  type TownPoint,
  type TownNpc,
} from './town.ts';

const TOWN_IMAGES = [
  'town-ground.webp',
  'town-buildings.webp',
  'town-props.webp',
  'town-npcs.webp',
  'characters.webp',
];

export class TownScene {
  ready = false;
  private enabled = false;
  private keys = new Set<string>();
  private pointer: { id: number; x: number; y: number } | null = null;
  private touch = { x: 0, y: 0 };
  private last = 0;
  private width = 0;
  private height = 0;
  private observer: ResizeObserver;
  private events = new AbortController();
  private map: HTMLElement;
  private player: HTMLElement;
  private nearby?: TownNpc;
  private lastTransform = '';

  constructor(
    private host: HTMLElement,
    public position: TownPoint,
    private interact: (npc: TownNpc) => void,
  ) {
    host.innerHTML = `<div class="town-map" aria-hidden="true" style="width:${TOWN_WIDTH}px;height:${TOWN_HEIGHT}px"><div class="town-water"></div>${TOWN_STREETS.map(([x, y, right, bottom]) => `<div class="town-street ${x >= 3150 ? 'town-dock' : ''}" style="left:${x}px;top:${y}px;width:${right - x}px;height:${bottom - y}px"></div>`).join('')}${TOWN_BUILDINGS.map((b) => `<div class="town-building" style="left:${b.x}px;top:${b.y}px;z-index:${b.y - 20};background-position:${(b.art % 3) * 50}% ${Math.floor(b.art / 3) * 50}%;filter:hue-rotate(${b.tint}deg)">${b.art === 1 || b.art === 4 ? '<i class="town-smoke"></i>' : ''}</div>`).join('')}${TOWN_PROPS.map(
      (p) => {
        // 渔船横向跨过规则格子边界，按实际取景避免栈桥串入船头碎片。
        const x = p.art === 4 ? 600 : (p.art % 3) * 512;
        const width = p.art === 3 ? 600 : p.art === 4 ? 424 : 512;
        return `<div class="town-prop" style="left:${p.x}px;top:${p.y}px;width:${p.size}px;height:${(p.size * 512) / width}px;z-index:${p.art === 4 ? 0 : p.y - 30};background-size:${(1536 / width) * 100}% 200%;background-position:${(x / (1536 - width)) * 100}% ${Math.floor(p.art / 3) * 100}%;transform:translate(-50%,-50%) rotate(${p.rotation}deg)"></div>`;
      },
    ).join(
      '',
    )}${[650, 1250, 1850].flatMap((y, row) => [300, 900, 1800, 2750].map((x, col) => `<div class="town-citizen" style="left:${x}px;top:${y + 35}px;z-index:${y + 35};animation-delay:-${row * 3 + col * 4}s;animation-duration:${18 + col * 3}s"><span class="town-npc-art" style="background-position:${(col % 3) * 50}% ${row * 50}%;filter:saturate(${0.7 + col * 0.1}) brightness(${0.9 + row * 0.05})"></span></div>`)).join('')}<div class="town-player" style="${spriteStyle(0)}"><span>你</span></div>${TOWN_NPCS.map((npc) => `<div class="town-npc" data-npc="${npc.id}" style="left:${npc.x}px;top:${npc.y}px;z-index:${npc.y}"><span class="town-npc-art" style="background-position:${(npc.art % 3) * 50}% ${Math.floor(npc.art / 3) * 50}%"></span><span class="town-npc-name">${npc.place}<small>${npc.name}</small></span></div>`).join('')}</div><svg class="town-minimap" viewBox="0 0 ${TOWN_WIDTH} ${TOWN_HEIGHT}" aria-label="青岚镇方位图"><rect width="3600" height="2500" fill="#253b2d"/><rect x="3180" width="420" height="2500" fill="#315658"/>${TOWN_STREETS.map(([x, y, r, b]) => `<rect x="${x}" y="${y}" width="${r - x}" height="${b - y}" fill="#8b8d72"/>`).join('')}${TOWN_NPCS.map((n) => `<circle cx="${n.x}" cy="${n.y}" r="37" fill="#dbc17a"/>`).join('')}<circle class="town-map-marker" r="45" fill="#fff" stroke="#315e41" stroke-width="16"/></svg><div class="town-loading" role="status"><div>青岚镇 · 街巷铺展中<progress max="${TOWN_IMAGES.length}" value="0" aria-label="城镇加载进度"></progress><small class="town-load-progress">0%</small></div></div>`;
    this.map = host.querySelector('.town-map')!;
    this.player = host.querySelector('.town-player')!;
    this.observer = new ResizeObserver(() => {
      this.width = host.clientWidth;
      this.height = host.clientHeight;
      this.lastTransform = '';
      this.clearInput();
    });
    this.observer.observe(host);
    const options = { signal: this.events.signal };
    document.addEventListener(
      'keydown',
      (e) => {
        if (!this.enabled || (e.target as HTMLElement).matches('input, textarea')) return;
        const key = e.key.toLowerCase();
        if (['w', 'a', 's', 'd', 'arrowup', 'arrowleft', 'arrowdown', 'arrowright'].includes(key)) {
          e.preventDefault();
          this.keys.add(key);
        }
        if (key === 'e' && !e.repeat && this.nearby) {
          e.preventDefault();
          this.interact(this.nearby);
        }
      },
      options,
    );
    document.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()), options);
    window.addEventListener('blur', () => this.clearInput(), options);
    host.addEventListener(
      'pointerdown',
      (e) => {
        if (!this.enabled || this.pointer) return;
        e.preventDefault();
        host.focus({ preventScroll: true });
        this.pointer = { id: e.pointerId, x: e.clientX, y: e.clientY };
        host.setPointerCapture(e.pointerId);
      },
      options,
    );
    host.addEventListener(
      'pointermove',
      (e) => {
        if (this.pointer?.id !== e.pointerId) return;
        this.touch = { x: (e.clientX - this.pointer.x) / 45, y: (e.clientY - this.pointer.y) / 45 };
      },
      options,
    );
    for (const event of ['pointerup', 'pointercancel', 'lostpointercapture'])
      host.addEventListener(
        event,
        () => {
          this.pointer = null;
          this.touch = { x: 0, y: 0 };
        },
        options,
      );
    let loaded = 0;
    Promise.all(
      TOWN_IMAGES.map(
        (name) =>
          new Promise<void>((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
              if (!this.events.signal.aborted) {
                const bar = host.querySelector<HTMLProgressElement>('.town-loading progress');
                if (bar) bar.value = ++loaded;
                const label = host.querySelector('.town-load-progress');
                if (label)
                  label.textContent = `${Math.round((loaded / TOWN_IMAGES.length) * 100)}% · ${loaded} / ${TOWN_IMAGES.length} 项资源`;
              }
              resolve();
            };
            img.onerror = reject;
            img.src = assetUrl(`assets/${name}`);
          }),
      ),
    )
      .then(() => {
        if (this.events.signal.aborted) return;
        this.ready = true;
        host.querySelector('.town-loading')?.remove();
      })
      .catch(() => {
        if (this.events.signal.aborted) return;
        host.querySelector('.town-loading')!.innerHTML =
          '<div>城镇素材加载失败，当前不计龄。<br><button class="secondary-button" data-action="town-retry">重新加载</button></div>';
      });
  }
  private clearInput() {
    this.keys.clear();
    this.touch = { x: 0, y: 0 };
    this.pointer = null;
  }
  update(now: number, enabled: boolean) {
    const dt = this.last ? (now - this.last) / 1000 : 0;
    this.last = now;
    this.enabled = enabled && this.ready;
    this.host.classList.toggle('town-paused', !this.enabled);
    if (!this.enabled) this.clearInput();
    else
      this.position = moveInTown(
        this.position,
        {
          x:
            Number(this.keys.has('d') || this.keys.has('arrowright')) -
            Number(this.keys.has('a') || this.keys.has('arrowleft')) +
            this.touch.x,
          y:
            Number(this.keys.has('s') || this.keys.has('arrowdown')) -
            Number(this.keys.has('w') || this.keys.has('arrowup')) +
            this.touch.y,
        },
        dt,
      );
    const near = nearbyTownNpc(this.position);
    if (this.nearby !== near) {
      this.nearby = near;
      const button = document.querySelector<HTMLButtonElement>('[data-action="town-talk"]');
      if (button) {
        button.disabled = !near;
        button.textContent = near ? `与${near.name}交谈 · E` : '走近镇民可交谈';
      }
      this.host
        .querySelectorAll<HTMLElement>('.town-npc')
        .forEach((n) => n.classList.toggle('nearby', n.dataset.npc === near?.id));
    }
    const scale = Math.max(0.68, Math.min(1, this.width / 1100));
    const x = Math.max(
      Math.min(0, this.width - TOWN_WIDTH * scale),
      Math.min(0, this.width / 2 - this.position.x * scale),
    );
    const y = Math.max(
      Math.min(0, this.height - TOWN_HEIGHT * scale),
      Math.min(0, this.height / 2 - this.position.y * scale),
    );
    const transform = `translate(${x}px,${y}px) scale(${scale})`;
    if (transform !== this.lastTransform) {
      this.map.style.transform = transform;
      this.lastTransform = transform;
    }
    this.player.style.left = `${this.position.x}px`;
    this.player.style.top = `${this.position.y}px`;
    this.player.style.zIndex = `${Math.round(this.position.y)}`;
    const marker = this.host.querySelector('.town-map-marker');
    marker?.setAttribute('cx', String(this.position.x));
    marker?.setAttribute('cy', String(this.position.y));
    this.host.dataset.x = this.position.x.toFixed(1);
    this.host.dataset.y = this.position.y.toFixed(1);
  }
  talk() {
    if (this.enabled && this.nearby) this.interact(this.nearby);
  }
  destroy() {
    this.events.abort();
    this.observer.disconnect();
    this.clearInput();
  }
}
