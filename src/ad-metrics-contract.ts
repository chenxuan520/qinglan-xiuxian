// 每次真实广告请求一张凭条；同一类别在一次打开中至多记一次，不记录玩家身份或存档。
export const AD_METRIC = { shown: 1, clicked: 2, watched: 4, claimed: 8 } as const;
export const adReceiptId = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);
export function validAdMetricFlags(value: unknown): value is number {
  return (
    Number.isInteger(value) &&
    Number(value) > 0 &&
    Number(value) <= 15 &&
    (!(Number(value) & 4) || !!(Number(value) & 1)) &&
    (!(Number(value) & 8) || (Number(value) & 5) === 5) &&
    (!(Number(value) & 2) || !!(Number(value) & 1))
  );
}
