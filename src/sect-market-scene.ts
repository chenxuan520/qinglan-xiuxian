import { resourceFailureContent } from './resource-panel.ts';
import { resourceFailed } from './update-check.ts';
import { assetUrl } from './asset-url.ts';
import { PLAYER_IMAGES, playerSpriteBackground } from './player-appearance.ts';
import {
  MARKET_WIDTH,
  MARKET_HEIGHT,
  MARKET_BUILDINGS,
  MARKET_VENUES,
  type MarketVenueId,
  marketCharacters,
  marketRelation,
  marketRealmLabel,
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
import { mapClick, walkRoute } from './walk-navigation.ts';
import { townWalkable, TOWN_WALK_SPEED } from './town.ts';
import { SettlementPassage, SETTLEMENT_PATHS, settlementEntry } from './settlement-passage.ts';

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
  private pointer: {
    id: number;
    x: number;
    y: number;
    target: Element | null;
    moved: boolean;
  } | null = null;
  private touch = { x: 0, y: 0 };
  private clickRoute: TownPoint[] = [];
  private clickTarget: {
    id: string;
    generation?: number;
    kind: 'npc' | 'venue' | 'auction';
  } | null = null;
  private selectedNpc: MarketCultivator | null = null;
  private enabled = false;
  private last = 0;
  private walkingSeconds = 0;
  private visitorNodes: Array<{ npc: MarketCultivator; node: HTMLElement; marker: Element }> = [];
  private width = 0;
  private height = 0;
  private map: HTMLElement;
  private player: HTMLElement;
  private passage?: SettlementPassage;
  private residents: MarketCultivator[];
  private lastTransform = '';
  private nearbyId = '';
  private guidedId = '';

  private host: HTMLElement;
  public position: TownPoint;
  private save: SaveData;
  private interact: (npc: MarketCultivator) => void;
  private openAuction: () => void;
  private openVenue: (id: MarketVenueId) => void;
  constructor(
    host: HTMLElement,
    position: TownPoint,
    save: SaveData,
    interact: (npc: MarketCultivator) => void,
    openAuction: () => void = () => {},
    openVenue: (id: MarketVenueId) => void = () => {},
    returnTown?: (entry?: 'button') => void,
  ) {
    this.host = host;
    this.position = settlementEntry('market', position);
    this.save = save;
    this.interact = interact;
    this.openAuction = openAuction;
    this.openVenue = openVenue;
    this.residents = marketCharacters(save.mortal.population!, save.mortal.sectMarket!);
    const fellow = marketFellowCharacter(save);
    if (fellow) this.residents.push(fellow);
    for (const n of this.residents) if (n.roaming) Object.assign(n, marketVisitorPosition(n, 0));
    const realm = realmInfo(save.cultivation, save.completed.includes(FINAL_TRIAL_STAGE)).index;
    const trees = [
      ...Array.from({ length: 7 }, (_, i) => [180 + i * 400, 270]),
      ...Array.from({ length: 7 }, (_, i) => [180 + i * 400, MARKET_SCENE_HEIGHT - 100]),
      ...Array.from({ length: 4 }, (_, i) => [150, 650 + i * 370]),
      ...Array.from({ length: 4 }, (_, i) => [MARKET_SCENE_WIDTH - 160, 650 + i * 370]),
    ];
    host.innerHTML = `<div class="town-map sect-market-map" aria-hidden="true" style="width:${MARKET_SCENE_WIDTH}px;height:${MARKET_SCENE_HEIGHT}px">${trees.map(([x, y]) => `<div class="town-prop market-tree market-border-tree" style="left:${x}px;top:${y}px;width:210px;height:210px;background-position:0 0"></div>`).join('')}<div class="market-world" style="left:${MARKET_SCENE_PADDING}px;top:${MARKET_SCENE_PADDING}px;width:${MARKET_WIDTH}px;height:${MARKET_HEIGHT}px">${MARKET_BUILDINGS.map((b, i) => `<div data-market-place="${i === 1 ? 'auction' : (MARKET_VENUES.find((v) => v.building === i)?.id ?? '')}" class="town-building market-shop" style="left:${b.x}px;top:${b.y}px;z-index:${b.y};width:260px;height:260px;${marketBuildingArt(b.art)}"><span class="town-building-caption">${b.label}</span></div>`).join('')}${[
      [420, 360, 160],
      [1590, 360, 160],
      [130, 1320, 150],
      [1830, 1320, 150],
      [1500, 1210, 120],
    ]
      .map(
        ([x, y, size]) =>
          `<div class="town-prop market-tree" style="left:${x}px;top:${y}px;width:${size}px;height:${size}px;z-index:${y};background-position:0 0"></div>`,
      )
      .join(
        '',
      )}<div class="town-player" style="background:${playerSpriteBackground(save.path)}"><span>你</span></div>${this.residents.map((npc) => `<div class="sect-market-npc ${npc.roaming ? 'market-visitor' : 'market-trader'}" data-market-npc="${npc.id}" style="left:${npc.x}px;top:${npc.y}px;z-index:${npc.y}"><span class="sect-market-npc-art" style="background:${playerSpriteBackground(npc.path)}"></span><span class="sect-market-npc-name">${npc.name}<small>${marketRelation(npc.realmIndex, realm)} · ${marketRealmLabel(npc, realm)}<br>${npc.role}</small></span></div>`).join('')}</div></div><svg class="town-minimap" viewBox="0 0 ${MARKET_WIDTH} ${MARKET_HEIGHT}" aria-label="宗门坊市方位图"><rect width="${MARKET_WIDTH}" height="${MARKET_HEIGHT}" fill="#253b2d"/>${MARKET_BUILDINGS.map((b) => `<rect x="${b.x - 130}" y="${b.y - 260}" width="260" height="260" fill="#65745c"/>`).join('')}${MARKET_VENUES.map((v) => `<circle cx="${v.x}" cy="${v.y}" r="22" fill="#d3be80"/>`).join('')}${this.residents.map((n) => `<circle data-market-marker="${n.id}" cx="${n.x}" cy="${n.y}" r="${n.roaming ? 18 : 28}" fill="${n.roaming ? '#a5bca0' : '#dbc17a'}"/>`).join('')}<rect x="${AUCTION_SPOT.x - 25}" y="${AUCTION_SPOT.y - 25}" width="50" height="50" fill="#f1db9a"/><circle class="town-map-marker" r="28" fill="#fff" stroke="#315e41" stroke-width="10"/></svg><div class="town-loading" role="status"><div>宗门坊市 · 同道将至<progress max="${IMAGES.length}" value="0" aria-label="坊市加载进度"></progress><small class="town-load-progress">0%</small></div></div>`;
    this.map = host.querySelector('.sect-market-map')!;
    this.player = host.querySelector('.town-player')!;
    if (returnTown)
      this.passage = new SettlementPassage(
        host,
        host.querySelector('.market-world')!,
        'market',
        () => true,
        returnTown,
      );
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
          this.clickRoute = [];
          this.clickTarget = null;
          this.selectedNpc = null;
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
        if (!this.enabled || this.pointer || !e.isPrimary || e.button !== 0) return;
        e.preventDefault();
        host.focus({ preventScroll: true });
        this.clearInput();
        this.selectedNpc = null;
        if (e.pointerType === 'mouse') {
          this.queueClick(e.target as Element, e.clientX, e.clientY);
          return;
        }
        this.pointer = {
          id: e.pointerId,
          x: e.clientX,
          y: e.clientY,
          target: e.target as Element,
          moved: false,
        };
        host.setPointerCapture(e.pointerId);
      },
      options,
    );
    host.addEventListener(
      'pointermove',
      (e) => {
        if (this.pointer?.id !== e.pointerId) return;
        if (Math.hypot(e.clientX - this.pointer.x, e.clientY - this.pointer.y) > 8)
          this.pointer.moved = true;
        this.touch = { x: (e.clientX - this.pointer.x) / 45, y: (e.clientY - this.pointer.y) / 45 };
      },
      options,
    );
    host.addEventListener(
      'pointerup',
      (e) => {
        const tap = this.pointer?.id === e.pointerId ? this.pointer : null;
        this.clearPointer();
        if (tap && !tap.moved && this.enabled) this.queueClick(tap.target, e.clientX, e.clientY);
      },
      options,
    );
    for (const event of ['pointercancel', 'lostpointercapture'])
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
            image.onerror = (error) => {
              resourceFailed(true);
              reject(error);
            };
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
        host.querySelector('.town-loading')!.innerHTML = resourceFailureContent(
          'sect-market-retry',
          '坊市暂未准备好，游历已暂停。',
          '重新加载',
          false,
        );
      });
  }
  private routeTo(point: TownPoint) {
    this.clickRoute = walkRoute(
      this.position,
      point,
      (p) =>
        p.x >= 24 &&
        p.x <= MARKET_WIDTH - 24 &&
        p.y >= 24 &&
        p.y <= MARKET_HEIGHT - 24 &&
        townWalkable(p, MARKET_BUILDINGS, 260),
      MARKET_WIDTH,
      MARKET_HEIGHT,
    );
  }
  private queueClick(element: Element | null, x: number, y: number) {
    this.clickTarget = null;
    const world = this.host.querySelector<HTMLElement>('.market-world')!;
    let target = mapClick(world, MARKET_WIDTH, MARKET_HEIGHT, x, y);
    const node = element?.closest<HTMLElement>(
      '[data-market-npc], [data-market-place], [data-passage]',
    );
    const npc = this.residents.find((n) => n.id === node?.dataset.marketNpc);
    if (npc) {
      this.clickTarget = { id: npc.id, generation: npc.generation, kind: 'npc' };
      target = npc;
    } else if (node?.dataset.passage === 'market') target = SETTLEMENT_PATHS.market.gate;
    else if (node) {
      const place = node.dataset.marketPlace;
      if (place === 'auction') {
        this.clickTarget = { id: place, kind: 'auction' };
        target = AUCTION_SPOT;
      } else {
        const venue = MARKET_VENUES.find((v) => v.id === place);
        if (venue) {
          this.clickTarget = { id: venue.id, kind: 'venue' };
          target = venue;
        }
      }
    }
    this.routeTo(target);
  }
  private interactAfterWalking() {
    const target = this.clickTarget;
    if (!this.enabled || !target) return;
    if (target.kind === 'auction' && this.nearAuction) {
      this.clearInput();
      this.openAuction();
    } else if (target.kind === 'venue' && this.nearVenue?.id === target.id) {
      this.clearInput();
      this.openVenue(target.id as MarketVenueId);
    } else if (target.kind === 'npc') {
      const npc = this.residents.find(
        (n) => n.id === target.id && n.generation === target.generation,
      );
      if (!npc) {
        this.clearInput();
        return;
      }
      if (Math.hypot(npc.x - this.position.x, npc.y - this.position.y) <= 100) {
        this.clearInput();
        this.selectedNpc = npc;
        this.interact(npc);
      } else if (!this.clickRoute.length) this.routeTo(npc);
    }
  }
  get nearbyNpc() {
    if (
      this.selectedNpc &&
      this.residents.includes(this.selectedNpc) &&
      Math.hypot(this.selectedNpc.x - this.position.x, this.selectedNpc.y - this.position.y) <= 145
    )
      return this.selectedNpc;
    const id = nearbyMarketCultivator(this.position, this.residents);
    return this.residents.find((npc) => npc.id === id);
  }
  get nearAuction() {
    return Math.hypot(this.position.x - AUCTION_SPOT.x, this.position.y - AUCTION_SPOT.y) <= 145;
  }
  get nearVenue() {
    const venue = MARKET_VENUES.map((v) => ({
      ...v,
      distance: Math.hypot(this.position.x - v.x, this.position.y - v.y),
    }))
      .filter((v) => v.distance <= 95)
      .sort((a, b) => a.distance - b.distance)[0];
    return venue ? { ...venue, name: MARKET_BUILDINGS[venue.building].label } : undefined;
  }
  guideTo(id: string) {
    if (!this.residents.some((n) => n.id === id)) return false;
    this.guidedId = id;
    return true;
  }
  update(now: number, enabled: boolean) {
    this.refreshFellow();
    const dt = this.last && this.enabled && enabled ? Math.min(0.1, (now - this.last) / 1000) : 0;
    this.last = now;
    this.enabled = enabled && this.ready;
    this.host.classList.toggle('town-paused', !this.enabled);
    const target = this.clickRoute[0];
    const remaining = target
      ? Math.hypot(target.x - this.position.x, target.y - this.position.y)
      : 0;
    if (!this.enabled) this.clearInput();
    else
      this.position = moveInSectMarket(
        this.position,
        target
          ? {
              x: (target.x - this.position.x) / (remaining || 1),
              y: (target.y - this.position.y) / (remaining || 1),
            }
          : {
              x:
                Number(this.keys.has('d') || this.keys.has('arrowright')) -
                Number(this.keys.has('a') || this.keys.has('arrowleft')) +
                this.touch.x,
              y:
                Number(this.keys.has('s') || this.keys.has('arrowdown')) -
                Number(this.keys.has('w') || this.keys.has('arrowup')) +
                this.touch.y,
            },
        target ? Math.min(dt, remaining / TOWN_WALK_SPEED) : dt,
      );
    if (target && Math.hypot(target.x - this.position.x, target.y - this.position.y) < 0.01)
      this.clickRoute.shift();
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
    const place = this.nearVenue;
    const usePlace =
      place &&
      (!near || place.distance < Math.hypot(this.position.x - near.x, this.position.y - near.y));
    const nearId = this.nearAuction ? 'auction' : usePlace ? place.id : (near?.id ?? '');
    if (this.nearbyId !== nearId || !this.host.dataset.initialized) {
      this.nearbyId = nearId;
      this.host.dataset.initialized = 'true';
      const button = document.querySelector<HTMLButtonElement>('[data-action="sect-market-talk"]');
      if (button) {
        button.disabled = !nearId;
        button.textContent = this.nearAuction
          ? '进入拍卖行'
          : usePlace
            ? `走入${place.name}`
            : near
              ? `与${near.name}交谈`
              : '走近可互动';
      }
      this.host
        .querySelectorAll<HTMLElement>('.sect-market-npc')
        .forEach((node) => node.classList.toggle('nearby', node.dataset.marketNpc === nearId));
    }
    const guided = this.residents.find((n) => n.id === this.guidedId);
    const note = document.getElementById('market-guide');
    if (note && guided) {
      const dx = guided.x - this.position.x,
        dy = guided.y - this.position.y;
      const distance = Math.hypot(dx, dy);
      note.textContent =
        distance < 100
          ? `${guided.name}就在近处`
          : `找${guided.name} · 向${Math.abs(dy) > 50 ? (dy > 0 ? '南' : '北') : ''}${Math.abs(dx) > 50 ? (dx > 0 ? '东' : '西') : ''}行`;
    }
    if (guided)
      this.host
        .querySelectorAll<HTMLElement>('[data-market-marker]')
        .forEach((node) =>
          node.classList.toggle('market-guided', node.dataset.marketMarker === this.guidedId),
        );
    const { scale, x, y } = marketCamera(this.width, this.height, this.position);
    const transform = `translate(${x}px,${y}px) scale(${scale})`;
    if (transform !== this.lastTransform) {
      this.map.style.transform = transform;
      this.map.style.setProperty('--market-scale', String(scale));
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
    this.interactAfterWalking();
    this.passage?.update(this.position, this.enabled);
  }
  talk() {
    if (!this.enabled) return;
    if (this.nearAuction) this.openAuction();
    else {
      const place = this.nearVenue,
        npc = this.nearbyNpc;
      if (
        place &&
        (!npc || place.distance < Math.hypot(this.position.x - npc.x, this.position.y - npc.y))
      )
        this.openVenue(place.id);
      else if (npc) this.interact(npc);
    }
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
      label.innerHTML = `${npc.name}<small>${marketRelation(npc.realmIndex, realm)} · ${marketRealmLabel(npc, realm)}<br>${npc.role}</small>`;
    delete this.host.dataset.initialized;
  }
  private clearPointer() {
    this.pointer = null;
    this.touch = { x: 0, y: 0 };
  }
  private clearInput() {
    this.clickRoute = [];
    this.clickTarget = null;
    this.keys.clear();
    this.clearPointer();
  }
  destroy() {
    this.passage?.destroy();
    this.events.abort();
    this.observer.disconnect();
    this.clearInput();
  }
}
