// 以文件地址发起下载，避免手机浏览器忽略过长的内嵌图片链接。
export function imageDownloadUrl(file: File) {
  const url = URL.createObjectURL(file);
  // 给浏览器下载或打开图片留出时间，再释放本地文件地址。
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return url;
}

export async function shareImage(
  file: File,
  browser: Partial<Pick<Navigator, 'canShare' | 'share'>> = navigator,
): Promise<'shared' | 'cancelled' | 'save'> {
  try {
    if (!browser.share || !browser.canShare?.({ files: [file] })) return 'save';
    // 文件已在预览生成时备好，点击后直接调系统面板，保留用户激活状态。
    await browser.share({ files: [file], title: '叩仙门：青岚纪 · 此世留影' });
    return 'shared';
  } catch (error) {
    return error instanceof Error && error.name === 'AbortError' ? 'cancelled' : 'save';
  }
}
