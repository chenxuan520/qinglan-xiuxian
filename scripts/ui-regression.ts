// 正常入口的浏览器回归；独立存档、MCP 交互，产物仅写入忽略目录。
import assert from 'node:assert/strict';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { freshSave, readSave, IMMORTAL_CULTIVATION, type SaveData } from '../src/progress.ts';
import { Game } from '../src/game.ts';
import { formatTime, TRIAL_BOSS_TIMES } from '../src/data.ts';
import { TOUR_STEPS } from '../src/interface-tour-model.ts';
import { CURIO_IDS } from '../src/curio-data.ts';
import { assertLocalPage, openUiBrowser, optionalFontFailures } from './ui-browser.ts';

const baseUrl = new URL(process.env.UI_BASE_URL || 'http://localhost:5173/').href;
assertLocalPage(baseUrl);
const output = resolve('artifacts/ui-regression');
const screenshots = process.env.UI_SCREENSHOTS === '1';
const viewports = [
  ['desktop', '1440x1000x1'],
  ['phone', '390x844x1,mobile,touch'],
  ['narrow', '320x640x1,mobile,touch'],
  ['landscape', '844x390x1,mobile,touch,landscape'],
] as const;
await mkdir(output, { recursive: true });
await Promise.all(
  ['failure.png', 'failure.txt', 'report.json', 'console-errors.txt', 'network-requests.txt'].map(
    (name) => rm(resolve(output, name), { force: true }),
  ),
);
const browser = await openUiBrowser({ workspace: output });
let pageId = 0;
let checkpoint = 'startup';
const results: { name: string; layout: unknown }[] = [];

async function evaluate<T = any>(fn: string): Promise<T> {
  const text = await browser.call('evaluate_script', {
    pageId,
    function: fn,
    waitForStableDom: false,
  });
  const json = text.match(/```json\n([\s\S]*?)\n```/)?.[1];
  assert.ok(json, `浏览器未返回 JSON：${text}`);
  return JSON.parse(json);
}

async function wait(predicate: string) {
  await evaluate(`async () => {
    const ready = ${predicate};
    const until = performance.now() + 30000;
    while (!ready()) {
      if (performance.now() > until) throw Error('界面等待超时：' + ready);
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    // 公共字体可选；请求不可用时仍检查已显示的系统字体界面，不能卡住发布。
    let fontTimer;
    await Promise.race([document.fonts.ready, new Promise(resolve => {fontTimer = setTimeout(resolve, 2000)})]);
    clearTimeout(fontTimer);
    return true;
  }`);
}

async function elementId(selector: string) {
  // 临时标注仅用于从 MCP 可访问性树定位元素，取得 uid 后恢复原标签。
  const mark = `ui-regression-${Date.now()}`;
  const label = await evaluate(`() => {
    const node = document.querySelector(${JSON.stringify(selector)});
    if (!node) throw Error('未找到：' + ${JSON.stringify(selector)});
    const label = node.getAttribute('aria-label');
    node.setAttribute('aria-label', ${JSON.stringify(mark)});
    return label;
  }`);
  const snapshot = await browser.call('take_snapshot', { pageId });
  const uid = snapshot
    .split('\n')
    .find((line) => line.includes(`"${mark}"`))
    ?.match(/uid=(\S+)/)?.[1];
  await evaluate(`() => {
    const node = document.querySelector(${JSON.stringify(selector)});
    const label = ${JSON.stringify(label)};
    if (label === null) node.removeAttribute('aria-label');
    else node.setAttribute('aria-label', label);
    return true;
  }`);
  assert.ok(uid, `元素不在可操作树中：${selector}\n${snapshot}`);
  return uid;
}

async function click(selector: string) {
  await browser.call('click', { pageId, uid: await elementId(selector) });
}

async function saved(): Promise<SaveData> {
  return evaluate("() => JSON.parse(localStorage.getItem('qinglan-immortal-v1'))");
}

