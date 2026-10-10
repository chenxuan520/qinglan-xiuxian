# 叩仙门：青岚纪开发指南

## 协作约定

- 沟通、界面与文档使用中文。先读同模块实现和现有组件，再做最小必要改动，不顺带重构或调整无关数值。
- 游戏定位是轻松的自动战斗：自动施法，玩家主要走位。战斗中的守匣、区域遭遇等事件应在进入对应区域并短暂停留后自动触发，不得增加「点击挑战」「点击领取」或额外确认来推进战斗。多个有效技能选项仍由玩家取舍；广告、轮回与清档等已有明确操作规则继续保留。新功能必须遵守此原则，不能擅自增加点击步骤。
- 叙事正文独立于广告：序章、寿尽、终章等正文不引导观看广告，不把观看或放弃广告写成角色心愿与剧情态度；广告说明放在单独的操作说明和按钮区域，保留既有广告规则与奖励。复活页「重燃道心」标题及复活提示按用户确认保留，广告规则仍独立说明。
- 当前在 `master` 迭代。只有用户明确授权当前任务时才 commit / push；提交前先读 `git log --oneline -n 10`，沿用仓库英文 `Add ...` 风格，以实际历史为准。
- 开始多步骤任务时说明假设、简短计划及验证目标。完成前执行检查，报告实际结果及未验证部分。
- 每次完成代码修改后、提交或推送前，必须启动一个独立 subagent 审查本次代码及相关调用、布局和回归风险；主 agent 自审不能替代独立审查。发现的问题须先修复，再让审查 agent 复审受影响部分；取得明确无未解决问题的结论后才能提交、推送或部署。独立审查通过也不能替代必要的实际验证或用户的提交授权。
- 依赖与锁文件红线：添加、升级或删除依赖后，推送前必须检查 `package-lock.json` 全部 `resolved` URL 的域名是公网可达的官方源（如 `registry.npmjs.org`），不得残留本机 npm 可能配置的内网镜像地址——这类地址本地安装一切正常，但会让 GitHub Actions 的 `npm ci` 在下载阶段崩溃（2026-10 实际事故，排查记录见 [验证记录](docs/verification.md)）。检查方法：`grep -o '"resolved": "https://[^/"]*' package-lock.json | sort -u` 逐域确认；发现内网域名必须在推送前改回官方源并重装验证。本机 `npm install` 或 `npm prune` 还会顺手改动锁文件的 libc 等字段格式，提交锁文件时以最小 diff 为准，无关的格式变化要还原。
- 渲染实测（`perf:render`）只用 Node 22 内置 WebSocket 与 fetch 直连 Chrome DevTools Protocol，不引入 puppeteer 等浏览器驱动依赖，避免把额外依赖子树带进每次 push 的 `npm ci`。
- 交付前必须列出并验证全部受影响入口与同类行为；修改共用组件、样式或事件时，沿所有调用位置检查影响。手机与电脑都要实际操作、滚动、切换、返回，并复查窄屏、横竖屏和后期状态。结束前主动核对是否遗漏入口、状态或返回路径，补齐验证与审查后才能交付；不能用某个面板、初始截图或自动测试通过代替全部受影响流程的检查。
- 浏览器预览、交互、DOM、网络、截图验证只使用 **Chrome DevTools MCP**。使用隔离浏览器上下文与测试存档，不操作用户正在玩的页面。不要改用 Playwright、Puppeteer、Selenium 或命令行浏览器；MCP profile 被占用时优先使用隔离上下文，不直接杀进程。
- 直接修改现有页面并更新正常入口，禁止为预览、验证另建临时 HTML（包括 `__verify-*.html`、测试页和入口副本）。页面验证直接访问正常的 5173 首页，仍使用隔离上下文与测试存档。

