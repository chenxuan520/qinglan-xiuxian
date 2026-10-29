// 渲染实测：自然推进至终关仙尊的真实续局，只采样playing时段的rAF和长任务。
// 只生成报告（artifacts/perf-render/），不因机器慢而失败；仅当浏览器/页面流程出错时非零退出。
// 本地运行需 CHROME_PATH 指向 Chrome/Chrome for Testing；CI 的 ubuntu-latest 自带 google-chrome。
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { SAVE_KEY } from '../src/progress.ts';
import { FINAL_TRIAL_STAGE, STAGES } from '../src/data.ts';
import {
  percentile,
  createScenarioGame,
  advanceScenarioStep,
  FINAL_TRIAL_SCENARIO,
  FINAL_TRIAL_SEED,
} from './perf-sim.ts';

export interface RenderSummary {
  samples: number;
  meanFps: number;
  meanFpsMethod: 'interval-count-over-total-ms';
  p5Fps: number;
  maxGapMs: number;
  longTasks: number;
  longestTaskMs: number;
  invalidSamples: number;
  invalidTasks: number;
}
// gaps 为相邻 rAF 间隔毫秒；tasks 为长任务时长毫秒。
export function summarizeRender(gaps: number[], tasks: number[]): RenderSummary {
  const validGaps = gaps.filter(
    (gap) => Number.isFinite(gap) && gap > 0 && Number.isFinite(1000 / gap),
  );
  const validTasks = tasks.filter((task) => Number.isFinite(task) && task > 0);
  const elapsed = validGaps.reduce((sum, gap) => sum + gap, 0);
  const fps = validGaps.map((gap) => 1000 / gap);
  fps.sort((a, b) => a - b);
  return {
    samples: validGaps.length,
    meanFps:
      validGaps.length && Number.isFinite(elapsed) ? (validGaps.length * 1000) / elapsed : NaN,
    meanFpsMethod: 'interval-count-over-total-ms',
    p5Fps: percentile(fps, 5),
    maxGapMs: validGaps.length ? Math.max(...validGaps) : NaN,
    longTasks: validTasks.length,
    longestTaskMs: validTasks.length ? Math.max(...validTasks) : NaN,
    invalidSamples: gaps.length - validGaps.length,
    invalidTasks: tasks.length - validTasks.length,
  };
}

export interface RenderFrames {
  gaps: number[];
  activeFrames: number;
  skippedFrames: number;
  activeMs: number;
  lastAt: number | null;
  lastPlaying: boolean;
  firstGameTime: number | null;
  lastGameTime: number | null;
  windows: { start: number; end: number }[];
}

export function renderCoverageMinimum(seconds: number): number {
  if (!Number.isFinite(seconds) || seconds < 2)
    throw new RangeError('渲染采样秒数必须为至少2秒的有限值');
  // 短采样容忍首尾rAF与整秒HUD读数的最多1秒量化差；正式60秒仍要求至少30秒。
  return Math.min(30, seconds - 1);
}

export function renderCoverageBreaches(
  data: Pick<RenderFrames, 'gaps' | 'activeMs' | 'firstGameTime' | 'lastGameTime'> & {
    finalBossNameSeen: boolean;
  },
  seconds: number,
): string[] {
  const minimum = renderCoverageMinimum(seconds);
  const breaches: string[] = [];
  if (!data.gaps.some((gap) => Number.isFinite(gap) && gap > 0))
    breaches.push('没有有效战斗帧间隔');
  if (!Number.isFinite(data.activeMs) || data.activeMs < minimum * 1000)
    breaches.push(`有效playing区间不足${minimum}秒，不能用暂停或结算页补足采样`);
  if (
    data.firstGameTime === null ||
    data.lastGameTime === null ||
    !Number.isFinite(data.firstGameTime) ||
    !Number.isFinite(data.lastGameTime) ||
    data.lastGameTime - data.firstGameTime < minimum
  )
    breaches.push(`HUD战斗时钟推进不足${minimum}秒`);
  if (!data.finalBossNameSeen) breaches.push('有效战斗采样期间没有可见仙尊覆盖');
  return breaches;
}

// 同一rAF循环也会在暂停、升级或结算页继续运行；只保留连续playing帧之间的间隔。
export function recordRenderFrame(
  data: RenderFrames,
  now: number,
  playing: boolean,
  gameTime: number | null,
) {
  if (playing) {
    data.activeFrames++;
    if (gameTime !== null && Number.isFinite(gameTime)) {
      data.firstGameTime ??= gameTime;
      data.lastGameTime = gameTime;
    }
    if (data.lastPlaying && data.lastAt !== null && now > data.lastAt) {
      const gap = now - data.lastAt;
      data.gaps.push(gap);
      data.activeMs += gap;
      data.windows[data.windows.length - 1].end = now;
    } else data.windows.push({ start: now, end: now });
  } else data.skippedFrames++;
  data.lastAt = now;
  data.lastPlaying = playing;
}

