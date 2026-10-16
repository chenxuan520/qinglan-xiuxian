import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  symlinkSync,
  rmSync,
  readFileSync,
  realpathSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { TREASURES, STAGE_REALM_STEPS } from '../src/data.ts';
import { realmInfo } from '../src/progress.ts';
import {
  selectBenchmarkWeapons,
  weaponBenchmarkPlan,
  weaponCampaignPlan,
  weaponCaseKey,
} from '../scripts/weapon-benchmark-policy.ts';
import {
  parseWeaponOptions,
  validateWeaponOutput,
  verifyCampaigns,
} from '../scripts/weapon-benchmark.ts';
import {
  setupNatural,
  setupPair,
  pairSpec,
  instrument,
} from '../scripts/weapon-benchmark-simulation.ts';
import {
  median,
  weaponBattleStats,
  weaponPairStats,
  weaponClusterInterval,
  verifyWeaponCoverage,
  buildWeaponReport,
  writeWeaponReport,
} from '../scripts/weapon-benchmark-report.ts';
import {
  eligibleWeaponRun,
  checkDailyWeaponReport,
  WEAPON_PUBLIC_FILES,
} from '../scripts/restore-weapon-report.ts';
import { validWeaponReport } from '../src/weapon-report.ts';
import { weaponMonitorHTML } from '../src/monitor-weapons.ts';

const options = parseWeaponOptions([]);
const meta = {
  commit: 'a'.repeat(40),
  sourceHash: 'b'.repeat(64),
  runId: 123,
  elapsedSeconds: 100,
  planned: 10400,
  error: 'worker失败',
};
const failure = () => buildWeaponReport([], [], { ...options, extended: true }, meta);
const observation = (state = 'won', seconds = 5, bosses: any[] = []) => ({
  state,
  seconds,
  bosses,
  at6: null,
  atEvolve: null,
  damage: 100,
  ownDamage: 40,
});

test('36法宝标准与完整计划保持覆盖；筛选、扩样和种子复验不重复', () => {
  const plan = weaponBenchmarkPlan(options);
  assert.equal(plan.length, 8640);
  assert.equal(plan.filter((c) => c.kind === 'natural').length, 4320);
  const extended = { ...options, extended: true };
  assert.equal(weaponBenchmarkPlan(extended).length, 10320);
  assert.equal(weaponCampaignPlan(extended).length, 80);
  assert.deepEqual(selectBenchmarkWeapons('青莲灯,pagoda,青莲灯'), ['orbit', 'pagoda']);
  for (const seeds of [1, 11, 100]) {
    const p = weaponBenchmarkPlan({ ...extended, weapons: ['orbit'], seeds });
    assert.equal(new Set(p.map(weaponCaseKey)).size, p.length);
    assert.ok(p.every((c) => c.weapon === 'orbit'));
    const primary = new Set(
      p.filter((c) => c.kind === 'pair' && c.index < seeds).map((c) => c.seed),
    );
    assert.ok(
      p.filter((c) => c.kind === 'pair' && c.index >= seeds).every((c) => !primary.has(c.seed)),
    );
  }
  for (const args of [
    ['--seeds', '0'],
    ['--seeds', '101'],
    ['--seeds', '1.1'],
    ['--workers', '0'],
    ['--weapons', 'invalid'],
    ['--out'],
    ['--plan', '--report-only'],
    ['--seeds', '1', '--seeds', '2'],
  ])
    assert.throws(() => parseWeaponOptions(args));
});

