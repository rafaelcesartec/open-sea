// draw/cetacean.ts, allocation-free: the same whales and dolphins, op for op (draw.test.ts). The looks, the smooth
// profiles and the grids along each body are made once, here; a drawing only fills module-level scratch.

import { KD } from '../kinds.ts'
import { H, hypH } from '../hyp.ts'
import { KINDS, type Frame } from '../reference/sim.ts'
import { TAU, X, Y, frame, type Pen, type Shape } from '../pen.ts'
import { spineOf, strokes, type Beast } from '../sea.ts'

type Pt = [number, number]
/** Bezier points of one half of a shape: start, two controls, the apex, two controls, the end. */
type Bez = [Pt, Pt, Pt, Pt, Pt, Pt, Pt]

type Look = {
  /** Half width as a share of the girth, by share of the length: the silhouette from above. It closes at `tail`. */
  width: Pt[]
  tail: number
  skin: string
  /** Flippers and flukes: dark above. `rim` is a paler edge to the flippers. */
  fin: string
  rim?: string
  /** The fine edge round the whole silhouette, so a dark animal still reads on a dark sea, and how thick it is. */
  edge: string
  line: number
  /** A flipper: roots `u` back, its long axis `theta` off the body's axis (swept back), `len` of the body long. Its
   * shape is [along it, across it (leading edge +)] in flipper lengths. */
  flipper: { u: number; theta: number; len: number; shape: Bez }
  /** The flukes root `root` back; the half planform in body lengths: [x aft of the root, y out from the midline]. */
  root: number
  flukes: Bez
  /** How far the tail pitches at the top and bottom of a stroke (radians), and where along the body it begins. */
  pitch: number
  pivot: number
  /** Knobs along the leading edge of the flippers, as a humpback has. */
  bumps?: boolean
  paint: (ctx: Pen) => void
}

/** The sim's distance between spine frames. */
const STEP = 5
const WHITE = '#e6e8e6'

/** A smooth curve through knots (monotone cubic, so it never overshoots between them): its tables. */
type Curve = { n: number; xs: Float64Array; ys: Float64Array; h: Float64Array; m: Float64Array }
function smooth(knots: Pt[]): Curve {
  const n = knots.length
  const xs = new Float64Array(n)
  const ys = new Float64Array(n)
  const h = new Float64Array(n - 1)
  const s = new Float64Array(n - 1)
  const m = new Float64Array(n)
  for (let i = 0; i < n; i += 1) {
    xs[i] = knots[i]![0]
    ys[i] = knots[i]![1]
  }
  for (let i = 0; i < n - 1; i += 1) {
    h[i] = xs[i + 1]! - xs[i]!
    s[i] = (ys[i + 1]! - ys[i]!) / h[i]!
  }
  for (let i = 0; i < n; i += 1) {
    if (i === 0) m[i] = s[0]!
    else if (i === n - 1) m[i] = s[i - 1]!
    else {
      const s0 = s[i - 1]!
      const s1 = s[i]!
      const h0 = h[i - 1]!
      const h1 = h[i]!
      m[i] = s0 * s1 <= 0 ? 0 : (3 * (h0 + h1)) / ((2 * h1 + h0) / s0 + (h1 + 2 * h0) / s1)
    }
  }
  return { n, xs, ys, h, m }
}
/** The curve `c` at $.CX, into $.CY. */
function curve(c: Curve): void {
  const x = $.CX
  const n = c.n
  const xs = c.xs
  const ys = c.ys
  const h = c.h
  const m = c.m
  let i = 0
  while (i < n - 2 && x > xs[i + 1]!) i += 1
  const x0 = xs[i]!
  const y0 = ys[i]!
  const y1 = ys[i + 1]!
  const t = Math.min(1, Math.max(0, (x - x0) / h[i]!))
  const t2 = t * t
  const t3 = t * t * t
  const hi = h[i]!
  const m0 = m[i]!
  const m1 = m[i + 1]!
  $.CY = (2 * t3 - 3 * t2 + 1) * y0 + (t3 - 2 * t2 + t) * hi * m0 + (3 * t2 - 2 * t3) * y1 + (t3 - t2) * hi * m1
}

const mirror = (pts: Pt[]): Pt[] => pts.map(([u, v]) => [u, -v])
const flat = (pts: Pt[]): Float64Array => Float64Array.from(pts.flat())

// ---- This animal's numbers, set at the start of each drawing and read by everything below. ----
// Numbers kept between calls live in this object: a closure's variable would box each new value. Numbers also go into
// and out of the helpers below through it (D in; W, E, CY out): V8 boxes a number passed to or returned from a call
// it does not inline.
const $ = { FCA: 0.5, FSA: 0.5, FFS: 0.5, FFT: 0.5, FC0: 0.5, FC1: 0.5, FPX: 0.5, FPY: 0.5, D: 0.5, W: 0.5, E: 0.5, CX: 0.5, CY: 0.5, D0: 0.5, D1: 0.5, GROW: 0.5, LL: 0, GIRTH: 0, TILE: 0, TL: 0, G: 1, PHASE: 0, PITCH: 0, PIVOT: 0, SQUASH: 0, LN: 0, RM: 0, BU0: 0, BU1: 0, BTHICK: 0, SU0: 0, SU1: 0, SLO: 0, SHI: 0, STAPER: 0, SCAPE: 0, FSPAN: 0, C1: 0, C2: 0, FU: 0, FTH: 0, FLEN: 0, TURN: 0 }
/** Where the body closes, L * look.tail. */
let PROFILE: Curve
let GRID: Float64Array<ArrayBufferLike> = new Float64Array(0)
/** The spine carried on: the sim's frames, then $.LN - n of ours. */

