import type { LifeMode } from './life-mode.ts';

export function lifeModeChoice(mode: LifeMode) {
  const extreme = mode === 'extreme';
  return `<section class="life-mode-choice ${extreme ? 'is-extreme' : ''}" aria-labelledby="life-mode-title">

<div class="life-mode-heading"><h3 id="life-mode-title">此世修行</h3><p class="life-mode-description" aria-live="polite">${extreme ? '<strong>大道无情，生死有命</strong> · 无补给复活；战败或未完战斗时刷新、关闭即亡' : '<strong>借力修行，进退由心</strong> · 可补给复活，可主动结束'}</p></div>
<div class="life-mode-options" role="group" aria-label="此世修行模式"><button data-action="life-mode" data-id="normal" aria-pressed="${!extreme}">普通模式</button><button data-action="life-mode" data-id="extreme" aria-pressed="${extreme}">极限模式</button></div>
<details class="life-mode-details"><summary>普通与极限有什么不同</summary><div class="life-mode-comparison"><div><h4>普通模式</h4><p>三档难度均可选择。普通秘境战败可结算所得并继续此世，也可按界面规则复活；可主动结束秘境，未完成的历练可保存续玩。天劫与坊外劫修仍按各自的生死规则处理。</p><p>可领取灵根重选、物资补给及借寿，具体条件与次数以操作界面为准。道果按普通系数结算。</p></div><div><h4>极限模式</h4><p>从「问道试炼」难度起步，不能选择「初入仙途」。战败即此世落幕，不能复活，也不能主动退离秘境、天劫或劫修战。</p><p>不能领取灵根重选、物资补给或借寿；正常丹药与交易照常可用。道果在其余分项结算后额外 ×1.15，通关七境可达成「生死证道」。</p><p>未完战斗刷新或关闭后重开即身陨，包括暂停、选技、查看指南时。暂停和切到后台本身不判死，返回后可继续；战斗外刷新不判死。</p></div></div><p class="life-mode-detail-note">点击「道心已明」后，本世模式固定；下一世可重新选择。</p></details>
</section>`;
}