function fixture(late = false, upgrade = false) {
  const save = freshSave('heaven', ['metal'], 'dual', () => 0.5);
  save.prologueSeen = save.hometownSeen = true;
  save.mortal.hometown.stage = 'departed';
  save.autoplay = false;
  if (late) {
    save.cultivation = IMMORTAL_CULTIVATION;
    save.unlocked = 6;
    save.completed = [0, 1, 2, 3, 4, 5];
    save.age = 17421.3;
    save.tribulations = 100;
    save.stones = save.iron = 123456789;
    for (const id of ['mingqing', 'lingru', 'wuchang']) save.medicine.active[id] = save.age + 5000;
  }
  if (late || upgrade) {
    const game = new Game(save, late ? 6 : 0, 0, () => 0.5);
    game.state = upgrade ? 'upgrade' : 'paused';
    if (upgrade) {
      game.weapons = ['sword', 'fire', 'shard', 'ice', 'pagoda', 'skull'].map((id, index) => ({
        id,
        level: index === 0 ? 6 : 3,
        evolved: false,
        timer: 0,
      }));
      game.passives = { haste: 2, guard: 2, duration: 2 };
      game.choices = [
        { type: 'passive', id: 'area', level: 1 },
        { type: 'passive', id: 'power', level: 1 },
        { type: 'passive', id: 'spirit', level: 1 },
      ];
    }
    save.activeRun = game.snapshot();
    assert.ok(Game.restore(save, save.activeRun), '测试续局必须通过正式校验');
  }
  const restored = readSave(JSON.stringify(save));
  assert.equal(restored.status, 'ok', '测试档必须通过正式存档读取');
  assert.deepEqual(restored.save.medicine, save.medicine, '测试药效不能被存档校验丢弃');
  return save;
}

async function open(viewport: string, save: SaveData) {
  const text = await browser.call('new_page', {
    url: 'about:blank',
    isolatedContext: `ui-regression-${Date.now()}`,
  });
  pageId = Number(text.match(/(\d+):[^\n]*\[selected\]/)?.[1]);
  assert.ok(pageId, text);
  await browser.call('emulate', { pageId, viewport });
  await browser.call('navigate_page', {
    pageId,
    url: baseUrl,
    initScript: `localStorage.setItem('qinglan-telemetry-off','1');localStorage.setItem('qinglan-immortal-v1',${JSON.stringify(JSON.stringify(save))});`,
  });
  await wait('() => !!document.querySelector("[data-action=settings]")');
}

async function check(name: string, hud = false) {
  checkpoint = name;
  const layout = await evaluate(`() => {
    const box = node => {
      const b = node.getBoundingClientRect();
      return {left:b.left, top:b.top, right:b.right, bottom:b.bottom, width:b.width, height:b.height};
    };
    const visible = node => node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden';
    const buttons = [...document.querySelectorAll('.combat-actions button:not([data-action=mute])')].filter(visible);
    return {
      viewport: [innerWidth, innerHeight], pageWidth: document.documentElement.scrollWidth,
      panels: [...document.querySelectorAll('.panel,.upgrade-panel')].map(node => ({...box(node), scroll:node.scrollWidth, client:node.clientWidth})),
      buttons: buttons.map(node => ({action:node.dataset.action, ...box(node)})),
      player: document.querySelector('.player-panel') ? box(document.querySelector('.player-panel')) : null,
      timer: document.querySelector('.stage-timer') ? box(document.querySelector('.stage-timer')) : null,
    };
  }`);
  assert.ok(layout.pageWidth <= layout.viewport[0] + 1, `${name} 页面横向溢出`);
  for (const panel of layout.panels) {
    assert.ok(panel.scroll <= panel.client + 1, `${name} 面板横向溢出`);
    assert.ok(panel.left >= -1 && panel.right <= layout.viewport[0] + 1, `${name} 面板越界`);
  }
  if (hud) {
    assert.ok(layout.player && layout.timer && layout.buttons.length >= 5, `${name} HUD 缺失`);
    const intersect = (a: any, b: any) =>
      Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 &&
      Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1;
    for (const [i, button] of layout.buttons.entries()) {
      assert.ok(button.width >= 31 && button.height >= 27, `${name} ${button.action} 点击区过小`);
      assert.ok(button.left >= -1 && button.right <= layout.viewport[0] + 1, `${name} 按钮越界`);
      assert.ok(!intersect(button, layout.player), `${name} ${button.action} 与状态栏重叠`);
      assert.ok(!intersect(button, layout.timer), `${name} ${button.action} 与计时重叠`);
      for (const other of layout.buttons.slice(i + 1))
        assert.ok(!intersect(button, other), `${name} ${button.action}/${other.action} 重叠`);
    }
  }
  results.push({ name, layout });
  if (screenshots)
    await browser.call('take_screenshot', { pageId, filePath: resolve(output, `${name}.png`) });
  console.log(`通过：${name}`);
}

