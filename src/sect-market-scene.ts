import { assetUrl } from './asset-url.ts';
import { PLAYER_IMAGES, playerSpriteBackground } from './player-appearance.ts';
import {
  MARKET_WIDTH,
  MARKET_HEIGHT,
  MARKET_BUILDINGS,
  marketCultivators,
  marketRelation,
  type MarketCultivator,
} from './sect-market-data.ts';
import { moveInSectMarket, nearbyMarketCultivator } from './sect-market.ts';
import { realmInfo, type SaveData } from './progress.ts';
import { FINAL_TRIAL_STAGE } from './data.ts';
import type { TownPoint } from './town.ts';

const IMAGES = [
  '/assets/town-ground.webp',
  '/assets/sects-orthodox.webp',
  '/assets/sects-demonic.webp',
  ...Object.values(PLAYER_IMAGES),
];

// 独立场地复用地面、宗门和修士图片，不改青岚镇的居民、布局或离乡路线。
export class SectMarketScene {
  ready = false;
  private events = new AbortController();
  private observer: ResizeObserver;
  private keys = new Set<string>();
  private pointer: { id: number; x: number; y: number } | null = null;
  private touch = { x: 0, y: 0 };
  private enabled = false;
  private last = 0;
  private width = 0;
  private height = 0;
  private map: HTMLElement;
  private player: HTMLElement;
  private residents: MarketCultivator[];
  private lastTransform = '';
  private nearbyId = '';

  constructor(
    private host: HTMLElement,
    public position: TownPoint,
    save: SaveData,
    private interact: (npc: MarketCultivator) => void,
  ) {
    this.residents = marketCultivators(save.mortal.population!, save.mortal.sectMarket!);
    const realm = realmInfo(save.cultivation, save.completed.includes(FINAL_TRIAL_STAGE)).index;
    host.innerHTML = `<div class="town-map sect-market-map" aria-hidden="true" style="width:${MARKET_WIDTH}px;height:${MARKET_HEIGHT}px">${MARKET_BUILDINGS.map((b) => `<div class="sect-market-building ${b.school}" style="left:${b.x}px;top:${b.y}px;z-index:${b.y}"></div>`).join('')}<div class="town-player" style="background:${playerSpriteBackground(save.path)}"><span>你</span></div>${this.residents.map((npc) => `<div class="sect-market-npc" data-market-npc="${npc.id}" style="left:${npc.x}px;top:${npc.y}px;z-index:${npc.y}"><span class="sect-market-npc-art" style="background:${playerSpriteBackground(npc.path)}"></span><span class="sect-market-npc-name">${npc.name}<small>${marketRelation(npc.realmIndex, realm)} · ${npc.realm}<br>${npc.role}</small></span></div>`).join('')}</div><svg class="town-minimap" viewBox="0 0 ${MARKET_WIDTH} ${MARKET_HEIGHT}" aria-label="宗门坊市方位图"><rect width="${MARKET_WIDTH}" height="${MARKET_HEIGHT}" fill="#253b2d"/>${MARKET_BUILDINGS.map((b) => `<rect x="${b.x - 130}" y="${b.y - 260}" width="260" height="260" fill="#65745c"/>`).join('')}${this.residents.map((n) => `<circle cx="${n.x}" cy="${n.y}" r="28" fill="#dbc17a"/>`).join('')}<circle class="town-map-marker" r="28" fill="#fff" stroke="#315e41" stroke-width="10"/></svg><div class="town-loading" role="status"><div>宗门坊市 · 同道将至<progress max="${IMAGES.length}" value="0" aria-label="坊市加载进度"></progress><small class="town-load-progress">0%</small></div></div>`;
    this.map = host.querySelector('.sect-market-map')!;
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
        if (!this.enabled || (e.target as HTMLElement).matches('input, textarea, select')) return;
        const key = e.key.toLowerCase();
        if (['w', 'a', 's', 'd', 'arrowup', 'arrowleft', 'arrowdown', 'arrowright'].includes(key)) {
          e.preventDefault();
          this.keys.add(key);
        }
        if (key === 'e' && !e.repeat) {
          e.preventDefault();
          this.talk();
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
      host.addEventListener(event, () => this.clearPointer(), options);
    let loaded = 0;
    Promise.all(
      IMAGES.map(
        (url) =>
          new Promise<void>((resolve, reject) => {
            const image = new Image();
            image.onload = () => {
              if (!this.events.signal.aborted) {
                const bar = host.querySelector<HTMLProgressElement>('.town-loading progress');
                if (bar) bar.value = ++loaded;
                const progress = host.querySelector('.town-load-progress');
                if (progress)
                  progress.textContent = `${Math.round((loaded / IMAGES.length) * 100)}% · ${loaded} / ${IMAGES.length} 项资源`;
              }
              resolve();
            };
            image.onerror = reject;
            image.src = assetUrl(url);
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
          '<div>坊市素材加载失败，当前不计龄。<br><button class="secondary-button" data-action="sect-market-retry">重新加载</button></div>';
      });
  }
  get nearbyNpc() {
    const id = nearbyMarketCultivator(this.position);
    return this.residents.find((npc) => npc.id === id);
  }
  update(now: number, enabled: boolean) {
    const dt = this.last ? (now - this.last) / 1000 : 0;
    this.last = now;
    this.enabled = enabled && this.ready;
    this.host.classList.toggle('town-paused', !this.enabled);
    if (!this.enabled) this.clearInput();
    else
      this.position = moveInSectMarket(
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
    const near = this.nearbyNpc;
    if (this.nearbyId !== (near?.id ?? '') || !this.host.dataset.initialized) {
      this.nearbyId = near?.id ?? '';
      this.host.dataset.initialized = 'true';
      const button = document.querySelector<HTMLButtonElement>('[data-action="sect-market-talk"]');
      if (button) {
        button.disabled = !near;
        button.textContent = near ? `与${near.name}交谈` : '走近修士可交谈';
      }
      this.host
        .querySelectorAll<HTMLElement>('.sect-market-npc')
        .forEach((node) => node.classList.toggle('nearby', node.dataset.marketNpc === near?.id));
    }
    const scale = Math.max(0.68, Math.min(1, this.width / 1100));
    const x = Math.max(
      Math.min(0, this.width - MARKET_WIDTH * scale),
      Math.min(0, this.width / 2 - this.position.x * scale),
    );
    const y = Math.max(
      Math.min(0, this.height - MARKET_HEIGHT * scale),
      Math.min(0, this.height / 2 - this.position.y * scale),
    );
    const transform = `translate(${x}px,${y}px) scale(${scale})`;
    if (transform !== this.lastTransform) {
      this.map.style.transform = transform;
      this.lastTransform = transform;
    }
    this.player.style.left = `${this.position.x}px`;
    this.player.style.top = `${this.position.y}px`;
    this.player.style.zIndex = String(Math.round(this.position.y));
    const marker = this.host.querySelector('.town-map-marker');
    marker?.setAttribute('cx', String(this.position.x));
    marker?.setAttribute('cy', String(this.position.y));
    this.host.dataset.x = this.position.x.toFixed(1);
    this.host.dataset.y = this.position.y.toFixed(1);
  }
  talk() {
    if (this.enabled && this.nearbyNpc) this.interact(this.nearbyNpc);
  }
  private clearPointer() {
    this.pointer = null;
    this.touch = { x: 0, y: 0 };
  }
  private clearInput() {
    this.keys.clear();
    this.clearPointer();
  }
  destroy() {
    this.events.abort();
    this.observer.disconnect();
    this.clearInput();
  }
}
