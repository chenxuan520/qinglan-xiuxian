import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { existsSync, readdirSync } from 'node:fs';
import { PassThrough, Writable } from 'node:stream';
import { analyzeEvidence, responseByteLimit } from '../../../scripts/observer/observe-analysis.ts';
import type { AnalysisOptions } from '../../../scripts/observer/observe-analysis.ts';
import type {
  AnalysisConfig,
  AnalysisDiagnostics,
  AnalysisInput,
} from '../../../scripts/observer/observe-types.ts';

const key = 'observer-fixture-secret-TEST-only';
const config: AnalysisConfig = {
  engine: 'openai',
  model: 'gpt-6-luna',
  protocol: 'decisions',
  baseUrl: 'https://api.example.invalid/v1',
  apiKeyEnv: 'OBSERVER_API_KEY',
  timeoutMs: 1000,
  maxInputChars: 12000,
  maxOutputTokens: 1024,
};
function evidence(): AnalysisInput {
  return {
    at: '2026-11-05T12:00:00.000Z',
    signals: [
      {
        id: 'balance:failed',
        sourceId: 'balance',
        severity: 'critical',
        title: '完整日报失败',
        detail: '规则已确认存在 2 项错误',
        evidenceIds: ['balance'],
        immediate: true,
      },
      {
        id: 'performance:latency',
        sourceId: 'performance',
        severity: 'warning',
        title: '延迟升高',
        detail: '同口径延迟 40 ms',
        evidenceIds: ['performance'],
      },
    ],
    evidence: [
      { id: 'balance', text: '版本 abc123；10080 条，Error=2，passed=false' },
      { id: 'performance', text: '同版本窗口；sampleSize=200，latency=40 ms' },
    ],
  };
}
function wire(probabilities = [0.95, 0.5]) {
  return {
    model: 'gpt-6-luna',
    answers: evidence().signals.map((signal, index) => ({
      type: 'predicate',
      name: signal.id,
      probability: probabilities[index],
    })),
    usage: { input_tokens: 100, output_tokens: 20 },
  };
}
function http(body: unknown, options: Partial<AnalysisOptions> = {}) {
  const calls: { url: string; init: RequestInit; body: Record<string, unknown> }[] = [];
  const requestFetch: typeof globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init: init!, body: JSON.parse(String(init!.body)) });
    return body instanceof Response ? body : new Response(JSON.stringify(body));
  };
  return { calls, options: { env: { OBSERVER_API_KEY: key }, fetch: requestFetch, ...options } };
}

test('none和无信号不调用服务；缺少key明确unavailable，不取其他secret', async () => {
  let calls = 0;
  const options = {
    env: {},
    fetch: async () => {
      calls++;
      throw new Error();
    },
  };
  const none = await analyzeEvidence(evidence(), { ...config, engine: 'none' }, options);
  assert.equal(none.status, 'skipped');
  const empty = await analyzeEvidence({ ...evidence(), signals: [] }, config, options);
  assert.equal(empty.status, 'skipped');
  const missing = await analyzeEvidence(evidence(), config, options);
  assert.equal(missing.status, 'unavailable');
  assert.match(missing.error!, /未配置/);
  assert.equal(calls, 0);
});

const pastedKey = 'only-fake-pasted-credential-ABC123';
const pastedKeys = [
  ['原样', pastedKey],
  ['外空白', ` \t\r\n${pastedKey}\n `],
  ['ASCII双引号', `"${pastedKey}"`],
  ['ASCII单引号', `'${pastedKey}'`],
  ['中文双引号', `“${pastedKey}”`],
  ['中文单引号', `‘${pastedKey}’`],
  ['内外空白', ` \t“ \n${pastedKey}\t ”\r\n `],
  ['全角外空白', `\u3000' ${pastedKey} '\u3000`],
] as const;

