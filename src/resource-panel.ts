let updated = false;
const updateMessage = '游戏已更新，请刷新后继续。';

// 已处理的加载错误留在原界面，重试与刷新共用一行操作。
export function resourceFailureContent(
  action = '',
  message = '暂未展开，请重试。',
  label = '重新展开',
) {
  return `<div data-resource-failure><p class="panel-note" data-resource-message role="status">${updated ? updateMessage : message}</p><div class="resource-failure-actions"><button class="secondary-button" data-resource-retry ${action ? `data-action="${action}"` : ''}>${label}</button><button class="secondary-button" data-action="refresh-game">刷新</button></div></div>`;
}

export function resourcesUpdated(root: ParentNode) {
  updated = true;
  root.querySelectorAll('[data-resource-message]').forEach((note) => {
    note.textContent = updateMessage;
  });
}

export function panelUpdateNotice(modal: HTMLElement) {
  const panel = modal.querySelector('.panel');
  if (!panel) return false;
  if (!panel.querySelector('[data-resource-message]'))
    panel.insertAdjacentHTML(
      'beforeend',
      `<div data-resource-failure><p class="panel-note" data-resource-message role="status">${updateMessage}</p><button class="secondary-button" data-action="refresh-game">刷新</button></div>`,
    );
  return true;
}
