// draw/school.ts, allocation-free: the same fish, op for op (draw.test.ts).

import { KD } from '../kinds.ts'
import { H, hypH } from '../hyp.ts'
import { sizeOf } from '../reference/sim.ts'
import { X, Y, frame, type Pen } from '../pen.ts'
import type { Beast } from '../sea.ts'

const BACK = '#46545d'
const FLANK = '#a3afb5'
const FLASH = '#dde4e7'
const DISTANT = '#7f939d'

const F = frame()
const px = (along: number, out: number): number => X(F, along, out)
const py = (along: number, out: number): number => Y(F, along, out)

export function drawSchool(ctx: Pen, a: Beast, tile: number): void {
  const k = KD[a.kind]!
  for (let i = 0; i < a.fishN; i += 1) {
    const f = a.fish[i]!
    const fd = Math.min(1, Math.max(0, a.depth + f.deep))
    const z = sizeOf(fd) / sizeOf(a.depth)
    const L = k.length * z
    ctx.globalAlpha = 1 - 0.8 * Math.max(0, fd - a.depth)
    const speed = (H[0] = f.vx, H[1] = f.vy, hypH(), H[2]!) || 1
    F.x = f.x
    F.y = f.y
    F.fx = f.vx / speed
    F.fy = f.vy / speed
    const flash = Math.abs(f.turn) > 1.8
    if (tile > 0) {
      ctx.strokeStyle = flash ? FLASH : DISTANT
      ctx.lineWidth = tile
      ctx.lineCap = 'butt'
      ctx.beginPath()
      ctx.moveTo(px(tile * 1.25 * z, 0), py(tile * 1.25 * z, 0))
      ctx.lineTo(px(-tile * 1.25 * z, 0), py(-tile * 1.25 * z, 0))
      ctx.stroke()
      continue
    }
    const sway = Math.sin((2 * Math.PI * f.swum) / (k.speed * k.beat)) * L * 0.07
    const w = L * 0.075
    const tail = L * 0.16
    ctx.beginPath()
    ctx.moveTo(px(L * 0.5, 0), py(L * 0.5, 0))
    ctx.quadraticCurveTo(px(L * 0.44, w * 0.9), py(L * 0.44, w * 0.9), px(L * 0.25, w), py(L * 0.25, w))
    ctx.quadraticCurveTo(px(-L * 0.1, w * 0.95), py(-L * 0.1, w * 0.95), px(-L * 0.3, sway * 0.4 + w * 0.2), py(-L * 0.3, sway * 0.4 + w * 0.2))
    ctx.lineTo(px(-L * 0.36, sway * 0.7 + w * 0.12), py(-L * 0.36, sway * 0.7 + w * 0.12))
    ctx.quadraticCurveTo(px(-L * 0.42, sway + tail * 0.5), py(-L * 0.42, sway + tail * 0.5), px(-L * 0.52, sway + tail), py(-L * 0.52, sway + tail))
    ctx.quadraticCurveTo(px(-L * 0.44, sway + tail * 0.3), py(-L * 0.44, sway + tail * 0.3), px(-L * 0.43, sway), py(-L * 0.43, sway))
    ctx.quadraticCurveTo(px(-L * 0.44, sway - tail * 0.3), py(-L * 0.44, sway - tail * 0.3), px(-L * 0.52, sway - tail), py(-L * 0.52, sway - tail))
    ctx.quadraticCurveTo(px(-L * 0.42, sway - tail * 0.5), py(-L * 0.42, sway - tail * 0.5), px(-L * 0.36, sway * 0.7 - w * 0.12), py(-L * 0.36, sway * 0.7 - w * 0.12))
    ctx.lineTo(px(-L * 0.3, sway * 0.4 - w * 0.2), py(-L * 0.3, sway * 0.4 - w * 0.2))
    ctx.quadraticCurveTo(px(-L * 0.1, -w * 0.95), py(-L * 0.1, -w * 0.95), px(L * 0.25, -w), py(L * 0.25, -w))
    ctx.quadraticCurveTo(px(L * 0.44, -w * 0.9), py(L * 0.44, -w * 0.9), px(L * 0.5, 0), py(L * 0.5, 0))
    ctx.closePath()
    ctx.fillStyle = flash ? FLASH : FLANK
    ctx.fill()
    ctx.beginPath()
    for (let side = -1; side <= 1; side += 2) {
      ctx.moveTo(px(L * 0.22, side * w * 0.9), py(L * 0.22, side * w * 0.9))
      ctx.quadraticCurveTo(px(L * 0.12, side * w * 2), py(L * 0.12, side * w * 2), px(L * 0.02, side * w * 2.1), py(L * 0.02, side * w * 2.1))
      ctx.quadraticCurveTo(px(L * 0.1, side * w * 1.2), py(L * 0.1, side * w * 1.2), px(L * 0.14, side * w * 0.9), py(L * 0.14, side * w * 0.9))
    }
    ctx.fill()
    if (!flash) {
      ctx.beginPath()
      ctx.moveTo(px(L * 0.47, 0), py(L * 0.47, 0))
      ctx.quadraticCurveTo(px(L * 0.2, w * 0.62), py(L * 0.2, w * 0.62), px(-L * 0.33, sway * 0.6), py(-L * 0.33, sway * 0.6))
      ctx.quadraticCurveTo(px(L * 0.2, -w * 0.62), py(L * 0.2, -w * 0.62), px(L * 0.47, 0), py(L * 0.47, 0))
      ctx.fillStyle = BACK
      ctx.fill()
    }
  }
  ctx.globalAlpha = 1
}
