import {
  AUTOPLAY_REPORT_MODES,
  AUTOPLAY_REPORT_URL,
  autoplayInterval,
  validAutoplayReport,
  type AutoplayReport,
} from './autoplay-report.ts';
import { monitorDeadline } from './monitor-request.ts';
import {
  monitorEscape as esc,
  monitorCount as count,
  monitorTime as time,
  monitorTable as table,
} from './monitor-view.ts';

export function autoplayMonitorHTML(data: AutoplayReport, now = Date.now()) {
  const complete = data.state === 'complete';
  const percent = (n: number) => `${(n * 100).toFixed(1)}%`;
  return `<p><span class="badge ${complete ? 'good' : 'error'}">${complete ? '小测试执行完整' : '小测试执行失败'}</span>${data.runId ? ` <a href="https://github.com/chenxuan520/qinglan-xiuxian/actions/runs/${data.runId}" target="_blank" rel="noopener noreferrer">查看Actions ↗</a>` : ''}</p>
    <p>五种倾向各40次 · 已返回 ${count(data.returned)} / 200 条 · 用时 ${count(data.elapsedSeconds)} 秒</p>
    <p class="note">生成时间（北京）${esc(time(data.generatedAt))} · 源提交 ${esc(data.commit.slice(0, 12))}${data.dirty ? '（本地未提交版本）' : ''}</p>
    ${now - Date.parse(data.generatedAt) > 36 * 3600_000 ? '<p class="status warning">结果已超过36小时，请查看Actions运行状态。</p>' : ''}
    ${data.error ? `<p class="status error">${esc(data.error)}</p>` : ''}
    <p class="note">固定双灵根、兼修、手机场地、初入仙途，无辅助。同一批开局连续闯前六关，失败即停。指定目标：玄冰镜＋白骨髅。</p>
    ${
      complete
        ? table(
            ['培养倾向', '通过 / 样本', '前六关连通率', '95%区间', '比默认多过 / 少过'],
            data.rows.map((row, i) => [
              AUTOPLAY_REPORT_MODES[i].name,
              `${row.won} / ${row.samples}`,
              percent(row.won / row.samples),
              autoplayInterval(row.won, row.samples).map(percent).join('～'),
              `${row.improved} / ${row.regressed}`,
            ]),
          )
        : ''
    }
    <details><summary>测试口径与逐关通过数</summary><p class="note">十种入门本命各四个种子，五种倾向各40条，不增加840/10080矩阵维度；指定法宝只代表这组目标。配对只保证相同开局和种子，选技不同后随机进程可能分叉。每种40次仅观察倾向取舍，小幅差距需扩样确认；95%区间为Wilson区间，不代表真人胜率。低通过率本身不触发CI失败，技术异常、漏样本、重复或混合版本会失败。</p>${
      complete
        ? table(
            ['培养倾向', '第一关', '第二关', '第三关', '第四关', '第五关', '第六关'],
            data.rows.map((row, i) => [AUTOPLAY_REPORT_MODES[i].name, ...row.stageClears]),
          )
        : '<p>本次未完成，不展示部分数据作为完整对照。</p>'
    }</details>
    <p><a href="${AUTOPLAY_REPORT_URL}summary.json" target="_blank" rel="noopener noreferrer">小测试JSON接口 ↗</a> · <a href="${AUTOPLAY_REPORT_URL}summary.md" target="_blank" rel="noopener noreferrer">文字报告 ↗</a></p>`;
}
export function mountAutoplayMonitor(root: HTMLElement) {
  const section = document.createElement('section');
  section.setAttribute('aria-labelledby', 'autoplay-title');
  section.innerHTML =
    '<div class="section-heading"><h2 id="autoplay-title">自动历练培养倾向对照</h2><button id="autoplay-refresh">刷新倾向对照</button></div><p class="note">每天北京时间12:00开始，完成后更新；独立小测试，读取GitHub Pages最新已发布摘要。</p><div id="autoplay-content" aria-live="polite">正在读取倾向对照…</div>';
  root.querySelector('[aria-labelledby="ci-title"]')?.after(section);
  const host = section.querySelector<HTMLElement>('#autoplay-content')!;
  const button = section.querySelector<HTMLButtonElement>('button')!;
  let active: AbortController | undefined;
  async function load() {
    active?.abort();
    const controller = new AbortController(),
      deadline = monitorDeadline(controller, 20_000);
    active = controller;
    button.disabled = true;
    host.textContent = '正在读取倾向对照…';
    try {
      const response = await fetch(AUTOPLAY_REPORT_URL + 'summary.json', {
        signal: controller.signal,
        credentials: 'omit',
        cache: 'no-store',
      });
      if (!response.ok)
        throw new Error(
          response.status === 404 ? '尚未发布首份倾向对照' : `HTTP ${response.status}`,
        );
      const data: unknown = await response.json();
      if (!validAutoplayReport(data)) throw new Error('倾向对照格式或完整性不一致');
      if (!controller.signal.aborted) host.innerHTML = autoplayMonitorHTML(data);
    } catch (error) {
      if (active === controller && (!controller.signal.aborted || deadline.expired()))
        host.innerHTML = `<p class="status warning">倾向对照读取失败（${esc(deadline.expired() ? '请求超时' : error instanceof Error ? error.message : '网络错误')}），可刷新重试。其他监控仍可使用。</p>`;
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
