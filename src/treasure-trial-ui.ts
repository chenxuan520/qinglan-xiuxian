import styles from './treasure-trial.css?inline';
import { treasure, passive } from './data.ts';
import { icon, smallIcon } from './icons.ts';
import { computeManualInput, trapModalTab } from './input-controller.ts';
import { Renderer } from './render.ts';
import { readDamageNumbers } from './damage-numbers.ts';
import { resourceFailureContent } from './resource-panel.ts';
import { TreasureTrial, type TrialForm, type TrialFormation } from './treasure-trial.ts';
import { destinationInput } from './walk-navigation.ts';

export let stopTreasureTrial = () => {};

// The original detail nodes remain untouched while this isolated stage is open.
export function startTreasureTrial(
  ui: HTMLDivElement,
  modal: HTMLDivElement,
  treasureId: string,
  onClose: () => void,
  valid: () => boolean,
) {
  stopTreasureTrial();
  if (!valid()) {
    onClose();
    return;
  }
  const item = treasure(treasureId);
  const original = document.createDocumentFragment();
  const focused = document.activeElement;
  const inert = ui.inert;
  const scrolls = [modal, ...modal.querySelectorAll<HTMLElement>('*')]
    .filter((node) => node.scrollTop || node.scrollLeft)
    .map((node) => ({ node, top: node.scrollTop, left: node.scrollLeft }));
  const root = document.createElement('section');
  root.className = 'treasure-trial';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-labelledby', 'treasure-trial-title');
  root.innerHTML = `<canvas class="treasure-trial-canvas" aria-label="法宝自动施放，可移动试演人物"></canvas><header class="treasure-trial-header"><div class="treasure-trial-heading">${icon(item.id, item.color)}<div><p>藏器阁 · 试宝</p><h2 id="treasure-trial-title">${item.name}</h2></div></div><button class="treasure-trial-return" data-trial="exit">返回详情 ${smallIcon('close')}</button></header><div class="treasure-trial-tools"><button data-trial="pause" disabled>${smallIcon('pause')}<span>暂停</span></button><button data-trial="reset" disabled>${smallIcon('refresh')}<span>重置</span></button></div><div class="treasure-trial-message" role="status"><p>正在布置试演…</p></div><footer class="treasure-trial-controls"><div class="treasure-trial-options"><div class="treasure-trial-group" role="group" aria-label="试演器势"><span>器势</span><div>${[
    ['one', '一重'],
    ['six', '六重'],
    ['evolved', '仙器'],
  ]
    .map(
      ([id, label]) =>
        `<button data-trial-form="${id}" aria-pressed="${id === 'one'}" disabled>${label}</button>`,
    )
    .join(
      '',
    )}</div></div><div class="treasure-trial-group" role="group" aria-label="试演敌阵"><span>敌阵</span><div>${[
    ['scattered', '散布群怪'],
    ['surround', '近身包围'],
    ['single', '单个强敌'],
  ]
    .map(
      ([id, label]) =>
        `<button data-trial-formation="${id}" aria-pressed="${id === 'scattered'}" disabled>${label}</button>`,
    )
    .join(
      '',
    )}</div></div></div><div class="treasure-trial-notes"><p class="treasure-trial-movement">点击前往 · WASD / 方向键走位</p><p data-trial-condition>统一试演条件 · 不计此世养成</p><p data-trial-passive>法宝自动施放 · 不耗年岁与物资，无收益</p></div></footer><div class="treasure-trial-stick" hidden><span></span></div>`;
  const style = document.createElement('style');
  style.textContent = styles;
  root.prepend(style);
  const canvas = root.querySelector<HTMLCanvasElement>('canvas')!;
  const renderer = new Renderer(canvas);
  renderer.showDamageNumbers = readDamageNumbers();
  const trial = new TreasureTrial(item.id);
  const message = root.querySelector<HTMLElement>('.treasure-trial-message')!;
  const pauseButton = root.querySelector<HTMLButtonElement>('[data-trial="pause"]')!;
  const stick = root.querySelector<HTMLElement>('.treasure-trial-stick')!;
  const held = new Set<string>();
  const abort = new AbortController();
  const options = { signal: abort.signal };
  const capture = { ...options, capture: true };
  let closed = false;
  let ready = false;
  let paused = false;
  let dirty = true;
  let loading = false;
  let animation = 0;
  let last = performance.now();
  let lastStatus = 0;
  let drag: { id: number; x: number; y: number } | null = null;
  let touch = { x: 0, y: 0 };
  let destination: { x: number; y: number } | null = null;

  function current() {
    return !closed && valid() && root.isConnected && modal.contains(root);
  }
  function clearInput() {
    held.clear();
    touch = { x: 0, y: 0 };
    destination = null;
    const pointer = drag?.id;
    drag = null;
    if (pointer !== undefined && canvas.hasPointerCapture(pointer))
      canvas.releasePointerCapture(pointer);
    stick.hidden = true;
    trial.game.input = { x: 0, y: 0 };
  }
  function close() {
    if (closed) return;
    const restore = current();
    closed = true;
    clearInput();
    abort.abort();
    cancelAnimationFrame(animation);
    canvas.width = canvas.height = 0;
    if (restore) {
      modal.replaceChildren(original);
      ui.inert = inert;
      for (const scroll of scrolls) {
        scroll.node.scrollTop = scroll.top;
        scroll.node.scrollLeft = scroll.left;
      }
      if (focused instanceof HTMLElement && focused.isConnected)
        focused.focus({ preventScroll: true });
    } else root.remove();
    stopTreasureTrial = () => {};
    onClose();
  }
  stopTreasureTrial = close;

  function setPaused(next: boolean) {
    paused = next;
    clearInput();
    last = performance.now();
    dirty = true;
    root.dataset.paused = String(paused);
    pauseButton.innerHTML = `${smallIcon(paused ? 'play' : 'pause')}<span>${paused ? '继续' : '暂停'}</span>`;
    pauseButton.setAttribute('aria-label', paused ? '继续试演' : '暂停试演');
  }
  function resizeTrial() {
    const top = Math.max(
      root.querySelector('.treasure-trial-header')!.getBoundingClientRect().bottom,
      root.querySelector('.treasure-trial-tools')!.getBoundingClientRect().bottom,
    );
    const bottom = root.querySelector('.treasure-trial-controls')!.getBoundingClientRect().top;
    const halfHeight = Math.max(
      60,
      Math.min(renderer.height / 2 - top, bottom - renderer.height / 2),
    );
    trial.resize(renderer.width / renderer.scale, (halfHeight * 2) / renderer.scale);
  }
  function reset(form = trial.form, formation = trial.formation) {
    clearInput();
    resizeTrial();
    trial.reset(form, formation);
    last = performance.now();
    dirty = true;
    root.dataset.form = trial.form;
    root.dataset.formation = trial.formation;
    root.querySelector('h2')!.textContent = form === 'evolved' ? item.evolution : item.name;
    root.querySelectorAll<HTMLButtonElement>('[data-trial-form]').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.trialForm === form));
    });
    root.querySelectorAll<HTMLButtonElement>('[data-trial-formation]').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.trialFormation === formation));
    });
    root.dataset.elapsed = '0';
    root.querySelector('[data-trial-passive]')!.textContent =
      form === 'evolved'
        ? `配套 ${passive(trial.recipe).name}五重 · 不耗年岁与物资，无收益`
        : '法宝自动施放 · 不耗年岁与物资，无收益';
  }
  async function prepare() {
    if (loading || !current()) return;
    loading = true;
    message.hidden = false;
    message.innerHTML = '<p>正在布置试演…</p>';
    try {
      await renderer.prepareScene(0, false, [], () => {}, [], true);
      if (!current()) return;
      ready = true;
      root.dataset.ready = 'true';
      root.querySelectorAll<HTMLButtonElement>('button[disabled]').forEach((button) => {
        button.disabled = false;
      });
      message.hidden = true;
      reset();
    } catch {
      if (!current()) return;
      message.innerHTML = resourceFailureContent(
        '',
        '试演场景尚未载入，请重试。',
        '重新加载',
        false,
      );
    } finally {
      loading = false;
    }
  }

  root.addEventListener(
    'click',
    (event) => {
      event.stopPropagation();
      const button = (event.target as Element).closest<HTMLButtonElement>('button');
      if (!button || button.disabled || !current()) return;
      if (button.dataset.trial === 'exit') close();
      else if (button.hasAttribute('data-resource-retry')) void prepare();
      else if (!ready) return;
      else if (button.dataset.trial === 'pause') setPaused(!paused);
      else if (button.dataset.trial === 'reset') reset();
      else if (['one', 'six', 'evolved'].includes(button.dataset.trialForm ?? ''))
        reset(button.dataset.trialForm as TrialForm);
      else if (['scattered', 'surround', 'single'].includes(button.dataset.trialFormation ?? ''))
        reset(trial.form, button.dataset.trialFormation as TrialFormation);
    },
    options,
  );
  window.addEventListener(
    'keydown',
    (event) => {
      if (!current()) return;
      const key = event.key.toLowerCase();
      if (key === 'escape') {
        event.preventDefault();
        if (!event.repeat) close();
      } else if (key === 'tab') trapModalTab(event, modal);
      else if (key === 'p') {
        event.preventDefault();
        if (ready && !event.repeat) setPaused(!paused);
      } else if (
        ['w', 'a', 's', 'd', 'arrowup', 'arrowleft', 'arrowdown', 'arrowright'].includes(key)
      ) {
        event.preventDefault();
        if (ready && !paused) {
          held.add(key);
          destination = null;
        }
      }
      event.stopImmediatePropagation();
    },
    capture,
  );
  window.addEventListener(
    'keyup',
    (event) => {
      held.delete(event.key.toLowerCase());
      event.stopImmediatePropagation();
    },
    capture,
  );
  canvas.addEventListener(
    'pointerdown',
    (event) => {
      if (!ready || paused || drag || !event.isPrimary || event.button !== 0) return;
      event.preventDefault();
      clearInput();
      if (event.pointerType === 'mouse') {
        const box = canvas.getBoundingClientRect();
        destination = {
          x: trial.game.player.x + (event.clientX - box.left - box.width / 2) / renderer.scale,
          y: trial.game.player.y + (event.clientY - box.top - box.height / 2) / renderer.scale,
        };
      } else {
        drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
        canvas.setPointerCapture(event.pointerId);
        stick.style.left = `${event.clientX}px`;
        stick.style.top = `${event.clientY}px`;
        stick.firstElementChild!.setAttribute('style', '');
        stick.hidden = false;
      }
    },
    options,
  );
  canvas.addEventListener(
    'pointermove',
    (event) => {
      if (!drag || drag.id !== event.pointerId) return;
      const x = event.clientX - drag.x;
      const y = event.clientY - drag.y;
      const factor = Math.min(1, 38 / Math.max(1, Math.hypot(x, y)));
      touch = { x: (x * factor) / 38, y: (y * factor) / 38 };
      (stick.firstElementChild as HTMLElement).style.transform =
        `translate(${x * factor}px, ${y * factor}px)`;
    },
    options,
  );
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'])
    canvas.addEventListener(
      type,
      (event) => {
        if (drag?.id === (event as PointerEvent).pointerId) clearInput();
      },
      options,
    );
  window.addEventListener('blur', () => setPaused(true), options);
  document.addEventListener(
    'visibilitychange',
    () => {
      if (document.hidden) setPaused(true);
      else {
        renderer.restore();
        dirty = true;
        last = performance.now();
      }
    },
    options,
  );
  window.addEventListener('pagehide', close, options);
  window.addEventListener(
    'resize',
    () => {
      clearInput();
      renderer.resize();
      resizeTrial();
      dirty = true;
      last = performance.now();
    },
    options,
  );
  function frame(now: number) {
    if (!current()) {
      close();
      return;
    }
    animation = requestAnimationFrame(frame);
    const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
    last = now;
    if (!ready || document.hidden || !document.hasFocus()) return;
    if (!paused) {
      const input = destination
        ? destinationInput(trial.game.player, destination, trial.game.stats.speed * dt)
        : computeManualInput(held, touch);
      if (destination && !input.x && !input.y) destination = null;
      trial.update(dt, input);
    }
    if (!paused || dirty || renderer.needsRedraw) {
      renderer.draw(trial.game, now, 0);
      dirty = false;
    }
    if (now - lastStatus >= 250) {
      root.dataset.elapsed = trial.game.time.toFixed(2);
      lastStatus = now;
    }
  }
  try {
    while (modal.firstChild) original.append(modal.firstChild);
    ui.inert = true;
    modal.append(root);
    root.dataset.form = trial.form;
    root.dataset.formation = trial.formation;
    root.querySelector<HTMLButtonElement>('[data-trial="exit"]')!.focus({ preventScroll: true });
    animation = requestAnimationFrame(frame);
    void prepare();
  } catch (error) {
    close();
    throw error;
  }
}