async function finishPage() {
  const errors = await browser.call('list_console_messages', {
    pageId,
    types: ['error'],
    pageSize: 100,
  });
  const fontFailures =
    /msgid=/.test(errors) &&
    optionalFontFailures(
      errors,
      await browser.call('list_network_requests', { pageId, pageSize: 1000 }),
    );
  if (fontFailures) console.log('公共字体暂不可用：系统字体界面检查通过，不依赖字体服务发布。');
  assert.doesNotMatch(
    fontFailures ? '' : errors,
    /msgid=|Uncaught|TypeError|ReferenceError|SyntaxError|出了点状况/,
    `浏览器错误：${errors}`,
  );
  await browser.call('close_page', { pageId });
  pageId = 0;
}

async function checkDebugCurios(name: string, viewport: string) {
  await open(viewport, fixture());
  await evaluate(`() => {
    const original = window.fetch.bind(window);
    window.debugAccessCalls = 0;
    window.fetch = (...args) => {
      if (String(args[0]).endsWith('/debug/access')) {
        window.debugAccessCalls++;
        return Promise.resolve(Response.json({enabled:true}));
      }
      return original(...args);
    };
    return true;
  }`);
  await click('[data-action=about]');
  await click('[data-action=debug-version]');
  for (let i = 1; i < 7; i++) await browser.call('press_key', { pageId, key: 'Enter' });
  await wait('() => !!document.querySelector("#debug-tools")');
  await evaluate(`() => {
    const kind = document.querySelector('#debug-tools [name=kind]');
    kind.value = 'curio';
    kind.dispatchEvent(new Event('change', {bubbles:true}));
    return true;
  }`);
  for (const id of CURIO_IDS) {
    checkpoint = `${name}-debug-${id}`;
    await evaluate(`() => {
      const selection = document.querySelector('#debug-tools [name=id]');
      selection.value = ${JSON.stringify(id)};
      selection.dispatchEvent(new Event('change', {bubbles:true}));
      return true;
    }`);
    assert.equal(
      await evaluate('() => document.querySelector("#debug-tools button[type=submit]").disabled'),
      false,
      '选择尚未获得的奇物可以发放',
    );
    await click('#debug-tools button[type=submit]');
    await wait(
      `() => document.querySelector('#debug-status')?.textContent.includes('已保存') && !document.querySelector('#debug-tools fieldset').disabled`,
    );
    assert.deepEqual(
      await evaluate(`() => ({
        id: document.querySelector('#debug-tools [name=id]').value,
        stock: document.querySelector('#debug-stock').textContent,
        disabled: document.querySelector('#debug-tools button[type=submit]').disabled,
        quantity: !!document.querySelector('#debug-tools [name=quantity]'),
      })`),
      { id, stock: '当前持有 1', disabled: true, quantity: false },
      '发放后保留刚发放的奇物，显示一件并禁止再次发放',
    );
    const before = await saved();
    assert.equal(before.curios.bag[id], 1);
    const calls = await evaluate('() => window.debugAccessCalls');
    await evaluate(`() => {
      const form = document.querySelector('#debug-tools form');
      for (let i=0; i<2; i++) form.dispatchEvent(new Event('submit', {bubbles:true,cancelable:true}));
      return true;
    }`);
    assert.equal(await evaluate('() => window.debugAccessCalls'), calls);
    assert.deepEqual(await saved(), before, '重复提交不请求权限、不重复发放');
    await check(checkpoint);
  }
  await evaluate(`() => {
    const kind = document.querySelector('#debug-tools [name=kind]');
    kind.value = 'stones';
    kind.dispatchEvent(new Event('change', {bubbles:true}));
    return true;
  }`);
  assert.equal(
    await evaluate('() => document.querySelector("#debug-tools button[type=submit]").disabled'),
    false,
    '切换到可重复领取的灵石后按钮恢复',
  );
  const stones = (await saved()).stones;
  await click('#debug-tools button[type=submit]');
  await wait(
    `() => document.querySelector('#debug-status')?.textContent.includes('已保存') && !document.querySelector('#debug-tools fieldset').disabled`,
  );
  assert.equal((await saved()).stones, stones + 1000);
  assert.equal(
    await evaluate('() => document.querySelector("#debug-stock").textContent'),
    `当前持有 ${(stones + 1000).toLocaleString('zh-CN')}`,
  );
  await finishPage();
}