for (const [name, rawKey] of pastedKeys) {
  test(`粘贴凭据${name}仅清理指定外包装，真实Headers可构造且raw/清理后值均脱敏`, async () => {
    const input = evidence();
    input.evidence[0].text += ` raw=${rawKey} clean=${pastedKey}`;
    const mock = http(wire(), { env: { OBSERVER_API_KEY: rawKey } });
    const output = await analyzeEvidence(input, config, mock.options);
    assert.equal(output.status, 'complete');
    assert.equal(mock.calls.length, 1);
    assert.ok(mock.calls[0].init.headers instanceof Headers);
    const request = new Request(mock.calls[0].url, mock.calls[0].init);
    assert.equal(request.headers.get('authorization'), `Bearer ${pastedKey}`);
    for (const text of [JSON.stringify(mock.calls[0].body), JSON.stringify(output)]) {
      assert.ok(!text.includes(pastedKey));
      assert.ok(!text.includes(rawKey));
    }
  });
}

for (const [name, rawKey, reason] of [
  ['未匹配ASCII前引号', `"${pastedKey}`, 'unmatched-wrapper'],
  ['未匹配ASCII后引号', `${pastedKey}'`, 'unmatched-wrapper'],
  ['未匹配中文引号', `‘${pastedKey}”`, 'unmatched-wrapper'],
  ['反向中文引号', `”${pastedKey}“`, 'unmatched-wrapper'],
  ['嵌套包装不递归修复', `"‘${pastedKey}’"`, 'quote'],
  ['内部Unicode', `“${pastedKey}中”`, 'non-ascii'],
  ['内部Latin1', `${pastedKey}é`, 'non-ascii'],
  ['内部零宽', `${pastedKey.slice(0, 6)}\u200b${pastedKey.slice(6)}`, 'non-ascii'],
  ['内部CRLF', `${pastedKey.slice(0, 6)}\r\n${pastedKey.slice(6)}`, 'internal-whitespace'],
  ['内部LF', `'${pastedKey}\nsecond'`, 'internal-whitespace'],
  ['内部tab', `${pastedKey}\tsecond`, 'internal-whitespace'],
  ['内部空格', `${pastedKey} second`, 'internal-whitespace'],
  ['内部引号', `${pastedKey.slice(0, 6)}"${pastedKey.slice(6)}`, 'quote'],
  ['内部NUL', `${pastedKey}\0`, 'non-ascii'],
  ['仅匹配引号', '“ ”', 'empty'],
  ['仅空白', ' \t\r\n ', 'empty'],
] as const) {
  test(`非法凭据${name}明确配置错误且不发送/不启动Pi，不泄露任何凭据细节`, async () => {
    for (const engine of ['openai', 'pi'] as const) {
      let calls = 0;
      const output = await analyzeEvidence(
        evidence(),
        { ...config, engine },
        {
          env: { OBSERVER_API_KEY: rawKey },
          fetch: async () => {
            calls++;
            throw new Error('must not send');
          },
          spawn: (() => {
            calls++;
            throw new Error('must not spawn');
          }) as NonNullable<AnalysisOptions['spawn']>,
        },
      );
      assert.equal(calls, 0);
      assert.equal(output.status, 'failed');
      assert.equal(output.error, 'AI API key 配置格式无效，请重新配置');
      assert.equal(output.diagnostics?.stage, 'setup');
      assert.equal(output.diagnostics?.keyFormatReason, reason);
      assert.equal(output.diagnostics?.httpStatus, undefined);
      const text = JSON.stringify(output);
      assert.ok(!text.includes(pastedKey));
      assert.ok(!text.includes(rawKey));
      assert.doesNotMatch(text, /ByteString|code point|character|must not send|must not spawn/);
    }
  });
}

test('粘贴包装凭据在诊断endpoint的编码路径中也同时脱敏raw和清理后的值', async () => {
  const rawKey = ` “${pastedKey}” `;
  const selected = {
    ...config,
    baseUrl: `https://api.example.invalid/v1/${encodeURIComponent(rawKey)}/${pastedKey}`,
  };
  const output = await analyzeEvidence(
    evidence(),
    selected,
    http(wire(), { env: { OBSERVER_API_KEY: rawKey } }).options,
  );
  assert.equal(output.status, 'complete');
  assert.equal(output.diagnostics?.endpoint?.path, '/v1/[已脱敏]/[已脱敏]/decisions');
  assert.ok(!JSON.stringify(output).includes(pastedKey));
});

