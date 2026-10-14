import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { TREASURES, treasure } from '../src/data.ts';
import { seeded } from './balance-policy.ts';
import { weaponCaseKey, WEAPON_BENCHMARK_PROTOCOL } from './weapon-benchmark-policy.ts';
import type { WeaponCase, WeaponPlanOptions } from './weapon-benchmark-policy.ts';
import { validWeaponReport } from '../src/weapon-report.ts';
import type { WeaponBattleStats, WeaponPairStats, WeaponReport } from '../src/weapon-report.ts';

export const mean = (xs: number[]) =>
  xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
export const median = (xs: number[]) => {
  if (!xs.length) return null;
  const sorted = [...xs].sort((a, b) => a - b),
    n = sorted.length;
  return n % 2 ? sorted[Math.floor(n / 2)] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
};
const number = (x: unknown) => typeof x === 'number' && Number.isFinite(x);
export function verifyWeaponBattle(r: any) {
  assert.ok(
    r && ['won', 'lost', 'expired', 'timeout', 'paused', 'tribulation'].includes(r.state),
    '未知战斗结果',
  );
  for (const key of [
    'seconds',
    'damage',
    'ownDamage',
    'heal',
    'hurt',
    'growthHp',
    'growthHpLoss',
    'maxHp',
    'hp',
  ])
    assert.ok(number(r[key]) && r[key] >= 0, `非法战斗数值：${key}`);
  assert.ok(r.hp <= 1 + 1e-9 && r.seconds > 0 && r.maxHp > 0);
  assert.ok(r.damageBySource && typeof r.damageBySource === 'object');
  const total = Object.values(r.damageBySource).reduce<number>((sum, x) => {
    assert.ok(number(x) && x >= 0);
    return sum + x;
  }, 0);
  assert.ok(Math.abs(total - r.damage) < Math.max(1e-5, r.damage * 1e-8), '伤害来源与总量不符');
  assert.ok(Math.abs((r.damageBySource[r.weapon] ?? 0) - r.ownDamage) < 1e-7, '本命伤害来源不符');
  assert.ok(r.endWeapons.length <= 6 && Object.keys(r.endPassives).length <= 4, '构筑超过槽位限制');
  for (const boss of r.bosses)
    assert.ok(
      number(boss.at) &&
        number(boss.observed) &&
        boss.observed >= 0 &&
        number(boss.hp) &&
        boss.hp >= 0 &&
        boss.hp <= 1 &&
        (boss.deadAt === null || (number(boss.deadAt) && boss.deadAt >= boss.at)),
      '非法妖王观测',
    );
}
export function verifyWeaponCoverage(rows: any[], plan: WeaponCase[]) {
  const expected = new Map(plan.map((j) => [weaponCaseKey(j), j]));
  assert.equal(expected.size, plan.length, '计划有重复样本');
  const found = new Set<string>();
  for (const row of rows) {
    const job = row.job ?? row,
      key = weaponCaseKey(job);
    assert.ok(expected.has(key), '出现计划外样本');
    assert.ok(!found.has(key), '出现重复样本');
    found.add(key);
    if (job.kind === 'pair') {
      verifyWeaponBattle(row.candidate);
      verifyWeaponBattle(row.reference);
      assert.ok(
        ['won', 'lost', 'expired', 'timeout'].includes(row.candidate.state) &&
          ['won', 'lost', 'expired', 'timeout'].includes(row.reference.state),
        '配对存在未处理的暂停或天劫',
      );
      assert.equal(row.candidate.weapon, job.weapon);
      assert.equal(row.reference.weapon, job.reference);
      assert.deepEqual(row.candidate.entry.elements, row.reference.entry.elements);
      assert.deepEqual(
        row.candidate.entry.weapons.slice(0, 5),
        row.reference.entry.weapons.slice(0, 5),
      );
      assert.equal(row.candidate.entry.level, row.reference.entry.level);
      for (const side of [row.candidate, row.reference])
        assert.equal(
          Object.values(side.entry.passives).reduce<number>((a, b) => a + Number(b), 0),
          14,
        );
      if (job.weapon === job.reference) assert.deepEqual(row.candidate, row.reference);
      assert.equal(row.actualSimulations, job.weapon === job.reference ? 1 : 2);
    } else verifyWeaponBattle(row);
  }
  assert.equal(found.size, expected.size, '缺少计划样本');
}
export function weaponBattleStats(rows: any[]): WeaponBattleStats {
  const bosses = rows.flatMap((r) => r.bosses),
    dead = bosses.filter((b) => b.deadAt !== null),
    alive = bosses.filter((b) => b.deadAt === null);
  return {
    n: rows.length,
    wins: rows.filter((r) => r.state === 'won').length,
    lost: rows.filter((r) => ['lost', 'expired'].includes(r.state)).length,
    timeout: rows.filter((r) => r.state === 'timeout').length,
    censored: rows.filter((r) => ['paused', 'tribulation'].includes(r.state)).length,
    arrived: rows.filter((r) => r.bosses.length).length,
    evolved: rows.filter((r) => r.atEvolve !== null).length,
    at6Seconds: median(rows.flatMap((r) => (r.at6 === null ? [] : [r.at6]))),
    evolveSeconds: median(rows.flatMap((r) => (r.atEvolve === null ? [] : [r.atEvolve]))),
    ownShare: mean(rows.map((r) => (r.damage ? (100 * r.ownDamage) / r.damage : 0))),
    bossKilled: dead.length,
    bossUnresolved: alive.length,
    bossSeconds: median(dead.map((b) => b.deadAt - b.at)),
    observedSeconds: median(alive.map((b) => b.observed)),
    remainingHp: median(alive.map((b) => 100 * b.hp)),
  };
}
export function weaponClusterInterval(
  rows: any[],
  metric: (r: any) => number,
): [number, number] | null {
  const groups = new Map<number, number[]>();
  for (const r of rows) {
    const values = groups.get(r.job.index) ?? [];
    values.push(metric(r.candidate) - metric(r.reference));
    groups.set(r.job.index, values);
  }
  // 固定簇及簇内顺序，调整workers或输入行顺序不会改变区间。
  const units = [...groups]
    .sort(([a], [b]) => a - b)
    .map(([, xs]) => [...xs].sort((a, b) => a - b));
  if (units.length < 2) return null;
  const random = seeded(20261014),
    samples = [];
  for (let k = 0; k < 4000; k++) {
    let sum = 0,
      n = 0;
    for (let i = 0; i < units.length; i++) {
      const u = units[Math.floor(random() * units.length)];
      sum += u.reduce((a, b) => a + b, 0);
      n += u.length;
    }
    samples.push(sum / n);
  }
  samples.sort((a, b) => a - b);
  return [samples[100], samples[3900]];
}
export function weaponPairStats(input: any[]): WeaponPairStats {
  const rows = input.filter((r) => r.job.weapon !== r.job.reference);
  const win = (r: any) => Number(r.state === 'won') * 100;
  const survival = (r: any) => (['lost', 'expired'].includes(r.state) ? r.seconds : 105);
  return {
    n: rows.length,
    selfChecks: input.length - rows.length,
    clusters: new Set(rows.map((r) => r.job.index)).size,
    candidate: weaponBattleStats(rows.map((r) => r.candidate)),
    reference: weaponBattleStats(rows.map((r) => r.reference)),
    winDifference: mean(rows.map((r) => win(r.candidate) - win(r.reference))),
    winCI: weaponClusterInterval(rows, win),
    survivalDifference: mean(rows.map((r) => survival(r.candidate) - survival(r.reference))),
    survivalCI: weaponClusterInterval(rows, survival),
  };
}
export function buildWeaponReport(
  rows: any[],
  campaigns: any[],
  options: WeaponPlanOptions & { workers: number },
  meta: {
    commit: string;
    sourceHash: string;
    runId: number | null;
    elapsedSeconds: number;
    planned: number;
    error: string | null;
  },
): WeaponReport {
  const natural = rows.filter((r) => r.kind === 'natural' && r.policy === 'stock'),
    focused = rows.filter((r) => r.kind === 'natural' && r.policy === 'focused');
  const pairs = rows.filter((r) => r.job?.kind === 'pair' && r.job.index < options.seeds),
    replicated = rows.filter((r) => r.job?.kind === 'pair' && r.job.index >= options.seeds);
  const report: WeaponReport = {
    schemaVersion: 1,
    protocolVersion: WEAPON_BENCHMARK_PROTOCOL,
    state: meta.error ? 'failed' : 'complete',
    generatedAt: new Date().toISOString(),
    ...meta,
    planned: meta.planned,
    returned: rows.length + campaigns.length,
    counts: {
      natural: natural.length,
      pairs: pairs.length,
      focused: focused.length,
      replicated: replicated.length,
      campaigns: campaigns.length,
      actualSimulations:
        natural.length +
        focused.length +
        [...pairs, ...replicated].reduce((s, r) => s + r.actualSimulations, 0) +
        campaigns.reduce((s, r) => s + r.battles.length, 0),
    },
    options: {
      weapons: [...options.weapons],
      seeds: options.seeds,
      extended: options.extended,
      seedOffset: options.seedOffset,
      workers: options.workers,
    },
    weapons: [],
    campaigns: [],
  };
  // 执行失败只提供失败状态，不对未完成矩阵做“成功”汇总。
  if (!meta.error)
    for (const id of options.weapons) {
      const t = treasure(id),
        n = natural.filter((r) => r.weapon === id),
        p = pairs.filter((r) => r.job.weapon === id),
        f = focused.filter((r) => r.weapon === id);
      const groups = [];
      for (const stage of [0, 2, 5])
        for (const root of ['heaven', 'triple'])
          for (const device of ['phone', 'desktop'])
            groups.push({
              stage,
              root,
              device,
              stats: weaponBattleStats(
                n.filter((r) => r.stage === stage && r.root === root && r.device === device),
              ),
            });
      const pairGroups = [];
      for (const evolved of [false, true])
        for (const dimension of ['reference', 'team', 'device'])
          for (const value of [...new Set(p.map((r) => r.job[dimension]))].sort()) {
            const label =
              dimension === 'reference'
                ? treasure(value as any).name
                : dimension === 'team'
                  ? ['清群底盘', '点杀底盘', '支援底盘'][Number(value)]
                  : value === 'phone'
                    ? '手机'
                    : '电脑';
            pairGroups.push({
              evolved,
              dimension,
              label,
              stats: weaponPairStats(
                p.filter((r) => r.job.evolved === evolved && r.job[dimension] === value),
              ),
            });
          }
      report.weapons.push({
        id,
        name: t.name,
        school: t.school,
        natural: weaponBattleStats(n),
        stages: [0, 2, 5].map((stage) => ({
          stage,
          stats: weaponBattleStats(n.filter((r) => r.stage === stage)),
        })),
        groups,
        pairs: [false, true].map((evolved) => ({
          evolved,
          stats: weaponPairStats(p.filter((r) => r.job.evolved === evolved)),
        })),
        pairGroups,
        focused: f.length ? weaponBattleStats(f) : null,
        replicated: [false, true].map((evolved) => ({
          evolved,
          stats: weaponPairStats(
            replicated.filter((r) => r.job.weapon === id && r.job.evolved === evolved),
          ),
        })),
      });
    }
  for (const root of ['heaven', 'triple']) {
    const cases = campaigns.filter((r) => r.case.root === root);
    if (cases.length)
      report.campaigns.push({
        root,
        n: cases.length,
        clearedSix: cases.filter((r) => r.cleared >= 6).length,
      });
  }
  assert.ok(validWeaponReport(report), '生成的公开测评摘要校验失败');
  return report;
}
const fmt = (n: number | null) => (n === null ? '—' : n.toFixed(1));
const esc = (s: unknown) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
function csv(headers: string[], rows: unknown[][]) {
  return (
    '\uFEFF' +
    [headers, ...rows]
      .map((r) => r.map((x) => '"' + String(x ?? '').replaceAll('"', '""') + '"').join(','))
      .join('\n') +
    '\n'
  );
}
export function weaponReportMarkdown(r: WeaponReport) {
  const lines = [
    '# 每日法宝实战测评',
    '',
    `状态：${r.state === 'complete' ? '执行完整' : '执行失败'}。生成时间（北京）：${new Date(r.generatedAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })}。源提交：${r.commit}。`,
    `计划 ${r.planned}，返回 ${r.returned}；耗时 ${(r.elapsedSeconds / 60).toFixed(1)} 分钟，${r.options.workers} 个worker。完整单关 ${r.counts.natural}，配对 ${r.counts.pairs}，定向培养 ${r.counts.focused}，新种子复验 ${r.counts.replicated}，正式连战 ${r.counts.campaigns}。`,
    '',
    r.error
      ? `执行错误：${r.error}`
      : '没有执行完整性错误。法宝强弱差异仅供研究，未设擅自加减伤害的自动门槛。',
    '',
    '## 方法与限制',
    '',
    '完整战斗覆盖第一、三、六关，从0秒开始，按正式怪物基准境界统一入场；天灵根/三灵根、手机/电脑交叉，保留正式Game与AI、拾取、成长和选技，固定30Hz。零炼器、训练、广告和丹药。后关是标准化条件，不是连续六关新玩家胜率。',
    '第五关后段105秒：相同五件三重队伍，候选/参考为六重或仙器，各带本门五重配方和相同三种三重功法，总投入十四重功法。六重可在后续正常选技中觉醒；仙器起始不含觉醒瞬间爆发。三参考在三底盘间轮换。不同候选底盘可能不同，只比较同一对内差异。',
    '排除自身参考；未到王、到王未击杀和已击杀分开，未击杀同时保留剩余血量与观测下界。生存指标限105秒，通关吸收为成功状态至截止。承伤剔除致命溢出、回血记实际值、成长加血单列；支援净收益属于整套构筑，不能全归给本命。',
    '95%探索区间按元素/种子index整簇做4000次重抽，含该簇两种设备和各底盘；簇较少，不是总体真人胜率或多重校正后的改数值门槛。相同种子可复现，但后续暴击、波次和成长会随武器自然分化。没有真人问卷、真机手感或帧率测试。',
    r.options.seeds % 10 !== 0
      ? '自定义子样本：种子数不是10的倍数，五行与参考轮换不完全平衡；不能与标准整矩阵直接横比。'
      : '每灵根十种子为一轮平衡组合；表格均用本次实际分母。',
    r.options.seeds < 2
      ? '只有一个种子簇，不提供95%区间。'
      : '种子簇按固定顺序重抽，改变worker数量不会改变统计结果。',
    '',
    '参考：[Mega Crit GDC分享](https://www.gdcvault.com/play/1025731/-Slay-the-Spire-Metrics)、[Riot实战武器研究](https://playvalorant.com/en-us/news/dev/valorant-data-drop-phantom-vs-vandal/)、[玩家体验量表PXI](https://playerexperienceinventory.org/docs)。数据是证据，不能替代玩家反馈。',
    '',
    '## 完整单关',
    '',
    '| 法宝 | 路线 | 第一关 | 第三关 | 第六关 | 本命伤害占比 | 觉醒 |',
    '| --- | --- | --- | --- | --- | --- | --- |',
  ];
  for (const w of r.weapons)
    lines.push(
      `| ${w.name} | ${w.school === 'orthodox' ? '正道' : '魔道'} | ${w.stages.map((g) => `${g.stats.wins}/${g.stats.n}`).join(' | ')} | ${fmt(w.natural.ownShare)}% | ${w.natural.evolved}/${w.natural.n} |`,
    );
  lines.push(
    '',
    '## 同投入配对',
    '',
    '| 法宝 | 入场 | 有效对数 | 候选／参考击杀 | 击杀率差（百分点） | 探索区间 | 生存差秒 |',
    '| --- | --- | --- | --- | --- | --- | --- |',
  );
  for (const w of r.weapons)
    for (const p of w.pairs)
      lines.push(
        `| ${w.name} | ${p.evolved ? '仙器' : '六重'} | ${p.stats.n} | ${p.stats.candidate.wins}／${p.stats.reference.wins} | ${fmt(p.stats.winDifference)} | ${p.stats.winCI?.map(fmt).join('～') ?? '—'} | ${fmt(p.stats.survivalDifference)} |`,
      );
  if (r.options.extended) {
    lines.push(
      '',
      '## 定向培养与新种子复验',
      '',
      '定向培养只在实验脚本内优先本命/配方，不修改正式AI，也不代表真人最佳策略。',
    );
    for (const w of r.weapons) {
      if (w.focused)
        lines.push(
          `- ${w.name}：正式AI ${w.natural.wins}/${w.natural.n}，定向培养 ${w.focused.wins}/${w.focused.n}。`,
        );
      for (const p of w.replicated)
        if (p.stats.n)
          lines.push(
            `- ${w.name}·${p.evolved ? '仙器' : '六重'}新种子：候选 ${p.stats.candidate.wins}/${p.stats.n}，参考 ${p.stats.reference.wins}/${p.stats.n}，击杀率差 ${fmt(p.stats.winDifference)} 个百分点。`,
          );
    }
    lines.push(
      '',
      '## 正式前六关连续流程',
      '',
      '仅覆盖本次筛选中的正式五行初始本命，两种匹配灵根、两场地、两个新种子；一试即停，无广告/培养。与上面的独立五行标准化单关分开统计。',
    );
    for (const g of r.campaigns)
      lines.push(
        `- ${g.root === 'heaven' ? '天灵根' : '三灵根'}：${g.clearedSix}/${g.n} 完成前六关。`,
      );
    if (!r.campaigns.length) lines.push('本次筛选没有正式初始本命，未运行此项。');
  }
  return lines.join('\n') + '\n';
}
export function writeWeaponReport(directory: string, r: WeaponReport) {
  const md = weaponReportMarkdown(r);
  writeFileSync(join(directory, 'summary.json'), JSON.stringify(r));
  writeFileSync(join(directory, 'summary.md'), md);
  writeFileSync(
    join(directory, 'battles.csv'),
    csv(
      [
        '法宝',
        '灵根',
        '场地',
        '关卡',
        '样本',
        '通关',
        '落败',
        '超时',
        '边界暂停',
        '妖王已击杀',
        '妖王未解决',
        '未解决观测秒中位',
        '未解决剩余血量%中位',
      ],
      r.weapons.flatMap((w) =>
        w.groups.map((g) => [
          w.name,
          g.root === 'heaven' ? '天灵根' : '三灵根',
          g.device === 'phone' ? '手机' : '电脑',
          g.stage + 1,
          g.stats.n,
          g.stats.wins,
          g.stats.lost,
          g.stats.timeout,
          g.stats.censored,
          g.stats.bossKilled,
          g.stats.bossUnresolved,
          fmt(g.stats.observedSeconds),
          fmt(g.stats.remainingHp),
        ]),
      ),
    ),
  );
  writeFileSync(
    join(directory, 'pairs.csv'),
    csv(
      [
        '法宝',
        '入场状态',
        '分组维度',
        '组名',
        '有效对数',
        '自身校验',
        '候选击杀',
        '参考击杀',
        '击杀率差百分点',
        '探索区间下界',
        '探索区间上界',
        '生存差秒',
        '候选未解决王剩余血量%中位',
      ],
      r.weapons.flatMap((w) =>
        w.pairGroups.map((g) => [
          w.name,
          g.evolved ? '仙器' : '六重',
          ({ reference: '参考法宝', team: '底盘', device: '场地' } as Record<string, string>)[
            g.dimension
          ],
          g.label,
          g.stats.n,
          g.stats.selfChecks,
          g.stats.candidate.wins,
          g.stats.reference.wins,
          fmt(g.stats.winDifference),
          ...(g.stats.winCI?.map(fmt) ?? ['—', '—']),
          fmt(g.stats.survivalDifference),
          fmt(g.stats.candidate.remainingHp),
        ]),
      ),
    ),
  );
  // 独立公开报告，不是游戏验证入口；不用外部脚本、字体或生成截图。
  const parts: string[] = [],
    lines = md.split('\n');
  let disclosure = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('# ')) {
      parts.push(`<h1>${esc(line.slice(2))}</h1>`);
      continue;
    }
    if (line.startsWith('## ')) {
      if (disclosure) {
        parts.push('</details>');
        disclosure = false;
      }
      const title = line.slice(3);
      if (['方法与限制', '同投入配对', '定向培养与新种子复验'].includes(title)) {
        parts.push(`<details><summary>${esc(title)}</summary>`);
        disclosure = true;
      } else parts.push(`<h2>${esc(title)}</h2>`);
      continue;
    }
    if (line.startsWith('| ')) {
      const rows = [];
      while (i < lines.length && lines[i].startsWith('| ')) {
        if (!/^\|[\s|:-]+\|$/.test(lines[i]))
          rows.push(
            lines[i]
              .split('|')
              .slice(1, -1)
              .map((c) => c.trim()),
          );
        i++;
      }
      i--;
      parts.push(
        `<div class="table-wrap" tabindex="0" role="region" aria-label="测评明细，可横向滚动"><table>${rows.map((cells, k) => `<${k ? 'tbody' : 'thead'}><tr>${cells.map((c) => `<${k ? 'td' : 'th'}>${esc(c)}</${k ? 'td' : 'th'}>`).join('')}</tr></${k ? 'tbody' : 'thead'}>`).join('')}</table></div>`,
      );
      continue;
    }
    if (line)
      parts.push(
        `<p>${esc(line).replace(/\[([^\]]+)\]\((https:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1 ↗</a>')}</p>`,
      );
  }
  if (disclosure) parts.push('</details>');
  const body = parts.join('\n');
  writeFileSync(
    join(directory, 'index.html'),
    `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="../favicon.svg" type="image/svg+xml"><title>每日法宝实战测评</title><style>body{font:16px/1.8 system-ui,sans-serif;color:#22352f;background:#f7f8f3;margin:0}main{max-width:1200px;margin:auto;padding:24px;overflow-wrap:anywhere}h1{font-size:28px}a{color:#21664f}nav{display:flex;gap:18px;flex-wrap:wrap}details{margin:20px 0;background:#edf1e8;padding:14px}summary{cursor:pointer;font-weight:600}.table-wrap{overflow-x:auto;max-width:100%;background:white}table{border-collapse:collapse;width:100%;font-size:14px}td,th{padding:9px 12px;border-bottom:1px solid #dce3d8;white-space:nowrap;text-align:right}td:first-child,th:first-child{text-align:left}th{background:#e5ecdf}tr:nth-child(even){background:#f6f8f3}@media(max-width:600px){main{padding:16px}h1{font-size:24px}nav{gap:10px}td,th{padding:8px}}</style><main><nav><a href="../monitor/">返回监控</a><a href="summary.json">结构化JSON</a><a href="summary.md">完整Markdown</a><a href="battles.csv">关卡/灵根/场地CSV</a><a href="pairs.csv">配对分组CSV</a></nav>${body}</main></html>`,
  );
}