export function renderSamplingSource() {
  return `(() => { const data = { gaps: [], activeFrames: 0, skippedFrames: 0, activeMs: 0, lastAt: null, lastPlaying: false, firstGameTime: null, lastGameTime: null, windows: [], tasks: [], finalBossNameSeen: false };
    const record = ${recordRenderFrame.toString()};
    const observer = new PerformanceObserver((list) => list.getEntries().forEach((e) => data.tasks.push({ start: e.startTime, duration: e.duration })));
    observer.observe({ type: 'longtask' });
    const tick = (now) => {
      const playing = document.body.classList.contains('in-game') && !document.hidden && document.hasFocus() && !!document.querySelector('.game-hud') && !document.querySelector('.scene-loading') && !document.querySelector('#modal-root')?.childElementCount;
      const match = document.querySelector('#time')?.textContent?.match(/^(\\d+):(\\d+)$/);
      record(data, now, playing, match ? Number(match[1]) * 60 + Number(match[2]) : null);
      const boss = document.querySelector('#boss-bar');
      if (playing && boss && !boss.hidden && boss.textContent?.includes(${JSON.stringify(STAGES[FINAL_TRIAL_STAGE].boss)})) data.finalBossNameSeen = true;
      data.animation = requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    data.observer = observer;
    window.__perf = data;
    return true; })()`;
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

// 从0秒自然推进，必须真正走到七王排程中的仙尊，不手动生怪、跳时或锁血。
export function prepareRenderFixture() {
  const game = createScenarioGame(FINAL_TRIAL_SCENARIO, FINAL_TRIAL_SEED);
  game.save.autoplay = true;
  let frames = 0;
  for (; frames < 600 * 30; frames += 1) {
    if (game.enemies.some((enemy) => enemy.boss && enemy.bossStage === FINAL_TRIAL_STAGE)) break;
    const step = advanceScenarioStep(game, frames);
    if (!step?.advanced) throw new Error(`自然暖场未到仙尊：time=${game.time} state=${game.state}`);
  }
  if (
    frames === 600 * 30 ||
    !game.enemies.some((enemy) => enemy.boss && enemy.bossStage === FINAL_TRIAL_STAGE)
  )
    throw new Error('自然暖场600秒内没有实际出现仙尊');
  game.pause();
  if (game.state !== 'paused' || !game.enemies.length)
    throw new Error(`性能夹具生成失败：state=${game.state} enemies=${game.enemies.length}`);
  return {
    save: JSON.stringify({ ...game.save, activeRun: game.snapshot() }),
    coverage: {
      input: FINAL_TRIAL_SCENARIO,
      seed: FINAL_TRIAL_SEED,
      stage: game.stage,
      naturalWarmupFrames: frames,
      gameTime: game.time,
      state: game.state,
      bossesSpawned: game.trialBossesSpawned,
      bossesDefeated: game.trialBossesDefeated,
      bossStages: game.enemies.filter((enemy) => enemy.boss).map((enemy) => enemy.bossStage),
      enemies: game.enemies.length,
      shots: game.shots.length,
      zones: game.zones.length,
      effectsBeforeSnapshot: game.effects.length,
    },
  };
}

export function perfSaveFixture(): string {
  return prepareRenderFixture().save;
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
  const minimumCoverageSeconds = renderCoverageMinimum(seconds);
  const fixture = prepareRenderFixture();
  const outDir = 'artifacts/perf-render';
  mkdirSync(outDir, { recursive: true });
  rmSync(`${outDir}/frame.png`, { force: true });
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
    await session.send('Page.addScriptToEvaluateOnNewDocument', {
      source: `localStorage.setItem('qinglan-telemetry-off', '1');localStorage.setItem('qinglan-damage-numbers-v1', '1');localStorage.setItem(${JSON.stringify(SAVE_KEY)}, ${JSON.stringify(fixture.save)});`,
    });
    await session.send('Emulation.setDeviceMetricsOverride', {
      width: 1365,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });
    const firstLoad = session.nextEvent('Page.loadEventFired');
    await session.send('Page.navigate', { url: 'http://localhost:5199/' });
    await firstLoad;
    await session.send('Page.bringToFront');
    await clickAction(session, 'restore');
    await clickAction(session, 'resume');
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 8000));
    await evalJs(session, renderSamplingSource());
    await new Promise((resolveDelay) => setTimeout(resolveDelay, seconds * 1000));
    const data = await evalJs<RenderFrames & { tasks: number[]; finalBossNameSeen: boolean }>(
      session,
      `(() => { const data = window.__perf; cancelAnimationFrame(data.animation); data.observer.disconnect();
      return { ...data, observer: undefined, tasks: data.tasks.filter(t => data.windows.some(w => t.start < w.end && t.start + t.duration > w.start)).map(t => t.duration) }; })()`,
    );
    const breaches = renderCoverageBreaches(data, seconds);
    if (breaches.length) throw new Error(breaches.join('；'));
    return {
      ...summarizeRender(data.gaps, data.tasks),
      coverage: {
        fixture: fixture.coverage,
        requestedWallSeconds: seconds,
        minimumCoverageSeconds,
        playingWallSeconds: data.activeMs / 1000,
        activeFrames: data.activeFrames,
        skippedFrames: data.skippedFrames,
        gameTimeStart: data.firstGameTime,
        gameTimeEnd: data.lastGameTime,
        finalBossNameSeen: data.finalBossNameSeen,
        note: '战斗时钟来自正常HUD整秒读数；activeFrames为playing rAF观测数，不冒充Game更新步数。',
      },
    };
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
        `# 渲染实测（无头 Chrome，终关仙尊自然续局）\n\n平均帧率 ${summary.meanFps.toFixed(1)} fps · 5 分位帧率 ${summary.p5Fps.toFixed(1)} fps · 最差帧间隔 ${summary.maxGapMs.toFixed(0)}ms · 长任务 ${summary.longTasks} 个（最久 ${Number.isFinite(summary.longestTaskMs) ? `${summary.longestTaskMs.toFixed(0)}ms` : '—'}）· 有效 ${summary.samples} 个帧间隔。\n\n实际战斗区间 ${summary.coverage.gameTimeStart}–${summary.coverage.gameTimeEnd} 秒，playing墙钟 ${summary.coverage.playingWallSeconds.toFixed(1)} 秒，排除非战斗rAF ${summary.coverage.skippedFrames} 帧。夹具输入、自然暖场和妖王阶段见 report.json；瞬时特效沿真实快照规则重新生成。仅作日报观测，不因无头环境速度设门槛。\n`,
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