test('清理后的凭据仍可能被服务端拒绝，错误不泄露raw/清理后的key或响应原文', async () => {
  const rawKey = ` “${pastedKey}” `;
  const response = new Response(`private ${rawKey} ${pastedKey}`, { status: 401 });
  response.text = async () => {
    throw new Error('must not read private response');
  };
  const mock = http(response, { env: { OBSERVER_API_KEY: rawKey } });
  const output = await analyzeEvidence(evidence(), config, mock.options);
  assert.equal(mock.calls.length, 1);
  assert.equal(new Headers(mock.calls[0].init.headers).get('authorization'), `Bearer ${pastedKey}`);
  assert.match(output.error!, /401\/403/);
  assert.equal(output.diagnostics?.httpStatus, 401);
  assert.ok(!JSON.stringify(output).includes(pastedKey));
  assert.ok(!JSON.stringify(output).includes(rawKey));
  assert.doesNotMatch(JSON.stringify(output), /private|must not read/);
});

test('Decisions按官方predicate请求，只发归一化证据，中文说明来自证据且保留全部硬告警', async () => {
  const input = evidence();
  const before = structuredClone(input);
  const mock = http(wire([0.01, 0.99]));
  const output = await analyzeEvidence(input, config, mock.options);
  assert.equal(output.status, 'complete');
  assert.equal(output.engine, 'openai');
  assert.equal(output.model, 'gpt-6-luna');
  assert.deepEqual(output.usage, { inputTokens: 100, outputTokens: 20 });
  assert.equal(output.findings.length, 2);
  assert.equal(output.findings[0].signalId, 'balance:failed');
  assert.match(output.findings[0].explanation, /支持不足/);
  assert.match(output.findings[0].explanation, /10080 条，Error=2，passed=false/);
  assert.match(output.findings[0].nextSteps.join(''), /保留现有硬失败/);
  assert.match(output.findings[1].explanation, /证据支持/);
  assert.match(output.summary, /1 个原有严重告警保持/);
  assert.deepEqual(input, before);
  assert.equal(mock.calls.length, 1);
  const call = mock.calls[0];
  assert.equal(call.url, 'https://api.example.invalid/v1/decisions');
  assert.equal(call.init.redirect, 'manual');
  assert.equal(new Headers(call.init.headers).get('authorization'), `Bearer ${key}`);
  assert.equal(call.body.model, 'gpt-6-luna');
  assert.equal('max_output_tokens' in call.body, false);
  assert.deepEqual(
    (call.body.questions as { name: string }[]).map((question) => question.name),
    input.signals.map((signal) => signal.id),
  );
  assert.ok(
    (call.body.questions as { type: string }[]).every((question) => question.type === 'predicate'),
  );
  assert.ok(!JSON.stringify(call.body).includes(key));
});

test('模型输入和本地解释脱敏key、Bearer、token、邮箱、链接凭据及query，忽略未知原始字段', async () => {
  const input = evidence();
  const secrets = [
    key,
    'bearer-secret-value',
    'query-secret-value',
    'json-secret-value',
    'url-user',
    'url-password',
    'private@example.com',
    'sk-test12345678',
  ];
  input.evidence[0].text +=
    ` ${key} Bearer bearer-secret-value token="json-secret-value" ` +
    'private@example.com sk-test12345678 https://url-user:url-password@example.com/report?token=query-secret-value#secret';
  Object.assign(input, { personalSave: 'private-save-must-not-send' });
  Object.assign(input.signals[0], { rawHeaders: 'private-header-must-not-send' });
  const response = { ...wire(), explanation: key, token: 'raw-response-must-not-display' };
  const mock = http(response);
  const output = await analyzeEvidence(input, config, mock.options);
  assert.equal(output.status, 'complete');
  const sent = JSON.stringify(mock.calls[0].body);
  const shown = JSON.stringify(output);
  for (const secret of secrets) {
    assert.ok(!sent.includes(secret), secret);
    assert.ok(!shown.includes(secret), secret);
  }
  assert.ok(!sent.includes('private-save-must-not-send'));
  assert.ok(!sent.includes('private-header-must-not-send'));
  assert.ok(!shown.includes('raw-response-must-not-display'));
  assert.match(sent, /已脱敏/);
});

