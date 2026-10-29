import { MARKET_FELLOW_SETTINGS, type MarketFellowState } from './market-fellow-data.ts';

export function marketFellowLife(story: MarketFellowState) {
  const originalEnd = story.metAt + MARKET_FELLOW_SETTINGS.remainingYears;
  const goldenAt =
    story.chosenAt !== null && story.chosenAt + MARKET_FELLOW_SETTINGS.outcomeYears < originalEnd
      ? story.chosenAt + MARKET_FELLOW_SETTINGS.outcomeYears
      : null;
  const goldenEnd = story.metAt + MARKET_FELLOW_SETTINGS.goldenRemainingYears;
  const soulAt =
    goldenAt !== null &&
    story.choice === 'travel' &&
    story.chosenAt! + MARKET_FELLOW_SETTINGS.soulYears < goldenEnd
      ? story.chosenAt! + MARKET_FELLOW_SETTINGS.soulYears
      : null;
  return {
    goldenAt,
    soulAt,
    endedAt:
      soulAt !== null
        ? story.metAt + MARKET_FELLOW_SETTINGS.soulRemainingYears
        : goldenAt !== null
          ? goldenEnd
          : originalEnd,
  };
}

export function marketFellowEndedAt(story: MarketFellowState) {
  return marketFellowLife(story).endedAt;
}

// 与炉边故人视图的「旧信待展」阶段相同；不加载坊市正文到首页。
export function marketFellowLetterWaiting(story: MarketFellowState, age: number) {
  return (
    story.completedAt === null &&
    story.choice !== null &&
    story.chosenAt !== null &&
    age >= story.metAt + MARKET_FELLOW_SETTINGS.reunionYears &&
    age >= story.chosenAt + MARKET_FELLOW_SETTINGS.outcomeYears &&
    age >= marketFellowEndedAt(story)
  );
}