async function catalogHeader() {
  return evaluate(`() => ({
    title: document.querySelector('.panel-heading').textContent,
    summary: document.querySelector('.panel-heading + .panel-note').textContent,
    labels: [...document.querySelectorAll('.book-tabs button')].map(e => e.textContent),
    boxes: ['.panel-shell', '.panel-heading', '.collection-toolbar', '.collection-toolbar .header-right', ...['treasures', 'passives', 'curios'].map(id => '[data-action="book-tab"][data-id="' + id + '"]')].map(selector => {
      const r = document.querySelector(selector).getBoundingClientRect();
      return [r.x, r.y, r.width, r.height];
    })
  })`);
}

async function checkHomePanels(name: string) {
  for (const panel of ['cultivation', 'arsenal', 'medicine', 'bestiary', 'chronicle', 'about']) {
    checkpoint = `${name}-${panel}`;
    await click(`[data-action="${panel}"]`);
    await wait(`() => !!document.querySelector('.panel[data-panel="${panel}"]')`);
    await check(checkpoint);
    if (panel === 'arsenal') {
      await click('[data-action="school-filter"][data-id="demonic"]');
      assert.equal(
        await evaluate(
          `() => document.querySelector('[data-action="school-filter"][data-id="demonic"]').getAttribute('aria-pressed')`,
        ),
        'true',
      );
      assert.equal(
        await evaluate(
          `() => [...document.querySelectorAll('.collection-card small')].every(node => node.textContent.startsWith('魔道'))`,
        ),
        true,
      );
      await click('[data-action="treasure-page"][data-id="next"]');
      assert.deepEqual(
        await evaluate(
          `() => ({cards:document.querySelectorAll('.collection-card').length,previous:document.querySelector('[data-action="treasure-page"][data-id="previous"]').disabled,next:document.querySelector('[data-action="treasure-page"][data-id="next"]').disabled})`,
        ),
        { cards: 6, previous: false, next: true },
      );
      await evaluate(
        `() => { document.querySelector('.collection-card:last-child').scrollIntoView({block:'center'}); return true; }`,
      );
      const previous = await evaluate(
        `() => ({scroll:document.querySelector('.panel').scrollTop,id:document.querySelector('.collection-card:last-child').dataset.id})`,
      );
      await click('.collection-card:last-child');
      await wait('() => !!document.querySelector(".panel[data-panel=treasure-detail]")');
      await check(`${name}-treasure-detail`);
      await click('.panel-close[data-action=close]');
      await wait('() => !!document.querySelector(".panel[data-panel=arsenal]")');
      const returned = await evaluate(
        `() => ({scroll:document.querySelector('.panel').scrollTop,id:document.activeElement?.dataset.id})`,
      );
      assert.equal(returned.id, previous.id, '返回藏器阁恢复当前法宝焦点');
      assert.ok(Math.abs(returned.scroll - previous.scroll) <= 1, '返回藏器阁保留列表滚动');
      await click('[data-action="book-tab"][data-id="passives"]');
      assert.deepEqual(
        await evaluate(
          `() => ({selected:document.querySelector('[data-action="book-tab"][data-id="passives"]').getAttribute('aria-pressed'),passives:!!document.querySelector('.passive-card'),treasures:!!document.querySelector('.collection-card')})`,
        ),
        { selected: 'true', passives: true, treasures: false },
      );
      await check(`${name}-passives`);
      const header = await catalogHeader();
      for (const tab of ['curios', 'treasures', 'passives', 'curios']) {
        checkpoint = `${name}-catalog-${tab}`;
        await click(`[data-action="book-tab"][data-id="${tab}"]`);
        const current = await catalogHeader();
        assert.equal(current.title, header.title, '切换藏器分类保留统一标题');
        assert.equal(current.summary, header.summary, '切换藏器分类保留顶部摘要');
        assert.deepEqual(current.labels, header.labels, '分类文字和计数不随切换改变');
        assert.equal(
          await evaluate(`() => document.querySelectorAll('.book-tabs').length`),
          1,
          '藏器阁始终只有一套分类导航',
        );
        assert.equal(
          await evaluate(`() => document.querySelector('.book-tabs .active')?.dataset.id`),
          tab,
        );
        current.boxes.forEach((box: number[], index: number) =>
          box.forEach((value, axis) =>
            assert.ok(Math.abs(value - header.boxes[index][axis]) <= 1, '分类切换不挪动顶部布局'),
          ),
        );
        if (tab === 'curios') {
          assert.equal(await evaluate(`() => document.querySelectorAll('.curio-card').length`), 9);
          const scroll = await evaluate(`() => {
            const p = document.querySelector('.panel');
            const tabs = p.querySelector('.book-tabs');
            const before = tabs.getBoundingClientRect().top;
            p.scrollTop = 400;
            const result = {distance: p.scrollTop, movement: before - tabs.getBoundingClientRect().top};
            p.scrollTop = 0;
            return result;
          }`);
          assert.ok(scroll.distance > 0, '奇物列表可滚动');
          assert.ok(Math.abs(scroll.distance - scroll.movement) <= 1, '分类导航随内容滚动');
        } else if (tab === 'treasures') {
          assert.equal(
            await evaluate(`() => document.querySelectorAll('.collection-card').length`),
            6,
            '跨分类切换保留魔道筛选与第二页',
          );
        }
        await check(checkpoint);
      }
    } else if (panel === 'medicine') {
      for (const view of ['recipes', 'craft', 'bag']) {
        await click('[data-action="medicine-tier"][data-id="灵品"]');
        assert.equal(
          await evaluate(
            `() => document.querySelector('[data-action="medicine-tier"][data-id="灵品"]').getAttribute('aria-pressed')`,
          ),
          'true',
        );
        await click(`[data-action="medicine-view"][data-id="${view}"]`);
        assert.equal(
          await evaluate(
            `() => document.querySelector('[data-action="medicine-view"][data-id="${view}"]').getAttribute('aria-pressed')`,
          ),
          'true',
        );
        assert.equal(
          await evaluate(
            `() => document.querySelector('[data-action="medicine-tier"][data-id="all"]').getAttribute('aria-pressed')`,
          ),
          'true',
          '切换丹囊视图重置品级筛选',
        );
        await check(`${name}-medicine-${view}`);
      }
    } else if (panel === 'bestiary') {
      await click('[data-action="bestiary-stage"][data-id="6"]');
      assert.equal(
        await evaluate(
          `() => document.querySelector('[data-action="bestiary-stage"][data-id="6"]').getAttribute('aria-pressed')`,
        ),
        'true',
      );
      const bosses = await evaluate(
        `() => [...document.querySelectorAll('.bestiary-grid')].at(-1).textContent`,
      );
      assert.match(bosses, /九天执劫仙尊/);
      assert.ok(bosses.includes(`最早 ${formatTime(TRIAL_BOSS_TIMES.at(-1)!)} 后现身`));
      await check(`${name}-bestiary-final`);
    }
    await click('.panel-close[data-action=close]');
  }
}

