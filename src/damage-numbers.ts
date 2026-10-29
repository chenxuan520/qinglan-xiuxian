export const DAMAGE_NUMBERS_KEY = 'qinglan-damage-numbers-v1';

export function readDamageNumbers(storage: () => Pick<Storage, 'getItem'> = () => localStorage) {
  try {
    return storage().getItem(DAMAGE_NUMBERS_KEY) !== '0';
  } catch {
    // 无法读取时沿用原有显示方式，仍允许游玩。
    return true;
  }
}

// 只保存本机显示偏好；不写入角色、战斗快照或随机状态。
export class DamageNumbersPreference {
  private value = true;
  private readonly storage: () => Pick<Storage, 'getItem' | 'setItem'>;
  private readonly apply: (enabled: boolean) => void;

  constructor(
    storage: () => Pick<Storage, 'getItem' | 'setItem'>,
    apply: (enabled: boolean) => void,
  ) {
    this.storage = storage;
    this.apply = apply;
    this.value = readDamageNumbers(storage);
    apply(this.value);
  }

  get enabled() {
    return this.value;
  }

  toggle() {
    const next = !this.value;
    try {
      this.storage().setItem(DAMAGE_NUMBERS_KEY, next ? '1' : '0');
    } catch {
      return false;
    }
    this.value = next;
    this.apply(next);
    return true;
  }
}

export function damageNumbersControl(enabled: boolean) {
  return `<div class="settings-section-heading damage-numbers-control"><h3>伤害数字</h3><button class="secondary-button" data-action="damage-numbers" aria-label="显示伤害数字" aria-pressed="${enabled}">${enabled ? '关闭' : '开启'}</button></div>`;
}
