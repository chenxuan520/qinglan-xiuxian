// Vite 部署到仓库子目录时，运行时拼接的图片也需要带上 base。
export function assetUrl(path: string) {
  const url = `${import.meta.env?.BASE_URL ?? '/'}${path.replace(/^\//, '')}`;
  // 公共素材文件名固定，用构建号使旧页面仍读到自己的离线素材版本。
  return typeof __QINGLAN_BUILD_ID__ !== 'undefined' &&
    path.replace(/^\//, '').startsWith('assets/')
    ? `${url}${url.includes('?') ? '&' : '?'}qinglan-build=${__QINGLAN_BUILD_ID__}`
    : url;
}
