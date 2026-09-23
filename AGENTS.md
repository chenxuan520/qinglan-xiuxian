# 叩仙门：青岚纪开发指南

## 协作约定

- 沟通、界面与文档使用中文。先读同模块实现和现有组件，再做最小必要改动，不顺带重构或调整无关数值。
- 当前在 `master` 迭代。只有用户明确授权当前任务时才 commit / push；提交前先读 `git log --oneline -n 10`，沿用仓库英文 `Add ...` 风格，以实际历史为准。
- 开始多步骤任务时说明假设、简短计划及验证目标。完成前执行检查，报告实际结果及未验证部分。
- 浏览器预览、交互、DOM、网络、截图验证只使用 **Chrome DevTools MCP**。使用隔离浏览器上下文与测试存档，不操作用户正在玩的页面。不要改用 Playwright、Puppeteer、Selenium 或命令行浏览器；MCP profile 被占用时优先使用隔离上下文，不直接杀进程。

## 技术与目录

前端使用 Vite + TypeScript + Canvas 2D，无运行时游戏框架。战斗与存档本地运行，NPC 闲谈使用独立 Cloudflare Workers AI，失败回退本地对白。需要 Node.js **22.18+**。

| 路径                                  | 职责                                      |
| ------------------------------------- | ----------------------------------------- |
| `src/data.ts`                         | 法宝、功法、灵根、境界、关卡与难度数据    |
| `src/game.ts`                         | 无 DOM 战斗模拟、升级、伤害统计、对局快照 |
| `src/autoplay.ts`                     | AI 走位及选技，实战与平衡模拟共用         |
| `src/progress.ts`                     | 永久存档、成长、寿元、闭关、天劫与结算    |
| `src/mortal-data.ts`、`src/mortal.ts` | 人间时间、十六宗门、供奉与精研规则        |
| `src/mortal-ui.ts`、`src/mortal.css`  | 人间界面、宗门图集和响应式布局            |
| `src/save-transfer.ts`                | 存档导入导出及校验                        |
| `src/main.ts`                         | 界面、输入、音频、存档写入与状态衔接      |
| `src/render.ts`、`src/style.css`      | Canvas 绘制、桌面和移动布局               |
| `src/item-art.ts`、`src/sprites.ts`   | 统一图集映射，列表和战场共用              |
| `src/town.ts`、`src/town-scene.ts`    | 城镇坐标、行走与交互、模块地图及镜头      |
| `src/scene-assets.ts`                 | 按关卡生成预载素材清单                    |
| `src/asset-url.ts`                    | 静态素材的部署基础路径处理                |
| `src/guide.ts`                        | 游戏内说明，玩法变化时同步维护            |
| `public/assets/`                      | 已生成的图片及背景音乐                    |
| `tests/`、`scripts/`                  | 逻辑测试、固定种子平衡模拟、素材生成脚本  |

开发及验证命令：

```bash
npm ci
npm run dev -- --port 5173 --strictPort
npm test
npm run build
npm run format:check
```

有人正在使用 5173 时，不启动第二个服务，不自动换成 5174。先检查现有进程，并按下一节更新生产预览。`npm run preview -- --port 5173 --strictPort` 用于尚无服务时预览 `dist`。

- 修改战斗或成长后，运行相关测试；涉及整体难度时再运行 `npm run balance`、`npm run balance:trial` 或 `npm run balance:tribulation`。音频和文档改动无需重跑全部平衡模拟。
- NPC 域名、模型、超时、对话长度与换代年限集中在 `src/setting.ts`；姓名与换代在 `src/town-population.ts`，百年城景和上次入城记录在 `src/town-history.ts`，对白 UI 在 `src/npc-chat.ts`，共享协议与兜底在 `src/npc-dialogue.ts`。Worker 在 `workers/npc-ai/`；修改后执行 `npm run check:npc-ai` 与相关测试，`npm run deploy:npc-ai` 单独发布。默认域名 `qinglan-npc-ai.011203.xyz`，绑定和 CORS 来源随配置维护；严禁将 API 密钥放入前端，AI 文本不能改变游戏数值或当作 HTML 执行。
- 视觉及交互改动需用真实页面验证，桌面和手机布局都要检查。开发模式可用 `window.__qinglan`；生产构建没有此入口。
- 存档键为 `qinglan-immortal-v1`。兼容旧档，保留玩家进度，注意永久结算不能重复入账。测试使用隔离存档，禁止清空用户真实 localStorage。
- 新图片生成后运行 `python3 scripts/compress-assets.py` 压成 WebP（需要 Pillow），保留尺寸及 alpha，项目不携带 PNG 原图。城镇扩建在 `town.ts` 追加道路、建筑与 NPC 坐标，并检查可达性；只有载入完毕、前台有焦点的城镇且无弹窗时推进人间时间。
- 人间研习、委托等主动操作直接消耗游戏年岁并结算，禁止让玩家等待现实倒计时；沿用寿尽、天劫、供奉边界，旧任务只结算剩余部分。城镇闲逛保留前台计时。
- 动态素材 URL 使用 `assetUrl()`，兼容 GitHub Pages 子路径。新增素材先生成并检查，再接入。法宝图标沿用统一图集，避免混用图片和 SVG。
- 每次进入页面默认静音，只有明确点击序章或主界面的开启声音按钮后才播放，普通点击或按键不得自动开启。与音效共用总音量和静音，只创建一个播放实例，不在渲染循环中创建音源；保留音量，导入存档不自动开启声音，音乐加载不得阻塞开局。生成方法见 [素材说明](docs/assets.md)。
- README 保持简短，只放封面、唯一官网 `https://xiuxian.011203.xyz/`、核心特色和开发入口；详细玩法同步 [玩法详解](docs/gameplay.md) 和游戏内指南，部署细节维护 [开发与部署](docs/development.md)。实际验证记录写入 [docs/verification.md](docs/verification.md)，不要把预计结果写成已通过。

