import type { LifeMode } from './life-mode.ts';

export function lifeModeChoice(mode: LifeMode) {
  const extreme = mode === 'extreme';
  return `<section class="life-mode-choice ${extreme ? 'is-extreme' : ''}" aria-labelledby="life-mode-title">
<style>
.life-mode-choice{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:16px;padding:16px 0;border-top:1px solid var(--border)}
.life-mode-heading{min-width:0}
.life-mode-heading h3{color:var(--gold);font-size:16px;font-weight:400;letter-spacing:2px}
.life-mode-options{display:flex;gap:6px;padding:4px;border:1px solid var(--border)}
.life-mode-options button{min-width:112px;min-height:44px;padding:10px 16px;font-size:13px;color:var(--muted);border:1px solid transparent}
.life-mode-options [aria-pressed=true]{color:#ead8a4;background:#d5c58e14;border-color:#c4b47f88}
.is-extreme .life-mode-options [aria-pressed=true]{color:#efc0a3;background:#b372571a;border-color:#bd8d6d}
.life-mode-description{margin:7px 0 0;font-size:12px;line-height:1.9;white-space:nowrap;color:var(--muted)}
.life-mode-description strong{font-weight:400;color:var(--gold)}
.is-extreme .life-mode-description strong{color:#e5b89d}
@media(max-width:760px){.life-mode-choice{gap:6px 12px}.life-mode-heading{display:contents}.life-mode-heading h3{grid-column:1;grid-row:1}.life-mode-options{grid-column:2;grid-row:1;gap:2px;padding:3px}.life-mode-options button{min-width:64px;padding:9px 8px;font-size:12px}.life-mode-description{grid-column:1/-1;grid-row:2;margin:0;font-size:11px}}
@media(max-width:360px){.life-mode-description{font-size:10px}}
</style>
<div class="life-mode-heading"><h3 id="life-mode-title">此世修行</h3><p class="life-mode-description" aria-live="polite">${extreme ? '<strong>大道无情，生死有命</strong> · 无补给复活，战败/刷新/关闭即亡' : '<strong>借力修行，进退由心</strong> · 可补给复活，可主动结束'}</p></div>
<div class="life-mode-options" role="group" aria-label="此世修行模式"><button data-action="life-mode" data-id="normal" aria-pressed="${!extreme}">普通模式</button><button data-action="life-mode" data-id="extreme" aria-pressed="${extreme}">极限模式</button></div>
</section>`;
}
