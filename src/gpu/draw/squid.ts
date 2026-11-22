// draw/squid.ts, allocation-free: the same squid, op for op (draw.test.ts). The original's closures (`mid`, `hw` of a
// tentacle, an arm, the mantle) are module functions switching on `$.WHICH`; its point lists are scratch arrays here.

import { KD } from '../kinds.ts'
import { KINDS, type Frame } from '../reference/sim.ts'
import { EYE, TAU, X, Y, type Pen } from '../pen.ts'
import { spineOf, strokes, type Beast } from '../sea.ts'
import { NEAR, near } from './common.ts'

type Pt = [number, number]
const flat = (pts: Pt[]): Float64Array => Float64Array.from(pts.flat())

// Half widths in units, as (share of length from the front, half width) pairs.
// The mantle: a long muscular torpedo, pointed at the rear tip (which leads), widest toward the head end.
const MANTLE = flat([
  [0, 0.6], [0.006, 2.8], [0.015, 5.5], [0.03, 8.6], [0.05, 11.3], [0.075, 14], [0.1, 16.4], [0.14, 19], [0.18, 20.6],
  [0.21, 21.3], [0.235, 21], [0.248, 19.6], [0.256, 17.5],
])
// The head, a little narrower than the mantle opening it nests in.
const HEAD = flat([[0.245, 12.5], [0.262, 13.4], [0.28, 14], [0.3, 13.2], [0.318, 12.2], [0.326, 10.8]])
// A feeding tentacle: a thin stalk, then the club (carpus, broad manus, tapering tip) over its last 0.08 L.
const TENTACLE = flat([
  [0.33, 3.3], [0.4, 3], [0.6, 2.7], [0.9, 2.5], [0.925, 3.4], [0.945, 5.6], [0.96, 6.2], [0.975, 5.4], [0.99, 3.4],
  [1, 0.4],
])
// The fins span the first 0.078 L of the mantle (about 0.6 m); the arm crown is where the arms leave the head.
const FIN = 0.078
const CROWN = 0.318
// The eight arms, deepest first (so the upper ones overlap the lower, as in a ring seen from above): where each leaves
// the crown, how long it is (units), how far it fans out as the arms part, its tone.
const ARMS = [
  { out: 4.2, len: 108, fan: 1.4, tone: '#7a312b' },
  { out: 8.4, len: 118, fan: 2.5, tone: '#82352f' },
  { out: 8.6, len: 112, fan: 1.5, tone: '#8a3a33' },
  { out: 3.8, len: 104, fan: 0.6, tone: '#8f3f37' },
]
// The three rows of suckers on a club start here.
const CLUB = Float64Array.of(0.915, 0.93, 0.945)

const smooth = (x: number): number => Math.max(0, Math.min(1, x)) * Math.max(0, Math.min(1, x)) * (3 - 2 * Math.max(0, Math.min(1, x)))

/** How hard the mantle is clenched, 0 to 1, `phase` of the way through a pulse: a quick squeeze to a peak at 0.17 (the
 * jet), then a slow refill that is done by 0.75; the sim's speed peaks a little after, at 0.25. */
const squeeze = (phase: number): number => (phase < 0.17 ? smooth(phase / 0.17) : 1 - smooth((phase - 0.17) / 0.58))

/** The table at $.U, into $.LK. (Numbers go into and out of these helpers through $, not arguments: V8 boxes a number
 * passed to or returned from a call it does not inline.) */
function lookupAt(table: Float64Array): void {
  const u = $.U
  if (u <= table[0]!) {
    $.LK = table[1]!
    return
  }
  for (let i = 1; i < table.length / 2; i += 1) {
    const u1 = table[i * 2]!
    if (u <= u1) {
      const w1 = table[i * 2 + 1]!
      const u0 = table[i * 2 - 2]!
      const w0 = table[i * 2 - 1]!
      $.LK = w0 + ((w1 - w0) * (u - u0)) / (u1 - u0)
      return
    }
  }
  $.LK = table[table.length - 1]!
}

// Scratch: the points of the curve being made, (x, y) each, the most a body's frames can give twice over and more.
const MOST = Math.max(...KINDS.map(k => Math.floor((k.length * k.trunk + 0.01) / 5) + 2)) + 16
const PX = new Float64Array(MOST * 2 + 16)
const PY = new Float64Array(MOST * 2 + 16)

