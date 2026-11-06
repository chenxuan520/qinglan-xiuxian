import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { createContext, runInContext } from 'node:vm';
import { ALTARS } from '../src/altars.ts';
import { altarHudStatus, altarPromptModal } from '../src/altar-ui.ts';
import { BattleHud } from '../src/battle-hud.ts';
import { damageReport } from '../src/common-ui.ts';
import { dispatchAction } from '../src/action-controller.ts';
import { gameEvent, renderPause, restoreRun } from '../src/scene-flow.ts';
import { Game } from '../src/game.ts';
import { freshSave, IMMORTAL_CULTIVATION, lifespanInfo, realmInfo } from '../src/progress.ts';
import { FINAL_TRIAL_STAGE } from '../src/data.ts';

// 用公开契约构造界面状态；不代替主方的祭坛逻辑、快照或浏览器验收。
function encounter(stage = 0, phase = 'prompt') {
  const game: any = new Game(freshSave(), stage, 0, () => 0.5);
  game.time = 100;
  game.state = phase === 'prompt' ? 'paused' : 'playing';
  game.altar = {
    kind: ALTARS[stage].kind,
    x: 100,
    y: 0,
    spawnAt: 95,
    expiresAt: 125,
    phase,
    left: false,
    regenUntil: 0,
    slowUntil: 0,
    damageUntil: 0,
    deathUntil: 0,
    thunderUntil: 0,
    nextThunderAt: 0,
    nextBacklashAt: 0,
  };
  Object.defineProperty(game, 'canAcceptAltar', { configurable: true, value: true });
  Object.defineProperty(game, 'altarCostYears', { configurable: true, value: 20.05 });
  return game;
}

