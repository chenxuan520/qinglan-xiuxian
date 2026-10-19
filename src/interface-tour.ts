import { freshSave, settleRun, type SaveData } from './progress.ts';
import { Game } from './game.ts';
import { Renderer } from './render.ts';
import { BattleHud } from './battle-hud.ts';
import type { MobileDisplay } from './mobile-display.ts';
import { PanelHost, type PanelDefinition } from './panel-host.ts';
import { lobbyView, settlementModal, upgradeChoicesModal } from './lobby-ui.ts';
import { settingsContent } from './settings-ui.ts';
import { cultivationPanel } from './cultivation-ui.ts';
import { catalogPanel } from './catalog-ui.ts';
import { medicineContent } from './medicine-ui.ts';
import { TREASURES, xpNeeded } from './data.ts';
import { TOUR_STEPS, tourPlacement } from './interface-tour-model.ts';

export let tourActive = false;
export let stopInterfaceTour = () => {};

// Only templates and an isolated Game are used here. No actions, telemetry or persistence.
export function startInterfaceTour(
  ui: HTMLDivElement,
  modal: HTMLDivElement,
  onClose: () => void,
  automatic = false,
  roots?: Pick<SaveData, 'spiritRoot' | 'rootElements' | 'path' | 'starter'>,
) {
  if (tourActive) return;
  const originalUi = document.createDocumentFragment();
  const originalModal = document.createDocumentFragment();
  const focused = document.activeElement;
  const bodyClass = document.body.className;
  const scrolls = [
    ui,
    modal,
    ...ui.querySelectorAll<HTMLElement>('*'),
    ...modal.querySelectorAll<HTMLElement>('*'),
  ]
    .filter((node) => node.scrollTop || node.scrollLeft)
    .map((node) => ({ node, top: node.scrollTop, left: node.scrollLeft }));
  const inert = ui.inert;
  const hiddenUi = ui.getAttribute('aria-hidden');
  const hiddenModal = modal.getAttribute('aria-hidden');
  let seed = 87123;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const sample = freshSave(
    roots?.spiritRoot ?? 'heaven',
    roots ? [...roots.rootElements] : ['metal'],
    roots?.path ?? 'orthodox',
    random,
  );
  if (roots) {
    sample.starter = roots.starter;
    sample.artifacts = [...new Set([...sample.artifacts, roots.starter])];
  }
  sample.cultivation = 1;
  sample.stones = 300;
  sample.iron = 12;
  const display = { available: false, active: false } as MobileDisplay;
  const canvas = document.createElement('canvas');
  canvas.className = 'tour-canvas';
  const renderer = new Renderer(canvas);
  let hud = new BattleHud(ui, sample, display);
  const host = new PanelHost(modal, ui);
  const overlay = document.createElement('div');
  overlay.className = 'interface-tour';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'tour-title');
  overlay.innerHTML = `<svg class="tour-shade" aria-hidden="true"><defs><mask id="tour-mask"><rect width="100%" height="100%" fill="white"/><rect class="tour-hole" rx="8" fill="black"/></mask></defs><rect width="100%" height="100%" fill="#020e0c" fill-opacity=".8" mask="url(#tour-mask)"/></svg><div class="tour-outline" aria-hidden="true"></div><section class="tour-card" aria-live="polite"><header><span class="tour-progress"></span></header><h2 id="tour-title"></h2><p class="tour-copy"></p><small class="tour-tip"></small><div class="tour-steps" aria-hidden="true"></div></section><nav class="tour-navigation" aria-label="界面导览操作"><button class="secondary-button" data-tour="previous">上一步</button><button class="primary-button" data-tour="next">下一步 →</button><button class="tour-exit" data-tour="exit" aria-label="${automatic ? '跳过新手引导' : '退出界面导览'}">${automatic ? '跳过' : '退出'}</button></nav>`;
  const card = overlay.querySelector<HTMLElement>('.tour-card')!;
  const navigation = overlay.querySelector<HTMLElement>('.tour-navigation')!;
  const hole = overlay.querySelector<SVGRectElement>('.tour-hole')!;
  const outline = overlay.querySelector<HTMLElement>('.tour-outline')!;
  const abort = new AbortController();
  const options = { capture: true, signal: abort.signal };
  let index = 0;
  let closed = false;
  let ready = false;
  let failed = false;
  let animation = 0;
  let layoutFrame = 0;
  const cardResize = new ResizeObserver(() => {
    cancelAnimationFrame(layoutFrame);
    layoutFrame = requestAnimationFrame(() => position(true));
  });
  let last = performance.now();
  let scene = '';
  let preview = new Game(structuredClone(sample), 0, 0, random);
  let move = { x: 0, y: 0 };
  let drag: { x: number; y: number; id: number } | null = null;
  let dragged = false;
  const held = new Set<string>();

  function close() {
    if (closed) return;
    closed = true;
    abort.abort();
    cancelAnimationFrame(animation);
    cancelAnimationFrame(layoutFrame);
    cardResize.disconnect();
    overlay.remove();
    canvas.remove();
    ui.replaceChildren(originalUi);
    modal.replaceChildren(originalModal);
    ui.inert = inert;
    for (const [node, hidden] of [
      [ui, hiddenUi],
      [modal, hiddenModal],
    ] as const) {
      if (hidden === null) node.removeAttribute('aria-hidden');
      else node.setAttribute('aria-hidden', hidden);
    }
    document.body.className = bodyClass;
    for (const scroll of scrolls) {
      scroll.node.scrollTop = scroll.top;
      scroll.node.scrollLeft = scroll.left;
    }
    tourActive = false;
    onClose();
    stopInterfaceTour = () => {};
    if (focused instanceof HTMLElement && focused.isConnected)
      focused.focus({ preventScroll: true });
  }
  stopInterfaceTour = close;

  function panel(name: string, definition: PanelDefinition) {
    host.frame(name, definition.title, definition.subtitle, definition.body, definition.wide);
  }
  function renderScene(next: string) {
    if (scene === next) return;
    scene = next;
    move = { x: 0, y: 0 };
    held.clear();
    drag = null;
    document.body.className = 'tour-active';
    modal.innerHTML = '';
    modal.setAttribute('aria-hidden', 'true');
    ui.innerHTML = lobbyView(sample, 0, 0, false, display, null, true, true, innerWidth < 650);
    ui.scrollTop = 0;
    if (next === 'settings')
      panel(next, { title: '设置', subtitle: '游戏选项', body: settingsContent(sample) });
    if (next === 'cultivation') panel(next, cultivationPanel(sample, 0));
    if (next === 'treasure')
      panel(
        'treasure-detail',
        catalogPanel(sample, {
          panel: 'treasure-detail',
          catalogTreasures: TREASURES,
          schoolFilter: 'all',
          treasurePage: 0,
          selectedTreasure: sample.starter,
          bookTab: 'treasures',
        }),
      );
    if (next === 'medicine')
      panel(next, {
        title: '一炉丹香',
        subtitle: '炼丹炉',
        body: medicineContent(sample, 0, 'bag', false, false),
        wide: true,
      });
    if (['battle', 'upgrade', 'result'].includes(next)) {
      preview = new Game(structuredClone(sample), 0, 0, random);
      for (let i = 0; i < 180; i++) preview.update(1 / 30);
      hud = new BattleHud(ui, preview.save, display);
      hud.render(preview, false, true);
      ui.insertAdjacentHTML(
        'beforeend',
        '<div class="tour-practice-area" aria-hidden="true"></div>',
      );
      if (next === 'upgrade') {
        preview.xp = xpNeeded(preview.level);
        preview.update(1 / 30);
        modal.innerHTML = upgradeChoicesModal(preview, sample);
        modal.removeAttribute('aria-hidden');
        modal.querySelector('[aria-modal]')?.removeAttribute('aria-modal');
      }
      if (next === 'result') {
        preview.state = 'won';
        const resultSave = structuredClone(sample);
        const rewards = settleRun(resultSave, {
          stage: 0,
          difficulty: 0,
          kills: preview.kills,
          time: preview.time,
          victory: true,
          iron: 0,
          level: preview.level,
          combatCultivation: preview.combatCultivation,
          spiritRoot: preview.spiritRoot,
        });
        modal.innerHTML = settlementModal(resultSave, preview, rewards, '炼气初期');
      }
    }
    // Preview panels are explained through the tour controls, never through live actions.
  }

  function position(scroll = false) {
    if (closed) return;
    const step = TOUR_STEPS[index];
    const target = document.querySelector<HTMLElement>(step.target);
    if (!target) {
      close();
      return;
    }
    if (scroll) target.scrollIntoView({ block: 'center', behavior: 'instant' });
    ui.querySelector<HTMLElement>('.tour-practice-area')?.style.setProperty(
      '--tour-card-height',
      `${card.offsetHeight}px`,
    );
    const place = () =>
      tourPlacement(
        target.getBoundingClientRect(),
        { width: innerWidth, height: navigation.getBoundingClientRect().top - 12 },
        { width: card.offsetWidth, height: card.offsetHeight },
      );
    let box = place();
    const overlaps = () =>
      Math.min(box.card.x + card.offsetWidth, box.hole.x + box.hole.width) >
        Math.max(box.card.x, box.hole.x) &&
      Math.min(box.card.y + card.offsetHeight, box.hole.y + box.hole.height) >
        Math.max(box.card.y, box.hole.y);
    if (scroll && overlaps()) {
      for (let parent = target.parentElement; parent; parent = parent.parentElement) {
        if (
          parent.scrollHeight <= parent.clientHeight ||
          !/(auto|scroll)/.test(getComputedStyle(parent).overflowY)
        )
          continue;
        parent.scrollTop +=
          target.getBoundingClientRect().top -
          Math.max(18, parent.getBoundingClientRect().top + parent.clientTop + 8);
        box = place();
        if (!overlaps()) break;
      }
    }
    for (const [key, value] of Object.entries(box.hole)) hole.setAttribute(key, String(value));
    Object.assign(outline.style, {
      left: `${box.hole.x}px`,
      top: `${box.hole.y}px`,
      width: `${box.hole.width}px`,
      height: `${box.hole.height}px`,
    });
    Object.assign(card.style, { left: `${box.card.x}px`, top: `${box.card.y}px` });
  }
  function show(next: number) {
    index = Math.max(0, Math.min(TOUR_STEPS.length - 1, next));
    const step = TOUR_STEPS[index];
    renderScene(step.scene);
    overlay.dataset.step = String(index);
    overlay.dataset.scene = step.scene;
    card.querySelector('.tour-progress')!.textContent =
      `${step.chapter} · ${index + 1} / ${TOUR_STEPS.length} · 演练`;
    card.querySelector('h2')!.textContent = step.title;
    card.querySelector('.tour-copy')!.textContent = step.copy;
    card.querySelector('.tour-tip')!.textContent =
      step.scene === 'battle'
        ? failed
          ? '场景未载入，可退出后重试。'
          : !ready
            ? '场景载入中…'
            : '轻点任意位置继续；拖动走位不会跳步。'
        : '轻点任意位置继续；演练不改变真实进度。';
    navigation.querySelector<HTMLButtonElement>('[data-tour="previous"]')!.disabled = index === 0;
    navigation.querySelector('[data-tour="next"]')!.textContent =
      index === TOUR_STEPS.length - 1 ? '完成导览 ✓' : '下一步 →';
    card.querySelector('.tour-steps')!.innerHTML = TOUR_STEPS.map(
      (_, i) => `<i${i <= index ? ' class="visited"' : ''}></i>`,
    ).join('');
    position(true);
    cancelAnimationFrame(layoutFrame);
    layoutFrame = requestAnimationFrame(() => position());
    navigation
      .querySelector<HTMLButtonElement>('[data-tour="next"]')!
      .focus({ preventScroll: true });
  }
  function input(event: Event) {
    const target = event.target as Element;
    const control = target.closest<HTMLElement>('[data-tour]');
    if (event.type === 'click') {
      if (dragged && event instanceof MouseEvent && event.detail > 0) {
        dragged = false;
      } else if (control?.dataset.tour === 'exit') close();
      else if (control?.dataset.tour === 'previous') show(index - 1);
      else if (index === TOUR_STEPS.length - 1) close();
      else show(index + 1);
    }
    // Let the tour buttons receive native focus / keyboard clicks; prevent every game action.
    if (!navigation.contains(target)) event.preventDefault();
    event.stopImmediatePropagation();
  }
  for (const name of ['click', 'input', 'change', 'submit', 'dblclick', 'contextmenu'])
    window.addEventListener(name, input, options);
  window.addEventListener(
    'keydown',
    (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
      } else if (event.key === 'Tab') {
        const buttons = [
          ...navigation.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'),
        ];
        const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
        event.preventDefault();
        buttons[(current + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length].focus();
      } else if (scene === 'upgrade' && /^[123]$/.test(event.key)) {
        event.preventDefault();
        preview.choose(Number(event.key) - 1);
        show(index + 1);
      } else if (
        ['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd'].includes(
          event.key.toLowerCase(),
        )
      ) {
        held.add(event.key.toLowerCase());
        event.preventDefault();
      }
      event.stopImmediatePropagation();
    },
    options,
  );
  window.addEventListener(
    'keyup',
    (event) => {
      held.delete(event.key.toLowerCase());
      event.stopImmediatePropagation();
    },
    options,
  );
  window.addEventListener(
    'blur',
    () => {
      held.clear();
      move = { x: 0, y: 0 };
      drag = null;
    },
    { signal: abort.signal },
  );
  window.addEventListener(
    'pointerdown',
    (event) => {
      dragged = false;
      if (card.contains(event.target as Node) || navigation.contains(event.target as Node)) return;
      // Preserve the browser's tap/click synthesis so tapping the scene advances on phones too.
      event.stopImmediatePropagation();
      if (TOUR_STEPS[index].scene === 'battle')
        drag = { x: event.clientX, y: event.clientY, id: event.pointerId };
    },
    options,
  );
  window.addEventListener(
    'pointermove',
    (event) => {
      if (!drag || drag.id !== event.pointerId) return;
      dragged ||= Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 8;
      move = { x: (event.clientX - drag.x) / 40, y: (event.clientY - drag.y) / 40 };
      event.preventDefault();
      event.stopImmediatePropagation();
    },
    options,
  );
  const release = () => {
    drag = null;
    move = { x: 0, y: 0 };
  };
  window.addEventListener('pointerup', release, { signal: abort.signal });
  window.addEventListener('pointercancel', release, { signal: abort.signal });
  for (const name of ['wheel', 'touchmove'])
    window.addEventListener(
      name,
      (event) => {
        if (!card.contains(event.target as Node)) event.preventDefault();
        event.stopImmediatePropagation();
      },
      { ...options, passive: false },
    );
  window.addEventListener('storage', close, options);
  window.addEventListener(
    'resize',
    () => {
      renderer.resize();
      position(true);
    },
    { signal: abort.signal },
  );
  window.visualViewport?.addEventListener('resize', () => position(true), { signal: abort.signal });
  document.addEventListener('scroll', () => position(), options);

  function animate(now: number) {
    if (closed) return;
    const dt = Math.min(0.04, (now - last) / 1000);
    last = now;
    if (ready) {
      if (scene === 'battle' && !document.hidden && document.hasFocus()) {
        const x =
          move.x +
          Number(held.has('d') || held.has('arrowright')) -
          Number(held.has('a') || held.has('arrowleft'));
        const y =
          move.y +
          Number(held.has('s') || held.has('arrowdown')) -
          Number(held.has('w') || held.has('arrowup'));
        preview.input = { x, y };
        preview.player.hp = preview.player.maxHp;
        preview.xp = Math.min(preview.xp, xpNeeded(preview.level) - 1);
        preview.update(dt);
        if (preview.state === 'upgrade') {
          preview.choices = [];
          preview.state = 'playing';
          preview.xp = 0;
        } else if (preview.state !== 'playing') {
          preview = new Game(structuredClone(sample), 0, 0, random);
          hud = new BattleHud(ui, preview.save, display);
        }
        hud.update(preview);
      }
      renderer.draw(
        ['battle', 'upgrade', 'result'].includes(scene) ? preview : null,
        now,
        0,
        0,
        sample.path,
      );
    }
    animation = requestAnimationFrame(animate);
  }
  try {
    tourActive = true;
    ui.setAttribute('aria-hidden', 'true');
    modal.setAttribute('aria-hidden', 'true');
    while (ui.firstChild) originalUi.append(ui.firstChild);
    while (modal.firstChild) originalModal.append(modal.firstChild);
    ui.inert = false;
    document.querySelector('#world')!.after(canvas);
    document.body.append(overlay);
    show(0);
    cardResize.observe(card);
    animation = requestAnimationFrame(animate);
    void renderer
      .prepareScene(0, false, [], () => {})
      .then(
        () => {
          if (closed) return;
          ready = true;
          show(index);
        },
        () => {
          if (closed) return;
          failed = true;
          show(index);
        },
      );
  } catch (error) {
    close();
    throw error;
  }
}
