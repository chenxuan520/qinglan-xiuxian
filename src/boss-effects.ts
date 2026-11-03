import type { Game, Shot, Zone } from './game.ts';
import { TAU } from './data.ts';
import { SOVEREIGN_GOLD } from './boss-mechanics.ts';

export const BOSS_FIELDS = [
  'roots',
  'flame',
  'frost',
  'miasma',
  'soul',
  'rift',
  'thunder',
] as const;
const COLORS = ['#a5db96', '#ffb26b', '#abeaff', '#c5dd73', '#d5b6f6', '#d5defe', '#ffe39e'];

function crystal(c: CanvasRenderingContext2D, length: number, width: number) {
  c.beginPath();
  c.moveTo(0, -length);
  c.lineTo(width, -length * 0.3);
  c.lineTo(width * 0.55, length * 0.22);
  c.lineTo(-width * 0.55, length * 0.22);
  c.lineTo(-width, -length * 0.3);
  c.closePath();
  c.fill();
  c.stroke();
  c.beginPath();
  c.moveTo(0, -length);
  c.lineTo(0, length * 0.22);
  c.lineTo(width, -length * 0.3);
  c.stroke();
}

function flame(c: CanvasRenderingContext2D, size: number, bend: number) {
  c.beginPath();
  c.moveTo(0, size * 0.35);
  c.bezierCurveTo(-size, size * 0.1, -size * 0.25, -size * 0.5, bend, -size);
  c.bezierCurveTo(size * 0.05, -size * 0.1, size * 0.8, -size * 0.1, 0, size * 0.35);
  c.fill();
  c.stroke();
}

function soul(c: CanvasRenderingContext2D, size: number, bend: number) {
  c.beginPath();
  c.moveTo(-size * 0.5, 0);
  c.bezierCurveTo(-size, -size, size, -size, size * 0.5, 0);
  c.quadraticCurveTo(size * 0.2, size * 0.7, bend, size * 1.7);
  c.quadraticCurveTo(-size * 0.8, size * 0.4, -size * 0.5, 0);
  c.fill();
  c.stroke();
  c.fillStyle = '#23303c';
  c.fillRect(-size * 0.3, -size * 0.3, size * 0.2, size * 0.23);
  c.fillRect(size * 0.12, -size * 0.3, size * 0.2, size * 0.23);
}

/** 与冥主魂弹共用幽魂笔画；弹心仍位于原碰撞中心，尾部仅提示飞行方向。 */
export function drawSoulShot(c: CanvasRenderingContext2D, radius: number) {
  c.save();
  c.rotate(Math.PI / 2);
  c.shadowColor = '#b395dc';
  c.shadowBlur = 8;
  c.fillStyle = '#c9a9ed';
  c.strokeStyle = '#f0dcff';
  c.lineWidth = 1;
  soul(c, radius, radius * 0.3);
  c.restore();
}

