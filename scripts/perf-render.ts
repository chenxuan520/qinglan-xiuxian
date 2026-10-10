// 渲染实测：真实 Chrome 无头恢复一场第六境后期高压对局，采样 60 秒 rAF 帧间隔与长任务。
// 只生成报告（artifacts/perf-render/），不因机器慢而失败；仅当浏览器/页面流程出错时非零退出。
// 本地运行需 CHROME_PATH 指向 Chrome/Chrome for Testing；CI 的 ubuntu-latest 自带 google-chrome。
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { Game } from '../src/game.ts';
import { freshSave, realmCost, SAVE_KEY } from '../src/progress.ts';
import { autoplayChoice, autoplayInput } from '../src/autoplay.ts';
import { TREASURES, PASSIVES } from '../src/data.ts';
import { seeded } from './balance-policy.ts';
import { percentile } from './perf-sim.ts';

export interface RenderSummary {
  samples: number;
  meanFps: number;
  p5Fps: number;
  maxGapMs: number;
  longTasks: number;
  longestTaskMs: number;
}
// gaps 为相邻 rAF 间隔毫秒；tasks 为长任务时长毫秒。
export function summarizeRender(gaps: number[], tasks: number[]): RenderSummary {
  const fps = gaps.filter((gap) => gap > 0).map((gap) => 1000 / gap);
  fps.sort((a, b) => a - b);
  return {
    samples: gaps.length,
    meanFps: fps.length ? fps.reduce((sum, value) => sum + value, 0) / fps.length : NaN,
    p5Fps: percentile(fps, 5),
    maxGapMs: gaps.length ? Math.max(...gaps) : NaN,
    longTasks: tasks.length,
    longestTaskMs: tasks.length ? Math.max(...tasks) : NaN,
  };
}

function findChrome(): string {
  if (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH))
    return process.env.CHROME_PATH;
  for (const path of [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ])
    if (existsSync(path)) return path;
  throw new Error('未找到 Chrome，可设置 CHROME_PATH 指向浏览器可执行文件');
}

// 离线生成可恢复存档：第六境后期、满配、场上已有真实敌人与弹丸，恢复即进入高压渲染。
export function perfSaveFixture(): string {
  const save = freshSave('heaven', ['metal'], 'dual', seeded(20261011));
  save.unlocked = 5;
  save.cultivation = Array.from({ length: 15 }, (_, step) => realmCost(step)).reduce(
    (sum, cost) => sum + cost,
    0,
  );
  save.prologueSeen = true;
  save.autoplay = true;
  const game = new Game(save, 5, 0, seeded(20261010));
  game.weapons = TREASURES.slice(0, 6).map((t) => ({
    id: t.id,
    level: 6,
    evolved: true,
    timer: 0,
  }));
  game.passives = Object.fromEntries(PASSIVES.slice(0, 4).map((p) => [p.id, 5]));
  game.time = game.stageDuration * 0.8;
  for (let frame = 0; frame < 30 * 10; frame += 1) {
    if (game.state === 'upgrade') game.choose(autoplayChoice(game)!.index);
    if (frame % 4 === 0) game.input = autoplayInput(game);
    game.update(1 / 30);
  }
  game.pause();
  if (game.state !== 'paused' || !game.enemies.length)
    throw new Error(`性能夹具生成失败：state=${game.state} enemies=${game.enemies.length}`);
  return JSON.stringify({
    ...save,
    activeRun: game.snapshot(),
    version: save.version,
    schema: save.schema,
  });
}

async function waitForServer(url: string, server: ChildProcess) {
  const deadline = Date.now() + 30_000;
  for (;;) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      if (server.exitCode !== null) throw new Error('vite preview 启动失败');
    }
    if (Date.now() > deadline) throw new Error('vite preview 30 秒未就绪');
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