// What the drawing is now.
let FR: Frame[] = []
// Numbers kept between calls live in this object: a closure's variable would box each new value.
const $ = { U: 0.5, LK: 0.5, IU: 0.5, MID: 0.5, HW: 0.5, MW: 0.5, FE: 0.5, SHARE: 0.5, NF: 0, PHASE: 0, JET: 0, OPEN: 0, TILE: 0, SIDE: 1, RANK: 0, START: 0, STEP: 0, WHICH: 0 }
// The arm being drawn: its table row, its rank, where on the spine it starts, and a frame's length in units.
let ARM = ARMS[0]!
// Which `mid` and `hw` are in force: 0 a feeding tentacle, 1 an arm, 2 the mantle's flecks (mid 0, hw the mantle's).

/** The frame at $.IU of the length from the front, as the sim lays them. */
const idxAt = (): number => Math.min($.NF - 1, Math.round($.IU / FR[1]!.u))

/** A smooth closed curve through the first `n` scratch points: quadratics between midpoints, so a repeated point stays a
 * sharp tip. */
function loop(ctx: Pen, n: number): void {
  ctx.beginPath()
  ctx.moveTo((PX[(n - 1) % n]! + PX[n % n]!) / 2, (PY[(n - 1) % n]! + PY[n % n]!) / 2)
  for (let i = 0; i < n; i += 1) {
    ctx.quadraticCurveTo(PX[i]!, PY[i]!, (PX[i % n]! + PX[(i + 1) % n]!) / 2, (PY[i % n]! + PY[(i + 1) % n]!) / 2)
  }
  ctx.closePath()
}

/** How far out the centre of the ribbon lies at frame `i`, into $.MID. */
function midAt(i: number): void {
  if ($.WHICH === 2) {
    $.MID = 0
    return
  }
  if ($.WHICH === 0) {
    // The first frame of the stalk can lie a hair before 0.33: never below 0, where the powers below go NaN.
    const t = Math.max(0, (FR[i]!.u - 0.33) / 0.67)
    const spread = 3.2 + (3 + 8 * $.OPEN) * Math.pow(t, 1.2)
    const flap = (4 + 7 * $.OPEN) * Math.pow(t, 1.5) * Math.sin(2 * Math.PI * ($.PHASE - 1.3 * t + 0.3 * $.SIDE))
    $.MID = $.SIDE * spread + flap
    return
  }
  const d = (i - $.START) * $.STEP
  const ta = ((i - $.START) * $.STEP) / ARM.len
  const wave = Math.sin(2 * Math.PI * ($.PHASE - 0.9 * ta + 0.17 * $.RANK + ($.SIDE > 0 ? 0 : 0.5)))
  const flutter = (0.8 + 2.2 * $.OPEN) * ta * ta * wave
  $.MID = $.SIDE * (ARM.out * (1 - 0.2 * ta) + ARM.fan * (0.006 + 0.045 * $.OPEN) * d) + flutter
}

/** The mantle's half width at frame `i`, into $.MW. */
function mwAt(i: number): void {
  const u = FR[i]!.u
  $.U = u
  lookupAt(MANTLE)
  $.MW = $.LK * (1 - 0.18 * $.JET * (0.55 + 0.45 * smooth(u / 0.15)))
}

/** The ribbon's half width at frame `i`, into $.HW. */
function hwAt(i: number): void {
  if ($.WHICH === 2) {
    mwAt(i)
    $.HW = $.MW
    return
  }
  if ($.WHICH === 0) {
    $.U = FR[i]!.u
    lookupAt(TENTACLE)
    $.HW = Math.max($.LK, $.TILE * 0.5)
    return
  }
  const ta = ((i - $.START) * $.STEP) / ARM.len
  $.HW = 4.3 * Math.pow(1 - Math.pow(ta, 2.2), 0.7)
}

/** A ribbon along the spine from frame `i0` to `i1`. */
function ribbon(ctx: Pen, i0: number, i1: number): void {
  let n = 0
  for (let i = i0; i <= i1; i += 1) {
    const f = FR[i]!
    const o = (midAt(i), $.MID) + (hwAt(i), $.HW)
    PX[n] = X(f, 0, o)
    PY[n] = Y(f, 0, o)
    n += 1
  }
  for (let i = i1; i >= i0; i -= 1) {
    const f = FR[i]!
    const o = (midAt(i), $.MID) - (hwAt(i), $.HW)
    PX[n] = X(f, 0, o)
    PY[n] = Y(f, 0, o)
    n += 1
  }
  loop(ctx, n)
}