/** 只装饰真实圆形判定内侧；危险边界仍由 Renderer 最后覆盖绘制。 */
export function drawBossField(
  c: CanvasRenderingContext2D,
  z: Zone,
  time: number,
  reduced: boolean,
) {
  const stage = BOSS_FIELDS.findIndex((kind) => z.kind === `boss-${kind}`);
  if (!z.hostile || stage < 0) return false;
  const active = z.delay <= 0;
  const golden = z.color === SOVEREIGN_GOLD;
  const color = golden ? SOVEREIGN_GOLD : COLORS[stage];
  const motion = reduced ? 0 : Math.sin(time * 2.4 + z.x * 0.01);
  c.save();
  c.translate(z.x, z.y);
  c.beginPath();
  c.arc(0, 0, z.radius, 0, TAU);
  c.fillStyle = active ? color + '28' : '#dc5e4420';
  c.fill();
  c.clip();
  c.globalAlpha = active ? Math.min(1, z.life * 5) : 0.36;
  c.strokeStyle = color;
  c.fillStyle = color + '80';
  c.lineWidth = 1.5;
  const r = z.radius * 0.8;
  if (active) {
    // 落地生长只影响内部装饰，外侧真实伤害边界始终完整。
    const grow = reduced ? 1 : Math.min(1, 0.55 + (z.maxLife - z.life) * 4);
    c.scale(grow, grow);
  }
  switch (stage) {
    case 0:
      for (let i = 0; i < 5; i++) {
        c.save();
        c.translate((i - 2) * r * 0.3, r * (0.35 + Math.sin(i * 2.4) * 0.25));
        c.rotate((i - 2) * 0.2);
        c.beginPath();
        c.moveTo(-r * 0.2, r * 0.3);
        c.bezierCurveTo(-r * 0.45, -r * 0.1, r * 0.35, -r * 0.3, 0, -r);
        c.strokeStyle = golden ? '#6b5836' : '#355d39';
        c.lineWidth = 6;
        c.stroke();
        c.strokeStyle = color;
        c.lineWidth = active ? 2 : 1;
        c.stroke();
        for (let n = 0; n < 3; n++) {
          const y = -r * 0.15 - n * r * 0.23;
          c.beginPath();
          c.moveTo(0, y + 5);
          c.lineTo((n % 2 ? -1 : 1) * r * 0.32, y - 8);
          c.lineTo(3, y - 2);
          c.fill();
        }
        c.restore();
      }
      break;
    case 1:
      for (let i = 0; i < 5; i++) {
        c.save();
        c.translate(Math.cos(i * 2.4) * r * 0.48, Math.sin(i * 2.4) * r * 0.4 + 7);
        c.fillStyle = '#ed784890';
        c.strokeStyle = '#f9a06e90';
        const size = r * (0.55 + (i % 2) * 0.18);
        flame(c, size, motion * 5);
        if (active) {
          c.fillStyle = '#ffe5a0b0';
          c.strokeStyle = '#ffeac088';
          flame(c, size * 0.5, -motion * 2);
        }
        c.restore();
      }
      break;
    case 2:
      for (let i = 0; i < 5; i++) {
        c.save();
        c.translate(Math.cos(i * 2.4) * r * 0.5, Math.sin(i * 2.4) * r * 0.2 + r * 0.25);
        c.rotate(Math.cos(i * 2.4) * 0.4);
        crystal(c, r * (0.65 + (i % 3) * 0.13), r * 0.16);
        c.restore();
      }
      break;
    case 3:
      c.beginPath();
      c.ellipse(0, 0, r, r * 0.75, -0.3, 0, TAU);
      c.fillStyle = golden ? '#87723d70' : '#556e3670';
      c.fill();
      for (let i = 0; i < 7; i++) {
        const x = Math.cos(i * 2.4) * r * 0.65;
        const y = Math.sin(i * 2.4) * r * 0.6;
        c.beginPath();
        c.ellipse(x, y, r * (0.12 + (i % 3) * 0.03), r * 0.09, -0.3, 0, TAU);
        c.fillStyle = golden ? SOVEREIGN_GOLD + '70' : '#a0b85570';
        c.fill();
        c.stroke();
        c.beginPath();
        c.arc(x - 2, y - 3 - motion * 2, 2.5, 0, TAU);
        c.fillStyle = color;
        c.fill();
      }
      break;
    case 4:
      for (let i = 0; i < 3; i++) {
        c.save();
        c.translate(Math.cos((i * TAU) / 3) * r * 0.45, Math.sin((i * TAU) / 3) * r * 0.3 - 5);
        c.fillStyle = '#cdb5edb0';
        soul(c, r * 0.3, motion * 6);
        c.restore();
      }
      break;
    case 5:
      c.fillStyle = '#253244b0';
      for (let i = 0; i < 3; i++) {
        c.save();
        c.rotate((i / 3) * Math.PI + 0.3);
        c.beginPath();
        c.moveTo(-r, -r * 0.25);
        c.lineTo(-r * 0.4, r * 0.05);
        c.lineTo(-r * 0.2, -r * 0.14);
        c.lineTo(r * 0.1, -r * 0.1);
        c.lineTo(r, r * 0.4);
        c.lineTo(r * 0.12, r * 0.25);
        c.lineTo(-r * 0.2, r * 0.33);
        c.closePath();
        c.fill();
        c.stroke();
        c.restore();
      }
      break;
    case 6:
      for (let i = 0; i < 3; i++) {
        c.save();
        c.translate((i - 1) * r * 0.48, (i % 2) * -r * 0.15);
        c.beginPath();
        c.moveTo(r * 0.15, -r * 0.8);
        c.lineTo(-r * 0.15, -r * 0.22);
        c.lineTo(r * 0.12, -r * 0.3);
        c.lineTo(-r * 0.1, r * 0.65);
        c.moveTo(r * 0.05, 0);
        c.lineTo(r * 0.3, r * 0.15);
        c.lineTo(r * 0.35, r * 0.4);
        c.strokeStyle = active ? '#ffdf9e80' : color;
        c.lineWidth = active ? 6 : 1.5;
        c.stroke();
        if (active) {
          c.strokeStyle = '#fff4d2';
          c.lineWidth = 2;
          c.stroke();
        }
        c.restore();
      }
      break;
  }
  c.restore();
  return true;
}

