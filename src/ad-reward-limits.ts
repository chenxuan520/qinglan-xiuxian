import { adSupplies, FINAL_TRIAL_STAGE } from './data.ts';
import { MAX_LIFESPAN_ADS, SUPPLIES_COOLDOWN_YEARS } from './ad-rules.ts';
import { isExtremeLife } from './life-mode.ts';
import { lifespanInfo, realmInfo, type SaveData } from './progress.ts';

const YEAR_EPSILON = 1e-9;

export function suppliesCooldown(save: SaveData) {
  const realm = realmInfo(save.cultivation, save.completed.includes(FINAL_TRIAL_STAGE));
  const years = SUPPLIES_COOLDOWN_YEARS[realm.index];
  const remaining = Math.max(0, save.suppliesReadyAt - save.age);
  const cooling = remaining > YEAR_EPSILON;
  return {
    years,
    remaining,
    available: !isExtremeLife(save) && !cooling,
    hint: cooling
      ? remaining < 1 - YEAR_EPSILON
        ? '尚需不足一年'
        : `再过 ${Math.ceil(remaining - YEAR_EPSILON)} 年可领取`
      : '',
  };
}

// 仅对待保存的克隆调用；调用方写入成功后才能应用和上报领取。
export function claimSuppliesReward(save: SaveData) {
  const cooldown = suppliesCooldown(save);
  if (!cooldown.available) return null;
  const reward = adSupplies(save.unlocked);
  save.stones += reward.stones;
  save.iron += reward.iron;
  save.adUsage.supplies++;
  save.suppliesReadyAt = save.age + cooldown.years;
  return reward;
}

export function lifespanAdsRemaining(save: SaveData) {
  return Math.max(0, MAX_LIFESPAN_ADS - save.adUsage.lifespan);
}

export function canClaimLifespanAd(save: SaveData) {
  return (
    !isExtremeLife(save) &&
    lifespanAdsRemaining(save) > 0 &&
    Number.isFinite(lifespanInfo(save).base)
  );
}
