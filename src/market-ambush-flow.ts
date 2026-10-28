import { isExtremeLife } from './life-mode.ts';
import type { ActionShell } from './action-controller.ts';
import type { SaveData } from './progress.ts';
import { MAX_REVIVES } from './data.ts';
import { MarketAmbushScene } from './market-ambush-scene.ts';
import { MarketAmbushDuel, type AmbushOutcome } from './market-ambush.ts';
import type { AmbushSnapshot } from './market-ambush-data.ts';
import { settleMarketAmbush } from './market-social.ts';

function commit(shell: ActionShell, next: SaveData) {
  try {
    shell.writeSave(next, shell.pendingRun);
  } catch {
    return false;
  }
  Object.assign(shell.save, next);
  return true;
}
function checkpoint(shell: ActionShell, snapshot: AmbushSnapshot) {
  if (shell.saveLock || !shell.save.mortal.marketSocial?.ambush || shell.save.pendingReincarnation)
    return false;
  const next = structuredClone(shell.save) as SaveData;
  next.mortal.marketSocial!.ambush!.snapshot = structuredClone(snapshot);
  return commit(shell, next);
}
function hideClose(shell: ActionShell) {
  shell.modal.querySelector('[data-action="close"]')?.remove();
}
function showDefeat(shell: ActionShell) {
  const encounter = shell.save.mortal.marketSocial?.ambush;
  if (!encounter || encounter.snapshot.outcome !== 'defeat') return;
  if (isExtremeLife(shell.save)) {
    shell.beginJourneyFarewell('extreme');
    return;
  }
  shell.ambushScene?.destroy();
  shell.ambushScene = null;
  shell.panel = 'market-ambush-defeat';
  const remaining = MAX_REVIVES - encounter.revivesUsed;
  shell.panelFrame(
    '重燃道心',
    '坊市之外 · 生死一线',
    `
    <p class="story-lead">山路寂然，方才的杀意却仍未散去。你倒在归途之前，此世的脚步就此停下。</p>
    <p class="panel-note">此世行迹可留影纪念；轮回将清空此世修为、物资与履历，从十五岁重新启程。</p>
    <div class="result-actions">${remaining > 0 ? '<button class="primary-button" data-action="market-ambush-watch-ad">观看广告 · 满血复活</button>' : ''}<button class="secondary-button" data-action="market-ambush-end">查看此世落幕</button></div>
    <p class="ad-note">${remaining > 0 ? `本次遭遇还可复活 ${remaining} 次；完整观看广告后领取，敌人血量不重置。` : '本次遭遇的复活机会已用尽。'}</p>`,
  );
  hideClose(shell);
}
export function mountAmbush(shell: ActionShell) {
  const encounter = shell.save.mortal.marketSocial?.ambush;
  if (!encounter || shell.saveLock) return;
  if (shell.save.pendingReincarnation) {
    shell.renderJourneyFarewell(shell.save.pendingReincarnation);
    return;
  }
  if (encounter.snapshot.outcome === 'defeat') {
    showDefeat(shell);
    return;
  }
  if (encounter.snapshot.outcome) {
    finishAmbush(shell, encounter.snapshot.outcome);
    return;
  }
  shell.closeNpcChat();
  shell.clearInput();
  shell.panel = 'market-ambush';
  shell.panelFrame(...shell.marketAmbushPanel(encounter.held, isExtremeLife(shell.save)));
  hideClose(shell);
  shell.ambushScene?.destroy();
  shell.ambushScene = new MarketAmbushScene(
    shell.modal.querySelector<HTMLElement>('#market-ambush')!,
    shell.save,
    encounter.npc,
    (outcome) => finishAmbush(shell, outcome),
    (snapshot) => checkpoint(shell, snapshot),
  );
}
export function finishAmbush(shell: ActionShell, outcome: AmbushOutcome) {
  if (shell.saveLock || shell.save.pendingReincarnation) return;
  const encounter = shell.save.mortal.marketSocial?.ambush;
  if (!encounter || encounter.snapshot.outcome !== outcome) return;
  const next = structuredClone(shell.save) as SaveData;
  const result = settleMarketAmbush(next, outcome);
  if (!result || !commit(shell, next)) {
    if (shell.saveLock) return;
    shell.ambushScene?.destroy();
    shell.ambushScene = null;
    shell.panel = 'market-ambush-recovery';
    shell.panelFrame(
      '战况已定',
      '结算尚未保存',
      '<p>未能保存结果，请释放浏览器存储空间后重试。</p><button class="primary-button" data-action="market-ambush-recover">重试保存结果</button>',
    );
    hideClose(shell);
    return;
  }
  if (outcome === 'defeat') {
    showDefeat(shell);
    return;
  }
  shell.ambushScene?.destroy();
  shell.ambushScene = null;
  shell.panel = '';
  shell.modal.innerHTML = '';
  // 不重新打开与已死劫修的交易，也不凭旧槽位认作另一个人。
  shell.renderLobby();
  shell.toast(result.text, 6000);
}
export function ambushAction(shell: ActionShell, action: string) {
  const encounter = shell.save.mortal.marketSocial?.ambush;
  if (!encounter || shell.saveLock || shell.save.pendingReincarnation) return;
  if (
    isExtremeLife(shell.save) &&
    ['market-ambush-watch-ad', 'market-ambush-revive', 'market-ambush-exit'].includes(action)
  )
    return;
  if (action === 'market-ambush-recover') {
    mountAmbush(shell);
    return;
  }
  if (shell.panel === 'market-ambush' && !encounter.snapshot.outcome) {
    if (action === 'market-ambush-exit' || action === 'close' || action === 'home')
      shell.ambushScene?.requestRetreat();
    else if (action === 'market-ambush-retry-checkpoint') shell.ambushScene?.retryCheckpoint();
    else if (action === 'market-ambush-retry-assets') void shell.ambushScene?.retryAssets();
    return;
  }
  if (encounter.snapshot.outcome !== 'defeat') return;
  if (action === 'market-ambush-end' && shell.panel === 'market-ambush-defeat') {
    shell.beginJourneyFarewell('ambush');
  } else if (
    action === 'market-ambush-watch-ad' &&
    shell.panel === 'market-ambush-defeat' &&
    encounter.revivesUsed < MAX_REVIVES
  ) {
    shell.panel = 'market-ambush-ad';
    shell.panelFrame(
      '重燃道心',
      '广告复活',
      `${shell.AD_PLACEHOLDER_HTML}<p class="panel-note">完整观看广告后满血复活，并获得三秒护身。</p><div class="result-actions"><button class="primary-button" data-action="market-ambush-revive" disabled>${shell.AD_SECONDS} 秒后满血复活</button><button class="secondary-button" data-action="market-ambush-ad-back">返回</button></div>`,
    );
    hideClose(shell);
    shell.startAdWatch('market-ambush-revive', '满血复活', 'revive');
  } else if (
    (action === 'market-ambush-ad-back' || action === 'close') &&
    shell.panel === 'market-ambush-ad'
  ) {
    shell.clearInterval(shell.adTimer);
    shell.adReadyAt = 0;
    shell.adWatched = false;
    showDefeat(shell);
  } else if (
    action === 'market-ambush-revive' &&
    shell.panel === 'market-ambush-ad' &&
    shell.adCompleted() &&
    encounter.revivesUsed < MAX_REVIVES
  ) {
    const next = structuredClone(shell.save) as SaveData;
    const active = next.mortal.marketSocial!.ambush!;
    const duel = new MarketAmbushDuel(active.stats, active.snapshot);
    if (!duel.revive()) return;
    active.snapshot = duel.snapshot();
    active.revivesUsed++;
    next.adUsage.revive++;
    if (!commit(shell, next)) {
      if (!shell.saveLock) shell.toast('复活尚未保存，次数未消耗，请重试');
      return;
    }
    shell.clearInterval(shell.adTimer);
    shell.adReadyAt = 0;
    shell.adWatched = false;
    mountAmbush(shell);
  }
}