const MOST = 600
const LINE: Frame[] = Array.from({ length: MOST }, frame)
const EXT: Frame[] = Array.from({ length: MOST }, frame)
const R = frame()
const Q = frame()
const P = frame()

/** The spine, carried on past its last frame in the curve it ends in: the tail stock and the flukes lie there. */
function extend(frames: Frame[], n: number, to: number): void {
  for (let i = 0; i < n; i += 1) LINE[i] = frames[i]!
  $.LN = n
  const last = LINE[n - 1]!
  const gap = Math.min(8, n - 1)
  const before = LINE[n - 1 - gap]!
  // How much the heading turns from one frame to the next at the end.
  const turn = Math.atan2(before.fx * last.fy - before.fy * last.fx, before.fx * last.fx + before.fy * last.fy) / gap
  const c = Math.cos(turn)
  const s = Math.sin(turn)
  let p = last
  while ($.LN * STEP < to) {
    const q = EXT[$.LN - n]!
    q.x = p.x - p.fx * STEP
    q.y = p.y - p.fy * STEP
    q.fx = p.fx * c - p.fy * s
    q.fy = p.fx * s + p.fy * c
    q.w = 0
    q.u = 0
    LINE[$.LN] = q
    $.LN += 1
    p = q
  }
}

/** The body's half width $.D units back, into $.W. In the mosaic nothing narrower than a tile lights up: a slender
 * tail stock or beak is kept a tile wide. */
function wideAt(): void {
  const d = $.D
  $.CX = d / $.LL
  curve(PROFILE)
  const floor = $.TILE === 0 ? 0 : $.TILE * 0.5 * Math.max(0, Math.min(1, d / ($.TILE * 1.5), ($.TL - d) / ($.TILE * 1.5)))
  $.W = Math.max($.GIRTH * Math.max(0, $.CY), floor)
}

// The tail stock pitches up and down. Seen from above it is shortest at the top and bottom of the stroke, when it
// is most tilted, so the flukes slide forward then; each fluke's chord shrinks the same way, the tips a little
// behind the root as the flukes flex.
const pitchAt = (lag: number, gain: number): number => $.PITCH * gain * Math.sin(2 * Math.PI * ($.PHASE - lag))
const shift = (d: number): number => (d > $.PIVOT ? ($.SQUASH * (d - $.PIVOT) ** 2) / ($.LL - $.PIVOT) : 0)

/** The body $.D units back from the front tip, as it lies along the bent spine, written into `o`. */
function pose(o: Frame): Frame {
  const d = $.D
  const s = Math.max(0, d - shift(d)) / STEP
  const i = Math.min($.LN - 2, Math.floor(s))
  const t = s - i
  const f = LINE[i]!
  const g = LINE[i + 1]!
  const fx = f.fx + (g.fx - f.fx) * t
  const fy = f.fy + (g.fy - f.fy) * t
  const n = (H[0] = fx, H[1] = fy, hypH(), H[2]!) || 1
  o.x = f.x + (g.x - f.x) * t
  o.y = f.y + (g.y - f.y) * t
  o.fx = fx / n
  o.fy = fy / n
  wideAt()
  o.w = $.W
  o.u = d / $.LL
  return o
}

// ---- Ribbons: a band along the body, by how far out each of its two edges lies at a distance `d` back. ----

// A bottlenose dolphin's cape: dark over the beak and melon, back and tail stock, a little paler between.
const CAPE = smooth([
  [0, 1], [0.05, 0.95], [0.075, 0.62], [0.12, 0.5], [0.3, 0.58], [0.5, 0.62], [0.7, 0.7], [0.85, 0.9], [0.95, 1.05],
])

/** How far out the ribbon's edge (`hi` or the other) lies $.D units back, into $.E. */
function edgeOf(hi: boolean): void {
  const d = $.D
  if ($.RM === 0) {
    wideAt()
    $.E = hi ? $.W : -$.W
    return
  }
  if ($.RM === 1) {
    const h = ($.BTHICK / 2) * Math.sin(Math.PI * Math.pow((d - $.LL * $.BU0) / ($.LL * ($.BU1 - $.BU0)), 0.7))
    $.E = hi ? h : -h
    return
  }
  const u = d / $.LL
  let share = hi ? $.SHI : $.SLO
  if ($.SCAPE !== 0) {
    $.CX = u
    curve(CAPE)
    share = hi ? $.CY * $.SCAPE : -$.CY * $.SCAPE
  }
  wideAt()
  // The ends of a strip close like a circle's: sqrt(1 - (1 - t)^2).
  const t = $.STAPER === 0 ? 1 : Math.min(1, Math.max(0, Math.min(u - $.SU0, $.SU1 - u) / $.STAPER))
  $.E = share * $.W * Math.sqrt(1 - (1 - t) ** 2)
}

