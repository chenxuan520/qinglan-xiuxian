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
