// draw/shark.ts, allocation-free: the same shark, op for op (draw.test.ts).

import { KD } from '../kinds.ts'
import { H, hypH } from '../hyp.ts'
import type { Frame } from '../reference/sim.ts'
import { EYE, TAU, X, Y, frame, type Pen } from '../pen.ts'
import { spineOf, type Beast } from '../sea.ts'
import { NEAR, near, outline } from './common.ts'

type Look = { fringe: string; flank: string; back: string; bar?: string; tips?: string; spots?: string }

const LOOKS: Record<string, Look> = {
  white: { fringe: '#474e53', flank: '#7b8388', back: '#5c6469' },
  hammer: { fringe: '#55544b', flank: '#88877a', back: '#6c6b61' },
  tiger: { fringe: '#4a524d', flank: '#7b8580', back: '#5d6660', bar: '#363d38' },
  blacktip: { fringe: '#57544b', flank: '#8b877b', back: '#6e6a5f', tips: '#1a1b1d' },
  // Whale shark: dark blue-grey, its back and sides dotted with pale spots, paler below.
  whaleshark: { fringe: '#2e3d48', flank: '#6b7d88', back: '#3d4e5a', spots: '#dfe7ea' },
}

/** The fins at `f`, $.REACH out, rooted along $.ROOT units. */
function fins(ctx: Pen, look: Look, f: Frame): void {
  const reach = $.REACH
  const root = $.ROOT
  for (let s = 0; s < 2; s += 1) {
    const side = s === 0 ? -1 : 1
    const w = f.w
    ctx.beginPath()
    ctx.moveTo(X(f, root * 0.5, side * (w * 0.8)), Y(f, root * 0.5, side * (w * 0.8)))
    ctx.quadraticCurveTo(X(f, -reach * 0.05, side * (w + reach * 0.5)), Y(f, -reach * 0.05, side * (w + reach * 0.5)), X(f, -reach * 0.62, side * (w + reach * 0.72)), Y(f, -reach * 0.62, side * (w + reach * 0.72)))
    ctx.quadraticCurveTo(X(f, -reach * 0.32, side * (w + reach * 0.3)), Y(f, -reach * 0.32, side * (w + reach * 0.3)), X(f, -root * 0.5, side * (w * 0.8)), Y(f, -root * 0.5, side * (w * 0.8)))
    ctx.closePath()
    ctx.fillStyle = look.back
    ctx.fill()
    if (look.tips !== undefined) {
      ctx.beginPath()
      ctx.arc(X(f, -reach * 0.56, side * (w + reach * 0.64)), Y(f, -reach * 0.56, side * (w + reach * 0.64)), reach * 0.12, 0, TAU)
      ctx.fillStyle = look.tips
      ctx.fill()
    }
  }
}

// The lobe's frame: `last` turned by (da, db), so p(s, w) = at(last, da * s - db * w, db * s + da * w).
let LF: Frame = frame()
// Numbers kept between calls live in this object: a closure's variable would box each new value.
const $ = { STOCK: 0.5, ALONG: 0.5, OUT: 0.5, THICK: 0.5, REACH: 0.5, ROOT: 0.5, DA: 0, DB: 0 }
const lx = (s: number, w: number): number => X(LF, $.DA * s - $.DB * w, $.DB * s + $.DA * w)
const ly = (s: number, w: number): number => Y(LF, $.DA * s - $.DB * w, $.DB * s + $.DA * w)

/** A lobe of the tail fin off `last`: $.STOCK wide at the root, $.ALONG and $.OUT to its tip, $.THICK thick. */
function lobe(ctx: Pen, look: Look, last: Frame): void {
  const stock = $.STOCK
  const along = $.ALONG
  const out = $.OUT
  const thick = $.THICK
  const l = (H[0] = along, H[1] = out, hypH(), H[2]!)
  LF = last
  $.DA = along / l
  $.DB = out / l
  ctx.beginPath()
  ctx.moveTo(lx(-2, -stock), ly(-2, -stock))
  ctx.bezierCurveTo(lx(l * 0.3, -thick * 1.7), ly(l * 0.3, -thick * 1.7), lx(l * 0.75, -thick * 0.9), ly(l * 0.75, -thick * 0.9), lx(l, 0), ly(l, 0))
  ctx.bezierCurveTo(lx(l * 0.75, thick * 0.9), ly(l * 0.75, thick * 0.9), lx(l * 0.3, thick * 1.7), ly(l * 0.3, thick * 1.7), lx(-2, stock), ly(-2, stock))
  ctx.closePath()
  ctx.fillStyle = look.fringe
  ctx.fill()
}

const SIDE = new Float64Array(30)