for (const failure of ['unknown', 'duplicate', 'omitted', 'refusal', 'invalid-probability']) {
  test(`Decisions ${failure}答案失败，不能部分成功或漏掉确定硬错误`, async () => {
    const body = wire();
    if (failure === 'unknown') body.answers[0].name = 'unknown:signal';
    if (failure === 'duplicate') body.answers[1].name = body.answers[0].name;
    if (failure === 'omitted') body.answers.pop();
    if (failure === 'refusal') body.answers[0].type = 'refusal';
    if (failure === 'invalid-probability') body.answers[0].probability = 1.5;
    const mock = http(body);
    const output = await analyzeEvidence(evidence(), config, mock.options);
    assert.equal(output.status, 'failed');
    assert.deepEqual(output.findings, []);
    assert.match(output.summary, /原有规则告警保持/);
    assert.equal(mock.calls.length, 1);
  });
}

test('输入超限或输出预算不足不截断证据、信号或发送部分请求', async () => {
  const input = evidence();
  input.evidence[0].text = 'x'.repeat(config.maxInputChars + 1);
  const mock = http(wire());
  const oversized = await analyzeEvidence(input, config, mock.options);
  assert.equal(oversized.status, 'failed');
  assert.match(oversized.error!, /未截断/);
  const budget = await analyzeEvidence(
    evidence(),
    { ...config, maxOutputTokens: 64 },
    mock.options,
  );
  assert.equal(budget.status, 'failed');
  assert.match(budget.error!, /输出预算不足/);
  assert.equal(mock.calls.length, 0);
});

test('响应字节数和实际usage超限、坏JSON或UTF-8均失败', async () => {
  for (const body of [
    new Response('x'.repeat(responseByteLimit(config.maxOutputTokens) + 1)),
    new Response('{}', { headers: { 'content-length': '999999999' } }),
    { ...wire(), usage: { input_tokens: 100, output_tokens: config.maxOutputTokens + 1 } },
    new Response('{'),
    new Response(Buffer.from([0xc3, 0x28])),
  ]) {
    const output = await analyzeEvidence(evidence(), config, http(body).options);
    assert.equal(output.status, 'failed');
    assert.deepEqual(output.findings, []);
  }
});

test('401/403不读取或显示原始错误，不重试，不回退模型', async () => {
  for (const status of [401, 403]) {
    let cancelled = 0;
    const body = new ReadableStream({
      cancel() {
        cancelled++;
      },
    });
    const response = new Response(body, { status });
    response.text = async () => {
      throw new Error(`must not read ${key}`);
    };
    const mock = http(response);
    const output = await analyzeEvidence(evidence(), config, mock.options);
    assert.equal(output.status, 'failed');
    assert.match(output.error!, /401\/403/);
    assert.ok(!JSON.stringify(output).includes(key));
    assert.equal(mock.calls.length, 1);
    assert.equal(mock.calls[0].body.model, 'gpt-6-luna');
    assert.equal(cancelled, 1);
  }
});

test('重定向拒绝且不跟随，网络异常文本不泄漏', async () => {
  const mock = http(
    new Response(null, { status: 302, headers: { location: 'https://elsewhere.invalid' } }),
  );
  const redirected = await analyzeEvidence(evidence(), config, mock.options);
  assert.equal(redirected.status, 'failed');
  assert.match(redirected.error!, /重定向/);
  assert.equal(mock.calls.length, 1);
  assert.equal(mock.calls[0].init.redirect, 'manual');
  assert.equal(redirected.diagnostics?.stage, 'response');
  assert.equal(redirected.diagnostics?.httpStatus, 302);
  const failed = await analyzeEvidence(evidence(), config, {
    env: { OBSERVER_API_KEY: key },
    fetch: async () => {
      throw new Error(`raw HTTP ${key}`);
    },
  });
  assert.equal(failed.status, 'failed');
  assert.ok(!JSON.stringify(failed).includes(key));
});

