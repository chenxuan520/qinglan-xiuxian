import { curioTrainingCost, type CurioState } from './curio-data.ts';

// 前五阶基础价格、前十阶收益保持；天机屋只在实际持有时折减费用。
export const trainingCost = (level: number, save?: { curios: CurioState }) =>
  curioTrainingCost(
    save,
    level < 5 ? Math.round(45 * 1.42 ** level) : 183 + 70 * (level - 4) + 5 * (level - 4) ** 2,
  );

export const trainingEffect = (level: number) =>
  level + 0.05 * Math.max(0, level - 10) + 0.05 * Math.max(0, level - 15);

// 悟道后十阶逐步增加边际回报；淬体、身法仍使用原曲线。
export const powerTrainingEffect = (level: number) => level + 0.1 * Math.max(0, level - 10) ** 2;
