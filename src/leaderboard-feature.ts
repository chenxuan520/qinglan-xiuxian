import { inheritancePreview } from './inheritance-ui.ts';
import type { SaveData } from './progress.ts';
export { LeaderboardOffer } from './leaderboard-offer.ts';
export { LeaderboardPanel } from './leaderboard-panel.ts';
export { journeyScore } from './journey-score.ts';
export { extractLeaderboardFacts } from './leaderboard-contract.ts';

export function showOffer(host: Element, toast?: (text: string) => void) {
  const notice = document.createElement('div');
  notice.className = 'save-actions leaderboard-offer';
  notice.setAttribute('data-ranking-offer', '');
  notice.innerHTML =
    '<button class="secondary-button" data-action="leaderboard">留名万魂幡</button>';
  host.append(notice);
  toast?.('此世道果已可列入前百，可选择留名万魂幡。');
}

export function restoreInheritance(
  host: Element,
  save: SaveData,
  value: string | null,
  scroll = 0,
) {
  const choice = host.querySelector<HTMLSelectElement>('#reincarnate-inheritance');
  if (choice && value !== null) {
    choice.value = value;
    const preview = host.querySelector<HTMLElement>('.inheritance-preview');
    if (preview) preview.innerHTML = inheritancePreview(save, value);
  }
  const section = host.querySelector<HTMLElement>('.panel');
  if (section) section.scrollTop = scroll;
}
