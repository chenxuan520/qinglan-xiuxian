import type { Game } from './game.ts';
import type { Zone } from './game-types.ts';
import { regionalHazard } from './regional-hazards.ts';

function capsule(c: CanvasRenderingContext2D, length: number, radius: number) {
  c.beginPath();
  c.moveTo(0, -radius);
  c.lineTo(length, -radius);
  c.arc(length, 0, radius, -Math.PI / 2, Math.PI / 2);
  c.lineTo(0, radius);
  c.arc(0, 0, radius, Math.PI / 2, Math.PI * 1.5);
  c.closePath();
}

// 底色在法宝之前绘制；危险边界在所有法宝和人物之后绘制。
export function drawRegionalField(
  c: CanvasRenderingContext2D,
  z: Zone,
  time: number,
  reduced: boolean,
  warning = false,
) {
  if (!z.hostile || !regionalHazard(z)) return false;
  c.save();
  c.translate(z.x, z.y);
  const length = z.endX === undefined ? 0 : Math.hypot(z.endX - z.x, z.endY! - z.y);
  if (z.endX !== undefined) c.rotate(Math.atan2(z.endY! - z.y, z.endX - z.x));
  if (warning) {
    capsule(c, length, z.radius);
    c.strokeStyle = '#301c22b3';
    c.lineWidth = 4;
    c.stroke();
    c.strokeStyle = '#ffac8c';
    c.lineWidth = 2;
    c.setLineDash(z.delay > 0 ? [8, 5] : []);
    c.stroke();
    if (z.delay > 0) {
      c.setLineDash([]);
      c.strokeStyle = '#ffe1a5';
      if (!length) {
        const progress = Math.max(0, Math.min(1, 1 - z.delay / (z.castDelay || 1.2)));
        c.beginPath();
        c.arc(0, 0, z.radius * 0.88, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
        c.stroke();
      }
    }
    if (z.vx !== undefined && (z.vx || z.vy)) {
      c.save();
      c.translate(length / 2, 0);
      c.rotate(Math.atan2(z.vy!, z.vx) - (length ? Math.atan2(z.endY! - z.y, z.endX! - z.x) : 0));
      c.beginPath();
      c.moveTo(-8, -7);
      c.lineTo(7, 0);
      c.lineTo(-8, 7);
      c.stroke();
      c.restore();
    }
    c.restore();
    return true;
  }
  capsule(c, length, z.radius);
  c.fillStyle = z.color;
  c.globalAlpha = z.delay > 0 ? 0.09 : 0.18;
  c.fill();
  c.clip();
  c.globalAlpha = z.delay > 0 ? 0.22 : 0.7;
  c.strokeStyle = z.color;
  c.lineWidth = 2;
  const pulse = reduced ? 0 : Math.sin(time * 4) * 3;
  if (length) {
    if (z.kind.includes('roots')) {
      c.strokeStyle = '#405b37';
      c.lineWidth = 5;
      c.beginPath();
      c.moveTo(0, 0);
      for (let i = 1; i <= 18; i++)
        c.lineTo((i / 18) * length, Math.sin(i * 0.8) * z.radius * 0.22);
      c.stroke();
      c.strokeStyle = '#a4c686';
      c.lineWidth = 2;
      c.stroke();
    }
    for (let i = 0; i < 9; i++) {
      const x = ((i + 0.5) / 9) * length;
      c.beginPath();
      if (z.kind.includes('roots')) {
        const side = i % 2 ? 1 : -1;
        c.moveTo(x - 8, 0);
        c.quadraticCurveTo(x + 2, pulse, x + 9, side * z.radius * 0.7);
        c.stroke();
        c.beginPath();
        c.fillStyle = '#8cb56e';
        c.ellipse(x + 6, side * z.radius * 0.48, 8, 3.5, side * 0.65, 0, Math.PI * 2);
        c.fill();
      } else if (z.kind.includes('flame') || z.kind.includes('firepath')) {
        c.moveTo(x - 8, z.radius * 0.55);
        c.quadraticCurveTo(x - 12, -z.radius * 0.6, x + pulse, -z.radius * 0.85);
        c.quadraticCurveTo(x + 12, 0, x + 8, z.radius * 0.55);
        c.closePath();
        c.fillStyle = i % 2 ? '#fba54e' : '#e77e38';
        c.fill();
        c.strokeStyle = '#ffd08a';
      } else if (z.kind.includes('frost')) {
        c.moveTo(x - 12, z.radius * 0.7);
        c.lineTo(x, -z.radius * 0.8);
        c.lineTo(x + 12, z.radius * 0.7);
        c.closePath();
        c.fillStyle = '#bde8f3';
        c.globalAlpha = z.delay > 0 ? 0.18 : 0.52;
        c.fill();
        c.globalAlpha = z.delay > 0 ? 0.22 : 0.8;
        c.moveTo(x, -z.radius * 0.8);
        c.lineTo(x + 4, z.radius * 0.7);
      } else if (
        z.kind.includes('rift') ||
        z.kind.includes('storm') ||
        z.kind.includes('thunder')
      ) {
        c.strokeStyle = '#f4e2ac';
        c.lineWidth = z.delay > 0 ? 1.5 : 3;
        c.moveTo(x - 16, pulse);
        c.lineTo(x - 5, -z.radius * 0.45);
        c.lineTo(x + 2, z.radius * 0.5);
        c.lineTo(x + 7, -z.radius * 0.35);
        c.lineTo(x + 17, pulse);
      } else {
        c.moveTo(x - 12, -z.radius * 0.5);
        c.bezierCurveTo(x + 6, -z.radius, x - 6, z.radius, x + 12, z.radius * 0.5);
      }
      c.stroke();
    }
  } else {
    // 游瘴保留真实圆形边界，内部是缓慢流动的云气。
    c.globalAlpha = z.delay > 0 ? 0.1 : 0.24;
    for (let i = 0; i < 7; i++) {
      const a = i * 2.4 + (reduced ? 0 : time * 0.25);
      c.beginPath();
      c.ellipse(
        Math.cos(a) * z.radius * 0.5,
        Math.sin(a) * z.radius * 0.4,
        z.radius * 0.48,
        z.radius * 0.3,
        a,
        0,
        Math.PI * 2,
      );
      c.fill();
    }
  }
  c.restore();
  return true;
}

// 受击状态贴近人物显示，不占用顶部状态栏；减少动态时保留静态辨识。
export function drawPlayerAilments(
  c: CanvasRenderingContext2D,
  game: Game,
  time: number,
  reduced: boolean,
) {
  const p = game.player;
  const thunder = game.stage === 5 && !game.tribulation;
  if (!game.slowed && !game.burning.life) return;
  c.save();
  c.font = 'bold 13px serif';
  c.textAlign = 'center';
  c.lineWidth = 3;
  c.strokeStyle = '#173e4e';
  if (game.slowed > 0) {
    const label = `${thunder ? '雷麻' : '迟滞'} · 移速 −25%`;
    c.fillStyle = thunder ? '#e5ddff' : '#d3f1ff';
    c.strokeText(label, p.x, p.y + 46);
    c.fillText(label, p.x, p.y + 46);
    c.strokeStyle = thunder ? '#c7baff' : '#a8e1f4';
    c.lineWidth = 2;
    c.beginPath();
    c.ellipse(p.x, p.y + 12, 25, 10, 0, 0, Math.PI * 2);
    c.stroke();
  }
  if (game.burning.life > 0) {
    c.fillStyle = '#ffc58b';
    for (let i = -1; i <= 1; i++) {
      const x = p.x + i * 15,
        y = p.y + 10;
      const sway = reduced ? 0 : Math.sin(time * 10 + i) * 3;
      c.beginPath();
      c.moveTo(x - 5, y + 4);
      c.quadraticCurveTo(x - 8, y - 3, x + sway, y - 20);
      c.quadraticCurveTo(x + 9, y - 2, x + 5, y + 4);
      c.fill();
    }
    c.strokeStyle = '#543b29';
    c.lineWidth = 3;
    c.strokeText('灼烧', p.x, p.y + (game.slowed ? 62 : 46));
    c.fillText('灼烧', p.x, p.y + (game.slowed ? 62 : 46));
  }
  c.restore();
}
