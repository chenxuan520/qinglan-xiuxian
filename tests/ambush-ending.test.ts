import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../workers/npc-ai/index.ts';
import { freshSave } from '../src/progress.ts';
import { SPIRIT_ROOTS } from '../src/data.ts';
import { journeyFarewellPanel } from '../src/opening-ui.ts';
import { journeyCardData } from '../src/journey-card.ts';
import {
  journeyAppraisalFacts,
  localJourneyAppraisal,
  validJourneyAppraisalFacts,
} from '../src/journey-appraisal.ts';
import {
  extractJourneyAppraisal,
  journeyAppraisalMessages,
  validJourneyAppraisal,
} from '../src/journey-appraisal-ai-protocol.ts';
import { validTelemetryBatch, telemetryPoint, type TelemetryBatch } from '../src/telemetry.ts';
import { monitorReason } from '../src/monitor-view.ts';

const official = 'https://xiuxian.011203.xyz';
const parts = {
  title: '仙途止于风雪',
  ending: '此身殒于劫修，坊外的风为此世收笔。',
  cultivation: '青霄剑曾伴你启程，问道的脚步留在青岚山水之间。',
  ties: '',
};
const appraisal = { title: parts.title, detail: parts.ending + parts.cultivation };

test('劫杀身陨有独立落幕正文，只提供留影与轮回，不混入广告或寿尽天劫', () => {
  const [title, subtitle, body] = journeyFarewellPanel('ambush');
  assert.equal(title, '身陨坊外');
  assert.match(subtitle, /刀光已寂/);
  assert.match(body, /归途之前/);
  assert.match(body, /data-action="journey-card"/);
  assert.match(body, /data-action="confirm-journey-reincarnate"/);
  assert.doesNotMatch(body, /广告|复活|脱身|损失灵石|寿数已尽|天劫|仙门已开/);
  assert.equal(journeyFarewellPanel('lifespan')[0], '此世寿终');
  assert.equal(journeyFarewellPanel('tribulation')[0], '止于天劫');
});

test('劫杀留影读待轮回原因，保留本世资料，既不是寿终也不是圆满离界', () => {
  const save = freshSave('heaven', ['metal'], 'orthodox', () => 0);
  save.cultivation = 1;
  save.age = 27.5;
  save.forge[save.starter] = 7;
  save.pendingReincarnation = 'ambush';
  const before = JSON.stringify(save);
  const card = journeyCardData(save);
  assert.equal(card.ending, 'ambush');
  assert.equal(card.ended, false);
  assert.equal(card.age, '27.5');
  assert.equal(card.weapon.forge, 7);
  assert.equal(card.appraisal.title, '仙途止于风雪');
  assert.match(card.appraisal.detail, /劫杀|劫修|坊外刀光/);
  assert.doesNotMatch(card.appraisal.detail, /此世寿终|止于天劫|仙门已开|仍在修行|仍待亲行/);
  assert.equal(JSON.stringify(save), before);
});

test('劫杀兜底评语覆盖灵根、境界与人间牵挂，结局明确且无继续修行承诺', () => {
  for (const root of SPIRIT_ROOTS) {
    for (const cultivation of [0, 1, 10000, 1e9]) {
      const save = freshSave();
      save.cultivation = cultivation;
      const base = journeyAppraisalFacts(save, 'ambush');
      for (let age = 15; age < 30; age++) {
        for (const ties of [
          [],
          ['home-letter-found', 'home-letter-read'],
          ['companion-met', 'companion-bond'],
        ]) {
          const facts = { ...base, root: root.id, age, ties };
          assert.equal(validJourneyAppraisalFacts(facts), true);
          const actual = localJourneyAppraisal(facts);
          assert.equal(actual.title, '仙途止于风雪');
          assert.ok(actual.detail.length >= 30 && actual.detail.length <= 80, actual.detail);
          assert.match(actual.detail, /劫杀|劫修|坊外刀光/);
          assert.doesNotMatch(
            actual.detail,
            /仍在修行|前路尚待|仍待亲行|新的成果仍待|之后仍待积累|此世寿终|止于天劫/,
          );
          assert.equal(validJourneyAppraisal(actual, facts), true, actual.detail);
          if (ties.includes('home-letter-read')) assert.match(actual.detail, /家书/);
          if (ties.includes('companion-bond')) assert.match(actual.detail, /道侣/);
          if (base.ascending) assert.match(actual.detail, /渡劫/);
        }
      }
    }
  }
});

