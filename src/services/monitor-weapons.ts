import {
  rankWeapons,
  validWeaponReport,
  weaponTotal,
  WEAPON_BENCHMARK_STAGES,
  WEAPON_REPORT_URL,
  type WeaponBattleStats,
  type WeaponReport,
} from './weapon-report.ts';
import { monitorDeadline } from './monitor-request.ts';
import {
  monitorEscape as esc,
  monitorCount as count,
  monitorTime as time,
} from './monitor-view.ts';

const weaponCell = (stats: WeaponBattleStats | undefined) => {
  if (!stats || !stats.n) return '—';
  const time = stats.bossSeconds === null ? '—' : `${Math.round(stats.bossSeconds)}秒`;
  return `${stats.wins}/${stats.n}<br><small>${time}</small>`;
};
const tierNames = ['一档', '二档', '三档', '四档'] as const;
const stageLabels = ['第一关', '第二关', '第三关', '第四关', '第五关', '第六关', '终关'];
function weaponTable(rows: string[][]) {
  const headers = [
    '法宝',
    '路线',
    ...stageLabels,
    '前六关胜率',
    '配对净差',
    '相对用时',
    '本命伤害占比',
    '觉醒',
  ];
  const cell = (value: string) =>
    esc(value)
      .replace(/&lt;br&gt;/g, '<br>')
      .replace(/&lt;small&gt;(.*?)&lt;\/small&gt;/g, '<small>$1</small>');
  return `<div class="table-wrap" tabindex="0" role="region" aria-label="法宝档位统计表，可横向滚动"><table class="weapon-detail"><thead><tr>${headers.map((h) => `<th scope="col">${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((value) => `<td>${cell(value)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
export function weaponMonitorHTML(data: WeaponReport, now = Date.now()) {
  const stale = now - Date.parse(data.generatedAt) > 36 * 3600_000;
  const complete = data.state === 'complete';
  const run = data.runId
    ? ` <a href="https://github.com/chenxuan520/qinglan-xiuxian/actions/runs/${data.runId}" target="_blank" rel="noopener noreferrer">查看Actions ↗</a>`
    : '';
  const scope = `${data.options.weapons.length}件法宝 · 每条件${data.options.seeds}个种子 · ${data.options.extended ? '包含培养/新种子/连续流程' : '主矩阵'}`;
  const legacy = data.weapons.some((w) => w.stages.length < WEAPON_BENCHMARK_STAGES.length);
  const ranked = rankWeapons(data.weapons);
  const tiers = ([1, 2, 3, 4] as const)
    .map((tier) => {
      const group = ranked.filter((row) => row.tier === tier);
      if (!group.length) return '';
      const rows = group.map(({ wins, n, weapon: w, pairNet, relativeKillTime }) => [
        w.name,
        w.school === 'orthodox' ? '正道' : '魔道',
        ...WEAPON_BENCHMARK_STAGES.map((stage) =>
          weaponCell(w.stages.find((g) => g.stage === stage)?.stats),
        ),
        weaponTotal(wins, n),
        pairNet === null ? '—' : pairNet.toFixed(1),
        relativeKillTime === null ? '—' : `${relativeKillTime.toFixed(2)}×`,
        `${(w.natural.ownShare ?? 0).toFixed(1)}%`,
        `${w.natural.evolved}/${w.natural.n}`,
      ]);
      return `<h4>${tierNames[tier - 1]}</h4>${weaponTable(rows)}`;
    })
    .join('');
  return `<p><span class="badge ${complete ? 'good' : 'error'}">${complete ? '测评执行完整' : '测评执行失败'}</span>${run}</p><p>${esc(scope)} · 已返回 ${count(data.returned)} / ${count(data.planned)} 个计划样本 · 用时 ${count(data.elapsedSeconds / 60)} 分钟</p><p class="note">生成时间（北京）${esc(time(data.generatedAt))} · 源提交 ${esc(data.commit.slice(0, 12))}</p>${stale ? '<p class="status warning">结果已超过36小时，请查看Actions运行状态。</p>' : ''}${data.error ? `<p class="status error">${esc(data.error)}</p>` : ''}<p class="note">按前六关胜率分档（一档 ≥75%、二档 65–75%、三档 55–65%、四档 &lt;55%）；档内按胜率，再按相对用时（各关击杀用时除以全体法宝该关中位数后取平均，越小越快）。终关为统一境界零资源入场，几乎无法通关，仅列出供参考，不计入分档。每格约 120 场，相差 5 个百分点以内多为样本波动；配对净差受 105 秒窗口影响，部分为 0，仅供参考。不是线上玩家或连续七关的胜率；执行完整也不等于所有法宝强度一致。</p>${
    legacy
      ? '<p class="status warning">旧版报告：仅含第一、三、六关与两种灵根，档位按已有关卡计算。</p>'
      : ''
  }${
    complete
      ? `<details><summary>法宝明细（${data.weapons.length}件），按档位分组，点击展开</summary>${tiers}</details>`
      : ''
  }<p><a href="${WEAPON_REPORT_URL}" target="_blank" rel="noopener noreferrer">完整测评、配对区间与分组CSV ↗</a> · <a href="${WEAPON_REPORT_URL}summary.json" target="_blank" rel="noopener noreferrer">测评JSON接口 ↗</a></p>`;
}
export function mountWeaponMonitor(root: HTMLElement) {
  const section = document.createElement('section');
  section.setAttribute('aria-labelledby', 'weapons-title');
  section.innerHTML =
    '<div class="section-heading"><h2 id="weapons-title">每日法宝实战测评</h2><button id="weapons-refresh">刷新法宝测评</button></div><p class="note">每天北京时间12:00开始，完成后更新；独立于线上游玩筛选，读取GitHub Pages最新已发布报告。</p><div id="weapons-content" aria-live="polite">正在读取法宝测评…</div>';
  root.querySelector('[aria-labelledby="live-title"]')?.before(section);
  const host = section.querySelector<HTMLElement>('#weapons-content')!,
    button = section.querySelector<HTMLButtonElement>('button')!;
  let active: AbortController | undefined;
  async function load() {
    active?.abort();
    const controller = new AbortController(),
      deadline = monitorDeadline(controller, 20_000);
    active = controller;
    button.disabled = true;
    host.textContent = '正在读取法宝测评…';
    try {
      const response = await fetch(WEAPON_REPORT_URL + 'summary.json', {
        signal: controller.signal,
        credentials: 'omit',
        cache: 'no-store',
      });
      if (!response.ok)
        throw new Error(
          response.status === 404 ? '尚未发布首份法宝日报' : `HTTP ${response.status}`,
        );
      const data: unknown = await response.json();
      if (!validWeaponReport(data)) throw new Error('测评摘要格式或完整性不一致');
      if (controller.signal.aborted) return;
      host.innerHTML = weaponMonitorHTML(data);
    } catch (error) {
      if (active === controller && (!controller.signal.aborted || deadline.expired()))
        host.innerHTML = `<p class="status warning">法宝测评读取失败（${esc(deadline.expired() ? '请求超时' : error instanceof Error ? error.message : '网络错误')}），可刷新重试。其他监控仍可使用。</p>`;
    } finally {
      deadline.clear();
      if (active === controller) button.disabled = false;
    }
  }
  button.addEventListener('click', () => void load());
  window.addEventListener('pagehide', () => active?.abort());
  window.addEventListener('pageshow', (e) => {
    if (e.persisted) void load();
  });
  void load();
}
