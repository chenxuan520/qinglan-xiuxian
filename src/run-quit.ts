import type { TelemetryEvent } from './telemetry.ts';

// 离开页面时历练仍在进行：只补一条 quit，同一局不重复。
export interface RunQuitState {
  tracked: boolean;
}

export interface QuitGame {
  state: string;
  stage: number;
  difficulty: number;
  tribulation: number;
  time: number;
  level: number;
  kills: number;
}

export function createRunQuitState(): RunQuitState {
  return { tracked: false };
}

export function trackRunQuitOnLeave(
  state: RunQuitState,
  game: QuitGame | null,
  settled: boolean,
  lifeStats: () => Partial<TelemetryEvent>,
  track: (event: TelemetryEvent) => void,
  flush: () => void,
) {
  if (!game || settled || state.tracked) return false;
  if (game.state !== 'playing' && game.state !== 'paused') return false;
  state.tracked = true;
  track({
    type: 'run-end',
    ...lifeStats(),
    stage: game.stage,
    difficulty: game.difficulty,
    ...(game.tribulation ? { tribulation: game.tribulation } : {}),
    result: 'quit',
    seconds: Math.round(game.time),
    level: game.level,
    kills: game.kills,
  });
  flush();
  return true;
}
