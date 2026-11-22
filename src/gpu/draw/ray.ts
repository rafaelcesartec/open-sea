// draw/ray.ts, allocation-free: the same manta, op for op (draw.test.ts). The disc's points are worked out once per
// drawing into scratch arrays kept here, and what the original's closures held is in the module's `let`s.

import { KD } from '../kinds.ts'
import { H, hypH } from '../hyp.ts'
import { KINDS, type Frame } from '../reference/sim.ts'
import { EYE, TAU, X, Y, frame, type Pen } from '../pen.ts'
import { poseOf, spineOf, strokes, type Beast } from '../sea.ts'

type P = [number, number]

const BODY = '#24272b'
const EDGE = '#3f454c'
// Drawn for a 5.5 m manta: a half span of 220 units, 328 from the front tips to the tail tip.
const HALF = 220
const LENGTH = 328
// Where the tail is rooted, under the disc's rear (the rear of the disc is 198 behind the front tips).
const ROOT = 190
// The wing beat: how far the wing rises or falls at the tip (radians), and how late it is, in beats: out to the tip,
// and across the disc from front to back. A wing is a quarter of a beat behind from its leading to its trailing edge.
const AMP = 0.85
const LAG_OUT = 0.14
const LAG_BACK = 0.7

/** A smooth curve through the points (Catmull-Rom), `n` steps between each. Once, at the start. */
function smooth(pts: P[], n: number): P[] {
  const out: P[] = []
  for (let i = 0; i < pts.length - 1; i += 1) {
    const [p0, p1, p2, p3] = [pts[Math.max(0, i - 1)]!, pts[i]!, pts[i + 1]!, pts[Math.min(pts.length - 1, i + 2)]!]
    for (let j = 0; j < n; j += 1) {
      const t = j / n
      const c = (d: 0 | 1): number =>
        0.5 * (2 * p1[d] + (p2[d] - p0[d]) * t + (2 * p0[d] - 5 * p1[d] + 4 * p2[d] - p3[d]) * t * t +
          (3 * p1[d] - p0[d] - 3 * p2[d] + p3[d]) * t * t * t)
      out.push([c(0), c(1)])
    }
  }
  out.push(pts[pts.length - 1]!)
  return out
}

const flat = (pts: P[]): Float64Array => Float64Array.from(pts.flat())

// The right half of the disc as [out, back] from the front tips, the wings flat: the head's flat front, the cephalic
// fin (a horn 25 units long), the leading edge gently convex and steeper toward a falcate tip (it hooks back), then
// the trailing edge, concave, sweeping in to the pelvic area at the rear of the disc, where the tail begins.
const HEAD = smooth([[0, 27], [12, 26.5], [24, 25]], 4)
const HORN = smooth([[24, 25], [26, 14], [28, 5], [31, 0.5], [34, 1.5], [37, 9], [40, 18], [45, 27]], 4)
const LEAD = smooth([[45, 27], [60, 29], [85, 35], [115, 46.5], [150, 60.5], [182, 74.5], [206, 88], [218, 99],
  [223, 106]], 5)
const TRAIL = smooth([[223, 106], [214, 102.5], [200, 103], [180, 108.5], [155, 119], [130, 132], [105, 146], [80, 160],
  [57, 174], [38, 185], [21, 192.5], [9, 196.5], [0, 198]], 5)
const RIGHT: P[] = [...HEAD, ...HORN.slice(1), ...LEAD.slice(1), ...TRAIL.slice(1)]
const HN = HEAD.length
const TN = TRAIL.length
const RN = RIGHT.length
const RO = flat(RIGHT)

// A white shoulder patch (the right one): a hooked triangle just behind the head, its front edge across the shoulders,
// its hook out toward the wing, its inner edge a narrow dark strip from the midline.
const PATCH = smooth([[10, 50], [40, 48.5], [66, 52.5], [87, 66], [70, 84], [40, 108], [10, 126], [9, 88], [10, 50]], 4)
const PN = PATCH.length
const PO = flat(PATCH)

// Scratch: the disc's two edges, and the tail's spine (x, y, share of the way back) for the most frames a body has.
const MOST = Math.max(...KINDS.map(k => Math.floor((k.length * k.trunk + 0.01) / 5) + 2)) + 16
const RX = new Float64Array(RN)
const RY = new Float64Array(RN)
const LX = new Float64Array(RN)
const LY = new Float64Array(RN)
const TX = new Float64Array(MOST)
const TY = new Float64Array(MOST)
const TT = new Float64Array(MOST)
const POSE: Frame = frame()