/** From $.D0 back to $.D1: out along one edge, over the grid's points between, and home along the other. */
function ribbon(path: Shape): void {
  const d0 = $.D0
  const d1 = $.D1
  const n = GRID.length
  let e = (($.D = d0), edgeOf(true), $.E)
  void (($.D = d0), pose(R))
  path.moveTo(X(R, 0, e), Y(R, 0, e))
  for (let i = 0; i < n; i += 1) {
    const d = GRID[i]!
    if (!(d > d0 && d < d1)) continue
    e = (($.D = d), edgeOf(true), $.E)
    void (($.D = d), pose(R))
    path.lineTo(X(R, 0, e), Y(R, 0, e))
  }
  e = (($.D = d1), edgeOf(true), $.E)
  void (($.D = d1), pose(R))
  path.lineTo(X(R, 0, e), Y(R, 0, e))
  e = (($.D = d1), edgeOf(false), $.E)
  path.lineTo(X(R, 0, e), Y(R, 0, e))
  for (let i = n - 1; i >= 0; i -= 1) {
    const d = GRID[i]!
    if (!(d > d0 && d < d1)) continue
    e = (($.D = d), edgeOf(false), $.E)
    void (($.D = d), pose(R))
    path.lineTo(X(R, 0, e), Y(R, 0, e))
  }
  e = (($.D = d0), edgeOf(false), $.E)
  void (($.D = d0), pose(R))
  path.lineTo(X(R, 0, e), Y(R, 0, e))
  path.closePath()
}

/** The band of the body between `lo` and `hi` shares of its half width, from `u0` to `u1` of the length; it closes
 * to a rounded end over `taper` of the length at each end. With `cape` not 0 the shares are those of the cape. */
function strip(ctx: Pen): Shape {
  $.RM = 2
  const path = ctx.shape()
  $.D0 = $.LL * $.SU0
  $.D1 = $.LL * $.SU1
  ribbon(path)
  return path
}
/** A thin fin seen edge on along the midline, `thick` wide at the thickest. */
function blade(ctx: Pen): Shape {
  $.RM = 1
  const path = ctx.shape()
  $.D0 = $.LL * $.BU0
  $.D1 = $.LL * $.BU1
  ribbon(path)
  return path
}

const PTX = new Float64Array(32)
const PTY = new Float64Array(32)
/** A soft-cornered patch through points (share of the length, share of the half width there), `grow` times as big. */
function patch(ctx: Pen, pts: Float64Array): Shape {
  const grow = $.GROW
  const m = pts.length >> 1
  let cu = 0
  for (let i = 0; i < m; i += 1) cu += pts[i * 2]!
  cu /= m
  for (let i = 0; i < m; i += 1) {
    void (($.D = (cu + (pts[i * 2]! - cu) * grow) * $.LL), pose(Q))
    PTX[i] = X(Q, 0, pts[i * 2 + 1]! * grow * Q.w)
    PTY[i] = Y(Q, 0, pts[i * 2 + 1]! * grow * Q.w)
  }
  const path = ctx.shape()
  path.moveTo((PTX[m - 1]! + PTX[0]!) / 2, (PTY[m - 1]! + PTY[0]!) / 2)
  for (let i = 0; i < m; i += 1) {
    const j = (i + 1) % m
    path.quadraticCurveTo(PTX[i]!, PTY[i]!, (PTX[i]! + PTX[j]!) / 2, (PTY[i]! + PTY[j]!) / 2)
  }
  path.closePath()
  return path
}

/** An ellipse as its own subpath: centre (BL[0], BL[1]), radii BL[2] and BL[3], BL[4] off the x axis. */
const BL = new Float64Array(5)
function blob(ctx: Shape): void {
  const x = BL[0]!
  const y = BL[1]!
  const rx = BL[2]!
  const ry = BL[3]!
  const rot = BL[4]!
  ctx.moveTo(x + rx * Math.cos(rot), y + rx * Math.sin(rot))
  ctx.ellipse(x, y, rx, ry, rot, 0, TAU)
}

// ---- The flukes and the flippers of the animal being drawn. ----
const ROOT = frame()
let FL: Float64Array<ArrayBufferLike> = new Float64Array(14)
const chord = (r: number): number => $.C1 * (1 - r) + $.C2 * r
/** A point on the flukes: x aft of their root, y out, in body lengths. */
const flukeX = (x: number, y: number): number => X(ROOT, -x * $.LL * chord(Math.abs(y) / $.FSPAN), y * $.LL)
const flukeY = (x: number, y: number): number => Y(ROOT, -x * $.LL * chord(Math.abs(y) / $.FSPAN), y * $.LL)
/** Point `i` of the half planform, its y times `s` (1 for one half, -1 for the other). */
const fpx = (i: number, s: number): number => flukeX(FL[i * 2]!, FL[i * 2 + 1]! * s)
const fpy = (i: number, s: number): number => flukeY(FL[i * 2]!, FL[i * 2 + 1]! * s)

let FS: Float64Array<ArrayBufferLike> = new Float64Array(14)
const FP = frame()
const FB = frame()
const FX = new Float64Array(7)
const FY = new Float64Array(7)
const TA = frame()
const TB = frame()

/** How far the heading turns from `back` to `front`: positive toward the body's left (`out` > 0). */
const bend = (back: Frame, front: Frame): number =>
  Math.atan2(back.fx * front.fy - back.fy * front.fx, back.fx * front.fx + back.fy * front.fy)