test('自然流程采用实际关卡境界；配对同时保留相同底盘、槽位和总投入', () => {
  for (const stage of [0, 2, 5]) {
    const g = setupNatural({
      weapon: 'orbit',
      root: 'triple',
      index: 0,
      stage,
      seed: 123,
      device: 'phone',
    });
    assert.equal(realmInfo(g.save.cultivation).step, STAGE_REALM_STEPS[stage]);
    assert.equal(g.weapons.length, 1);
    assert.equal(g.weapons[0].level, 1);
    assert.ok(Object.values(g.save.training).every((x) => x === 0));
  }
  const job = weaponBenchmarkPlan(options).find(
    (c) => c.kind === 'pair' && c.weapon === 'orbit',
  ) as any;
  const spec = pairSpec(job),
    a = setupPair(job, job.weapon, spec),
    b = setupPair(job, job.reference, spec);
  assert.deepEqual(a.weapons.slice(0, 5), b.weapons.slice(0, 5));
  assert.deepEqual(a.rootElements, b.rootElements);
  assert.equal(a.level, b.level);
  assert.equal(
    Object.values(a.passives).reduce((s, x) => s + x, 0),
    14,
  );
  assert.equal(Object.keys(a.passives).length, 4);
});

test('观测区分有效治疗、升级回血与过量伤害，不依赖净掉血推算', () => {
  const g: any = setupNatural({
    weapon: 'orbit',
    root: 'heaven',
    index: 0,
    stage: 0,
    seed: 123,
    device: 'phone',
  });
  const meter = instrument(g);
  g.player.hp = 30;
  g.heal(10000);
  assert.equal(meter.counters.heal, g.player.maxHp - 30);
  g.state = 'upgrade';
  g.player.hp = 20;
  g.choices = [{ type: 'heal', id: 'heal', level: 1 }];
  assert.equal(g.choose(0), true);
  assert.ok(meter.counters.choiceHeal > 0);
  const before = g.player.hp;
  g.player.invincible = 0;
  g.hurtPlayer(1e9);
  assert.equal(meter.counters.hurt, before);
});

test('配对保留未解决妖王和自检样本，胜利按窗口成功计，区间不随worker顺序变化', () => {
  const dead = { at: 100, deadAt: 105, observed: 5, hp: 0 },
    alive = { at: 100, deadAt: null, observed: 30, hp: 0.6 };
  const stats = weaponBattleStats([
    observation('won', 5, [dead]),
    observation('lost', 30, [alive]),
  ]);
  assert.equal(stats.bossUnresolved, 1);
  assert.equal(stats.remainingHp, 60);
  assert.equal(stats.observedSeconds, 30);
  assert.equal(median([]), null);
  const rows = [0, 1, 2].flatMap((index) =>
    [0, 1].map((device) => ({
      job: { index, device, weapon: 'orbit', reference: 'sword' },
      candidate: observation('won', 5),
      reference: observation('lost', 20 + index),
    })),
  );
  const p = weaponPairStats([...rows, { ...rows[0], job: { ...rows[0].job, reference: 'orbit' } }]);
  assert.equal(p.n, 6);
  assert.equal(p.selfChecks, 1);
  assert.equal(p.survivalDifference, 84);
  assert.deepEqual(
    weaponClusterInterval(rows, (r) => Number(r.state === 'won')),
    weaponClusterInterval([...rows].reverse(), (r) => Number(r.state === 'won')),
  );
  assert.equal(
    weaponClusterInterval(
      rows.filter((r) => r.job.index === 0),
      (r) => r.seconds,
    ),
    null,
  );
  const plan = weaponBenchmarkPlan({ ...options, weapons: ['orbit'], seeds: 1 });
  assert.throws(() => verifyWeaponCoverage([], plan), /缺少/);
  assert.throws(
    () => verifyWeaponCoverage([{ kind: 'natural', weapon: 'not-planned' }], plan),
    /计划外/,
  );
  assert.throws(
    () => verifyCampaigns([], weaponCampaignPlan({ ...options, extended: true })),
    /漏样本/,
  );
});

