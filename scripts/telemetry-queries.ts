// Analytics Engine 查询语句集中在这里，便于测试断言列与筛选条件。
const table = 'qinglan_events';
const weight = '_sample_interval';

export type TelemetryColumns = Record<string, string>;

export function stagesTelemetrySql(column: TelemetryColumns, recent: string) {
  const { type, result, stage, seconds, tribulation } = column;
  return `SELECT ${stage} AS stage,
    sumIf(${weight}, ${type} = 'run-start') AS starts,
    sumIf(${weight}, ${type} = 'run-end' AND ${result} = 'won') AS won,
    sumIf(${weight}, ${type} = 'run-end' AND ${result} = 'lost') AS lost,
    sumIf(${weight}, ${type} = 'run-end' AND ${result} = 'abandon') AS abandoned,
    sumIf(${weight}, ${type} = 'run-end' AND ${result} = 'quit') AS quit,
    sumIf(${weight} * ${seconds}, ${type} = 'run-end' AND ${result} != 'quit') AS seconds,
    sumIf(${weight}, ${type} = 'run-end' AND ${result} != 'quit') AS ended
  FROM ${table}
  WHERE ${recent} AND ${tribulation} = -1 AND (${type} = 'run-start' OR ${type} = 'run-end')
  GROUP BY stage ORDER BY stage`;
}

export function firstRunTelemetrySql(column: TelemetryColumns, recent: string) {
  const { type, result, stage, seconds, runs, tribulation } = column;
  return `SELECT ${stage} AS stage,
    sumIf(${weight}, ${type} = 'run-start' AND ${runs} = 0) AS starts,
    sumIf(${weight}, ${type} = 'run-end' AND ${runs} = 1 AND ${result} = 'won') AS won,
    sumIf(${weight}, ${type} = 'run-end' AND ${runs} = 1 AND ${result} = 'lost') AS lost,
    sumIf(${weight}, ${type} = 'run-end' AND ${runs} = 1 AND ${result} = 'abandon') AS abandoned,
    sumIf(${weight}, ${type} = 'run-end' AND ${runs} = 0 AND ${result} = 'quit') AS quit,
    sumIf(${weight} * ${seconds}, ${type} = 'run-end' AND ${runs} = 0 AND ${result} = 'quit') AS quitSeconds
  FROM ${table}
  WHERE ${recent} AND ${tribulation} = -1 AND (${type} = 'run-start' OR ${type} = 'run-end')
  GROUP BY stage ORDER BY stage`;
}