// 极简 CDP 客户端：只用 Node 22 内置 WebSocket 与 fetch，不引入任何浏览器驱动依赖。
class CdpSession {
  private seq = 0;
  private pending = new Map<number, { ok: (value: any) => void; fail: (error: Error) => void }>();
  private listeners = new Map<string, ((params: any) => void)[]>();
  private ws: WebSocket;
  private constructor(ws: WebSocket) {
    this.ws = ws;
    ws.addEventListener('message', (event) => {
      const msg = JSON.parse(String(event.data));
      if (msg.id !== undefined && this.pending.has(msg.id)) {
        const { ok, fail } = this.pending.get(msg.id)!;
        this.pending.delete(msg.id);
        if (msg.error) fail(new Error(`CDP ${msg.error.message || '调用失败'}`));
        else ok(msg.result);
      } else if (msg.method) {
        for (const handler of this.listeners.get(msg.method) ?? []) handler(msg.params);
      }
    });
  }
  static async connect(url: string): Promise<CdpSession> {
    const ws = new WebSocket(url);
    await new Promise<void>((ok, fail) => {
      ws.addEventListener('open', () => ok(), { once: true });
      ws.addEventListener('error', () => fail(new Error(`CDP 连接失败：${url}`)), { once: true });
    });
    return new CdpSession(ws);
  }
  send<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    const id = ++this.seq;
    return new Promise<T>((ok, fail) => {
      this.pending.set(id, { ok, fail });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  nextEvent(method: string): Promise<unknown> {
    return new Promise((ok) => {
      const handler = (params: unknown) => {
        this.listeners.set(
          method,
          (this.listeners.get(method) ?? []).filter((h) => h !== handler),
        );
        ok(params);
      };
      this.listeners.set(method, [...(this.listeners.get(method) ?? []), handler]);
    });
  }
  close() {
    this.ws.close();
  }
}
async function evalJs<T>(session: CdpSession, expression: string): Promise<T> {
  const result = await session.send<{
    result: { value: T };
    exceptionDetails?: { text?: string; exception?: { description?: string } };
  }>('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails)
    throw new Error(
      `页面脚本执行失败：${result.exceptionDetails.exception?.description ?? result.exceptionDetails.text}`,
    );
  return result.result.value;
}
async function clickAction(session: CdpSession, action: string) {
  const deadline = Date.now() + 30_000;
  for (;;) {
    if (
      await evalJs<boolean>(
        session,
        `!!document.querySelector('[data-action="${action}"]:not([hidden]):not(:disabled)')`,
      )
    ) {
      await evalJs(session, `document.querySelector('[data-action="${action}"]').click()`);
      return;
    }
    if (Date.now() > deadline) throw new Error(`30 秒内未出现可点击的 ${action}`);
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 500));
  }
}
async function launchChrome(
  userDataDir: string,
): Promise<{ chrome: ChildProcess; devtoolsPort: string }> {
  const chrome = spawn(
    findChrome(),
    [
      '--headless=new',
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--window-size=1365,900',
      `--user-data-dir=${userDataDir}`,
      '--remote-debugging-port=0',
      'about:blank',
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] },
  );
  const wsUrl = await new Promise<string>((ok, fail) => {
    const timer = setTimeout(() => {
      chrome.kill(); // 超时立即回收进程，避免无头 Chrome 残留在本机
      fail(new Error('Chrome 15 秒未输出 DevTools 地址'));
    }, 15_000);
    chrome.stderr!.on('data', (chunk) => {
      const match = String(chunk).match(/DevTools listening on (ws:\/\/\S+)/);
      if (match) {
        clearTimeout(timer);
        ok(match[1]);
      }
    });
    chrome.on('error', () => {
      clearTimeout(timer);
      fail(new Error('Chrome 启动失败'));
    });
    chrome.on('exit', (code) => {
      clearTimeout(timer);
      fail(new Error(`Chrome 提前退出（${code}）`));
    });
  });
  return { chrome, devtoolsPort: new URL(wsUrl).port };
}

// SIGTERM 发出后浏览器仍可能写 profile；等进程与管道关闭后才能删除目录。
export async function stopRenderProcess(child: ChildProcess | undefined): Promise<void> {
  if (!child) return;
  if (
    (child.exitCode !== null || child.signalCode !== null) &&
    [child.stdin, child.stdout, child.stderr].every((stream) => !stream || stream.closed)
  )
    return;
  await new Promise<void>((ok, fail) => {
    let forced: ReturnType<typeof setTimeout> | undefined;
    const finish = (error?: Error) => {
      clearTimeout(graceful);
      clearTimeout(forced);
      child.removeListener('close', closed);
      child.removeListener('error', finish);
      if (error) fail(error);
      else ok();
    };
    const closed = () => finish();
    const graceful = setTimeout(() => {
      child.kill('SIGKILL');
      forced = setTimeout(() => finish(new Error('Chrome 退出超时')), 2000);
    }, 5000);
    child.once('close', closed);
    child.once('error', finish);
    child.kill();
  });
}