// What the drawing is now: the beat, the bank, the scale, and the point a helper last worked out.
// Numbers kept between calls live in this object: a closure's variable would box each new value.
const $ = { RO: 0.5, RB: 0.5, RS: 0.5, REACH: 0.5, MWIDTH: 0.5, MALPHA: 0.5, PHASE: 0, ROLL: 0, SX: 1, SY: 1, PX: 0, PY: 0 }

/** How far a wing is from flat (radians) a share `r` of the way out and `back` units behind the front tips: the wave of
 * the beat, growing toward the tip, later out and back; the body's roll lowers the inner wing and lifts the outer. */
const tilt = (r: number, back: number, side: number, phase: number, roll: number): number => AMP * Math.min(1, r / 0.25) * (0.5 + 0.5 * r) * Math.cos(2 * Math.PI * (phase - LAG_OUT * r - (LAG_BACK * back) / 200)) - side * roll

/** How far out a point of the disc ($.RO out and $.RB back with the wings flat) lies now, into $.REACH: its width
 * foreshortened by the wing's angle all the way out. $.RS is +1 for the right wing. */
function reachAt(): void {
  const out = $.RO
  const back = $.RB
  const side = $.RS
  const phase = $.PHASE
  const roll = $.ROLL
  const steps = Math.max(1, Math.ceil(out / 8))
  const d = out / steps
  let y = 0
  for (let i = 0; i < steps; i += 1) y += d * Math.cos(tilt(((i + 0.5) * d) / HALF, back, side, phase, roll))
  $.REACH = y
}

/** The point of the disc at ($.RO, $.RB) on side $.RS, into $.PX, $.PY. (Numbers go into and out of these helpers
 * through $, not arguments: V8 boxes a number passed to or returned from a call it does not inline.) */
function placeAt(): void {
  const back = $.RB
  const side = $.RS
  reachAt()
  const o = side * $.REACH * $.SX
  $.PX = X(POSE, -back * $.SY, o)
  $.PY = Y(POSE, -back * $.SY, o)
}

/** The tail's edge at point `j` of `m`, `side` of the spine, into $.PX, $.PY: a whip tapering from the root to a thread. */
function edge(j: number, m: number, side: number): void {
  const x0 = TX[Math.max(0, j - 1)]!
  const y0 = TY[Math.max(0, j - 1)]!
  const x1 = TX[Math.min(m - 1, j + 1)]!
  const y1 = TY[Math.min(m - 1, j + 1)]!
  const l = (H[0] = x1 - x0, H[1] = y1 - y0, hypH(), H[2]!) || 1
  const w = side * (0.9 + 4.4 * Math.pow(1 - TT[j]!, 1.1))
  $.PX = TX[j]! - ((y1 - y0) / l) * w
  $.PY = TY[j]! + ((x1 - x0) / l) * w
}

function disc(ctx: Pen): void {
  ctx.beginPath()
  for (let i = 0; i < RN; i += 1) {
    if (i === 0) ctx.moveTo(RX[i]!, RY[i]!)
    else ctx.lineTo(RX[i]!, RY[i]!)
  }
  for (let i = RN - 1; i >= 0; i -= 1) ctx.lineTo(LX[i]!, LY[i]!)
  ctx.closePath()
}

/** A pale grey stripe along both rear margins, `alpha` thick; its colour's alpha rides on the pen's. */
function margin(ctx: Pen): void {
  const alpha = $.MALPHA
  ctx.lineWidth = $.MWIDTH
  ctx.strokeStyle = '#8b949a'
  ctx.beginPath()
  for (let i = RN - TN; i < RN; i += 1) {
    if (i === RN - TN) ctx.moveTo(RX[i]!, RY[i]!)
    else ctx.lineTo(RX[i]!, RY[i]!)
  }
  for (let i = RN - TN; i < RN; i += 1) {
    if (i === RN - TN) ctx.moveTo(LX[i]!, LY[i]!)
    else ctx.lineTo(LX[i]!, LY[i]!)
  }
  const was = ctx.globalAlpha
  ctx.globalAlpha = was * alpha
  ctx.stroke()
  ctx.globalAlpha = was
}

