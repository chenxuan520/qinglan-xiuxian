// 渲染实测：真实 Chrome 无头恢复一场第六境后期高压对局，采样 60 秒 rAF 帧间隔与长任务。
// 只生成报告（artifacts/perf-render/），不因机器慢而失败；仅当浏览器/页面流程出错时非零退出。
// 本地运行需 CHROME_PATH 指向 Chrome/Chrome for Testing；CI 的 ubuntu-latest 自带 google-chrome。
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import puppeteer, { type Browser, type Page } from 'puppeteer-core';
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

async function click(page: Page, selector: string) {
  await page.waitForSelector(selector, { timeout: 30_000 });
  await page.click(selector);
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
  let browser: Browser | undefined;
  try {
    await waitForServer('http://localhost:5199/', server);
    browser = await puppeteer.launch({
      executablePath: findChrome(),
      headless: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1365, height: 900 });
    await page.goto('http://localhost:5199/', { waitUntil: 'load' });
    const fixture = perfSaveFixture();
    await page.evaluate((key, data) => localStorage.setItem(key, data), SAVE_KEY, fixture);
    await page.reload({ waitUntil: 'load' });
    await click(page, '[data-action="restore"]');
    await click(page, '[data-action="resume"]');
    await new Promise((resolve) => setTimeout(resolve, 8000));
    await page.evaluate(() => {
      const gaps: number[] = [];
      const tasks: number[] = [];
      new PerformanceObserver((list) =>
        list.getEntries().forEach((entry) => tasks.push(entry.duration)),
      ).observe({ type: 'longtask' });
      let last = performance.now();
      const tick = (now: number) => {
        gaps.push(now - last);
        last = now;
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      (window as unknown as { __perf: unknown }).__perf = { gaps, tasks };
    });
    await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
    const data = await page.evaluate(() => {
      const perf = (window as unknown as { __perf: { gaps: number[]; tasks: number[] } }).__perf;
      return { gaps: perf.gaps, tasks: perf.tasks };
    });
    await page.screenshot({ path: `${outDir}/frame.png` });
    return summarizeRender(data.gaps, data.tasks);
  } finally {
    await browser?.close();
    server.kill();
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
      console.error(`渲染实测失败：${error instanceof Error ? error.message : error}`);
      process.exit(1);
    });
}
