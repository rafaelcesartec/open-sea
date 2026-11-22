// A giant squid from above, swimming mantle first: the pointed tip of the 2 m mantle leads, with the small heart-shaped
// fins at its tip; behind the mantle the head with its two enormous eyes, the bundle of eight arms, and the two long
// feeding tentacles ending in clubs. Red from chromatophores: deep maroon on the back, brick on the arms and fins.
// It jets in pulses: the mantle clenches (narrower, fins folded, arms and tentacles pressed straight behind), then
// refills slowly while the arms drift apart and the tentacles wave.

import { KINDS, spineOf, strokes, type Animal, type Frame } from '../sim.ts'
import { EYE, at, near, type Ctx } from './common.ts'

type Pt = [number, number]
type By = (i: number) => number

// Half widths in units, as [share of length from the front, half width].
// The mantle: a long muscular torpedo, pointed at the rear tip (which leads), widest toward the head end.
const MANTLE: Pt[] = [
  [0, 0.6], [0.006, 2.8], [0.015, 5.5], [0.03, 8.6], [0.05, 11.3], [0.075, 14], [0.1, 16.4], [0.14, 19], [0.18, 20.6],
  [0.21, 21.3], [0.235, 21], [0.248, 19.6], [0.256, 17.5],
]
// The head, a little narrower than the mantle opening it nests in.
const HEAD: Pt[] = [[0.245, 12.5], [0.262, 13.4], [0.28, 14], [0.3, 13.2], [0.318, 12.2], [0.326, 10.8]]
// A feeding tentacle: a thin stalk, then the club (carpus, broad manus, tapering tip) over its last 0.08 L.
const TENTACLE: Pt[] = [
  [0.33, 3.3], [0.4, 3], [0.6, 2.7], [0.9, 2.5], [0.925, 3.4], [0.945, 5.6], [0.96, 6.2], [0.975, 5.4], [0.99, 3.4],
  [1, 0.4],
]
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

const smooth = (x: number): number => {
  const t = Math.max(0, Math.min(1, x))
  return t * t * (3 - 2 * t)
}

/** How hard the mantle is clenched, 0 to 1, `phase` of the way through a pulse: a quick squeeze to a peak at 0.17 (the
 * jet), then a slow refill that is done by 0.75; the sim's speed peaks a little after, at 0.25. */
const squeeze = (phase: number): number => (phase < 0.17 ? smooth(phase / 0.17) : 1 - smooth((phase - 0.17) / 0.58))

const lookup = (table: Pt[], u: number): number => {
  if (u <= table[0]![0]) return table[0]![1]
  for (let i = 1; i < table.length; i += 1) {
    const [u1, w1] = table[i]!
    if (u <= u1) {
      const [u0, w0] = table[i - 1]!
      return w0 + ((w1 - w0) * (u - u0)) / (u1 - u0)
    }
  }
  return table[table.length - 1]![1]
}

/** A smooth closed curve through `pts`: quadratics between midpoints, so a repeated point stays a sharp tip. */
function loop(ctx: Ctx, pts: Pt[]): void {
  const n = pts.length
  const mid = (i: number): Pt => {
    const [a, b] = [pts[i % n]!, pts[(i + 1) % n]!]
    return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
  }
  ctx.beginPath()
  ctx.moveTo(...mid(n - 1))
  for (let i = 0; i < n; i += 1) ctx.quadraticCurveTo(...pts[i]!, ...mid(i))
  ctx.closePath()
}

/** A ribbon along the spine from frame `i0` to `i1`: `mid` is how far out its centre lies, `hw` its half width. */
function ribbon(ctx: Ctx, frames: Frame[], i0: number, i1: number, mid: By, hw: By): void {
  const left: Pt[] = []
  const right: Pt[] = []
  for (let i = i0; i <= i1; i += 1) {
    left.push(at(frames[i]!, 0, mid(i) + hw(i)))
    right.unshift(at(frames[i]!, 0, mid(i) - hw(i)))
  }
  loop(ctx, [...left, ...right])
}

// Chromatophores are fixed in the skin: flecks placed by a hash of where they are along the body, never by chance.
const hash = (i: number, j: number): number => {
  const s = Math.sin(i * 12.9898 + j * 78.233) * 43758.5453
  return s - Math.floor(s)
}
function flecks(ctx: Ctx, frames: Frame[], i0: number, i1: number, mid: By, hw: By, per: number): void {
  for (const [colour, light] of [['#4b1a18', false], ['#b0604c', true]] as const) {
    ctx.beginPath()
    for (let i = i0; i <= i1; i += 1) {
      for (let j = 0; j < per; j += 1) {
        if ((hash(i, j + 11) > 0.82) !== light) continue
        const r = 0.4 + hash(i, j + 5) * 0.65
        const [x, y] = at(frames[i]!, (hash(i, j + 7) - 0.5) * 4, mid(i) + (hash(i, j) * 2 - 1) * hw(i) * 0.9)
        ctx.moveTo(x + r, y)
        ctx.arc(x, y, r, 0, Math.PI * 2)
      }
    }
    ctx.globalAlpha = light ? 0.45 : 0.6
    ctx.fillStyle = colour
    ctx.fill()
    ctx.globalAlpha = 1
  }
}