for (const code of [
  'ENOTFOUND',
  'CERT_HAS_EXPIRED',
  'ERR_TLS_CERT_ALTNAME_INVALID',
  'ERR_INVALID_ARG_TYPE',
  'ERR_STREAM_PREMATURE_CLOSE',
  'ABORT_ERR',
]) {
  test(`安全诊断保留 ${code} 和阶段，不带原始异常、凭据或任意cause字段`, async () => {
    const error = new TypeError(`private-message ${key}`, {
      cause: {
        code,
        message: 'private-cause',
        headers: { authorization: key },
        body: 'private-body',
      },
    });
    const output = await analyzeEvidence(evidence(), config, {
      env: { OBSERVER_API_KEY: key },
      fetch: async () => {
        throw error;
      },
    });
    assert.equal(output.status, 'failed');
    assert.equal(output.diagnostics?.stage, 'fetch');
    assert.equal(output.diagnostics?.errorName, 'TypeError');
    assert.equal(output.diagnostics?.causeCode, code);
    assert.deepEqual(output.diagnostics?.endpoint, {
      origin: 'https://api.example.invalid',
      path: '/v1/decisions',
    });
    assert.ok(Number.isSafeInteger(output.diagnostics?.elapsedMs));
    assert.ok(output.diagnostics!.elapsedMs >= 0);
    assert.doesNotMatch(
      JSON.stringify(output),
      /private-message|private-cause|private-body|authorization/,
    );
    assert.ok(!JSON.stringify(output).includes(key));
  });
}

test('响应流中途失败保留HTTP状态、读流阶段及白名单代码，不伪装完成', async () => {
  const error = Object.assign(new Error(`private-stream-message ${key}`), { code: 'ECONNRESET' });
  const response = new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"answers":'));
        controller.error(error);
      },
    }),
    { status: 200 },
  );
  const output = await analyzeEvidence(evidence(), config, http(response).options);
  assert.equal(output.status, 'failed');
  assert.deepEqual(output.findings, []);
  assert.equal(output.diagnostics?.stage, 'response-body');
  assert.equal(output.diagnostics?.httpStatus, 200);
  assert.equal(output.diagnostics?.errorName, 'Error');
  assert.equal(output.diagnostics?.causeCode, 'ECONNRESET');
  assert.doesNotMatch(JSON.stringify(output), /private-stream-message/);
  assert.ok(!JSON.stringify(output).includes(key));
});

test('诊断只允许固定异常名称及代码，不接受响应伪造的diagnostics', async () => {
  const output = await analyzeEvidence(evidence(), config, {
    env: { OBSERVER_API_KEY: key },
    fetch: async () => {
      throw {
        name: `private-name-${key}`,
        cause: { code: 'private-code' },
        message: 'private-message',
      };
    },
  });
  assert.equal(output.diagnostics?.errorName, 'Error');
  assert.equal(output.diagnostics?.causeCode, undefined);
  assert.doesNotMatch(JSON.stringify(output), /private-name|private-code|private-message/);
  const success = await analyzeEvidence(
    evidence(),
    config,
    http({ ...wire(), diagnostics: { message: key, headers: 'private-header' } }).options,
  );
  assert.equal(success.status, 'complete');
  assert.equal(success.diagnostics?.stage, 'complete');
  assert.doesNotMatch(JSON.stringify(success), /private-header/);
  assert.ok(!JSON.stringify(success).includes(key));
});

test('无效配置的诊断地址也剥离query、hash、userinfo并脱敏编码后的key', async () => {
  const mock = http(wire());
  const output = await analyzeEvidence(
    evidence(),
    {
      ...config,
      baseUrl: `https://private-user:private-password@api.example.invalid/v1/${encodeURIComponent(key)}?token=private-query#private-hash`,
    },
    mock.options,
  );
  assert.equal(output.status, 'failed');
  assert.equal(mock.calls.length, 0);
  assert.deepEqual(output.diagnostics?.endpoint, {
    origin: 'https://api.example.invalid',
    path: '/v1/[已脱敏]/decisions',
  });
  assert.doesNotMatch(
    JSON.stringify(output),
    /private-user|private-password|private-query|private-hash/,
  );
  assert.ok(!JSON.stringify(output).includes(key));
});

