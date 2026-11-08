import { guideAskBaseUrl, GUIDE_ASK_FAILURE } from './guide-ask-contract.ts';
import { ModuleSource, retryModule } from '../core/module-source.ts';

type AskModule = typeof import('./guide-ask.ts');
const source = new ModuleSource<AskModule>((attempt) =>
  attempt ? retryModule<AskModule>('guide-ask', 'guide-ask', attempt) : import('./guide-ask.ts'),
);

// 指南打开时只有入口；输入、对话、请求和样式在点开后才加载。
if (
  guideAskBaseUrl() &&
  typeof customElements !== 'undefined' &&
  !customElements.get('qinglan-guide-ask')
) {
  customElements.define(
    'qinglan-guide-ask',
    class extends HTMLElement {
      private attempt = 0;
      private dispose?: () => void;
      connectedCallback() {
        this.style.cssText = 'display:block;margin:14px 0 22px';
        this.innerHTML =
          '<button type="button" class="prologue-revisit guide-ask-toggle" aria-expanded="false">有不懂的？问一问</button>';
        const button = this.querySelector('button')!;
        button.addEventListener('click', async () => {
          const attempt = ++this.attempt;
          button.disabled = true;
          try {
            const module = await source.load();
            if (!this.isConnected || attempt !== this.attempt) return;
            this.dispose = module.mountGuideAsk(this);
          } catch {
            if (this.isConnected && attempt === this.attempt) {
              button.disabled = false;
              let note = this.querySelector('p');
              if (!note) {
                note = document.createElement('p');
                note.className = 'panel-note';
                note.setAttribute('role', 'status');
                this.append(note);
              }
              note.textContent = GUIDE_ASK_FAILURE;
            }
          }
        });
      }
      disconnectedCallback() {
        this.attempt++;
        this.dispose?.();
      }
    },
  );
}
