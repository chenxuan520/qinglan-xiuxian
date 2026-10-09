import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { SPIRIT_ROOTS, CULTIVATION_PATHS, treasure } from '../src/data.ts';
import {
  BALANCE_PROTOCOL,
  BALANCE_REFERENCE,
  BARE_CLEAR_TARGETS,
  balanceCases,
} from './balance-policy.ts';
import { runCases } from './balance-gate.ts';
import { acceptanceFailures, quantile, summarize } from './balance-metrics.ts';
import type { CampaignSample } from './balance-simulation.ts';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const CI_STAGE_COUNT = 6;
export function ciCases() {
  return balanceCases(true, [0]).filter((c) => c.profile === 'bare');
}
// 包含模拟器及其全部传递依赖；页面/素材不是模拟入口的依赖。
// 当前和旧版本各自遍历，导入集合改变也必然改变摘要。
export function simulationHash(root: string) {
  const pending = ['scripts/balance-simulation.ts'],
    files = new Map<string, string>();
  while (pending.length) {
    const name = pending.pop()!;
    if (files.has(name)) continue;
    const content = readFileSync(join(root, name), 'utf8');
    files.set(name, content);
    const source = ts.createSourceFile(name, content, ts.ScriptTarget.Latest, true);
    function dependency(specifier: string) {
      if (specifier.startsWith('node:')) return;
      if (!specifier.startsWith('.')) throw new Error(`无法验证外部模拟依赖：${name} ${specifier}`);
      const imported = relative(root, resolve(root, dirname(name), specifier));
      if (!imported.endsWith('.ts') || imported.startsWith('../'))
        throw new Error(`无法验证模拟依赖：${name} ${specifier}`);
      pending.push(imported);
    }
    function visit(node: ts.Node) {
      if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
        if (node.moduleSpecifier) {
          if (!ts.isStringLiteral(node.moduleSpecifier)) throw new Error('非字面量模块声明');
          dependency(node.moduleSpecifier.text);
        }
      } else if (ts.isImportEqualsDeclaration(node)) {
        throw new Error(`不支持模拟依赖 import=require：${name}`);
      } else if (ts.isCallExpression(node)) {
        const dynamic = node.expression.kind === ts.SyntaxKind.ImportKeyword;
        const requireCall = ts.isIdentifier(node.expression) && node.expression.text === 'require';
        if (dynamic || requireCall) {
          if (node.arguments.length !== 1 || !ts.isStringLiteral(node.arguments[0]))
            throw new Error(`无法验证动态模拟依赖：${name}`);
          dependency(node.arguments[0].text);
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
  const hash = createHash('sha256');
  for (const [name, content] of [...files].sort(([a], [b]) => a.localeCompare(b))) {
    hash.update(name + '\0');
    hash.update(content + '\0');
  }
  return { hash: hash.digest('hex'), files: [...files.keys()].sort() };
}
const rootName = (id: string) =>
  (
    ({ dual: '双灵根', triple: '三灵根', quad: '四灵根', five: '五灵根' }) as Record<string, string>
  )[id] ??
  SPIRIT_ROOTS.find((r) => r.id === id)?.name ??
  id;
const pathName = (id: string) => CULTIVATION_PATHS.find((p) => p.id === id)?.name ?? id;
const rate = (a: number, b: number) => (b ? `${((100 * a) / b).toFixed(1)}%` : '—');
const duration = (n: number | null) => (n === null ? '—' : `${n.toFixed(1)} 秒`);
export function ciSummary(rows: CampaignSample[], elapsedSeconds: number, planned = ciCases()) {
  const lines = [
    '# 前六关平衡测试',
    '',
    `样本 ${rows.length}/${planned.length}，未返回 ${planned.length - rows.length} 条；实际运行 ${elapsedSeconds.toFixed(3)} 秒。初入仙途，无广告、训练、炼器、药物、宗门与重试；每关从本命一重开始。`,
    '',
    '格子为通过数/进入数；前六关连通率以最初样本数为分母。未进入记为 —。固定种子自动模拟不等于真人胜率。',
    '',
    '| 灵根 | 第一关 | 第二关 | 第三关 | 第四关 | 第五关 | 第六关 | 前六关连通率 |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
  ];
  for (const { id } of SPIRIT_ROOTS) {
    const samples = rows.filter((r) => r.case.root === id);
    const count = planned.filter((c) => c.root === id).length;
    const stages = Array.from({ length: 6 }, (_, stage) => {
      const entered = samples.filter((r) => r.battles.some((b) => b.stage === stage)).length;
      const won = samples.filter((r) => r.cleared > stage).length;
      return entered ? `${won}/${entered}` : '—';
    });
    lines.push(
      `| ${rootName(id)} | ${stages.join(' | ')} | ${samples.filter((r) => r.cleared >= 6).length}/${count} (${rate(samples.filter((r) => r.cleared >= 6).length, count)}) |`,
    );
  }
  for (const dimension of ['path', 'device', 'starter'] as const) {
    const heading = { path: '路线', device: '场地', starter: '本命法宝' }[dimension];
    lines.push(
      '',
      `## 按${heading}分组`,
      '',
      '| 灵根 | 分组 | 通过/计划 | 连通率 |',
      '| --- | --- | --- | --- |',
    );
    for (const { id } of SPIRIT_ROOTS) {
      const samples = rows.filter((r) => r.case.root === id);
      for (const value of [
        ...new Set(planned.filter((c) => c.root === id).map((c) => c[dimension])),
      ]) {
        const group = samples.filter((r) => r.case[dimension] === value);
        const count = planned.filter((c) => c.root === id && c[dimension] === value).length;
        const label =
          dimension === 'path'
            ? pathName(value)
            : dimension === 'device'
              ? value === 'phone'
                ? '手机场地'
                : '电脑场地'
              : treasure(value as CampaignSample['case']['starter']).name;
        lines.push(
          `| ${rootName(id)} | ${label} | ${group.filter((r) => r.cleared >= 6).length}/${count} | ${rate(group.filter((r) => r.cleared >= 6).length, count)} |`,
        );
      }
    }
  }
  lines.push(
    '',
    '## 逐关耗时与妖王',
    '',
    '胜利耗时只统计胜局；妖王存活时间只统计实际击杀，未击杀另记观测下界。',
    '',
    '| 灵根 | 关卡 | 胜利耗时中位数 / P90 | 失败数 / 耗时中位数 | 妖王击杀 / 出场 | 已击杀存活中位数 / P90 | 未击杀观测中位数 |',
    '| --- | --- | --- | --- | --- | --- | --- |',
  );
  for (const { id } of SPIRIT_ROOTS)
    for (let stage = 0; stage < 6; stage++) {
      const battles = rows
        .filter((r) => r.case.root === id)
        .flatMap((r) => r.battles.filter((b) => b.stage === stage));
      const wins = battles.filter((b) => b.state === 'won'),
        losses = battles.filter((b) => b.state !== 'won');
      const bosses = battles.flatMap((b) => b.bosses),
        killed = bosses.filter((b) => b.deadAt !== null);
      const alive = bosses.filter((b) => b.deadAt === null);
      lines.push(
        `| ${rootName(id)} | ${stage + 1} | ${duration(
          quantile(
            wins.map((b) => b.seconds),
            0.5,
          ),
        )} / ${duration(
          quantile(
            wins.map((b) => b.seconds),
            0.9,
          ),
        )} | ${losses.length} / ${duration(
          quantile(
            losses.map((b) => b.seconds),
            0.5,
          ),
        )} | ${killed.length}/${bosses.length} | ${duration(
          quantile(
            killed.map((b) => b.observedSeconds),
            0.5,
          ),
        )} / ${duration(
          quantile(
            killed.map((b) => b.observedSeconds),
            0.9,
          ),
        )} | ${duration(
          quantile(
            alive.map((b) => b.observedSeconds),
            0.5,
          ),
        )} |`,
      );
    }
  return lines.join('\n') + '\n';
}
export function ciCsv(rows: CampaignSample[]) {
  const header = [
    '样本标识',
    '灵根',
    '路线',
    '本命',
    '场地',
    '种子',
    '已通关数',
    '关卡',
    '结果',
    '战斗秒数',
    '入场境界阶',
    '结束境界阶',
    '本局修为',
    '90秒修为',
    '90秒境界阶',
    '90秒局内等级',
    '首通修为',
    '妖王出场秒',
    '妖王击杀秒',
    '妖王存活或观测秒',
    '未击杀剩余血量比例',
  ];
  const escape = (value: unknown) => '"' + String(value ?? '').replaceAll('"', '""') + '"';
  const data = rows.flatMap((r) =>
    r.battles.map((b) => {
      const boss = b.bosses[0];
      return [
        r.key,
        rootName(r.case.root),
        pathName(r.case.path),
        treasure(r.case.starter).name,
        r.case.device,
        r.case.seed,
        r.cleared,
        b.stage + 1,
        b.state,
        b.seconds,
        b.entryStep,
        b.exitStep,
        b.cultivation,
        b.at90?.cultivation,
        b.at90?.step,
        b.at90?.level,
        b.firstClearCultivation,
        boss?.at,
        boss?.deadAt,
        boss?.observedSeconds,
        boss?.hpFraction,
      ]
        .map(escape)
        .join(',');
    }),
  );
  return '\uFEFF' + [header.map(escape).join(','), ...data].join('\r\n') + '\r\n';
}
export async function main(args: string[]) {
  if (args.length) throw new Error('balance:ci 不接受参数，固定运行840条前六关样本');
  const started = Date.now(),
    cases = ciCases(),
    jobs = Math.min(4, availableParallelism());
  const output = join(repository, 'artifacts/balance-ci');
  mkdirSync(output, { recursive: true });
  for (const name of ['summary.md', 'battles.csv']) rmSync(join(output, name), { force: true });
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: repository,
    encoding: 'utf8',
  }).trim();
  writeFileSync(
    join(output, 'report.json'),
    JSON.stringify({
      status: 'running',
      commit,
      reference: BALANCE_REFERENCE,
      stageCount: 6,
      cases: cases.length,
    }),
  );
  try {
    const currentSource = simulationHash(repository);
    console.log(`前六关快检：${cases.length} 条，${jobs} worker，初入仙途无辅助。`);
    const current = await runCases(cases, repository, jobs, '当前前六关', 6);
    const currentMetrics = summarize(current.results, cases, 6);
    const failures = [
      ...acceptanceFailures(current.results, current.errors, false),
      ...current.errors.map((e) => '当前异常 ' + e.key + ': ' + e.error),
    ];
    if (simulationHash(repository).hash !== currentSource.hash)
      failures.push('测试期间模拟源码改变');
    const elapsedSeconds = (Date.now() - started) / 1000;
    const report = {
      protocol: BALANCE_PROTOCOL,
      commit,
      reference: BALANCE_REFERENCE,
      stageCount: 6,
      cases: cases.length,
      jobs,
      elapsedSeconds,
      currentSource,
      currentMetrics,
      current: current.results,
      simulationErrors: current.errors,
      failures,
      passed: failures.length === 0,
      targets: BARE_CLEAR_TARGETS,
      generatedAt: new Date().toISOString(),
      scope: '前六关无辅助目标验收；终关与辅助路线由每日完整矩阵单独报告',
    };
    writeFileSync(join(output, 'report.json'), JSON.stringify(report));
    writeFileSync(join(output, 'battles.csv'), ciCsv(current.results));
    const status = `前六关目标检查：${report.passed ? '通过' : '失败'}；提交 ${commit}。\n\n验收范围：天灵根70–100%、异灵根50–90%、双灵根20–60%、三灵根10–50%、四灵根0–30%、五灵根0–25%、无灵根0–10%。\n\n`;
    const summary =
      status +
      ciSummary(current.results, elapsedSeconds) +
      (failures.length ? '\n## 失败项\n\n' + failures.map((f) => '- ' + f).join('\n') + '\n' : '');
    writeFileSync(join(output, 'summary.md'), summary);
    console.log(summary);
    console.log(`报告：${output}`);
    if (failures.length)
      throw new Error(`前六关回归失败 ${failures.length} 项：${failures.slice(0, 10).join('\n')}`);
  } catch (error) {
    const file = join(output, 'report.json'),
      report = JSON.parse(readFileSync(file, 'utf8'));
    writeFileSync(
      file,
      JSON.stringify({
        ...report,
        status: 'failed',
        passed: false,
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    throw error;
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main(process.argv.slice(2)).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
