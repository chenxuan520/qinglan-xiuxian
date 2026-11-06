import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { analyzeEvidence, redactAnalysisText } from './observe-analysis.ts';
import { collectSource, githubJson, safeText } from './observe-collect.ts';
import {
  emptyObserverState,
  evaluateSnapshot,
  parseObserverConfig,
  validateObserverState,
} from './observe-policy.ts';
import type {
  AnalysisResult,
  ObserverConfig,
  ObserverCredentialSource,
  ObserverState,
  Snapshot,
} from './observe-types.ts';

export function observerCredentialSource(
  env: Readonly<Record<string, string | undefined>>,
): ObserverCredentialSource | undefined {
  const selectedSecret = env.OBSERVER_KEY_SOURCE;
  if (
    selectedSecret !== 'OPENAI_API_KEY' &&
    selectedSecret !== 'OBSERVER_API_KEY' &&
    selectedSecret !== 'custom-secret'
  )
    return undefined;
  return {
    selectedSecret,
    openaiConfigured: env.OBSERVER_OPENAI_KEY_CONFIGURED === 'true',
    observerConfigured: env.OBSERVER_COMPAT_KEY_CONFIGURED === 'true',
  };
}

const MAX_STATE_BYTES = 16 * 1024 * 1024;
export function readObserverState(path: string): ObserverState {
  const text = readFileSync(path, 'utf8');
  if (Buffer.byteLength(text) > MAX_STATE_BYTES) throw new Error('观察器历史超过容量限制');
  return validateObserverState(JSON.parse(text));
}

// 只恢复本仓库 master 的本工作流产物，失败任务同样可保存已通知事件。
export async function restoreObserverState(
  repository: string,
  directory: string,
  currentRun?: string,
  deps: { github?: typeof githubJson; download?: (runId: number, target: string) => void } = {},
) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository)) throw new Error('仓库标识无效');
  const api = deps.github ?? githubJson;
  const response = (await api(
    `repos/${repository}/actions/workflows/observer.yml/runs?branch=master&per_page=30`,
  )) as any;
  if (!Array.isArray(response.workflow_runs)) throw new Error('无法读取观察器历史');
  const runs = response.workflow_runs.filter(
    (r: any) =>
      String(r.id) !== currentRun &&
      r.status === 'completed' &&
      r.conclusion !== 'cancelled' &&
      r.head_branch === 'master' &&
      r.repository?.full_name === repository &&
      r.head_repository?.full_name === repository &&
      ['schedule', 'workflow_dispatch'].includes(r.event),
  );
  mkdirSync(directory, { recursive: true });
  for (const run of runs) {
    const artifacts = (await api(
      `repos/${repository}/actions/runs/${run.id}/artifacts?per_page=100`,
    )) as any;
    if (!Array.isArray(artifacts.artifacts)) throw new Error('无法读取观察器产物');
    const artifact = artifacts.artifacts.find(
      (a: any) => a.name === 'observer-state' && !a.expired,
    );
    if (!artifact) continue;
    if (artifact.size_in_bytes > MAX_STATE_BYTES) throw new Error('观察器历史产物超过容量限制');
    const target = join(directory, 'previous');
    rmSync(target, { recursive: true, force: true });
    if (deps.download) deps.download(run.id, target);
    else
      execFileSync(
        'gh',
        [
          'run',
          'download',
          String(run.id),
          '--repo',
          repository,
          '--name',
          'observer-state',
          '--dir',
          target,
        ],
        { timeout: 60000, stdio: 'pipe' },
      );
    const state = readObserverState(join(target, 'state.json'));
    writeFileSync(join(directory, 'state.json'), JSON.stringify(state));
    return;
  }
  // 有旧运行却找不到状态时不能悄悄从空历史开始，避免重复通知或误记恢复。
  if (runs.length) throw new Error('历史状态缺失或过期，请检查 observer-state 产物');
  writeFileSync(join(directory, 'state.json'), JSON.stringify(emptyObserverState()));
}

