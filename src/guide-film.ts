import { STANDALONE } from './build-mode.ts';

const VIDEO_URL = 'https://xiuxian.011203.xyz/media/qinglan-promo-30s.mp4';

// 随指南按需载入；节点移除时释放播放器，覆盖关闭帮助、切换分类与面板重绘。
if (!STANDALONE && typeof customElements !== 'undefined' && !customElements.get('qinglan-film')) {
  customElements.define(
    'qinglan-film',
    class extends HTMLElement {
      private video: HTMLVideoElement | null = null;
      private expanded = false;
      private attempt = 0;
      private toggle!: HTMLButtonElement;
      private body!: HTMLDivElement;
      private status!: HTMLParagraphElement;
      private retry!: HTMLButtonElement;

      connectedCallback() {
        if (this.video) return;
        this.style.cssText = 'display:block;margin:18px 0';
        this.innerHTML = `<button type="button" class="secondary-button" aria-expanded="false">观看青岚短片 · 30 秒</button>
<div hidden><video controls playsinline preload="none" aria-label="青岚短片" style="display:block;width:100%;max-height:60vh;aspect-ratio:16/9;object-fit:contain;background:#071d17;margin-top:14px;border:1px solid #b8c99e33"></video>
<p class="panel-note" role="status" hidden></p><button type="button" class="secondary-button" hidden>重新加载短片</button></div>`;
        this.toggle = this.querySelector('button')!;
        this.body = this.querySelector('div')!;
        this.video = this.querySelector('video')!;
        this.status = this.querySelector('p')!;
        this.retry = this.body.querySelector('button')!;
        this.toggle.addEventListener('click', () => {
          if (this.expanded) this.stop();
          else this.start();
        });
        this.retry.addEventListener('click', () => this.start());
        this.video.addEventListener('loadeddata', () => {
          if (this.expanded) this.status.hidden = true;
        });
        this.video.addEventListener('error', () => {
          if (!this.expanded || !this.isConnected) return;
          this.status.textContent = '短片暂未载入，请检查网络后重试。';
          this.status.hidden = false;
          this.retry.hidden = false;
        });
      }

      private start() {
        const video = this.video!;
        const attempt = ++this.attempt;
        this.expanded = true;
        this.body.hidden = false;
        this.toggle.textContent = '收起青岚短片';
        this.toggle.setAttribute('aria-expanded', 'true');
        this.status.textContent = '正在载入短片…';
        this.status.hidden = false;
        this.retry.hidden = true;
        video.src = VIDEO_URL;
        void video.play().catch(() => {
          if (attempt !== this.attempt || !this.expanded || !this.isConnected || video.error)
            return;
          this.status.textContent = '点击播放器即可开始观看。';
          this.status.hidden = false;
        });
      }

      private stop() {
        this.attempt++;
        this.expanded = false;
        this.video?.pause();
        this.video?.removeAttribute('src');
        this.video?.load();
        this.body.hidden = true;
        this.toggle.textContent = '观看青岚短片 · 30 秒';
        this.toggle.setAttribute('aria-expanded', 'false');
      }

      disconnectedCallback() {
        if (this.video) this.stop();
      }
    },
  );
}
