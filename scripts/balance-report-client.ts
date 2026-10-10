import type { Chart, ChartConfiguration } from 'chart.js';
import type { BalanceCase } from './balance-policy.ts';
import type { CampaignSample } from './balance-simulation.ts';
import { reportTables, reportChartData } from './balance-report-view.ts';
import type {
  ReportLabels,
  ReportChartMetric,
  ReportChartDimension,
} from './balance-report-view.ts';

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
  const generate = document.getElementById('generate-chart') as HTMLButtonElement;
  const stale = document.getElementById('chart-stale')!;
  const groupInputs = [...document.querySelectorAll<HTMLInputElement>('#chart-grouping input')];
  const legend = document.getElementById('chart-legend')!;
  const previous = document.getElementById('chart-previous') as HTMLButtonElement;
  const next = document.getElementById('chart-next') as HTMLButtonElement;
  const pageSize = 8;
  const grouping = () =>
    groupInputs
      .filter((input) => input.checked)
      .map((input) => input.value as ReportChartDimension);
  const groupingText = () =>
    groupInputs
      .filter((input) => input.checked)
      .map((input) => input.parentElement!.textContent!.trim())
      .join('＋') || '不分组（当前筛选合计）';
  const bodies = ['roots', 'stages', 'groups'].map((id) => document.getElementById(`${id}-body`)!);
  const original = bodies.map((b) => b.innerHTML);
  const observed = new Set(observedKeys);
  let data: Promise<CampaignSample[]> | undefined,
    revision = 0,
    filterRevision = 0,
    chart: Chart | undefined,
    dirty = false,
    groupPage = 0,
    groupTotal = 0,
    exporting = false;
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
    dirty = false;
    stale.hidden = true;
    document.getElementById('chart-wrap')!.hidden = true;
    save.disabled = true;
    legend.replaceChildren();
    document.getElementById('chart-pagination')!.hidden = true;
  };
  const markChartStale = () => {
    dirty = !!chart;
    stale.hidden = !dirty;
    save.disabled = true;
    previous.disabled = true;
    next.disabled = true;
    select('chart-page').disabled = true;
    legend.querySelectorAll('button').forEach((button) => (button.disabled = true));
    chartStatus.textContent = dirty
      ? '图表已过期，请点击「生成图表」应用当前筛选条件及汇总规则。'
      : '选择筛选条件及汇总维度后，点击「生成图表」；更改条件不会自动重画。';
  };
  const groupRange = () =>
    groupTotal > pageSize
      ? `第 ${groupPage * pageSize + 1}–${Math.min((groupPage + 1) * pageSize, groupTotal)} 组 / 共 ${groupTotal} 组`
      : `共 ${groupTotal} 组`;
  const title = () =>
    `${selectedText} · 返回 ${selectedRows.length}/${selectedPlan.length}\n汇总：${groupingText()}`;
  const titleLines = (width = innerWidth < 480 ? 22 : 65) => [
    ...(title().match(new RegExp(`.{1,${width}}(?![0-9/])`, 'gu')) ?? []),
    ...groupRange().split(' / '),
  ];
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
    const data = reportChartData(selectedRows, selectedPlan, metric, labels, grouping());
    groupTotal = data.datasets.length;
    groupPage = Math.min(groupPage, Math.max(0, Math.ceil(groupTotal / pageSize) - 1));
    data.datasets = data.datasets.slice(groupPage * pageSize, (groupPage + 1) * pageSize);
    document.getElementById('chart-pagination')!.hidden = groupTotal <= pageSize;
    document.getElementById('chart-page-status')!.textContent = groupRange();
    previous.disabled = groupPage === 0;
    next.disabled = (groupPage + 1) * pageSize >= groupTotal;
    const pageCount = Math.ceil(groupTotal / pageSize);
    const pages = Array.from({ length: pageCount }, (_, index) => {
      const option = document.createElement('option');
      option.value = String(index);
      option.textContent = `${index + 1} / ${pageCount}`;
      return option;
    });
    select('chart-page').replaceChildren(...pages);
    select('chart-page').value = String(groupPage);
    select('chart-page').disabled = false;
    document.getElementById('chart-wrap')!.hidden = false;
    document.getElementById('chart-wrap')!.style.height = metric === 'boss' ? '640px' : '420px';
    const config: ChartConfiguration = {
      type: metric === 'time' ? 'line' : 'bar',
      data,
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        indexAxis: metric === 'boss' ? 'y' : 'x',
        plugins: {
          title: { display: true, text: [names[metric], ...titleLines()] },
          legend: { display: false, position: 'bottom' },
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
      const captured = chart;
      data.datasets.forEach((dataset, index) => {
        const button = document.createElement('button'),
          swatch = document.createElement('span'),
          text = document.createElement('span');
        button.type = 'button';
        button.className = 'chart-legend-item';
        button.disabled = exporting;
        button.setAttribute('aria-pressed', 'true');
        swatch.className = 'chart-swatch';
        swatch.style.backgroundColor = dataset.borderColor;
        swatch.setAttribute('aria-hidden', 'true');
        text.className = 'chart-legend-label';
        text.textContent = dataset.label;
        button.append(swatch, text);
        button.addEventListener('click', () => {
          if (exporting || dirty || captured !== chart) return;
          const visible = !captured.isDatasetVisible(index);
          captured.setDatasetVisibility(index, visible);
          captured.update('none');
          button.setAttribute('aria-pressed', String(visible));
        });
        legend.append(button);
      });
      chartStatus.textContent = `${names[metric]}；按${groupingText()}汇总当前筛选，${groupRange()}。耗时只计算胜局，妖王只计算已击杀，空观测留空。${!select('profile').value || !select('difficulty').value ? '当前合并了多种投入或难度，不用于无辅助门禁判断。' : ''}`;
      save.disabled = exporting;
    } catch {
      hideChart();
      chartStatus.textContent = '图表生成失败，请重试。';
    }
  }
  async function apply(render = false) {
    const token = ++filterRevision,
      chartToken = ++revision,
      filters = selection();
    generate.disabled = render;
    ready = false;
    groupPage = 0;
    markChartStale();
    selectedPlan = plan.filter((c) => matches(c, filters));
    selectedText =
      ids
        .filter((id) => filters[id])
        .map((id) => select(id).selectedOptions[0].textContent)
        .join(' / ') || '全部条件';
    const extra = !!(filters.path || filters.starter || filters.device);
    status.textContent = `筛选计划 ${selectedPlan.length} 条${extra ? '，正在重新统计…' : ''}`;
    if (render) chartStatus.textContent = '正在生成当前筛选图表…';
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
      if (render) {
        hideChart();
        chartStatus.textContent = '当前筛选没有测试样本，无法生成图表。';
      }
      generate.disabled = false;
      return;
    }
    if (!extra && !render) return;
    try {
      const rows = await load();
      if (token !== filterRevision) return;
      selectedRows = rows.filter((r) => matches(r.case, filters));
      if (extra) {
        const tables = reportTables(selectedRows, selectedPlan, labels, true);
        bodies.forEach((body, i) => {
          body.innerHTML = tables[(['roots', 'stages', 'groups'] as const)[i]];
        });
      }
      ready = true;
      status.textContent = `返回 ${selectedRows.length}/${selectedPlan.length} 条；路线、本命或场地子组为独立统计，不套用整体门禁区间。`;
      if (render && chartToken === revision) draw();
    } catch (error) {
      if (token !== filterRevision) return;
      status.textContent = errorMessage(error, '统计数据无法读取，请重试或查看原始数据。');
      chartStatus.textContent = '统计数据未就绪，无法生成或保存图表。';
    } finally {
      if (chartToken === revision) generate.disabled = false;
    }
  }
  ids.forEach((id) => select(id).addEventListener('change', () => void apply()));
  document.getElementById('reset-filters')!.addEventListener('click', () => {
    ids.forEach((id) => (select(id).value = ''));
    void apply();
  });
  document.getElementById('generate-chart')!.addEventListener('click', () => {
    void apply(true);
  });
  const changeChartRule = () => {
    revision++;
    generate.disabled = false;
    markChartStale();
  };
  select('chart-metric').addEventListener('change', changeChartRule);
  groupInputs.forEach((input) => input.addEventListener('change', changeChartRule));
  [previous, next].forEach((button, index) =>
    button.addEventListener('click', () => {
      if (!ready || dirty || exporting || button.disabled) return;
      revision++;
      groupPage += index === 0 ? -1 : 1;
      draw();
    }),
  );
  select('chart-page').addEventListener('change', () => {
    const page = Number(select('chart-page').value);
    if (
      !ready ||
      dirty ||
      exporting ||
      !Number.isInteger(page) ||
      page < 0 ||
      page * pageSize >= groupTotal
    )
      return;
    revision++;
    groupPage = page;
    draw();
  });
  save.addEventListener('click', async () => {
    if (!chart || !ready || dirty || exporting) return;
    exporting = true;
    save.disabled = true;
    legend.querySelectorAll('button').forEach((button) => (button.disabled = true));
    const captured = chart,
      token = revision,
      metric = select('chart-metric').value;
    const originalTitle = captured.options.plugins!.title!.text;
    const originalRatio = captured.options.devicePixelRatio;
    const originalLegend = captured.options.plugins!.legend!.display;
    try {
      captured.options.responsive = false;
      captured.options.devicePixelRatio = 1;
      captured.options.plugins!.legend!.display = true;
      captured.options.plugins!.title!.text = [
        (
          {
            clear: '逐关累计通关率（%）',
            time: '逐关胜局耗时中位（秒）',
            boss: '妖王击杀存活中位（秒）',
          } as Record<string, string>
        )[metric],
        ...titleLines(65),
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
      anchor.download = `qinglan-balance-${metric}-${ids.map((id) => select(id).value || 'all').join('-')}-group-${grouping().join('-') || 'total'}-page-${groupPage + 1}.png`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      chartStatus.textContent = '已生成 PNG 并请求浏览器保存；也可查看当前图表。';
    } catch (error) {
      if (token === revision)
        chartStatus.textContent = errorMessage(error, '图片保存失败，请重试。');
    } finally {
      exporting = false;
      legend.querySelectorAll('button').forEach((button) => (button.disabled = dirty));
      save.disabled = !chart || !ready || dirty;
      if (captured === chart) {
        captured.options.plugins!.title!.text = originalTitle;
        captured.options.devicePixelRatio = originalRatio;
        captured.options.plugins!.legend!.display = originalLegend;
        captured.options.responsive = true;
        captured.resize();
        captured.update('none');
        save.disabled = !ready || dirty;
      }
    }
  });
  void apply();
}
