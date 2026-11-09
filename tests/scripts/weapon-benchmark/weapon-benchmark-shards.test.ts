import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir, availableParallelism } from 'node:os';
import { join } from 'node:path';
import { Worker } from 'node:worker_threads';
import { parseWeaponOptions } from '../../../scripts/weapon-benchmark/weapon-benchmark.ts';
import {
  weaponBenchmarkPlan,
  weaponCampaignPlan,
  weaponCaseKey,
  WEAPON_BENCHMARK_PROTOCOL,
} from '../../../scripts/weapon-benchmark/weapon-benchmark-policy.ts';
import {
  readWeaponShards,
  weaponShardOptions,
  weaponPlanHash,
  weaponShardMain,
} from '../../../scripts/weapon-benchmark/weapon-benchmark-shards.ts';
import { buildWeaponReport } from '../../../scripts/weapon-benchmark/weapon-benchmark-report.ts';

const identity = {
  commit: 'a'.repeat(40),
  sourceHash: 'b'.repeat(64),
  toolHash: 'c'.repeat(64),
  runId: 123,
};
const options = {
  ...parseWeaponOptions(['--extended']),
  weapons: ['sword', 'orbit'] as const,
  seeds: 1,
  workers: 1,
};
const fixtureOptions = { ...options, weapons: [...options.weapons] };
const observation = (job: any) => ({
  ...job,
  state: 'lost',
  seconds: 1,
  damage: 1,
  ownDamage: 1,
  damageBySource: { [job.weapon]: 1 },
  heal: 0,
  hurt: 0,
  growthHp: 0,
  growthHpLoss: 0,
  maxHp: 80,
  hp: 1,
  endWeapons: [],
  endPassives: {},
  bosses: [],
  at6: null,
  atEvolve: null,
  entry: {
    root: job.root,
    elements: ['metal'],
    weapons: [],
    level: 35,
    passives: { power: 5, haste: 3, guard: 3, magnet: 3 },
  },
});
function row(job: any) {
  if (job.kind === 'natural') return observation(job);
  const candidate = observation(job),
    reference = observation({ ...job, weapon: job.reference });
  return { job, candidate, reference, actualSimulations: job.weapon === job.reference ? 1 : 2 };
}
function campaign(c: any) {
  return {
    case: c,
    key: [c.root, c.path, c.starter, c.device, c.profile, c.difficulty, c.seed].join('/'),
    cleared: 0,
    complete: false,
    stop: 'lost',
    seconds: 1,
    adSeconds: 0,
    cultivation: 0,
    ads: { supplies: 0, borrow: 0, revive: 0 },
    battles: [
      {
        stage: 0,
        attempt: 1,
        state: 'lost',
        seconds: 1,
        entryStep: 0,
        exitStep: 0,
        cultivation: 0,
        bosses: [],
        trials: [],
        maxAliveBosses: 0,
        firstClearCultivation: 0,
        at90: null,
      },
    ],
  };
}
const json = (p: string, v: any) => writeFileSync(p, JSON.stringify(v));
const lines = (p: string, v: any[]) =>
  writeFileSync(p, v.map((r) => JSON.stringify(r)).join('\n') + '\n');
function fixture(root: string) {
  for (let index = 0; index < 2; index++) {
    const out = join(root, String(index));
    mkdirSync(out);
    const subset = weaponShardOptions(fixtureOptions, index, 2),
      plan = weaponBenchmarkPlan(subset),
      campaignPlan = weaponCampaignPlan(subset);
    json(join(out, 'shard.json'), {
      ...identity,
      shardProtocol: 1,
      index,
      count: 2,
      planHash: weaponPlanHash(fixtureOptions),
      startedAt: 1000 + index,
      finishedAt: 2000 + index,
      runner: { node: 'v22', cpuModel: 'fixture', availableCpus: 1 },
    });
    json(join(out, 'manifest.json'), {
      ...identity,
      protocolVersion: WEAPON_BENCHMARK_PROTOCOL,
      options: subset,
      plan,
      campaignPlan,
      planned: plan.length + campaignPlan.length,
      shards: ['samples-0.jsonl'],
    });
    json(join(out, 'complete.json'), {
      planned: plan.length + campaignPlan.length,
      returned: plan.length + campaignPlan.length,
      elapsedSeconds: 1,
    });
    lines(join(out, 'samples-0.jsonl'), plan.map(row));
    lines(join(out, 'campaigns.jsonl'), campaignPlan.map(campaign));
  }
}

