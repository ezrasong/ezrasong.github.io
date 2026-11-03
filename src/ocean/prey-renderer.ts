import { PREY_SQUID, type Prey } from './prey';

/** Connected silhouettes at the prey's actual position, with continuous
 * tail beats / squid jets. Small scale marks echo the orca's pixel texture.
 */
export function drawPrey(
  ctx: CanvasRenderingContext2D, p: Prey, scale: number,
  colors: { bg: string; prey: string; preyBright: string },
): void {
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.heading);
  const size = scale * (0.9 + (p.school % 3) * 0.08);
  ctx.scale(size, size);
  const beat = p.age * (6 + p.fear * 7) + p.school;
  ctx.fillStyle = colors.prey;
  ctx.strokeStyle = colors.preyBright;
  ctx.lineWidth = 0.7;
  if (p.kind === PREY_SQUID) {
    // Paired mantle fins and a pointed, pulsing mantle lead the animal.
    const pulse = 1 + Math.sin(beat) * 0.09;
    ctx.beginPath();
    ctx.moveTo(11, 0); ctx.lineTo(1, -7 * pulse); ctx.lineTo(-2, 0); ctx.lineTo(1, 7 * pulse);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(13, 0); ctx.bezierCurveTo(5, -6 * pulse, -4, -5 * pulse, -5, 0);
    ctx.bezierCurveTo(-4, 5 * pulse, 5, 6 * pulse, 13, 0);
    ctx.fill(); ctx.stroke();
    // Five arms trail from the head, rather than unattached text glyphs.
    for (let arm = -2; arm <= 2; arm++) {
      ctx.beginPath(); ctx.moveTo(-4, arm * 1.2);
      ctx.bezierCurveTo(-9, arm * 1.6, -12, arm * 2 + Math.sin(beat + arm) * 2, -19 + Math.abs(arm), arm * 2 + Math.sin(beat - 1 + arm) * 2.5);
      ctx.stroke();
    }
    ctx.fillStyle = colors.preyBright;
    ctx.beginPath(); ctx.arc(-2, -1, 1.7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = colors.bg;
    ctx.beginPath(); ctx.arc(-2, -1, 0.9, 0, Math.PI * 2); ctx.fill();
  } else {
    const tail = Math.sin(beat) * 2.5;
    ctx.beginPath();
    ctx.moveTo(-8, 0); ctx.lineTo(-16, -5 + tail); ctx.lineTo(-14, tail); ctx.lineTo(-16, 5 + tail);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    // Dorsal and ventral fins remain joined to the body.
    ctx.beginPath();
    ctx.moveTo(-3, -3); ctx.lineTo(-1, -7); ctx.lineTo(3, -3);
    ctx.moveTo(-1, 3); ctx.lineTo(-3, 6); ctx.lineTo(4, 3);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(11, 0); ctx.bezierCurveTo(4, -6, -5, -6, -10, 0);
    ctx.bezierCurveTo(-5, 6, 4, 6, 11, 0);
    ctx.fill(); ctx.stroke();
    // Lateral line, gill and scale glints give a readable head and flank.
    ctx.beginPath(); ctx.moveTo(-7, 0); ctx.lineTo(3, 0);
    ctx.moveTo(3, -3); ctx.quadraticCurveTo(1, 0, 3, 3); ctx.stroke();
    for (let x = -5; x < 1; x += 3) {
      ctx.fillStyle = colors.preyBright;
      ctx.fillRect(x, -2, 1, 1); ctx.fillRect(x + 1, 1, 1, 1);
    }
    ctx.fillStyle = colors.bg;
    ctx.beginPath(); ctx.arc(6, -1, 1.3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = colors.preyBright;
    ctx.fillRect(6, -2, 0.7, 0.7);
  }
  ctx.restore();
}
