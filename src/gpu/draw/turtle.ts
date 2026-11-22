// draw/turtle.ts, allocation-free: the same turtle, op for op (draw.test.ts). Its tables and scutes are made once,
// here, as flat numbers; a drawing only fills module-level scratch. Drawn in a frame of (back, side): `back` units
// behind the head tip, `side` units out from the midline.

import { H, hypH } from '../hyp.ts'
import { KINDS } from '../reference/sim.ts'
import { EYE, TAU, X, Y, frame, type Pen } from '../pen.ts'
import { poseOf, strokes, type Beast } from '../sea.ts'

type Pt = [number, number]

const turtle = KINDS.find(k => k.plan === 'turtle')!
const L = turtle.length
const W = turtle.girth

// Olive-brown shell, lighter at the middle of each scute, dark seams, yellowish growth streaks; dark scaly skin with
// pale yellowish edges to the scales.
const SHELL = { base: '#6b5d3e', centre: '#8a7a50', seam: '#3f3524', ring: '#76684a' }
const STREAK = { pale: 'rgba(160, 140, 85, 0.24)', dark: 'rgba(63, 53, 36, 0.2)' }
const SKIN = { scale: '#5a5143', edge: '#b3a684', seam: 'rgba(179, 166, 132, 0.45)', claw: '#d2c7a5' }
// The shell's two gradient colours as numbers (a gradient's stops are given as r, g, b, a).
const rgb = (hex: string): number[] => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]
const [CR, CG, CB] = rgb(SHELL.centre) as [number, number, number]
const [BR, BG, BB] = rgb(SHELL.base) as [number, number, number]

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v))
const flat = (pts: Pt[]): Float64Array => Float64Array.from(pts.flat())
/** The value of a table of (x, y) pairs at `x`, straight between its points. */
/** The table at $.TX, into $.TY. (Numbers go into and out of these helpers through $, not arguments: V8 boxes a
 * number passed to or returned from a call it does not inline.) */
function tableAt(pts: Float64Array): void {
  const x = $.TX
  const m = pts.length >> 1
  let i = 1
  while (i < m - 1 && pts[i * 2]! < x) i += 1
  const x0 = pts[(i - 1) * 2]!
  const y0 = pts[(i - 1) * 2 + 1]!
  const x1 = pts[i * 2]!
  const y1 = pts[i * 2 + 1]!
  $.TY = y0 + (y1 - y0) * clamp((x - x0) / (x1 - x0), 0, 1)
}

// THE CARAPACE: a broad oval, a little heart-shaped (blunt and wide in front, widest just ahead of the middle, a
// rounder taper behind), 0.78 L long and 2 W wide, its front edge 0.15 L behind the head tip.
const FRONT = 0.15 * L
const SPAN = 0.78 * L
/** The marginal scutes round the rim. */
const RING = 4.4
/** Half the carapace's width `t` of the way back from its front edge (0 to 1). */
function halfAt(t: number): number {
  const [u, p] = t < 0.4 ? [1 - t / 0.4, 2.1] : [(t - 0.4) / 0.6, 1.75]
  return W * Math.pow(1 - Math.pow(Math.min(1, u), p), 1 / p)
}
/** A place on the carapace: `s` is its share of the half width there. */
const shell = (t: number, s: number): Pt => [FRONT + t * SPAN, s * halfAt(t)]

/** A scute: its outline `pts` (`n` of them), its middle and radius, and its 12 growth streaks as triangles (3 points
 * each) in `rays`, the even ones dark. */
type Scute = { pts: Float64Array; n: number; cx: number; cy: number; r: number; rays: Float64Array }
/** A scute from its corners in shell space; every edge is cut short so it follows the curve of the shell. */
function scute(corners: Pt[], n: number): Scute {
  const pts: Pt[] = []
  corners.forEach(([t0, s0], i) => {
    const [t1, s1] = corners[(i + 1) % corners.length]!
    for (let k = 0; k < 5; k += 1) pts.push(shell(t0 + ((t1 - t0) * k) / 5, s0 + ((s1 - s0) * k) / 5))
  })
  const c: Pt = [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length]
  const r = pts.reduce((s, p) => s + (H[0] = p[0] - c[0], H[1] = p[1] - c[1], hypH(), H[2]!), 0) / pts.length
  // Growth streaks run out from the middle of each scute, darker and yellower in turn, each scute turned a little.
  const rays = new Float64Array(12 * 6)
  for (let k = 0; k < 12; k += 1) {
    const a = ((k + (n % 3) / 3) / 12) * Math.PI * 2
    const far = r * 1.8
    rays[k * 6] = c[0]
    rays[k * 6 + 1] = c[1]
    rays[k * 6 + 2] = c[0] + Math.cos(a - 0.12) * far
    rays[k * 6 + 3] = c[1] + Math.sin(a - 0.12) * far
    rays[k * 6 + 4] = c[0] + Math.cos(a + 0.12) * far
    rays[k * 6 + 5] = c[1] + Math.sin(a + 0.12) * far
  }
  return { pts: flat(pts), n: pts.length, cx: c[0], cy: c[1], r, rays }
}

