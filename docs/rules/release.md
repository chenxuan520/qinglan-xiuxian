# 本机预览与发布流程

> 需要更新本机 5173 预览、发布 GitHub Pages 或 Cloudflare 主站时通读。本文件由 AGENTS.md 拆出，条文为用户已确认的约定，修改须经用户同意。

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
- 文档一致性门禁 `npm run docs:check` 对照真实规则函数核对丹药表、灵根、秘境倍率、妖王时序与修为、累计门槛、本命、低重伤害、宗门费用与赠药、修习年岁和炼器加成，并复查全部帮助分类与妖物志。修改规则或增添表格时须补充对应检查，不以更新手填期望值、快照或删除检查来放行。文案语义与实际行为的人工核对要求统一见 [REVIEW.md](../../REVIEW.md)。独立 Quality job 在每次 push / PR 执行，失败标红；部署流程不混入这些测试。
- `.github/workflows/pages.yml` 在 push `master` 后只按仓库子路径构建、校验18MB产物上限、恢复已有报告并发布，不运行单元/浏览器/平衡测试，不等待其他测试门禁；也支持手动触发。单元测试、格式/Worker类型、界面回归在独立 `checks.yml`，平衡在 `balance.yml`，二进制在 `binaries.yml`，发布和全量平衡不重复运行单测。仓库 Pages 来源为 GitHub Actions。
- 经用户授权提交后，`git push origin master`，再用 `gh run list` / `gh run view <run-id>` 检查这次提交的 GitHub Pages 与 Cloudflare 两个部署结果。发布后用 MCP 确认新入口、资源与关键交互，不能只以 push 成功作为发布完成。

## Cloudflare Pages 发布（主站）

- 项目名 `qinglan-xiuxian`，生产分支 `master`，唯一官网 <https://xiuxian.011203.xyz/>。所有面向玩家的链接只使用官网域名。NPC Worker 的 `ALLOWED_ORIGINS` 必须包含官网来源，域名变更需同步配置并验证浏览器预检和实际对话。
- `wrangler.jsonc` 管理配置；独立构建目录为 `artifacts/cloudflare`，使用根路径 `/`，不会覆盖本机 `dist`。
- **默认自动发布（2026-10-29 起）**：仓库 Actions Secret 已配置 `CLOUDFLARE_API_TOKEN`（Pages 编辑权限）。push `master` 后 `.github/workflows/cloudflare.yml`（「Deploy to Cloudflare Pages」）自动执行 `npm run deploy:cloudflare`，与 GitHub Pages 发布并行、互不等待；也可在 Actions 页手动 Run workflow 或 `gh workflow run cloudflare.yml --ref master` 重发。agent 发布时只需经授权 push，无需索要或持有令牌。
- 推送后用 `gh run list --workflow cloudflare.yml --limit 1` / `gh run view <run-id>` 确认该提交的 Cloudflare 运行成功，再用 MCP 检查正式域名的新版本、素材及关键功能；不能只以 push 或 GitHub Pages 成功作为上线完成。
- Secret 被删除或失效时工作流跳过（显示成功但部署步骤为 skipped）或在上传步骤失败，此时请用户到仓库 Settings → Secrets and variables → Actions 更新令牌。临时手动发布可在本机设置环境变量 `CLOUDFLARE_API_TOKEN` 或 `npx wrangler login` 后执行下列命令；不得把令牌写入仓库、日志或文档。已有项目无需重新创建。

```bash
npm run deploy:cloudflare
npx wrangler pages deployment list --project-name qinglan-xiuxian --json
```

发布命令只含类型检查、构建、宣传视频恢复和 Wrangler 上传；Balance gate 等门禁在 GitHub CI 每次 push 时已跑，不在部署链路里重复。

localhost、GitHub Pages、Cloudflare 各网址的存档相互独立。迁移使用设置「此世存档」中的「导出此世 / 导入旧档」，不要暗中复制用户浏览器数据。
