import type { Game } from './game.ts';
import { STAGES, TAU } from './data.ts';
import { bossEntranceCue, BOSS_ENTRANCE_THEMES } from './boss-entrance.ts';
import { realmBreakthroughCue } from './realm-breakthrough.ts';

export function drawRealmBreakthrough(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  game: Game,
  reducedMotion: boolean,
) {
  const cue = realmBreakthroughCue(game);
  if (!cue) return;
  const c = ctx,
    w = width,
    h = height,
    still = reducedMotion;
  const fade = Math.min(1, cue.progress / 0.14) * Math.min(1, (1 - cue.progress) / 0.45);
  c.save();
  if (still) {
    c.globalAlpha = fade * 0.015;
    c.fillStyle = cue.color;
  } else {
    const x = -w * 0.3 + cue.progress * w * 1.6;
    const sweep = c.createLinearGradient(x - w * 0.25, 0, x + w * 0.25, 0);
    sweep.addColorStop(0, cue.color + '00');
    sweep.addColorStop(0.5, cue.color);
    sweep.addColorStop(1, cue.color + '00');
    c.globalAlpha = fade * 0.05;
    c.fillStyle = sweep;
  }
  c.fillRect(0, 0, w, h);
  let x = w / 2,
    y = h / 2 + (h < 500 ? 62 : 80);
  // 留开角色和顶部 HUD；小屏与妖王名号同时出现时让到侧边。
  if (bossEntranceCue(game)) {
    if (w > h) x = w * 0.88;
    else if (w < 700 && h < 720) {
      x = w * 0.22;
      y = h / 2 - 4;
    }
  }
  if (!still) y -= cue.progress * 6;
  const fontSize = w < 700 || h < 500 ? 22 : 28;
  const serif = '"Noto Serif SC", "Songti SC", "STSong", serif';
  c.globalAlpha = fade;
  c.textAlign = 'center';
  c.shadowColor = '#102b25cc';
  c.shadowBlur = 6;
  c.shadowOffsetY = 1;
  c.fillStyle = '#eee5c9';
  c.font = `400 ${fontSize}px ${serif}`;
  c.fillText(cue.name, x, y + 5);
  c.globalAlpha = fade * 0.7;
  c.fillStyle = c.strokeStyle = cue.color;
  c.font = `400 ${fontSize === 22 ? 8 : 9}px ${serif}`;
  c.fillText('破 境', x, y + 21);
  c.shadowBlur = 0;
  c.shadowOffsetY = 0;
  c.lineWidth = 0.75;
  // 细线收束名号，不加厚重描边或遮住战场的底板。
  for (const side of [-1, 1]) {
    const edge = x + side * (fontSize + 10);
    c.beginPath();
    c.moveTo(edge, y - 3);
    c.lineTo(edge + side * 19, y - 3);
    c.stroke();
    c.beginPath();
    c.arc(edge + side * 23, y - 3, 1.2, 0, TAU);
    c.fill();
  }
  c.restore();
}
export function drawBossEntrance(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  game: Game,
  reducedMotion: boolean,
  drawSprite: (index: number, x: number, y: number, size: number) => void,
) {
  const cue = bossEntranceCue(game);
  if (!cue) return;
  const c = ctx,
    w = width,
    h = height;
  const theme = BOSS_ENTRANCE_THEMES[cue.stage];
  const still = reducedMotion;
  const fade = cue.arriving
    ? Math.min(1, (1 - cue.progress) / 0.22)
    : Math.min(1, cue.progress / 0.25);
  const motion = still ? 0.4 : cue.progress;
  c.save();
  // 暗角只收束边缘，保留人物、弹幕与已有红色技能预警的辨识度。
  const shade = c.createRadialGradient(
    w / 2,
    h / 2,
    Math.min(w, h) * 0.3,
    w / 2,
    h / 2,
    Math.hypot(w, h) * 0.6,
  );
  shade.addColorStop(0, '#081a1900');
  shade.addColorStop(1, `rgba(5, 22, 18, ${fade * 0.45})`);
  c.fillStyle = shade;
  c.fillRect(0, 0, w, h);
  c.strokeStyle = theme.color;
  c.fillStyle = theme.color;
  c.lineWidth = 1.5;
  if (cue.stage === 0) {
    // 藤蔓从两侧破土，中心和底部操作区域留空。
    for (const side of [-1, 1])
      for (let i = 0; i < 4; i++) {
        const x = side < 0 ? i * 18 : w - i * 18;
        const y = h * (0.45 + i * 0.09);
        c.globalAlpha = fade * 0.45;
        c.beginPath();
        c.moveTo(x, y + 80);
        c.bezierCurveTo(
          x + side * 25,
          y + 20,
          x - side * 60,
          y + 10,
          x - side * 45,
          y - 55 * motion,
        );
        c.stroke();
      }
  }
  // 粒子固定数量，不在绘制中使用随机数；减少动态效果时仅保留静态名号。
  if (!still)
    for (let i = 0; i < 20; i++) {
      const side = i % 2 ? 1 : -1;
      const x =
        (side < 0 ? 0 : w) - side * (18 + ((i * 37 + motion * 95) % Math.max(40, w * 0.22)));
      const y = (((i * 113 + motion * (cue.arriving ? -150 : 60)) % h) + h) % h;
      c.save();
      c.globalAlpha = fade * (0.25 + (i % 3) * 0.12);
      c.translate(x, y);
      c.rotate(i + motion * 2);
      c.beginPath();
      if (theme.particle === 'leaf') c.ellipse(0, 0, 3, 9, 0.4, 0, TAU);
      else if (theme.particle === 'ice') {
        c.moveTo(0, -9);
        c.lineTo(3, 0);
        c.lineTo(0, 9);
        c.lineTo(-3, 0);
        c.closePath();
      } else if (theme.particle === 'miasma') {
        c.globalAlpha *= 0.5;
        c.arc(0, 0, 8 + (i % 4) * 4, 0, TAU);
      } else if (theme.particle === 'soul') {
        c.ellipse(0, 0, 3, 7, 0, 0, TAU);
        c.moveTo(0, 6);
        c.quadraticCurveTo(12, 12, 3, 22);
        c.stroke();
      } else if (theme.particle === 'lightning') {
        c.moveTo(0, -14);
        c.lineTo(-5, 0);
        c.lineTo(4, -2);
        c.lineTo(-2, 14);
        c.stroke();
      } else if (theme.particle === 'rune') {
        c.strokeRect(-8, -8, 16, 16);
        c.font = '12px serif';
        c.textAlign = 'center';
        c.fillText(['劫', '天', '道', '仙'][i % 4], 0, 4);
      } else c.arc(0, 0, 2 + (i % 3), 0, TAU);
      c.fill();
      c.restore();
    }
  c.globalAlpha = fade;
  const cardWidth = Math.min(440, w - 32);
  const centerY = h < 500 ? h * 0.67 : w < 700 ? h - 190 : Math.max(230, h * 0.29);
  c.translate(w / 2, centerY);
  const panel = c.createLinearGradient(-cardWidth / 2, 0, cardWidth / 2, 0);
  panel.addColorStop(0, '#0b241b00');
  panel.addColorStop(0.18, '#0b241be8');
  panel.addColorStop(0.82, '#0b241be8');
  panel.addColorStop(1, '#0b241b00');
  c.fillStyle = panel;
  c.fillRect(-cardWidth / 2, -54, cardWidth, 108);
  c.strokeStyle = theme.color + '80';
  c.beginPath();
  c.moveTo(-cardWidth * 0.4, -53);
  c.lineTo(cardWidth * 0.4, -53);
  c.moveTo(-cardWidth * 0.4, 53);
  c.lineTo(cardWidth * 0.4, 53);
  c.stroke();
  if (cue.arriving) {
    drawSprite(STAGES[cue.stage].sprite, -cardWidth / 2 + 54, 26, 88);
    c.translate(w < 700 ? 34 : 46, 0);
  }
  c.textAlign = 'center';
  c.fillStyle = theme.color;
  c.font = '12px serif';
  c.fillText(cue.arriving ? `${theme.title} · 妖王降临` : '妖气汇聚 · 妖王将至', 0, -27);
  c.font = `${w < 700 ? 28 : 34}px serif`;
  c.fillStyle = '#f3e9c8';
  c.fillText(STAGES[cue.stage].boss, 0, 12);
  c.font = '12px serif';
  c.fillStyle = theme.color;
  c.fillText(`第${STAGES[cue.stage].chapter}境 · ${STAGES[cue.stage].name}`, 0, 36);
  c.restore();
}