test('完整10400计划在八片中恰好覆盖，所有可用CPU均可使用，不保留3/64限制', () => {
  const full = parseWeaponOptions(['--extended']),
    before = structuredClone(full);
  const parts = Array.from({ length: 8 }, (_v, index) => weaponShardOptions(full, index, 8));
  assert.deepEqual(parts.flatMap((p) => p.weapons).sort(), [...full.weapons].sort());
  assert.deepEqual(
    parts.flatMap((p) => weaponBenchmarkPlan(p).map(weaponCaseKey)).sort(),
    weaponBenchmarkPlan(full).map(weaponCaseKey).sort(),
  );
  assert.deepEqual(
    parts
      .flatMap((p) => weaponCampaignPlan(p))
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
    weaponCampaignPlan(full).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
  );
  assert.equal(
    parts.reduce((n, p) => n + weaponBenchmarkPlan(p).length + weaponCampaignPlan(p).length, 0),
    10400,
  );
  const weight = (o: typeof full) => weaponBenchmarkPlan(o).length + weaponCampaignPlan(o).length;
  const loads = parts.map(weight);
  const biggest = Math.max(...full.weapons.map((id) => weight({ ...full, weapons: [id] })));
  assert.ok(
    Math.max(...loads) - Math.min(...loads) <= biggest,
    '不能把附加复验集中到同一片拖长尾部',
  );
  assert.deepEqual(full, before);
  assert.equal(full.workers, availableParallelism());
  assert.equal(parseWeaponOptions(['--workers', '65']).workers, 65);
  for (const [index, count] of [
    [-1, 8],
    [8, 8],
    [0, 0],
    [0, 37],
    [0.5, 8],
  ])
    assert.throws(() => weaponShardOptions(full, index, count));
});

