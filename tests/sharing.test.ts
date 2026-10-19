import test from 'node:test';
import assert from 'node:assert/strict';
import { recordSharingArrival, SHARING_ACTIONS, type SharingAction } from '../src/sharing.ts';
import { createTelemetry, validTelemetryBatch, type TelemetryEvent } from '../src/telemetry.ts';
import { mountJourneyCardActions } from '../src/journey-card-actions.ts';
import { monitorQueries, monitorRows } from '../src/monitor-protocol.ts';

test('分享事件只接收固定动作，未知或缺失动作不能写入统计', () => {
  const batch = { id: 'test-12345678', version: 'verification', events: [] as unknown[] };
  for (const action of Object.keys(SHARING_ACTIONS)) {
    batch.events = [{ type: 'sharing', detail: action }];
    assert.equal(validTelemetryBatch(batch), true, action);
  }
  for (const detail of [undefined, '', 'toString', 'unknown', '私人留言']) {
    batch.events = [{ type: 'sharing', detail }];
    assert.equal(validTelemetryBatch(batch), false);
  }
});

test('二维码进入清理固定来源，保留其它参数与锚点，刷新不重复记入', () => {
  const events: TelemetryEvent[] = [];
  let href = 'https://xiuxian.011203.xyz/?from=journey-card&mode=normal#home';
  const reporter = { track: (event: TelemetryEvent) => events.push(event) };
  assert.equal(
    recordSharingArrival(reporter, href, true, (next) => {
      href = next;
    }),
    true,
  );
  assert.deepEqual(events, [{ type: 'sharing', detail: 'qr-arrival', fresh: true }]);
  assert.equal(href, 'https://xiuxian.011203.xyz/?mode=normal#home');
  assert.equal(recordSharingArrival(reporter, href, true, assert.fail), false);
  assert.equal(events.length, 1);
  for (const query of ['?from=other', '?from=journey-card&from=other', '?ref=journey-card', ''])
    assert.equal(
      recordSharingArrival(reporter, 'https://xiuxian.011203.xyz/' + query, false, assert.fail),
      false,
    );
  assert.doesNotThrow(() =>
    recordSharingArrival(reporter, 'https://xiuxian.011203.xyz/?from=journey-card', false, () => {
      throw Error('blocked');
    }),
  );
});

test('关闭统计的二维码进入和分享不发网络，也不改存档', () => {
  const values = new Map([
    ['qinglan-telemetry-off', '1'],
    ['qinglan-immortal-v1', 'untouched'],
  ]);
  const telemetry = createTelemetry({
    origin: 'https://xiuxian.011203.xyz',
    endpoint: 'https://example.com/events',
    version: 'verification',
    storage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: assert.fail,
      removeItem: assert.fail,
    },
    send: assert.fail,
  });
  recordSharingArrival(telemetry, 'https://xiuxian.011203.xyz/?from=journey-card', false, () => {});
  telemetry.track({ type: 'sharing', detail: 'preview' });
  telemetry.flush();
  assert.equal(telemetry.pending(), 0);
  assert.equal(values.get('qinglan-immortal-v1'), 'untouched');
});

function controls(emit?: (action: SharingAction) => void) {
  const events: SharingAction[] = [];
  const image = { src: '' };
  const status = { textContent: '' };
  const download = {
    download: '留影.png',
    href: '',
    onclick: () => {},
    click() {
      this.onclick();
    },
  };
  const button = { disabled: false, onclick: async () => {} };
  const host = {
    innerHTML: '',
    isConnected: true,
    querySelector: (selector: string) =>
      ({ img: image, a: download, button, '[role="status"]': status })[selector],
  };
  mountJourneyCardActions(
    host as unknown as HTMLElement,
    'data:image/png;base64,iVBORw==',
    emit ?? ((a) => events.push(a)),
  );
  return { host, events, status, download, button };
}

test('实际分享动作区记录预览、下载请求和下载错误，不虚报保存完成', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const c = controls();
  c.download.click();
  assert.deepEqual(c.events, ['preview', 'save-request']);
  assert.match(c.download.href, /^blob:/);
  t.mock.method(URL, 'createObjectURL', () => {
    throw Error('blocked');
  });
  c.download.click();
  assert.deepEqual(c.events.slice(-2), ['save-request', 'save-failed']);
  assert.match(c.status.textContent, /暂时无法下载/);
});

test('分享完成、取消与不支持回退分别统计，重复点击与关闭回调不会再下载', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let finish!: () => void;
  t.mock.getter(globalThis, 'navigator', () => ({
    canShare: () => true,
    share: () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  }));
  const c = controls();
  const pending = c.button.onclick();
  await c.button.onclick();
  assert.deepEqual(c.events, ['preview', 'share-request']);
  finish();
  await pending;
  assert.equal(c.events.at(-1), 'shared');
  t.mock.getter(globalThis, 'navigator', () => ({
    canShare: () => true,
    share: async () => {
      throw new DOMException('cancel', 'AbortError');
    },
  }));
  await c.button.onclick();
  assert.equal(c.events.at(-1), 'cancelled');
  t.mock.getter(globalThis, 'navigator', () => ({}));
  await c.button.onclick();
  assert.deepEqual(c.events.slice(-3), ['share-request', 'fallback', 'save-request']);
  c.host.isConnected = false;
  await c.button.onclick();
  assert.deepEqual(c.events.slice(-2), ['share-request', 'fallback']);
});

test('统计回调出错不能阻断真实下载与分享，协议聚合不公开匿名编号', () => {
  assert.doesNotThrow(() =>
    controls(() => {
      throw Error('stats failed');
    }),
  );
  const query = monitorQueries({ days: 7, site: 'main' }).sharing;
  assert.match(query, /blob1 = 'sharing'/);
  assert.match(query, /count\(DISTINCT index1\) AS browsers/);
  assert.match(query, /blob7 = 'qr-arrival' AND double10 = 1/);
  assert.match(query, /blob2 = 'xiuxian.011203.xyz'/);
  assert.deepEqual(
    monitorRows('sharing', [
      { action: 'qr-arrival', count: '2', browsers: '1', fresh: '1', index1: 'private-id' },
    ]),
    [{ action: 'qr-arrival', count: 2, browsers: 1, fresh: 1 }],
  );
});
