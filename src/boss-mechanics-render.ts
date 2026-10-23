import type { Enemy, Shot } from './game-types.ts';
import { BOSS_MECHANICS, bossShotPose } from './boss-mechanics.ts';
import { TAU } from './data.ts';

export function drawBossSummon(c: CanvasRenderingContext2D, e: Enemy) {
  const state = e.bossSummon!;
  c.save();
  c.translate(e.x, e.y);
  if (state.kind === 'heart') {
    const grow = Math.min(1, state.age / BOSS_MECHANICS.heartGrow);
    c.fillStyle = '#173e2c';
    c.strokeStyle = '#bcda8b';
    c.lineWidth = 2;
    c.beginPath();
    c.arc(0, 0, 20, 0, TAU);
    c.fill();
    c.stroke();
    for (let i = 0; i < 3; i++) {
      c.save();
      c.rotate((i / 3) * TAU);
      c.beginPath();
      c.moveTo(0, 4);
      c.quadraticCurveTo(-18, -10, 0, -18 - grow * 14);
      c.quadraticCurveTo(18, -10, 0, 4);
      c.fillStyle = '#7eb46e';
      c.fill();
      c.stroke();
      c.restore();
    }
    c.strokeStyle = '#f3d58e';
    c.beginPath();
    c.arc(0, 0, 25, -Math.PI / 2, -Math.PI / 2 + grow * TAU);
    c.stroke();
    c.fillStyle = '#142623';
    c.fillRect(-23, -43, 46, 4);
    c.fillStyle = '#c9da8a';
    c.fillRect(-23, -43, 46 * Math.max(0, e.hp / e.maxHp), 4);
  } else {
    c.strokeStyle = '#a5e6fa';
    c.lineWidth = 2;
    c.beginPath();
    c.arc(0, 5, e.radius + 5, 0, TAU);
    c.stroke();
    if (e.charge > 0.55) {
      c.save();
      c.rotate(Math.atan2(e.dy, e.dx));
      c.fillStyle = '#f5d18a';
      c.beginPath();
      c.moveTo(42, 0);
      c.lineTo(30, -7);
      c.lineTo(30, 7);
      c.closePath();
      c.fill();
      c.restore();
    }
  }
  c.font = '14px serif';
  c.textAlign = 'center';
  c.fillStyle = state.kind === 'heart' ? '#d1e7a5' : '#b9ebff';
  c.fillText(state.kind === 'heart' ? '木心' : '猎', 0, state.kind === 'heart' ? 43 : -42);
  c.restore();
}

export function drawBossMotionCue(c: CanvasRenderingContext2D, b: Shot) {
  const m = b.bossMotion!,
    pose = bossShotPose(b);
  c.save();
  if (!pose.active) c.globalAlpha = 0.55;
  c.strokeStyle = pose.active ? '#ffe4ad' : '#f4d18e';
  c.lineWidth = 2;
  c.beginPath();
  c.arc(0, 0, b.radius + 5, 0, TAU);
  c.stroke();
  if (m.kind === 'return') {
    // 回焰转向前短暂停驻，箭头向来路，不能误画成仍然向外飞。
    const t = b.age - BOSS_MECHANICS.returnWarmup;
    const returning = t >= BOSS_MECHANICS.returnOut;
    c.save();
    const direction = Math.atan2(m.velocity.y, m.velocity.x) + (returning ? Math.PI : 0);
    c.rotate(direction - Math.atan2(b.vy, b.vx));
    c.beginPath();
    c.moveTo(20, 0);
    c.lineTo(12, -5);
    c.moveTo(20, 0);
    c.lineTo(12, 5);
    c.stroke();
    c.restore();
  } else if (m.kind === 'star' && !pose.active) {
    const progress = Math.min(1, b.age / m.launchAt);
    c.strokeStyle = '#e7efff';
    c.beginPath();
    c.arc(0, 0, b.radius + 9, -Math.PI / 2, -Math.PI / 2 + progress * TAU);
    c.stroke();
  } else if (m.kind === 'memory') {
    c.fillStyle = '#e5c8f5';
    for (let i = 1; i <= 3; i++) {
      c.beginPath();
      c.arc(-i * 9, 0, 3 - i * 0.5, 0, TAU);
      c.fill();
    }
  }
  c.restore();
}
