// CDP只设置原生安全区；交互、DOM断言及截图仍通过Chrome DevTools MCP。
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { freshSave, readSave } from '../src/progress.ts';
import { Game } from '../src/game.ts';
import { chromePath, openUiBrowser, assertLocalPage } from './ui-browser.ts';

export async function safeAreaBrowser(output: string) {
  const executable = chromePath();
  const profile = await mkdtemp(join(tmpdir(), 'qinglan-safe-area-'));
  const args = [
    '--headless=new',
    '--no-sandbox',
    '--no-first-run',
    '--no-default-browser-check',
    '--remote-debugging-port=0',
    `--user-data-dir=${profile}`,
  ];
  if (process.env.HTTPS_PROXY) args.push(`--proxy-server=${process.env.HTTPS_PROXY}`);
  const chrome = spawn(executable, [...args, 'about:blank'], { stdio: 'ignore' });
  let launchError: Error | undefined;
  chrome.on('error', (error) => {
    launchError = error;
  });
  let browser: Awaited<ReturnType<typeof openUiBrowser>> | undefined;
  const sockets = new Set<WebSocket>();
  const close = async () => {
    for (const socket of sockets) socket.close();
    try {
      await browser?.close();
    } finally {
      if (chrome.pid && chrome.exitCode === null && chrome.signalCode === null) {
        await new Promise<void>((done) => {
          const timer = setTimeout(() => chrome.kill('SIGKILL'), 2000);
          chrome.once('exit', () => {
            clearTimeout(timer);
            done();
          });
          chrome.kill();
        });
      }
      await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    }
  };
  try {
    const until = Date.now() + 15000;
    let port = 0;
    while (!port) {
      try {
        port = Number((await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]);
      } catch {}
      if (launchError) throw launchError;
      if (chrome.exitCode !== null || Date.now() > until) throw new Error('独立Chrome未能启动');
      if (!port) await new Promise((done) => setTimeout(done, 100));
    }
    const address = `http://127.0.0.1:${port}`;
    browser = await openUiBrowser({ workspace: output, browserUrl: address });
    return {
      ...browser,
      async inset(url: string, top: number) {
        const targets = (await (await fetch(`${address}/json/list`)).json()) as {
          type: string;
          url: string;
          webSocketDebuggerUrl: string;
        }[];
        const target = targets.find((item) => item.type === 'page' && item.url === url);
        assert.ok(target, '只能配置本次隔离页面的安全区');
        const socket = new WebSocket(target.webSocketDebuggerUrl);
        sockets.add(socket);
        await new Promise<void>((done, fail) => {
          const timer = setTimeout(() => fail(new Error('原生安全区配置超时')), 15000);
          socket.addEventListener(
            'error',
            () => {
              clearTimeout(timer);
              fail(new Error('原生安全区连接失败'));
            },
            { once: true },
          );
          socket.addEventListener(
            'open',
            () =>
              socket.send(
                JSON.stringify({
                  id: 1,
                  method: 'Emulation.setSafeAreaInsetsOverride',
                  params: { insets: { top, left: 0, right: 0, bottom: 0 } },
                }),
              ),
            { once: true },
          );
          socket.addEventListener('message', (event) => {
            const message = JSON.parse(String(event.data));
            if (message.id !== 1) return;
            clearTimeout(timer);
            message.error
              ? fail(new Error(`安全区覆盖不受支持：${message.error.message}`))
              : done();
          });
        });
      },
      close,
    };
  } catch (error) {
    await close();
    throw error;
  }
}

function fixture(boss: boolean) {
  const save = freshSave('heaven', ['metal'], 'dual', () => 0.5);
  Object.assign(save, { prologueSeen: true, hometownSeen: true, autoplay: false });
  save.mortal.hometown.stage = 'departed';
  const game = new Game(
    save,
    0,
    0,
    () => 0.83,
    'dual',
    () => 0.5,
  );
  if (boss) {
    game.time = game.stageDuration;
    game.update(0.025);
    assert.ok(game.boss);
  }
  game.pause();
  save.activeRun = game.snapshot();
  assert.equal(readSave(JSON.stringify(save)).status, 'ok');
  assert.ok(Game.restore(structuredClone(save), save.activeRun));
  return save;
}