/** 在弹体自身坐标系内绘制，朝向 +x；亮色核心对应碰撞半径，尾迹仅作方向提示。 */
export function drawBossShot(c: CanvasRenderingContext2D, shot: Shot) {
  const stage = shot.bossStage!;
  const color = shot.color === SOVEREIGN_GOLD ? SOVEREIGN_GOLD : COLORS[stage];
  c.strokeStyle = color;
  c.fillStyle = color + 'bb';
  c.lineWidth = 1.5;
  c.beginPath();
  c.moveTo(-23, 0);
  c.lineTo(0, 0);
  c.strokeStyle = color + '50';
  c.lineWidth = 4;
  c.stroke();
  c.strokeStyle = color;
  c.lineWidth = 1;
  if (stage === 0) {
    c.beginPath();
    c.moveTo(9, 0);
    c.quadraticCurveTo(-2, -12, -10, 0);
    c.quadraticCurveTo(-2, 10, 9, 0);
    c.fill();
    c.stroke();
    c.beginPath();
    c.moveTo(-9, 0);
    c.lineTo(8, 0);
    c.stroke();
  } else if (stage === 1) {
    c.rotate(Math.PI / 2);
    flame(c, 11, -3);
  } else if (stage === 2 || stage === 6) {
    c.rotate(Math.PI / 2);
    crystal(c, stage === 6 ? 18 : 13, 6);
  } else if (stage === 3) {
    const r = shot.radius;
    // 毒液的亮色弹心沿用真实半径，稀薄气泡只作尾迹。
    c.beginPath();
    c.moveTo(r, 0);
    c.bezierCurveTo(r, -r * 0.9, -r * 0.5, -r, -r * 0.8, -r * 0.45);
    c.quadraticCurveTo(-r * 1.1, -r * 0.2, -r * 1.7, 0);
    c.quadraticCurveTo(-r * 0.8, r * 0.25, -r * 0.6, r * 0.6);
    c.bezierCurveTo(0, r, r, r * 0.65, r, 0);
    c.fillStyle = '#91b94fdd';
    c.fill();
    c.stroke();
    c.fillStyle = '#eff3b9';
    c.beginPath();
    c.ellipse(r * 0.25, -r * 0.28, r * 0.26, r * 0.18, -0.4, 0, TAU);
    c.fill();
    c.fillStyle = '#c5dd7355';
    c.beginPath();
    c.arc(-r * 1.9, -r * 0.45, r * 0.23, 0, TAU);
    c.arc(-r * 2.5, r * 0.28, r * 0.15, 0, TAU);
    c.fill();
  } else if (stage === 4) {
    c.rotate(Math.PI / 2);
    soul(c, 9, 3);
  } else {
    for (let i = 0; i < 4; i++) {
      c.rotate(Math.PI / 2);
      c.beginPath();
      c.moveTo(0, 0);
      c.lineTo(12, 0);
      c.lineTo(3, 3);
      c.fill();
      c.stroke();
    }
  }
}

// 同一火焰笔画供组合魂火复用，颜色、缩放与寿命由调用处限定。
export { flame as drawFlame };

// 直接绘制保存的劫印/引力状态，暂停与续局不依赖瞬时特效队列。
export function drawSovereignWarnings(c: CanvasRenderingContext2D, game: Game, reduced: boolean) {
  if (!game.isFinalTrial || game.state === 'won' || game.state === 'lost') return;
  const p = game.player;
  for (const e of game.enemies) {
    if (e.dead || !e.boss || e.bossStage !== 6) continue;
    if (e.judgements?.length) {
      c.save();
      c.translate(p.x, p.y);
      c.strokeStyle = SOVEREIGN_GOLD;
      c.lineWidth = 2;
      c.beginPath();
      c.arc(0, 0, 29, 0, TAU);
      c.stroke();
      c.beginPath();
      c.arc(
        0,
        0,
        34,
        -Math.PI / 2,
        -Math.PI / 2 + TAU * Math.max(0, 1 - (e.judgements[0] - game.time) / 3),
      );
      c.stroke();
      c.beginPath();
      c.moveTo(5, -16);
      c.lineTo(-6, 1);
      c.lineTo(4, -1);
      c.lineTo(-5, 16);
      c.stroke();
      c.restore();
    }
    if ((e.gravityUntil ?? 0) <= game.time) continue;
    c.save();
    c.strokeStyle = SOVEREIGN_GOLD + '99';
    c.lineWidth = 1.5;
    c.beginPath();
    c.moveTo(p.x, p.y);
    c.lineTo(e.x, e.y);
    c.stroke();
    for (let i = 0; i < 3; i++) {
      const phase = reduced ? (i + 0.5) / 3 : (game.time + i / 3) % 1;
      c.globalAlpha = 0.35 + phase * 0.5;
      c.beginPath();
      c.arc(e.x, e.y, e.radius * 0.4 + (1 - phase) * 100, 0, TAU);
      c.stroke();
    }
    c.restore();
  }
}
