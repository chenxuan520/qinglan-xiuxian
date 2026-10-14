import { WEAPON_REPORT_URL, validWeaponReport, type WeaponReport } from './weapon-report.ts';
import { monitorDeadline } from './monitor-request.ts';
import {
  monitorEscape as esc,
  monitorCount as count,
  monitorTime as time,
  monitorTable as table,
} from './monitor-view.ts';

export function weaponMonitorHTML(data: WeaponReport, now = Date.now()) {
  const stale = now - Date.parse(data.generatedAt) > 36 * 3600_000;
  const complete = data.state === 'complete';
  const run = data.runId
    ? ` <a href="https://github.com/chenxuan520/qinglan-xiuxian/actions/runs/${data.runId}" target="_blank" rel="noopener noreferrer">查看Actions ↗</a>`
    : '';
  const scope = `${data.options.weapons.length}件法宝 · 每条件${data.options.seeds}个种子 · ${data.options.extended ? '包含培养/新种子/连续流程' : '主矩阵'}`;
  return `<p><span class="badge ${complete ? 'good' : 'error'}">${complete ? '测评执行完整' : '测评执行失败'}</span>${run}</p><p>${esc(scope)} · 已返回 ${count(data.returned)} / ${count(data.planned)} 个计划样本 · 用时 ${count(data.elapsedSeconds / 60)} 分钟</p><p class="note">生成时间（北京）${esc(time(data.generatedAt))} · 源提交 ${esc(data.commit.slice(0, 12))}</p>${stale ? '<p class="status warning">结果已超过36小时，请查看Actions运行状态。</p>' : ''}${data.error ? `<p class="status error">${esc(data.error)}</p>` : ''}<p class="note">第一、三、六关为标准化单关，后段配对比较整套本命与功法的同投入收益。不是线上玩家或连续六关的胜率；执行完整也不等于所有法宝强度一致。</p>${
    complete
      ? `<details><summary>法宝明细（${data.weapons.length}件），点击展开</summary>${table(
          ['法宝', '第一关', '第三关', '第六关', '正式AI觉醒', '定向培养通过'],
          data.weapons.map((w) => [
            w.name,
            ...w.stages.map((g) => `${g.stats.wins}/${g.stats.n}`),
            `${w.natural.evolved}/${w.natural.n}`,
            w.focused ? `${w.focused.wins}/${w.focused.n}` : '未运行',
          ]),
        )}</details>`
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