// Five vertebral scutes down the midline (hexagons, a little wider than long) and four costals either side; the costal
// seams start at the side points of the vertebrals. In shell space: where each vertebral begins, and its half width
// there and at its middle.
const TV = [0.11, 0.28, 0.44, 0.6, 0.77, 0.93]
const SV = [0.26, 0.21, 0.2, 0.2, 0.2, 0.12]
const SM = [0.3, 0.32, 0.31, 0.3, 0.26]
const SCUTES: Scute[] = []
for (let i = 0; i < 5; i += 1) {
  const m = (TV[i]! + TV[i + 1]!) / 2
  const [a, b, c, d] = [TV[i]!, TV[i + 1]!, SV[i]!, SV[i + 1]!]
  SCUTES.push(scute([[a, -c], [m, -SM[i]!], [b, -d], [b, d], [m, SM[i]!], [a, c]], i))
}
// The side of the vertebrals as it zigzags down, the corners where the costal seams leave it, and where they meet the
// rim.
const edge: Pt[] = []
for (let i = 0; i < 6; i += 1) {
  edge.push([TV[i]!, SV[i]!])
  if (i < 5) edge.push([(TV[i]! + TV[i + 1]!) / 2, SM[i]!])
}
const seamAt = [0, 3, 5, 7, 10]
const seamOut = [0.09, 0.42, 0.575, 0.735, 0.93]
for (const side of [1, -1]) {
  for (let c = 0; c < 4; c += 1) {
    const corners: Pt[] = [[seamOut[c]!, 0.97], ...edge.slice(seamAt[c], seamAt[c + 1]! + 1), [seamOut[c + 1]!, 0.97]]
    SCUTES.push(scute(corners.map(([t, s]): Pt => [t, s * side]), 5 + c + 4 * (side > 0 ? 0 : 1)))
  }
}

/** The rim, from the front point down one side and back up the other. */
const contour: Pt[] = []
for (let i = 0; i <= 40; i += 1) contour.push(shell((1 - Math.cos((Math.PI * i) / 40)) / 2, 1))
for (let i = 39; i >= 1; i -= 1) contour.push([contour[i]![0], -contour[i]![1]])
const CONTOUR = flat(contour)
const CONTOUR_N = contour.length
// A seam between marginal scutes every few units of rim, running in toward the middle.
const ticks: [Pt, Pt][] = []
// Numbers kept between calls live in this object: a closure's variable would box each new value.
const $ = { TX: 0.5, TY: 0.5, since: 0, REACH: 0, YC: 1, YS: 0 }
contour.forEach(([b, y], i) => {
  const [pb, py] = contour[(i + contour.length - 1) % contour.length]!
  $.since += (H[0] = b - pb, H[1] = y - py, hypH(), H[2]!)
  if ($.since < 8) return
  $.since = 0
  const cb = FRONT + 0.44 * SPAN - b
  const d = (H[0] = cb, H[1] = y, hypH(), H[2]!)
  ticks.push([[b, y], [b + (cb / d) * RING, y - (y / d) * RING]])
})
const TICKS = Float64Array.from(ticks.flat(2))
const TICKS_N = ticks.length

// THE HEAD: small and rounded with a blunt short snout, widest behind the eyes, then the neck widening under the
// carapace. Half widths by distance behind the tip.
const HEAD = flat([
  [0, 0], [0.7, 2.4], [2, 4], [4, 5.3], [6.5, 6.1], [9, 6.2], [11.5, 5.4], [13.5, 4.8], [16, 5.4], [19, 7], [22, 8.8],
  [26, 10],
])
/** The seams between the large scales of the crown: two pairs of prefrontals, the frontal, the rest behind; each seam
 * a pair of points (back, side) and a pair. */
