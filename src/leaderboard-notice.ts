export function leaderboardUnavailableContent(blocked = false) {
  const message = blocked
    ? '此存档未通过完整性校验。可以继续游玩，但本世不可留名万魂幡。'
    : '暂时无法读取万魂幡，尚未核实留名资格。可先保存此世存档，稍后再试。';
  return `<section class="leaderboard-unavailable" data-ranking-unavailable><p class="panel-note" role="status">${message}</p><div class="save-actions"><button class="secondary-button" data-action="export-save">保存此世存档</button><button class="secondary-button" data-action="leaderboard-retry">重新核验</button></div></section>`;
}
