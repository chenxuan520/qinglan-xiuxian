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
npm run balance:training # 天灵根与普通双、三灵根的连续六境及悟道终关对照
npm run balance:passives # 三路线、三灵根的终关功法对照
npm run balance:trial # 四档境界的终关挑战模拟
npm run balance:tribulation # 五次天劫的满配 AI 模拟
npm run format:check
npm run check:npc-ai # 生成 Worker 类型并检查独立后端
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

## NPC 对话 · Cloudflare Workers AI

独立 Worker 名称为 `qinglan-npc-ai`，配置在 `workers/npc-ai/wrangler.jsonc`。默认入口为 `https://qinglan-npc-ai.011203.xyz`，`GET /health` 检查服务信息，`POST /chat` 生成对白；两者都必须携带受支持的 `Origin`。自定义域名已写入 routes，后续发布保留绑定；模型使用 `@cf/zai-org/glm-4.7-flash`，通过原生 `AI` binding 调用，前端没有 API 密钥。

```bash
npm run check:npc-ai
npm run deploy:npc-ai
```

`check:npc-ai` 先创建输出目录，再将 Wrangler 类型生成到忽略提交的 `artifacts/npc-ai-env.d.ts`，并用独立 tsconfig 检查 Worker。GitHub Actions 同步执行此检查，但只部署静态站；Worker 和 Cloudflare Pages 分别发布。更换对话地址时可在构建环境配置 `VITE_NPC_AI_URL`，默认域名、模型、前后端超时、消息和历史长度、输出参数集中在 `src/setting.ts`，镇民换代年限及百年城景间隔也在该文件。域名绑定、CORS 和边缘限流在 Worker 的 `wrangler.jsonc`。

服务端按 `Origin` 完整匹配公网来源：`https://qinglan-xiuxian.pages.dev`、`https://chenxuan520.github.io`。本地另允许 `localhost`、`127.0.0.1`、`[::1]` 的 HTTP / HTTPS 任意合法端口（含默认端口），不用逐个加入白名单。拒绝其他 Pages / GitHub 站点、后缀相似域名、混入路径或凭据的来源、多个来源、`null` 或缺失来源。所有路由（包括 `/health` 与预检）先校验来源，不通过时返回空的 403，不读取请求体、不调用 AI，也不返回 CORS 放行头。白名单配置空项不会放行无来源请求。部署新的游戏域名时同步更新 `ALLOWED_ORIGINS`；浏览器自动携带来源，手动健康检查也需带允许的 `Origin`。来源检查用于限制其他网页调用，非浏览器脚本可伪造该请求头，不能替代限流或身份认证。请求体最多 8 KB，玩家消息最多 200 字，历史最多六条；按来源 IP 每 60 秒允许 12 次请求，限流是边缘节点级保护，不是登录认证。普通闲谈的模型输出最多 512 tokens，关闭深度思考以保证短对白响应，只展示最终回答，Worker 超时 12 秒，客户端 14 秒；任何失败均回退本地台词。关闭对话会取消客户端请求，返回的文本用 DOM 文本节点展示，不能执行 HTML 或修改游戏存档。

茶馆听书复用 `POST /chat`，请求带 `mode: "tea-story"`，仅接受 `npcId: "tea"` 和空历史；与闲谈共用来源检查和每 IP 限流。`TEA_STORY_SETTINGS` 单独设置 1400 tokens、900 字上限、服务端 20 秒 / 客户端 22 秒超时，提示生成 320–500 字的完整修仙故事；超长、截断或失败返回不展示故事，前端提示暂歇。正文以 `textContent` 展示，不写入存档，不控制奖励；原有听书委托仍半载后判定 30% 概率获赠 8 灵石，AI 失败也照常结算。

`src/story-speech.ts` 使用浏览器 `speechSynthesis`，优先设备本地的简体中文声音，需点击才朗读。遵循存档音量；静音或零音量时按钮明确提示开启声音，点击后才启用（零音量恢复为 60%）。不支持 API、无中文声音或播放失败时保留文字。关闭或替换面板会取消请求、停止朗读，并忽略迟到响应；故事弹窗期间沿用城镇暂停计龄规则，关闭后继续委托。没有新增音频资源或语音后端。

