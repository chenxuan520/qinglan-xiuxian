import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.ts';
import { BattleHud } from '../src/battle-hud.ts';
import { freshSave } from '../src/progress.ts';

const recoveryText = '九天执劫仙尊 · 劫息回元';

function encounter() {
  const save = freshSave('heaven', ['metal'], 'dual', () => 0.5);
  Object.assign(save, { unlocked: 6, completed: [0, 1, 2, 3, 4, 5], cultivation: 119940 });
  const game = new Game(save, 6, 0, () => 0.5);
  Object.assign(game, {
    time: 400,
    bossSpawned: true,
    trialBossesSpawned: 7,
    trialBossesDefeated: 6,
    nextTrialBossAt: 99999,
    nextElite: 99999,
    noticeTime: 0,
  });
  game.weapons[0].timer = 99999;
  game.player.invincible = 99999;
  const boss = game.spawnEnemy(10, false, true, { x: -300, y: 0 }, 6);
  Object.assign(boss, {
    hp: boss.maxHp / 2,
    lastHurtAt: 397,
    speed: 0,
    cooldown: 0.02,
    pursuitCooldown: 99999,
    skillStep: 0,
    bossSkillQueue: [1, 2, 3, 4, 5, 6, 7, 8],
  });
  return { game, boss };
}

// 受控DOM与RAF调度验证真实BattleHud.update及真实Game，不能替代浏览器视觉验收。
function fixture(run: (environment: ReturnType<typeof environment>) => void) {
  const names = [
    'document',
    'window',
    'requestAnimationFrame',
    'cancelAnimationFrame',
    'getComputedStyle',
  ];
  const previous = names.map((name) => Object.getOwnPropertyDescriptor(globalThis, name));
  const f = environment();
  const values = [f.document, f.window, f.request, f.cancel, f.computedStyle];
  names.forEach((name, i) =>
    Object.defineProperty(globalThis, name, { configurable: true, value: values[i] }),
  );
  try {
    run(f);
  } finally {
    names.forEach((name, i) => {
      if (previous[i]) Object.defineProperty(globalThis, name, previous[i]!);
      else Reflect.deleteProperty(globalThis, name);
    });
  }
}

function environment() {
  let serial = 0;
  const frames = new Map<number, FrameRequestCallback>();
  const listeners = new Map<string, (() => void)[]>();
  class Element {
    textContent = '';
    innerHTML = '';
    hidden = false;
    isConnected = true;
    opacity = 1;
    style: Record<string, string> = {};
    parentElement: Element | null = null;
    children: Element[] = [];
    named = new Map<string, Element>();
    classes = new Set<string>();
    classList = {
      toggle: (name: string, enabled?: boolean) => {
        const show = enabled ?? !this.classes.has(name);
        if (show) this.classes.add(name);
        else this.classes.delete(name);
        return show;
      },
    };
    get firstElementChild() {
      return this.children[0] ?? null;
    }
    get lastElementChild() {
      return this.children.at(-1) ?? null;
    }
    get childElementCount() {
      return this.children.length;
    }
    replaceChildren(...children: Element[]) {
      this.children = children;
      for (const child of children) child.parentElement = this;
    }
    querySelector(selector: string) {
      if (!this.named.has(selector)) this.named.set(selector, new Element());
      return this.named.get(selector)!;
    }
    setAttribute() {}
    getClientRects() {
      return this.isConnected && !this.hidden ? [{}] : [];
    }
  }
  const elements = new Map<string, Element>();
  const get = (id: string) => {
    if (!elements.has(id)) elements.set(id, new Element());
    return elements.get(id)!;
  };
  const listen = (name: string, callback: () => void) => {
    listeners.set(name, [...(listeners.get(name) ?? []), callback]);
  };
  const document = {
    hidden: false,
    focused: true,
    hasFocus: () => document.focused,
    getElementById: get,
    querySelector: get,
    createElement: () => new Element(),
    addEventListener: listen,
  };
  const ui = { querySelector: () => null } as unknown as HTMLDivElement;
  return {
    document,
    window: { addEventListener: listen },
    host: get('notice'),
    modal: get('modal-root'),
    request: (callback: FrameRequestCallback) => {
      frames.set(++serial, callback);
      return serial;
    },
    cancel: (id: number) => frames.delete(id),
    computedStyle: (element: Element) => ({
      visibility: 'visible',
      opacity: String(element.opacity),
    }),
    hud: (game: Game) => new BattleHud(ui, game.save, {} as never),
    frame(now: number) {
      const pending = [...frames.values()];
      frames.clear();
      for (const callback of pending) callback(now);
    },
    staleFrame: () => [...frames.values()][0],
    visibility(hidden: boolean) {
      document.hidden = hidden;
      for (const callback of listeners.get('visibilitychange') ?? []) callback();
    },
  };
}