const CROWN = flat([
  [3.4, -3.4], [3.4, 3.4], [1, 0], [5.8, 0], [5.8, 0], [8.8, 3.6], [5.8, 0], [8.8, -3.6], [8.8, -4.8], [8.8, 4.8],
])
/** Where the neck meets the shoulders: the head swings about here when it leads into a turn. */
const NECK = 26

// THE FLIPPERS. Front: 0.42 L long, rooted at the shoulder just behind the head, under the edge of the shell. Half
// width along them (the leading edge is the thinner side), by share of the length from the root.
const FLIP = 0.42 * L
const SHOULDER: Pt = [27, 24]
const FLIP_W = flat([[0, 7], [0.12, 8], [0.3, 7.8], [0.55, 6.6], [0.78, 4.9], [0.9, 3.2], [0.97, 1.6], [1, 0.5]])
// Rear: small rounded paddles at the back of the carapace, a fifth of the body long.
const REAR = 0.17 * L
const REAR_ROOT: Pt = [78, 13]
const REAR_W = flat([[0, 5], [0.25, 6], [0.6, 5], [0.85, 3], [1, 0.8]])
const TAIL = flat([[84, 2.6], [89, 2.2], [92.5, 0.9], [92.5, -0.9], [89, -2.2], [84, -2.6]])

// THE STROKE, for each front flipper, by phase of the stroke: (phase, value, slope per phase). The sweep is in radians
// from straight out to the side, forward positive; the lift is how far it is raised above (positive) or sunk below the
// plane of the shell. Down and back with power (0 to 0.38, as the sea speeds the turtle up), held swept back along the
// flank to glide (0.38 to 0.62), then up and forward again.
const SWEEP = Float64Array.of(0, 0.66, 0, 0.18, -0.12, -5, 0.38, -0.7, -0.6, 0.5, -0.78, 0, 0.62, -0.75, 0.5, 0.82, -0.2, 4.5)
const LIFT = Float64Array.of(0, 0.9, 0, 0.18, 0, -5, 0.38, -0.45, 0, 0.62, -0.12, 0.5, 0.82, 0.5, 3.5)
/** The pose held in a glide, which the inside flipper in a turn eases toward. */
const GLIDE = { sweep: -0.75, lift: -0.1 }
/** A smooth loop through the keys: a cubic through each pair, with each key's own slope. */
/** The stroke `keys` at phase $.TX, into $.TY. */
function rideAt(keys: Float64Array): void {
  const phase = $.TX
  const m = keys.length / 3
  const p = phase - Math.floor(phase)
  let i = 0
  while (i + 1 < m && keys[(i + 1) * 3]! <= p) i += 1
  const t0 = keys[i * 3]!
  const v0 = keys[i * 3 + 1]!
  const m0 = keys[i * 3 + 2]!
  const j = (i + 1) % m
  const next = keys[j * 3]!
  const v1 = keys[j * 3 + 1]!
  const m1 = keys[j * 3 + 2]!
  const h = next + (i + 1 >= m ? 1 : 0) - t0
  const x = (p - t0) / h
  const x2 = x * x
  const x3 = x * x * x
  $.TY = (2 * x3 - 3 * x2 + 1) * v0 + (x3 - 2 * x2 + x) * h * m0 + (3 * x2 - 2 * x3) * v1 + (x3 - x2) * h * m1
}

// ---- What a drawing works in: the frame, and room for the outlines it builds. ----
const F = frame()
/** A place `b` back and `y` out, as the canvas's own x and y. */
const px = (b: number, y: number): number => X(F, -b, y)
const py = (b: number, y: number): number => Y(F, -b, y)
// The head's swing about the neck: how far it is stretched and turned (cosine and sine of the yaw).
const swb = (b: number, y: number): number => NECK - ((NECK - b + $.REACH) * $.YC - y * $.YS)
const swy = (b: number, y: number): number => (NECK - b + $.REACH) * $.YS + y * $.YC

const REAR_PTS = new Float64Array(18 * 2)
const HEAD_PTS = new Float64Array(22 * 2)
/** A front flipper's outline: the leading edge out (15 points), the trailing edge back (15 points). */
const FLIP_PTS = new Float64Array(30 * 2)
const DIR_X = new Float64Array(15)
const DIR_Y = new Float64Array(15)
const SCALE_AT = Int32Array.of(3, 6, 9, 12)
const SCALE_TO = Float64Array.of(0.7, 0.8, 0.75, 0.7)