test('输出禁止进入仓库正文或通过符号链接绕过；允许忽略产物和仓库外路径', () => {
  // 输出路径按真实路径返回；macOS 的系统临时目录本身经过符号链接。
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'weapon-path-')));
  try {
    const repo = join(root, 'repo');
    mkdirSync(join(repo, 'src'), { recursive: true });
    mkdirSync(join(repo, 'artifacts'));
    symlinkSync(join(repo, 'src'), join(repo, 'artifacts', 'escape'));
    assert.throws(() => validateWeaponOutput(join(repo, 'docs', 'report'), repo));
    assert.throws(() => validateWeaponOutput(join(repo, 'artifacts', 'escape', 'report'), repo));
    assert.equal(
      validateWeaponOutput(join(repo, 'artifacts', 'report'), repo),
      join(repo, 'artifacts', 'report'),
    );
    assert.equal(validateWeaponOutput(join(root, 'outside'), repo), join(root, 'outside'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('失败日报仍可发布，取消或外仓不能取代正式报告；源提交、运行号、36法宝及完整文件必须一致', () => {
  const repo = 'chenxuan520/qinglan-xiuxian';
  const run = {
    path: '.github/workflows/weapon-benchmark.yml',
    head_branch: 'master',
    head_repository: { full_name: repo },
    event: 'schedule',
    status: 'completed',
    conclusion: 'failure',
  };
  assert.equal(eligibleWeaponRun(run, repo), true);
  for (const change of [
    { conclusion: 'cancelled' },
    { event: 'pull_request' },
    { head_branch: 'feat/a' },
    { head_repository: { full_name: 'other/repo' } },
    { status: 'in_progress' },
  ])
    assert.equal(eligibleWeaponRun({ ...run, ...change }, repo), false);
  const root = mkdtempSync(join(tmpdir(), 'weapon-report-'));
  try {
    const report = failure();
    assert.equal(validWeaponReport(report), true);
    writeWeaponReport(root, report);
    assert.equal(checkDailyWeaponReport(root, meta.commit, 123).state, 'failed');
    assert.throws(() => checkDailyWeaponReport(root, 'c'.repeat(40), 123));
    assert.throws(() => checkDailyWeaponReport(root, meta.commit, 124));
    assert.ok(WEAPON_PUBLIC_FILES.every((f) => readFileSync(join(root, f)).length));
    rmSync(join(root, 'pairs.csv'));
    assert.throws(() => checkDailyWeaponReport(root));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('公开摘要拒绝漏样本、错误数值和损坏计数；失败与陈旧状态明确显示，错误字符串不能执行HTML', () => {
  const report = failure();
  const emptyComplete = { ...report, state: 'complete', error: null, planned: 1, returned: 1 };
  assert.equal(validWeaponReport(emptyComplete), false);
  assert.equal(validWeaponReport({ ...report, protocolVersion: 99 }), false);
  for (const mutate of [
    (r: any) => (r.state = 'complete'),
    (r: any) => (r.counts.natural = -1),
    (r: any) => (r.elapsedSeconds = Infinity),
    (r: any) => (r.returned = 1),
    (r: any) => (r.options.weapons = [...TREASURES.map((t) => t.id), 'orbit']),
  ]) {
    const r = structuredClone(report);
    mutate(r);
    assert.equal(validWeaponReport(r), false);
  }
  const html = weaponMonitorHTML(
    { ...report, error: '<img src=x onerror=alert(1)>' },
    Date.parse(report.generatedAt) + 40 * 3600_000,
  );
  assert.match(html, /测评执行失败/);
  assert.match(html, /超过36小时/);
  assert.match(html, /&lt;img/);
  assert.ok(!html.includes('<img'));
  assert.ok(!html.includes('测评执行完整'));
  const dir = mkdtempSync(join(tmpdir(), 'weapon-html-'));
  try {
    writeWeaponReport(dir, report);
    const page = readFileSync(join(dir, 'index.html'), 'utf8');
    assert.match(page, /\.\.\/favicon\.svg/);
    assert.ok(!/fonts\//.test(page));
    assert.ok(!/summary\.md.*fetch/.test(page));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
