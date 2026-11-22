// What every animal's drawing shares. Each plan of body has its own file and one function:
//   draw(ctx, animal, tile): the animal in sea units onto `ctx` (already scaled to the view). `tile` is the mosaic's
//   tile in sea units, or 0 for the smooth style: a detail narrower than a tile vanishes in the mosaic.
// A body that bends is drawn along `spineOf(animal)`; a rigid one (a shell, a disc) from `poseOf(animal)`. Where it
// is in its stroke is the fraction of `strokes(animal)`.

import type { Frame } from '../sim.ts'

export type Ctx = CanvasRenderingContext2D

export const EYE = '#1d1f22'

/** A point `along` the frame's heading and `out` to its left, in sea units. */
export const at = (f: Frame, along: number, out: number): [number, number] => [f.x + f.fx * along - f.fy * out, f.y + f.fy * along + f.fx * out]

/** One side of the outline and back down the other, front to back, `share` of the body's width. */
export function outline(ctx: Ctx, frames: Frame[], share: number): void {
  ctx.beginPath()
  frames.forEach((f, i) => {
    const [x, y] = at(f, 0, f.w * share)
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  })
  for (let i = frames.length - 1; i >= 0; i -= 1) {
    const [x, y] = at(frames[i]!, 0, -frames[i]!.w * share)
    ctx.lineTo(x, y)
  }
  ctx.closePath()
}

/** The frame nearest `u` (a share of the length from the front). */
export const near = (frames: Frame[], u: number): Frame => frames.reduce((best, f) => (Math.abs(f.u - u) < Math.abs(best.u - u) ? f : best))
