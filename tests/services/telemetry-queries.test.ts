import test from 'node:test';
import assert from 'node:assert/strict';
import {
  firstRunTelemetrySql,
  stagesTelemetrySql,
} from '../../scripts/telemetry/telemetry-queries.ts';

const column = {
  type: 'blob1',
  result: 'blob6',
  stage: 'double1',
  seconds: 'double5',
  runs: 'double4',
  tribulation: 'double8',
};
const recent = "timestamp > NOW() - INTERVAL '7' DAY AND blob3 != 'verification'";

test('各境历练新增中途离开列，结算数、时长与通关率排除 quit', () => {
  const sql = stagesTelemetrySql(column, recent);
  assert.match(sql, /sumIf\(_sample_interval, blob1 = 'run-end' AND blob6 = 'quit'\) AS quit/);
  assert.match(
    sql,
    /sumIf\(_sample_interval \* double5, blob1 = 'run-end' AND blob6 != 'quit'\) AS seconds/,
  );
  assert.match(sql, /sumIf\(_sample_interval, blob1 = 'run-end' AND blob6 != 'quit'\) AS ended/);
  assert.doesNotMatch(sql, /blob6 = 'quit'\) AS ended/);
  assert.ok(sql.includes(recent));
});

test('首局表按 runs 与结果分组，离开时长只统计首局 quit', () => {
  const sql = firstRunTelemetrySql(column, recent);
  assert.match(sql, /sumIf\(_sample_interval, blob1 = 'run-start' AND double4 = 0\) AS starts/);
  for (const [field, resultValue] of [
    ['won', 'won'],
    ['lost', 'lost'],
    ['abandoned', 'abandon'],
  ]) {
    assert.ok(
      sql.includes(
        `sumIf(_sample_interval, blob1 = 'run-end' AND double4 = 1 AND blob6 = '${resultValue}') AS ${field}`,
      ),
      field,
    );
  }
  assert.ok(
    sql.includes(
      "sumIf(_sample_interval, blob1 = 'run-end' AND double4 = 0 AND blob6 = 'quit') AS quit",
    ),
  );
  assert.ok(
    sql.includes(
      "sumIf(_sample_interval * double5, blob1 = 'run-end' AND double4 = 0 AND blob6 = 'quit') AS quitSeconds",
    ),
  );
  assert.match(sql, /double8 = -1/);
  assert.ok(sql.includes(recent));
});