- 首页右上角音量旁的齿轮「设置」打开独立面板，音乐与音效复用原音量和默认静音规则；离线资源小节每次打开设置默认折叠。离线资源缓存是玩家在设置面板明确选择的可选操作，按钮称为「缓存所有离线资源」，不自动缓存整包、不改广告规则、不写入或清除游戏存档；缓存更新失败必须保留已有完整版本。「清除所有缓存资源」只清理本游戏的离线资源缓存，保留存档。
- 手机首页（含横屏）不显示「自动历练」按钮，开关放在设置里，沿用保存的自动历练状态决定入场行为；战斗、暂停和升级界面的原开关保留。窄屏顶部不为已隐藏按钮保留额外一行。手机点按进入历练、续局、迎战天劫或入镇时自动申请全屏；不锁定横屏，不在切回 App、资源加载回调或自动重绘中重新申请。全屏被拒绝时正常继续，返回首页退出本次全屏。

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
- 永久修为、境界门槛、法宝/功法、妖王或自动策略的数值改动，必须运行 `npm run balance:gate:full`；不得以普通单测或一个天灵根样本代替。门禁用真实 `Game` 和正式结算，对七种灵根、正/魔/兼修、全部十种五行本命、手机/电脑场地和三个难度分别记录逐关进入率、连通率、成功/失败耗时、90 秒修为与境界、每只妖王实际出场与击杀时间，以及未击杀观测下界。裸开荒连续七关、一试即停；收益养成、仅广告复活/借寿、广告满根基/炼器三类另算，不能混成默认胜率。
- 用户最新确认的验收范围仅为**前六关**初入仙途无辅助连通率：天灵根目标 90%、允许 70–100%；异灵根 70%、允许 50–90%；双灵根 40%、允许 20–60%；三灵根 30%、允许 10–50%；四灵根 10%、允许 0–30%；五灵根 5%、允许 0–25%；无灵根允许 0–10%。容差是绝对百分点。这组要求覆盖旧的七关成仙目标；用户已确认终关节奏，无明确新授权不得改动终关配置。默认样本无广告、训练、炼器、药物、宗门与重试，各根 120 个固定本命/路线/场地样本，不等于真人胜率。路线、本命和设备分组必须打印，分组差异单独诊断，不用旧的更严门槛否决用户已允许的整体区间。
- GitHub 每次 push 和 PR 跑 `npm run balance:ci`，只实际运行 840 条前六关无辅助样本；超出上述范围、异常、漏样本、重复样本非零退出。固定快检不扩成长矩阵。同一快检与 Pages 部署链路还执行两个宽松性能门禁：`npm run perf:sim`（固定种子后期高压场景逐帧模拟耗时，只拦灾难性复杂度回归）与 `npm run size:check`（独立构建后入口 JS/CSS 原始及 gzip 字节预算）；每天北京时间中午 12:00（UTC `0 4 * * *`）与手动 full 另跑 `npm run perf:render`（无头 Chrome 恢复高压续局实测 60 秒帧率与长任务），只生成报告不卡关，产物不过仓库。每天北京时间中午 12:00（UTC `0 4 * * *`）与手动 full 跑 `npm run balance:gate:full`，实测 10,080 条当前七关全矩阵及重复首关；成长形状、首关 90 秒与技术完整性独立验收，第七关只报告。历史双向对照保留为 `npm run balance:gate -- --full` 的调研入口；不能把默认日测未执行的历史对照写成已经比较。跨大境界成本至少为上一小突破五倍、天灵根首局 90 秒九成达到炼气中期；当前收益提高属于用户授权改动，不以旧版低收益作为发布目标。
- 每日完整报告地址：<https://chenxuan520.github.io/qinglan-xiuxian/balance-report/>。报告包含源提交、时间、失败、七关实测与投入/路线/本命/场地分组，可组合筛选，汇总维度可多选或全部取消合计，分组分页与图片导出须标明规则和当前页；可生成/保存统计图。失败与诊断放在统计前面，明细默认折叠、点击展开，计数与通过状态保留可见；Error 红色、Warning 黄色；同目录 `diagnostics.json` 提供给本地 AI 的结构化 GET 接口，详情见开发文档。失败日报也更新且工作流仍失败。生成的 HTML、JSON、CSV、截图、整批存档和研究日志只放已忽略 `artifacts/` 或 `/tmp`，**不提交 Git，也不建立 gh-pages 分支保存报告**。报告通过 Actions artifact 组成 Pages 部署；日报发布保留最近成功游戏部署，游戏发布保留最近正式日报。页面更新有排队延迟，失败邮件沿用 GitHub Actions 个人通知设置。
- NPC 域名、模型、超时、对话长度与换代年限集中在 `src/setting.ts`；姓名与换代在 `src/town-population.ts`，百年城景和上次入城记录在 `src/town-history.ts`，对白 UI 在 `src/npc-chat.ts`，共享协议与兜底在 `src/npc-dialogue.ts`。Worker 在 `workers/npc-ai/`；修改后执行 `npm run check:npc-ai` 与相关测试，`npm run deploy:npc-ai` 单独发布。默认域名 `qinglan-npc-ai.011203.xyz`，绑定和 CORS 来源随配置维护；严禁将 API 密钥放入前端，AI 文本不能改变游戏数值或当作 HTML 执行。
- 匿名游玩统计在 `src/telemetry.ts`，经同一 Worker 的 `POST /event` 写入 Analytics Engine（`qinglan_events`），只在官网与 GitHub Pages 发送，静态部署不依赖它；`npm run stats` 查询。改事件字段需同步 Worker 校验、查询脚本与 [开发与部署](docs/development.md)。发布时先部署 Worker 再推送；上线验证写入的记录用版本号 `verification`，不要用真实版本号制造测试数据。
- 统一公开监控入口 `/monitor/` 在两站「关于」中，公开聚合接口 `GET https://qinglan-npc-ai.011203.xyz/monitor/stats`，服务端凭证不得进入前端；`MONITOR_PUBLIC=false` 关闭线上公开查询。CI 诊断及每日渲染 / 模拟 / 体积摘要从 GitHub Pages 动态读取，性能 JSON 位于 `monitor/performance.json`，逐项标明时间与源提交，失败或缺数据不能冒充成功；只发布 artifact，不提交生成报告或截图，详见 [开发与部署](docs/development.md)。
- 视觉及交互改动需用真实页面验证，桌面和手机布局都要检查。开发模式可用 `window.__qinglan`；生产构建没有此入口。
- 不擅自移动或折叠已确认的首页五行灵根盘，不顺带改变战斗按钮大小。通用触屏样式必须检查固定网格是否仍容纳按钮；发布前逐项复查本次修改涉及的手机、电脑操作及返回路径，并检查窄屏、横竖屏、后期长数字与多种药效，不能只验证初始画面。
- 图片保存须实际点击并检查浏览器下载及文件内容，同时覆盖分享回退、取消和失败提示。手机自动历练在支持的浏览器中保持屏幕常亮，暂停、关闭自动、结算或切到后台时释放，返回前台按当前状态恢复；拒绝或不支持常亮不得阻断游戏。
- 标签、分类、筛选与分页栏随所属页面或面板内容正常滚动，不能擅自设置吸顶或固定定位；需要切换时回到顶部操作。尤其复查手机端藏器阁、妖物志、指南、丹药与人间等所有同类入口，不只检查一个面板。关闭按钮的独立行为不属于标签栏。
- 存档键为 `qinglan-immortal-v1`。兼容旧档，保留玩家进度，注意永久结算不能重复入账。测试使用隔离存档，禁止清空用户真实 localStorage。新增或改变存档字段时递增 `progress.ts` 的 `SAVE_SCHEMA`，旧页面读到更高版本只读不写；`main.ts` 写存档只经过 `writeSave`。
- 当前尚未正式上线、没有线上用户，兼容性采用最小必要处理，不为假设中的旧用户增加大规模迁移逻辑；确实无法兼容时，可保留原始数据并弹窗说明不兼容。
- 新图片生成后运行 `python3 scripts/compress-assets.py` 压成 WebP（需要 Pillow），保留尺寸及 alpha，项目不携带 PNG 原图。城镇扩建在 `town.ts` 追加道路、建筑与 NPC 坐标，并检查可达性；只有载入完毕、前台有焦点的城镇且无弹窗时推进人间时间。
- 人间研习、委托等主动操作直接消耗游戏年岁并结算，禁止让玩家等待现实倒计时；沿用寿尽、天劫、供奉边界，旧任务只结算剩余部分。城镇闲逛保留前台计时。
- 动态素材 URL 使用 `assetUrl()`，兼容 GitHub Pages 子路径。新增素材先生成并检查，再接入。法宝图标沿用统一图集，避免混用图片和 SVG。
- 每次进入页面默认静音，只有明确点击序章或主界面的开启声音按钮后才播放，普通点击或按键不得自动开启。与音效共用总音量和静音，只创建一个播放实例，不在渲染循环中创建音源；保留音量，导入存档不自动开启声音，音乐加载不得阻塞开局。生成方法见 [素材说明](docs/assets.md)。
- README 保持简短，只放封面、唯一官网 `https://xiuxian.011203.xyz/`、核心特色和开发入口；详细玩法同步 [玩法详解](docs/gameplay.md) 和游戏内指南，部署细节维护 [开发与部署](docs/development.md)。实际验证记录写入 [docs/verification.md](docs/verification.md)，不要把预计结果写成已通过。

