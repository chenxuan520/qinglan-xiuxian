import type { ActionShell } from './action-controller.ts';
import { sectDuesPending } from './mortal.ts';
import { SETTLEMENT_PATHS } from './settlement-passage.ts';

// 与场景一起按需载入；真正经过路口后，先保存目的地来访再切换场景。
export function travelSettlement(shell: ActionShell, destination: 'town' | 'market') {
  const market = destination === 'market';
  const source = market ? shell.townScene : shell.marketScene;
  const gate = SETTLEMENT_PATHS[market ? 'town' : 'market'].gate;
  if (
    !shell.inMortalWorld ||
    !(market ? shell.inTown : shell.inMarket) ||
    !source?.ready ||
    shell.game ||
    shell.panel ||
    shell.saveLock ||
    shell.save.journeyEnded ||
    shell.save.pendingReincarnation ||
    shell.lifespanInfo(shell.save).remaining <= 0 ||
    shell.tribulationDue(shell.save) ||
    sectDuesPending(shell.save) ||
    shell.save.mortal.marketSocial?.ambush ||
    (shell.save.mortal.hometown && shell.save.mortal.hometown.stage !== 'departed') ||
    Math.hypot(source.position.x - gate.x, source.position.y - gate.y) > 48 ||
    (market && !shell.sectMarketOpen(shell.save))
  )
    return false;
  const next = shell.structuredClone(shell.save);
  let memory: string | null = null;
  if (market) {
    next.mortal.population ??= shell.freshTownPopulation(next.age);
    if (!shell.beginSectMarketVisit(next)) return false;
  } else memory = shell.enterTownVisit(next);
  try {
    shell.writeSave(next, shell.pendingRun);
  } catch {
    if (!shell.saveLock) shell.toast('暂时无法保存这段行程，请退开后重试');
    return false;
  }
  shell.releaseTownScene();
  Object.assign(shell.save, next);
  shell.inMarket = market;
  shell.inTown = !market;
  shell.mortalTab = market ? 'sects' : 'town';
  if (market) shell.marketPosition = { ...SETTLEMENT_PATHS.market.arrival };
  else shell.townPosition = { ...SETTLEMENT_PATHS.town.arrival };
  shell.lastMortalTick = shell.performance.now();
  if (!market) shell.telemetry.track({ type: 'town', ...shell.lifeStats() });
  shell.renderMortal();
  const host = shell.document.getElementById(market ? 'sect-market-view' : 'town-view');
  host?.focus({ preventScroll: true });
  if (memory && host) host.dataset.arrival = memory;
  return true;
}