## 本机 5173 安全更新

5173 当前用于生产预览。用户可能正在游玩：**不重启服务、不刷新用户页面、不清空 `dist`，保留旧 hash 文件**。普通 `npm run build` 默认清空输出，因此不要对正在服务的 `dist` 直接构建。

先在独立目录完成构建、测试和页面验证，再追加资源、原子替换入口：

```bash
build_dir=$(mktemp -d /tmp/qinglan-build.XXXXXX)
npm run build -- --base / --outDir "$build_dir" --emptyOutDir
cp -R "$build_dir/assets/." dist/assets/
python3 - "$build_dir" <<'PY'
from pathlib import Path
import sys
pending = Path('dist/index.html.next')
pending.write_bytes((Path(sys.argv[1]) / 'index.html').read_bytes())
pending.replace('dist/index.html')
PY
```

执行各步前确认上一步成功。如果新增 `assets/` 外的公共文件，也需先复制。可先把新入口另存为 `dist/__verify-<任务>.html`，用 MCP 隔离页面验证，通过后切换正式入口并清理自己的验证入口。旧页面继续使用旧资源，新打开或用户自行刷新才使用新版本。

## GitHub Pages 发布（平台部署）

- 仓库：<https://github.com/chenxuan520/qinglan-xiuxian>。
- 平台部署地址：<https://chenxuan520.github.io/qinglan-xiuxian/>，仅供部署检查。README 和仓库网站栏只放唯一官网 <https://xiuxian.011203.xyz/>。
- `.github/workflows/pages.yml` 在 push `master` 后自动检查格式、测试、按仓库子路径构建并发布；也支持手动触发。仓库 Pages 来源为 GitHub Actions。
- 经用户授权提交后，`git push origin master`，再用 `gh run list` / `gh run view <run-id>` 检查这次提交的部署结果。发布后用 MCP 确认新入口、资源与关键交互，不能只以 push 成功作为发布完成。

## Cloudflare Pages 发布（主站）

- 项目名 `qinglan-xiuxian`，生产分支 `master`，唯一官网 <https://xiuxian.011203.xyz/>。所有面向玩家的链接只使用官网域名。NPC Worker 的 `ALLOWED_ORIGINS` 必须包含官网来源，域名变更需同步配置并验证浏览器预检和实际对话。
- `wrangler.jsonc` 管理配置；独立构建目录为 `artifacts/cloudflare`，使用根路径 `/`，不会覆盖本机 `dist`。
- 已有项目无需重新创建。优先使用环境中的 `CLOUDFLARE_API_TOKEN`，或用 `npx wrangler login` 登录；`npx wrangler whoami` 检查身份。不得把令牌写入仓库、日志或文档。

```bash
npm run deploy:cloudflare
npx wrangler pages deployment list --project-name qinglan-xiuxian --json
```

发布命令包含类型检查、构建和 Wrangler 上传。GitHub push **不会自动发布 Cloudflare**；游戏发布需同步 Cloudflare 主站，不能只以 GitHub Pages 成功作为上线完成。部署后使用 MCP 检查正式域名的新版本、素材及关键功能。

localhost、GitHub Pages、Cloudflare 各网址的存档相互独立。迁移使用洞府「此世存档」中的「导出此世 / 导入旧档」，不要暗中复制用户浏览器数据。
