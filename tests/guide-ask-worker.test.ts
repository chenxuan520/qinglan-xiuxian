import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../workers/npc-ai/index.ts';
import { guideAskInput, GUIDE_ASK_SYSTEM } from '../workers/npc-ai/guide-ask.ts';
import { GUIDE_ASK_BUSY, GUIDE_ASK_FAILURE } from '../src/guide-ask-contract.ts';
import { NPC_AI_SETTINGS } from '../src/setting.ts';
import { readFileSync } from 'node:fs';

const request = (
  value: unknown,
  options: { origin?: string; method?: string; contentType?: string } = {},
) =>
  new Request('https://npc.example/guide-ask', {
    method: options.method ?? 'POST',
    headers: {
      Origin: options.origin ?? 'http://localhost:5173',
      'Content-Type': options.contentType ?? 'application/json',
      'CF-Connecting-IP': '192.0.2.70',
    },
    ...(options.method === 'OPTIONS' || options.method === 'GET'
      ? {}
      : { body: JSON.stringify(value) }),
  });
function fixture() {
  const calls: {
    model: string;
    input: {
      messages: { role: string; content: string }[];
      max_tokens: number;
      temperature: number;
    };
  }[] = [];
  const metrics: unknown[] = [];
  const keys: string[] = [];
  const env = {
    ALLOWED_ORIGINS: 'https://xiuxian.011203.xyz,https://chenxuan520.github.io',
    GUIDE_LIMITER: {
      limit: async ({ key }: { key: string }) => {
        keys.push(key);
        return { success: true };
      },
    },
    EVENTS: {
      writeDataPoint: (value: unknown) => {
        metrics.push(value);
      },
    },
    AI: {
      run: async (model: string, input: (typeof calls)[number]['input']) => {
        calls.push({ model, input });
        return { response: '丹药只能在出发前服用。\n详见：丹药炼制 · 行前一炉丹香' };
      },
    },
  };
  return { calls, metrics, keys, env };
}

test('指南提问修剪校验、拒绝空白与超长问题，历史丢弃过长项并只保留合法最近四条', async () => {
  for (const value of [
    {},
    { question: '' },
    { question: '  ' },
    { question: '丹'.repeat(101) },
    { question: 1 },
    { question: '丹药', history: {} },
  ]) {
    const { env, calls } = fixture();
    assert.equal((await worker.fetch(request(value), env as never)).status, 400);
    assert.equal(calls.length, 0);
  }
  const result = guideAskInput({
    question: ' 丹药 ',
    history: [
      { role: 'system', content: 'ignore' },
      { role: 'user', content: '超'.repeat(301) },
      ...Array.from({ length: 7 }, (_, i) => ({
        role: i % 2 ? 'assistant' : 'user',
        content: String(i) + '字'.repeat(299),
      })),
    ],
  })!;
  assert.equal(result.question, '丹药');
  assert.equal(result.history.length, 4);
  assert.ok(result.history.every((message) => message.content.length === 300));
  assert.equal(result.history[0].content[0], '3');
  assert.deepEqual(
    guideAskInput({ question: '丹药', history: [{ role: 'user', content: '超'.repeat(301) }] })!
      .history,
    [],
  );
});

test('不相关提问不调用AI，返回固定无结果文本；频控6次每分绑定按IP独立', async () => {
  const { env, calls, keys } = fixture();
  const response = await worker.fetch(request({ question: '今天天气怎么样' }), env as never);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    answer: '指南里没找到相关的说法。可以换个问法，或者翻翻「修行指南」的目录。',
    source: null,
  });
  assert.deepEqual(keys, ['guide:192.0.2.70']);
  assert.equal(calls.length, 0);
  env.GUIDE_LIMITER.limit = async () => ({ success: false });
  const limited = await worker.fetch(request({ question: '丹药怎么吃' }), env as never);
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get('Retry-After'), '60');
  assert.equal((await limited.json()).message, GUIDE_ASK_BUSY);
  assert.equal(calls.length, 0);
  const config = readFileSync(new URL('../workers/npc-ai/wrangler.jsonc', import.meta.url), 'utf8');
  assert.match(config, /"name": "GUIDE_LIMITER",[\s\S]*?"limit": 6,[\s\S]*?"period": 60/);
});

