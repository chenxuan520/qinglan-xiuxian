import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import worker from '../workers/npc-ai/index.ts';
import {
  createTelemetry,
  telemetryPoint,
  validTelemetryBatch,
  TELEMETRY_BLOBS,
  TELEMETRY_DOUBLES,
  TELEMETRY_DETAIL_MAX_LENGTH,
  type TelemetryBatch,
  type TelemetryEvent,
} from '../src/telemetry.ts';
import { TELEMETRY_SETTINGS } from '../src/setting.ts';
import { telemetryRow } from '../src/common-ui.ts';

const official = 'https://xiuxian.011203.xyz';
const pages = 'https://chenxuan520.github.io';
const batch: TelemetryBatch = {
  id: '3f8c1a2e-9b7d-4c1e-8a55-0c1d2e3f4a5b',
  version: 'v0.0.2-14-gbcec785',
  events: [
    { type: 'session', fresh: true, realm: 0, stage: 0, runs: 0, age: 15, root: 'heaven' },
    {
      type: 'run-end',
      stage: 1,
      difficulty: 0,
      result: 'won',
      seconds: 186,
      level: 26,
      kills: 509,
      path: 'orthodox',
    },
  ],
};

function memoryStorage(fail = false) {
  const data = new Map<string, string>();
  const writes: string[] = [];
  return {
    data,
    writes,
    getItem: (key: string) => {
      if (fail) throw new Error('blocked');
      return data.get(key) ?? null;
    },
    setItem: (key: string, value: string) => {
      if (fail) throw new Error('blocked');
      writes.push(key);
      data.set(key, value);
    },
    removeItem: (key: string) => {
      if (fail) throw new Error('blocked');
      data.delete(key);
    },
  };
}
function reporter(origin: string, storage = memoryStorage()) {
  const sent: { url: string; body: TelemetryBatch }[] = [];
  let ids = 0;
  const telemetry = createTelemetry({
    origin,
    endpoint: 'https://npc.example/event',
    version: 'v1.2.3',
    storage,
    send: (url, body) => sent.push({ url, body: JSON.parse(body) }),
    createId: () => `anon-${String(++ids).padStart(8, '0')}`,
  });
  return { telemetry, sent, storage };
}

test('统计协议只接受白名单事件与有限数值，拒收未知字段和超量批次', () => {
  assert.equal(validTelemetryBatch(batch), true);
  const broken = (patch: (copy: TelemetryBatch & Record<string, unknown>) => void) => {
    const copy = structuredClone(batch) as TelemetryBatch & Record<string, unknown>;
    patch(copy);
    return validTelemetryBatch(copy);
  };
  assert.equal(
    broken((b) => (b.id = 'x')),
    false,
  );
  assert.equal(
    broken((b) => (b.version = '<script>')),
    false,
  );
  assert.equal(
    broken((b) => (b.events = [])),
    false,
  );
  assert.equal(
    broken((b) => (b.events = Array(TELEMETRY_SETTINGS.maxEvents + 1).fill(batch.events[0]))),
    false,
  );
  for (const patch of [
    { type: 'unknown' },
    { chat: '闲聊内容' },
    { stage: -1 },
    { seconds: Number.NaN },
    { kills: 1e8 },
    { result: 'expired' },
    { root: 'god' },
    { path: 'sword' },
    { fresh: 'yes' },
    { detail: 42 },
    { detail: 'x'.repeat(TELEMETRY_DETAIL_MAX_LENGTH + 1) },
  ])
    assert.equal(
      broken((b) => Object.assign(b.events[0], patch)),
      false,
      JSON.stringify(patch),
    );
  assert.equal(
    validTelemetryBatch({
      ...batch,
      events: [{ type: 'error', detail: 'error: TypeError: x @ main.js:9' }],
    }),
    true,
  );
});

test('写入 Analytics Engine 的列顺序固定，缺省数值记为 -1，错误摘要写入末列', () => {
  const point = telemetryPoint(batch, batch.events[1], 'xiuxian.011203.xyz');
  assert.deepEqual(point.indexes, [batch.id]);
  assert.equal(point.blobs.length, TELEMETRY_BLOBS.length);
  assert.equal(point.doubles.length, TELEMETRY_DOUBLES.length);
  assert.deepEqual(point.blobs, [
    'run-end',
    'xiuxian.011203.xyz',
    batch.version,
    'orthodox',
    '',
    'won',
    '',
  ]);
  assert.deepEqual(point.doubles, [1, 0, -1, -1, 186, 26, 509, -1, -1, -1]);
  assert.equal(telemetryPoint(batch, batch.events[0], 'x').doubles.at(-1), 1);
  const failure: TelemetryEvent = { type: 'error', detail: 'rejection: 未知原因' };
  assert.equal(telemetryPoint(batch, failure, 'x').blobs.at(-1), failure.detail);
});

test('本机、自建副本等非正式站不发送统计，也不写入匿名编号', () => {
  for (const origin of ['http://localhost:5173', 'https://example.com', 'null']) {
    const { telemetry, sent, storage } = reporter(origin);
    assert.equal(telemetry.active, false);
    telemetry.track({ type: 'session' });
    telemetry.flush();
    assert.equal(telemetry.pending(), 0);
    assert.deepEqual(sent, []);
    assert.deepEqual(storage.writes, []);
  }
});