export function drawShark(ctx: Pen, s: Beast, tile: number): void {
  const k = KD[s.kind]!
  const look = LOOKS[k.name]!
  const n = spineOf(s)
  const frames = s.spine
  if (n < 3) return
  const L = k.length

  const last = frames[n - 1]!
  const stock = last.w
  const blade = L * (1 - k.trunk)
  const before = ((NEAR.u = k.trunk - 0.18), near(frames, n))
  const bend = Math.atan2(before.fx * last.fy - before.fy * last.fx, before.fx * last.fx + before.fy * last.fy)
  const tall = Math.min(1, Math.max(0, (L - 230) / 120))
  const roll = Math.sin(Math.max(-0.9, Math.min(0.9, bend * 1.6)) * tall)
  void (($.STOCK = stock), ($.ALONG = -blade), ($.OUT = roll * blade * 0.9), ($.THICK = stock), lobe(ctx, look, last))
  if (roll !== 0) (($.STOCK = stock), ($.ALONG = -blade * 0.7), ($.OUT = -roll * blade * 0.6), ($.THICK = stock * 0.8), lobe(ctx, look, last))

  void (($.REACH = k.fin), ($.ROOT = L * 0.07), fins(ctx, look, ((NEAR.u = 0.27), near(frames, n))))
  void (($.REACH = k.fin * 0.3), ($.ROOT = L * 0.03), fins(ctx, look, ((NEAR.u = 0.6), near(frames, n))))

  outline(ctx, frames, n, 1)
  ctx.fillStyle = look.flank
  ctx.fill()
  ctx.lineWidth = 1.6
  ctx.strokeStyle = look.fringe
  ctx.stroke()
  outline(ctx, frames, n, 0.6)
  ctx.fillStyle = look.back
  ctx.fill()
  // A whale shark's spots: over the back and the flanks, pale, scattered by a fixed pattern so they stay put.
  if (look.spots !== undefined && tile === 0) {
    ctx.fillStyle = look.spots
    ctx.beginPath()
    for (let i = 0; i < n; i += 1) {
      const f = frames[i]!
      for (let j = 0; j < 5; j += 1) {
        const r = Math.sin(i * 12.9898 + j * 78.233) * 43758.5453
        const u = r - Math.floor(r)
        const out = (j % 2 === 0 ? -1 : 1) * f.w * (0.15 + 0.7 * u)
        const x = X(f, 0, out)
        const y = Y(f, 0, out)
        ctx.moveTo(x + 1.6, y)
        ctx.arc(x, y, 1.1 + u * 0.9, 0, TAU)
      }
    }
    ctx.fill()
  }


  if (look.bar !== undefined) {
    ctx.strokeStyle = look.bar
    ctx.lineWidth = 3
    ctx.lineCap = 'round'
    ctx.beginPath()
    for (let i = 0; i < n; i += 1) {
      const f = frames[i]!
      if (f.u < 0.22 || f.u > 0.72 || Math.abs((f.u * L) % 26) > 2.6) continue
      ctx.moveTo(X(f, 0, f.w * 0.7), Y(f, 0, f.w * 0.7))
      ctx.lineTo(X(f, 0, -f.w * 0.7), Y(f, 0, -f.w * 0.7))
    }
    ctx.stroke()
  }

  const dorsal = ((NEAR.u = 0.4), near(frames, n))
  ctx.strokeStyle = look.tips ?? look.fringe
  ctx.lineWidth = Math.max(2, k.girth * 0.13)
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(X(dorsal, L * 0.04, 0), Y(dorsal, L * 0.04, 0))
  ctx.lineTo(X(dorsal, -L * 0.07, 0), Y(dorsal, -L * 0.07, 0))
  ctx.stroke()

  const head = frames[0]!
  ctx.fillStyle = EYE
  if (k.hammer === true) {
    const span = L * 0.13
    const deep = L * 0.028
    const neck = ((NEAR.u = 0.06), near(frames, n)).w
    const p = SIDE
    p[0] = 1.3 * deep; p[1] = 0
    p[2] = 1.25 * deep; p[3] = 0.25 * span
    p[4] = 1.1 * deep; p[5] = 0.5 * span
    p[6] = 0.85 * deep; p[7] = 0.75 * span
    p[8] = 0.6 * deep; p[9] = 0.9 * span
    p[10] = 0.3 * deep; p[11] = 0.98 * span
    p[12] = -0.1 * deep; p[13] = span
    p[14] = -0.5 * deep; p[15] = 0.99 * span
    p[16] = -0.8 * deep; p[17] = 0.93 * span
    p[18] = -0.95 * deep; p[19] = 0.82 * span
    p[20] = -1.02 * deep; p[21] = 0.6 * span
    p[22] = -1.08 * deep; p[23] = Math.max(neck * 1.45, 0.38 * span)
    p[24] = -1.3 * deep; p[25] = neck * 1.15
    p[26] = -1.8 * deep; p[27] = neck * 1.03
    p[28] = -2.6 * deep; p[29] = neck
    ctx.beginPath()
    ctx.moveTo(X(head, p[0]!, p[1]!), Y(head, p[0]!, p[1]!))
    for (let i = 1; i < 15; i += 1) ctx.lineTo(X(head, p[i * 2]!, p[i * 2 + 1]!), Y(head, p[i * 2]!, p[i * 2 + 1]!))
    for (let i = 14; i >= 1; i -= 1) ctx.lineTo(X(head, p[i * 2]!, -p[i * 2 + 1]!), Y(head, p[i * 2]!, -p[i * 2 + 1]!))
    ctx.closePath()
    ctx.fillStyle = look.back
    ctx.fill()
    ctx.strokeStyle = look.fringe
    ctx.lineWidth = 1.6
    ctx.stroke()
    ctx.fillStyle = EYE
    for (let b = -1; b <= 1; b += 2) {
      ctx.beginPath()
      ctx.arc(X(head, -deep * 0.15, b * span * 0.93), Y(head, -deep * 0.15, b * span * 0.93), 1.8, 0, TAU)
      ctx.fill()
    }
  } else {
    const eye = ((NEAR.u = 0.06), near(frames, n))
    for (let b = -1; b <= 1; b += 2) {
      ctx.beginPath()
      ctx.arc(X(eye, 0, b * eye.w * 0.78), Y(eye, 0, b * eye.w * 0.78), 1.5, 0, TAU)
      ctx.fill()
    }
  }
}