/** A flipper swept back from the side `s`, its shape scaled by (c0, c1); through a turn the inner one is held out. */
/** A flipper's frame on side `s`: its root on the side of the body (FB), its axis swung back by theta ($.FCA, $.FSA). */
function flipBase(s: number): void {
  const p = (($.D = $.LL * $.FU), pose(FP))
  const th = $.FTH + s * Math.max(-0.3, Math.min(0.3, $.TURN * 0.3))
  $.FCA = Math.cos(th)
  $.FSA = Math.sin(th)
  FB.x = X(p, 0, s * p.w * 0.97)
  FB.y = Y(p, 0, s * p.w * 0.97)
  FB.fx = p.fx
  FB.fy = p.fy
  FB.w = p.w
  FB.u = p.u
}

/** The point ($.FFS along, $.FFT across) of the flipper on side `s`, in flipper lengths, scaled by ($.FC0, $.FC1): into
 * $.FPX, $.FPY. The frame is worked out again each time, as the original does. */
function flipPoint(s: number): void {
  flipBase(s)
  const s0 = $.FFS * $.FC0 * $.FLEN * $.LL
  const t0 = $.FFT * $.FC1 * $.FLEN * $.LL
  $.FPX = X(FB, -$.FCA * s0 + $.FSA * t0, s * ($.FSA * s0 + $.FCA * t0))
  $.FPY = Y(FB, -$.FCA * s0 + $.FSA * t0, s * ($.FSA * s0 + $.FCA * t0))
}

/** A flipper swept back from the side `s`, its shape scaled by (c0, c1); through a turn the inner one is held out. */
function flipper(path: Shape, s: number, c0: number, c1: number): void {
  $.FC0 = c0
  $.FC1 = c1
  for (let i = 0; i < 7; i += 1) {
    $.FFS = FS[i * 2]!
    $.FFT = FS[i * 2 + 1]!
    flipPoint(s)
    FX[i] = $.FPX
    FY[i] = $.FPY
  }
  path.moveTo(FX[0]!, FY[0]!)
  path.bezierCurveTo(FX[1]!, FY[1]!, FX[2]!, FY[2]!, FX[3]!, FY[3]!)
  path.bezierCurveTo(FX[4]!, FY[4]!, FX[5]!, FY[5]!, FX[6]!, FY[6]!)
  path.closePath()
}

/** A humpback's knobs along a flipper's leading edge, the first curve of its outline, a little inside it: [along it,
 * across it] for each, worked out once from the flipper's shape. */
function bumpsOf(shape: Bez): Float64Array {
  const [p0, c1, c2, p1] = shape
  return Float64Array.from([0.12, 0.26, 0.4, 0.54, 0.68, 0.82].flatMap(t => {
    const u = 1 - t
    const at2 = (i: 0 | 1): number => u * u * u * p0[i]! + 3 * u * u * t * c1[i]! + 3 * u * t * t * c2[i]! + t * t * t * p1[i]!
    return [at2(0), at2(1) - 0.03]
  }))
}

// A blue whale's mottling: pale and dark blotches on the grey-blue skin, big soft ones, middling flecks stretched
// along the body, and fine pale specks. Kept in body coordinates (a place along the body and a share of its half
// width) so they bend with it and never flicker: the same seed every time.
const TIERS = [
  { n: 36, r: [60, 130], long: [1.2, 2], alpha: 0.11, dark: 0.5 },
  { n: 200, r: [14, 34], long: [1.3, 2.4], alpha: 0.2, dark: 0.45 },
  { n: 280, r: [4, 9], long: [1.1, 2.2], alpha: 0.24, dark: 0.2 },
] as const
const MOTTLE = (() => {
  let seed = 11
  const rand = (): number => (seed = (seed * 16807) % 2147483647) / 2147483647
  return TIERS.map(t =>
    Array.from({ length: t.n }, () => ({
      u: 0.02 + rand() * 0.93,
      v: (rand() * 2 - 1) * 1.05,
      r: t.r[0] + rand() * (t.r[1] - t.r[0]),
      long: t.long[0] + rand() * (t.long[1] - t.long[0]),
      dark: rand() < t.dark,
    })),
  )
})()
const FLUKE_MOTTLE = Array.from({ length: 30 }, (_, i) => ({
  x: 0.002 + ((i * 7) % 11) * 0.0055,
  y: (((i * 13) % 17) / 8 - 1) * 0.12,
  r: i % 3 === 0 ? 20 : 8,
  dark: i % 4 === 0,
}))
const SPOTS = Math.max(...TIERS.map(t => t.n))
const SX = new Float64Array(SPOTS)
const SY = new Float64Array(SPOTS)
const SRX = new Float64Array(SPOTS)
const SRY = new Float64Array(SPOTS)
const SROT = new Float64Array(SPOTS)
const LAYERS = Float64Array.of(1, 0.66, 0.33)

