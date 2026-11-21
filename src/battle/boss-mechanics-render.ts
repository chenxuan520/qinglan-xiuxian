import type { Enemy, Shot } from './game-types.ts';
import { BOSS_MECHANICS, SOVEREIGN_GOLD, bossReturnOut, bossShotPose } from './boss-mechanics.ts';
import { FINAL_TRIAL_STAGE, STAGES, TAU } from '../core/data.ts';

export function drawBossSummon(c: CanvasRenderingContext2D, e: Enemy, showLabel = true) {
  const state = e.bossSummon!;
  c.save();
  c.translate(e.x, e.y);
  if (state.kind === 'heart') {
    const grow = Math.min(1, state.age / BOSS_MECHANICS.heartGrow);
    c.fillStyle = '#173e2c';
    c.strokeStyle = state.color ?? '#bcda8b';
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
    c.strokeStyle = state.color ?? '#a5e6fa';
    c.lineWidth = 2;
    c.beginPath();
    c.arc(0, 5, e.radius + 5, 0, TAU);
    c.stroke();
    if (e.charge > BOSS_MECHANICS.wolfDash) {
      c.save();
      c.rotate(Math.atan2(e.dy, e.dx));
      if (state.slot !== undefined) {
        // 天兵蓄力即锁定方向，虚线与箭头一起预示这一轮冲程。
        c.setLineDash([10, 8]);
        c.strokeStyle = SOVEREIGN_GOLD;
        c.globalAlpha = 0.6;
        c.lineWidth = 2;
        c.beginPath();
        c.moveTo(e.radius + 4, 0);
        c.lineTo(BOSS_MECHANICS.wolfDash * 380, 0);
        c.stroke();
        c.setLineDash([]);
        c.globalAlpha = 1;
      }
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
  if (state.kind === 'heart') {
    c.fillStyle = '#d1e7a5';
    c.fillText('木心', 0, 43);
  } else if (state.slot !== undefined) {
    // 只在蓄力阶段显示：六名天兵仍在 190 阵位，标签不会在合围时叠成一团。
    // showLabel 由渲染层按屏幕安全区传入，避免顶部两名天兵的标签压进 HUD。
    if (showLabel && e.charge > BOSS_MECHANICS.wolfDash) {
      c.strokeStyle = '#142623cc';
      c.lineWidth = 3;
      c.strokeText('天兵', 0, -(e.radius * 3.2 + 10));
      c.fillStyle = state.color ?? SOVEREIGN_GOLD;
      c.fillText('天兵', 0, -(e.radius * 3.2 + 10));
    }
  } else {
    c.fillStyle = '#b9ebff';
    c.fillText('猎', 0, -42);
  }
  c.restore();
}

export function drawHeartLink(c: CanvasRenderingContext2D, heart: Enemy, owner: Enemy) {
  c.save();
  c.beginPath();
  c.moveTo(heart.x, heart.y);
  c.lineTo(owner.x, owner.y);
  c.strokeStyle = '#173e2c';
  c.globalAlpha = 0.25;
  c.lineWidth = 5;
  c.stroke();
  c.strokeStyle = heart.bossSummon?.color ?? STAGES[0].color;
  c.globalAlpha = 0.55;
  c.lineWidth = 3;
  c.stroke();
  c.restore();
}

export function drawBossGuard(c: CanvasRenderingContext2D, boss: Enemy) {
  const color = boss.bossStage === FINAL_TRIAL_STAGE ? SOVEREIGN_GOLD : STAGES[0].color;
  c.save();
  c.beginPath();
  c.arc(boss.x, boss.y, boss.radius + 10, 0, TAU);
  c.fillStyle = color;
  c.globalAlpha = 0.18;
  c.fill();
  c.globalAlpha = 0.5;
  c.strokeStyle = color;
  c.lineWidth = 2;
  c.stroke();
  c.restore();
}

export function drawBossMotionCue(c: CanvasRenderingContext2D, b: Shot) {
  const m = b.bossMotion!,
    pose = bossShotPose(b);
  c.save();
  if (!pose.active) c.globalAlpha = 0.55;
  c.strokeStyle = b.color === SOVEREIGN_GOLD ? SOVEREIGN_GOLD : pose.active ? '#ffe4ad' : '#f4d18e';
  c.lineWidth = 2;
  c.beginPath();
  c.arc(0, 0, b.radius + 5, 0, TAU);
  c.stroke();
  if (m.kind === 'return') {
    // 回焰转向前短暂停驻，箭头向来路，不能误画成仍然向外飞。
    const t = b.age - BOSS_MECHANICS.returnWarmup;
    const returning = t >= bossReturnOut(b);
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
    c.strokeStyle = b.color === SOVEREIGN_GOLD ? SOVEREIGN_GOLD : '#e7efff';
    c.beginPath();
    c.arc(0, 0, b.radius + 9, -Math.PI / 2, -Math.PI / 2 + progress * TAU);
    c.stroke();
  } else if (m.kind === 'memory') {
    if (!pose.active) {
      const progress = Math.min(1, b.age / m.warmup);
      c.strokeStyle = b.color === SOVEREIGN_GOLD ? SOVEREIGN_GOLD : '#e5c8f5';
      c.beginPath();
      c.arc(0, 0, b.radius + 9, -Math.PI / 2, -Math.PI / 2 + progress * TAU);
      c.stroke();
    } else {
      c.fillStyle = b.color === SOVEREIGN_GOLD ? SOVEREIGN_GOLD : '#e5c8f5';
      for (let i = 1; i <= 3; i++) {
        c.beginPath();
        c.arc(-i * 9, 0, 3 - i * 0.5, 0, TAU);
        c.fill();
      }
    }
  }
  c.restore();
}
