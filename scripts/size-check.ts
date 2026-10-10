// 产物体积门禁：独立目录构建后检查入口 JS/CSS 原始与 gzip 字节数，防止依赖或素材意外膨胀。
// 预算约为 2026-10 基线的 120% 以上（docs/development.md 有基线记录），只拦明显异常增长。
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SIZE_BUDGET = {
  jsBytes: 550_000,
  jsGzip: 210_000,
  cssBytes: 150_000,
  cssGzip: 35_000,
};

export interface SizeMeasure {
  jsBytes: number;
  jsGzip: number;
  cssBytes: number;
  cssGzip: number;
}
export function measureEntry(outDir: string): SizeMeasure {
  const html = readFileSync(join(outDir, 'index.html'), 'utf8');
  // 多入口会抽取共享模块；计入游戏 HTML 的静态预加载，避免拆包绕过预算。
  const js = [...html.matchAll(/(?:src|href)="[^"]*assets\/([^"/]+\.js)"/g)].map((m) => m[1]);
  const css = [...html.matchAll(/href="[^"]*assets\/([^"/]+\.css)"/g)].map((m) => m[1]);
  if (!js.length || !css.length) throw new Error('未在 index.html 找到入口 JS/CSS 引用');
  const measure = (names: string[]) =>
    [...new Set(names)]
      .map((name) => readFileSync(join(outDir, 'assets', name)))
      .reduce(
        (total, file) => ({
          bytes: total.bytes + file.byteLength,
          gzip: total.gzip + gzipSync(file, { level: 9 }).byteLength,
        }),
        { bytes: 0, gzip: 0 },
      );
  const jsFiles = measure(js),
    cssFiles = measure(css);
  return {
    jsBytes: jsFiles.bytes,
    jsGzip: jsFiles.gzip,
    cssBytes: cssFiles.bytes,
    cssGzip: cssFiles.gzip,
  };
}
export function budgetBreaches(measure: SizeMeasure, budget = SIZE_BUDGET): string[] {
  const breaches: string[] = [];
  for (const key of Object.keys(budget) as (keyof SizeMeasure)[]) {
    if (measure[key] > budget[key])
      breaches.push(`${key} ${measure[key]} 字节超预算 ${budget[key]} 字节`);
  }
  return breaches;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const outDir = 'artifacts/size-check';
  mkdirSync(outDir, { recursive: true });
  execFileSync('npx', ['vite', 'build', '--base', '/', '--outDir', outDir, '--emptyOutDir'], {
    stdio: 'inherit',
  });
  const measure = measureEntry(outDir);
  console.log(
    `入口 JS ${measure.jsBytes} 字节（gzip ${measure.jsGzip}）· CSS ${measure.cssBytes} 字节（gzip ${measure.cssGzip}）`,
  );
  console.log(
    `预算 JS ≤ ${SIZE_BUDGET.jsBytes}（gzip ≤ ${SIZE_BUDGET.jsGzip}）· CSS ≤ ${SIZE_BUDGET.cssBytes}（gzip ≤ ${SIZE_BUDGET.cssGzip}）`,
  );
  const breaches = budgetBreaches(measure);
  writeFileSync(
    'artifacts/size-check/report.json',
    JSON.stringify(
      { generatedAt: new Date().toISOString(), budget: SIZE_BUDGET, measure, breaches },
      null,
      2,
    ),
  );
  writeFileSync(
    'artifacts/size-check/summary.md',
    `# 产物体积检查\n\n| 指标 | 实测字节 | 预算 |\n| --- | ---: | ---: |\n| 入口 JS | ${measure.jsBytes} | ${SIZE_BUDGET.jsBytes} |\n| 入口 JS gzip | ${measure.jsGzip} | ${SIZE_BUDGET.jsGzip} |\n| 入口 CSS | ${measure.cssBytes} | ${SIZE_BUDGET.cssBytes} |\n| 入口 CSS gzip | ${measure.cssGzip} | ${SIZE_BUDGET.cssGzip} |\n\n${breaches.length ? `未达标 ${breaches.length} 项。` : '通过。'}\n`,
  );
  if (breaches.length) {
    for (const text of breaches) console.error(`未达标：${text}`);
    process.exit(1);
  }
  console.log('产物体积检查通过。');
}
