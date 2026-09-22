# 开发与部署

[返回项目首页](../README.md)

唯一官网是 [xiuxian.011203.xyz](https://xiuxian.011203.xyz/)，由 Cloudflare Pages 托管。README 和仓库网站栏只使用官网域名；平台域名仅供部署检查。发布新版本时须同步 Cloudflare；仅推送 GitHub 不会更新官网。

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

官网：[叩仙门：青岚纪](https://xiuxian.011203.xyz/)。

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

服务端按 `Origin` 完整匹配公网来源：`https://xiuxian.011203.xyz`、`https://chenxuan520.github.io`。本地另允许 `localhost`、`127.0.0.1`、`[::1]` 的 HTTP / HTTPS 任意合法端口（含默认端口），不用逐个加入白名单。拒绝其他 Pages / GitHub 站点、后缀相似域名、混入路径或凭据的来源、多个来源、`null` 或缺失来源。所有路由（包括 `/health` 与预检）先校验来源，不通过时返回空的 403，不读取请求体、不调用 AI，也不返回 CORS 放行头。白名单配置空项不会放行无来源请求。部署新的游戏域名时同步更新 `ALLOWED_ORIGINS`；浏览器自动携带来源，手动健康检查也需带允许的 `Origin`。来源检查用于限制其他网页调用，非浏览器脚本可伪造该请求头，不能替代限流或身份认证。请求体最多 8 KB，玩家消息最多 200 字，历史最多六条；按来源 IP 每 60 秒允许 12 次请求，限流是边缘节点级保护，不是登录认证。普通闲谈的模型输出最多 512 tokens，关闭深度思考以保证短对白响应，只展示最终回答，Worker 超时 12 秒，客户端 14 秒；任何失败均回退本地台词。关闭对话会取消客户端请求，返回的文本用 DOM 文本节点展示，不能执行 HTML 或修改游戏存档。

茶馆听书复用 `POST /chat`，请求带 `mode: "tea-story"`，仅接受 `npcId: "tea"` 和空历史；与闲谈共用来源检查和每 IP 限流。`TEA_STORY_SETTINGS` 单独设置 1400 tokens、900 字上限、服务端 20 秒 / 客户端 22 秒超时，提示生成 320–500 字的完整修仙故事；超长、截断或失败返回不展示故事，前端提示暂歇。正文以 `textContent` 展示，不写入存档，不控制奖励；点击听书时直接增加半载年岁并判定 30% 概率获赠 8 灵石，再异步生成故事；AI 失败不影响已结算收益。

`src/story-speech.ts` 使用浏览器 `speechSynthesis`，优先设备本地的简体中文声音，需点击才朗读。遵循存档音量；静音或零音量时按钮明确提示开启声音，点击后才启用（零音量恢复为 60%）。不支持 API、无中文声音或播放失败时保留文字。关闭或替换面板会取消请求、停止朗读，并忽略迟到响应；故事弹窗期间沿用城镇暂停计龄规则，不再等待委托计时。没有新增音频资源或语音后端。

镇民用保存的种子与角色总年岁确定姓名及代际，换代间隔 50–70 年。直接计算当代人物，长时间闭关不逐代循环；场景仅在换代节点更新人物标签与配色，不重建地图。聊天只保留在当前页面内存中，各人物独立，换代后交谈不继承前任聊天。服务端无聊天存储，只记录不含正文的异常事件。

`src/town-history.ts` 管理百年城景。存档 `mortal.scenery` 保留 `lastVisitAge` 与 `revision`，新增可选的固定年岁基准 `since`。`townVisit()` 每次真正入城更新 `lastVisitAge`；新档以首次入城年岁初始化 `since`，缺少该字段的旧档以已保存的 `lastVisitAge` 初始化，没有城景记录时才以本次入城年岁为基准。后续入城不重置 `since`，`townSceneryLayout()` 按 `floor((lastVisitAge - since) / 100)` 直接计算当前阶段，频繁回城也会累计推进；长别不逐年循环。旧 `revision` 保留作房舍分配基底，不再每百年递增或让全镇迁位。

每百年只推进一批房舍陈旧或翻修；最多三处没有功能 NPC 的街边旧址会歇用成空院，后来重新成为铺面，必需商铺不关闭、不随年岁搬家。同一镇的地标与道路在岁月变化中保持稳定；本轮 `src/town.ts` 将整体布局改为折转主街、错落支巷与宽窄街口，以矩形分段实现，因此保留旧 `revision` 不代表旧版本所有历史坐标完全不变。NPC、近邻交谈和小地图使用同一份布局。重绘与加载重试不更新入城记录或累计基准，所有素材复用原 WebP 图集，陈旧与翻修使用 CSS 色调，不新增图片。

`src/main.ts` 在实际入城时调用 `townReturnMemory()`，比较上次实际看过的布局与本次布局，只选最多两条可见变化；`src/town-scene.ts` 待入城素材就绪后显示文字提示，不强制弹窗。返乡文字沿用 `mortal.events` 最近六条人间见闻，首次入城、同阶段或没有可见差异时不生成记录；长别只描述两次布局的差异，不虚构错过的中间事件。千年仙人奇遇仍使用更新前的 `lastVisitAge` 判断距上次实际入城是否满 1000 年，不与 `since` 混用。镇民 50–70 年换代、人间计龄、供奉、寿尽与天劫、资源结算和 AI 协议均不改变。新版普通聊天请求不发送旧版迁城标记 `townRevision`，沿用服务端中性街景描述。

`src/town-crowd.ts` 生成有上限的沿街人流与店前顾客，复用九人格 WebP 图集，不进入具名人口和 AI 对话列表，保持旧镇民姓名稳定。人流按场景时间运动，暂停与减少动态效果时停止，静止镜头常态按 30 次/秒更新，镜头移动时同步更新可视范围，屏幕外隐藏；店前顾客基于当次城景的真实建筑坐标生成。

`src/town-story.ts` 管理《炉火未凉》的固定三章和分支，`mortal.smithStory` 只保存相识年岁 / 代际、帮助方式、旧钟去向和完成标记。人物姓名由原人口种子派生，沿用换代节点，不生成历史人物列表。按钮事件统一校验可选动作、扣除玄铁或一次性发奖后立即存档；AI 只接收经过校验的故事状态，由 Worker 生成事实提示，不具备写入故事或发奖的能力。故事变化会重置相关闲谈上下文，避免旧对白覆盖新的选择。人间缘簿旧信仅在点击「游历人间」进入入口时检查：存在尚未展示的未读旧信就自动弹出现有卡片列表，不新增书信入口或系统，打开列表不标 `read`，点击展读才按原逻辑标读。页面 session 内的 `Set` 按信件标识记录已展示项，实际打开列表后才记录；关闭或重进不重复，新来信可再触发，刷新开启新会话，轮回清空 `Set`。寿尽、天劫与宗门欠费弹窗优先，不抢占它们，也不在战斗或镇中触发。

## GitHub Pages · 平台部署

平台部署地址：`https://chenxuan520.github.io/qinglan-xiuxian/`，不作为对外游玩入口。

`.github/workflows/pages.yml` 在推送到 `master` 时执行格式检查、测试与生产构建，再部署到 GitHub Pages，也支持在 Actions 页面手动运行。仓库 Settings → Pages 的发布来源需设为 **GitHub Actions**；私有仓库需要支持 Pages 的 GitHub 套餐。

构建会使用 Pages 提供的子目录路径，地图、人物、法宝图标和后台计时 Worker 均支持仓库地址下访问。本地 `npm run dev` 与默认构建继续使用根路径。

GitHub Pages 和 localhost 是不同来源，浏览器存档各自独立，不会自动同步。

## GitHub Release · 离线版

推送 `v*` 标签会触发 `.github/workflows/release.yml`。流水线依次执行格式检查、全量测试、Worker 类型检查和生产构建，然后创建 GitHub Release，并附带离线包及 SHA-256 校验文件。

```bash
git tag v0.0.1
git push origin v0.0.1
```

离线包只包含生产构建后的静态文件，不包含后端。解压后在该目录启动任意 HTTP 静态服务器并打开其本地地址；不要直接双击 `index.html`。战斗、成长、城镇、图片、音乐和本地存档可断网运行；NPC AI 闲谈与茶馆故事仍需联网，普通闲谈失败时使用本地对白。

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

`src/chronicle.ts` 管理有上限的此世年表和独立成就，修为增长统一经 `gainCultivation()` 记录跨境年岁，结算通关后再记录真仙突破；旧档用未知年龄补录，不生成虚构时间。`src/chronicle-ui.ts` 复用弹窗并转义存档文本。`src/spirit-power.ts` 通过隔离的一级入场预览复用实际战斗属性，只在首页或履历打开时计算，不加入帧循环。新增 `Game.elapsedYears` 从 0 累计正常历练每次推进的 `save.age` 实际增量并随对局保存；暂停、选技、后台未模拟时间及独立天劫不计，寿尽或天劫截停只累计到实际边界。旧续局缺少该字段时保持 unknown（`undefined`），不从迁移后的战斗秒数反推，也不把后续增量当作完整本局年岁。仅首次正常历练结算后直接返回首页时，复用顶部 toast 约 3 秒显示「山中一程，人间已过 X 年。」，X 取该累计值；unknown 不补提示，直接下一局不强插首页。

`src/journey-card.ts` 仅在点击履历底部、寿终 / 天劫殒命页或终章顶部「留存此世」时通过动态 `import()` 加载，复用现有山水、玩家与法宝图集，在本地生成 1080 × 1440 PNG 纪念图，不新增游戏图片或存档备份格式；叩入仙门使用与终章一致的晨光山水，其余状态使用暮色山水。内容取当前境界、行年 / 寿限、五行命盘、本命法宝、路线、宗门身份及最多四项真实存档记录，以两列两行展示；已达成成就按难度由高到低排列，并排在六仙同御和渡劫次数之前，不补造旧档历史。人物周围的色彩与法阵按当前境界变化，并按状态标「仙途未尽」「此世寿终」「止于天劫」或「已叩入仙门」。寿尽或天劫失败并确认放弃后，先保留原本世数据进入落幕页，由玩家自行留影后再确认轮回。`uqr` 是仅用于二维码生成的运行依赖，`jsqr` 仅作测试解码、不进生产包；二维码和卡片网址统一读取 `src/setting.ts` 的 `GAME_SITE_URL`，使用米金底与墨绿码，保留四格浅色静区并以整数像素绘制，不含存档、身份或追踪参数。修改官网配置后重新构建，部署域名绑定和 Worker CORS 白名单仍需独立维护。弹窗提供预览、下载及手机长按保存，关闭返回原履历、落幕页或终章，不改变此世状态；不上传图片或存档，不加奖励、账号、排行榜或新菜单。

宗门欠费以成员账期已到为待补缴状态，不依赖临时弹窗或额外墙钟。`advanceMortal()` 停在欠费节点，`settleSectDues()` 负责补缴或放弃清退；广告复用原物资奖励，未领取不发奖。与精研同刻到期的零剩余活动可存档，补缴后结算，放弃时取消。

`src/hometown.ts` 管理此世故乡状态，父母按 `save.age` 推导年岁与生死，不加入普通镇民换代名单。旧档本世不补家庭，轮回重新生成并保留 `hometownSeen` 跳过步行资格；发现家书与展读分开记录。`townDockPath()` 只在点击导航时计算路径，移动沿用当前城景碰撞，手动操作接管，到渡口后仍需确认离乡。

`src/image-share.ts` 使用 Web Share 文件接口：预览时准备 PNG File，点击后立即调用系统面板，避免异步转换丢失用户激活；取消不下载，不支持或失败时降级保存。生成图片不上传存档，分享仅按用户选择把图片交给系统应用，预览关闭后不触发迟到下载。
