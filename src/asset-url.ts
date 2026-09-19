// Vite 部署到仓库子目录时，运行时拼接的图片也需要带上 base。
export function assetUrl(path: string) {
  return `${import.meta.env?.BASE_URL ?? '/'}${path.replace(/^\//, '')}`;
}