// Chromatophores are fixed in the skin: flecks placed by a hash of where they are along the body, never by chance.
const hash = (i: number, j: number): number => Math.sin(i * 12.9898 + j * 78.233) * 43758.5453 - Math.floor(Math.sin(i * 12.9898 + j * 78.233) * 43758.5453)
function flecks(ctx: Pen, i0: number, i1: number, per: number): void {
  for (let pass = 0; pass < 2; pass += 1) {
    const light = pass === 1
    ctx.beginPath()
    for (let i = i0; i <= i1; i += 1) {
      for (let j = 0; j < per; j += 1) {
        if ((hash(i, j + 11) > 0.82) !== light) continue
        const r = 0.4 + hash(i, j + 5) * 0.65
        const along = (hash(i, j + 7) - 0.5) * 4
        const out = (midAt(i), $.MID) + (hash(i, j) * 2 - 1) * (hwAt(i), $.HW) * 0.9
        const x = X(FR[i]!, along, out)
        const y = Y(FR[i]!, along, out)
        ctx.moveTo(x + r, y)
        ctx.arc(x, y, r, 0, TAU)
      }
    }
    ctx.globalAlpha = light ? 0.45 : 0.6
    ctx.fillStyle = light ? '#b0604c' : '#4b1a18'
    ctx.fill()
    ctx.globalAlpha = 1
  }
}

/** The head, tucked under the mantle's collar and ahead of the arms, `share` of its width. */
function head(ctx: Pen): void {
  const share = $.SHARE
  const i0 = (($.IU = HEAD[0]!), idxAt())
  const i1 = (($.IU = HEAD[HEAD.length - 2]!), idxAt())
  let n = 0
  for (let i = i0; i <= i1; i += 1) {
    const o = (($.U = FR[i]!.u), lookupAt(HEAD), $.LK) * share
    PX[n] = X(FR[i]!, 0, o)
    PY[n] = Y(FR[i]!, 0, o)
    n += 1
  }
  const f1 = FR[i1]!
  const w1 = (($.U = f1.u), lookupAt(HEAD), $.LK) * share
  PX[n] = X(f1, -3, w1 * 0.6)
  PY[n] = Y(f1, -3, w1 * 0.6)
  n += 1
  PX[n] = X(f1, -4.2, 0)
  PY[n] = Y(f1, -4.2, 0)
  n += 1
  PX[n] = X(f1, -3, -w1 * 0.6)
  PY[n] = Y(f1, -3, -w1 * 0.6)
  n += 1
  for (let i = i1; i >= i0; i -= 1) {
    const o = -((($.U = FR[i]!.u), lookupAt(HEAD), $.LK) * share)
    PX[n] = X(FR[i]!, 0, o)
    PY[n] = Y(FR[i]!, 0, o)
    n += 1
  }
  loop(ctx, n)
}

/** The fin's edge at frame `i`, into $.FE. */
function finEdgeAt(i: number): void {
  const u = FR[i]!.u
  const psi = u / FIN
  const span = 23.5 * (1 - 0.2 * $.JET)
  const ripple = 1 + 0.05 * Math.sin(2 * Math.PI * ($.PHASE - 0.9 * psi))
  mwAt(i)
  $.FE = Math.max($.MW + 0.5, span * ripple * Math.pow(Math.sin(Math.PI * Math.pow(psi, 1.25 + 0.2 * $.JET)), 0.45))
}

/** The mantle outline, `share` of its width, with the collar where it meets the head. */
function mantle(ctx: Pen, nM: number): void {
  const share = $.SHARE
  const e = FR[nM]!
  const w = (mwAt(nM), $.MW) * share
  PX[0] = X(FR[0]!, 2.5, 0)
  PY[0] = Y(FR[0]!, 2.5, 0)
  let n = 1
  for (let i = 0; i <= nM; i += 1) {
    const o = (mwAt(i), $.MW) * share
    PX[n] = X(FR[i]!, 0, o)
    PY[n] = Y(FR[i]!, 0, o)
    n += 1
  }
  PX[n] = X(e, -2.2, w * 0.7)
  PY[n] = Y(e, -2.2, w * 0.7)
  n += 1
  PX[n] = X(e, -4, w * 0.3)
  PY[n] = Y(e, -4, w * 0.3)
  n += 1
  PX[n] = X(e, -4.6, 0)
  PY[n] = Y(e, -4.6, 0)
  n += 1
  PX[n] = X(e, -4, -w * 0.3)
  PY[n] = Y(e, -4, -w * 0.3)
  n += 1
  PX[n] = X(e, -2.2, -w * 0.7)
  PY[n] = Y(e, -2.2, -w * 0.7)
  n += 1
  for (let i = nM; i >= 0; i -= 1) {
    const o = -(mwAt(i), $.MW) * share
    PX[n] = X(FR[i]!, 0, o)
    PY[n] = Y(FR[i]!, 0, o)
    n += 1
  }
  loop(ctx, n)
}