test('AI 事实明确劫杀原因，拒绝混写寿终天劫、逃生及未结束的人生', () => {
  const facts = journeyAppraisalFacts(freshSave(), 'ambush');
  const prompt = JSON.parse(journeyAppraisalMessages(facts)[1].content);
  assert.equal(prompt.ending, 'ambush');
  assert.match(prompt.outcome, /劫修袭杀而身陨/);
  assert.equal(validJourneyAppraisalFacts(facts), true);
  assert.deepEqual(extractJourneyAppraisal({ response: JSON.stringify(parts) }, facts), appraisal);
  assert.equal(validJourneyAppraisal(appraisal, facts), true);
  for (const wrong of [
    '此身止于天劫，问道的心意仍有回响。',
    '此世寿终，青岚的山水为一生收笔。',
    '成功脱身，坊外的风送你平安归来。',
    '此世仍在修行，青岚之外尚有远山。',
    '一程求道至此收笔，山河依旧长存。',
  ]) {
    assert.equal(
      validJourneyAppraisal({ ...appraisal, detail: wrong + parts.cultivation }, facts),
      false,
      wrong,
    );
  }
  for (const ending of ['ongoing', 'lifespan', 'tribulation', 'immortal'] as const) {
    const other = { ...facts, ending };
    assert.equal(validJourneyAppraisal(appraisal, other), false, ending);
  }
});

test('主站评语 Worker 接受独立劫杀摘要，仍通过同一封闭事实与输出校验', async () => {
  const facts = journeyAppraisalFacts(freshSave(), 'ambush');
  let calls = 0;
  const response = await worker.fetch(
    new Request('https://npc.example/journey-appraisal', {
      method: 'POST',
      headers: {
        Origin: official,
        'Content-Type': 'application/json',
        'CF-Connecting-IP': '192.0.2.9',
      },
      body: JSON.stringify(facts),
    }),
    {
      ALLOWED_ORIGINS: official,
      NPC_LIMITER: { limit: async () => ({ success: true }) },
      AI: {
        run: async (_model: string, input: { messages: { content: string }[] }) => {
          calls++;
          assert.match(input.messages[1].content, /劫修袭杀而身陨/);
          return { response: JSON.stringify(parts) };
        },
      },
    } as never,
  );
  assert.equal(response.status, 200);
  assert.equal(calls, 1);
  assert.deepEqual((await response.json()).appraisal, appraisal);
});

test('劫杀轮回原因按原统计列写入，Worker 与监控显示一致，不混入天劫', async () => {
  const batch: TelemetryBatch = {
    id: 'ambush-ending-test',
    version: 'verification',
    events: [{ type: 'reincarnate', result: 'ambush', age: 27.5, realm: 1 }],
  };
  assert.equal(validTelemetryBatch(batch), true);
  assert.equal(monitorReason('ambush'), '劫杀身陨');
  assert.equal(monitorReason('tribulation'), '天劫');
  const points: ReturnType<typeof telemetryPoint>[] = [];
  const response = await worker.fetch(
    new Request('https://npc.example/event', {
      method: 'POST',
      headers: {
        Origin: official,
        'Content-Type': 'text/plain;charset=UTF-8',
        'CF-Connecting-IP': '192.0.2.9',
      },
      body: JSON.stringify(batch),
    }),
    {
      ALLOWED_ORIGINS: official,
      EVENT_LIMITER: { limit: async () => ({ success: true }) },
      EVENTS: { writeDataPoint: (point: ReturnType<typeof telemetryPoint>) => points.push(point) },
    } as never,
  );
  assert.equal(response.status, 204);
  assert.equal(points.length, 1);
  assert.equal(points[0].blobs[0], 'reincarnate');
  assert.equal(points[0].blobs[5], 'ambush');
});
