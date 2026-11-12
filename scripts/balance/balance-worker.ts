import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parentPort, workerData } from 'node:worker_threads';
import { caseKey } from './balance-policy.ts';
import type { BalanceCase } from './balance-policy.ts';
import type { AutoplayBuild } from '../../src/battle/autoplay-build.ts';

const { root, stageCount, autoplayBuild } = workerData as {
  root: string;
  stageCount: number;
  autoplayBuild?: AutoplayBuild;
};
// 按请求的工作树加载模拟器，历史对照不能误用当前版本的 Game。
const { simulateCampaign } = await import(
  pathToFileURL(join(root, 'scripts/balance/balance-simulation.ts')).href
);
parentPort!.on('message', (c: BalanceCase | null) => {
  if (c === null) {
    parentPort!.close();
    return;
  }
  try {
    parentPort!.postMessage(simulateCampaign(c, stageCount, autoplayBuild));
  } catch (error) {
    parentPort!.postMessage({
      case: c,
      key: caseKey(c),
      error: error instanceof Error ? error.message : String(error),
    });
  }
});