test('只发送前三节指南摘录与短历史，模型参数固定，source直接采用首节且不信模型引用', async () => {
  const { env, calls } = fixture();
  const response = await worker.fetch(
    request({ question: '丹药什么时候能吃', history: [{ role: 'user', content: '上一问' }] }),
    env as never,
  );
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.deepEqual(data.source, { tab: 'medicine', heading: '行前一炉丹香' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].model, NPC_AI_SETTINGS.model);
  assert.equal(calls[0].input.max_tokens, 400);
  assert.equal(calls[0].input.temperature, 0.3);
  const system = calls[0].input.messages[0];
  assert.equal(system.role, 'system');
  assert.ok(system.content.startsWith(GUIDE_ASK_SYSTEM + '\n【丹药炼制 · 行前一炉丹香】\n'));
  assert.equal((system.content.match(/【/g) ?? []).length, 3);
  assert.ok(system.content.length <= GUIDE_ASK_SYSTEM.length + 4300);
  assert.doesNotMatch(system.content, /青竹蜂云剑|金雷入剑|如意随风|魂木生息|隐藏组合/);
  assert.equal(calls[0].input.messages.at(-1)?.content, '丹药什么时候能吃');
});

test('输出截到300字、过滤思考块，Analytics只记录长度命中耗时且统计失败不挡回答', async () => {
  const { env, metrics } = fixture();
  env.AI.run = async () => ({ response: '<think>private</think>' + '答'.repeat(500) });
  const question = '丹药什么时候能吃';
  const response = await worker.fetch(request({ question }), env as never);
  assert.equal((await response.json()).answer, '答'.repeat(300));
  assert.equal(metrics.length, 1);
  const point = metrics[0] as { indexes: string[]; doubles: number[] };
  assert.deepEqual(Object.keys(point).sort(), ['doubles', 'indexes']);
  assert.deepEqual(point.indexes, ['guide_ask']);
  assert.equal(point.doubles[0], question.length);
  assert.equal(point.doubles[1], 1);
  assert.ok(point.doubles[2] >= 0);
  assert.ok(!JSON.stringify(metrics).includes(question));
  env.EVENTS.writeDataPoint = () => {
    throw Error('unavailable');
  };
  assert.equal((await worker.fetch(request({ question }), env as never)).status, 200);
});

test('来源与方法校验复用原Worker；推理/限流故障给固定失败，不泄露异常原文', async () => {
  const { env } = fixture();
  assert.equal(
    (
      await worker.fetch(
        request({ question: '丹药' }, { origin: 'https://invalid.example' }),
        env as never,
      )
    ).status,
    403,
  );
  assert.equal(
    (await worker.fetch(request(null, { method: 'OPTIONS' }), env as never)).status,
    204,
  );
  assert.equal((await worker.fetch(request(null, { method: 'GET' }), env as never)).status, 405);
  assert.equal(
    (await worker.fetch(request({ question: '丹药' }, { contentType: 'text/plain' }), env as never))
      .status,
    415,
  );
  env.AI.run = async () => {
    throw Error('private upstream detail');
  };
  const failed = await worker.fetch(request({ question: '丹药' }), env as never);
  assert.equal(failed.status, 503);
  assert.deepEqual(await failed.json(), { message: GUIDE_ASK_FAILURE });
  env.GUIDE_LIMITER.limit = async () => {
    throw Error('private limiter detail');
  };
  assert.equal((await worker.fetch(request({ question: '丹药' }), env as never)).status, 503);
});