/** An eye's ellipse: the turn, side, how far out and along, and its radii, in EY. */
const EY = new Float64Array(6)
function eye(ctx: Pen, f: Frame): void {
  const turn = EY[0]!
  const side = EY[1]!
  const out = EY[2]!
  const along = EY[3]!
  const rx = EY[4]!
  const ry = EY[5]!
  ctx.beginPath()
  ctx.ellipse(X(f, along, side * out), Y(f, along, side * out), rx, ry, turn, 0, TAU)
}

/** A giant squid, jetting mantle first, seen from above. */
export function drawSquid(ctx: Pen, a: Beast, tile: number): void {
  const k = KD[a.kind]!
  $.NF = spineOf(a)
  FR = a.spine
  const frames = FR
  if ($.NF < 3) return
  const L = k.length
  const phase = strokes(a) % 1
  const jet = squeeze(phase)
  const open = 1 - jet
  $.PHASE = phase
  $.JET = jet
  $.OPEN = open
  $.TILE = tile
  const last = $.NF - 1
  ctx.save()
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'

  // The feeding tentacles, under everything: a thin stalk that trails far behind, pressed together and straight in the
  // jet, drifting apart and waving between pulses, then the club. A tile is the least the mosaic shows, so there the
  // stalks keep to a tile to stay a line rather than a dotted trace.
  for (let s = 0; s < 2; s += 1) {
    const side = s === 0 ? -1 : 1
    $.WHICH = 0
    $.SIDE = side
    ribbon(ctx, (($.IU = 0.33), idxAt()), last)
    ctx.fillStyle = '#8a3a33'
    ctx.fill()
    ctx.lineWidth = 0.8
    ctx.strokeStyle = '#4d1c1a'
    ctx.stroke()
    // The club is paler, its broad palm set with suckers in rows.
    ctx.fillStyle = '#9d4c42'
    ctx.globalAlpha = 0.34
    for (let c = 0; c < 3; c += 1) {
      ribbon(ctx, (($.IU = CLUB[c]!), idxAt()), last)
      ctx.fill()
    }
    ctx.globalAlpha = 1
    ctx.beginPath()
    for (let i = (($.IU = 0.945), idxAt()); i < last - 1; i += 1) {
      const o = (midAt(i), $.MID) + (i % 2 === 0 ? 1.7 : -1.7)
      const x = X(frames[i]!, 0, o)
      const y = Y(frames[i]!, 0, o)
      ctx.moveTo(x + 1.1, y)
      ctx.arc(x, y, 1.1, 0, TAU)
    }
    ctx.fillStyle = '#c48470'
    ctx.fill()
  }

  // The eight arms, thick and tapering to points, trailing from the crown. Pressed together in the jet; between pulses
  // they drift apart, the outer ones furthest, their tips fluttering.
  const step = frames[1]!.u * L
  const start = (($.IU = CROWN), idxAt())
  $.STEP = step
  $.START = start
  $.WHICH = 1
  for (let rank = 0; rank < ARMS.length; rank += 1) {
    const arm = ARMS[rank]!
    ARM = arm
    $.RANK = rank
    for (let s = 0; s < 2; s += 1) {
      $.SIDE = s === 0 ? -1 : 1
      const n = Math.min(Math.round(arm.len / step), last - start)
      ribbon(ctx, start, start + n)
      ctx.fillStyle = arm.tone
      ctx.fill()
      ctx.lineWidth = 0.8
      ctx.strokeStyle = '#43181a'
      ctx.globalAlpha = 0.6
      ctx.stroke()
      ctx.globalAlpha = 1
      if (rank === ARMS.length - 1) flecks(ctx, start, start + n - 2, 1)
    }
  }

  // The head, tucked under the mantle's collar and ahead of the arms.
  void (($.SHARE = 1), head(ctx))
  ctx.fillStyle = '#833630'
  ctx.fill()
  ctx.lineWidth = 1.2
  ctx.strokeStyle = '#4d1c1a'
  ctx.stroke()
  void (($.SHARE = 0.4), head(ctx))
  ctx.fillStyle = '#6f2a26'
  ctx.globalAlpha = 0.7
  ctx.fill()
  ctx.globalAlpha = 1

  // The fins: together a heart at the mantle's tip, the lobes widest a little back of the tip. A jet folds them in and
  // sweeps them back a little; between pulses they ripple, a slow wave running front to back along the margin.
  const nFin = (($.IU = FIN), idxAt())
  for (let s = 0; s < 2; s += 1) {
    const side = s === 0 ? -1 : 1
    PX[0] = X(frames[0]!, 0, 0)
    PY[0] = Y(frames[0]!, 0, 0)
    let n = 1
    for (let i = 1; i <= nFin; i += 1) {
      const o = side * (finEdgeAt(i), $.FE)
      PX[n] = X(frames[i]!, 0, o)
      PY[n] = Y(frames[i]!, 0, o)
      n += 1
    }
    PX[n] = X(frames[nFin]!, 0, 0)
    PY[n] = Y(frames[nFin]!, 0, 0)
    n += 1
    loop(ctx, n)
    ctx.fillStyle = '#9a4a40'
    ctx.fill()
    ctx.lineWidth = 1
    ctx.strokeStyle = '#5a2420'
    ctx.stroke()
    // The rays of the fin muscle, fanning from the mantle to the margin.
    ctx.beginPath()
    for (let i = 2; i < nFin; i += 2) {
      ctx.moveTo(X(frames[i]!, 0, side * (mwAt(i), $.MW) * 0.85), Y(frames[i]!, 0, side * (mwAt(i), $.MW) * 0.85))
      ctx.lineTo(X(frames[i]!, -2.5, side * (finEdgeAt(i), $.FE) * 0.94), Y(frames[i]!, -2.5, side * (finEdgeAt(i), $.FE) * 0.94))
    }
    ctx.lineWidth = 0.7
    ctx.strokeStyle = '#7e352d'
    ctx.stroke()
  }

  // The mantle: a darker back along the middle, a pale flank at the edge, and the collar where it meets the head.
  const nM = (($.IU = 0.256), idxAt())
  void (($.SHARE = 1), mantle(ctx, nM))
  ctx.fillStyle = '#84352f'
  ctx.fill()
  ctx.lineWidth = 1.3
  ctx.strokeStyle = '#4d1c1a'
  ctx.stroke()
  void (($.SHARE = 0.82), mantle(ctx, nM))
  ctx.fillStyle = '#7c2f2b'
  ctx.fill()
  void (($.SHARE = 0.64), mantle(ctx, nM))
  ctx.fillStyle = '#722a26'
  ctx.fill()
  void (($.SHARE = 0.38), mantle(ctx, nM))
  ctx.fillStyle = '#6a2622'
  ctx.fill()
  $.WHICH = 2
  flecks(ctx, 1, nM, 3)
  const e = frames[nM]!
  ctx.beginPath()
  ctx.moveTo(X(e, 0.5, (mwAt(nM), $.MW) * 0.97), Y(e, 0.5, (mwAt(nM), $.MW) * 0.97))
  ctx.quadraticCurveTo(X(e, -9, 0), Y(e, -9, 0), X(e, 0.5, -(mwAt(nM), $.MW) * 0.97), Y(e, 0.5, -(mwAt(nM), $.MW) * 0.97))
  ctx.lineWidth = 1.6
  ctx.strokeStyle = '#4b1a18'
  ctx.globalAlpha = 0.55
  ctx.stroke()
  ctx.globalAlpha = 1

  // The eyes, 27 cm across, bulge from the sides of the head wider than the mantle: a pale ring round a black pupil.
  const f = ((NEAR.u = 0.282), near(frames, $.NF))
  const turn = Math.atan2(f.fy, f.fx)
  for (let s = 0; s < 2; s += 1) {
    const side = s === 0 ? -1 : 1
    void ((EY[0] = turn), (EY[1] = side), (EY[2] = 13.3), (EY[3] = 0), (EY[4] = 10.8), (EY[5] = 9.6), eye(ctx, f))
    ctx.fillStyle = '#4a1a18'
    ctx.fill()
    void ((EY[0] = turn), (EY[1] = side), (EY[2] = 13.5), (EY[3] = 0), (EY[4] = 10), (EY[5] = 8.8), eye(ctx, f))
    ctx.fillStyle = '#9a8a80'
    ctx.fill()
    void ((EY[0] = turn), (EY[1] = side), (EY[2] = 14.4), (EY[3] = 0), (EY[4] = 8.7), (EY[5] = 7.5), eye(ctx, f))
    ctx.fillStyle = EYE
    ctx.fill()
    void ((EY[0] = turn), (EY[1] = side), (EY[2] = 17.4), (EY[3] = 2.8), (EY[4] = 1.3), (EY[5] = 0.8), eye(ctx, f))
    ctx.fillStyle = '#9d948d'
    ctx.fill()
  }
  ctx.restore()
}