function paintBlue(ctx: Pen): void {
  const L = $.LL
  // The back a shade paler than the flanks.
  ctx.fillStyle = '#5a7385'
  ctx.fill((($.SU0 = 0.03), ($.SU1 = 0.9), ($.SLO = -0.6), ($.SHI = 0.6), ($.STAPER = 0.06), ($.SCAPE = 0), strip(ctx)))
  ctx.save()
  ctx.clip(BODY)
  // The body rounds away at the sides: a little darker toward the edge.
  ctx.lineWidth = 70
  ctx.strokeStyle = 'rgba(30,46,60,.2)'
  ctx.stroke(BODY)
  for (let i = 0; i < 3; i += 1) {
    const tier = TIERS[i]!
    const mot = MOTTLE[i]!
    for (let j = 0; j < tier.n; j += 1) {
      const m = mot[j]!
      const p = (($.D = m.u * L), pose(P))
      SX[j] = X(p, 0, m.v * p.w)
      SY[j] = Y(p, 0, m.v * p.w)
      SRX[j] = m.r * m.long
      SRY[j] = m.r
      SROT[j] = Math.atan2(p.fy, p.fx)
    }
    // The soft ones are built up in three growing layers, so their edges fade; the fine specks are single.
    const layers = i < 2 ? 3 : 1
    for (let di = 0; di < 2; di += 1) {
      const dark = di === 1
      const a = tier.alpha / layers
      ctx.fillStyle = dark ? '#3e5464' : '#8096a5'
      ctx.globalAlpha = $.G * (dark ? a * 1.3 : a)
      for (let li = 0; li < layers; li += 1) {
        const grow = LAYERS[li]!
        ctx.beginPath()
        for (let j = 0; j < tier.n; j += 1) if (mot[j]!.dark === dark) ((BL[0] = SX[j]!), (BL[1] = SY[j]!), (BL[2] = SRX[j]! * grow), (BL[3] = SRY[j]! * grow), (BL[4] = SROT[j]!), blob(ctx))
        ctx.fill()
      }
      ctx.globalAlpha = $.G
    }
  }
  ctx.restore()
  ctx.save()
  ctx.clip(FLUKES)
  for (let di = 0; di < 2; di += 1) {
    const dark = di === 1
    ctx.beginPath()
    for (let j = 0; j < 30; j += 1) {
      const m = FLUKE_MOTTLE[j]!
      if (m.dark !== dark) continue
      void ((BL[0] = flukeX(m.x, m.y)), (BL[1] = flukeY(m.x, m.y)), (BL[2] = m.r * 1.6), (BL[3] = m.r), (BL[4] = 0), blob(ctx))
    }
    ctx.fillStyle = dark ? 'rgba(62,84,100,.22)' : 'rgba(128,150,165,.22)'
    ctx.fill()
  }
  ctx.restore()

  // The head's median ridge and the tail stock's dorsal keel, as faint lines.
  ctx.lineCap = 'round'
  ctx.lineWidth = 3
  ctx.strokeStyle = 'rgba(170,195,210,.13)'
  ctx.beginPath()
  for (let u = 0.012; u <= 0.15; u += 0.01) {
    const q = (($.D = u * L), pose(P))
    ctx.lineTo(X(q, 0, 0), Y(q, 0, 0))
  }
  ctx.stroke()
  ctx.strokeStyle = 'rgba(44,62,76,.3)'
  ctx.beginPath()
  for (let u = 0.8; u <= 0.935; u += 0.01) {
    const q = (($.D = u * L), pose(P))
    ctx.lineTo(X(q, 0, 0), Y(q, 0, 0))
  }
  ctx.stroke()

  // Two blowholes close together on the crown, a low arched splashguard ridge just ahead of them.
  const p = (($.D = L * 0.17), pose(P))
  ctx.strokeStyle = 'rgba(150,176,192,.45)'
  ctx.lineWidth = 3.2
  ctx.beginPath()
  for (let t = -1; t <= 1.01; t += 0.25) ctx.lineTo(X(p, 30 - 18 * t * t, 26 * t), Y(p, 30 - 18 * t * t, 26 * t))
  ctx.stroke()
  ctx.strokeStyle = '#2b3a45'
  ctx.lineWidth = 2.6
  for (let s = 0; s < 2; s += 1) {
    const side = s === 0 ? -1 : 1
    ctx.beginPath()
    ctx.moveTo(X(p, 10, side * 5), Y(p, 10, side * 5))
    ctx.lineTo(X(p, -14, side * 11), Y(p, -14, side * 11))
    ctx.stroke()
  }

  // The dorsal fin, a small dark nub far back.
  ctx.fillStyle = '#41586a'
  ctx.fill((($.BU0 = 0.738), ($.BU1 = 0.768), ($.BTHICK = 10), blade(ctx)))
}

// An orca is black with a lifted sheen, so the dark dorsal blade, the grey saddle and the white patches all read.
// The grey saddle behind the fin, swept back toward the flanks (half of it, midline to midline); the white of the
// belly rising up each flank, seen from above at the edges.
const HALF_SADDLE: Pt[] = [
  [0.505, 0], [0.52, 0.32], [0.55, 0.6], [0.6, 0.8], [0.655, 0.84], [0.7, 0.76], [0.73, 0.5], [0.765, 0.2], [0.78, 0],
]
const SADDLE = flat([...HALF_SADDLE, ...mirror(HALF_SADDLE.slice(1, -1)).reverse()])
const FLANK_PTS: Pt[] = [[0.6, 1.1], [0.62, 0.9], [0.66, 0.72], [0.71, 0.62], [0.76, 0.62], [0.8, 0.78], [0.83, 1.1]]
const FLANK = flat(FLANK_PTS)
const FLANK_M = flat(mirror(FLANK_PTS))