export async function collectRenderSample(options?: { seconds?: number }) {
  const seconds = options?.seconds ?? 60;
  const outDir = 'artifacts/perf-render';
  mkdirSync(outDir, { recursive: true });
  execFileSync(
    'npx',
    ['vite', 'build', '--base', '/', '--outDir', `${outDir}/site`, '--emptyOutDir'],
    { stdio: 'inherit' },
  );
  const server = spawn(
    'npx',
    ['vite', 'preview', '--outDir', `${outDir}/site`, '--port', '5199', '--strictPort'],
    { stdio: 'ignore' },
  );
  let chrome: ChildProcess | undefined;
  let session: CdpSession | undefined;
  let userDataDir: string | undefined;
  try {
    await waitForServer('http://localhost:5199/', server);
    // Chrome 136+ 需要非默认 profile 才启用调试端口，也避免污染开发者的浏览器。
    userDataDir = mkdtempSync(join(tmpdir(), 'qinglan-perf-chrome-'));
    const launched = await launchChrome(userDataDir);
    chrome = launched.chrome;
    const targets = (await (
      await fetch(`http://127.0.0.1:${launched.devtoolsPort}/json/list`)
    ).json()) as { type: string; webSocketDebuggerUrl: string }[];
    const page = targets.find((target) => target.type === 'page');
    if (!page) throw new Error('Chrome 无可用页面标签');
    session = await CdpSession.connect(page.webSocketDebuggerUrl);
    await session.send('Page.enable');
    await session.send('Runtime.enable');
    await session.send('Emulation.setDeviceMetricsOverride', {
      width: 1365,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });
    const firstLoad = session.nextEvent('Page.loadEventFired');
    await session.send('Page.navigate', { url: 'http://localhost:5199/' });
    await firstLoad;
    await evalJs(
      session,
      `localStorage.setItem(${JSON.stringify(SAVE_KEY)}, ${JSON.stringify(perfSaveFixture())})`,
    );
    const reloaded = session.nextEvent('Page.loadEventFired');
    await session.send('Page.navigate', { url: 'http://localhost:5199/' });
    await reloaded;
    await clickAction(session, 'restore');
    await clickAction(session, 'resume');
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 8000));
    await evalJs(
      session,
      `(() => { const gaps = []; const tasks = [];
      new PerformanceObserver((list) => list.getEntries().forEach((e) => tasks.push(e.duration))).observe({ type: 'longtask' });
      let last = performance.now();
      const tick = (now) => { gaps.push(now - last); last = now; requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
      window.__perf = { gaps, tasks };
      return true; })()`,
    );
    await new Promise((resolveDelay) => setTimeout(resolveDelay, seconds * 1000));
    const data = await evalJs<{ gaps: number[]; tasks: number[] }>(
      session,
      '(() => ({ gaps: window.__perf.gaps, tasks: window.__perf.tasks }))()',
    );
    const shot = await session.send<{ data: string }>('Page.captureScreenshot');
    writeFileSync(`${outDir}/frame.png`, Buffer.from(shot.data, 'base64'));
    return summarizeRender(data.gaps, data.tasks);
  } finally {
    session?.close();
    try {
      await stopRenderProcess(chrome);
    } catch {
      // 保留上游语义：进程收尾失败不抹掉已经完成的真实采样。
      console.warn('Chrome 清理未完成，保留已完成的采样结果。');
    } finally {
      server.kill();
      if (userDataDir)
        try {
          rmSync(userDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
        } catch {
          console.warn('临时浏览器目录清理未完成，保留已完成的采样结果。');
        }
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const started = Date.now();
  collectRenderSample()
    .then((summary) => {
      mkdirSync('artifacts/perf-render', { recursive: true });
      const report = {
        generatedAt: new Date().toISOString(),
        node: process.version,
        chrome: findChrome(),
        wallSeconds: (Date.now() - started) / 1000,
        summary,
      };
      writeFileSync('artifacts/perf-render/report.json', JSON.stringify(report, null, 2));
      writeFileSync(
        'artifacts/perf-render/summary.md',
        `# 渲染实测（无头 Chrome，第六境后期满配 60 秒）\n\n平均帧率 ${summary.meanFps.toFixed(1)} fps · 5 分位帧率 ${summary.p5Fps.toFixed(1)} fps · 最差帧间隔 ${summary.maxGapMs.toFixed(0)}ms · 长任务 ${summary.longTasks} 个（最久 ${Number.isFinite(summary.longestTaskMs) ? `${summary.longestTaskMs.toFixed(0)}ms` : '—'}）· 采样 ${summary.samples} 帧。\n\n仅作日报观测，不因无头环境速度设门槛。\n`,
      );
      console.log(
        `渲染实测：平均 ${summary.meanFps.toFixed(1)} fps，5% 低分位 ${summary.p5Fps.toFixed(1)} fps，最差帧间隔 ${summary.maxGapMs.toFixed(0)}ms，长任务 ${summary.longTasks} 个，采样 ${summary.samples} 帧。`,
      );
    })
    .catch((error) => {
      mkdirSync('artifacts/perf-render', { recursive: true });
      writeFileSync(
        'artifacts/perf-render/report.json',
        JSON.stringify({
          generatedAt: new Date().toISOString(),
          error: '渲染采样未完成，请查看 Actions 原始错误。',
        }),
      );
      console.error(`渲染实测失败：${error instanceof Error ? error.message : error}`);
      process.exit(1);
    });
}