test('六种祭坛使用契约名称、效果及代价，单卡只提供接受与离开', () => {
  for (let stage = 0; stage < ALTARS.length; stage++) {
    const game = encounter(stage);
    const before = JSON.stringify(game.altar);
    const html = altarPromptModal(game);
    assert.equal((html.match(/class="choice-card /g) ?? []).length, 1);
    assert.ok(html.includes(ALTARS[stage].name));
    assert.ok(html.includes(`<p>效果：${ALTARS[stage].effect}</p>`));
    if (stage) assert.ok(html.includes(`<p class="altar-cost">代价：${ALTARS[stage].cost}</p>`));
    assert.deepEqual(
      [...html.matchAll(/data-action="([^"]+)"/g)].map((m) => m[1]),
      ['accept-altar', 'leave-altar'],
    );
    assert.doesNotMatch(html, /重悟|自动历练|data-action="(?:close|resume|choose)"/);
    assert.equal(JSON.stringify(game.altar), before);
  }
});

test('木祭坛使用公开年岁费用保留一位小数，长生显示无损，寿元不足禁用接受', () => {
  const game = encounter();
  assert.match(altarPromptModal(game), /代价：年岁增加 20\.1 年（寿元上限的 20%）/);
  assert.doesNotMatch(altarPromptModal(game), /\{n\}/);
  Object.defineProperty(game, 'canAcceptAltar', { value: false });
  assert.match(altarPromptModal(game), /data-action="accept-altar" disabled>寿元不足以献祭/);
  assert.match(altarPromptModal(game), /data-action="leave-altar">离开/);
  game.save.cultivation = IMMORTAL_CULTIVATION;
  assert.equal(Number.isFinite(lifespanInfo(game.save).limit), false);
  assert.match(altarPromptModal(game), /代价：寿元无尽，此祭无损/);
});

test('非prompt状态不产生献祭面板', () => {
  for (const phase of ['pending', 'offered', 'accepted', 'gone'])
    assert.equal(altarPromptModal(encounter(0, phase)), '');
});

test('祭坛HUD沿用守匣八向箭头、距离步和消失倒计时，到期即隐藏', () => {
  const game = encounter(0, 'offered');
  const directions = ['→', '↘', '↓', '↙', '←', '↖', '↑', '↗'];
  for (let i = 0; i < directions.length; i++) {
    game.altar.x = Math.cos((i * Math.PI) / 4) * 100;
    game.altar.y = Math.sin((i * Math.PI) / 4) * 100;
    assert.equal(altarHudStatus(game), `${ALTARS[0].name} ${directions[i]} 100 步 · 25 秒后隐去`);
  }
  game.time = 125;
  assert.equal(altarHudStatus(game), '');
  game.time = 100;
  for (const phase of ['pending', 'prompt', 'gone']) {
    game.altar.phase = phase;
    assert.equal(altarHudStatus(game), '');
  }
});

test('有效期取五种绝对计时的最大值，末秒向上取整且全部到期隐藏', () => {
  const fields = ['regenUntil', 'slowUntil', 'damageUntil', 'deathUntil', 'thunderUntil'];
  for (const field of fields) {
    const game = encounter(0, 'accepted');
    game.altar[field] = 120.1;
    assert.equal(altarHudStatus(game), `${ALTARS[0].name} · 剩余 21 秒`);
    game.time = 120;
    assert.equal(altarHudStatus(game), `${ALTARS[0].name} · 剩余 1 秒`);
    game.time = 120.1;
    assert.equal(altarHudStatus(game), '');
  }
});

function shellFixture(game = encounter(), mockMethods = true) {
  const calls: string[] = [];
  const shell: any = {
    game,
    save: game.save,
    settled: false,
    saveLock: null,
    panel: '',
    previousState: 'playing',
    modal: { innerHTML: '', querySelector: () => null },
    clearInput: () => calls.push('clear'),
    updateHud: () => calls.push('hud'),
    gameAudio: { play: () => {} },
    tribulationDue: () => false,
    lifespanInfo,
    persist: () => {
      calls.push('persist');
      return true;
    },
    renderPause: () => renderPause(shell),
    gameEvent: (name: string) => gameEvent(shell, name),
    medicinePanel: { handle: () => false },
  };
  let accepted = 0,
    left = 0;
  if (mockMethods) {
    game.acceptAltar = () => {
      accepted++;
      game.altar.phase = 'accepted';
      game.state = 'playing';
      game.onEvent('altar');
      return true;
    };
    game.leaveAltar = () => {
      left++;
      game.altar.phase = 'offered';
      game.state = 'playing';
      game.onEvent('altar');
    };
  }
  game.onEvent = shell.gameEvent;
  return { shell, calls, accepted: () => accepted, left: () => left };
}

function integratedEncounter() {
  const game = new Game(
    freshSave(),
    0,
    0,
    () => 0.5,
    'orthodox',
    () => 0.5,
  );
  game.time = game.altar!.spawnAt;
  Object.assign(game.altar!, {
    phase: 'offered',
    x: game.player.x + 50,
    y: game.player.y,
    expiresAt: game.time + 30,
    left: true,
  });
  return game;
}

test('正式Game步尾prompt事件接通单卡、通用resume受阻，接受后实际扣年岁并保存', () => {
  const game = integratedEncounter();
  const f = shellFixture(game, false);
  const writes: { age: number; phase: string; state: string }[] = [];
  f.shell.persist = () => {
    writes.push({ age: game.save.age, phase: game.altar!.phase, state: game.state });
    return true;
  };
  game.update(0.01);
  assert.equal(game.state, 'paused');
  assert.equal(game.altar!.phase, 'prompt');
  assert.equal(f.shell.previousState, 'paused');
  assert.match(f.shell.modal.innerHTML, /接受献祭/);
  assert.match(
    f.shell.modal.innerHTML,
    new RegExp(`年岁增加 ${game.altarCostYears.toFixed(1)} 年`),
  );
  assert.equal(writes.length, 1);
  const age = game.save.age;
  const cost = game.altarCostYears;
  dispatchAction(f.shell, 'resume');
  assert.equal(game.state, 'paused');
  assert.equal(writes.length, 1);
  dispatchAction(f.shell, 'accept-altar');
  assert.equal(game.state, 'playing');
  assert.equal(game.altar!.phase, 'accepted');
  assert.equal(game.save.age, age + cost);
  assert.deepEqual(writes.at(-1), { age: game.save.age, phase: 'accepted', state: 'playing' });
  assert.equal(f.shell.modal.innerHTML, '');
  dispatchAction(f.shell, 'accept-altar');
  assert.equal(game.save.age, age + cost);
});

test('正式Game的prompt快照读回后，经真实restoreRun仍暂停并渲染单卡', () => {
  const game = integratedEncounter();
  game.update(0.01);
  const restored = Game.restore(
    structuredClone(game.save),
    JSON.parse(JSON.stringify(game.snapshot())),
    () => 0.5,
  );
  assert.ok(restored);
  const f = shellFixture(restored, false);
  Object.assign(f.shell, {
    game: null,
    pendingRun: restored,
    assetsReady: true,
    ensureScene: () => true,
    frameRate: { reset() {} },
    realmInfo,
    FINAL_TRIAL_STAGE,
    renderHud() {},
  });
  restoreRun(f.shell);
  assert.equal(restored.state, 'paused');
  assert.equal(restored.altar!.phase, 'prompt');
  assert.match(f.shell.modal.innerHTML, /接受献祭/);
  dispatchAction(f.shell, 'close');
  assert.equal(restored.state, 'paused');
  dispatchAction(f.shell, 'leave-altar');
  assert.equal(restored.state, 'playing');
  assert.equal(restored.altar!.left, false);
  assert.equal(f.shell.modal.innerHTML, '');
});

test('正式Game自动误入不献祭，范围内关自动不弹窗，走出再手动重入才弹窗', () => {
  const game = integratedEncounter();
  const f = shellFixture(game, false);
  Object.assign(f.shell, { structuredClone, writeSave() {}, renderHud() {}, toast() {} });
  game.save.autoplay = true;
  const age = game.save.age;
  const hp = game.player.hp;
  game.update(0.01);
  assert.equal(game.altar!.left, false);
  assert.equal(game.altar!.phase, 'offered');
  assert.equal(game.state, 'playing');
  assert.equal(f.shell.modal.innerHTML, '');
  dispatchAction(f.shell, 'accept-altar');
  dispatchAction(f.shell, 'autoplay');
  assert.equal(game.save.autoplay, false);
  game.update(0.01);
  assert.equal(game.altar!.phase, 'offered');
  assert.equal(f.shell.modal.innerHTML, '');
  assert.equal(game.player.hp, hp);
  assert.ok(game.save.age - age < 0.01, '仅计入两帧正常历练年岁，不扣献祭年岁');
  game.player.x = game.altar!.x + 100;
  game.update(0.01);
  assert.equal(game.altar!.left, true);
  game.player.x = game.altar!.x;
  game.update(0.01);
  assert.equal(game.state, 'paused');
  assert.equal(game.altar!.phase, 'prompt');
  assert.match(f.shell.modal.innerHTML, /接受献祭/);
});

test('所有通用返回、恢复、导航和自动开关动作都不能绕过prompt', () => {
  for (const action of [
    'resume',
    'close',
    'pause',
    'abandon',
    'return',
    'home',
    'start',
    'new-run',
    'autoplay',
    'guide',
    'damage',
  ]) {
    const f = shellFixture();
    dispatchAction(f.shell, action);
    assert.equal(f.shell.game.state, 'paused', action);
    assert.equal(f.shell.game.altar.phase, 'prompt', action);
    assert.equal(f.shell.panel, 'altar', action);
    assert.match(f.shell.modal.innerHTML, /接受献祭/);
    assert.equal(f.accepted() + f.left(), 0);
    assert.equal(f.calls.includes('persist'), false);
  }
});

for (const action of ['accept-altar', 'leave-altar']) {
  test(`${action}通过Game事件恢复界面并只保存一次，重复动作不再执行`, () => {
    const f = shellFixture();
    renderPause(f.shell);
    dispatchAction(f.shell, action);
    assert.equal(f.shell.game.state, 'playing');
    assert.equal(f.shell.panel, '');
    assert.equal(f.shell.modal.innerHTML, '');
    assert.equal(f.shell.previousState, 'playing');
    assert.equal(f.calls.filter((call) => call === 'persist').length, 1);
    assert.equal(f.accepted(), action === 'accept-altar' ? 1 : 0);
    assert.equal(f.left(), action === 'leave-altar' ? 1 : 0);
    dispatchAction(f.shell, action);
    assert.equal(f.accepted() + f.left(), 1);
  });
}

test('寿元不足或Game拒绝接受时保留prompt，无保存或恢复', () => {
  const f = shellFixture();
  Object.defineProperty(f.shell.game, 'canAcceptAltar', { value: false });
  dispatchAction(f.shell, 'accept-altar');
  assert.equal(f.accepted(), 0);
  assert.match(f.shell.modal.innerHTML, /disabled>寿元不足以献祭/);
  Object.defineProperty(f.shell.game, 'canAcceptAltar', { value: true });
  f.shell.game.acceptAltar = () => false;
  dispatchAction(f.shell, 'accept-altar');
  assert.equal(f.shell.game.state, 'paused');
  assert.equal(f.calls.includes('persist'), false);
});

test('祭坛现世与隐去事件保留手动及自动走位输入，仍更新HUD并保存', () => {
  for (const autoplay of [false, true]) {
    for (const phase of ['offered', 'gone']) {
      const game = encounter(0, phase);
      game.save.autoplay = autoplay;
      game.input = { x: 0.6, y: -0.8 };
      const input = game.input;
      const keys = new Set(['w', 'd']);
      const destination = { x: 200, y: 300 };
      const f = shellFixture(game);
      f.shell.clearInput = () => {
        f.calls.push('clear');
        game.input = { x: 0, y: 0 };
        keys.clear();
        destination.x = destination.y = 0;
      };
      gameEvent(f.shell, 'altar');
      assert.deepEqual(f.calls, ['hud', 'persist']);
      assert.equal(game.input, input);
      assert.deepEqual(game.input, { x: 0.6, y: -0.8 });
      assert.deepEqual([...keys], ['w', 'd']);
      assert.deepEqual(destination, { x: 200, y: 300 });
      assert.equal(f.shell.modal.innerHTML, '');
    }
  }
});

test('已有祭坛面板的接受或离开事件清输入并关闭面板', () => {
  for (const phase of ['accepted', 'offered']) {
    const f = shellFixture(encounter(0, phase));
    f.shell.panel = 'altar';
    f.shell.modal.innerHTML = '献祭面板';
    gameEvent(f.shell, 'altar');
    assert.deepEqual(f.calls, ['clear', 'hud', 'persist']);
    assert.equal(f.shell.panel, '');
    assert.equal(f.shell.modal.innerHTML, '');
  }
});

test('prompt事件即时清输入、更新面板并保存，保存错误及锁档界面不会被后续清掉', () => {
  const f = shellFixture();
  gameEvent(f.shell, 'altar');
  assert.equal(f.shell.previousState, 'paused');
  assert.equal(f.shell.panel, 'altar');
  assert.deepEqual(f.calls, ['clear', 'hud', 'persist']);
  const errors: string[] = [];
  f.shell.persist = () => {
    errors.push('浏览器暂时无法保存进度，请勿关闭当前页面');
    return false;
  };
  dispatchAction(f.shell, 'accept-altar');
  assert.equal(errors.length, 1);
  const locked = shellFixture();
  locked.shell.persist = () => {
    locked.shell.saveLock = 'stale';
    locked.shell.panel = 'save-lock';
    locked.shell.modal.innerHTML = '存档已在其他窗口更新';
    return false;
  };
  dispatchAction(locked.shell, 'leave-altar');
  assert.equal(locked.shell.panel, 'save-lock');
  assert.equal(locked.shell.modal.innerHTML, '存档已在其他窗口更新');
});

test('恢复prompt续局仍显示单卡且保持暂停，不提供通用关闭', () => {
  const f = shellFixture();
  const pending = f.shell.game;
  Object.assign(f.shell, {
    game: null,
    pendingRun: pending,
    assetsReady: true,
    ensureScene: () => true,
    frameRate: { reset() {} },
    realmInfo,
    FINAL_TRIAL_STAGE,
    renderHud() {},
  });
  restoreRun(f.shell);
  assert.equal(f.shell.game, pending);
  assert.equal(pending.state, 'paused');
  assert.equal(f.shell.panel, 'altar');
  assert.match(f.shell.modal.innerHTML, /data-action="leave-altar"/);
  assert.doesNotMatch(f.shell.modal.innerHTML, /data-action="close"/);
});

test('自动历练误入70内且left=false不弹卡不献祭，范围内关闭自动仍等待Game的手动重入', () => {
  const f = shellFixture(encounter(0, 'offered'));
  const game = f.shell.game;
  game.altar.x = game.player.x + 50;
  game.altar.y = game.player.y;
  game.altar.left = false;
  game.save.autoplay = true;
  const before = JSON.stringify({ altar: game.altar, age: game.save.age, hp: game.player.hp });
  gameEvent(f.shell, 'altar');
  assert.equal(f.shell.modal.innerHTML, '');
  dispatchAction(f.shell, 'accept-altar');
  assert.equal(f.accepted(), 0);
  assert.equal(game.save.autoplay, true);
  Object.assign(f.shell, {
    structuredClone,
    writeSave() {},
    renderHud() {},
    toast() {},
  });
  dispatchAction(f.shell, 'autoplay');
  assert.equal(game.save.autoplay, false);
  gameEvent(f.shell, 'altar');
  dispatchAction(f.shell, 'accept-altar');
  assert.equal(f.shell.modal.innerHTML, '');
  assert.equal(f.accepted() + f.left(), 0);
  assert.equal(game.state, 'playing');
  assert.equal(
    JSON.stringify({ altar: game.altar, age: game.save.age, hp: game.player.hp }),
    before,
  );
  // 离开范围并手动重入后的phase由Game负责；UI只响应明确的prompt事件。
  game.altar.phase = 'prompt';
  game.state = 'paused';
  gameEvent(f.shell, 'altar');
  assert.match(f.shell.modal.innerHTML, /data-action="accept-altar"/);
});

test('主入口键盘1接受、Esc离开，长按及P/E/2/3不穿透到通用暂停或选技', () => {
  const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
  const listener = main.match(
    /document\.addEventListener\('keydown', \(event\) => \{\n([^]*?)\n\}\);/,
  );
  assert.ok(listener);
  const input = readFileSync(new URL('../src/input-controller.ts', import.meta.url), 'utf8');
  const helper = input.match(/export function altarPromptKey[^]*?\n\}/);
  assert.ok(helper);
  const actions: string[] = [];
  const context = createContext({
    game: encounter(),
    modal: { innerHTML: '' },
    saveLock: null,
    trapModalTab: () => false,
    handleAction: (action: string) => actions.push(action),
    document: {
      addEventListener: (_: string, handler: unknown) => {
        context.listener = handler;
      },
    },
  });
  runInContext(stripTypeScriptTypes(helper[0].replace('export ', '')), context);
  runInContext(stripTypeScriptTypes(listener[0]), context);
  for (const [key, repeat] of [
    ['1', false],
    ['Escape', false],
    ['1', true],
    ['Escape', true],
    ['p', false],
    ['e', false],
    ['2', false],
    ['3', false],
  ]) {
    context.event = { key, repeat, target: { matches: () => false }, preventDefault() {} };
    runInContext('listener(event)', context);
  }
  assert.deepEqual(actions, ['accept-altar', 'leave-altar']);
});

test('祭坛伤害单列并从其他伤害扣除，不改变法宝或反伤统计', () => {
  const game = encounter();
  game.damageDealt = 100;
  game.damageBySource = { sword: 50, bone: 30, altar: 20 };
  const html = damageReport(game);
  assert.match(html, /秘境祭坛<\/strong><span>20 <b>20\.0%/);
  assert.match(html, /白骨魔甲 · 反伤/);
  assert.doesNotMatch(html, /其他伤害/);
});

function hudFixture(run: (get: (id: string) => any) => void) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const elements = new Map<string, any>();
  const get = (id: string): any => {
    if (!elements.has(id))
      elements.set(id, {
        textContent: '',
        innerHTML: '',
        hidden: false,
        style: {},
        classList: { toggle() {} },
        setAttribute() {},
        firstElementChild: { textContent: '' },
        lastElementChild: { hidden: true },
        querySelector: (selector: string) => get(`${id} ${selector}`),
      });
    return elements.get(id);
  };
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: { getElementById: get, querySelector: get },
  });
  try {
    run(get);
  } finally {
    if (previous) Object.defineProperty(globalThis, 'document', previous);
    else Reflect.deleteProperty(globalThis, 'document');
  }
}