## 本机 5173 安全更新

5173 当前用于生产预览。用户可能正在游玩：**不重启服务、不刷新用户页面、不清空 `dist`，保留旧 hash 文件**。普通 `npm run build` 默认清空输出，因此不要对正在服务的 `dist` 直接构建。

先完成相关测试与独立目录构建，再追加资源、原子替换正常入口，最后直接在 5173 首页验证：

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

执行各步前确认上一步成功。如果新增 `assets/` 外的公共文件，也需先复制。更新后用 MCP 隔离页面访问 `http://localhost:5173/` 验证，不创建额外 HTML 入口。上述 `index.html.next` 仅用于原子替换，替换后不保留，不作为预览页面。旧页面继续使用旧资源，新打开或用户自行刷新才使用新版本。

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

发布命令包含前六关 840 条门禁、类型检查、构建和 Wrangler 上传。GitHub push **不会自动发布 Cloudflare**；游戏发布需同步 Cloudflare 主站，不能只以 GitHub Pages 成功作为上线完成。部署后使用 MCP 检查正式域名的新版本、素材及关键功能。

localhost、GitHub Pages、Cloudflare 各网址的存档相互独立。迁移使用洞府「此世存档」中的「导出此世 / 导入旧档」，不要暗中复制用户浏览器数据。