test('请求和响应体停滞都受总超时约束，fetch不响应abort也不会无限等', async () => {
  let signal: AbortSignal | null | undefined;
  const request = await analyzeEvidence(
    evidence(),
    { ...config, timeoutMs: 20 },
    {
      env: { OBSERVER_API_KEY: key },
      fetch: async (_url, init) => {
        signal = init?.signal;
        return await new Promise<Response>(() => {});
      },
    },
  );
  assert.equal(request.status, 'failed');
  assert.match(request.error!, /超时/);
  assert.equal(signal?.aborted, true);
  let cancelled = false;
  const response = new Response(
    new ReadableStream({
      cancel() {
        cancelled = true;
      },
    }),
  );
  const body = await analyzeEvidence(
    evidence(),
    { ...config, timeoutMs: 20 },
    http(response).options,
  );
  assert.equal(body.status, 'failed');
  assert.match(body.error!, /超时/);
  assert.equal(cancelled, true);
});

for (const protocol of ['responses', 'chat-completions'] as const) {
  test(`${protocol}兼容明确配置的模型；部分/截断/工具调用均失败`, async () => {
    const model = 'user-selected-chat-model';
    const answers = JSON.stringify({ answers: wire().answers });
    const body =
      protocol === 'responses'
        ? {
            model,
            status: 'completed',
            output: [
              {
                type: 'message',
                status: 'completed',
                content: [{ type: 'output_text', text: answers }],
              },
            ],
            usage: wire().usage,
          }
        : {
            model,
            choices: [{ finish_reason: 'stop', message: { content: answers } }],
            usage: { prompt_tokens: 100, completion_tokens: 20 },
          };
    const mock = http(body);
    const selected = { ...config, protocol, model };
    const output = await analyzeEvidence(evidence(), selected, mock.options);
    assert.equal(output.status, 'complete');
    assert.equal(output.model, model);
    assert.equal(mock.calls[0].body.model, model);
    assert.match(
      mock.calls[0].url,
      protocol === 'responses' ? /\/responses$/ : /\/chat\/completions$/,
    );
    assert.equal(
      mock.calls[0].body[protocol === 'responses' ? 'max_output_tokens' : 'max_tokens'],
      config.maxOutputTokens,
    );
    const truncated = structuredClone(body);
    if ('status' in truncated) truncated.status = 'incomplete';
    else truncated.choices[0].finish_reason = 'length';
    assert.equal(
      (await analyzeEvidence(evidence(), selected, http(truncated).options)).status,
      'failed',
    );
    const tools = structuredClone(body);
    if ('output' in tools) {
      assert.ok(tools.output);
      tools.output[0].type = 'function_call';
    } else Object.assign(tools.choices[0].message, { tool_calls: [{ name: 'bash' }] });
    assert.equal(
      (await analyzeEvidence(evidence(), selected, http(tools).options)).status,
      'failed',
    );
  });
}

test('不合法证据绑定、重复输入ID或带凭据baseUrl均不请求', async () => {
  const mock = http(wire());
  const input = evidence();
  input.signals[0].evidenceIds = ['missing'];
  assert.equal((await analyzeEvidence(input, config, mock.options)).status, 'failed');
  const duplicate = evidence();
  duplicate.signals[1].id = duplicate.signals[0].id;
  assert.equal((await analyzeEvidence(duplicate, config, mock.options)).status, 'failed');
  for (const baseUrl of [
    'https://user:secret@api.invalid/v1',
    'http://remote.invalid/v1',
    'https://api.invalid/v1?key=secret',
  ]) {
    assert.equal(
      (await analyzeEvidence(evidence(), { ...config, baseUrl }, mock.options)).status,
      'failed',
    );
  }
  assert.equal(mock.calls.length, 0);
});