test('官网与 GitHub Pages 按批发送，匿名编号独立保存并复用，关闭后停止', () => {
  for (const origin of [official, pages]) {
    const { telemetry, sent, storage } = reporter(origin);
    assert.equal(telemetry.active, true);
    telemetry.track({ type: 'session', fresh: true });
    assert.deepEqual(sent, []);
    telemetry.flush();
    assert.equal(sent.length, 1);
    assert.equal(sent[0].url, 'https://npc.example/event');
    assert.equal(sent[0].body.version, 'v1.2.3');
    assert.equal(validTelemetryBatch(sent[0].body), true);
    const id = storage.data.get(TELEMETRY_SETTINGS.idKey);
    assert.equal(sent[0].body.id, id);
    for (let i = 0; i < TELEMETRY_SETTINGS.flushSize; i++) telemetry.track({ type: 'town' });
    assert.equal(sent.length, 2);
    assert.equal(sent[1].body.id, id);
    assert.equal(sent[1].body.events.length, TELEMETRY_SETTINGS.flushSize);

    const again = reporter(origin, storage);
    again.telemetry.track({ type: 'town' });
    again.telemetry.flush();
    assert.equal(again.sent[0].body.id, id);

    telemetry.track({ type: 'town' });
    telemetry.setEnabled(false);
    assert.equal(telemetry.enabled(), false);
    assert.equal(telemetry.pending(), 0);
    telemetry.track({ type: 'town' });
    telemetry.flush();
    assert.equal(sent.length, 2);
    telemetry.setEnabled(true);
    assert.equal(telemetry.enabled(), true);
  }
});

test('存储不可用或发送抛错时统计静默失败，不影响调用方', () => {
  const { telemetry, sent } = reporter(official, memoryStorage(true));
  telemetry.track({ type: 'session' });
  telemetry.flush();
  assert.equal(sent.length, 1);
  assert.ok(validTelemetryBatch(sent[0].body));
  const throwing = createTelemetry({
    origin: official,
    endpoint: 'https://npc.example/event',
    version: 'bad version!',
    storage: null,
    send: () => {
      throw new Error('offline');
    },
  });
  throwing.track({ type: 'session' });
  assert.doesNotThrow(() => throwing.flush());
  assert.equal(throwing.pending(), 0);
});

const workerConfig = readFileSync(
  new URL('../workers/npc-ai/wrangler.jsonc', import.meta.url),
  'utf8',
);
const deployedOrigins = workerConfig.match(/"ALLOWED_ORIGINS":\s*"([^"]*)"/)?.[1] ?? '';
function workerEnv(success = true) {
  const points: ReturnType<typeof telemetryPoint>[] = [];
  const keys: string[] = [];
  return {
    points,
    keys,
    env: {
      ALLOWED_ORIGINS: deployedOrigins,
      EVENTS: { writeDataPoint: (point: ReturnType<typeof telemetryPoint>) => points.push(point) },
      EVENT_LIMITER: {
        limit: async ({ key }: { key: string }) => {
          keys.push(key);
          return { success };
        },
      },
    },
  };
}
const eventRequest = (body: unknown, origin = official, method = 'POST') =>
  new Request('https://npc.example/event', {
    method,
    headers: {
      Origin: origin,
      'Content-Type': 'text/plain;charset=UTF-8',
      'CF-Connecting-IP': '192.0.2.9',
    },
    body: method === 'POST' ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
  });

test('Worker /event 接收两个正式站的纯文本统计并逐条写入 Analytics Engine', async () => {
  assert.ok(deployedOrigins.includes(official) && deployedOrigins.includes(pages));
  assert.match(workerConfig, /"binding": "EVENTS", "dataset": "qinglan_events"/);
  for (const origin of [official, pages]) {
    const { env, points, keys } = workerEnv();
    const response = await worker.fetch(eventRequest(batch, origin), env as never);
    assert.equal(response.status, 204);
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), origin);
    assert.equal(points.length, batch.events.length);
    assert.deepEqual(
      points.map((point) => point.blobs[1]),
      Array(batch.events.length).fill(new URL(origin).host),
    );
    assert.deepEqual(keys, ['event:192.0.2.9']);
  }
});

test('Worker /event 本机只校验不写入，拒收非法、超大、限流与未授权来源', async () => {
  const local = workerEnv();
  assert.equal(
    (await worker.fetch(eventRequest(batch, 'http://localhost:5173'), local.env as never)).status,
    204,
  );
  assert.deepEqual(local.points, []);
  assert.deepEqual(local.keys, []);

  const cases: [Request, number, boolean?][] = [
    [eventRequest({ ...batch, events: [{ type: 'hack' }] }), 400],
    [eventRequest('not json'), 400],
    [eventRequest(`${' '.repeat(TELEMETRY_SETTINGS.maxRequestBytes + 1)}{}`), 400],
    [eventRequest(null, official, 'GET'), 405],
    [eventRequest(batch, 'https://evil.example'), 403],
    [eventRequest(batch), 429, false],
  ];
  for (const [request, status, allow = true] of cases) {
    const { env, points } = workerEnv(allow);
    assert.equal((await worker.fetch(request, env as never)).status, status);
    assert.deepEqual(points, []);
  }
  const preflight = await worker.fetch(
    eventRequest(null, pages, 'OPTIONS'),
    workerEnv().env as never,
  );
  assert.equal(preflight.status, 204);
});

test('关于面板说明匿名统计内容并提供开关', () => {
  assert.match(telemetryRow(true, true), /已开启[^]*data-action="telemetry-toggle"[^]*关闭/);
  assert.match(telemetryRow(true, false), /本网址不发送/);
  assert.match(telemetryRow(false, true), /已关闭[^]*开启/);
  assert.match(telemetryRow(true, true), /不上传存档、闲聊或任何个人信息，数据保留三个月/);
});
