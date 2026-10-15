// 前五阶价格、前十阶收益保持；后期用缓升价格和温和的边际回报承接养成。
export const trainingCost = (level: number) =>
  level < 5 ? Math.round(45 * 1.42 ** level) : 183 + 70 * (level - 4) + 5 * (level - 4) ** 2;

export const trainingEffect = (level: number) =>
  level + 0.05 * Math.max(0, level - 10) + 0.05 * Math.max(0, level - 15);
