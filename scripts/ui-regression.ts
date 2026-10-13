// 正常入口的浏览器回归；独立存档、MCP 交互，产物仅写入忽略目录。
import assert from 'node:assert/strict';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { freshSave, readSave, IMMORTAL_CULTIVATION, type SaveData } from '../src/progress.ts';
import { Game } from '../src/game.ts';
import { assertLocalPage, openUiBrowser } from './ui-browser.ts';

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
    await document.fonts.ready;
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
    for (const id of ['huanglong', 'jinsui', 'yangjing'])
      save.medicine.active[id] = save.age + 5000;
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
  assert.doesNotMatch(
    errors,
    /msgid=|Uncaught|TypeError|ReferenceError|SyntaxError|出了点状况/,
    `浏览器错误：${errors}`,
  );
  await browser.call('close_page', { pageId });
  pageId = 0;
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
        '黄龙丹',
      ),
    );
    if (name === 'phone') {
      await browser.call('emulate', { pageId, viewport: '844x390x1,mobile,touch,landscape' });
      await check('rotate-landscape', true);
      await browser.call('emulate', { pageId, viewport });
      await check('rotate-portrait', true);
    }
    await finishPage();
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
