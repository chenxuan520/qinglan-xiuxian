import test from 'node:test';
import assert from 'node:assert/strict';
import { GuideSource } from '../src/guide-source.ts';
import * as guide from '../src/guide.ts';

test('全部帮助分类不出现广告文案；指南保留主动进入导览的入口', () => {
  for (const tab of guide.GUIDE_TABS) assert.doesNotMatch(guide.guideContent(tab.id), /广告/);
  assert.match(guide.guideContent('basics'), /data-action="guide-tour"/);
  assert.doesNotMatch(guide.guideContent('basics'), /guide-demo|<details[^>]*open/);
});

test('本世珍品帮助说明强化后的实际增幅、次数与占位，保留未知药谱的丹名', () => {
  const medicine = guide.guideContent('medicine');
  assert.match(medicine, /服用时所在境界基础寿元的 30%，每世最多两次，长生后不可服用/);
  assert.match(medicine, /气血上限、基础恢复速度各提高 15%，每世最多三份，合计提高 45%/);
  assert.match(medicine, /不占三种限时药效的位置/);
  assert.doesNotMatch(medicine, /回阳水|培婴丹/);
});

test('帮助将三成边界限定为功法合计系数，并说明奇物另算', () => {
  const builds = guide.guideContent('builds');
  assert.match(builds, /施法间隔与承伤的功法合计系数各最低取基础的 30%/);
  assert.match(builds, /之后仍乘丹药及相应奇物效果，最终值可更低/);
  assert.match(builds, /未持有奇物时的修习效果/);
  assert.match(builds, /养魂木另使淬体气血与悟道增伤的加成提高 30%/);
  assert.doesNotMatch(builds, /施法间隔最低为基础的 30%|承伤最低为基础的 30%/);
});

test('预警帮助区分前六境小怪、秘境妖王与独立天劫', () => {
  const combat = guide.guideContent('combat');
  assert.match(combat, /前六境普通与精英妖物的远程攻击出手前会蓄力约 0\.65 秒/);
  assert.match(combat, /前六境中，第二、六境妖王登场 1 秒后首次出招/);
  assert.match(combat, /秘境妖王的地面落阵至少预警 1\.2 秒/);
  assert.match(combat, /小怪和独立天劫按各自节奏，天劫预警逐次缩短/);
  assert.match(combat, /挑战最多 45 秒，且在妖王预定登场前 12 秒截止/);
  assert.match(combat, /第七境小怪随时间逐渐增强，5:00 达到/);
  assert.doesNotMatch(combat, /其余秘境与独立天劫为 2\.5 秒|地面招式至少预警 1\.2 秒/);
});

test('离界帮助说明法宝、丹药与奇物共用一份传承名额', () => {
  const builds = guide.guideContent('builds');
  assert.match(builds, /已收藏法宝、丹囊现有丹药或随身奇物中选择一物/);
  assert.match(builds, /三类共用一个赠物名额/);
  assert.match(builds, /奇物在新世持有即生效/);
  assert.match(guide.guideContent('save'), /法宝、现有丹药或随身奇物中选一物赠给少年/);
});

test('入宗凡品赠药与精研门槛赠药分开说明', () => {
  const mortal = guide.guideContent('mortal');
  assert.match(mortal, /每次成功付费拜入宗门，另获赠 1 枚随机凡品丹药，收入丹囊，不自动服用/);
  assert.match(mortal, /完成第 5 阶赠 1 颗随机灵品丹药/);
  assert.match(mortal, /完成第 10 阶赠 1 颗随机限时珍品丹药/);
});

test('寿终与弃劫先落幕可留影，确认轮回才清空', () => {
  const save = guide.guideContent('save');
  assert.match(save, /不再借寿时进入「此世寿终」，可先留存此世；确认轮回后才清空本世进度/);
  assert.match(save, /确认放弃后进入「止于天劫」落幕页，可先留存此世，再确认轮回/);
  assert.doesNotMatch(save, /放弃续命则强制轮回|主动放弃并确认后强制轮回/);
});

test('配套功法优先级以默认培养倾向为前提', () => {
  assert.match(guide.guideContent('builds'), /自动历练采用默认培养倾向时/);
  assert.match(guide.guideContent('builds'), /其他培养倾向按设置取舍/);
  assert.match(guide.guideContent('combat'), /默认路线优先觉醒与修习已学功法/);
  assert.match(guide.guideContent('combat'), /已有法宝全满且还有空位时，优先补入新法宝/);
  assert.match(guide.guideContent('combat'), /略偏向已有配套功法的搭配。其他倾向按设置取舍/);
});

test('首次打开指南合并并发加载，成功后重开直接复用模块', async () => {
  let finish!: (value: typeof guide) => void;
  let calls = 0;
  const source = new GuideSource(() => {
    calls++;
    return new Promise((resolve) => {
      finish = resolve;
    });
  });
  const first = source.load();
  const second = source.load();
  assert.equal(first, second);
  assert.equal(source.current, null);
  await Promise.resolve();
  finish(guide);
  assert.equal(await first, guide);
  assert.equal(source.current, guide);
  assert.equal(await source.load(), guide);
  assert.equal(calls, 1);
});

test('网络失败可以重新加载，不留下永久失败的promise；成功后保留全部说明分类', async () => {
  let calls = 0;
  const source = new GuideSource(async () => {
    if (++calls === 1) throw Error('网络失败');
    return guide;
  });
  await assert.rejects(source.load(), /网络失败/);
  assert.equal(source.current, null);
  const loaded = await source.load();
  assert.ok(loaded.GUIDE_TABS.length >= 5);
  assert.match(loaded.guideContent('basics'), /局内灵气与永久修为/);
  assert.match(loaded.guideContent('combat'), /雷路/);
  assert.equal(calls, 2);
});

test('加载器同步失败也可以重试，指南加载不在构造时发生', async () => {
  let calls = 0;
  const source = new GuideSource(() => {
    if (++calls === 1) throw Error('暂时不可用');
    return Promise.resolve(guide);
  });
  assert.equal(calls, 0);
  await assert.rejects(source.load(), /暂时不可用/);
  assert.equal(await source.load(), guide);
});

test('连续失败递增模块重试身份，并发请求只占一次尝试', async () => {
  const attempts: number[] = [];
  const source = new GuideSource(async (attempt) => {
    attempts.push(attempt);
    if (attempt < 2) throw Error('断网');
    return guide;
  });
  const first = source.load();
  assert.equal(first, source.load());
  await assert.rejects(first, /断网/);
  await assert.rejects(source.load(), /断网/);
  assert.equal(await source.load(), guide);
  assert.equal(await source.load(), guide);
  assert.deepEqual(attempts, [0, 1, 2]);
});
