import { Game } from './game.ts';
import { treasure, weaponRootBonus } from './data.ts';
import { forgeDamageBonus, type SaveData } from './progress.ts';

export function spiritPower(save: SaveData) {
  // 沿用真实一级入场属性；浅拷贝隔离构造时的天劫时钟同步，不开战、不推进时间。
  const preview = new Game({ ...save }, 0, 0, () => 0.5);
  const stats = preview.stats;
  const weapon = treasure(preview.weapons[0].id);
  const offense =
    ((stats.damage * (1 + stats.crit * (stats.criticalDamage - 1))) / stats.cooldown) *
    (1 + forgeDamageBonus(save.forge[weapon.id] || 0)) *
    (1 + weaponRootBonus(preview.spiritRoot, preview.rootElements, weapon)) *
    Math.sqrt(stats.area * stats.duration);
  const defense = (preview.player.maxHp + stats.regen * 10) / stats.armor;
  const score = Math.round(
    1000 * Math.sqrt((offense * defense) / 100) * (stats.speed / 175) ** 0.35,
  );
  return {
    score,
    hp: preview.player.maxHp,
    ...stats,
    weapon: weapon.name,
    weaponDamage:
      weapon.damage *
      stats.damage *
      (1 + forgeDamageBonus(save.forge[weapon.id] || 0)) *
      (1 + weaponRootBonus(preview.spiritRoot, preview.rootElements, weapon)),
    forge: save.forge[weapon.id] || 0,
  };
}