test('只合并原始观测并统一统计，保留原单机文件分组次序及连续流程顺序', () => {
  const root = mkdtempSync(join(tmpdir(), 'qinglan-weapon-shards-'));
  try {
    fixture(root);
    const r = readWeaponShards(root, fixtureOptions, identity, 2);
    const plan = weaponBenchmarkPlan(fixtureOptions),
      flows = weaponCampaignPlan(fixtureOptions);
    const original = Array.from({ length: r.workers }, (_v, index) =>
      plan.filter((_job, i) => i % r.workers === index).map(row),
    ).flat();
    assert.deepEqual(r.rows, original);
    assert.deepEqual(r.campaigns, flows.map(campaign));
    const meta = {
      ...identity,
      elapsedSeconds: 10,
      planned: plan.length + flows.length,
      error: null,
    };
    const a = buildWeaponReport(
        r.rows,
        r.campaigns,
        { ...fixtureOptions, workers: r.workers },
        meta,
      ),
      b = buildWeaponReport(
        original,
        flows.map(campaign),
        { ...fixtureOptions, workers: r.workers },
        meta,
      );
    a.generatedAt = b.generatedAt;
    assert.deepEqual(a, b);
    assert.equal(r.startedAt, 1000);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('缺片、混源、重复、漏样本、错误身份或类型、非法路径及未来时间均拒绝', () => {
  const changes = [
    (root: string) => rmSync(join(root, '0', 'shard.json')),
    ...['commit', 'sourceHash', 'toolHash', 'runId', 'planHash', 'shardProtocol', 'index'].map(
      (field) => (root: string) => {
        const p = join(root, '1', 'shard.json'),
          r = JSON.parse(readFileSync(p, 'utf8'));
        r[field] = field === 'index' ? 0 : 'wrong';
        json(p, r);
      },
    ),
    (root: string) => {
      const p = join(root, '0', 'complete.json'),
        r = JSON.parse(readFileSync(p, 'utf8'));
      r.returned--;
      json(p, r);
    },
    (root: string) => {
      const p = join(root, '0', 'manifest.json'),
        r = JSON.parse(readFileSync(p, 'utf8'));
      r.shards = ['../escape.jsonl'];
      json(p, r);
    },
    (root: string) => {
      const p = join(root, '0', 'samples-0.jsonl'),
        r = readFileSync(p, 'utf8')
          .trim()
          .split('\n')
          .map((s) => JSON.parse(s));
      r.pop();
      lines(p, r);
    },
    (root: string) => {
      const p = join(root, '0', 'samples-0.jsonl'),
        r = readFileSync(p, 'utf8')
          .trim()
          .split('\n')
          .map((s) => JSON.parse(s));
      r[1] = r[0];
      lines(p, r);
    },
    (root: string) => {
      const p = join(root, '0', 'samples-0.jsonl'),
        r = readFileSync(p, 'utf8')
          .trim()
          .split('\n')
          .map((s) => JSON.parse(s));
      const job = r[0].job ?? r[0];
      job.seed = String(job.seed);
      lines(p, r);
    },
    (root: string) => {
      const p = join(root, '0', 'shard.json'),
        r = JSON.parse(readFileSync(p, 'utf8'));
      r.finishedAt = Date.now() + 86400000;
      json(p, r);
    },
  ];
  for (const change of changes) {
    const root = mkdtempSync(join(tmpdir(), 'qinglan-weapon-invalid-'));
    try {
      fixture(root);
      change(root);
      assert.throws(() => readWeaponShards(root, fixtureOptions, identity, 2));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test('配对两侧分别绑定完整计划，种子、设备、阶段及入场灵根不能串用', () => {
  for (const [side, field, value] of [
    ['candidate', 'seed', -1],
    ['reference', 'device', 'other'],
    ['candidate', 'stage', 0],
    ['reference', 'root', 'heaven'],
    ['reference', 'entryRoot', 'heaven'],
  ]) {
    const root = mkdtempSync(join(tmpdir(), 'qinglan-weapon-pair-'));
    try {
      fixture(root);
      const p = join(root, '0', 'samples-0.jsonl');
      const rows = readFileSync(p, 'utf8')
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line));
      const pair = rows.find((r) => r.job && r.job.weapon !== r.job.reference);
      if (field === 'entryRoot') pair[side].entry.root = value;
      else pair[side][field] = value;
      lines(p, rows);
      assert.throws(() => readWeaponShards(root, fixtureOptions, identity, 2), /身份|入场/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test('真实自然与双侧配对样本跨worker分配后每个原始数值不变', async () => {
  const root = mkdtempSync(join(tmpdir(), 'qinglan-weapon-real-'));
  const plan = weaponBenchmarkPlan({ ...fixtureOptions, weapons: ['sword'], seeds: 1 });
  const jobs = [
    ...plan.filter((c) => c.kind === 'natural' && c.root === 'heaven' && c.device === 'phone'),
    ...plan
      .filter((c) => c.kind === 'pair' && c.device === 'phone' && c.reference !== c.weapon)
      .slice(0, 2),
  ];
  const run = async (groups: any[][], label: string) => {
    const files = groups.map((_g, i) => join(root, `${label}-${i}.jsonl`));
    await Promise.all(
      groups.map(
        (jobs, index) =>
          new Promise<void>((ok, fail) => {
            writeFileSync(files[index], '');
            const worker = new Worker(
              new URL(
                '../../../scripts/weapon-benchmark/weapon-benchmark-simulation.ts',
                import.meta.url,
              ),
              { workerData: { weaponBenchmark: true, jobs, file: files[index] } },
            );
            worker.on('error', fail);
            worker.on('exit', (code) => (code === 0 ? ok() : fail(Error(`worker ${code}`))));
          }),
      ),
    );
    return files
      .flatMap((file) =>
        readFileSync(file, 'utf8')
          .trim()
          .split('\n')
          .filter(Boolean)
          .map((line) => JSON.parse(line)),
      )
      .sort((a, b) => weaponCaseKey(a.job ?? a).localeCompare(weaponCaseKey(b.job ?? b)));
  };
  try {
    assert.equal(jobs.length, 5);
    assert.deepEqual(
      await run([jobs], 'one'),
      await run([jobs.filter((_v, i) => i % 2 === 0), jobs.filter((_v, i) => i % 2 === 1)], 'two'),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('合并缺损时仍写失败公开报告并拒绝伪造完整10400结果', async () => {
  const root = mkdtempSync(join(tmpdir(), 'qinglan-weapon-failed-'));
  try {
    const out = join(root, 'report');
    await assert.rejects(weaponShardMain(['--merge', join(root, 'missing'), '--out', out]));
    const r = JSON.parse(readFileSync(join(out, 'summary.json'), 'utf8'));
    assert.equal(r.state, 'failed');
    assert.equal(r.planned, 10400);
    assert.equal(r.returned, 0);
    assert.ok(r.error);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('法宝CI八片并行保留原始失败证据，合并失败仍上传公开报告且取消不发布', () => {
  const source = readFileSync(
    new URL('../../../.github/workflows/weapon-benchmark.yml', import.meta.url),
    'utf8',
  );
  const shards = source.split('\n  shards:')[1].split('\n  benchmark:')[0],
    merge = source.split('\n  benchmark:')[1].split('\n  publish-report:')[0];
  assert.match(shards, /shard: \[0, 1, 2, 3, 4, 5, 6, 7\]/);
  assert.match(shards, /fail-fast: false/);
  assert.doesNotMatch(shards, /max-parallel|--workers/);
  assert.match(shards, /--shard \$\{\{ matrix.shard \}\}\/8/);
  for (const file of [
    'manifest.json',
    'samples-*.jsonl',
    'campaigns.jsonl',
    'complete.json',
    'shard.json',
  ])
    assert.ok(shards.includes('/' + file));
  assert.match(shards, /name: weapon-raw-\$\{\{ matrix.shard \}\}/);
  assert.match(merge, /needs: shards\s+if: always\(\) && !cancelled\(\)/);
  assert.match(merge, /--pattern 'weapon-raw-\*'/);
  assert.match(merge, /REPORT_RUN: \$\{\{ github.run_id \}\}/);
  assert.match(
    merge,
    /Merge complete weapon experience evaluation\s+if: always\(\) && !cancelled\(\)/,
  );
  assert.match(merge, /name: weapon-daily-report/);
  assert.match(merge, /retention-days: 90/);
  assert.match(source, /needs.benchmark.result != 'cancelled'/);
  assert.match(
    source,
    /concurrency:[\s\S]*group: weapon-benchmark-\$\{\{ github.repository \}\}-\$\{\{ github.ref \}\}\s+cancel-in-progress: true/,
  );
  assert.doesNotMatch(source, /continue-on-error/);
});