const markdown = (v: unknown) => safeText(v, 1500).replace(/[\\`*_{}\[\]<>#|]/g, '\\$&');
export function observerSummary(
  snapshot: Snapshot,
  decision: ReturnType<typeof evaluateSnapshot>,
  analysis: AnalysisResult,
): string {
  const at = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    dateStyle: 'short',
    timeStyle: 'medium',
    hour12: false,
  }).format(new Date(snapshot.at));
  const unresolved = Object.values(decision.state.incidents).filter(
    (i) => !i.resolvedAt && i.notifiedAt,
  ).length;
  const pending = snapshot.observations.filter((o) => o.status === 'pending').length;
  const aiFailed = analysis.status === 'failed' || analysis.status === 'unavailable';
  const source = analysis.credentialSource;
  const credentialLabel = source
    ? `AI 凭据来源：${source.selectedSecret}；OPENAI_API_KEY 已配置 ${source.openaiConfigured}；OBSERVER_API_KEY 已配置 ${source.observerConfigured}。`
    : '';
  if (
    !decision.signals.length &&
    !decision.recovered.length &&
    !unresolved &&
    !pending &&
    !analysis.reanalyzed &&
    !aiFailed
  )
    return `观察完成（北京时间 ${at}）：未发现异常；${snapshot.observations.length} 个来源。${credentialLabel}\n`;
  const lines = [
    `运行观察（北京时间 ${at}）`,
    '',
    `新提醒 ${decision.notifications.length}，当前候选 ${decision.signals.length}，恢复 ${decision.recovered.length}。`,
    '',
  ];
  if (credentialLabel) lines.push(credentialLabel, '');
  if (analysis.reanalyzed)
    lines.push(
      `手动重分析：当前 ${decision.signals.length} 个候选，AI 状态 ${analysis.status}；去重与新增提醒规则保持。`,
      '',
    );
  if (pending) lines.push(`后台任务执行中 ${pending} 项；尚未生成的新结果不判失败或恢复。`, '');
  if (unresolved && !decision.signals.length)
    lines.push(`仍有 ${unresolved} 项已提醒事件待核实，当前没有足够证据确认恢复。`, '');
  for (const signal of decision.notifications) {
    const source = snapshot.observations.find((o) => o.id === signal.sourceId);
    lines.push(`- **${markdown(signal.title)}**：${markdown(signal.detail)}`);
    if (source?.url)
      lines.push(
        `  来源：<${source.url}>；版本：${markdown(source.version ?? '未提供')}；生成于：${markdown(source.generatedAt ?? '未提供')}。`,
      );
    const finding = analysis.findings.find((f) => f.signalId === `${signal.sourceId}/${signal.id}`);
    if (finding)
      lines.push(
        `  分析：${markdown(finding.explanation)} ${finding.nextSteps.map(markdown).join(' ')}`,
      );
  }
  for (const incident of decision.recovered)
    lines.push(`- 已恢复：${markdown(incident.signal.title)}。`);
  if (!decision.notifications.length && decision.signals.length)
    lines.push('已有异常保持记录；未重复提醒。');
  if (analysis.reanalyzed)
    for (const finding of analysis.findings)
      if (
        !decision.notifications.some(
          (signal) => `${signal.sourceId}/${signal.id}` === finding.signalId,
        )
      )
        lines.push(
          `重分析：${markdown(finding.explanation)} ${finding.nextSteps.map(markdown).join(' ')}`,
        );
  if (analysis.status === 'failed' || analysis.status === 'unavailable')
    lines.push(
      '',
      `AI 分析不可用：${markdown(analysis.error ?? analysis.summary)}。现有证据与异常结论仍保留。`,
    );
  if (analysis.diagnostics) {
    const diagnostic = analysis.diagnostics;
    lines.push(
      '',
      `AI 诊断：阶段 ${markdown(diagnostic.stage)}；耗时 ${diagnostic.elapsedMs} ms` +
        (diagnostic.endpoint
          ? `；地址 ${redactAnalysisText(diagnostic.endpoint.origin + diagnostic.endpoint.path).replace(/[\\`*_{}\[\]<>#|]/g, '\\$&')}`
          : '') +
        (diagnostic.httpStatus === undefined ? '' : `；HTTP ${diagnostic.httpStatus}`) +
        (diagnostic.errorName ? `；error.name ${markdown(diagnostic.errorName)}` : '') +
        (diagnostic.causeCode ? `；cause.code ${markdown(diagnostic.causeCode)}` : '') +
        (diagnostic.keyFormatReason ? `；keyFormatReason ${diagnostic.keyFormatReason}` : '') +
        '。',
    );
  }
  return lines.join('\n') + '\n';
}

export async function runObserver(
  config: ObserverConfig,
  previous: ObserverState,
  output: string,
  at = new Date().toISOString(),
  deps: {
    collect?: typeof collectSource;
    analyze?: typeof analyzeEvidence;
    env?: Record<string, string | undefined>;
  } = {},
) {
  const env = deps.env ?? process.env;
  const observations = await Promise.all(
    config.sources.map((source) => (deps.collect ?? collectSource)(source, at)),
  );
  if (config.analysis.engine !== 'none') {
    const missing = !env[config.analysis.apiKeyEnv];
    observations.push({
      id: 'observer-integration',
      title: '观察器 AI 配置',
      kind: 'integration',
      status: missing ? 'unavailable' : 'ready',
      observedAt: at,
      metrics: [],
      signals: missing
        ? [
            {
              id: 'missing-key',
              sourceId: 'observer-integration',
              severity: 'warning',
              title: '观察器未配置 API 凭据',
              detail: '请配置观察器 API 凭据；聚合证据仍正常采集。',
              evidenceIds: ['observer-integration'],
            },
          ]
        : [],
    });
  }
  const snapshot: Snapshot = { schemaVersion: 1, at, observations };
  const decision = evaluateSnapshot(snapshot, previous, config.policy);
  const reanalyze = env.OBSERVER_REANALYZE === 'true';
  const result = await (deps.analyze ?? analyzeEvidence)(
    {
      at,
      signals: (reanalyze ? decision.signals : decision.notifications).map((s) => ({
        ...s,
        id: `${s.sourceId}/${s.id}`,
      })),
      evidence: observations.map((o) => ({
        id: o.id,
        text: JSON.stringify({
          title: o.title,
          status: o.status,
          version: o.version,
          generatedAt: o.generatedAt,
          metrics: o.metrics,
          signals: o.signals,
        }),
      })),
    },
    config.analysis,
    { env },
  );
  const source = observerCredentialSource(env);
  const analysis: AnalysisResult = {
    ...result,
    ...(reanalyze ? { reanalyzed: true } : {}),
    ...(source ? { credentialSource: source } : {}),
  };
  mkdirSync(output, { recursive: true });
  const write = (name: string, data: string) => {
    writeFileSync(join(output, `${name}.tmp`), data, { mode: 0o600 });
    renameSync(join(output, `${name}.tmp`), join(output, name));
  };
  write('state.json', JSON.stringify(decision.state));
  write(
    'result.json',
    JSON.stringify({
      snapshot,
      signals: decision.signals,
      notifications: decision.notifications,
      recovered: decision.recovered,
      analysis,
    }),
  );
  write('summary.md', observerSummary(snapshot, decision, analysis));
  const failed =
    decision.notifications.length > 0 ||
    analysis.status === 'failed' ||
    analysis.status === 'unavailable';
  write('exit.json', JSON.stringify({ failed, newIncidents: decision.notifications.length }));
  return { failed, decision, analysis };
}

async function main() {
  const args = process.argv.slice(2);
  if (args[0] === '--restore') {
    await restoreObserverState(
      process.env.GITHUB_REPOSITORY ?? '',
      resolve(args[1] ?? 'artifacts/observer'),
      process.env.GITHUB_RUN_ID,
    );
    return;
  }
  const config = parseObserverConfig(
    JSON.parse(readFileSync(resolve(args[0] ?? 'scripts/observer.config.json'), 'utf8')),
  );
  // 仓库 Variables 可替换模型、服务和协议，无需修改业务脚本或游戏构建。
  const overrides = {
    engine: process.env.OBSERVER_ENGINE,
    model: process.env.OBSERVER_MODEL,
    baseUrl: process.env.OBSERVER_BASE_URL,
    protocol: process.env.OBSERVER_PROTOCOL,
  };
  for (const [key, value] of Object.entries(overrides))
    if (value) (config.analysis as any)[key] = value;
  const checked = parseObserverConfig(config);
  const output = resolve(args[1] ?? 'artifacts/observer');
  const path = join(output, 'state.json');
  const previous = existsSync(path) ? readObserverState(path) : emptyObserverState();
  const { failed, decision, analysis } = await runObserver(checked, previous, output);
  if (analysis.credentialSource)
    console.log(JSON.stringify({ observerCredentials: analysis.credentialSource }));
  console.log(
    decision.notifications.length
      ? '发现新的已确认异常；证据与去重状态已保存。'
      : failed
        ? 'AI 分析未完成；证据与去重状态已保存。'
        : '观察完成；无新增提醒。',
  );
  if (failed) process.exitCode = 1;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main().catch(() => {
    console.error('观察器执行失败，请检查配置、权限和历史状态；未输出原始异常或凭据。');
    process.exitCode = 1;
  });
