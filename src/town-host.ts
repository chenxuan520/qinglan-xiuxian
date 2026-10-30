import type { CultivationPath } from './data.ts';
import type { SaveData } from './progress.ts';
import { freshTownPopulation } from './town-population.ts';
import { townVisit, townReturnMemory } from './town-history.ts';
import { visitNightBoat } from './night-boat.ts';
import { visitTownImmortal } from './town-immortal.ts';
import { joinSect, leaveSect, startActivity, tradeIron } from './mortal.ts';
import type { PanelParts } from './panel-host.ts';

export function marketAmbushPanel(held: number, extreme = false): PanelParts {
  return [
    '话中藏刃',
    '坊外 · 劫修伏击',
    `<div id="market-ambush"></div><details class="market-ambush-rules"><summary>遭遇规则与战利品</summary><p class="panel-note">${held} 灵石已暂扣。击败劫修后自动取回，并收取其携带的战利品：一份丹药，可能另有一件法宝，品级与炼器符合对方境界。战利品自动收入行囊。</p><p class="panel-note">${extreme ? '极限模式无法撤离或复活，战败与未完战斗刷新、关闭页面都将结束此世。离开画面时战斗暂停。' : '点「尝试撤离」后会自动向左退，也可手动走位；到达左侧退路、与追兵拉开距离并连续守住两秒才算脱身，成功后损失本次暂扣灵石。气血耗尽会身死，可选择广告复活；放弃复活或机会用尽时，点「查看此世落幕」进入身陨落幕页。离开画面时战斗暂停。'}</p></details>`,
  ];
}

export function marketAmbushRecoveryPanel(): PanelParts {
  return [
    '尚有一场劫修遭遇未结',
    '坊外险路',
    '<p>这场遭遇尚未结束，暂时无法继续。请重试后应战。</p><button class="secondary-button" data-action="market-ambush-recover">重试恢复遭遇</button>',
  ];
}

export function enterTownVisit(save: SaveData): string | null {
  const previous = save.mortal.scenery;
  save.mortal.population ??= freshTownPopulation(save.age);
  visitTownImmortal(save, previous?.lastVisitAge);
  visitNightBoat(save, previous?.lastVisitAge);
  const scenery = (save.mortal.scenery = townVisit(previous, save.age));
  const memory = townReturnMemory(
    save.mortal.population.seed,
    previous,
    scenery,
    !!save.mortal.hometown,
  );
  if (memory) {
    save.mortal.events.unshift(memory);
    save.mortal.events.splice(6);
  }
  return memory;
}

export function executeMortalAction(
  save: SaveData,
  action: string,
  id: string | undefined,
  pendingPath?: CultivationPath,
): boolean {
  return action === 'mortal-join'
    ? joinSect(save, id ?? '', pendingPath)
    : action === 'mortal-leave'
      ? leaveSect(save)
      : action === 'mortal-activity'
        ? startActivity(save, id ?? '')
        : action === 'mortal-buy'
          ? tradeIron(save, true, Number(id?.split(':')[1]), Number(id?.split(':')[0]))
          : action === 'mortal-sell'
            ? tradeIron(save, false, Number(id?.split(':')[1]), Number(id?.split(':')[0]))
            : false;
}
