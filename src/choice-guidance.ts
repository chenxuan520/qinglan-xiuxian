import { MAX_PASSIVES, MAX_PASSIVE_LEVEL, MAX_WEAPON_LEVEL, treasure } from './data.ts';
import type { Choice, Game, Weapon } from './game.ts';

type ChoiceContext = Pick<Game, 'weapons' | 'passives' | 'evolutionRequirements'>;

function names(weapons: Weapon[], compact: boolean) {
  const first = treasure(weapons[0].id).name;
  return compact && weapons.length > 1
    ? `${first}等${weapons.length}件`
    : weapons.map((weapon) => treasure(weapon.id).name).join('、');
}

// 只说明本次选择对现有配方的影响，不改变选项、概率或自动选技。
export function choiceGuidance(game: ChoiceContext, choice: Choice) {
  if (choice.type !== 'passive') return null;
  const pending = game.weapons.filter((weapon) => !weapon.evolved);
  const paired = pending.filter((weapon) => {
    const requirements = game.evolutionRequirements(weapon.id);
    return (
      requirements.includes(choice.id) &&
      !requirements.some((id) => (game.passives[id] || 0) >= MAX_PASSIVE_LEVEL)
    );
  });
  const fillsLastSlot =
    !game.passives[choice.id] && Object.keys(game.passives).length === MAX_PASSIVES - 1;
  const blocked = fillsLastSlot
    ? pending.filter((weapon) => {
        const requirements = game.evolutionRequirements(weapon.id);
        return (
          requirements.length > 0 &&
          !requirements.some((id) => id === choice.id || (game.passives[id] || 0) > 0)
        );
      })
    : [];
  if (!paired.length && !blocked.length) return null;

  const describe = (compact: boolean) => {
    const parts: string[] = [];
    if (paired.length) {
      if (choice.level < MAX_PASSIVE_LEVEL) {
        parts.push(
          `配套${names(paired, compact)} · 选后此法还需${MAX_PASSIVE_LEVEL - choice.level}重`,
        );
      } else {
        const ready = paired.filter((weapon) => weapon.level === MAX_WEAPON_LEVEL);
        const waiting = paired.filter((weapon) => weapon.level < MAX_WEAPON_LEVEL);
        if (ready.length)
          parts.push(`${names(ready, compact)}配方齐备${compact ? '' : '，后续升级可觉醒'}`);
        if (waiting.length)
          parts.push(
            compact && ready.length
              ? `另${waiting.length}件待法宝六重`
              : `${names(waiting, compact)}功法补齐，法宝仍需六重`,
          );
      }
    }
    if (blocked.length) parts.push(`占最后功法位：${names(blocked, compact)}本局无法觉醒`);
    return parts.join('；');
  };

  return { text: describe(false), compact: describe(true), blocksEvolution: blocked.length > 0 };
}
