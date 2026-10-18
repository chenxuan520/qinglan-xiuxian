import { MarketAmbushDuel, type AmbushOutcome } from './market-ambush.ts';
import {
  AMBUSH_RETREAT_SECONDS,
  validAmbushSnapshot,
  validAmbushStats,
  type AmbushSnapshot,
} from './market-ambush-data.ts';
import { playerSpriteBackground, PLAYER_IMAGES } from './player-appearance.ts';
import { assetUrl } from './asset-url.ts';
import type { SaveData } from './progress.ts';
import type { MarketCultivator } from './sect-market-data.ts';

export class MarketAmbushScene {
  readonly duel: MarketAmbushDuel;
  ready = false;
  checkpointBlocked = false;
  assetsFailed = false;
  private events = new AbortController();
  private keys = new Set<string>();
  private last = 0;
  private lastCheckpoint = 0;
  private enabled = false;
  private focused = true;
  private fieldVisible = false;
  private pointer: { id: number; x: number; y: number } | null = null;
  private touch = { x: 0, y: 0 };
  private notified = false;
  private assetAttempt = 0;
  private imageUrls: string[];
  private host: HTMLElement;
  private finish: (outcome: AmbushOutcome) => void;
  private saveCheckpoint: (snapshot: AmbushSnapshot) => boolean;
  constructor(
    host: HTMLElement,
    save: SaveData,
    npc: MarketCultivator,
    finish: (outcome: AmbushOutcome) => void,
    saveCheckpoint: (snapshot: AmbushSnapshot) => boolean,
  ) {
    this.host = host;
    this.finish = finish;
    this.saveCheckpoint = saveCheckpoint;
    const encounter = save.mortal.marketSocial?.ambush;
    if (
      !encounter ||
      !validAmbushStats(encounter.stats) ||
      !validAmbushSnapshot(encounter.snapshot, encounter.stats)
    )
      throw new Error('劫修遭遇存档不完整，暂时无法继续');
    this.duel = new MarketAmbushDuel(encounter.stats, encounter.snapshot);
    this.lastCheckpoint = this.duel.time;
    this.imageUrls = [...new Set([PLAYER_IMAGES[save.path], PLAYER_IMAGES[npc.path]])];
    host.innerHTML = `<div class="market-ambush-stats"><span>你 <meter class="ambush-player-hp" min="0" max="${this.duel.player.maxHp}" value="${this.duel.player.hp}"></meter></span><span>劫修 <meter class="ambush-enemy-hp" min="0" max="${this.duel.enemy.maxHp}" value="${this.duel.enemy.hp}"></meter></span><small class="ambush-clock">护住退路</small></div><div class="market-ambush-controls"><button class="secondary-button" data-action="market-ambush-exit">尝试撤离</button></div><div class="market-ambush-field" tabindex="0" role="region" aria-label="劫修遭遇，方向键或触屏拖动移动，自动攻击"><div class="ambush-exit" aria-label="左侧退路"><span>退路</span></div><div class="ambush-figure ambush-player" style="background:${playerSpriteBackground(save.path)}"><small>你</small></div><div class="ambush-figure ambush-enemy" style="background:${playerSpriteBackground(npc.path)}"><small>劫修</small></div><div class="ambush-warning" hidden></div><div class="ambush-shots"></div><div class="ambush-loading">辨清来路，护住行囊…</div></div><p class="panel-note">方向键 / WASD 或拖动走位，靠近自动出手，橙色预警要侧移。撤离时自动退向左侧，手动走位可接管；在退路拉开距离保持两秒即可脱身。离开画面时战斗暂停。</p><p class="ambush-save-error" role="status" hidden>尚未保存当前战况，战斗已暂停。<button class="secondary-button" data-action="market-ambush-retry-checkpoint">重试保存并继续</button></p><p class="ambush-result" role="status" hidden></p>`;
    const field = host.querySelector<HTMLElement>('.market-ambush-field')!;
    const options = { signal: this.events.signal };
    document.addEventListener(
      'keydown',
      (e) => {
        if (!this.enabled || (e.target as HTMLElement).matches('input,textarea,select')) return;
        const k = e.key.toLowerCase();
        if (['w', 'a', 's', 'd', 'arrowup', 'arrowleft', 'arrowdown', 'arrowright'].includes(k)) {
          e.preventDefault();
          this.keys.add(k);
        }
      },
      options,
    );
    document.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()), options);
    window.addEventListener('blur', () => this.suspend(true), options);
    window.addEventListener(
      'focus',
      () => {
        this.focused = true;
        this.last = 0;
      },
      options,
    );
    document.addEventListener(
      'visibilitychange',
      () => {
        if (document.hidden) this.suspend(false);
        else this.last = 0;
      },
      options,
    );
    host.addEventListener(
      'click',
      (e) => {
        const action = (e.target as HTMLElement).closest<HTMLElement>('[data-action]')?.dataset
          .action;
        if (
          action === 'market-ambush-retry-assets' ||
          action === 'market-ambush-retry-checkpoint'
        ) {
          e.preventDefault();
          e.stopPropagation();
          if (action === 'market-ambush-retry-assets') void this.retryAssets();
          else this.retryCheckpoint();
        }
      },
      options,
    );
    field.addEventListener(
      'pointerdown',
      (e) => {
        if (!this.enabled || this.pointer) return;
        e.preventDefault();
        field.focus({ preventScroll: true });
        this.pointer = { id: e.pointerId, x: e.clientX, y: e.clientY };
        field.setPointerCapture(e.pointerId);
      },
      options,
    );
    field.addEventListener(
      'pointermove',
      (e) => {
        if (this.pointer?.id === e.pointerId)
          this.touch = {
            x: (e.clientX - this.pointer.x) / 45,
            y: (e.clientY - this.pointer.y) / 45,
          };
      },
      options,
    );
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'])
      field.addEventListener(
        type,
        () => {
          this.pointer = null;
          this.touch = { x: 0, y: 0 };
        },
        options,
      );
    const observer = new ResizeObserver(() => this.clear());
    observer.observe(field);
    this.events.signal.addEventListener('abort', () => observer.disconnect(), { once: true });
    if (typeof IntersectionObserver === 'undefined') this.fieldVisible = true;
    else {
      const visibility = new IntersectionObserver(
        (entries) => {
          if (this.events.signal.aborted) return;
          for (const entry of entries) {
            if (entry.target !== field) continue;
            const visible = entry.isIntersecting && entry.intersectionRatio >= 0.7;
            if (visible === this.fieldVisible) continue;
            if (!visible) this.suspend(false);
            this.fieldVisible = visible;
            this.last = 0;
          }
        },
        { threshold: [0, 0.7, 1] },
      );
      visibility.observe(field);
      this.events.signal.addEventListener('abort', () => visibility.disconnect(), { once: true });
    }
    void this.retryAssets();
    this.draw();
  }
  async retryAssets() {
    if (this.events.signal.aborted || this.ready) return;
    const attempt = ++this.assetAttempt;
    this.assetsFailed = false;
    const loading = this.host.querySelector<HTMLElement>('.ambush-loading');
    if (loading) loading.textContent = '辨清来路，护住行囊…';
    try {
      await Promise.all(
        this.imageUrls.map(
          (url) =>
            new Promise<void>((resolve, reject) => {
              const img = new Image();
              img.onload = () => resolve();
              img.onerror = reject;
              img.src = assetUrl(url);
            }),
        ),
      );
      if (this.events.signal.aborted || attempt !== this.assetAttempt) return;
      this.ready = true;
      this.last = 0;
      loading?.remove();
      if (!document.hidden && this.focused)
        this.host
          .querySelector<HTMLElement>('.market-ambush-field')
          ?.focus({ preventScroll: true });
    } catch {
      if (this.events.signal.aborted || attempt !== this.assetAttempt) return;
      this.assetsFailed = true;
      if (loading)
        loading.innerHTML =
          '遭遇画面暂未准备好，战斗已暂停。<button class="secondary-button" data-action="market-ambush-retry-assets">重试加载</button>';
    }
  }
  checkpoint() {
    if (this.checkpointBlocked) return false;
    return this.attemptCheckpoint();
  }
  private attemptCheckpoint() {
    if (this.events.signal.aborted) return false;
    let saved = false;
    try {
      saved = this.saveCheckpoint(this.duel.snapshot()) === true;
    } catch {
      saved = false;
    }
    this.checkpointBlocked = !saved;
    if (saved) this.lastCheckpoint = this.duel.time;
    else {
      this.enabled = false;
      this.last = 0;
      this.clear();
    }
    const status = this.host.querySelector<HTMLElement>('.ambush-save-error');
    if (status) status.hidden = saved;
    return saved;
  }
  retryCheckpoint() {
    if (!this.attemptCheckpoint()) return false;
    this.last = 0;
    this.notifyOutcome();
    return true;
  }
  requestRetreat() {
    if (this.checkpointBlocked || !this.duel.requestRetreat()) return false;
    const saved = this.checkpoint();
    this.draw();
    return saved;
  }
  revive() {
    if (this.checkpointBlocked || !this.duel.revive()) return false;
    this.notified = false;
    this.last = 0;
    this.clear();
    const saved = this.checkpoint();
    this.draw();
    if (saved) this.notifyOutcome();
    return saved;
  }
  update(now: number, active: boolean) {
    if (this.events.signal.aborted) return;
    const running =
      active &&
      this.focused &&
      this.fieldVisible &&
      !document.hidden &&
      this.ready &&
      !this.checkpointBlocked &&
      !this.duel.outcome;
    const dt = this.last && this.enabled && running ? Math.max(0, (now - this.last) / 1000) : 0;
    this.last = now;
    this.enabled = running;
    if (!this.enabled) this.clear();
    const before = [this.duel.player.hp, this.duel.enemy.hp, this.duel.outcome];
    this.duel.update(
      dt,
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
      this.enabled,
    );
    if (
      !this.checkpointBlocked &&
      (this.duel.time - this.lastCheckpoint >= 1 ||
        before[0] !== this.duel.player.hp ||
        before[1] !== this.duel.enemy.hp ||
        before[2] !== this.duel.outcome)
    )
      this.checkpoint();
    this.draw();
    this.notifyOutcome();
  }
  private notifyOutcome() {
    if (this.duel.outcome && !this.notified && !this.checkpointBlocked) {
      this.notified = true;
      this.enabled = false;
      this.clear();
      this.finish(this.duel.outcome);
    }
  }
  private suspend(blur: boolean) {
    if (blur) this.focused = false;
    this.last = 0;
    this.enabled = false;
    this.clear();
    this.checkpoint();
  }
  private draw() {
    for (const [name, actor] of [
      ['player', this.duel.player],
      ['enemy', this.duel.enemy],
    ] as const) {
      const el = this.host.querySelector<HTMLElement>(`.ambush-${name}`)!;
      el.style.left = `${(actor.x / this.duel.width) * 100}%`;
      el.style.top = `${(actor.y / this.duel.height) * 100}%`;
      this.host.querySelector<HTMLMeterElement>(`.ambush-${name}-hp`)!.value = actor.hp;
    }
    const warning = this.host.querySelector<HTMLElement>('.ambush-warning')!;
    warning.hidden = !this.duel.warning;
    if (this.duel.warning) {
      warning.style.left = `${(this.duel.warning.x / this.duel.width) * 100}%`;
      warning.style.top = `${(this.duel.warning.y / this.duel.height) * 100}%`;
    }
    this.host.querySelector('.ambush-shots')!.innerHTML = this.duel.shots
      .map(
        (s) =>
          `<i style="left:${(s.x / this.duel.width) * 100}%;top:${(s.y / this.duel.height) * 100}%"></i>`,
      )
      .join('');
    this.host.querySelector('.ambush-clock')!.textContent = this.checkpointBlocked
      ? '保存后继续'
      : this.duel.retreatRequested
        ? `左侧退路 · 安全停留 ${this.duel.retreatProgress.toFixed(1)} / ${AMBUSH_RETREAT_SECONDS}秒`
        : `${this.duel.time.toFixed(1)}秒 · ${this.enabled ? '自动攻守' : '暂歇'}`;
    const exit = this.host.querySelector<HTMLButtonElement>('[data-action="market-ambush-exit"]');
    if (exit && !this.duel.outcome) {
      exit.textContent = this.duel.retreatRequested ? '正在撤离 · 可手动接管走位' : '尝试撤离';
      exit.disabled = this.duel.retreatRequested || this.checkpointBlocked;
    }
  }
  private clear() {
    this.keys.clear();
    this.pointer = null;
    this.touch = { x: 0, y: 0 };
  }
  lockOutcome(outcome: AmbushOutcome) {
    if (this.duel.outcome !== outcome) return false;
    this.notified = true;
    this.enabled = false;
    this.clear();
    return true;
  }
  destroy() {
    if (!this.events.signal.aborted) this.checkpoint();
    this.events.abort();
    this.clear();
  }
}
