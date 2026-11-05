import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { existsSync, readdirSync } from 'node:fs';
import { PassThrough, Writable } from 'node:stream';
import { analyzeEvidence, responseByteLimit } from '../scripts/observe-analysis.ts';
import type { AnalysisOptions } from '../scripts/observe-analysis.ts';
import type { AnalysisConfig, AnalysisInput } from '../scripts/observe-types.ts';

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
  assert.equal(call.init.redirect, 'error');
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
  const failed = await analyzeEvidence(evidence(), config, {
    env: { OBSERVER_API_KEY: key },
    fetch: async () => {
      throw new Error(`raw HTTP ${key}`);
    },
  });
  assert.equal(failed.status, 'failed');
  assert.ok(!JSON.stringify(failed).includes(key));
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
    if ('output' in tools) tools.output[0].type = 'function_call';
    else Object.assign(tools.choices[0].message, { tool_calls: [{ name: 'bash' }] });
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
