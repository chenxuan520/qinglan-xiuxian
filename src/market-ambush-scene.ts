import { MarketAmbushDuel, type AmbushOutcome } from './market-ambush.ts';
import { playerSpriteBackground, PLAYER_IMAGES } from './player-appearance.ts';
import { assetUrl } from './asset-url.ts';
import { spiritRootInfo, FINAL_TRIAL_STAGE } from './data.ts';
import { forgeDamageBonus, realmInfo, type SaveData } from './progress.ts';
import type { MarketCultivator } from './sect-market-data.ts';

export class MarketAmbushScene {
  readonly duel: MarketAmbushDuel;
  ready = false;
  private events = new AbortController();
  private keys = new Set<string>();
  private last = 0;
  private enabled = false;
  private pointer: { id: number; x: number; y: number } | null = null;
  private touch = { x: 0, y: 0 };
  private notified = false;
  constructor(
    private host: HTMLElement,
    save: SaveData,
    npc: MarketCultivator,
    private finish: (outcome: AmbushOutcome) => void,
  ) {
    const root = spiritRootInfo(save.spiritRoot);
    const realm = realmInfo(save.cultivation, save.completed.includes(FINAL_TRIAL_STAGE)).index;
    const ratio = Math.max(0.5, Math.min(2.7, 1.28 ** (npc.realmIndex - realm)));
    this.duel = new MarketAmbushDuel({
      hp: root.baseHp + save.training.vitality * 5,
      damage: (7 + root.rate * 8) * (1 + forgeDamageBonus(save.forge[save.starter] || 0)),
      enemyHp: 90 * ratio,
      enemyDamage: 16 * ratio,
      speed: root.baseSpeed,
    });
    host.innerHTML = `<div class="market-ambush-stats"><span>你 <meter class="ambush-player-hp" min="0" max="${this.duel.player.maxHp}" value="${this.duel.player.hp}"></meter></span><span>劫修 <meter class="ambush-enemy-hp" min="0" max="${this.duel.enemy.maxHp}" value="${this.duel.enemy.hp}"></meter></span><small class="ambush-clock">护住退路</small></div><div class="market-ambush-field" tabindex="0" role="region" aria-label="劫修遭遇，方向键或触屏拖动移动，自动攻击"><div class="ambush-figure ambush-player" style="background:${playerSpriteBackground(save.path)}"><small>你</small></div><div class="ambush-figure ambush-enemy" style="background:${playerSpriteBackground(npc.path)}"><small>劫修</small></div><div class="ambush-warning" hidden></div><div class="ambush-shots"></div><div class="ambush-loading">辨清来路，护住行囊…</div></div><p class="panel-note">方向键 / WASD 或按住场地拖动走位，靠近后自动攻击。看见橙色落点就侧移；十五秒内击退取回暂扣灵石，未击退则脱身。切后台暂停；主动离开或刷新按脱身结算。</p><p class="ambush-result" role="status" hidden></p><button class="secondary-button" data-action="market-ambush-exit">立即脱身</button>`;
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
    window.addEventListener(
      'blur',
      () => {
        this.last = 0;
        this.clear();
      },
      options,
    );
    document.addEventListener(
      'visibilitychange',
      () => {
        this.last = 0;
        this.clear();
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
    Promise.all(
      [...new Set([PLAYER_IMAGES[save.path], PLAYER_IMAGES[npc.path]])].map(
        (url) =>
          new Promise<void>((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve();
            img.onerror = reject;
            img.src = assetUrl(url);
          }),
      ),
    )
      .then(() => {
        if (this.events.signal.aborted) return;
        this.ready = true;
        this.last = 0;
        field.querySelector('.ambush-loading')?.remove();
        field.focus({ preventScroll: true });
      })
      .catch(() => {
        if (this.events.signal.aborted) return;
        field.querySelector('.ambush-loading')!.textContent =
          '人物素材暂时无法载入，可直接脱身；等待期间不计战斗时间。';
      });
    this.draw();
  }
  update(now: number, active: boolean) {
    const running = active && this.ready && !this.duel.outcome;
    const dt = this.last && this.enabled && running ? (now - this.last) / 1000 : 0;
    this.last = now;
    this.enabled = running;
    if (!this.enabled) this.clear();
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
    this.draw();
    if (this.duel.outcome && !this.notified) {
      this.notified = true;
      this.finish(this.duel.outcome);
    }
  }
  private draw() {
    for (const [name, actor] of [
      ['player', this.duel.player],
      ['enemy', this.duel.enemy],
    ] as const) {
      const el = this.host.querySelector<HTMLElement>(`.ambush-${name}`)!;
      el.style.left = `${(actor.x / 640) * 100}%`;
      el.style.top = `${(actor.y / 360) * 100}%`;
      this.host.querySelector<HTMLMeterElement>(`.ambush-${name}-hp`)!.value = actor.hp;
    }
    const warning = this.host.querySelector<HTMLElement>('.ambush-warning')!;
    warning.hidden = !this.duel.warning;
    if (this.duel.warning) {
      warning.style.left = `${(this.duel.warning.x / 640) * 100}%`;
      warning.style.top = `${(this.duel.warning.y / 360) * 100}%`;
    }
    this.host.querySelector('.ambush-shots')!.innerHTML = this.duel.shots
      .map((s) => `<i style="left:${(s.x / 640) * 100}%;top:${(s.y / 360) * 100}%"></i>`)
      .join('');
    this.host.querySelector('.ambush-clock')!.textContent =
      `${Math.max(0, 15 - this.duel.time).toFixed(1)}秒 · ${this.enabled ? '自动攻守' : '暂歇'}`;
  }
  private clear() {
    this.keys.clear();
    this.pointer = null;
    this.touch = { x: 0, y: 0 };
  }
  lockOutcome(outcome: AmbushOutcome) {
    this.duel.outcome = this.duel.outcome ?? outcome;
    this.notified = true;
    this.clear();
  }
  destroy() {
    this.events.abort();
    this.clear();
  }
}