/** A manta, its disc rigid and its wings beating, seen from above. */
export function drawRay(ctx: Pen, a: Beast, tile: number): void {
  void tile
  const k = KD[a.kind]!
  poseOf(a, POSE)
  const n = spineOf(a)
  const frames = a.spine
  const pose = POSE
  const phase = strokes(a) % 1
  // Banking: up to about 17 degrees in the tightest turn (a curve of 1 / 197 a unit); the inner wing is on the side
  // the curve is toward.
  const roll = Math.max(-0.3, Math.min(0.3, a.curve * 60))
  $.PHASE = phase
  $.ROLL = roll
  const sx = k.girth / HALF
  const sy = k.length / LENGTH
  $.SX = sx
  $.SY = sy
  for (let i = 0; i < RN; i += 1) {
    void (($.RO = RO[i * 2]!), ($.RB = RO[i * 2 + 1]!), ($.RS = 1), placeAt())
    RX[i] = $.PX
    RY[i] = $.PY
    void (($.RO = RO[i * 2]!), ($.RB = RO[i * 2 + 1]!), ($.RS = -1), placeAt())
    LX[i] = $.PX
    LY[i] = $.PY
  }
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'

  // The tail: the trail's shape from the disc's rear on, turned and moved to hang from the disc's axis, so it leaves
  // the rigid disc cleanly even where the trail has bent away; a slight ripple on top of the sim's sway.
  let t0 = 0
  while (t0 < n && frames[t0]!.u * k.length < ROOT * sy - 0.01) t0 += 1
  const m = n - t0
  if (m > 3) {
    const first = frames[t0]!
    const cos = first.fx * pose.fx + first.fy * pose.fy
    const sin = first.fx * pose.fy - first.fy * pose.fx
    const rx = X(pose, -ROOT * sy, 0)
    const ry = Y(pose, -ROOT * sy, 0)
    const span = frames[n - 1]!.u * k.length - first.u * k.length
    for (let j = 0; j < m; j += 1) {
      const f = frames[t0 + j]!
      const dx = f.x - first.x
      const dy = f.y - first.y
      const hx = cos * f.fx - sin * f.fy
      const hy = sin * f.fx + cos * f.fy
      const t = (f.u * k.length - first.u * k.length) / span
      const ripple = 3.5 * Math.pow(t, 1.5) * Math.sin(2 * Math.PI * (phase - 0.6 * t))
      TX[j] = rx + cos * dx - sin * dy - hy * ripple
      TY[j] = ry + sin * dx + cos * dy + hx * ripple
      TT[j] = t
    }
    // A whip, tapering from the width of the root to a thread.
    ctx.beginPath()
    for (let j = 0; j < m; j += 1) {
      edge(j, m, 1)
      if (j === 0) ctx.moveTo($.PX, $.PY)
      else ctx.lineTo($.PX, $.PY)
    }
    for (let j = m - 1; j >= 0; j -= 1) {
      edge(j, m, -1)
      ctx.lineTo($.PX, $.PY)
    }
    ctx.closePath()
    ctx.fillStyle = '#272b2f'
    ctx.fill()
  }

  // The disc: black, a little paler along the back where the body is thickest.
  const dome = ctx.createLinearGradient(X(pose, -90, -HALF * sx), Y(pose, -90, -HALF * sx), X(pose, -90, HALF * sx), Y(pose, -90, HALF * sx))
  dome.addColorStop(0, '#202327')
  dome.addColorStop(0.5, '#2a2e33')
  dome.addColorStop(1, '#202327')
  disc(ctx)
  ctx.fillStyle = BODY
  ctx.fill()
  ctx.fillStyle = dome
  ctx.fill()

  ctx.save()
  disc(ctx)
  ctx.clip()
  // The rear margins are pale grey, fading in.
  void (($.MWIDTH = 16), ($.MALPHA = 0.12), margin(ctx))
  void (($.MWIDTH = 8), ($.MALPHA = 0.18), margin(ctx))
  void (($.MWIDTH = 3.5), ($.MALPHA = 0.3), margin(ctx))
  // The shoulder patches: pale by the midline, blending to grey toward the hooked ends. Not white: by day, white came
  // out as pale as the water, and as the manta moved its middle tiles flicked between the body and holes in it.
  for (let s = 0; s < 2; s += 1) {
    const side = s === 0 ? 1 : -1
    void (($.RO = 10), ($.RB = 60), ($.RS = side), placeAt())
    const gx = $.PX
    const gy = $.PY
    void (($.RO = 88), ($.RB = 70), ($.RS = side), placeAt())
    const grad = ctx.createLinearGradient(gx, gy, $.PX, $.PY)
    grad.addColorStop(0, '#b4babb')
    grad.addColorStop(0.55, '#9aa1a3')
    grad.addColorStop(1, '#6d757a')
    ctx.beginPath()
    for (let i = 0; i < PN; i += 1) {
      void (($.RO = PO[i * 2]!), ($.RB = PO[i * 2 + 1]!), ($.RS = side), placeAt())
      if (i === 0) ctx.moveTo($.PX, $.PY)
      else ctx.lineTo($.PX, $.PY)
    }
    ctx.closePath()
    ctx.fillStyle = grad
    ctx.fill()
  }
  // A wing tilted from the flat catches a little more of the light from above: a sheen runs out along each wing as it
  // beats, and lies on the inner wing in a bank.
  for (let s = 0; s < 2; s += 1) {
    const side = s === 0 ? 1 : -1
    const tip = (($.RO = HALF), ($.RB = 90), ($.RS = side), reachAt(), $.REACH)
    const sheen = ctx.createLinearGradient(X(pose, -90 * sy, 0), Y(pose, -90 * sy, 0), X(pose, -90 * sy, side * tip * sx), Y(pose, -90 * sy, side * tip * sx))
    for (let i = 0; i <= 8; i += 1) {
      const out = (($.RO = (i / 8) * HALF), ($.RB = 90), ($.RS = side), reachAt(), $.REACH)
      const alpha = 0.2 * Math.abs(Math.sin(tilt(i / 8, 90, side, phase, roll)))
      sheen.stop(out / tip, 150, 168, 184, alpha)
    }
    ctx.beginPath()
    ctx.moveTo(X(pose, 50, 0), Y(pose, 50, 0))
    ctx.lineTo(X(pose, -250, 0), Y(pose, -250, 0))
    ctx.lineTo(X(pose, -250, side * 300), Y(pose, -250, side * 300))
    ctx.lineTo(X(pose, 50, side * 300), Y(pose, 50, side * 300))
    ctx.closePath()
    ctx.fillStyle = sheen
    ctx.fill()
  }
  // The mouth: a dark line along the flat front, between the cephalic fins.
  ctx.beginPath()
  for (let i = HN - 1; i >= 0; i -= 1) {
    const x = LX[i]! - pose.fx * 4
    const y = LY[i]! - pose.fy * 4
    if (i === HN - 1) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  for (let i = 1; i < HN; i += 1) ctx.lineTo(RX[i]! - pose.fx * 4, RY[i]! - pose.fy * 4)
  ctx.lineWidth = 2.2
  ctx.strokeStyle = 'rgba(14, 16, 18, 0.55)'
  ctx.stroke()
  ctx.restore()

  // The edge, a little lighter than the body so the silhouette reads on the dark sea.
  disc(ctx)
  ctx.lineWidth = 1.8
  ctx.strokeStyle = EDGE
  ctx.stroke()

  // The small dorsal fin at the tail's base: a dark ridge along the midline.
  ctx.beginPath()
  ctx.moveTo(X(pose, -172 * sy, 0), Y(pose, -172 * sy, 0))
  ctx.quadraticCurveTo(X(pose, -182 * sy, 3.6), Y(pose, -182 * sy, 3.6), X(pose, -198 * sy, 0), Y(pose, -198 * sy, 0))
  ctx.quadraticCurveTo(X(pose, -182 * sy, -3.6), Y(pose, -182 * sy, -3.6), X(pose, -172 * sy, 0), Y(pose, -172 * sy, 0))
  ctx.fillStyle = '#1b1d20'
  ctx.fill()

  // The eyes: small bumps on the sides of the head, just behind the cephalic fins.
  for (let s = 0; s < 2; s += 1) {
    void (($.RO = 57), ($.RB = 33), ($.RS = s === 0 ? 1 : -1), placeAt())
    ctx.beginPath()
    ctx.arc($.PX, $.PY, 4.6, 0, TAU)
    ctx.fillStyle = '#2d3136'
    ctx.fill()
    ctx.lineWidth = 1.2
    ctx.strokeStyle = EDGE
    ctx.stroke()
    ctx.beginPath()
    ctx.arc($.PX, $.PY, 2, 0, TAU)
    ctx.fillStyle = EYE
    ctx.fill()
  }
}