function piMock(body: unknown, mode = 'ok') {
  let sent = '';
  let directory = '';
  let command = '';
  let args: readonly string[] = [];
  let environment: Record<string, string | undefined> = {};
  let killed = false;
  let calls = 0;
  const child = Object.assign(new EventEmitter(), {
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    stdin: new Writable({
      write(bytes, _encoding, done) {
        sent += bytes.toString();
        done();
      },
      final(done) {
        done();
        queueMicrotask(() => {
          if (mode === 'timeout') return;
          if (mode === 'overflow')
            child.stdout.write('x'.repeat(responseByteLimit(config.maxOutputTokens) + 1));
          else child.stdout.write(JSON.stringify(body));
          if (mode === 'stderr') child.stderr.write(`private HTTP response ${key}`);
          child.emit('close', mode === 'exit' || mode === 'stderr' ? 1 : 0);
        });
      },
    }),
    kill() {
      killed = true;
      return true;
    },
  });
  const launch = ((
    binary: string,
    parameters: readonly string[],
    options: { cwd: string; env: Record<string, string> },
  ) => {
    calls++;
    command = binary;
    args = parameters;
    directory = options.cwd;
    environment = options.env;
    assert.deepEqual(readdirSync(directory), []);
    return child;
  }) as unknown as NonNullable<AnalysisOptions['spawn']>;
  return {
    get sent() {
      return sent;
    },
    get directory() {
      return directory;
    },
    get command() {
      return command;
    },
    get args() {
      return args;
    },
    get environment() {
      return environment;
    },
    get killed() {
      return killed;
    },
    get calls() {
      return calls;
    },
    options: {
      piPackageRoot: '/tmp/official-pi-fixture',
      spawn: launch,
      env: {
        OBSERVER_API_KEY: key,
        UNRELATED_SECRET: 'must-not-pass',
        NODE_OPTIONS: '--import forbidden',
        HTTP_PROXY: 'http://proxy.invalid:8080',
        NO_PROXY: 'localhost,127.0.0.1',
      },
    },
  };
}

test('Pi使用Node SDK子进程：独立空cwd、无secret argv/文件，仅单key env，协议与模型保持', async () => {
  const mock = piMock(wire());
  const output = await analyzeEvidence(evidence(), { ...config, engine: 'pi' }, mock.options);
  assert.equal(output.status, 'complete');
  assert.equal(output.engine, 'pi');
  assert.equal(output.model, 'gpt-6-luna');
  assert.equal(mock.command, process.execPath);
  assert.ok(mock.args.some((arg) => arg.endsWith('/observe-analysis-pi.ts')));
  assert.ok(!mock.args.join(' ').includes(key));
  assert.ok(!mock.sent.includes(key));
  assert.ok(!mock.sent.includes('must-not-pass'));
  assert.equal(mock.environment.OBSERVER_ANALYSIS_KEY, key);
  assert.equal(mock.environment.UNRELATED_SECRET, undefined);
  assert.equal(mock.environment.OBSERVER_API_KEY, undefined);
  assert.equal(mock.environment.NODE_OPTIONS, undefined);
  assert.equal(mock.environment.HOME, undefined);
  assert.equal(mock.environment.PI_OFFLINE, '1');
  assert.equal(mock.environment.PI_TELEMETRY, '0');
  assert.equal(JSON.parse(mock.sent).config.protocol, 'decisions');
  assert.equal(JSON.parse(mock.sent).config.model, 'gpt-6-luna');
  assert.equal(existsSync(mock.directory), false);
  assert.equal(mock.calls, 1);
});

test('Pi只收到清理并预检后的唯一key，raw及清理后的值均不进入stdin、结果或错误', async () => {
  for (const [, rawKey] of pastedKeys) {
    const mock = piMock(wire());
    const input = evidence();
    input.evidence[0].text += ` raw=${rawKey} clean=${pastedKey}`;
    const output = await analyzeEvidence(
      input,
      { ...config, engine: 'pi' },
      {
        ...mock.options,
        env: { OBSERVER_API_KEY: rawKey },
      },
    );
    assert.equal(output.status, 'complete');
    assert.equal(mock.environment.OBSERVER_ANALYSIS_KEY, pastedKey);
    assert.equal(mock.calls, 1);
    for (const text of [mock.sent, mock.args.join(' '), JSON.stringify(output)]) {
      assert.ok(!text.includes(pastedKey));
      assert.ok(!text.includes(rawKey));
    }
  }
});