/** From the first point, line to the rest (`m` points as (back, side) pairs). */
function line(ctx: Pen, pts: Float64Array, m: number): void {
  for (let i = 0; i < m; i += 1) {
    const b = pts[i * 2]!
    const y = pts[i * 2 + 1]!
    if (i === 0) ctx.moveTo(px(b, y), py(b, y))
    else ctx.lineTo(px(b, y), py(b, y))
  }
}
/** A smooth closed curve whose corners are the `m` points. */
function blob(ctx: Pen, pts: Float64Array, m: number): void {
  ctx.beginPath()
  const lb = (pts[(m - 1) * 2]! + pts[0]!) / 2
  const ly = (pts[(m - 1) * 2 + 1]! + pts[1]!) / 2
  ctx.moveTo(px(lb, ly), py(lb, ly))
  for (let i = 0; i < m; i += 1) {
    const j = (i + 1) % m
    const mb = (pts[i * 2]! + pts[j * 2]!) / 2
    const my = (pts[i * 2 + 1]! + pts[j * 2 + 1]!) / 2
    ctx.quadraticCurveTo(px(pts[i * 2]!, pts[i * 2 + 1]!), py(pts[i * 2]!, pts[i * 2 + 1]!), px(mb, my), py(mb, my))
  }
  ctx.closePath()
}
function trace(ctx: Pen, pts: Float64Array, m: number): void {
  ctx.beginPath()
  line(ctx, pts, m)
  ctx.closePath()
}
/** Fills the path as scaly skin: dark scales, pale edges. */
function skin(ctx: Pen): void {
  ctx.fillStyle = SKIN.scale
  ctx.fill()
  ctx.lineWidth = 0.9
  ctx.lineJoin = 'round'
  ctx.strokeStyle = SKIN.edge
  ctx.stroke()
}

