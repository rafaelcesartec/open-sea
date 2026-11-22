// What every ported drawing shares (draw/common.ts, without pairs or new arrays).

import type { Frame } from '../reference/sim.ts'
import type { Shape } from '../pen.ts'
import { X, Y } from '../pen.ts'

/** One side of the outline and back down the other, front to back, `share` of the body's width. */
export function outline(ctx: Shape & { beginPath(): void }, frames: Frame[], n: number, share: number): void {
  ctx.beginPath()
  for (let i = 0; i < n; i += 1) {
    const f = frames[i]!
    if (i === 0) ctx.moveTo(X(f, 0, f.w * share), Y(f, 0, f.w * share))
    else ctx.lineTo(X(f, 0, f.w * share), Y(f, 0, f.w * share))
  }
  for (let i = n - 1; i >= 0; i -= 1) {
    const f = frames[i]!
    ctx.lineTo(X(f, 0, -f.w * share), Y(f, 0, -f.w * share))
  }
  ctx.closePath()
}

/** Where `near` looks: a share of the length from the front. (A field, not an argument: V8 boxes a number passed to
 * a call it does not inline.) */
export const NEAR = { u: 0.5 }
/** The frame nearest NEAR.u, the first of equals, as `near` of draw/common.ts. */
export function near(frames: Frame[], n: number): Frame {
  const u = NEAR.u
  let best = frames[0]!
  for (let i = 1; i < n; i += 1) if (Math.abs(frames[i]!.u - u) < Math.abs(best.u - u)) best = frames[i]!
  return best
}
