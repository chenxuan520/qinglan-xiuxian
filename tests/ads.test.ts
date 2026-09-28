import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { AD_DURATION_MS, AD_SECONDS, AD_PLACEHOLDER_HTML } from '../src/ads.ts';

// 四处广告位（复活、自选灵根、物资补给、借寿）共用同一套占位实现；
// 日后接入真实 SDK 时替换播放与完成判定，奖励发放逻辑不变。
const source = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');

test('广告占位保持 5 秒与招租文案', () => {
  assert.equal(AD_DURATION_MS, 5000);
  assert.equal(AD_SECONDS, 5);
  assert.match(AD_PLACEHOLDER_HTML, /class="revive-ad"/);
  assert.match(AD_PLACEHOLDER_HTML, /广告位招租/);
});

test('main.ts 广告播放与领取走统一接口，不散落硬编码', () => {
  assert.match(source, /adReadyAt = Date\.now\(\) \+ AD_DURATION_MS/);
  assert.match(
    source,
    /function adCompleted\(\) \{[^}]*adReadyAt !== 0 && Date\.now\(\) >= adReadyAt[^}]*\}/,
  );
  assert.equal(source.match(/\badCompleted\(\)/g)?.length, 4);
  assert.equal(source.match(/\$\{AD_SECONDS\}/g)?.length, 6);
  assert.equal(source.match(/\$\{AD_PLACEHOLDER_HTML\}/g)?.length, 3);
  assert.doesNotMatch(source, /5 秒/);
  assert.doesNotMatch(source, /<div class="revive-ad">/);
  assert.doesNotMatch(source, /Date\.now\(\) \+ 5000/);
});