const piDiagnostic: AnalysisDiagnostics = {
  stage: 'fetch',
  elapsedMs: 23,
  endpoint: { origin: 'https://api.example.invalid', path: '/v1/decisions' },
  errorName: 'TypeError',
  causeCode: 'ENOTFOUND',
};
test('Pi桥完整保留已校验的失败和成功诊断', async () => {
  const failed = await analyzeEvidence(
    evidence(),
    { ...config, engine: 'pi' },
    piMock({ analysisError: 'network', diagnostics: piDiagnostic }).options,
  );
  assert.equal(failed.status, 'failed');
  assert.deepEqual(failed.diagnostics, piDiagnostic);
  const diagnostics = { ...piDiagnostic, stage: 'complete', httpStatus: 200 };
  delete (diagnostics as Partial<AnalysisDiagnostics>).errorName;
  delete (diagnostics as Partial<AnalysisDiagnostics>).causeCode;
  const success = await analyzeEvidence(
    evidence(),
    { ...config, engine: 'pi' },
    piMock({ ...wire(), diagnostics }).options,
  );
  assert.equal(success.status, 'complete');
  assert.deepEqual(success.diagnostics, diagnostics);
  const keyDiagnostic = { ...piDiagnostic, stage: 'setup', keyFormatReason: 'non-ascii' };
  const invalidKey = await analyzeEvidence(
    evidence(),
    { ...config, engine: 'pi' },
    piMock({ analysisError: 'key_format', diagnostics: keyDiagnostic }).options,
  );
  assert.equal(invalidKey.status, 'failed');
  assert.deepEqual(invalidKey.diagnostics, keyDiagnostic);
});

for (const [name, diagnostics] of [
  ['未知字段', { ...piDiagnostic, headers: { authorization: key } }],
  ['原始message', { ...piDiagnostic, message: `private-message ${key}` }],
  ['未知阶段', { ...piDiagnostic, stage: key }],
  ['未知name', { ...piDiagnostic, errorName: key }],
  ['未知code', { ...piDiagnostic, causeCode: key }],
  ['任意凭据原因', { ...piDiagnostic, keyFormatReason: key }],
  ['负耗时', { ...piDiagnostic, elapsedMs: -1 }],
  ['字符串耗时', { ...piDiagnostic, elapsedMs: '23' }],
  ['非法HTTP', { ...piDiagnostic, httpStatus: 999 }],
  [
    '不同地址',
    { ...piDiagnostic, endpoint: { origin: 'https://private-other.invalid', path: key } },
  ],
  [
    '地址query',
    { ...piDiagnostic, endpoint: { ...piDiagnostic.endpoint, path: `/v1/decisions?token=${key}` } },
  ],
] as const) {
  test(`Pi桥拒绝${name}诊断，不把子进程任意内容放进结果`, async () => {
    const output = await analyzeEvidence(
      evidence(),
      { ...config, engine: 'pi' },
      piMock({ analysisError: 'network', diagnostics }).options,
    );
    assert.equal(output.status, 'failed');
    assert.match(output.error!, /Pi SDK/);
    assert.equal(output.diagnostics?.stage, 'pi');
    assert.ok(!JSON.stringify(output).includes(key));
    assert.doesNotMatch(JSON.stringify(output), /private-message|private-other|authorization/);
  });
}

for (const mode of ['timeout', 'overflow', 'exit', 'stderr', 'partial', 'sdk-failed']) {
  test(`Pi ${mode}失败不假绿、不输出stderr，终止并清理自己的临时目录`, async () => {
    const body =
      mode === 'partial'
        ? { answers: wire().answers.slice(0, 1) }
        : mode === 'sdk-failed'
          ? { analysisError: 'auth' }
          : wire();
    const mock = piMock(body, mode);
    const output = await analyzeEvidence(
      evidence(),
      { ...config, engine: 'pi', timeoutMs: mode === 'timeout' ? 20 : 1000 },
      mock.options,
    );
    assert.equal(output.status, 'failed');
    assert.deepEqual(output.findings, []);
    assert.ok(!JSON.stringify(output).includes(key));
    assert.ok(!JSON.stringify(output).includes('private HTTP'));
    assert.equal(existsSync(mock.directory), false);
    assert.equal(mock.calls, 1);
    if (mode === 'timeout' || mode === 'overflow') assert.equal(mock.killed, true);
  });
}
