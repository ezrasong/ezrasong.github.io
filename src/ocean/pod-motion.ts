import type { OrcaTemplate } from './orca-model';
import type { OrcaMotion } from './orca-motion';

/** Look along both bent spines, including where their motion will carry them.
 * Give each pod member a stable passing depth, so a three-way encounter cannot
 * reverse its yielding direction every frame. Motion eases into these lanes;
 * positions and the recorded swimming trails are never moved discontinuously.
 */
export function steerPod(pod: ReadonlyArray<{ tpl: OrcaTemplate; motion: OrcaMotion }>, feeding?: OrcaMotion): void {
  const yielding = new Set<number>();
  const others = feeding ? pod.filter((o) => o.motion !== feeding) : pod;
  const length = Math.max(...pod.map((o) => o.tpl.length));
  for (let i = 0; i < pod.length; i++) {
    const a = pod[i]!;
    for (let j = i + 1; j < pod.length; j++) {
      const b = pod[j]!;
      const velocity = (m: OrcaMotion): number[] => [
        Math.cos(m.yaw) * Math.cos(m.pitch) * m.speed,
        Math.sin(m.pitch) * m.speed,
        Math.sin(m.yaw) * Math.cos(m.pitch) * m.speed,
      ];
      const av = velocity(a.motion), bv = velocity(b.motion);
      const vx = av[0]! - bv[0]!, vy = av[1]! - bv[1]!, vz = av[2]! - bv[2]!;
      const vv = vx * vx + vy * vy + vz * vz;
      const ap = a.motion.pose, bp = b.motion.pose;
      // Ten samples cover the entire body and fin envelope without comparing
      // the thousands of skin points used by the renderer.
      const clearance = (a.tpl.length + b.tpl.length) * 0.19;
      let conflict = false;
      for (let s = 0; s <= 10 && !conflict; s++) {
        const ak = Math.round(s * (ap.cx.length - 1) / 10);
        for (let t = 0; t <= 10; t++) {
          const bk = Math.round(t * (bp.cx.length - 1) / 10);
          const dx = ap.cx[ak]! - bp.cx[bk]!;
          const dy = ap.cy[ak]! - bp.cy[bk]!;
          const dz = ap.cz[ak]! - bp.cz[bk]!;
          const ahead = vv > 0.01 ? Math.max(0, Math.min(3, -(dx * vx + dy * vy + dz * vz) / vv)) : 0;
          if (Math.hypot(dx + vx * ahead, dy + vy * ahead, dz + vz * ahead) < clearance) {
            conflict = true;
            break;
          }
        }
      }
      if (conflict) {
        // One animal approaches the dropped food at a time. Pod mates give
        // it room, instead of steering it away from the meal indefinitely.
        if (a.motion !== feeding) yielding.add(i);
        if (b.motion !== feeding) yielding.add(j);
      }
    }
  }
  for (const i of yielding) {
    const m = pod[i]!.motion;
    // The meal is at z=0. Reserve that lane for its feeder, even when a
    // visitor rather than the resident is the one taking the food.
    const lane = feeding ? (others.indexOf(pod[i]!) === 0 ? -1 : 1) : i - (pod.length - 1) / 2;
    const z = m.zone;
    const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
    m.avoid(
      clamp(m.x + Math.cos(m.yaw) * length, z.x0, z.x1),
      clamp((z.y0 + z.y1) / 2 + lane * length * 1.3, z.y0, z.y1),
      lane * length * 0.75,
    );
  }
}
