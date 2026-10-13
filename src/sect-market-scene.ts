import { assetUrl } from './asset-url.ts';
import { PLAYER_IMAGES, playerSpriteBackground } from './player-appearance.ts';
import {
  MARKET_WIDTH,
  MARKET_HEIGHT,
  MARKET_BUILDINGS,
  marketCharacters,
  marketRelation,
  type MarketCultivator,
} from './sect-market-data.ts';
import { moveInSectMarket, nearbyMarketCultivator } from './sect-market.ts';
import { realmInfo, type SaveData } from './progress.ts';
import { FINAL_TRIAL_STAGE } from './data.ts';
import type { TownPoint } from './town.ts';
import { AUCTION_SPOT } from './auction-data.ts';
import {
  marketCamera,
  marketVisitorPosition,
  MARKET_SCENE_PADDING,
  MARKET_SCENE_WIDTH,
  MARKET_SCENE_HEIGHT,
} from './market-roaming.ts';
import { marketBuildingArt } from './market-art.ts';
import { marketFellowCharacter } from './market-fellow.ts';

const IMAGES = [
  '/assets/town-ground.webp',
  '/assets/sect-market-buildings.webp',
  '/assets/town-props.webp',
  ...Object.values(PLAYER_IMAGES),
];

// 坊市采用独立建筑图集，复用地面、景物与修士；不改青岚镇。
export class SectMarketScene {
  ready = false;
  private events = new AbortController();
  private observer: ResizeObserver;
  private keys = new Set<string>();
  private pointer: { id: number; x: number; y: number } | null = null;
  private touch = { x: 0, y: 0 };
  private enabled = false;
  private last = 0;
  private walkingSeconds = 0;
  private visitorNodes: Array<{ npc: MarketCultivator; node: HTMLElement; marker: Element }> = [];
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
    private save: SaveData,
    private interact: (npc: MarketCultivator) => void,
    private openAuction: () => void = () => {},
  ) {
    this.residents = marketCharacters(save.mortal.population!, save.mortal.sectMarket!);
    const fellow = marketFellowCharacter(save);
    if (fellow) this.residents.push(fellow);
    for (const n of this.residents) if (n.roaming) Object.assign(n, marketVisitorPosition(n, 0));
    const realm = realmInfo(save.cultivation, save.completed.includes(FINAL_TRIAL_STAGE)).index;
    host.innerHTML = `<div class="town-map sect-market-map" aria-hidden="true" style="width:${MARKET_SCENE_WIDTH}px;height:${MARKET_SCENE_HEIGHT}px">${[
      [140, 260],
      [480, 240],
      [1060, 250],
      [1630, 240],
      [2090, 270],
      [160, 710],
      [170, 1200],
      [180, 1580],
      [2050, 730],
      [2070, 1170],
      [2040, 1590],
      [570, 1640],
      [1120, 1650],
      [1570, 1640],
    ]
      .map(
        ([x, y]) =>
          `<div class="town-prop market-tree market-border-tree" style="left:${x}px;top:${y}px;width:210px;height:210px;background-position:0 0"></div>`,
      )
      .join(
        '',
      )}<div class="market-world" style="left:${MARKET_SCENE_PADDING}px;top:${MARKET_SCENE_PADDING}px;width:${MARKET_WIDTH}px;height:${MARKET_HEIGHT}px"><div class="market-lane horizontal" style="left:285px;top:490px;width:1040px;height:205px"></div><div class="market-lane vertical" style="left:655px;top:330px;width:335px;height:700px"></div><div class="market-lane horizontal" style="left:410px;top:865px;width:830px;height:150px"></div><div class="market-lane vertical" style="left:1160px;top:610px;width:120px;height:340px"></div>${MARKET_BUILDINGS.map((b) => `<div class="town-building market-shop" style="left:${b.x}px;top:${b.y}px;z-index:${b.y};width:260px;height:260px;${marketBuildingArt(b.art)}"><span class="town-building-caption">${b.label}</span></div>`).join('')}${[
      [255, 265, 190],
      [1380, 430, 160],
      [150, 1040, 145],
      [1220, 1000, 140],
    ]
      .map(
        ([x, y, size]) =>
          `<div class="town-prop market-tree" style="left:${x}px;top:${y}px;width:${size}px;height:${size}px;z-index:${y};background-position:0 0"></div>`,
      )
      .join(
        '',
      )}<div class="town-prop market-lanterns" style="left:800px;top:458px;width:220px;height:220px;z-index:458;background-position:100% 0"></div><div class="sect-market-auction-sign" style="left:${AUCTION_SPOT.x}px;top:${AUCTION_SPOT.y + 44}px"><small>门前入席 · 丹药法宝</small></div><div class="town-player" style="background:${playerSpriteBackground(save.path)}"><span>你</span></div>${this.residents.map((npc) => `<div class="sect-market-npc ${npc.roaming ? 'market-visitor' : 'market-trader'}" data-market-npc="${npc.id}" style="left:${npc.x}px;top:${npc.y}px;z-index:${npc.y}"><span class="sect-market-npc-art" style="background:${playerSpriteBackground(npc.path)}"></span><span class="sect-market-npc-name">${npc.name}<small>${marketRelation(npc.realmIndex, realm)} · ${npc.realm}<br>${npc.role}</small></span></div>`).join('')}</div></div><svg class="town-minimap" viewBox="0 0 ${MARKET_WIDTH} ${MARKET_HEIGHT}" aria-label="宗门坊市方位图"><rect width="${MARKET_WIDTH}" height="${MARKET_HEIGHT}" fill="#253b2d"/>${MARKET_BUILDINGS.map((b) => `<rect x="${b.x - 130}" y="${b.y - 260}" width="260" height="260" fill="#65745c"/>`).join('')}${this.residents.map((n) => `<circle data-market-marker="${n.id}" cx="${n.x}" cy="${n.y}" r="${n.roaming ? 18 : 28}" fill="${n.roaming ? '#a5bca0' : '#dbc17a'}"/>`).join('')}<rect x="${AUCTION_SPOT.x - 25}" y="${AUCTION_SPOT.y - 25}" width="50" height="50" fill="#f1db9a"/><circle class="town-map-marker" r="28" fill="#fff" stroke="#315e41" stroke-width="10"/></svg><div class="town-loading" role="status"><div>宗门坊市 · 同道将至<progress max="${IMAGES.length}" value="0" aria-label="坊市加载进度"></progress><small class="town-load-progress">0%</small></div></div>`;
    this.map = host.querySelector('.sect-market-map')!;
    this.player = host.querySelector('.town-player')!;
    this.visitorNodes = this.residents
      .filter((n) => n.roaming)
      .map((npc) => ({
        npc,
        node: host.querySelector(`[data-market-npc="${npc.id}"]`)!,
        marker: host.querySelector(`[data-market-marker="${npc.id}"]`)!,
      }));
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
    window.addEventListener(
      'blur',
      () => {
        this.last = 0;
        this.enabled = false;
        this.clearInput();
      },
      options,
    );
    document.addEventListener(
      'visibilitychange',
      () => {
        this.last = 0;
        this.enabled = false;
        this.clearInput();
      },
      options,
    );
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
    const id = nearbyMarketCultivator(this.position, this.residents);
    return this.residents.find((npc) => npc.id === id);
  }
  get nearAuction() {
    return Math.hypot(this.position.x - AUCTION_SPOT.x, this.position.y - AUCTION_SPOT.y) <= 145;
  }
  update(now: number, enabled: boolean) {
    this.refreshFellow();
    const dt = this.last && this.enabled && enabled ? Math.min(0.1, (now - this.last) / 1000) : 0;
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
    if (this.enabled) {
      this.walkingSeconds += dt;
      for (const { npc, node, marker } of this.visitorNodes) {
        const point = marketVisitorPosition(npc, this.walkingSeconds);
        Object.assign(npc, point);
        node.style.left = `${point.x}px`;
        node.style.top = `${point.y}px`;
        node.style.zIndex = String(Math.round(point.y));
        node.classList.toggle('walking', point.moving);
        marker.setAttribute('cx', String(point.x));
        marker.setAttribute('cy', String(point.y));
      }
    }
    const near = this.nearbyNpc;
    const nearId = this.nearAuction ? 'auction' : (near?.id ?? '');
    if (this.nearbyId !== nearId || !this.host.dataset.initialized) {
      this.nearbyId = nearId;
      this.host.dataset.initialized = 'true';
      const button = document.querySelector<HTMLButtonElement>('[data-action="sect-market-talk"]');
      if (button) {
        button.disabled = !nearId;
        button.textContent = this.nearAuction
          ? '进入拍卖行'
          : near
            ? `与${near.name}交谈`
            : '走近可互动';
      }
      this.host
        .querySelectorAll<HTMLElement>('.sect-market-npc')
        .forEach((node) => node.classList.toggle('nearby', node.dataset.marketNpc === near?.id));
    }
    const { scale, x, y } = marketCamera(this.width, this.height, this.position);
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
    if (!this.enabled) return;
    if (this.nearAuction) this.openAuction();
    else if (this.nearbyNpc) this.interact(this.nearbyNpc);
  }
  private refreshFellow() {
    // 仍在坊市闲逛时也会跨年；只更新这位故人的身份与境界，不重绘场景或换批。
    const npc = this.residents.find((n) => n.id === 'market-fellow');
    const current = marketFellowCharacter(this.save);
    if (
      !npc ||
      !current ||
      (npc.generation === current.generation && npc.realmIndex === current.realmIndex)
    )
      return;
    Object.assign(npc, current);
    const label = this.host.querySelector(
      '[data-market-npc="market-fellow"] .sect-market-npc-name',
    );
    const realm = realmInfo(
      this.save.cultivation,
      this.save.completed.includes(FINAL_TRIAL_STAGE),
    ).index;
    if (label)
      label.innerHTML = `${npc.name}<small>${marketRelation(npc.realmIndex, realm)} · ${npc.realm}<br>${npc.role}</small>`;
    this.nearbyId = '';
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
