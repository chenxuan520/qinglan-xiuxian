const formatter = new Intl.NumberFormat('zh-CN', {
  notation: 'compact',
  maximumFractionDigits: 1,
  useGrouping: false,
});

export function formatNumber(value: number) {
  return formatter.format(value);
}

export function removeNumberGrouping(text: string) {
  return text.replace(/(?<![\d.])(?<!\d,)\d{1,3}(?:,\d{3})+(?!\d|,\d)/g, (number) =>
    number.replaceAll(',', ''),
  );
}
