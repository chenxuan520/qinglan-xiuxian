import { imageDownloadUrl, shareImage } from './image-share.ts';
import type { SharingAction } from './sharing.ts';

export function mountJourneyCardActions(
  host: HTMLElement,
  url: string,
  emit: (action: SharingAction) => void,
) {
  const track = (action: SharingAction) => {
    try {
      emit(action);
    } catch {
      /* 统计故障不能影响保存或系统分享。 */
    }
  };
  host.innerHTML =
    '<img alt="此世留影纪念卡预览"><div class="save-actions"><button class="primary-button">分享此世</button><a class="secondary-button" download="叩仙门：青岚纪-此世留影.png" target="_blank" rel="noopener" tabindex="0">保存图片</a></div><p class="panel-note" role="status">点击保存图片；手机也可长按图片，或通过「分享此世」保存。纪念图不能代替存档。</p>';
  host.querySelector('img')!.src = url;
  track('preview');
  const download = host.querySelector('a')!;
  download.href = url;
  const file = new File(
    [Uint8Array.from(atob(url.split(',')[1]), (char) => char.charCodeAt(0))],
    download.download,
    { type: 'image/png' },
  );
  const status = host.querySelector<HTMLElement>('[role="status"]')!;
  download.onclick = () => {
    track('save-request');
    try {
      // 文件已准备完成；在此次点击内同步创建下载地址，保留用户激活。
      download.href = imageDownloadUrl(file);
      status.textContent = '请查看下载记录；若没有图片，可长按图片或通过「分享此世」保存。';
    } catch {
      track('save-failed');
      status.textContent = '暂时无法下载，请长按图片或通过「分享此世」保存。';
    }
  };
  const button = host.querySelector('button')!;
  button.onclick = async () => {
    if (button.disabled) return;
    button.disabled = true;
    track('share-request');
    const result = await shareImage(file);
    track(result === 'save' ? 'fallback' : result);
    if (!host.isConnected) return;
    button.disabled = false;
    if (result === 'save') {
      download.click();
      return;
    }
    status.textContent =
      result === 'shared' ? '已交给系统分享面板。' : '已取消分享，图片仍在，可再次分享或保存。';
  };
}