test('main的100ms取样及单rAF批步不会消费回元；两次可见RAF后确认且技能同区保留', () =>
  fixture((f) => {
    const { game } = encounter();
    const hud = f.hud(game);
    let lastHud = 0;
    for (let step = 1; step <= 40; step++) {
      game.update(0.01);
      const now = step * 10;
      if (now - lastHud > 100) {
        hud.update(game);
        lastHud = now;
      }
    }
    assert.equal(game.snapshot().sovereignRecoveryPending, true);
    assert.notEqual(game.notice, recoveryText);
    assert.equal(f.host.firstElementChild!.textContent, game.notice);
    assert.equal(f.host.lastElementChild!.hidden, true);
    f.frame(400);
    assert.equal(f.host.lastElementChild!.textContent, recoveryText);
    assert.equal(f.host.lastElementChild!.hidden, false);
    assert.equal(game.snapshot().sovereignRecoveryPending, true);
    game.announce('藤缠 · 暂难拾取');
    hud.update(game);
    f.frame(416);
    assert.equal(game.snapshot().sovereignRecoveryPending, undefined);
    assert.equal(f.host.firstElementChild!.textContent, '藤缠 · 暂难拾取');
    assert.equal(f.host.lastElementChild!.textContent, recoveryText);
    assert.equal(f.host.lastElementChild!.hidden, false);
    hud.reset();
  }));

test('下一相邻模拟步出招也不能覆盖回元行，正常announce时长保持原三秒', () =>
  fixture((f) => {
    const { game } = encounter();
    const hud = f.hud(game);
    game.update(0.01);
    hud.update(game);
    f.frame(10);
    game.update(0.01);
    assert.equal(game.notice, '九天执劫仙尊 · 诛仙雷轮');
    assert.equal(game.noticeTime, 3);
    hud.update(game);
    f.frame(26);
    assert.equal(f.host.firstElementChild!.textContent, game.notice);
    assert.equal(f.host.lastElementChild!.textContent, recoveryText);
    assert.equal(game.pendingSovereignRecoveryNotice, null);
    hud.reset();
  }));

test('暂停、升级、hidden及遮挡期间只保留pending，不作展示确认', () =>
  fixture((f) => {
    const { game } = encounter();
    const hud = f.hud(game);
    game.update(0.01);
    hud.update(game);
    game.pause();
    f.frame(1000);
    assert.equal(game.snapshot().sovereignRecoveryPending, true);
    game.resume();
    f.visibility(true);
    f.frame(2000);
    assert.equal(game.snapshot().sovereignRecoveryPending, true);
    f.visibility(false);
    game.state = 'upgrade';
    f.frame(3000);
    assert.equal(game.snapshot().sovereignRecoveryPending, true);
    game.state = 'playing';
    f.modal.replaceChildren(f.host);
    f.frame(4000);
    assert.equal(game.snapshot().sovereignRecoveryPending, true);
    f.modal.replaceChildren();
    f.frame(5000);
    assert.equal(game.snapshot().sovereignRecoveryPending, true);
    f.frame(5016);
    assert.equal(game.pendingSovereignRecoveryNotice, null);
    hud.reset();
  }));

test('尚未可见的透明提示不消费pending', () =>
  fixture((f) => {
    const { game } = encounter();
    const hud = f.hud(game);
    game.update(0.01);
    hud.update(game);
    f.host.opacity = 0;
    f.frame(0);
    f.frame(16);
    assert.equal(game.snapshot().sovereignRecoveryPending, true);
    f.host.opacity = 1;
    f.frame(32);
    assert.equal(game.snapshot().sovereignRecoveryPending, true);
    f.frame(48);
    assert.equal(game.pendingSovereignRecoveryNotice, null);
    hud.reset();
  }));

test('原三秒前台可读窗口独立于模拟批步，暂停与hidden冻结展示', () =>
  fixture((f) => {
    const { game } = encounter();
    const hud = f.hud(game);
    game.update(0.01);
    hud.update(game);
    f.frame(0);
    f.frame(16);
    f.frame(900);
    for (let i = 0; i < 100; i++) game.update(0.05);
    hud.update(game);
    assert.equal(f.host.lastElementChild!.hidden, false);
    game.pause();
    f.frame(2000);
    assert.equal(f.host.lastElementChild!.hidden, true);
    game.resume();
    f.visibility(true);
    f.frame(6000);
    f.visibility(false);
    f.frame(10000);
    f.frame(12000);
    assert.equal(f.host.lastElementChild!.hidden, false);
    f.frame(12101);
    assert.equal(f.host.lastElementChild!.hidden, true);
    hud.update(game);
    f.frame(12200);
    assert.equal(f.host.lastElementChild!.hidden, true);
    hud.reset();
  }));

test('确认前暂停JSON续局不丢失，确认后刷新不重播，旧Game回调不能确认新Game', () =>
  fixture((f) => {
    const { game } = encounter();
    const hud = f.hud(game);
    game.update(0.01);
    hud.update(game);
    const stale = f.staleFrame();
    game.pause();
    const restored = Game.restore(game.save, JSON.parse(JSON.stringify(game.snapshot())))!;
    assert.ok(restored);
    restored.resume();
    hud.update(restored);
    stale(0);
    assert.equal(game.snapshot().sovereignRecoveryPending, true);
    assert.equal(restored.snapshot().sovereignRecoveryPending, true);
    f.frame(16);
    assert.equal(restored.snapshot().sovereignRecoveryPending, true);
    f.frame(32);
    assert.equal(restored.pendingSovereignRecoveryNotice, null);
    const shown = Game.restore(restored.save, JSON.parse(JSON.stringify(restored.snapshot())))!;
    assert.ok(shown);
    hud.reset();
    shown.resume();
    hud.update(shown);
    f.frame(48);
    f.frame(64);
    assert.equal(shown.pendingSovereignRecoveryNotice, null);
    assert.equal(f.host.lastElementChild!.hidden, true);
    assert.equal(Object.hasOwn(shown.save, 'sovereignRecoveryPending'), false);
    hud.reset();
  }));