async function checkSafeAreas() {
  const output = resolve('artifacts/ui-regression/hud-safe-area');
  await mkdir(output, { recursive: true });
  const base = new URL(process.env.UI_BASE_URL || 'http://localhost:5173/');
  assertLocalPage(base.href);
  const browser = await safeAreaBrowser(output);
  const results: unknown[] = [];
  let pageId = 0;
  const evaluate = async (expression: string) => {
    const text = await browser.call('evaluate_script', {
      pageId,
      function: expression,
      waitForStableDom: false,
    });
    const json = text.match(/```json\n([\s\S]*?)\n```/)?.[1];
    assert.ok(json, text);
    return JSON.parse(json);
  };
  const wait = (condition: string) =>
    evaluate(
      `async()=>{const until=performance.now()+20000;while(!(${condition})){if(performance.now()>until)throw Error('页面未就绪');await new Promise(r=>setTimeout(r,30))}return true}`,
    );
  const click = async (selector: string) => {
    await wait(`document.querySelector(${JSON.stringify(selector)})`);
    const point = await evaluate(
      `async()=>{const until=performance.now()+20000;while(true){const n=document.querySelector(${JSON.stringify(selector)});n.scrollIntoView({block:'nearest'});await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));const b=n.getBoundingClientRect(),x=b.x+b.width/2,y=b.y+b.height/2;if(!n.disabled&&b.width&&b.height&&n.contains(document.elementFromPoint(x,y)))return{x,y};if(performance.now()>until)throw Error('控件尚不可点击');await new Promise(r=>setTimeout(r,30))}}`,
    );
    await browser.call('click_at', { pageId, ...point, includeSnapshot: false });
  };
  try {
    for (const width of [390, 320])
      for (const top of [0, 24, 44, 59])
        for (const boss of [false, true]) {
          const page = await browser.call('new_page', {
            url: 'about:blank',
            isolatedContext: `safe-${width}-${top}-${boss}`,
          });
          const previous = pageId;
          pageId = Number(page.match(/(\d+):[^\n]*\[selected\]/)?.[1]);
          assert.ok(pageId);
          if (previous) await browser.call('close_page', { pageId: previous });
          await browser.call('emulate', { pageId, viewport: `${width}x844x1,mobile,touch` });
          const url = new URL(base);
          url.searchParams.set('hud-safe', `${width}-${top}-${boss}`);
          await browser.call('navigate_page', {
            pageId,
            url: url.href,
            initScript: `localStorage.setItem('qinglan-telemetry-off','1');localStorage.setItem('qinglan-leaderboard-v1','0');localStorage.setItem('qinglan-immortal-v1',${JSON.stringify(JSON.stringify(fixture(boss)))})`,
          });
          await wait('document.querySelector("[data-action=restore]")');
          await browser.inset(url.href, top);
          await click('[data-action=restore]');
          await click('[data-action=resume]');
          await evaluate(
            'async()=>{await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return true}',
          );
          const view = await evaluate(
            `()=>{const h=document.querySelector('.compact-hud'),b=h.getBoundingClientRect(),bar=document.querySelector('#boss-bar'),r=bar.getBoundingClientRect();return{top:b.top,height:b.height,padding:parseFloat(getComputedStyle(h).paddingTop),buttons:[...h.querySelectorAll('button')].map(n=>n.getBoundingClientRect().toJSON()),bossHidden:bar.hidden,bossTop:r.top,bossBottom:r.bottom,noticeTop:document.querySelector('#notice').getBoundingClientRect().top}}`,
          );
          assert.equal(view.top, 0, '背景必须贴顶');
          assert.equal(view.padding, top, '必须真正使用指定的原生安全区，禁止全部为0仍通过');
          assert.equal(view.height, top + 36, '安全区仅是内部留白，内容区36px');
          for (const button of view.buttons) {
            assert.equal(button.width, 28);
            assert.equal(button.height, 28);
            assert.equal(button.y + 14, top + 18);
          }
          assert.equal(view.bossHidden, !boss);
          if (boss) {
            assert.ok(view.bossTop >= view.height);
            assert.ok(view.noticeTop >= view.bossBottom);
          }
          await browser.call('take_screenshot', {
            pageId,
            filePath: join(output, `${width}-${top}-${boss ? 'boss' : 'normal'}.png`),
          });
          await click('[data-action=pause]');
          await click('[data-action=resume]');
          assert.equal(
            await evaluate(
              '()=>document.querySelector(".compact-hud").getBoundingClientRect().top',
            ),
            0,
            '暂停返回仍贴顶',
          );
          results.push({ width, requestedSafeTop: top, boss, view });
          console.log(`通过：${width}px，原生安全区${top}px，${boss ? '妖王' : '普通'}战斗`);
        }
    await writeFile(
      join(output, 'report.json'),
      JSON.stringify({ passed: true, results }, null, 2),
    );
  } catch (error) {
    await browser
      .call('take_screenshot', { pageId, filePath: join(output, 'failure.png') })
      .catch(() => {});
    await writeFile(join(output, 'failure.txt'), String(error));
    throw error;
  } finally {
    await browser.close();
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  await checkSafeAreas();
