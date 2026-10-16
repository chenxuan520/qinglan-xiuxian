import type { ActionShell } from './action-controller.ts';
import { sectServiceContent } from './sect-service-ui.ts';
import { executeSectService } from './sect-services.ts';

function active(shell: ActionShell) {
  return (
    shell.inMortalWorld &&
    !shell.inTown &&
    !shell.inMarket &&
    !shell.game &&
    !shell.saveLock &&
    shell.panel === 'sect-service' &&
    shell.save.mortal.member
  );
}
export function renderSectService(shell: ActionShell, selected = '') {
  if (!active(shell)) return;
  shell.panelFrame(
    '本门传习',
    '宗门 · 专长办事',
    `<div id="sect-service-content" data-sect="${shell.save.mortal.member!.id}">${sectServiceContent(shell.save, !!shell.pendingRun, selected)}</div>`,
  );
  bindSectService(shell);
}
function bindSectService(shell: ActionShell) {
  const select = shell.modal.querySelector<HTMLSelectElement>('#sect-service-choice');
  if (select)
    select.onchange = () => {
      if (!active(shell)) return;
      renderSectService(shell, select.value);
      shell.modal
        .querySelector<HTMLElement>('#sect-service-choice')
        ?.focus({ preventScroll: true });
    };
}
export function sectServiceAction(shell: ActionShell, action: string, choice?: string) {
  const host = shell.modal.querySelector<HTMLElement>('#sect-service-content');
  if (
    !active(shell) ||
    !host ||
    host.dataset.sect !== shell.save.mortal.member?.id ||
    action !== 'sect-service-act' ||
    !choice
  )
    return;
  const button = [...host.querySelectorAll<HTMLButtonElement>('button')].find(
    (b) => b.dataset.action === action && b.dataset.id === choice,
  );
  if (!button || button.disabled) return;
  const next = shell.structuredClone(shell.save);
  const text = executeSectService(next, choice, button.dataset.stamp ?? '', !!shell.pendingRun);
  if (!text) return;
  try {
    shell.writeSave(next, shell.pendingRun);
  } catch {
    if (!shell.saveLock) shell.toast('本次办理未能保存，请重试');
    return;
  }
  Object.assign(shell.save, next);
  renderSectService(shell, choice);
  shell.modal.querySelector<HTMLElement>('#sect-service-result')!.textContent = text;
  const currency = shell.document.getElementById('mortal-currency');
  if (currency) currency.textContent = `灵石 ${shell.save.stones} · 玄铁 ${shell.save.iron}`;
  const status = shell.document.getElementById('mortal-status');
  if (status) status.innerHTML = shell.mortalStatus(shell.save);
  shell.toast('已结清，结果记在此处');
}