function paintOrca(ctx: Pen): void {
  const L = $.LL
  ctx.fillStyle = '#2b2e33'
  ctx.fill((($.SU0 = 0.03), ($.SU1 = 0.9), ($.SLO = -0.45), ($.SHI = 0.45), ($.STAPER = 0.1), ($.SCAPE = 0), strip(ctx)))
  ctx.save()
  ctx.clip(BODY)
  ctx.fillStyle = WHITE
  ctx.fill((($.GROW = 1), patch(ctx, FLANK)))
  ctx.fill((($.GROW = 1), patch(ctx, FLANK_M)))
  // The saddle, its edge soft: a darker grey rim, then the pale grey.
  ctx.fillStyle = '#5f6469'
  ctx.fill((($.GROW = 1), patch(ctx, SADDLE)))
  ctx.fillStyle = '#8a8f94'
  ctx.fill((($.GROW = 0.82), patch(ctx, SADDLE)))
  // The eye patches: white ovals behind each eye, wrapping up the sides of the head, tilted back toward the midline.
  const p = (($.D = L * 0.15), pose(P))
  ctx.beginPath()
  for (let s = 0; s < 2; s += 1) {
    const side = s === 0 ? -1 : 1
    void ((BL[0] = X(p, 0, side * p.w * 0.9)), (BL[1] = Y(p, 0, side * p.w * 0.9)), (BL[2] = 21), (BL[3] = 8), (BL[4] = Math.atan2(p.fy, p.fx) + side * 0.3), blob(ctx))
  }
  ctx.fillStyle = WHITE
  ctx.fill()
  ctx.restore()
  // The dorsal fin edge on: a long thin dark blade down the midline.
  ctx.fillStyle = '#141517'
  ctx.strokeStyle = '#3a3f45'
  ctx.lineWidth = 1.4
  const fin = (($.BU0 = 0.37), ($.BU1 = 0.515), ($.BTHICK = 12), blade(ctx))
  ctx.stroke(fin)
  ctx.fill(fin)
}

function paintHumpback(ctx: Pen): void {
  // Dark above, a shade paler toward the flanks; the broad flippers are the same dark as the back.
  ctx.fillStyle = '#56626a'
  ctx.fill((($.SU0 = 0.02), ($.SU1 = 0.97), ($.SLO = -0.9), ($.SHI = 0.9), ($.STAPER = 0.08), ($.SCAPE = 0), strip(ctx)))
  ctx.fillStyle = '#44505a'
  ctx.fill((($.SU0 = 0.02), ($.SU1 = 0.97), ($.SLO = -0.55), ($.SHI = 0.55), ($.STAPER = 0.08), ($.SCAPE = 0), strip(ctx)))
}

function paintDolphin(ctx: Pen): void {
  // From the pale edge of the flank, darkening step by step into the cape.
  ctx.fillStyle = '#858d94'
  ctx.fill((($.SU0 = 0.01), ($.SU1 = 0.98), ($.SLO = -0.93), ($.SHI = 0.93), ($.STAPER = 0), ($.SCAPE = 0), strip(ctx)))
  ctx.fillStyle = '#7d858c'
  ctx.fill((($.SU0 = 0.01), ($.SU1 = 0.98), ($.SLO = -0.8), ($.SHI = 0.8), ($.STAPER = 0), ($.SCAPE = 0), strip(ctx)))
  ctx.fillStyle = '#656d74'
  ctx.fill((($.SU0 = 0), ($.SU1 = 0.99), ($.SLO = 0), ($.SHI = 0), ($.STAPER = 0), ($.SCAPE = 1.14), strip(ctx)))
  ctx.fillStyle = '#4f565d'
  ctx.fill((($.SU0 = 0), ($.SU1 = 0.99), ($.SLO = 0), ($.SHI = 0), ($.STAPER = 0), ($.SCAPE = 1), strip(ctx)))
  // The falcate dorsal fin seen from above: a thin dark ridge.
  ctx.fillStyle = '#3b4248'
  ctx.fill((($.BU0 = 0.44), ($.BU1 = 0.555), ($.BTHICK = 3.6), blade(ctx)))
}

