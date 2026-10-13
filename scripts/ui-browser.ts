// 界面回归只通过 Chrome DevTools MCP 操作浏览器，工具依赖与游戏依赖分开安装。
import { existsSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

interface UiBrowserOptions {
  workspace?: string;
  timeoutMs?: number;
}

function chromePath(): string {
  const candidates = process.env.CHROME_PATH
    ? [process.env.CHROME_PATH]
    : [
        '/usr/bin/google-chrome',
        '/usr/bin/google-chrome-stable',
        '/usr/bin/chromium',
        '/usr/bin/chromium-browser',
      ];
  const path = candidates.find((candidate) => existsSync(candidate));
  if (!path) throw new Error('未找到 Chrome，请设置 CHROME_PATH 指向浏览器可执行文件');
  return path;
}

function assertLocalPage(url: unknown) {
  if (url === 'about:blank') return;
  if (typeof url !== 'string') throw new Error('界面回归需要明确指定本机页面 URL');
  const parsed = new URL(url);
  if (
    !['http:', 'https:'].includes(parsed.protocol) ||
    !['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname) ||
    parsed.username ||
    parsed.password
  )
    throw new Error('界面回归仅允许访问 localhost，禁止操作线上页面与存档');
}

export async function openUiBrowser(options: UiBrowserOptions = {}) {
  const toolsDirectory = process.env.MCP_TOOLS_DIR
    ? resolve(process.env.MCP_TOOLS_DIR)
    : fileURLToPath(new URL('./browser-tools/', import.meta.url));
  const requireTool = createRequire(join(toolsDirectory, 'package.json'));
  let sdkClient: string;
  let sdkTransport: string;
  let server: string;
  try {
    sdkClient = requireTool.resolve('@modelcontextprotocol/sdk/client/index.js');
    sdkTransport = requireTool.resolve('@modelcontextprotocol/sdk/client/stdio.js');
    server = join(
      dirname(requireTool.resolve('chrome-devtools-mcp')),
      'bin/chrome-devtools-mcp.js',
    );
  } catch {
    throw new Error('缺少界面回归工具，请先运行 npm ci --prefix scripts/browser-tools');
  }
  const [{ Client }, { StdioClientTransport }] = await Promise.all([
    import(pathToFileURL(sdkClient).href),
    import(pathToFileURL(sdkTransport).href),
  ]);
  const workspace = resolve(options.workspace ?? 'artifacts/ui-regression');
  mkdirSync(workspace, { recursive: true });
  const args = [
    server,
    '--headless',
    '--isolated',
    `--executablePath=${chromePath()}`,
    '--no-usage-statistics',
    '--no-performance-crux',
    `--workspace=${workspace}`,
  ];
  if (process.env.CI || process.getuid?.() === 0) args.push('--chromeArg=--no-sandbox');
  if (process.env.HTTPS_PROXY) args.push(`--proxyServer=${process.env.HTTPS_PROXY}`);
  const transport = new StdioClientTransport({
    command: process.execPath,
    args,
    stderr: 'pipe',
    env: { CHROME_DEVTOOLS_MCP_NO_UPDATE_CHECKS: '1' },
  });
  // 持续读取工具日志以免管道堵塞；不把可能含代理信息的诊断打印进公共 CI 日志。
  transport.stderr?.resume();
  const client = new Client({ name: 'qinglan-ui-regression', version: '1.0.0' });
  try {
    await client.connect(transport, { timeout: options.timeoutMs ?? 120_000 });
  } catch (error) {
    await transport.close();
    throw error;
  }
  return {
    async call(name: string, args: Record<string, unknown> = {}): Promise<string> {
      if (name === 'new_page' || (name === 'navigate_page' && args.url !== undefined))
        assertLocalPage(args.url);
      const result = await client.callTool(
        {
          name,
          arguments: name === 'new_page' ? { isolatedContext: 'ui-regression', ...args } : args,
        },
        undefined,
        { timeout: options.timeoutMs ?? 120_000 },
      );
      const text = (result.content ?? [])
        .filter((entry: { type: string }) => entry.type === 'text')
        .map((entry: { text: string }) => entry.text)
        .join('\n');
      if (result.isError) throw new Error(`${name}: ${text}`);
      return text;
    },
    close: () => client.close(),
  };
}
