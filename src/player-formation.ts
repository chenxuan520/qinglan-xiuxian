const TAU = Math.PI * 2;

// 炼气至真仙：清玉、竹青、淡金、月蓝、藤紫、霜青、琥珀、银金、玉白。
const COLORS = [
  '#c7e4bd',
  '#9fcfba',
  '#e4cd90',
  '#abcfe1',
  '#c6b7df',
  '#a6d9d5',
  '#e0bc9b',
  '#e5d9ac',
  '#e4eee0',
];

/** 纯装饰阵纹，始终留在原先半径 29 的脚下范围，不代表技能或伤害边界。 */
export function drawPlayerFormation(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  realm: number,
  time: number,
) {
  const rank = Math.max(0, Math.min(8, Math.floor(realm)));
  const radius = 29;
  c.save();
  c.translate(x, y);
  c.rotate(time * 0.12);
  c.strokeStyle = COLORS[rank];
  c.fillStyle = COLORS[rank];
  c.lineWidth = 0.9;
  c.globalAlpha = 0.48;
  // 断续外沿保留脚下轮廓，留白使内纹与法宝、敌方预警分开。
  for (let i = 0; i < 4; i++) {
    c.beginPath();
    c.arc(0, 0, radius, (i * TAU) / 4 + 0.07, ((i + 1) * TAU) / 4 - 0.07);
    c.stroke();
  }
  const polygon = (sides: number, r: number, offset = 0) => {
    c.beginPath();
    for (let i = 0; i <= sides; i++) {
      const angle = (i * TAU) / sides + offset;
      const px = Math.cos(angle) * r;
      const py = Math.sin(angle) * r;
      if (i === 0) c.moveTo(px, py);
      else c.lineTo(px, py);
    }
    c.stroke();
  };
  const petals = (count: number, r: number, width: number) => {
    c.save();
    for (let i = 0; i < count; i++) {
      c.beginPath();
      c.moveTo(6, 0);
      c.quadraticCurveTo(r * 0.55, -width, r, 0);
      c.quadraticCurveTo(r * 0.55, width, 6, 0);
      c.stroke();
      c.rotate(TAU / count);
    }
    c.restore();
  };
  c.globalAlpha = 0.42;
  switch (rank) {
    case 0:
      // 入道：三枚舒展叶纹。
      petals(3, 22, 6);
      break;
    case 1:
      polygon(4, 22, Math.PI / 4);
      petals(4, 18, 4);
      break;
    case 2:
      // 金丹：凝聚的丹心与三方护印。
      c.beginPath();
      c.arc(0, 0, 8, 0, TAU);
      c.stroke();
      polygon(3, 22, -Math.PI / 2);
      break;
    case 3:
      petals(6, 23, 6);
      break;
    case 4:
      polygon(5, 23, -Math.PI / 2);
      petals(5, 18, 4);
      break;
    case 5:
      // 炼虚：错开的弧片，少用闭合圈。
      for (let i = 0; i < 6; i++) {
        c.beginPath();
        c.arc(0, 0, i % 2 ? 17 : 23, (i * TAU) / 6, (i * TAU) / 6 + 0.62);
        c.stroke();
      }
      polygon(3, 12, Math.PI / 2);
      break;
    case 6:
      polygon(3, 23, -Math.PI / 2);
      polygon(3, 23, Math.PI / 2);
      petals(3, 14, 4);
      break;
    case 7:
      petals(8, 24, 5);
      polygon(4, 12, Math.PI / 4);
      break;
    case 8:
      petals(6, 24, 7);
      petals(6, 14, 4);
      break;
  }
  // 各境界共用四枚小玉点，足下有锚点但不增加光晕或范围。
  c.globalAlpha = 0.6;
  for (let i = 0; i < 4; i++) {
    const angle = (i * TAU) / 4;
    c.beginPath();
    c.arc(Math.cos(angle) * 27, Math.sin(angle) * 27, 0.85, 0, TAU);
    c.fill();
  }
  c.restore();
}