/** A giant squid, jetting mantle first, seen from above. */
export function drawSquid(ctx: Ctx, a: Animal, tile: number): void {
  const k = KINDS[a.kind]!
  const frames = spineOf(a)
  if (frames.length < 3) return
  const L = k.length
  const phase = strokes(a) % 1
  const jet = squeeze(phase)
  const open = 1 - jet
  // Frames lie every STEP / 2 units from the front tip.
  const idx = (u: number): number => Math.min(frames.length - 1, Math.round(u / frames[1]!.u))
  const last = frames.length - 1
  ctx.save()
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'

  // The feeding tentacles, under everything: a thin stalk that trails far behind, pressed together and straight in the
  // jet, drifting apart and waving between pulses, then the club. A tile is the least the mosaic shows, so there the
  // stalks keep to a tile to stay a line rather than a dotted trace.
  for (const side of [-1, 1]) {
    const mid = (i: number): number => {
      // The first frame of the stalk can lie a hair before 0.33: never below 0, where the powers below go NaN.
      const t = Math.max(0, (frames[i]!.u - 0.33) / 0.67)
      const spread = 3.2 + (3 + 8 * open) * Math.pow(t, 1.2)
      const flap = (4 + 7 * open) * Math.pow(t, 1.5) * Math.sin(2 * Math.PI * (phase - 1.3 * t + 0.3 * side))
      return side * spread + flap
    }
    const hw = (i: number): number => Math.max(lookup(TENTACLE, frames[i]!.u), tile * 0.5)
    ribbon(ctx, frames, idx(0.33), last, mid, hw)
    ctx.fillStyle = '#8a3a33'
    ctx.fill()
    ctx.lineWidth = 0.8
    ctx.strokeStyle = '#4d1c1a'
    ctx.stroke()
    // The club is paler, its broad palm set with suckers in rows.
    ctx.fillStyle = '#9d4c42'
    ctx.globalAlpha = 0.34
    for (const from of [0.915, 0.93, 0.945]) {
      ribbon(ctx, frames, idx(from), last, mid, hw)
      ctx.fill()
    }
    ctx.globalAlpha = 1
    ctx.beginPath()
    for (let i = idx(0.945); i < last - 1; i += 1) {
      const [x, y] = at(frames[i]!, 0, mid(i) + (i % 2 === 0 ? 1.7 : -1.7))
      ctx.moveTo(x + 1.1, y)
      ctx.arc(x, y, 1.1, 0, Math.PI * 2)
    }
    ctx.fillStyle = '#c48470'
    ctx.fill()
  }

  // The eight arms, thick and tapering to points, trailing from the crown. Pressed together in the jet; between pulses
  // they drift apart, the outer ones furthest, their tips fluttering.
  const step = frames[1]!.u * L
  const start = idx(CROWN)
  ARMS.forEach((arm, rank) => {
    for (const side of [-1, 1]) {
      const n = Math.min(Math.round(arm.len / step), last - start)
      const t = (i: number): number => ((i - start) * step) / arm.len
      const mid = (i: number): number => {
        const d = (i - start) * step
        const wave = Math.sin(2 * Math.PI * (phase - 0.9 * t(i) + 0.17 * rank + (side > 0 ? 0 : 0.5)))
        const flutter = (0.8 + 2.2 * open) * t(i) * t(i) * wave
        return side * (arm.out * (1 - 0.2 * t(i)) + arm.fan * (0.006 + 0.045 * open) * d) + flutter
      }
      const hw = (i: number): number => 4.3 * Math.pow(1 - Math.pow(t(i), 2.2), 0.7)
      ribbon(ctx, frames, start, start + n, mid, hw)
      ctx.fillStyle = arm.tone
      ctx.fill()
      ctx.lineWidth = 0.8
      ctx.strokeStyle = '#43181a'
      ctx.globalAlpha = 0.6
      ctx.stroke()
      ctx.globalAlpha = 1
      if (rank === ARMS.length - 1) flecks(ctx, frames, start, start + n - 2, mid, hw, 1)
    }
  })

  // The head, tucked under the mantle's collar and ahead of the arms.
  const head = (share: number): void => {
    const [i0, i1] = [idx(HEAD[0]![0]), idx(HEAD[HEAD.length - 1]![0])]
    const w = (i: number): number => lookup(HEAD, frames[i]!.u) * share
    const pts: Pt[] = []
    for (let i = i0; i <= i1; i += 1) pts.push(at(frames[i]!, 0, w(i)))
    pts.push(at(frames[i1]!, -3, w(i1) * 0.6), at(frames[i1]!, -4.2, 0), at(frames[i1]!, -3, -w(i1) * 0.6))
    for (let i = i1; i >= i0; i -= 1) pts.push(at(frames[i]!, 0, -w(i)))
    loop(ctx, pts)
  }
  head(1)
  ctx.fillStyle = '#833630'
  ctx.fill()
  ctx.lineWidth = 1.2
  ctx.strokeStyle = '#4d1c1a'
  ctx.stroke()
  head(0.4)
  ctx.fillStyle = '#6f2a26'
  ctx.globalAlpha = 0.7
  ctx.fill()
  ctx.globalAlpha = 1

  // The fins: together a heart at the mantle's tip, the lobes widest a little back of the tip. A jet folds them in and
  // sweeps them back a little; between pulses they ripple, a slow wave running front to back along the margin.
  const mw = (i: number): number => {
    const u = frames[i]!.u
    return lookup(MANTLE, u) * (1 - 0.18 * jet * (0.55 + 0.45 * smooth(u / 0.15)))
  }
  const nFin = idx(FIN)
  const finEdge = (i: number): number => {
    const u = frames[i]!.u
    const psi = u / FIN
    const span = 23.5 * (1 - 0.2 * jet)
    const ripple = 1 + 0.05 * Math.sin(2 * Math.PI * (phase - 0.9 * psi))
    return Math.max(mw(i) + 0.5, span * ripple * Math.pow(Math.sin(Math.PI * Math.pow(psi, 1.25 + 0.2 * jet)), 0.45))
  }
  for (const side of [-1, 1]) {
    const pts: Pt[] = [at(frames[0]!, 0, 0)]
    for (let i = 1; i <= nFin; i += 1) pts.push(at(frames[i]!, 0, side * finEdge(i)))
    pts.push(at(frames[nFin]!, 0, 0))
    loop(ctx, pts)
    ctx.fillStyle = '#9a4a40'
    ctx.fill()
    ctx.lineWidth = 1
    ctx.strokeStyle = '#5a2420'
    ctx.stroke()
    // The rays of the fin muscle, fanning from the mantle to the margin.
    ctx.beginPath()
    for (let i = 2; i < nFin; i += 2) {
      ctx.moveTo(...at(frames[i]!, 0, side * mw(i) * 0.85))
      ctx.lineTo(...at(frames[i]!, -2.5, side * finEdge(i) * 0.94))
    }
    ctx.lineWidth = 0.7
    ctx.strokeStyle = '#7e352d'
    ctx.stroke()
  }

  // The mantle: a darker back along the middle, a pale flank at the edge, and the collar where it meets the head.
  const nM = idx(0.256)
  const mantle = (share: number): void => {
    const e = frames[nM]!
    const w = mw(nM) * share
    const pts: Pt[] = [at(frames[0]!, 2.5, 0)]
    for (let i = 0; i <= nM; i += 1) pts.push(at(frames[i]!, 0, mw(i) * share))
    pts.push(at(e, -2.2, w * 0.7), at(e, -4, w * 0.3), at(e, -4.6, 0), at(e, -4, -w * 0.3), at(e, -2.2, -w * 0.7))
    for (let i = nM; i >= 0; i -= 1) pts.push(at(frames[i]!, 0, -mw(i) * share))
    loop(ctx, pts)
  }
  mantle(1)
  ctx.fillStyle = '#84352f'
  ctx.fill()
  ctx.lineWidth = 1.3
  ctx.strokeStyle = '#4d1c1a'
  ctx.stroke()
  mantle(0.82)
  ctx.fillStyle = '#7c2f2b'
  ctx.fill()
  mantle(0.64)
  ctx.fillStyle = '#722a26'
  ctx.fill()
  mantle(0.38)
  ctx.fillStyle = '#6a2622'
  ctx.fill()
  flecks(ctx, frames, 1, nM, () => 0, mw, 3)
  const e = frames[nM]!
  ctx.beginPath()
  ctx.moveTo(...at(e, 0.5, mw(nM) * 0.97))
  ctx.quadraticCurveTo(...at(e, -9, 0), ...at(e, 0.5, -mw(nM) * 0.97))
  ctx.lineWidth = 1.6
  ctx.strokeStyle = '#4b1a18'
  ctx.globalAlpha = 0.55
  ctx.stroke()
  ctx.globalAlpha = 1

  // The eyes, 27 cm across, bulge from the sides of the head wider than the mantle: a pale ring round a black pupil.
  const f = near(frames, 0.282)
  const turn = Math.atan2(f.fy, f.fx)
  for (const side of [-1, 1]) {
    const ellipse = (out: number, along: number, rx: number, ry: number): void => {
      ctx.beginPath()
      ctx.ellipse(...at(f, along, side * out), rx, ry, turn, 0, Math.PI * 2)
    }
    ellipse(13.3, 0, 10.8, 9.6)
    ctx.fillStyle = '#4a1a18'
    ctx.fill()
    ellipse(13.5, 0, 10, 8.8)
    ctx.fillStyle = '#9a8a80'
    ctx.fill()
    ellipse(14.4, 0, 8.7, 7.5)
    ctx.fillStyle = EYE
    ctx.fill()
    ellipse(17.4, 2.8, 1.3, 0.8)
    ctx.fillStyle = '#9d948d'
    ctx.fill()
  }
  ctx.restore()
}
