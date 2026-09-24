const formatter = new Intl.NumberFormat('zh-CN', {
  notation: 'compact',
  maximumFractionDigits: 1,
  useGrouping: false,
});

export function formatNumber(value: number) {
  return formatter.format(value);
}
