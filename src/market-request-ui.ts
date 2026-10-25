import type { SaveData } from './progress.ts';
import type { marketRequest } from './market-social.ts';

type MarketRequest = NonNullable<ReturnType<typeof marketRequest>>;

export function requestForgeDescription(save: SaveData, request: MarketRequest) {
  if (request.kind !== 'artifact') return '';
  const requirement = `至少炼器${request.minimumLevel}阶；`;
  if (!save.artifacts.includes(request.id)) return requirement + '尚未持有此法宝。';
  const level = save.forge[request.id] || 0;
  return (
    requirement +
    `现有炼器${level}阶，${level < request.minimumLevel ? '尚未达到要求' : '按此阶数交出并估价'}。`
  );
}

export function requestPriceLabel(save: SaveData, request: MarketRequest) {
  return request.kind === 'artifact' &&
    (!save.artifacts.includes(request.id) || (save.forge[request.id] || 0) < request.minimumLevel)
    ? `按炼器${request.forgeLevel}阶参考报价`
    : '交货实收';
}