/** A green sea turtle, seen from above. */
export function drawTurtle(ctx: Pen, a: Beast, tile: number): void {
  // In the mosaic a tile is ten units: streaks, ticks and scale lines would only make its colours flicker.
  const fine = tile === 0
  poseOf(a, F)
  const phase = strokes(a) % 1
  // How hard it is turning, -1 to 1 for the tightest circle it makes; positive toward the clockwise side.
  const turn = clamp(a.curve * L * turtle.turn, -1.3, 1.3)

  // The tail, a short stub between the rear flippers.
  blob(ctx, TAIL, 6)
  skin(ctx)

  // The rear flippers hardly beat; they steer. Turning, the one on the inside of the turn swings out and the other in,
  // both trailing edges to the same side, as a rudder.
  for (let sd = 0; sd < 2; sd += 1) {
    const side = sd === 0 ? 1 : -1
    const angle = clamp(0.42 + side * 0.45 * turn + 0.05 * Math.sin(2 * Math.PI * (phase + 0.1)), 0.1, 1)
    const sin = Math.sin(angle)
    const cos = Math.cos(angle)
    for (let i = 0; i <= 8; i += 1) {
      const s = i / 8
      const h = (($.TX = s), tableAt(REAR_W), $.TY)
      const b = REAR_ROOT[0] + cos * REAR * s
      const y = side * (REAR_ROOT[1] + sin * REAR * s)
      REAR_PTS[i * 2] = b - side * sin * h
      REAR_PTS[i * 2 + 1] = y + cos * h
      // The other edge is listed from the tip back.
      REAR_PTS[(17 - i) * 2] = b + side * sin * h
      REAR_PTS[(17 - i) * 2 + 1] = y - cos * h
    }
    blob(ctx, REAR_PTS, 18)
    skin(ctx)
  }

  // The head and neck, swinging into a turn; the neck stretches the head forward as the power stroke pulls.
  $.REACH = 1.2 * Math.sin(2 * Math.PI * (phase + 0.05))
  const yaw = 0.2 * turn
  $.YC = Math.cos(yaw)
  $.YS = Math.sin(yaw)
  // Down one side of the head (12 points), and back up the other without its tip and its neck end.
  for (let i = 0; i < 12; i += 1) {
    HEAD_PTS[i * 2] = swb(HEAD[i * 2]!, HEAD[i * 2 + 1]!)
    HEAD_PTS[i * 2 + 1] = swy(HEAD[i * 2]!, HEAD[i * 2 + 1]!)
  }
  for (let i = 10; i >= 1; i -= 1) {
    HEAD_PTS[(22 - i) * 2] = swb(HEAD[i * 2]!, -HEAD[i * 2 + 1]!)
    HEAD_PTS[(22 - i) * 2 + 1] = swy(HEAD[i * 2]!, -HEAD[i * 2 + 1]!)
  }
  blob(ctx, HEAD_PTS, 22)
  skin(ctx)
  // The large scales of the crown, and an eye at each side.
  if (fine) {
    ctx.strokeStyle = SKIN.seam
    ctx.lineWidth = 0.8
    ctx.beginPath()
    for (let i = 0; i < 5; i += 1) {
      const b0 = CROWN[i * 4]!
      const y0 = CROWN[i * 4 + 1]!
      const b1 = CROWN[i * 4 + 2]!
      const y1 = CROWN[i * 4 + 3]!
      ctx.moveTo(px(swb(b0, y0), swy(b0, y0)), py(swb(b0, y0), swy(b0, y0)))
      ctx.lineTo(px(swb(b1, y1), swy(b1, y1)), py(swb(b1, y1), swy(b1, y1)))
    }
    ctx.stroke()
  }
  ctx.fillStyle = EYE
  for (let sd = 0; sd < 2; sd += 1) {
    const side = sd === 0 ? 1 : -1
    ctx.beginPath()
    ctx.arc(px(swb(6.4, side * 5), swy(6.4, side * 5)), py(swb(6.4, side * 5), swy(6.4, side * 5)), 1.15, 0, TAU)
    ctx.fill()
  }

  // The front flippers, the wings it flies with. They beat together; in a turn the one on the inside is held back.
  const rate = ((($.TX = phase + 0.01), rideAt(SWEEP), $.TY) - (($.TX = phase - 0.01), rideAt(SWEEP), $.TY)) / 0.02
  for (let sd = 0; sd < 2; sd += 1) {
    const side = sd === 0 ? 1 : -1
    const hold = side * turn > 0 ? clamp(0.4 * Math.abs(turn), 0, 0.5) : 0
    const sweep = (($.TX = phase), rideAt(SWEEP), $.TY) * (1 - hold) + GLIDE.sweep * hold
    const lift = (($.TX = phase), rideAt(LIFT), $.TY) * (1 - hold) + GLIDE.lift * hold
    // The tip lags behind the root through the sweep, so the blade bends against the water.
    const bend = -0.06 * rate * (1 - hold)
    // Seen from above, a raised or sunk flipper is shorter, and a little narrower.
    const span = FLIP * Math.cos(lift)
    const chord = 1 - 0.2 * Math.abs(Math.sin(lift))
    const N = 14
    let b = SHOULDER[0]
    let y = side * SHOULDER[1]
    for (let i = 0; i <= N; i += 1) {
      const s = i / N
      // A blade curved back at the tip even at rest.
      const angle = sweep + bend * (Math.pow(s, 1.5) - 0.4) - 0.25 * Math.pow(s, 1.5)
      const nb = -Math.cos(angle)
      const ny = -side * Math.sin(angle)
      const h = (($.TX = s), tableAt(FLIP_W), $.TY) * chord
      // The leading edge runs out from point 0, the trailing edge is listed back from point 29.
      FLIP_PTS[i * 2] = b + nb * h * 0.82
      FLIP_PTS[i * 2 + 1] = y + ny * h * 0.82
      FLIP_PTS[(29 - i) * 2] = b - nb * h * 1.18
      FLIP_PTS[(29 - i) * 2 + 1] = y - ny * h * 1.18
      DIR_X[i] = -Math.sin(angle)
      DIR_Y[i] = side * Math.cos(angle)
      b += (DIR_X[i]! * span) / N
      y += (DIR_Y[i]! * span) / N
    }
    blob(ctx, FLIP_PTS, 30)
    skin(ctx)
    if (!fine) continue
    // Large scales across the blade, and the one claw near the leading edge, pointing forward and out.
    ctx.strokeStyle = SKIN.seam
    ctx.lineWidth = 0.8
    ctx.beginPath()
    for (let j = 0; j < 4; j += 1) {
      const i = SCALE_AT[j]!
      const share = SCALE_TO[j]!
      const lb = FLIP_PTS[i * 2]!
      const ly = FLIP_PTS[i * 2 + 1]!
      const tb = FLIP_PTS[(29 - i) * 2]!
      const ty = FLIP_PTS[(29 - i) * 2 + 1]!
      ctx.moveTo(px(lb, ly), py(lb, ly))
      ctx.lineTo(px(lb + (tb - lb) * share, ly + (ty - ly) * share), py(lb + (tb - lb) * share, ly + (ty - ly) * share))
    }
    ctx.stroke()
    const cb = FLIP_PTS[20]!
    const cy = FLIP_PTS[21]!
    const ob = FLIP_PTS[(29 - 10) * 2]!
    const oy = FLIP_PTS[(29 - 10) * 2 + 1]!
    ctx.strokeStyle = SKIN.claw
    ctx.lineWidth = 1.6
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(px(cb, cy), py(cb, cy))
    ctx.lineTo(
      px(cb + DIR_X[10]! * 2.2 + (cb - ob) * 0.1, cy + DIR_Y[10]! * 2.2 + (cy - oy) * 0.1),
      py(cb + DIR_X[10]! * 2.2 + (cb - ob) * 0.1, cy + DIR_Y[10]! * 2.2 + (cy - oy) * 0.1),
    )
    ctx.stroke()
    ctx.lineCap = 'butt'
  }

  // The carapace, over the roots of the flippers and the neck: each scute lighter at its middle with streaks running
  // out from it, the seams, and the marginals in a band round the rim.
  ctx.save()
  trace(ctx, CONTOUR, CONTOUR_N)
  ctx.clip()
  ctx.fillStyle = SHELL.ring
  ctx.fill()
  for (let i = 0; i < SCUTES.length; i += 1) {
    const s = SCUTES[i]!
    trace(ctx, s.pts, s.n)
    const grad = ctx.createRadialGradient(px(s.cx, s.cy), py(s.cx, s.cy), 0, px(s.cx, s.cy), py(s.cx, s.cy), s.r * 1.1)
    grad.stop(0, CR, CG, CB, 1)
    grad.stop(1, BR, BG, BB, 1)
    ctx.fillStyle = grad
    ctx.fill()
    if (!fine) continue
    ctx.save()
    ctx.clip()
    for (let k = 0; k < 12; k += 1) {
      ctx.beginPath()
      ctx.moveTo(px(s.rays[k * 6]!, s.rays[k * 6 + 1]!), py(s.rays[k * 6]!, s.rays[k * 6 + 1]!))
      ctx.lineTo(px(s.rays[k * 6 + 2]!, s.rays[k * 6 + 3]!), py(s.rays[k * 6 + 2]!, s.rays[k * 6 + 3]!))
      ctx.lineTo(px(s.rays[k * 6 + 4]!, s.rays[k * 6 + 5]!), py(s.rays[k * 6 + 4]!, s.rays[k * 6 + 5]!))
      ctx.closePath()
      ctx.fillStyle = k % 2 === 0 ? STREAK.dark : STREAK.pale
      ctx.fill()
    }
    ctx.restore()
  }
  ctx.lineWidth = 0.9
  ctx.lineJoin = 'round'
  ctx.strokeStyle = SHELL.seam
  ctx.beginPath()
  for (let i = 0; i < SCUTES.length; i += 1) {
    line(ctx, SCUTES[i]!.pts, SCUTES[i]!.n)
    ctx.closePath()
  }
  ctx.stroke()
  // The band of marginals over the ends of the scutes, with a seam along its inner edge.
  trace(ctx, CONTOUR, CONTOUR_N)
  ctx.lineWidth = RING * 2 + 1.2
  ctx.stroke()
  ctx.lineWidth = RING * 2
  ctx.strokeStyle = SHELL.ring
  ctx.stroke()
  if (fine) {
    ctx.lineWidth = 0.9
    ctx.strokeStyle = SHELL.seam
    ctx.beginPath()
    for (let i = 0; i < TICKS_N; i += 1) {
      ctx.moveTo(px(TICKS[i * 4]!, TICKS[i * 4 + 1]!), py(TICKS[i * 4]!, TICKS[i * 4 + 1]!))
      ctx.lineTo(px(TICKS[i * 4 + 2]!, TICKS[i * 4 + 3]!), py(TICKS[i * 4 + 2]!, TICKS[i * 4 + 3]!))
    }
    ctx.stroke()
  }
  ctx.restore()
  trace(ctx, CONTOUR, CONTOUR_N)
  ctx.lineWidth = 1.4
  ctx.strokeStyle = SHELL.seam
  ctx.stroke()
}
