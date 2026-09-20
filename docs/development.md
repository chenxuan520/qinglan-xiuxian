# 开发与部署

[返回项目首页](../README.md)

Cloudflare Pages 是主要游玩入口，GitHub Pages 作为备用。发布新版本时须同步主站；仅推送 GitHub 不会更新 Cloudflare。

## 本地运行

需要 Node.js 22.18+ 和 npm。

```bash
npm ci
npm run dev -- --port 5173 --strictPort
```

打开终端显示的地址，默认是 `http://localhost:5173`。手机与电脑在同一局域网时，可使用终端显示的 Network 地址访问。

```bash
npm test           # 战斗、成长、存档与立绘映射测试
npm run build      # TypeScript 检查与生产构建
npm run preview    # 预览 dist 中的生产版本
npm run balance    # 固定种子的难度与六境连续战斗模拟
npm run balance:trial # 四档境界的终关挑战模拟
npm run balance:tribulation # 五次天劫的满配 AI 模拟
npm run format:check
```

## Cloudflare Pages · 主站

主入口：[青岚仙途](https://qinglan-xiuxian.pages.dev/)。

使用 `wrangler.jsonc` 与独立构建目录 `artifacts/cloudflare`，避免覆盖本机正在运行的 `dist`。Cloudflare 使用根路径 `/`，GitHub Pages 仍按仓库子路径构建。

```bash
npx wrangler login
npm run deploy:cloudflare
```

首次创建项目时执行 `npx wrangler pages project create qinglan-xiuxian --production-branch master --force`。部署使用当前登录账号，不在仓库保存令牌。Cloudflare 通过上述命令发布，GitHub Pages 仍在推送 master 后自动发布。

不同网址的浏览器存档独立。迁移时先在原网址的洞府导出存档，再到新网址导入。

## GitHub Pages · 备用站

备用入口：[青岚仙途](https://chenxuan520.github.io/qinglan-xiuxian/)。

`.github/workflows/pages.yml` 在推送到 `master` 时执行格式检查、测试与生产构建，再部署到 GitHub Pages，也支持在 Actions 页面手动运行。仓库 Settings → Pages 的发布来源需设为 **GitHub Actions**；私有仓库需要支持 Pages 的 GitHub 套餐。

构建会使用 Pages 提供的子目录路径，地图、人物、法宝图标和后台计时 Worker 均支持仓库地址下访问。本地 `npm run dev` 与默认构建继续使用根路径。

GitHub Pages 和 localhost 是不同来源，浏览器存档各自独立，不会自动同步。

## 项目结构

| 文件                 | 职责                                  |
| -------------------- | ------------------------------------- |
| `src/data.ts`        | 法宝、功法、妖物、秘境、难度数据      |
| `src/game.ts`        | 独立于 DOM 的战斗模拟、选技、对局快照 |
| `src/autoplay.ts`    | AI 走位与选技策略，游戏和难度模拟共用 |
| `src/render.ts`      | Canvas 场景、角色、弹道与特效         |
| `src/item-art.ts`    | 法宝与功法共用的生成图集映射          |
| `src/sprites.ts`     | 战斗和妖物志共享的立绘图集映射        |
| `src/progress.ts`    | 永久境界、资源、炼器、修炼与结算      |
| `src/main.ts`        | 页面、输入、音效、存档、游戏状态衔接  |
| `src/guide.ts`       | 游戏内修行指南                        |
| `src/style.css`      | 桌面和移动布局                        |
| `tests/game.test.ts` | 逻辑回归测试                          |
| `scripts/balance.ts` | 可复现的自动战斗和成长模拟            |

使用 TypeScript、Canvas 2D 与 Vite，不依赖运行时游戏框架或后端。开发模式提供 `window.__qinglan` 以验证场景，生产构建会移除该入口。中文字体优先使用 Noto Serif SC，加载失败时回退到系统宋体。

图片为本项目通过内置 imagegen 工具生成，运行素材统一压缩为 WebP，保留原尺寸和透明边缘，不携带未压缩 PNG。秘境只预载当前地图、本境敌人和首领以及法宝图集；城镇地图及九职业 NPC 按进入场景加载。预加载显示进度条，全部就绪才开放场景，失败提供重试。背景音乐为本项目原创编曲并离线合成，已保存于 `public/assets/`。生成方法见 [素材说明](assets.md)，测试范围与限制见 [验证记录](verification.md)，开发及部署约定见 [AGENTS.md](../AGENTS.md)。

## 开发时保护正在运行的游戏

当前按用户要求直接在 master 迭代，5173 使用生产预览。有人正在游玩时，不重启或热刷新游玩服务；先构建到临时目录，发布时先补齐资源、保留旧 hash 文件，最后原子替换入口 HTML。不要直接清理正在服务的 dist。新增素材必须先落盘、检查所有路径可加载，再接入资源清单，并通过 Chrome DevTools MCP 验证。不同端口的 localStorage 相互隔离，测试端口不会继承游玩端口存档。
