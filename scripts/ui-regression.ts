// 正常入口的浏览器回归；独立存档、MCP 交互，产物仅写入忽略目录。
import assert from 'node:assert/strict';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { freshSave, readSave, IMMORTAL_CULTIVATION, type SaveData } from '../src/progress.ts';
import { Game } from '../src/game.ts';
import { formatTime, TRIAL_BOSS_TIMES } from '../src/data.ts';
import { TOUR_STEPS } from '../src/interface-tour-model.ts';
import { CURIO_IDS, CURIO_NAMES } from '../src/curio-data.ts';
import { MEDICINES } from '../src/medicine-data.ts';
import { medicineCraftStones } from '../src/medicine.ts';
import { joinSect } from '../src/mortal.ts';
import { spiritPower } from '../src/spirit-power.ts';
import { formatNumber } from '../src/number-format.ts';
import { JOURNEY_APPRAISAL_SETTINGS, NPC_AI_SETTINGS } from '../src/setting.ts';
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
    node.scrollIntoView({ block: 'nearest' });
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

async function open(viewport: string, save: SaveData, testInitScript = '') {
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
    initScript: `localStorage.setItem('qinglan-telemetry-off','1');localStorage.setItem('qinglan-immortal-v1',${JSON.stringify(JSON.stringify(save))});${testInitScript}`,
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

async function checkJourneyModuleRecovery() {
  const viewport = '390x844x1,mobile,touch';
  checkpoint = 'journey-cold-module';
  const save = fixture();
  save.cultivation = 1234;
  // 本用例测冷模块断网后的恢复与真实PNG，不依赖在线AI；仅评语请求以503走真实本地兜底。
  // 在线AI仍由独立测试及发布后实测覆盖，其他请求和浏览器错误检查保持原样。
  const appraisalFallbackInit = `(() => {
      window.journeyPowerDraws = [];
      const originalDraw = CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillText = function(value,x,y,...args) {
        if (String(value).startsWith('此世灵威')) window.journeyPowerDraws.push({value,x,y,width:this.measureText(value).width,font:this.font});
        return originalDraw.call(this,value,x,y,...args);
      };
      const original = window.fetch.bind(window);
      const appraisalUrl = ${JSON.stringify(new URL(JOURNEY_APPRAISAL_SETTINGS.path, NPC_AI_SETTINGS.baseUrl).href)};
      window.journeyAppraisalFallbackCalls = 0;
      window.fetch = (input, init) => {
        const url = input instanceof Request ? input.url : String(input);
        if (new URL(url, location.href).href === appraisalUrl) {
          window.journeyAppraisalFallbackCalls++;
          return Promise.resolve(new Response(null, {status: 503}));
        }
        return original(input, init);
      };
    })();`;
  await open(viewport, save, appraisalFallbackInit);
  await click('[data-action=chronicle]');
  await wait('() => !!document.querySelector("[data-action=journey-card]")');
  assert.deepEqual(
    await evaluate(
      "() => performance.getEntriesByType('resource').filter(e => /journey-card-[\\w-]+\\.js/.test(e.name)).map(e => e.name)",
    ),
    [],
    '故障必须发生在留影模块首次加载前',
  );
  const before = await saved();
  // 保持同一viewport，避免MCP重置移动设备时额外重载页面。
  await browser.call('emulate', { pageId, viewport, networkConditions: 'Offline' });
  await click('[data-action=journey-card]');
  await wait('() => !!document.querySelector("[data-resource-failure]")');
  assert.deepEqual(
    await evaluate(
      "() => [...document.querySelectorAll('[data-resource-failure] button')].map(e => ({text:e.textContent,action:e.dataset.action}))",
    ),
    [{ text: '重新加载', action: 'refresh-game' }],
    '冷模块失败只给受保护的重新加载，不提供无效重新生成或重复刷新',
  );
  await check('journey-cold-module-offline');
  await browser.call('emulate', { pageId, viewport });
  await click('[data-action=refresh-game]');
  await wait(
    '() => !document.querySelector(".panel") && !!document.querySelector("[data-action=chronicle]")',
  );
  // 真实刷新产生新文档，MCP单次initScript已移除；只重新安装相同的评语失败夹具。
  await evaluate(`() => { ${appraisalFallbackInit} return true; }`);
  assert.equal((await saved()).cultivation, before.cultivation);
  assert.deepEqual((await saved()).completed, before.completed);
  await click('[data-action=chronicle]');
  await wait('() => !!document.querySelector("[data-action=journey-card]")');
  await click('[data-action=journey-card]');
  await wait('() => document.querySelector(".journey-card-preview img")?.naturalWidth > 0');
  assert.deepEqual(
    await evaluate(
      "() => { const i = document.querySelector('.journey-card-preview img'); return [i.naturalWidth,i.naturalHeight,i.src.startsWith('blob:')]; }",
    ),
    [1080, 1740, true],
  );
  const powerDraws = await evaluate('()=>window.journeyPowerDraws');
  assert.equal(powerDraws.length, 1, '真实Canvas必须绘制一行灵威');
  assert.equal(powerDraws[0].value, `此世灵威 ${formatNumber(spiritPower(save).score)}`);
  assert.equal(powerDraws[0].x, 728);
  assert.equal(powerDraws[0].y, 1014);
  assert.ok(
    powerDraws[0].width <= 270 && powerDraws[0].font.includes('24px'),
    '小号灵威必须完整放在本命炼器信息下方',
  );
  const appraisalFallbackCalls = await evaluate('() => window.journeyAppraisalFallbackCalls');
  assert.ok(appraisalFallbackCalls >= 1, '冷模块恢复必须实际拦截评语请求并触发本地兜底');
  console.log(`冷模块恢复使用本地评语：503回退 ${appraisalFallbackCalls} 次，不测试在线AI。`);
  await check('journey-cold-module-recovered');
  await click('[data-action=close]');
  await wait('() => !!document.querySelector("[data-action=journey-card]")');
  await finishPage();
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
    `当前持有 ${(stones + 1000).toLocaleString('zh-CN', { useGrouping: false })}`,
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

async function walkScene(selector: string, x: number, y: number) {
  await evaluate(`async () => {
    const host = document.querySelector(${JSON.stringify(selector)});
    host.focus({preventScroll:true});
    for (let attempt=0; attempt<1100; attempt++) {
      if (!host.isConnected) throw Error('行走期间场景意外切换');
      const px=Number(host.dataset.x), py=Number(host.dataset.y);
      if (Math.abs(px-${x})<8 && Math.abs(py-${y})<8) return true;
      const key=Math.abs(px-${x})>=8 ? (px<${x}?'d':'a') : (py<${y}?'s':'w');
      document.body.dispatchEvent(new KeyboardEvent('keydown',{key,bubbles:true}));
      await new Promise(resolve=>setTimeout(resolve,30));
      document.body.dispatchEvent(new KeyboardEvent('keyup',{key,bubbles:true}));
    }
    throw Error('道路不可达');
  }`);
}

async function clickScene(selector: string, fraction = 0.5) {
  const point = await evaluate(`() => {
    const node=document.querySelector(${JSON.stringify(selector)}),rect=node.getBoundingClientRect();
    const x=rect.left+rect.width/2,y=rect.top+rect.height*${fraction};
    return {x,y,width:innerWidth,height:innerHeight,hit:node.contains(document.elementFromPoint(x,y))};
  }`);
  assert.ok(
    point.x > 0 && point.x < point.width && point.y > 0 && point.y < point.height,
    '实际点选目标必须可见',
  );
  if (selector.includes('data-passage'))
    assert.ok(point.hit, '穿门点击必须实际命中门楼，不能误点顶部快捷按钮');
  await browser.call('click_at', { pageId, x: point.x, y: point.y });
}

async function checkDisplayAndShortcuts(name: string, viewport: string) {
  const save = fixture();
  save.cultivation = 352;
  save.age = 30;
  save.stones = save.iron = 123456789;
  await open(viewport, save);
  await wait(`()=>{
    const link=document.querySelector('link[rel=preload][as=image]');
    return !!link&&performance.getEntriesByName(link.href).length>0;
  }`);
  assert.ok(
    await evaluate(`()=>{
    const link=document.querySelector('link[rel=preload][as=image]');
    const entry=performance.getEntriesByName(link.href)[0];
    return link.href.includes('/assets/sect-market-buildings.webp?qinglan-build=')&&entry.initiatorType==='link';
  }`),
    '坊市建筑图集在首页即以相同版本URL预载',
  );
  checkpoint = `${name}-display-shortcuts`;
  if (name === 'desktop')
    await browser.call('emulate', { pageId, viewport, networkConditions: 'Offline' });
  await click('[data-action=settings]');
  if (name === 'desktop') {
    assert.equal(await evaluate('()=>document.querySelector("#screen").hidden'), true);
    assert.equal(await evaluate('()=>document.querySelector("#screen").textContent'), '');
    assert.doesNotMatch(
      await browser.call('list_network_requests', { pageId, pageSize: 1000 }),
      /\/orientation-[\w-]+\.js/,
      '桌面设置不得请求手机方向模块',
    );
    await check(`${name}-settings-offline`);
    await browser.call('emulate', { pageId, viewport });
    // 真实刷新验证桌面恢复；断网夹具中的资源失败不混入后续正常页面控制台。
    await browser.call('navigate_page', { pageId, type: 'reload' });
    await wait('()=>!!document.querySelector("[data-action=settings]")');
    await click('[data-action=settings]');
    assert.equal(await evaluate('()=>document.querySelector("#screen").hidden'), true);
  } else {
    await wait('()=>!!document.querySelector("#display-orientation")');
    assert.deepEqual(
      await evaluate(
        '()=>[...document.querySelector("#display-orientation").options].map(o=>o.value)',
      ),
      ['system', 'portrait', 'landscape'],
    );
    assert.equal(
      await evaluate('()=>document.querySelector("#display-orientation").value'),
      'system',
    );
    for (const [mode, count] of [
      ['portrait', 1],
      ['landscape', 2],
    ] as const) {
      await click('#display-orientation');
      await browser.call('press_key', { pageId, key: 'Home' });
      for (let i = 0; i < count; i++) await browser.call('press_key', { pageId, key: 'ArrowDown' });
      await browser.call('press_key', { pageId, key: 'Enter' });
      await wait(
        '()=>!/正在调整/.test(document.querySelector("[data-orientation-status]").textContent)',
      );
      assert.equal(await evaluate('()=>localStorage.getItem("qinglan-screen-orientation")'), mode);
      assert.match(
        await evaluate('()=>document.querySelector("[data-orientation-status]").textContent'),
        /已锁定|无法锁定/,
      );
      assert.ok(
        await evaluate(`()=>{
        const failed=document.querySelector('[data-orientation-status]').textContent.includes('无法锁定');
        return !failed||!(document.fullscreenElement||document.webkitFullscreenElement);
      }`),
        '方向锁失败必须还原本次全屏，不能只显示失败文字',
      );
      await check(`${name}-direction-${mode}`);
      await click('[data-action=close]');
      await click('[data-action=settings]');
      await wait('()=>!!document.querySelector("#display-orientation")');
      assert.equal(
        await evaluate('()=>document.querySelector("#display-orientation").value'),
        mode,
      );
    }
    await click('#display-orientation');
    await browser.call('press_key', { pageId, key: 'Home' });
    await browser.call('press_key', { pageId, key: 'Enter' });
    await wait(
      '()=>document.querySelector("[data-orientation-status]").textContent.includes("当前跟随系统")',
    );
    await wait('()=>!(document.fullscreenElement||document.webkitFullscreenElement)');
  }
  await click('[data-action=close]');
  await click('[data-action=mortal-enter]');
  await click('[data-action=town-enter]');
  await wait('()=>!!document.querySelector(".settlement-shortcut:not(:disabled)")');
  const sceneButtons = async (scene: 'town' | 'market') => {
    const layout = await evaluate(`()=>{
      const box=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};
      return {viewport:innerWidth,shortcut:box(document.querySelector('.settlement-shortcut')),exit:box(document.querySelector('[data-action=${scene === 'town' ? 'town-exit' : 'sect-market-exit'}]')),hud:box(document.querySelector('.town-hud')),count:document.querySelectorAll('.settlement-shortcut').length};
    }`);
    assert.equal(layout.count, 1);
    assert.ok(layout.shortcut.width >= 44 && layout.shortcut.height >= 44);
    assert.ok(layout.shortcut.x >= 0 && layout.exit.right <= layout.viewport + 1);
    assert.ok(
      layout.shortcut.right <= layout.exit.x + 1 && Math.abs(layout.shortcut.y - layout.exit.y) < 1,
      '快捷切换紧邻离开左侧',
    );
    const overlaps =
      Math.min(layout.hud.right, layout.shortcut.right) -
        Math.max(layout.hud.x, layout.shortcut.x) >
        1 &&
      Math.min(layout.hud.bottom, layout.shortcut.bottom) -
        Math.max(layout.hud.y, layout.shortcut.y) >
        1;
    assert.equal(overlaps, false, '场景状态与快捷按钮不可重叠');
    await check(`${name}-${scene}-shortcut`);
  };
  await sceneButtons('town');
  await click('.settlement-shortcut[data-destination=market]');
  await wait(
    '()=>!!document.querySelector("#sect-market-view[data-initialized]")&&!!document.querySelector(".settlement-shortcut:not(:disabled)")',
  );
  const batch = (await saved()).mortal.sectMarket!.visit;
  await sceneButtons('market');
  await click('.settlement-shortcut[data-destination=town]');
  await wait(
    '()=>!!document.querySelector("#town-view[data-x]")&&!!document.querySelector(".settlement-shortcut:not(:disabled)")',
  );
  await click('.settlement-shortcut[data-destination=market]');
  await wait(
    '()=>!!document.querySelector("#sect-market-view[data-initialized]")&&!!document.querySelector(".settlement-shortcut:not(:disabled)")',
  );
  assert.equal((await saved()).mortal.sectMarket!.visit, batch, '一年内快捷重进不换批');
  assert.equal((await saved()).stones, save.stones, '快捷切换不收费');
  // 复现曾经的循环：步行离场会记住门口，随后快捷/普通重进不得立刻返回。
  const stableMarket = async () => {
    await wait(
      '()=>!!document.querySelector("#sect-market-view[data-initialized]")&&!document.querySelector(".town-loading")',
    );
    assert.ok(
      await evaluate(`async()=>{
      await new Promise(r=>setTimeout(r,1200));
      const host=document.querySelector('#sect-market-view');
      return !!host&&Math.hypot(Number(host.dataset.x)-800,Number(host.dataset.y)-1360)>80;
    }`),
      '重新入场必须停留在坊市安全区，不得自动传回',
    );
  };
  const walkBack = async () => {
    await walkScene('#sect-market-view', 800, 1210);
    await clickScene('[data-passage=market]', 0.9);
    await wait(
      '()=>!!document.querySelector("#town-view[data-x]")&&!document.querySelector(".town-loading")',
    );
  };
  await walkBack();
  await check(`${name}-town-gate`);
  await clickScene('[data-passage=town]', 0.9);
  await stableMarket();
  await check(`${name}-market-gate`);
  await walkBack();
  await click('.settlement-shortcut[data-destination=market]');
  await stableMarket();
  await check(`${name}-walk-then-shortcut`);
  await walkBack();
  await click('[data-action=town-exit]');
  await click('[data-action=mortal-tab][data-id=sects]');
  await click('[data-action=sect-market-enter]');
  await stableMarket();
  await check(`${name}-walk-then-normal-entry`);
  await click('[data-action=sect-market-exit]');
  await finishPage();
}

async function checkSettlementLinks(name: string, viewport: string) {
  const save = fixture();
  save.cultivation = 352;
  save.age = 30;
  save.stones = 10000;
  save.unlocked = 1;
  save.medicine.shop = { ids: ['huanglong', 'jinsui', 'yangjing'], bought: {}, refreshAt: 40 };
  save.medicine.recipes = ['heqi'];
  for (const medicine of MEDICINES.filter((m) => m.tier === '凡品'))
    save.medicine.bag[medicine.id] = 30;
  // 本项只核对真实场景交互，闲谈接口明确使用503夹具，不依赖外部AI可用性。
  const npcUrl = `${NPC_AI_SETTINGS.baseUrl}/chat`;
  await open(
    viewport,
    save,
    `{
    // 固定随机抽取，刻意让新批撞回旧三味，验证跨批保底换货。
    Math.random=()=>0;
    const original=window.fetch.bind(window);window.__uiNpcMock=0;
    window.fetch=(input,init)=>{
      if(new URL(typeof input==='string'?input:input.url,location.href).href===${JSON.stringify(npcUrl)}){
        window.__uiNpcMock++;return Promise.resolve(new Response('{}',{status:503,headers:{'Content-Type':'application/json'}}));
      }
      return original(input,init);
    };
  }`,
  );
  checkpoint = `${name}-town-links`;
  await click('[data-action=mortal-enter]');
  await click('[data-action=town-enter]');
  await wait(
    '()=>!!document.querySelector("#town-view[data-x]")&&!document.querySelector(".town-loading")',
  );
  await clickScene('[data-parent=father] .town-npc-art');
  await wait('()=>!!document.querySelector(".npc-dialogue[data-story-greeting]")');
  await check(`${name}-click-father`);
  await click('[data-action=close]');
  await walkScene('#town-view', 850, 600);
  await walkScene('#town-view', 850, 770);
  await clickScene('[data-town-place=herbs]', 0.85);
  await wait('()=>!!document.querySelector("[data-action=medicine-shop]")');
  assert.ok(
    await evaluate(
      '()=>Math.hypot(Number(document.querySelector("#town-view").dataset.x)-1120,Number(document.querySelector("#town-view").dataset.y)-750)<=115',
    ),
    '必须走近被点选商铺才交互',
  );
  await check(`${name}-click-town-shop`);
  await click('[data-action=medicine-shop]');
  assert.deepEqual(
    await evaluate(
      '()=>[...document.querySelectorAll("[data-action=medicine-tier]")].map(e=>e.dataset.id)',
    ),
    ['all', '凡品'],
  );
  for (let i = 0; i < 3; i++) await click('[data-action=medicine-buy][data-id=huanglong]');
  assert.equal((await saved()).medicine.shop!.bought!.huanglong, 3);
  assert.ok(
    await evaluate(
      '()=>document.querySelector("[data-action=medicine-buy][data-id=huanglong]").disabled',
    ),
  );
  await check(`${name}-shop-sold-out`);
  await click('[data-action=medicine-view][data-id=craft]');
  const beforeBrew = await saved();
  await click('[data-action=medicine-craft][data-id=heqi]');
  assert.ok(Math.abs((await saved()).age - beforeBrew.age - 10) < 1e-9, '炼丹实际消耗十年');
  await click('[data-action=medicine-view][data-id=shop]');
  const freshShop = (await saved()).medicine.shop!;
  assert.deepEqual(freshShop.bought, {});
  assert.ok(
    freshShop.ids.some((id) => !save.medicine.shop!.ids.includes(id)),
    '撞回旧三味也须至少换一种',
  );
  assert.ok(
    await evaluate(
      '()=>[...document.querySelectorAll("[data-action=medicine-buy]")].every(e=>!e.disabled)',
    ),
  );
  await check(`${name}-shop-ten-year-refresh`);
  const travelStones =
    save.stones -
    MEDICINES.find((m) => m.id === 'huanglong')!.price * 3 -
    medicineCraftStones('heqi');
  await click('[data-action=close]');
  await walkScene('#town-view', 1740, 770);
  await walkScene('#town-view', 1740, 440);
  await clickScene('[data-passage=town]', 0.9);
  await wait(
    '()=>!!document.querySelector("#sect-market-view[data-initialized]")&&!document.querySelector(".town-loading")',
  );
  assert.ok(
    await evaluate(
      '()=>Math.hypot(Number(document.querySelector("#sect-market-view").dataset.x)-800,Number(document.querySelector("#sect-market-view").dataset.y)-1210)<1',
    ),
  );
  await check(`${name}-walk-to-market`);
  assert.equal(
    await evaluate('()=>!!document.querySelector(".market-venue-sign,.sect-market-auction-sign")'),
    false,
    '地图只保留建筑名称，不另放说明小牌子',
  );
  const batch = (await saved()).mortal.sectMarket!.visit;
  await walkScene('#sect-market-view', 800, 900);
  const targetName = await evaluate(
    '()=>document.querySelector("[data-market-npc=market-alchemist] .sect-market-npc-name").firstChild.textContent',
  );
  await clickScene('[data-market-npc=market-alchemist] .sect-market-npc-art');
  await wait('()=>!!document.querySelector("#sect-market-trade")');
  assert.ok(
    await evaluate(
      `()=>document.querySelector('[role=dialog]').innerText.includes(${JSON.stringify(targetName)})`,
    ),
    '只能打开被点选的修士',
  );
  await check(`${name}-click-market-npc`);
  await click('[data-action=close]');
  await walkScene('#sect-market-view', 1000, 750);
  await clickScene('[data-market-place=auction] .town-building-caption');
  await wait('()=>!!document.querySelector(".auction-grid")');
  const names: string[] = await evaluate(
    '()=>[...document.querySelectorAll(".auction-card h3")].map(e=>e.innerText)',
  );
  assert.equal(names.length, 8);
  assert.equal(new Set(names).size, 8, '同一会场本批药物与法宝不能重名');
  await check(`${name}-auction-variety`);
  await click('[data-action=auction-view][data-id=sell]');
  assert.ok(
    await evaluate(`()=>{
    const a=document.querySelector('.auction-seller > button').getBoundingClientRect();
    const b=document.querySelector('.auction-return').getBoundingClientRect();
    return Math.abs(a.width-b.width)<1&&Math.abs(a.height-b.height)<1&&b.height>=44&&b.top-a.bottom>=12;
  }`),
    '回到坊市与出售按钮等宽等高，且保留间距',
  );
  await check(`${name}-auction-return-button`);
  await click('[data-action=close]');
  await walkScene('#sect-market-view', 1000, 750);
  await walkScene('#sect-market-view', 400, 750);
  await walkScene('#sect-market-view', 400, 650);
  await clickScene('[data-market-place=office] .town-building-caption');
  await wait('()=>!!document.querySelector("#market-venue-content[data-venue=office]")');
  assert.ok(
    await evaluate(
      '()=>{const p=document.querySelector("#market-venue-content > p"),s=getComputedStyle(p);return s.marginTop==="20px"&&s.marginBottom==="20px"&&Number.parseFloat(s.lineHeight)===Number.parseFloat(s.fontSize)*2;}',
    ),
    '院落说明须有真实段间距与两倍行高',
  );
  await check(`${name}-office-spacing`);
  await click('[data-action=close]');
  assert.equal(
    await evaluate('()=>!!document.querySelector(".market-active-label")'),
    false,
    '修士字牌保留在修士节点，不创建跟随玩家的副本',
  );
  await walkScene('#sect-market-view', 800, 1210);
  await clickScene('[data-passage=market]', 0.9);
  await wait(
    '()=>!!document.querySelector("#town-view[data-x]")&&!document.querySelector(".town-loading")',
  );
  assert.ok(
    await evaluate(
      '()=>Math.hypot(Number(document.querySelector("#town-view").dataset.x)-1740,Number(document.querySelector("#town-view").dataset.y)-245)<1',
    ),
  );
  await check(`${name}-walk-back-town`);
  await click('[data-action=town-exit]');
  await click('[data-action=home]');
  assert.match(
    await evaluate('()=>document.querySelector(".home-town-entry").innerText'),
    /距上次进入/,
  );
  assert.equal((await saved()).mortal.sectMarket!.visit, batch, '未满一年不能沿路重抽客货');
  assert.equal((await saved()).stones, travelStones, '走动与查看不再自动交易扣费');
  assert.ok(await evaluate('()=>window.__uiNpcMock>=1'), '明确覆盖闲谈故障夹具');
  await finishPage();
}

async function checkCurioSeeking(name: string, viewport: string) {
  for (const [kind, seed, attempts, found] of [
    ['third-miss', 0, 2, false],
    ['first-find', 5, 0, true],
    ['capped-miss', 166, 5, false],
  ] as const) {
    const save = fixture();
    save.cultivation = IMMORTAL_CULTIVATION;
    save.completed = [0, 1, 2, 3, 4, 5, 6];
    save.unlocked = 6;
    save.age = 30;
    save.stones = 1000000;
    save.curios.seed = seed;
    save.curios.seeking['soul-wood'] = attempts;
    assert.ok(joinSect(save, 'power'));
    await open(viewport, save);
    checkpoint = `${name}-curio-${kind}`;
    await click('[data-action=mortal-enter]');
    await click('[data-action=mortal-tab][data-id=sects]');
    await click('[data-action=sect-service-open]');
    await wait('()=>!!document.querySelector(".curio-seeking")');
    await click('.curio-seeking > summary');
    await click('[data-action=sect-service-curio][data-id=soul-wood]');
    const after = await saved();
    assert.ok(Math.abs(after.age - save.age - 10) < 1e-9, '每次真实消耗十年');
    assert.equal(save.stones - after.stones, 10800, '失败和成功均收原单次费用');
    assert.equal(after.curios.seeking['soul-wood'], attempts + 1);
    assert.equal(after.curios.bag['soul-wood'] ?? 0, found ? 1 : 0);
    const result = await evaluate('()=>document.querySelector("#sect-service-result").textContent');
    assert.match(result, found ? /已收入行囊/ : /此行未能寻得/);
    if (kind === 'capped-miss') assert.match(result, /机会仍为70%/);
    await click('[data-action=close]');
    await click('[data-action=home]');
    await browser.call('navigate_page', { pageId, type: 'reload' });
    await wait('()=>!!document.querySelector("[data-action=mortal-enter]")');
    assert.deepEqual((await saved()).curios, after.curios, '三次失败不能在读档时变成已获得');
    await click('[data-action=mortal-enter]');
    await click('[data-action=mortal-tab][data-id=sects]');
    await click('[data-action=sect-service-open]');
    await wait('()=>!!document.querySelector(".curio-seeking")');
    await click('.curio-seeking > summary');
    const state = await evaluate(`()=>{
      const b=document.querySelector('[data-action=sect-service-curio][data-id=soul-wood]');
      if(b)b.scrollIntoView({block:'center'});
      return b?{disabled:b.disabled,text:b.closest('.curio-card').innerText}:null;
    }`);
    if (found) assert.equal(state, null, '已获得后撤掉同物委托');
    else {
      assert.ok(state?.disabled, '十年办事冷却不可被重开和刷新清除');
      assert.ok(state.text.includes(`已寻访 ${attempts + 1} 次`));
      assert.ok(state.text.includes(`本次机会 ${Math.min(70, 30 + attempts * 10)}%`));
    }
    await check(checkpoint);
    await finishPage();
  }
}

async function checkHeavenHouse(name: string, viewport: string) {
  const save = fixture();
  save.cultivation = IMMORTAL_CULTIVATION;
  save.completed = [0, 1, 2, 3, 4, 5, 6];
  save.unlocked = 6;
  save.age = 30;
  save.stones = 1000000;
  save.training = { vitality: 19, power: 19, speed: 19 };
  save.curios.bag['heaven-house'] = 1;
  save.curios.acquired.push('heaven-house');
  assert.ok(joinSect(save, 'haste'));
  save.mortal.mastery.haste = 4;
  await open(viewport, save);
  checkpoint = `${name}-heaven-house-training`;
  await click('[data-action=cultivation]');
  for (const kind of ['vitality', 'power', 'speed']) {
    const before = await saved();
    await click(`[data-action=train][data-id=${kind}]`);
    const after = await saved();
    assert.equal(after.stones, before.stones - 1651, '二十阶按2358灵石七折向上取整');
    assert.equal(after.age, before.age, '天机屋根基修习零年岁');
    assert.equal(after.training[kind as keyof SaveData['training']], 20);
    assert.ok(
      await evaluate(`()=>document.querySelector('[data-action=train][data-id=${kind}]').disabled`),
    );
  }
  await check(checkpoint);
  await click('[data-action=close]');
  await click('[data-action=mortal-enter]');
  await click('[data-action=mortal-tab][data-id=sects]');
  const direct = await saved();
  await click('[data-action=mortal-activity][data-id=study]');
  const studied = await saved();
  assert.equal(studied.age, direct.age);
  assert.equal(direct.stones - studied.stones, 77, '直接精研按110灵石七折结算');
  assert.equal(studied.mortal.mastery.haste, 5);
  assert.equal(studied.mortal.activity, null);
  assert.equal(
    Object.values(studied.medicine.bag).reduce((a, b) => a + b, 0) -
      Object.values(direct.medicine.bag).reduce((a, b) => a + b, 0),
    1,
    '五阶仍赐一颗灵品',
  );
  await click('[data-action=sect-service-open]');
  await wait('()=>!!document.querySelector("[data-action=sect-service-act]")');
  await click('[data-action=sect-service-act]');
  const specialized = await saved();
  assert.equal(specialized.age, studied.age);
  assert.equal(studied.stones - specialized.stones, 137, '专长195灵石只折减30%一次，向上取整');
  assert.equal(specialized.mortal.mastery.haste, 6);
  assert.equal(specialized.mortal.activity, null);
  assert.ok(
    await evaluate('()=>document.querySelector("[data-action=sect-service-act]").disabled'),
    '零年专长仍占十年额度',
  );
  await check(`${name}-heaven-house-study`);
  await click('[data-action=close]');
  await click('[data-action=home]');
  await browser.call('navigate_page', { pageId, type: 'reload' });
  await wait('()=>!!document.querySelector("[data-action=mortal-enter]")');
  const reloaded = await saved();
  assert.deepEqual(reloaded.training, specialized.training);
  assert.equal(reloaded.mortal.mastery.haste, 6);
  assert.equal(reloaded.mortal.activity, null);
  await finishPage();
}

async function checkHomePanels(name: string) {
  for (const panel of ['cultivation', 'arsenal', 'medicine', 'bestiary', 'chronicle', 'about']) {
    checkpoint = `${name}-${panel}`;
    await click(`[data-action="${panel}"]`);
    await wait(`() => !!document.querySelector('.panel[data-panel="${panel}"]')`);
    await check(checkpoint);
    if (panel === 'cultivation') {
      assert.equal(
        await evaluate(
          '()=>!!document.querySelector(".cultivation-summary,details[data-disclosure=cultivation]")',
        ),
        false,
      );
      assert.ok(
        await evaluate(
          '()=>{const panel=document.querySelector(".panel"),nodes=[...panel.children];return nodes.indexOf(panel.querySelector(".cultivation-overview"))<nodes.indexOf(panel.querySelector(".spirit-root-summary"))&&nodes.indexOf(panel.querySelector(".realm-road"))<nodes.indexOf(panel.querySelector(".training-grid"));}',
        ),
        '洞府沿用完整境界展示、灵根寿元、境界路标、根基修炼顺序',
      );
    }
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
        assert.deepEqual(
          await evaluate(
            '()=>[...document.querySelectorAll("[data-action=medicine-tier]")].map(e=>e.dataset.id)',
          ),
          view === 'bag' ? ['all', '凡品', '灵品', '珍品'] : ['all', '灵品', '珍品'],
          '只显示当前用途实际存在的品级',
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

async function checkRecipeBuying(name: string, viewport: string) {
  const save = fixture();
  save.stones = 280;
  assert.equal(save.cultivation, 0);
  assert.equal(save.unlocked, 0);
  await open(viewport, save);
  await click('[data-action=medicine]');
  await click('[data-action=medicine-view][data-id=recipes]');
  assert.equal(
    await evaluate(
      '()=>document.querySelectorAll("[data-action=medicine-recipe]:not(:disabled)").length',
    ),
    16,
    '凡人可直接购买全部十六丹方',
  );
  for (const [id, remaining] of [
    ['heqi', 200],
    ['mingqing', 0],
  ] as const) {
    await click(`[data-action=medicine-recipe][data-id=${id}]`);
    assert.equal((await saved()).stones, remaining);
    assert.ok((await saved()).medicine.recipes.includes(id));
    assert.equal(
      await evaluate(
        `()=>document.querySelector('[data-action=medicine-recipe][data-id=${id}]').disabled`,
      ),
      true,
    );
  }
  assert.equal(
    await evaluate(
      '()=>document.querySelectorAll("[data-action=medicine-recipe]:not(:disabled)").length',
    ),
    0,
    '灵石不足及已学药方均禁用，不能重复扣费',
  );
  await check(`${name}-recipe-money-only`);
  await browser.call('navigate_page', { pageId, type: 'reload' });
  await wait('()=>!!document.querySelector("[data-action=medicine]")');
  assert.equal((await saved()).stones, 0);
  assert.deepEqual((await saved()).medicine.recipes, ['heqi', 'mingqing']);
  assert.equal((await saved()).unlocked, 0);
  await click('[data-action=medicine]');
  await click('[data-action=medicine-view][data-id=craft]');
  assert.match(
    await evaluate(
      '()=>document.querySelector("[data-action=medicine-craft][data-id=mingqing]").textContent',
    ),
    /解锁/,
  );
  await check(`${name}-recipe-reload-craft-gate`);
  await finishPage();
}

async function checkItemHelp(name: string) {
  const before = await saved();
  await click('[data-action=guide]');
  await wait('() => !!document.querySelector("[data-action=guide-tab][data-id=medicine]")');
  await click('[data-action=guide-tab][data-id=medicine]');
  const noteStyle = `e => { const s=getComputedStyle(e);return [s.fontSize,s.color,s.lineHeight,s.margin]; }`;
  const reference = await evaluate(
    `() => (${noteStyle})(document.querySelector('.panel p.panel-note'))`,
  );
  await click('[data-action=guide-tab][data-id=items]');
  const help = await evaluate(`() => {
    const panel=document.querySelector('.panel'), rows=[...panel.querySelectorAll('.item-guide-row')];
    const section=[...panel.querySelectorAll('.guide-subheading')].find(e=>e.textContent==='随身奇物');
    const style=e=>{const s=getComputedStyle(e);return [s.fontSize,s.color,s.lineHeight,s.margin];};
    return { note:style(section.nextElementSibling), names:rows.slice(0,9).map(e=>e.querySelector('h3').textContent),
      cards:!!panel.querySelector('.curio-grid,.curio-card'), count:rows.length,
      styles:[rows[0],rows[9]].map(e=>[style(e),style(e.querySelector('h3')),style(e.querySelector('p'))]) };
  }`);
  assert.deepEqual(help.note, reference, '奇物正文与其他帮助共用字号、颜色、行高和段距');
  assert.equal(help.cards, false, '帮助不混入收藏卡片');
  assert.deepEqual(help.names, CURIO_NAMES);
  assert.equal(help.count, 15, '九奇物与六类拾取物均有完整说明');
  assert.deepEqual(help.styles[0], help.styles[1], '奇物与其他道具说明共用排版');
  await check(`${name}-item-help`);
  await click('[data-action=guide-tab][data-id=builds]');
  await click('[data-action=guide-tab][data-id=items]');
  await click('.guide-close');
  assert.deepEqual(await saved(), before, '查看与切换说明不改变存档');
}

async function checkTourScrollRestore(name: string) {
  const cases = [
    { top: 0, complete: false },
    { top: 40, complete: false },
    ...(name === 'desktop' ? [{ top: 0, complete: true }] : []),
  ];
  for (const scenario of cases) {
    checkpoint = `${name}-tour-scroll-${scenario.top}-${scenario.complete ? 'complete' : 'exit'}`;
    await click('[data-action=guide]');
    await wait('() => !!document.querySelector("[data-action=guide-tab][data-id=basics]")');
    await click('[data-action=guide-tab][data-id=basics]');
    await wait('() => !!document.querySelector("[data-action=guide-tour]")');
    const beforeSave = await evaluate("() => localStorage.getItem('qinglan-immortal-v1')");
    const start = await evaluate(`() => {
      const ui = document.querySelector('#ui');
      ui.scrollTop = ${scenario.top};
      return { top: ui.scrollTop, left: ui.scrollLeft };
    }`);
    await click('[data-action=guide-tour]');
    await wait('() => !!document.querySelector(".interface-tour")');
    if (scenario.complete) {
      for (let step = 0; step < TOUR_STEPS.length; step++) {
        await wait(`() => document.querySelector('.interface-tour')?.dataset.step === '${step}'`);
        await click('[data-tour=next]');
      }
    } else await click('[data-tour=exit]');
    await wait('() => !document.querySelector(".interface-tour")');
    assert.equal(
      await evaluate('() => document.activeElement?.dataset.action'),
      'guide-tour',
      '退出或完成导览后恢复原入口焦点',
    );
    await click('.panel-close[data-action=close]');
    assert.deepEqual(
      await evaluate(`() => {
        const ui = document.querySelector('#ui');
        return { top: ui.scrollTop, left: ui.scrollLeft };
      }`),
      start,
      `${checkpoint}：首页原位置为零也必须还原`,
    );
    assert.equal(
      await evaluate("() => localStorage.getItem('qinglan-immortal-v1')"),
      beforeSave,
      '退出或完成导览不能改变真实存档',
    );
    results.push({ name: checkpoint, layout: start });
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
  await checkJourneyModuleRecovery();
  for (const [name, viewport] of viewports) {
    await checkDisplayAndShortcuts(name, viewport);
    await checkRecipeBuying(name, viewport);
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
    await checkItemHelp(name);
    await checkTourScrollRestore(name);
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
    if (name === 'desktop' || name === 'phone') await checkSettlementLinks(name, viewport);
    await checkCurioSeeking(name, viewport);
    await checkHeavenHouse(name, viewport);
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
