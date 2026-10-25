import type { SaveData } from './progress.ts';
import { spiritPower } from './spirit-power.ts';
import { formatNumber } from './number-format.ts';

// 固定当前搭配、药效与年岁，只比较这一级根基，复用真实入场计算。
export function trainingStepPreview(save: SaveData, kind: keyof SaveData['training']) {
  const current = spiritPower(save);
  const next =
    save.training[kind] < 20
      ? spiritPower({
          ...save,
          training: { ...save.training, [kind]: save.training[kind] + 1 },
        })
      : null;
  const field = { vitality: 'hp', power: 'weaponDamage', speed: 'speed' } as const;
  return {
    label: {
      vitality: '入场气血',
      power: `${current.weapon}基础伤害`,
      speed: '入场移速',
    }[kind],
    unit: kind === 'speed' ? '地图像素/秒' : '',
    current: current[field[kind]],
    next: next?.[field[kind]] ?? null,
  };
}

export function trainingStepText(save: SaveData, kind: keyof SaveData['training']) {
  const preview = trainingStepPreview(save, kind);
  const current = formatNumber(preview.current);
  return preview.next === null
    ? `当前${preview.label} ${current}${preview.unit} · 已满阶`
    : `${preview.label} ${current} → ${formatNumber(preview.next)}${preview.unit}（+${formatNumber(preview.next - preview.current)}，较当前 +${Number(((preview.next / preview.current - 1) * 100).toFixed(2))}%）`;
}
