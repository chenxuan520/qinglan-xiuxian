import type { TownPoint } from './town.ts';

// 只在点击时搜索。与手动行走共用碰撞函数，四邻格网不允许斜穿墙角。
export function walkRoute(
  from: TownPoint,
  target: TownPoint,
  walkable: (point: TownPoint) => boolean,
  width: number,
  height: number,
) {
  if (!walkable(from) || !Number.isFinite(target.x) || !Number.isFinite(target.y)) return [];
  const spacing = 30,
    columns = Math.floor(width / spacing) + 1;
  const count = columns * (Math.floor(height / spacing) + 1);
  const point = (i: number) => ({
    x: (i % columns) * spacing,
    y: Math.floor(i / columns) * spacing,
  });
  const clear = (a: TownPoint, b: TownPoint) => {
    const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 2));
    for (let n = 1; n <= steps; n++)
      if (!walkable({ x: a.x + ((b.x - a.x) * n) / steps, y: a.y + ((b.y - a.y) * n) / steps }))
        return false;
    return true;
  };
  const goal = {
    x: Math.max(16, Math.min(width - 16, target.x)),
    y: Math.max(16, Math.min(height - 16, target.y)),
  };
  const exact = walkable(goal);
  if (exact && clear(from, goal)) return [goal];
  const open = new Uint8Array(count);
  let end = -1,
    nearest = Infinity;
  for (let i = 0; i < count; i++) {
    const p = point(i);
    open[i] = Number(walkable(p));
    const distance = Math.hypot(goal.x - p.x, goal.y - p.y);
    if (open[i] && distance < nearest) {
      nearest = distance;
      end = i;
    }
  }
  // 先找最近的可走格点，再检查到目标的短连接，避免扫描整图时反复检测长线。
  // 窄隙的最近格点可能隔着墙，按距离和原格点顺序寻找下一条合法连接。
  if (exact && end >= 0 && !clear(point(end), goal)) {
    const distance = (i: number) =>
      Math.hypot(goal.x - (i % columns) * spacing, goal.y - Math.floor(i / columns) * spacing);
    const candidates = Array.from(open.keys()).filter((i) => open[i]);
    candidates.sort((a, b) => distance(a) - distance(b) || a - b);
    end = candidates.find((i) => clear(point(i), goal)) ?? -1;
  }
  if (end < 0) return [];
  const previous = new Int32Array(count).fill(-2);
  previous[end] = -1;
  const queue = [end];
  for (const index of queue) {
    const p = point(index);
    if (Math.hypot(p.x - from.x, p.y - from.y) <= 365) {
      const bend = [from, { x: from.x, y: p.y }, { x: p.x, y: from.y }].find(
        (b) => clear(from, b) && clear(b, p),
      );
      if (bend) {
        const route = bend === from ? [] : [bend];
        for (let at = index; at !== -1; at = previous[at]) route.push(point(at));
        return [
          ...route.filter(
            (p, i) =>
              i === 0 ||
              i === route.length - 1 ||
              !(
                (route[i - 1].x === p.x && route[i + 1].x === p.x) ||
                (route[i - 1].y === p.y && route[i + 1].y === p.y)
              ),
          ),
          ...(exact ? [goal] : []),
        ];
      }
    }
    for (const [dx, dy] of [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ]) {
      const x = (index % columns) + dx,
        y = Math.floor(index / columns) + dy;
      const next = y * columns + x;
      if (
        x < 0 ||
        x >= columns ||
        next < 0 ||
        next >= count ||
        previous[next] !== -2 ||
        !open[next] ||
        !clear(p, point(next))
      )
        continue;
      previous[next] = index;
      queue.push(next);
    }
  }
  return [];
}

export function mapClick(
  map: HTMLElement,
  width: number,
  height: number,
  x: number,
  y: number,
): TownPoint {
  const box = map.getBoundingClientRect();
  return { x: ((x - box.left) * width) / box.width, y: ((y - box.top) * height) / box.height };
}