test('真实BattleHud优先守匣逻辑，结束后回落到祭坛，不将祭坛写入药效HUD', () =>
  hudFixture((get) => {
    const game = encounter(0, 'offered');
    const hud = Object.assign(Object.create(BattleHud.prototype), {
      save: game.save,
      layout: { update() {} },
      recoveryNotice: { update() {} },
      lastLoadout: '',
    });
    game.cacheChallenge = { x: 200, y: 0, phase: 'offered', deadline: 120 };
    hud.update(game);
    assert.match(get('cache-status').textContent, /守匣灵阵 → 200 步/);
    game.cacheChallenge.phase = 'active';
    hud.update(game);
    assert.equal(get('cache-status').textContent, '守匣挑战 · 剩余 20 秒');
    game.cacheChallenge.phase = 'gone';
    hud.update(game);
    assert.equal(get('cache-status').textContent, altarHudStatus(game));
    assert.equal(get('cache-prompt').hidden, false);
    game.altar.phase = 'accepted';
    game.altar.regenUntil = 120;
    hud.update(game);
    assert.equal(get('cache-status').textContent, `${ALTARS[0].name} · 剩余 20 秒`);
    assert.equal(get('medicine-hud').innerHTML, '');
    game.time = 120;
    hud.update(game);
    assert.equal(get('cache-prompt').hidden, true);
    game.altar.phase = 'offered';
    game.time = 100;
    game.state = 'paused';
    hud.update(game);
    assert.equal(get('cache-prompt').hidden, true);
  }));