const LOOKS: Record<string, Look> = {
  // Blue whale, as seen from above in aerial photographs: a sleek body, the head tapering to a pointed snout, widest
  // about halfway, a long slender tail stock, flippers swept back, wide triangular flukes with a shallow notch.
  blue: {
    width: [
      [0, 0.2], [0.02, 0.45], [0.05, 0.62], [0.1, 0.78], [0.18, 0.9], [0.3, 0.99], [0.42, 1], [0.55, 0.97],
      [0.66, 0.88], [0.76, 0.7], [0.84, 0.5], [0.9, 0.3], [0.94, 0.14], [0.96, 0],
    ],
    tail: 0.96,
    skin: '#566f80',
    fin: '#566f80',
    rim: '#8aa1af',
    edge: '#3f5568',
    line: 3,
    flipper: {
      u: 0.235, theta: 0.6, len: 0.14,
      // A sickle: narrow, the leading edge nearly straight and the trailing edge curving back to a fine point.
      shape: [[-0.05, 0.06], [0.4, 0.18], [0.9, 0.08], [1.02, 0], [0.9, -0.07], [0.4, -0.14], [-0.05, -0.06]],
    },
    root: 0.925,
    // Broad and triangular, the leading edge swept back, the tips rounded off, a shallow notch in the trailing edge.
    flukes: [[0.04, 0], [0.05, 0.022], [0.065, 0.118], [0.056, 0.126], [0.047, 0.132], [-0.012, 0.06], [-0.04, 0.015]],
    pitch: 0.4,
    pivot: 0.68,
    paint: paintBlue,
  },
  // Orca: a robust torpedo, a blunt head with no beak, big paddle flippers, broad flukes with a deep notch.
  orca: {
    width: [
      [0, 0], [0.002, 0.18], [0.007, 0.33], [0.015, 0.46], [0.03, 0.6], [0.055, 0.74], [0.09, 0.86], [0.14, 0.95],
      [0.2, 0.99], [0.27, 1], [0.34, 1], [0.42, 0.97], [0.5, 0.9], [0.58, 0.78], [0.66, 0.62], [0.74, 0.48],
      [0.82, 0.36], [0.88, 0.29],
      [0.915, 0.25], [0.94, 0.2], [0.955, 0.08], [0.96, 0],
    ],
    tail: 0.96,
    skin: '#222428',
    fin: '#202225',
    edge: '#3c4147',
    line: 2.4,
    flipper: {
      u: 0.18, theta: 1, len: 0.16,
      shape: [[-0.05, 0.3], [0.3, 0.4], [0.98, 0.32], [1.04, 0], [0.98, -0.32], [0.45, -0.4], [-0.05, -0.3]],
    },
    root: 0.915,
    flukes: [[0.04, 0], [0.052, 0.03], [0.075, 0.09], [0.082, 0.135], [0.048, 0.125], [-0.015, 0.08], [-0.035, 0.024]],
    pitch: 0.5,
    pivot: 0.62,
    paint: paintOrca,
  },
  // Bottlenose dolphin: a short beak ahead of a rounded melon, small sickle flippers, small flukes.
  dolphin: {
    width: [
      [0, 0], [0.004, 0.06], [0.015, 0.095], [0.035, 0.125], [0.055, 0.15], [0.07, 0.2], [0.085, 0.36], [0.1, 0.52],
      [0.13, 0.72], [0.17, 0.87], [0.22, 0.96], [0.3, 1], [0.38, 0.99], [0.47, 0.92], [0.56, 0.81], [0.65, 0.65],
      [0.74, 0.46], [0.82, 0.31],
      [0.88, 0.22], [0.915, 0.17], [0.935, 0.12], [0.95, 0.04], [0.955, 0],
    ],
    tail: 0.955,
    skin: '#8d959b',
    fin: '#454c52',
    edge: '#586067',
    line: 1.5,
    flipper: {
      u: 0.22, theta: 0.9, len: 0.12,
      shape: [[-0.05, 0.15], [0.3, 0.17], [0.7, 0.09], [1, -0.12], [0.75, -0.04], [0.35, -0.16], [-0.05, -0.13]],
    },
    root: 0.92,
    flukes: [[0.036, 0], [0.044, 0.03], [0.062, 0.08], [0.07, 0.11], [0.04, 0.105], [-0.01, 0.065], [-0.03, 0.017]],
    pitch: 0.55,
    pivot: 0.6,
    paint: paintDolphin,
  },
  // Humpback whale: a stout body, the head broad and blunt, the widest just behind it; very broad paddle-shaped
  // flippers, dark, rounded at the tip; wide flukes with a ragged trailing edge.
  humpback: {
    width: [
      [0, 0.08], [0.012, 0.42], [0.035, 0.65], [0.08, 0.84], [0.14, 0.93], [0.2, 1], [0.35, 0.98], [0.5, 0.9], [0.62, 0.74],
      [0.72, 0.56], [0.8, 0.4], [0.86, 0.28], [0.91, 0.18], [0.95, 0.08], [0.975, 0],
    ],
    tail: 0.975,
    skin: '#3e4a52',
    fin: '#2b3138',
    edge: '#2a3238',
    line: 2,
    flipper: {
      u: 0.2, theta: 0.45, len: 0.2,
      shape: [[-0.05, 0.05], [0.45, 0.36], [0.95, 0.14], [1, 0], [0.95, -0.12], [0.45, -0.26], [-0.05, -0.05]],
    },
    root: 0.94,
    flukes: [[0.04, 0], [0.06, 0.03], [0.085, 0.14], [0.07, 0.16], [0.055, 0.165], [-0.01, 0.07], [-0.04, 0.015]],
    pitch: 0.45,
    pivot: 0.66,
    bumps: true,
    paint: paintHumpback,
  },
}

/** What a kind needs that does not change between its drawings. */
type Prep = { look: Look; L: number; profile: Curve; grid: Float64Array; flukes: Float64Array; flipper: Float64Array; bumps: Float64Array }

const PREP: (Prep | undefined)[] = KINDS.map((k): Prep | undefined => {
  const look = LOOKS[k.name]
  if (look === undefined || k.plan !== 'cetacean') return undefined
  const L = k.length
  // Where to put points: close together at the rounded nose, then evenly along the rest.
  const nose = L * 0.03
  const grid: number[] = []
  for (let i = 0; i < 12; i += 1) grid.push(nose * (i / 12) ** 2)
  for (let d = nose; d < L; d += Math.min(STEP, L / 100)) grid.push(d)
  return { look, L, profile: smooth(look.width), grid: Float64Array.from(grid), flukes: flat(look.flukes), flipper: flat(look.flipper.shape), bumps: look.bumps === true ? bumpsOf(look.flipper.shape) : new Float64Array(0) }
})
for (const p of PREP) if (p !== undefined && Math.ceil((p.L + 2 * STEP) / STEP) + 8 > MOST) throw new Error('cetacean: spine scratch too small')

