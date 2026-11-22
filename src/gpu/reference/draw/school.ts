// A school of bigeye trevally from above: each fish a firm spindle with a blunt head, small sickle pectorals and a
// deeply forked crescent tail; dark blue-grey along the back, its silver flanks showing as a pale rim. A fish turning
// hard rolls and flashes silver, so a school wheeling round shimmers as real ones do. The tail beats side to side.
// In the mosaic a fish is narrower than a tile, so each lights a short streak of about two and a half tiles through
// its middle: the school reads as many short parallel dashes, all one way, not as worms.

import { KINDS, fishDepth, sizeOf, type Animal } from '../sim.ts'
import type { Ctx } from './common.ts'

const BACK = '#46545d'
const FLANK = '#a3afb5'
const FLASH = '#dde4e7'
const DISTANT = '#7f939d'

export function drawSchool(ctx: Ctx, a: Animal, tile: number): void {
  const k = KINDS[a.kind]!
  for (const f of a.fish) {
    // A fish off the school's depth is drawn to its own size there, and a little fainter the deeper it is.
    const fd = fishDepth(a, f)
    const z = sizeOf(fd) / sizeOf(a.depth)
    const L = k.length * z
    ctx.globalAlpha = 1 - 0.8 * Math.max(0, fd - a.depth)
    const speed = Math.hypot(f.vx, f.vy) || 1
    const fx = f.vx / speed
    const fy = f.vy / speed
    // A point `along` the fish (from its middle, forward) and `out` to one side.
    const p = (along: number, out: number): [number, number] => [f.x + fx * along - fy * out, f.y + fy * along + fx * out]
    // Rolled over in a hard turn, the whole silver side faces up.
    const flash = Math.abs(f.turn) > 1.8
    if (tile > 0) {
      ctx.strokeStyle = flash ? FLASH : DISTANT
      ctx.lineWidth = tile
      ctx.lineCap = 'butt'
      // Two and a half tiles, centred on the fish: a long streak reads as a segmented worm.
      ctx.beginPath()
      ctx.moveTo(...p(tile * 1.25 * z, 0))
      ctx.lineTo(...p(-tile * 1.25 * z, 0))
      ctx.stroke()
      continue
    }
    // The tail swings with each beat, more toward its tip.
    const sway = Math.sin((2 * Math.PI * f.swum) / (k.speed * k.beat)) * L * 0.07
    const w = L * 0.075
    const tail = L * 0.16
    ctx.beginPath()
    ctx.moveTo(...p(L * 0.5, 0))
    ctx.quadraticCurveTo(...p(L * 0.44, w * 0.9), ...p(L * 0.25, w))
    ctx.quadraticCurveTo(...p(-L * 0.1, w * 0.95), ...p(-L * 0.3, sway * 0.4 + w * 0.2))
    // The slender tail stock, then the forked crescent tail, its lobes swept back.
    ctx.lineTo(...p(-L * 0.36, sway * 0.7 + w * 0.12))
    ctx.quadraticCurveTo(...p(-L * 0.42, sway + tail * 0.5), ...p(-L * 0.52, sway + tail))
    ctx.quadraticCurveTo(...p(-L * 0.44, sway + tail * 0.3), ...p(-L * 0.43, sway))
    ctx.quadraticCurveTo(...p(-L * 0.44, sway - tail * 0.3), ...p(-L * 0.52, sway - tail))
    ctx.quadraticCurveTo(...p(-L * 0.42, sway - tail * 0.5), ...p(-L * 0.36, sway * 0.7 - w * 0.12))
    ctx.lineTo(...p(-L * 0.3, sway * 0.4 - w * 0.2))
    ctx.quadraticCurveTo(...p(-L * 0.1, -w * 0.95), ...p(L * 0.25, -w))
    ctx.quadraticCurveTo(...p(L * 0.44, -w * 0.9), ...p(L * 0.5, 0))
    ctx.closePath()
    ctx.fillStyle = flash ? FLASH : FLANK
    ctx.fill()
    // Small sickle pectorals just behind the head.
    ctx.beginPath()
    for (const side of [-1, 1]) {
      ctx.moveTo(...p(L * 0.22, side * w * 0.9))
      ctx.quadraticCurveTo(...p(L * 0.12, side * w * 2), ...p(L * 0.02, side * w * 2.1))
      ctx.quadraticCurveTo(...p(L * 0.1, side * w * 1.2), ...p(L * 0.14, side * w * 0.9))
    }
    ctx.fill()
    if (!flash) {
      // The dark back along the middle.
      ctx.beginPath()
      ctx.moveTo(...p(L * 0.47, 0))
      ctx.quadraticCurveTo(...p(L * 0.2, w * 0.62), ...p(-L * 0.33, sway * 0.6))
      ctx.quadraticCurveTo(...p(L * 0.2, -w * 0.62), ...p(L * 0.47, 0))
      ctx.fillStyle = BACK
      ctx.fill()
    }
  }
  ctx.globalAlpha = 1
}
