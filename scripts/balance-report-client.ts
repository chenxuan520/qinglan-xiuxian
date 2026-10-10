import type { Chart, ChartConfiguration } from 'chart.js';
import type { BalanceCase } from './balance-policy.ts';
import type { CampaignSample } from './balance-simulation.ts';
import { reportTables, reportChartData } from './balance-report-view.ts';
import type { ReportLabels, ReportChartMetric } from './balance-report-view.ts';

export function installReportFilters(
  plan: BalanceCase[],
  labels: ReportLabels,
  metadata: { commit?: string; generatedAt?: string },
  observedKeys: string[],
) {
  const errorMessage = (error: unknown, fallback: string) =>
    error instanceof Error &&
    [
      '原始数据加载失败，请重试。',
      '报告正在更新，版本不一致，请刷新页面。',
      '本次没有可读取的逐局数据。',
      '图片生成失败，请重试。',
    ].includes(error.message)
      ? error.message
      : fallback;
  const ids = ['root', 'path', 'starter', 'device', 'profile', 'difficulty'] as const;
  const select = (id: string) => document.getElementById(id) as HTMLSelectElement;
  const status = document.getElementById('filter-status')!;
  const chartStatus = document.getElementById('chart-status')!;
  const save = document.getElementById('save-chart') as HTMLButtonElement;
  const bodies = ['roots', 'stages', 'groups'].map((id) => document.getElementById(`${id}-body`)!);
  const original = bodies.map((b) => b.innerHTML);
  const observed = new Set(observedKeys);
  let data: Promise<CampaignSample[]> | undefined,
    revision = 0,
    chart: Chart | undefined,
    requested = false;
  let selectedPlan = plan,
    selectedRows: CampaignSample[] = [],
    selectedText = '全部条件';
  let ready = false;
  const selection = () => Object.fromEntries(ids.map((id) => [id, select(id).value]));
  const matches = (c: BalanceCase, filters: Record<string, string>) =>
    ids.every((id) => !filters[id] || String(c[id]) === filters[id]);
  const load = () =>
    (data ??= fetch('results.json')
      .then(async (response) => {
        if (!response.ok) throw new Error('原始数据加载失败，请重试。');
        const report = await response.json();
        if (report.commit !== metadata.commit || report.generatedAt !== metadata.generatedAt)
          throw new Error('报告正在更新，版本不一致，请刷新页面。');
        if (!Array.isArray(report.current)) throw new Error('本次没有可读取的逐局数据。');
        return report.current as CampaignSample[];
      })
      .catch((error) => {
        data = undefined;
        throw error;
      }));
  const hideChart = () => {
    chart?.destroy();
    chart = undefined;
    document.getElementById('chart-wrap')!.hidden = true;
    save.disabled = true;
  };
  const title = () => `${selectedText} · 返回 ${selectedRows.length}/${selectedPlan.length}`;
  const titleLines = () =>
    title().match(new RegExp(`.{1,${innerWidth < 480 ? 22 : 65}}`, 'gu')) ?? [];
  function draw() {
    hideChart();
    if (!ready || !selectedPlan.length) {
      chartStatus.textContent = '当前筛选没有测试样本，无法生成图表。';
      return;
    }
    const ChartClass = (window as unknown as { Chart?: typeof Chart }).Chart;
    if (!ChartClass) {
      chartStatus.textContent = '图表组件加载失败，请刷新后重试。';
      return;
    }
    const metric = select('chart-metric').value as ReportChartMetric;
    const names = {
      clear: '逐关累计通关率（计划分母）',
      time: '逐关胜局耗时中位数',
      boss: '妖王击杀存活中位数',
    };
    document.getElementById('chart-wrap')!.hidden = false;
    document.getElementById('chart-wrap')!.style.height = metric === 'boss' ? '640px' : '420px';
    const config: ChartConfiguration = {
      type: metric === 'time' ? 'line' : 'bar',
      data: reportChartData(selectedRows, selectedPlan, metric, labels),
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        indexAxis: metric === 'boss' ? 'y' : 'x',
        plugins: {
          title: { display: true, text: [names[metric], ...titleLines()] },
          legend: { position: 'bottom' },
        },
        scales:
          metric === 'boss'
            ? { x: { beginAtZero: true, title: { display: true, text: '秒' } } }
            : {
                y: {
                  beginAtZero: true,
                  ...(metric === 'clear' ? { max: 100 } : {}),
                  title: { display: true, text: metric === 'clear' ? '%' : '秒' },
                },
              },
      },
      plugins: [
        {
          id: 'white-background',
          beforeDraw(c) {
            const ctx = c.ctx;
            ctx.save();
            ctx.globalCompositeOperation = 'destination-over';
            ctx.fillStyle = '#fff';
            ctx.fillRect(0, 0, c.width, c.height);
            ctx.restore();
          },
        },
      ],
    };
    try {
      chart = new ChartClass(document.getElementById('report-chart') as HTMLCanvasElement, config);
      chartStatus.textContent = `${names[metric]}；按灵根汇总当前筛选。耗时只计算胜局，妖王只计算已击杀，空观测留空。${!select('profile').value || !select('difficulty').value ? '当前合并了多种投入或难度，不用于无辅助门禁判断。' : ''}`;
      save.disabled = false;
    } catch {
      hideChart();
      chartStatus.textContent = '图表生成失败，请重试。';
    }
  }
  async function apply() {
    const token = ++revision,
      filters = selection();
    ready = false;
    hideChart();
    selectedPlan = plan.filter((c) => matches(c, filters));
    selectedText =
      ids
        .filter((id) => filters[id])
        .map((id) => select(id).selectedOptions[0].textContent)
        .join(' / ') || '全部条件';
    const extra = !!(filters.path || filters.starter || filters.device);
    status.textContent = `筛选计划 ${selectedPlan.length} 条${extra ? '，正在重新统计…' : ''}`;
    if (requested) chartStatus.textContent = '正在更新当前筛选图表…';
    if (!extra) {
      bodies.forEach((body, i) => {
        body.innerHTML = original[i];
      });
      bodies.forEach((body) =>
        body.querySelectorAll<HTMLTableRowElement>('tr').forEach((row) => {
          row.hidden = ['root', 'profile', 'difficulty'].some(
            (id) => filters[id] && row.dataset[id] !== filters[id],
          );
        }),
      );
      status.textContent = `返回 ${selectedPlan.filter((c) => observed.has([c.root, c.path, c.starter, c.device, c.profile, c.difficulty, c.seed].join('/'))).length}/${selectedPlan.length} 条；当前统计保留计划分母。`;
    } else
      bodies.forEach((body) => {
        body.innerHTML = '';
      });
    if (!selectedPlan.length) {
      status.textContent = '该组合没有测试计划样本，请调整筛选。';
      if (requested) draw();
      return;
    }
    if (!extra && !requested) return;
    try {
      const rows = await load();
      if (token !== revision) return;
      selectedRows = rows.filter((r) => matches(r.case, filters));
      if (extra) {
        const tables = reportTables(selectedRows, selectedPlan, labels, true);
        bodies.forEach((body, i) => {
          body.innerHTML = tables[(['roots', 'stages', 'groups'] as const)[i]];
        });
      }
      ready = true;
      status.textContent = `返回 ${selectedRows.length}/${selectedPlan.length} 条；路线、本命或场地子组为独立统计，不套用整体门禁区间。`;
      if (requested) draw();
    } catch (error) {
      if (token !== revision) return;
      status.textContent = errorMessage(error, '统计数据无法读取，请重试或查看原始数据。');
      chartStatus.textContent = '统计数据未就绪，无法生成或保存图表。';
    }
  }
  ids.forEach((id) => select(id).addEventListener('change', () => void apply()));
  document.getElementById('reset-filters')!.addEventListener('click', () => {
    ids.forEach((id) => (select(id).value = ''));
    void apply();
  });
  document.getElementById('generate-chart')!.addEventListener('click', () => {
    requested = true;
    void apply();
  });
  select('chart-metric').addEventListener('change', () => {
    if (requested) void apply();
  });
  save.addEventListener('click', async () => {
    if (!chart || !ready) return;
    save.disabled = true;
    const captured = chart,
      token = revision,
      metric = select('chart-metric').value;
    const originalTitle = captured.options.plugins!.title!.text;
    const originalRatio = captured.options.devicePixelRatio;
    try {
      captured.options.responsive = false;
      captured.options.devicePixelRatio = 1;
      captured.options.plugins!.title!.text = [
        (
          {
            clear: '逐关累计通关率（%）',
            time: '逐关胜局耗时中位（秒）',
            boss: '妖王击杀存活中位（秒）',
          } as Record<string, string>
        )[metric],
        title(),
        `测试 ${metadata.commit ?? '未知'} · ${metadata.generatedAt ?? '未知'}`,
      ];
      captured.resize(1200, metric === 'boss' ? 900 : 720);
      captured.update('none');
      const blob = await new Promise<Blob | null>((resolve) =>
        captured.canvas.toBlob(resolve, 'image/png'),
      );
      if (!blob) throw new Error('图片生成失败，请重试。');
      if (token !== revision || captured !== chart) return;
      const url = URL.createObjectURL(blob),
        anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `qinglan-balance-${metric}-${ids.map((id) => select(id).value || 'all').join('-')}.png`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      chartStatus.textContent = '已生成 PNG 并请求浏览器保存；也可查看当前图表。';
    } catch (error) {
      if (token === revision)
        chartStatus.textContent = errorMessage(error, '图片保存失败，请重试。');
    } finally {
      if (captured === chart && token === revision) {
        captured.options.plugins!.title!.text = originalTitle;
        captured.options.devicePixelRatio = originalRatio;
        captured.options.responsive = true;
        captured.resize();
        captured.update('none');
        save.disabled = false;
      }
    }
  });
  void apply();
}