镇民用保存的种子与角色总年岁确定姓名及代际，换代间隔 50–70 年。直接计算当代人物，长时间闭关不逐代循环；场景仅在换代节点更新人物标签与配色，不重建地图。聊天只保留在当前页面内存中，各人物独立，换代后交谈不继承前任聊天。服务端无聊天存储，只记录不含正文的异常事件。

`src/town-history.ts` 管理百年城景。存档 `mortal.scenery` 保存 `lastVisitAge` 与 `revision`，仅真正点击入城时比较角色年岁；满 100 年则递增一次城景版本。布局由人口种子和版本确定，旧档首次入城记录版本 0，不追溯改城。道路与港口固定，沿街房屋及店铺迁位、三处非营业宅地变空院；NPC、近邻交谈和小地图使用同一份布局。重绘与加载重试不推进版本，所有素材复用原 WebP 图集。

`src/town-crowd.ts` 生成有上限的沿街人流与店前顾客，复用九人格 WebP 图集，不进入具名人口和 AI 对话列表，保持旧镇民姓名稳定。人流按场景时间运动，暂停与减少动态效果时停止，静止镜头常态按 30 次/秒更新，镜头移动时同步更新可视范围，屏幕外隐藏；店前顾客基于当次城景的真实建筑坐标生成。

`src/town-story.ts` 管理《炉火未凉》的固定三章和分支，`mortal.smithStory` 只保存相识年岁 / 代际、帮助方式、旧钟去向和完成标记。人物姓名由原人口种子派生，沿用换代节点，不生成历史人物列表。按钮事件统一校验可选动作、扣除玄铁或一次性发奖后立即存档；AI 只接收经过校验的故事状态，由 Worker 生成事实提示，不具备写入故事或发奖的能力。故事变化会重置相关闲谈上下文，避免旧对白覆盖新的选择。

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

使用 TypeScript、Canvas 2D 与 Vite，不依赖运行时游戏框架。战斗和存档在本地运行，NPC 闲谈使用可失败回退的独立 Worker。开发模式提供 `window.__qinglan` 以验证场景，生产构建会移除该入口。中文字体优先使用 Noto Serif SC，加载失败时回退到系统宋体。

图片为本项目通过内置 imagegen 工具生成，运行素材统一压缩为 WebP，保留原尺寸和透明边缘，不携带未压缩 PNG。秘境只预载当前地图、本境敌人和首领以及法宝图集；城镇地图及九职业 NPC 按进入场景加载。预加载显示进度条，全部就绪才开放场景，失败提供重试。背景音乐为本项目原创编曲并离线合成，已保存于 `public/assets/`。生成方法见 [素材说明](assets.md)，测试范围与限制见 [验证记录](verification.md)，开发及部署约定见 [AGENTS.md](../AGENTS.md)。

## 开发时保护正在运行的游戏

当前按用户要求直接在 master 迭代，5173 使用生产预览。有人正在游玩时，不重启或热刷新游玩服务；先构建到临时目录，发布时先补齐资源、保留旧 hash 文件，最后原子替换入口 HTML。不要直接清理正在服务的 dist。新增素材必须先落盘、检查所有路径可加载，再接入资源清单，并通过 Chrome DevTools MCP 验证。不同端口的 localStorage 相互隔离，测试端口不会继承游玩端口存档。

`src/chronicle.ts` 管理有上限的此世年表和独立成就，修为增长统一经 `gainCultivation()` 记录跨境年岁，结算通关后再记录真仙突破；旧档用未知年龄补录，不生成虚构时间。`src/chronicle-ui.ts` 复用弹窗并转义存档文本。`src/spirit-power.ts` 通过隔离的一级入场预览复用实际战斗属性，只在首页或履历打开时计算，不加入帧循环。

宗门欠费以成员账期已到为待补缴状态，不依赖临时弹窗或额外墙钟。`advanceMortal()` 停在欠费节点，`settleSectDues()` 负责补缴或放弃清退；广告复用原物资奖励，未领取不发奖。与精研同刻到期的零剩余活动可存档，补缴后结算，放弃时取消。