// The body and the flukes of the animal being drawn: the paints clip to them.
let BODY: Shape
let FLUKES: Shape

/** A whale or dolphin, its flukes beating up and down, seen from above. */
export function drawCetacean(ctx: Pen, a: Beast, tile: number): void {
  const k = KD[a.kind]!
  const prep = PREP[a.kind]!
  const look = prep.look
  const n = spineOf(a)
  if (n < 8) return
  const L = prep.L
  $.LL = L
  $.GIRTH = k.girth
  $.TILE = tile
  $.TL = L * look.tail
  PROFILE = prep.profile
  GRID = prep.grid
  $.G = ctx.globalAlpha
  extend(a.spine, n, L + 2 * STEP)

  $.PHASE = strokes(a) % 1
  $.PITCH = look.pitch
  $.PIVOT = L * look.pivot
  $.SQUASH = 1 - Math.cos(pitchAt(0, 1))

  $.RM = 0
  const body = ctx.shape()
  $.D0 = 0
  $.D1 = L * look.tail
  ribbon(body)
  BODY = body

  // The flukes: a flat planform off the end of the tail stock, its chord shortened by the pitch (more at the tips).
  void (($.D = L * look.root), pose(ROOT))
  FL = prep.flukes
  $.FSPAN = FL[7]!
  $.C1 = Math.cos(pitchAt(0, 1.1))
  $.C2 = Math.cos(pitchAt(0.12, 1.3))
  const flukes = ctx.shape()
  flukes.moveTo(fpx(6, 1), fpy(6, 1))
  flukes.bezierCurveTo(fpx(5, 1), fpy(5, 1), fpx(4, 1), fpy(4, 1), fpx(3, 1), fpy(3, 1))
  flukes.bezierCurveTo(fpx(2, 1), fpy(2, 1), fpx(1, 1), fpy(1, 1), fpx(0, 1), fpy(0, 1))
  flukes.bezierCurveTo(fpx(1, -1), fpy(1, -1), fpx(2, -1), fpy(2, -1), fpx(3, -1), fpy(3, -1))
  flukes.bezierCurveTo(fpx(4, -1), fpy(4, -1), fpx(5, -1), fpy(5, -1), fpx(6, -1), fpy(6, -1))
  flukes.closePath()
  FLUKES = flukes

  // The flippers, swept back from the sides; through a turn the inner one is held out and the outer one tucked in.
  $.TURN = bend((($.D = L * 0.4), pose(TA)), (($.D = L * 0.05), pose(TB)))
  FS = prep.flipper
  $.FU = look.flipper.u
  $.FTH = look.flipper.theta
  $.FLEN = look.flipper.len
  const left = ctx.shape()
  flipper(left, -1, 1, 1)
  const right = ctx.shape()
  flipper(right, 1, 1, 1)

  ctx.save()
  // The fine edge first, round every part, so it shows only outside the whole: the parts are filled over it.
  ctx.lineJoin = 'round'
  ctx.lineWidth = look.line
  ctx.strokeStyle = look.edge
  ctx.stroke(flukes)
  ctx.stroke(left)
  ctx.stroke(right)
  ctx.stroke(body)
  // The body first, then the flippers and flukes over its edge: each one's root lies across the side of the body, so
  // it joins with no seam under it.
  ctx.fillStyle = look.skin
  ctx.fill(body)
  look.paint(ctx)
  // Each flipper shades from the body's own colour at its root to its own colour out at the tip, so the root melts
  // into the side with no dark wedge where they meet.
  $.FC0 = 1
  $.FC1 = 1
  for (let si = 0; si < 2; si += 1) {
    const s = si === 0 ? -1 : 1
    $.FFS = 0
    $.FFT = 0
    flipPoint(s)
    const rx = $.FPX
    const ry = $.FPY
    $.FFS = 0.5
    flipPoint(s)
    const shade = ctx.createLinearGradient(rx, ry, $.FPX, $.FPY)
    shade.addColorStop(0, look.skin)
    shade.addColorStop(0.45, look.rim ?? look.fin)
    ctx.fillStyle = shade
    ctx.fill(si === 0 ? left : right)
  }
  if (look.bumps === true) {
    // Clipped to the flipper, so none can fall outside.
    ctx.fillStyle = '#7c8890'
    const bumps = prep.bumps
    for (let si = 0; si < 2; si += 1) {
      const s = si === 0 ? -1 : 1
      ctx.save()
      const edge = ctx.shape()
      flipper(edge, s, 1, 1)
      ctx.clip(edge)
      $.FC0 = 1
      $.FC1 = 1
      for (let b = 0; b < bumps.length / 2; b += 1) {
        $.FFS = bumps[b * 2]!
        $.FFT = bumps[b * 2 + 1]!
        flipPoint(s)
        ctx.beginPath()
        ctx.arc($.FPX, $.FPY, $.FLEN * L * 0.02, 0, TAU)
        ctx.fill()
      }
      ctx.restore()
    }
  }
  ctx.fillStyle = look.fin
  ctx.fill(flukes)
  if (look.rim !== undefined) {
    const l2 = ctx.shape()
    flipper(l2, -1, 0.93, 0.62)
    ctx.fill(l2)
    const r2 = ctx.shape()
    flipper(r2, 1, 0.93, 0.62)
    ctx.fill(r2)
  }
  ctx.restore()
}