try {
  // SPA 的 HTML 回退也会返回 200；先确认实际脚本可加载，避免误报成界面等待超时。
  const entry = await fetch(baseUrl, { signal: AbortSignal.timeout(15000) });
  assert.ok(entry.ok, `入口请求失败：${entry.status}`);
  const html = await entry.text();
  const scripts = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"[^>]*>/g)];
  assert.ok(scripts.length, '入口中没有可加载的页面脚本');
  for (const [, source] of scripts) {
    const url = new URL(source, baseUrl);
    assertLocalPage(url.href);
    const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
    const contentType = response.headers.get('content-type') || '';
    await response.body?.cancel();
    assert.ok(
      response.ok && /(?:javascript|ecmascript)/i.test(contentType),
      `页面脚本未正确提供：${url.pathname}（${response.status}，${contentType}），请核对构建与预览的 base 路径`,
    );
  }
  for (const [name, viewport] of viewports) {
    checkpoint = `${name}-settings`;
    await open(viewport, fixture());
    assert.equal((await saved()).sound, false, '进站默认静音');
    const home = await evaluate(`() => {
      const auto=document.querySelector('.header-right [data-action=autoplay]');
      const settings=document.querySelector('.header-right [data-action=settings]');
      const root=document.querySelector('.root-pentagon');
      const box=settings.getBoundingClientRect();
      return {autoVisible:!!auto?.getClientRects().length,rootVisible:!!root?.getClientRects().length,width:box.width,height:box.height};
    }`);
    assert.equal(home.rootVisible, true, '首页灵根盘默认展开');
    if (name !== 'desktop') {
      assert.equal(home.autoVisible, false, '手机首页自动历练只在设置中显示');
      assert.ok(home.width >= 44 && home.height >= 44, '手机首页设置保持44px点击区');
    }
    await click('[data-action=watch-root-ad]');
    await wait('() => !!document.querySelector(".root-ad-panel")');
    await check(`${name}-root-ad`);
    await click('[data-action=cancel-reward-ad]');
    await wait('() => !document.querySelector(".root-ad-panel")');
    assert.equal((await saved()).spiritRoot, 'heaven', '放弃广告不改变灵根');
    await click('[data-action=settings]');
    assert.equal(
      await evaluate("() => document.querySelector('[data-disclosure=offline]').open"),
      false,
    );
    await check(`${name}-settings`);
    await click('[data-disclosure=offline] summary');
    await click('.settings-copy [data-action=autoplay]');
    assert.equal((await saved()).autoplay, true);
    assert.equal(
      await evaluate("() => document.querySelector('[data-disclosure=offline]').open"),
      true,
    );
    await click('.settings-copy [data-action=autoplay]');
    await click('input[data-volume]');
    await browser.call('press_key', { pageId, key: 'Home' });
    assert.equal((await saved()).volume, 0);
    assert.equal((await saved()).sound, false, '调音量不能自动开声');
    await click('[data-action=settings-sound]');
    assert.equal((await saved()).sound, true);
    assert.match(
      await evaluate("() => document.querySelector('[data-settings-sound-note]').textContent"),
      /音量为零/,
    );
    await click('input[data-volume]');
    await browser.call('press_key', { pageId, key: 'End' });
    assert.equal((await saved()).volume, 1);
    await click('[data-action=close]');
    await click('[data-action=settings]');
    assert.equal(
      await evaluate("() => document.querySelector('[data-disclosure=offline]').open"),
      false,
      '重开默认折叠',
    );
    await click('[data-action=close]');
    await checkHomePanels(name);
    await click('[data-action=sound]');
    await check(`${name}-volume`);
    await click('[data-action=mute]');
    assert.equal((await saved()).sound, false);
    await wait('() => !document.querySelector("[data-action=start]")?.disabled');
    await click('[data-action=start]');
    await wait('() => !!document.querySelector(".game-hud")');
    await check(`${name}-battle`, true);
    await click('[data-action=pause]');
    await click('.pause-actions [data-action=autoplay]');
    assert.equal((await saved()).autoplay, true);
    await click('.pause-actions [data-action=autoplay]');
    await click('.pause-actions [data-action=damage]');
    await click('[data-action=close]');
    await click('[data-action=resume]');
    await click('.combat-actions [data-action=guide]');
    await wait('() => !!document.querySelector("[data-action=guide-tab][data-id=save]")');
    const beforeTour = await evaluate("() => localStorage.getItem('qinglan-immortal-v1')");
    await click('[data-action=guide-tour]');
    let tourNavigation: { left: number; top: number; width: number; height: number } | undefined;
    for (let step = 0; step < TOUR_STEPS.length; step++) {
      checkpoint = `${name}-tour-${step}`;
      await wait(`() => document.querySelector('.interface-tour')?.dataset.step === '${step}'`);
      await evaluate('async () => { await new Promise(requestAnimationFrame); return true; }');
      const layout = await evaluate(`() => {
        const target = document.querySelector(${JSON.stringify(TOUR_STEPS[step].target)});
        const bounds = target.getBoundingClientRect();
        let clipped = bounds.left < 0 || bounds.top < 0 || bounds.right > innerWidth + 1 || bounds.bottom > innerHeight + 1;
        for (let parent = target.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
          const r = parent.getBoundingClientRect(), style = getComputedStyle(parent);
          const top = r.top + parent.clientTop, left = r.left + parent.clientLeft;
          if (/(auto|scroll|hidden|clip)/.test(style.overflowY)) clipped ||= bounds.top < top - 1 || bounds.bottom > top + parent.clientHeight + 1;
          if (/(auto|scroll|hidden|clip)/.test(style.overflowX)) clipped ||= bounds.left < left - 1 || bounds.right > left + parent.clientWidth + 1;
        }
        const card = document.querySelector('.tour-card').getBoundingClientRect();
        const hole = document.querySelector('.tour-outline').getBoundingClientRect();
        const navigation = document.querySelector('.tour-navigation').getBoundingClientRect();
        const next = document.querySelector('[data-tour="next"]').getBoundingClientRect();
        return {
          inside: card.left >= 0 && card.top >= 0 && card.right <= innerWidth + 1 && card.bottom <= innerHeight + 1,
          overlap: Math.max(0, Math.min(card.right, hole.right) - Math.max(card.left, hole.left)) *
            Math.max(0, Math.min(card.bottom, hole.bottom) - Math.max(card.top, hole.top)),
          visible: hole.width > 24 && hole.height > 24 && !clipped,
          navigation: {left: next.left, top: next.top, width: next.width, height: next.height},
          navigationClear: navigation.top >= Math.max(card.bottom, hole.bottom, bounds.bottom) + 11 && navigation.bottom <= innerHeight + 1,
          practice: !document.querySelector('.interface-tour[data-step="12"]') || (hole.height >= 80 && hole.top <= innerHeight / 2 - 60 && hole.bottom >= innerHeight / 2 + 50 && hole.left <= innerWidth / 2 - 40 && hole.right >= innerWidth / 2 + 40),
        };
      }`);
      assert.equal(layout.inside, true, `${checkpoint}：说明卡必须完整可见`);
      assert.equal(layout.visible, true, `${checkpoint}：高亮目标必须可见`);
      assert.equal(layout.practice, true, `${checkpoint}：走位亮区不能塌缩`);
      assert.ok(layout.overlap <= 1, `${checkpoint}：说明卡不可遮挡高亮目标`);
      assert.equal(layout.navigationClear, true, `${checkpoint}：固定导航不可遮挡说明或高亮区域`);
      tourNavigation ??= layout.navigation;
      assert.deepEqual(
        layout.navigation,
        tourNavigation,
        `${checkpoint}：下一步按钮不得随步骤移动`,
      );
      if (screenshots)
        await browser.call('take_screenshot', {
          pageId,
          filePath: resolve(output, `${checkpoint}.png`),
        });
      results.push({ name: checkpoint, layout });
      if (step === 4) {
        await click('[data-tour=previous]');
        await wait("() => document.querySelector('.interface-tour')?.dataset.step === '3'");
        await click('[data-tour=next]');
        await wait("() => document.querySelector('.interface-tour')?.dataset.step === '4'");
      }
      if (step === 0) await browser.call('click_at', { pageId, x: 4, y: 4 });
      else if (step === TOUR_STEPS.length - 2) await click('.choice-card');
      else
        await browser.call('click_at', {
          pageId,
          x: tourNavigation!.left + tourNavigation!.width / 2,
          y: tourNavigation!.top + tourNavigation!.height / 2,
        });
    }
    assert.equal(await evaluate("() => !!document.querySelector('.interface-tour')"), false);
    assert.equal(
      await evaluate("() => localStorage.getItem('qinglan-immortal-v1')"),
      beforeTour,
      '完整演练不能改变真实存档与暂停中的历练',
    );
    await click('[data-action=guide-tab][data-id=save]');
    const scroll = await evaluate(`() => {
      const panel=document.querySelector('.panel'), tabs=document.querySelector('.guide-tabs');
      const top=tabs.getBoundingClientRect().top;panel.scrollTop=panel.scrollHeight;
      return {scroll:panel.scrollTop,moved:tabs.getBoundingClientRect().top < top};
    }`);
    if (scroll.scroll > 0) assert.equal(scroll.moved, true, '帮助标签随内容滚动');
    await click('[data-action=close]');
    await check(`${name}-pause`, true);
    await browser.call('navigate_page', { pageId, type: 'reload' });
    await wait('() => !!document.querySelector("[data-action=restore]")');
    assert.equal(
      await evaluate(`() => {
        const banner = document.querySelector('.resume-banner');
        const town = document.querySelector('.home-town-entry');
        return !!banner && !!town && banner.getBoundingClientRect().bottom <= town.getBoundingClientRect().top + 1;
      }`),
      true,
      '未完历练提示位于青岚镇上方',
    );
    await check(`${name}-resume-entrance`);
    assert.equal((await saved()).sound, false, '刷新保留音量并重新静音');
    assert.equal((await saved()).volume, 1);
    await click('[data-action=restore]');
    await wait('() => !!document.querySelector("[data-action=resume]")');
    await click('[data-action=resume]');
    await check(`${name}-restored`, true);
    await finishPage();

    checkpoint = `${name}-upgrade`;
    await open(viewport, fixture(false, true));
    await click('[data-action=restore]');
    await wait('() => document.querySelectorAll(".choice-card").length === 3');
    await check(`${name}-upgrade`, true);
    await click('[data-action=choose][data-id="0"]');
    assert.equal((await saved()).activeRun?.state, 'playing');
    await click('[data-action=pause]');
    await finishPage();

    checkpoint = `${name}-late`;
    await open(viewport, fixture(true));
    await click('[data-action=restore]');
    await wait('() => !!document.querySelector("[data-action=resume]")');
    await click('[data-action=resume]');
    await wait('() => !document.querySelector(".panel") && !!document.querySelector(".game-hud")');
    await check(`${name}-late`, true);
    assert.match(
      await evaluate("() => document.querySelector('#cultivation-text').textContent"),
      /通关第七境成仙/,
    );
    assert.ok(
      (await evaluate("() => document.querySelector('#medicine-hud').textContent")).includes(
        '明清灵水',
      ),
    );
    const medicines = await evaluate(`() => {
      const hud = document.querySelector('#medicine-hud'), box = hud.getBoundingClientRect();
      return [...hud.children].map(item => {
        const range = document.createRange(); range.selectNodeContents(item);
        const rect = item.getBoundingClientRect();
        return {text:item.textContent, lines:range.getClientRects().length, top:rect.top, bottom:rect.bottom,
          inside:rect.left >= box.left - 1 && rect.right <= box.right + 1};
      });
    }`);
    assert.equal(medicines.length, 3, '三种药效必须分别完整显示');
    for (const [index, medicine] of medicines.entries()) {
      assert.match(medicine.text, /^(明清灵水|万年灵乳|无常丹) \d+年$/);
      assert.equal(medicine.lines, 1, '同一种丹药的药名与剩余年数不能拆行');
      assert.equal(medicine.inside, true, '药效不能溢出状态栏');
      if (index > 0)
        assert.ok(medicine.top >= medicines[index - 1].bottom - 1, '每种药效必须独占一行');
    }
    if (name === 'phone') {
      await browser.call('emulate', { pageId, viewport: '844x390x1,mobile,touch,landscape' });
      await check('rotate-landscape', true);
      await browser.call('emulate', { pageId, viewport });
      await check('rotate-portrait', true);
    }
    await finishPage();
    await checkDebugCurios(name, viewport);
  }
  await writeFile(
    resolve(output, 'report.json'),
    JSON.stringify({ passed: true, results }, null, 2),
  );
  console.log(`界面回归通过：${results.length} 个检查点，四种视口。`);
} catch (error) {
  await writeFile(
    resolve(output, 'report.json'),
    JSON.stringify({ passed: false, checkpoint, error: String(error), results }, null, 2),
  );
  if (pageId) {
    await browser
      .call('take_screenshot', { pageId, filePath: resolve(output, 'failure.png') })
      .catch(() => {});
    await browser
      .call('take_snapshot', { pageId })
      .then((text) => writeFile(resolve(output, 'failure.txt'), text))
      .catch(() => {});
    await Promise.allSettled([
      browser
        .call('list_console_messages', { pageId, types: ['error'], pageSize: 100 })
        .then((text) => writeFile(resolve(output, 'console-errors.txt'), text)),
      browser
        .call('list_network_requests', { pageId, pageSize: 100 })
        .then((text) => writeFile(resolve(output, 'network-requests.txt'), text)),
    ]);
  }
  throw error;
} finally {
  await browser.close();
}
