import { assetUrl } from './asset-url.ts';
import { spriteStyle } from './sprites.ts';
import {
  TOWN_WIDTH,
  TOWN_HEIGHT,
  TOWN_START,
  TOWN_STREETS,
  HOMETOWN_START,
  HOMETOWN_DOCK,
  TOWN_WALK_SPEED,
  HOMETOWN_NAV_SPEED,
  moveInTown,
  townWalkable,
  townDockPath,
  nearbyTownNpc,
  townNpcPosition,
  type TownPoint,
  type TownNpc,
} from './town.ts';
import { townResidents, type TownPopulation, type TownResident } from './town-population.ts';
import { townSceneryLayout, type TownScenery } from './town-history.ts';
import { townCrowd, townCrowdPosition, type TownPasserby } from './town-crowd.ts';
import { hometownParents, type HometownState } from './hometown.ts';

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
  private nearby?: TownResident;
  private residents: TownResident[];
  private nextSuccession: number;
  private walkingSeconds = 0;
  private reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  private villagers: Array<{ npc: TownNpc; element: HTMLElement }> = [];
  private layout: ReturnType<typeof townSceneryLayout>;
  private lastTransform = '';
  private crowd: Array<{ npc: TownPasserby; element: HTMLElement; art: HTMLElement }> = [];
  private lastCrowdSeconds = -1;
  private homeTarget: 'home' | 'dock' | null = null;
  private homeAppearance = '';
  private buildingSize = 305;
  private route: TownPoint[] = [];
  private routeGuide?: SVGPolylineElement;
  private routeShown = false;

  constructor(
    private host: HTMLElement,
    public position: TownPoint,
    private population: TownPopulation,
    age: number,
    private interact: (npc: TownResident) => void,
    scenery?: TownScenery,
    private hometown?: {
      state: HometownState;
      interact: (target: 'home' | 'dock') => void;
      ready: () => void;
    },
  ) {
    this.layout = townSceneryLayout(population.seed, scenery, !!hometown);
    this.buildingSize = scenery?.revision ? 270 : 305;
    if (!townWalkable(this.position, this.layout.buildings, this.buildingSize))
      this.position = { ...TOWN_START };
    host.dataset.townRevision = String(scenery?.revision ?? 0);
    host.dataset.townEra = String(this.layout.era);
    this.residents = townResidents(population, age, this.layout.npcs);
    this.nextSuccession = Math.min(...this.residents.map((npc) => npc.leavesAt));
    host.innerHTML = `<div class="town-map" aria-hidden="true" style="width:${TOWN_WIDTH}px;height:${TOWN_HEIGHT}px"><div class="town-water"></div>${TOWN_STREETS.map(([x, y, right, bottom]) => `<div class="town-street ${x >= 3150 ? 'town-dock' : ''}" style="left:${x}px;top:${y}px;width:${right - x}px;height:${bottom - y}px"></div>`).join('')}${this.layout.vacantLots.map((lot) => `<div class="town-vacant-lot" style="left:${lot.x}px;top:${lot.y}px"><span class="town-building-caption">旧址</span></div>`).join('')}${this.layout.buildings.map((b) => `<div class="town-building ${b.condition ? `town-${b.condition}` : ''}" style="${scenery?.revision ? 'width:270px;height:270px;' : ''}left:${b.x}px;top:${b.y}px;z-index:${b.y - 20};background-position:${(b.art % 3) * 50}% ${Math.floor(b.art / 3) * 50}%;filter:hue-rotate(${b.tint}deg) saturate(var(--town-saturation,1)) brightness(var(--town-brightness,1))">${b.art === 1 || b.art === 4 ? '<i class="town-smoke"></i>' : ''}${b.caption ? `<span class="town-building-caption">${b.caption}</span>` : ''}</div>`).join('')}${this.layout.props
      .map((p) => {
        // 渔船横向跨过规则格子边界，按实际取景避免栈桥串入船头碎片。
        const x = p.art === 4 ? 600 : (p.art % 3) * 512;
        const width = p.art === 3 ? 600 : p.art === 4 ? 424 : 512;
        return `<div class="town-prop" style="left:${p.x}px;top:${p.y}px;width:${p.size}px;height:${(p.size * 512) / width}px;z-index:${p.art === 4 ? 0 : p.y - 30};background-size:${(1536 / width) * 100}% 200%;background-position:${(x / (1536 - width)) * 100}% ${Math.floor(p.art / 3) * 100}%;transform:translate(-50%,-50%) rotate(${p.rotation}deg)"></div>`;
      })
      .join(
        '',
      )}<div class="town-player" style="${spriteStyle(0)}"><span>你</span></div>${this.residents.map((npc) => `<div class="town-npc ${npc.id.startsWith('villager-') ? 'town-villager' : ''}" data-npc="${npc.id}" data-resident="${npc.id}:${npc.generation}" style="left:${npc.x}px;top:${npc.y}px;z-index:${npc.y}"><span class="town-npc-art" style="background-position:${(npc.art % 3) * 50}% ${Math.floor(npc.art / 3) * 50}%;filter:hue-rotate(${npc.tint}deg)"></span><span class="town-npc-name">${npc.name}<small>${npc.place} · ${npc.role}</small></span></div>`).join('')}</div><svg class="town-minimap" viewBox="0 0 ${TOWN_WIDTH} ${TOWN_HEIGHT}" aria-label="青岚镇方位图"><rect width="3600" height="2500" fill="#253b2d"/><rect x="3180" width="420" height="2500" fill="#315658"/>${TOWN_STREETS.map(([x, y, r, b]) => `<rect x="${x}" y="${y}" width="${r - x}" height="${b - y}" fill="#8b8d72"/>`).join('')}${this.layout.npcs.map((n) => `<circle cx="${n.x}" cy="${n.y}" r="37" fill="#dbc17a"/>`).join('')}<circle class="town-map-marker" r="45" fill="#fff" stroke="#315e41" stroke-width="16"/></svg><div class="town-loading" role="status"><div>青岚镇 · 街巷铺展中<progress max="${TOWN_IMAGES.length}" value="0" aria-label="城镇加载进度"></progress><small class="town-load-progress">0%</small></div></div>`;
    this.map = host.querySelector('.town-map')!;
    this.player = host.querySelector('.town-player')!;
    if (hometown) {
      const group = document.createElement('div');
      group.className = 'town-parents';
      this.map.append(group);
      const minimap = host.querySelector('.town-minimap')!;
      if (hometown.state.stage !== 'departed') {
        const route = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
        route.classList.add('town-route-guide');
        route.setAttribute('fill', 'none');
        route.setAttribute('stroke', '#fff1bd');
        route.setAttribute('stroke-width', '35');
        minimap.append(route);
        this.routeGuide = route;
        this.updateDockRouteGuide(
          townDockPath(this.position, this.layout.buildings, this.buildingSize),
        );
      }
      const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      label.setAttribute('x', String(HOMETOWN_START.x));
      label.setAttribute('y', String(HOMETOWN_START.y - 100));
      label.setAttribute('fill', '#fff1bd');
      label.setAttribute('font-size', '240');
      label.textContent = '故居';
      minimap.append(label);
      this.refreshParents(age);
    }
    this.crowd = townCrowd(population.seed, this.layout.buildings).map((npc) => {
      const element = document.createElement('div');
      element.className = 'town-crowd';
      element.hidden = true;
      element.innerHTML = `<span class="town-npc-art" style="background-position:${(npc.art % 3) * 50}% ${Math.floor(npc.art / 3) * 50}%;filter:hue-rotate(${npc.tint}deg)"></span>`;
      this.map.append(element);
      return { npc, element, art: element.firstElementChild as HTMLElement };
    });
    this.villagers = this.layout.npcs
      .filter((npc) => npc.id.startsWith('villager-'))
      .map((npc) => ({
        npc,
        element: host.querySelector<HTMLElement>(`[data-npc="${npc.id}"]`)!,
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
        if (!this.enabled || (e.target as HTMLElement).matches('input, textarea')) return;
        const key = e.key.toLowerCase();
        if (['w', 'a', 's', 'd', 'arrowup', 'arrowleft', 'arrowdown', 'arrowright'].includes(key)) {
          e.preventDefault();
          this.stopDockNavigation();
          this.keys.add(key);
        }
        if (
          key === 'e' &&
          !e.repeat &&
          (this.nearby || this.homeTarget || this.hometown?.state.stage === 'walk')
        ) {
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
        this.stopDockNavigation();
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
        const arrival = host.querySelector<HTMLElement>('.town-return-note');
        if (arrival) arrival.hidden = false;
        this.hometown?.ready();
      })
      .catch(() => {
        if (this.events.signal.aborted) return;
        host.querySelector('.town-loading')!.innerHTML =
          '<div>城镇素材加载失败，当前不计龄。<br><button class="secondary-button" data-action="town-retry">重新加载</button></div>';
      });
  }
  showArrival(text: string) {
    const notice = document.createElement('p');
    notice.className = 'town-return-note';
    notice.setAttribute('role', 'status');
    notice.textContent = text;
    notice.hidden = !this.ready;
    this.host.append(notice);
  }
  private clearInput() {
    this.keys.clear();
    this.touch = { x: 0, y: 0 };
    this.pointer = null;
  }
  refreshResidents(age: number) {
    this.refreshParents(age);
    if (age < this.nextSuccession) return;
    const next = townResidents(this.population, age, this.layout.npcs);
    this.nextSuccession = Math.min(...next.map((npc) => npc.leavesAt));
    for (let i = 0; i < next.length; i++) {
      if (
        next[i].generation === this.residents[i].generation &&
        next[i].name === this.residents[i].name
      )
        continue;
      const npc = next[i];
      this.residents[i] = npc;
      const element = this.host.querySelector<HTMLElement>(`[data-npc="${npc.id}"]`)!;
      element.dataset.resident = `${npc.id}:${npc.generation}`;
      element.querySelector<HTMLElement>('.town-npc-art')!.style.filter =
        `hue-rotate(${npc.tint}deg)`;
      element.querySelector('.town-npc-name')!.innerHTML =
        `${npc.name}<small>${npc.place} · ${npc.role}</small>`;
    }
  }
  get nearbyNpc() {
    const id = nearbyTownNpc(this.position, this.walkingSeconds, this.layout.npcs)?.id;
    return this.residents.find((npc) => npc.id === id);
  }
  private refreshParents(age: number) {
    if (!this.hometown) return;
    const parents = hometownParents(this.hometown.state, age).filter((p) => p.alive);
    const appearance = parents.map((p) => p.name).join(':');
    if (appearance === this.homeAppearance) return;
    this.homeAppearance = appearance;
    this.host.querySelector('.town-parents')!.innerHTML = parents
      .map((p) => {
        const art = p.id === 'father' ? 6 : 8;
        const x = HOMETOWN_START.x + (p.id === 'father' ? -70 : 70);
        const y = HOMETOWN_START.y - 55;
        return `<div class="town-npc town-parent" data-parent="${p.id}" style="left:${x}px;top:${y}px;z-index:${y}"><span class="town-npc-art" style="background-position:${(art % 3) * 50}% ${Math.floor(art / 3) * 50}%;filter:saturate(${p.old ? 0.4 : 1})"></span><span class="town-npc-name">${p.name}</span></div>`;
      })
      .join('');
  }
  update(now: number, enabled: boolean) {
    const dt = this.last ? (now - this.last) / 1000 : 0;
    this.last = now;
    this.enabled = enabled && this.ready;
    this.host.classList.toggle('town-paused', !this.enabled);
    const target = this.route[0];
    const remaining = target
      ? Math.hypot(target.x - this.position.x, target.y - this.position.y)
      : 0;
    const speed = target ? HOMETOWN_NAV_SPEED : TOWN_WALK_SPEED;
    if (!this.enabled) this.clearInput();
    else
      this.position = moveInTown(
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
        target ? Math.min(dt, remaining / speed) : dt,
        this.layout.buildings,
        this.buildingSize,
        speed,
      );
    if (target && Math.hypot(target.x - this.position.x, target.y - this.position.y) < 0.01)
      this.route.shift();
    if (this.enabled && !this.reducedMotion.matches) this.walkingSeconds += Math.min(dt, 0.05);
    for (const { npc, element } of this.villagers) {
      const point = townNpcPosition(npc, this.walkingSeconds);
      element.style.transform = `translate(calc(-50% + ${point.x - npc.x}px), -100%)`;
    }
    const nearId = nearbyTownNpc(this.position, this.walkingSeconds, this.layout.npcs)?.id;
    const departure = this.hometown && this.hometown.state.stage !== 'departed';
    const homeTarget = this.hometown
      ? departure
        ? Math.hypot(this.position.x - HOMETOWN_DOCK.x, this.position.y - HOMETOWN_DOCK.y) <= 125
          ? 'dock'
          : null
        : Math.hypot(this.position.x - HOMETOWN_START.x, this.position.y - HOMETOWN_START.y) <= 160
          ? 'home'
          : null
      : null;
    const near =
      departure || homeTarget ? undefined : this.residents.find((npc) => npc.id === nearId);
    if (homeTarget === 'dock' && this.route.length) this.stopDockNavigation();
    const navigating = this.route.length > 0;
    if (this.nearby !== near || this.homeTarget !== homeTarget || this.routeShown !== navigating) {
      this.nearby = near;
      this.homeTarget = homeTarget;
      this.routeShown = navigating;
      const button = document.querySelector<HTMLButtonElement>('[data-action="town-talk"]');
      if (button) {
        button.disabled = !near && !homeTarget && !departure;
        button.textContent =
          homeTarget === 'dock'
            ? '离开青岚 · E'
            : homeTarget === 'home'
              ? '故居 · E'
              : near
                ? `与${near.name}交谈 · E`
                : departure
                  ? navigating
                    ? '自动前往 · 点击停下'
                    : '前往渡口'
                  : '走近镇民可交谈';
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
    if (this.walkingSeconds - this.lastCrowdSeconds >= 1 / 30 || transform !== this.lastTransform) {
      this.lastCrowdSeconds = this.walkingSeconds;
      for (const { npc, element, art } of this.crowd) {
        const point = townCrowdPosition(npc, this.walkingSeconds);
        const screenX = point.x * scale + x;
        const screenY = point.y * scale + y;
        const hidden =
          screenX < -90 ||
          screenX > this.width + 90 ||
          screenY < -10 ||
          screenY > this.height + 100;
        if (element.hidden !== hidden) element.hidden = hidden;
        if (hidden) continue;
        element.style.transform = `translate(${Math.round(point.x) - 40}px,${Math.round(point.y) - 80}px)`;
        element.style.zIndex = String(Math.round(point.y));
        art.style.transform = `scaleX(${point.facing})`;
      }
    }
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
    if (!this.enabled) return;
    if (this.homeTarget) this.hometown?.interact(this.homeTarget);
    else if (this.hometown?.state.stage === 'walk') this.toggleDockNavigation();
    else if (this.nearby) this.interact(this.nearby);
  }
  toggleDockNavigation() {
    if (!this.ready || this.hometown?.state.stage !== 'walk') return;
    this.clearInput();
    if (this.route.length) this.stopDockNavigation();
    else {
      this.route = townDockPath(this.position, this.layout.buildings, this.buildingSize);
      this.updateDockRouteGuide(this.route);
    }
  }
  private updateDockRouteGuide(route: readonly TownPoint[]) {
    this.routeGuide?.setAttribute(
      'points',
      route.length ? [this.position, ...route].map((p) => `${p.x},${p.y}`).join(' ') : '',
    );
  }
  private stopDockNavigation() {
    this.route = [];
  }
  destroy() {
    this.events.abort();
    this.observer.disconnect();
    this.clearInput();
  }
}
