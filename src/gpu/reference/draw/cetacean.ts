// Whales and dolphins from above: a long body that barely sways, the tail stock pitching up and down so the flukes
// foreshorten and slide fore and aft, the pectoral flippers, the dorsal fin as a dark ridge along the midline, and
// each one's dorsal colours: a blue whale's mottled blue-grey, an orca's black with its white eye patches, grey saddle
// and white flanks, a dolphin's dark cape over paler grey sides.

import { KINDS, spineOf, strokes, type Animal, type Frame } from '../sim.ts'
import { at, type Ctx } from './common.ts'

type Pt = [number, number]
/** Bezier points of one half of a shape: start, two controls, the apex, two controls, the end. */
type Bez = [Pt, Pt, Pt, Pt, Pt, Pt, Pt]
type Share = number | ((u: number) => number)

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
  paint: (ctx: Ctx, b: Body) => void
}

/** What a species' own markings are drawn from. */
type Body = {
  L: number
  body: Path2D
  flukes: Path2D
  pose: (d: number) => Frame
  /** The band of the body between `lo` and `hi` shares of its half width, from `u0` to `u1` of the length; it closes
   * to a rounded end over `taper` of the length at each end. */
  strip: (u0: number, u1: number, lo: Share, hi: Share, taper?: number) => Path2D
  /** A soft-cornered patch through points [share of the length, share of the half width there], `grow` times as big. */
  patch: (pts: Pt[], grow?: number) => Path2D
  /** A thin fin seen edge on along the midline, `thick` wide at the thickest. */
  blade: (u0: number, u1: number, thick: number) => Path2D
  /** A point on the flukes: x aft of their root, y out, in body lengths. */
  fluke: (x: number, y: number) => Pt
}

/** The sim's distance between spine frames. */
const STEP = 5
const WHITE = '#e6e8e6'

/** A smooth curve through the knots (monotone cubic, so it never overshoots between them). */
function smooth(knots: Pt[]): (x: number) => number {
  const h = knots.slice(1).map((k, i) => k[0] - knots[i]![0])
  const s = knots.slice(1).map((k, i) => (k[1] - knots[i]![1]) / h[i]!)
  const m = knots.map((_, i) => {
    if (i === 0) return s[0]!
    if (i === knots.length - 1) return s[i - 1]!
    const [s0, s1, h0, h1] = [s[i - 1]!, s[i]!, h[i - 1]!, h[i]!]
    return s0 * s1 <= 0 ? 0 : (3 * (h0 + h1)) / ((2 * h1 + h0) / s0 + (h1 + 2 * h0) / s1)
  })
  return x => {
    let i = 0
    while (i < knots.length - 2 && x > knots[i + 1]![0]) i += 1
    const [x0, y0] = knots[i]!
    const y1 = knots[i + 1]![1]
    const t = Math.min(1, Math.max(0, (x - x0) / h[i]!))
    const [t2, t3] = [t * t, t * t * t]
    const [hi, m0, m1] = [h[i]!, m[i]!, m[i + 1]!]
    return (2 * t3 - 3 * t2 + 1) * y0 + (t3 - 2 * t2 + t) * hi * m0 + (3 * t2 - 2 * t3) * y1 + (t3 - t2) * hi * m1
  }
}

/** The spine, carried on past its last frame in the curve it ends in: the tail stock and the flukes lie there. */
function extend(frames: Frame[], to: number): Frame[] {
  const line = [...frames]
  const last = line[line.length - 1]!
  const gap = Math.min(8, line.length - 1)
  const before = line[line.length - 1 - gap]!
  // How much the heading turns from one frame to the next at the end.
  const turn = Math.atan2(before.fx * last.fy - before.fy * last.fx, before.fx * last.fx + before.fy * last.fy) / gap
  const [c, s] = [Math.cos(turn), Math.sin(turn)]
  let p = last
  while (line.length * STEP < to) {
    p = { x: p.x - p.fx * STEP, y: p.y - p.fy * STEP, fx: p.fx * c - p.fy * s, fy: p.fx * s + p.fy * c, w: 0, u: 0 }
    line.push(p)
  }
  return line
}

/** How far the heading turns from `back` to `front`: positive toward the body's left (`out` > 0). */
const bend = (back: Frame, front: Frame): number =>
  Math.atan2(back.fx * front.fy - back.fy * front.fx, back.fx * front.fx + back.fy * front.fy)

function bez(path: Path2D, [p0, c1, c2, p1, c3, c4, p2]: Bez): void {
  path.moveTo(...p0)
  path.bezierCurveTo(...c1, ...c2, ...p1)
  path.bezierCurveTo(...c3, ...c4, ...p2)
  path.closePath()
}

/** An ellipse as its own subpath, `rot` off the x axis. */
function blob(ctx: Ctx, x: number, y: number, rx: number, ry: number, rot: number): void {
  ctx.moveTo(x + rx * Math.cos(rot), y + rx * Math.sin(rot))
  ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2)
}

const mirror = (pts: Pt[]): Pt[] => pts.map(([u, v]) => [u, -v])

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

function paintBlue(ctx: Ctx, b: Body): void {
  const L = b.L
  // The back a shade paler than the flanks.
  ctx.fillStyle = '#5a7385'
  ctx.fill(b.strip(0.03, 0.9, -0.6, 0.6, 0.06))
  ctx.save()
  ctx.clip(b.body)
  // The body rounds away at the sides: a little darker toward the edge.
  ctx.lineWidth = 70
  ctx.strokeStyle = 'rgba(30,46,60,.2)'
  ctx.stroke(b.body)
  TIERS.forEach((tier, i) => {
    const spots = MOTTLE[i]!.map(m => {
      const p = b.pose(m.u * L)
      const [x, y] = at(p, 0, m.v * p.w)
      return { x, y, rx: m.r * m.long, ry: m.r, rot: Math.atan2(p.fy, p.fx), dark: m.dark }
    })
    // The soft ones are built up in three growing layers, so their edges fade; the fine specks are single.
    const layers = i < 2 ? [1, 0.66, 0.33] : [1]
    for (const dark of [false, true]) {
      const a = tier.alpha / layers.length
      ctx.fillStyle = dark ? `rgba(62,84,100,${a * 1.3})` : `rgba(128,150,165,${a})`
      for (const grow of layers) {
        ctx.beginPath()
        for (const m of spots) if (m.dark === dark) blob(ctx, m.x, m.y, m.rx * grow, m.ry * grow, m.rot)
        ctx.fill()
      }
    }
  })
  ctx.restore()
  ctx.save()
  ctx.clip(b.flukes)
  for (const dark of [false, true]) {
    ctx.beginPath()
    for (const m of FLUKE_MOTTLE) {
      if (m.dark !== dark) continue
      const [x, y] = b.fluke(m.x, m.y)
      blob(ctx, x, y, m.r * 1.6, m.r, 0)
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
  for (let u = 0.012; u <= 0.15; u += 0.01) ctx.lineTo(...at(b.pose(u * L), 0, 0))
  ctx.stroke()
  ctx.strokeStyle = 'rgba(44,62,76,.3)'
  ctx.beginPath()
  for (let u = 0.8; u <= 0.935; u += 0.01) ctx.lineTo(...at(b.pose(u * L), 0, 0))
  ctx.stroke()

  // Two blowholes close together on the crown, a low arched splashguard ridge just ahead of them.
  const p = b.pose(L * 0.17)
  ctx.strokeStyle = 'rgba(150,176,192,.45)'
  ctx.lineWidth = 3.2
  ctx.beginPath()
  for (let t = -1; t <= 1.01; t += 0.25) ctx.lineTo(...at(p, 30 - 18 * t * t, 26 * t))
  ctx.stroke()
  ctx.strokeStyle = '#2b3a45'
  ctx.lineWidth = 2.6
  for (const side of [-1, 1]) {
    ctx.beginPath()
    ctx.moveTo(...at(p, 10, side * 5))
    ctx.lineTo(...at(p, -14, side * 11))
    ctx.stroke()
  }

  // The dorsal fin, a small dark nub far back.
  ctx.fillStyle = '#41586a'
  ctx.fill(b.blade(0.738, 0.768, 10))
}

// An orca is black with a lifted sheen, so the dark dorsal blade, the grey saddle and the white patches all read.
// The grey saddle behind the fin, swept back toward the flanks (half of it, midline to midline); the white of the
// belly rising up each flank, seen from above at the edges.
const HALF_SADDLE: Pt[] = [
  [0.505, 0], [0.52, 0.32], [0.55, 0.6], [0.6, 0.8], [0.655, 0.84], [0.7, 0.76], [0.73, 0.5], [0.765, 0.2], [0.78, 0],
]
const SADDLE: Pt[] = [...HALF_SADDLE, ...mirror(HALF_SADDLE.slice(1, -1)).reverse()]
const FLANK: Pt[] = [[0.6, 1.1], [0.62, 0.9], [0.66, 0.72], [0.71, 0.62], [0.76, 0.62], [0.8, 0.78], [0.83, 1.1]]

function paintOrca(ctx: Ctx, b: Body): void {
  const L = b.L
  ctx.fillStyle = '#2b2e33'
  ctx.fill(b.strip(0.03, 0.9, -0.45, 0.45, 0.1))
  ctx.save()
  ctx.clip(b.body)
  ctx.fillStyle = WHITE
  ctx.fill(b.patch(FLANK))
  ctx.fill(b.patch(mirror(FLANK)))
  // The saddle, its edge soft: a darker grey rim, then the pale grey.
  ctx.fillStyle = '#5f6469'
  ctx.fill(b.patch(SADDLE))
  ctx.fillStyle = '#8a8f94'
  ctx.fill(b.patch(SADDLE, 0.82))
  // The eye patches: white ovals behind each eye, wrapping up the sides of the head, tilted back toward the midline.
  const p = b.pose(L * 0.15)
  ctx.beginPath()
  for (const side of [-1, 1]) {
    const [x, y] = at(p, 0, side * p.w * 0.9)
    blob(ctx, x, y, 21, 8, Math.atan2(p.fy, p.fx) + side * 0.3)
  }
  ctx.fillStyle = WHITE
  ctx.fill()
  ctx.restore()
  // The dorsal fin edge on: a long thin dark blade down the midline.
  ctx.fillStyle = '#141517'
  ctx.strokeStyle = '#3a3f45'
  ctx.lineWidth = 1.4
  const fin = b.blade(0.37, 0.515, 12)
  ctx.stroke(fin)
  ctx.fill(fin)
}

// A bottlenose dolphin's cape: dark over the beak and melon, back and tail stock, a little paler between.
const CAPE = smooth([
  [0, 1], [0.05, 0.95], [0.075, 0.62], [0.12, 0.5], [0.3, 0.58], [0.5, 0.62], [0.7, 0.7], [0.85, 0.9], [0.95, 1.05],
])

function paintHumpback(ctx: Ctx, b: Body): void {
  // Dark above, a shade paler toward the flanks; the broad flippers are the same dark as the back.
  ctx.fillStyle = '#56626a'
  ctx.fill(b.strip(0.02, 0.97, -0.9, 0.9, 0.08))
  ctx.fillStyle = '#44505a'
  ctx.fill(b.strip(0.02, 0.97, -0.55, 0.55, 0.08))
}

function paintDolphin(ctx: Ctx, b: Body): void {
  // From the pale edge of the flank, darkening step by step into the cape.
  ctx.fillStyle = '#858d94'
  ctx.fill(b.strip(0.01, 0.98, -0.93, 0.93))
  ctx.fillStyle = '#7d858c'
  ctx.fill(b.strip(0.01, 0.98, -0.8, 0.8))
  ctx.fillStyle = '#656d74'
  ctx.fill(b.strip(0, 0.99, u => -CAPE(u) * 1.14, u => CAPE(u) * 1.14))
  ctx.fillStyle = '#4f565d'
  ctx.fill(b.strip(0, 0.99, u => -CAPE(u), CAPE))
  // The falcate dorsal fin seen from above: a thin dark ridge.
  ctx.fillStyle = '#3b4248'
  ctx.fill(b.blade(0.44, 0.555, 3.6))
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

/** A whale or dolphin, its flukes beating up and down, seen from above. */
export function drawCetacean(ctx: Ctx, a: Animal, tile: number): void {
  const k = KINDS[a.kind]!
  const look = LOOKS[k.name]!
  const frames = spineOf(a)
  if (frames.length < 8) return
  const L = k.length
  const line = extend(frames, L + 2 * STEP)
  const profile = smooth(look.width)
  // In the mosaic nothing narrower than a tile lights up: a slender tail stock or beak is kept a tile wide.
  const floor = (d: number): number =>
    tile === 0 ? 0 : tile * 0.5 * Math.max(0, Math.min(1, d / (tile * 1.5), (L * look.tail - d) / (tile * 1.5)))
  const wide = (d: number): number => Math.max(k.girth * Math.max(0, profile(d / L)), floor(d))

  // The tail stock pitches up and down. Seen from above it is shortest at the top and bottom of the stroke, when it
  // is most tilted, so the flukes slide forward then; each fluke's chord shrinks the same way, the tips a little
  // behind the root as the flukes flex.
  const phase = strokes(a) % 1
  const pitch = (lag: number, gain: number): number => look.pitch * gain * Math.sin(2 * Math.PI * (phase - lag))
  const pivot = L * look.pivot
  const squash = 1 - Math.cos(pitch(0, 1))
  const shift = (d: number): number => (d > pivot ? (squash * (d - pivot) ** 2) / (L - pivot) : 0)

  /** The body `d` units back from the front tip, as it lies along the bent spine. */
  const pose = (d: number): Frame => {
    const s = Math.max(0, d - shift(d)) / STEP
    const i = Math.min(line.length - 2, Math.floor(s))
    const t = s - i
    const [f, g] = [line[i]!, line[i + 1]!]
    const [fx, fy] = [f.fx + (g.fx - f.fx) * t, f.fy + (g.fy - f.fy) * t]
    const n = Math.hypot(fx, fy) || 1
    return { x: f.x + (g.x - f.x) * t, y: f.y + (g.y - f.y) * t, fx: fx / n, fy: fy / n, w: wide(d), u: d / L }
  }

  // Where to put points: close together at the rounded nose, then evenly along the rest.
  const nose = L * 0.03
  const grid: number[] = []
  for (let i = 0; i < 12; i += 1) grid.push(nose * (i / 12) ** 2)
  for (let d = nose; d < L; d += Math.min(STEP, L / 100)) grid.push(d)
  const ribbon = (d0: number, d1: number, lo: (d: number) => number, hi: (d: number) => number): Path2D => {
    const ds = [d0, ...grid.filter(d => d > d0 && d < d1), d1]
    const path = new Path2D()
    ds.forEach((d, i) => {
      const [x, y] = at(pose(d), 0, hi(d))
      if (i === 0) path.moveTo(x, y)
      else path.lineTo(x, y)
    })
    for (let i = ds.length - 1; i >= 0; i -= 1) path.lineTo(...at(pose(ds[i]!), 0, lo(ds[i]!)))
    path.closePath()
    return path
  }
  const share = (s: Share, u: number): number => (typeof s === 'number' ? s : s(u))
  const strip = (u0: number, u1: number, lo: Share, hi: Share, taper = 0): Path2D => {
    // The ends close like a circle's: sqrt(1 - (1 - t)^2).
    const round = (u: number): number => {
      const t = taper === 0 ? 1 : Math.min(1, Math.max(0, Math.min(u - u0, u1 - u) / taper))
      return Math.sqrt(1 - (1 - t) ** 2)
    }
    const edge = (s: Share) => (d: number): number => share(s, d / L) * wide(d) * round(d / L)
    return ribbon(L * u0, L * u1, edge(lo), edge(hi))
  }
  const blade = (u0: number, u1: number, thick: number): Path2D => {
    const h = (d: number): number => (thick / 2) * Math.sin(Math.PI * Math.pow((d - L * u0) / (L * (u1 - u0)), 0.7))
    return ribbon(L * u0, L * u1, d => -h(d), h)
  }
  const patch = (pts: Pt[], grow = 1): Path2D => {
    const cu = pts.reduce((s, p) => s + p[0], 0) / pts.length
    const xy = pts.map(([u, v]) => {
      const p = pose((cu + (u - cu) * grow) * L)
      return at(p, 0, v * grow * p.w)
    })
    const mid = (p: Pt, q: Pt): Pt => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]
    const path = new Path2D()
    path.moveTo(...mid(xy[xy.length - 1]!, xy[0]!))
    xy.forEach((p, i) => path.quadraticCurveTo(...p, ...mid(p, xy[(i + 1) % xy.length]!)))
    path.closePath()
    return path
  }
  const body = ribbon(0, L * look.tail, d => -wide(d), wide)

  // The flukes: a flat planform off the end of the tail stock, its chord shortened by the pitch (more at the tips).
  const root = pose(L * look.root)
  const span = look.flukes[3][1]
  const chord = (r: number): number => Math.cos(pitch(0, 1.1)) * (1 - r) + Math.cos(pitch(0.12, 1.3)) * r
  const fluke = (x: number, y: number): Pt => at(root, -x * L * chord(Math.abs(y) / span), y * L)
  const flukes = new Path2D()
  const [n, c1, c2, tip, c3, c4, r] = look.flukes
  const m = (p: Pt, s: number): Pt => fluke(p[0], p[1] * s)
  flukes.moveTo(...m(r, 1))
  flukes.bezierCurveTo(...m(c4, 1), ...m(c3, 1), ...m(tip, 1))
  flukes.bezierCurveTo(...m(c2, 1), ...m(c1, 1), ...m(n, 1))
  flukes.bezierCurveTo(...m(c1, -1), ...m(c2, -1), ...m(tip, -1))
  flukes.bezierCurveTo(...m(c3, -1), ...m(c4, -1), ...m(r, -1))
  flukes.closePath()

  // The flippers, swept back from the sides; through a turn the inner one is held out and the outer one tucked in.
  const turn = bend(pose(L * 0.4), pose(L * 0.05))
  const fl = look.flipper
  // A flipper's frame: its root on the side of the body, its axis swung back by theta.
  const flipperFrame = (s: 1 | -1): { base: Frame; ca: number; sa: number } => {
    const p = pose(L * fl.u)
    const th = fl.theta + s * Math.max(-0.3, Math.min(0.3, turn * 0.3))
    const [x, y] = at(p, 0, s * p.w * 0.97)
    return { base: { ...p, x, y }, ca: Math.cos(th), sa: Math.sin(th) }
  }
  // A point on a flipper, [along it, across it] in flipper lengths.
  const flipperPoint = (s: 1 | -1, fs: number, ft: number, scale: Pt = [1, 1]): Pt => {
    const { base, ca, sa } = flipperFrame(s)
    const [s0, t0] = [fs * scale[0] * fl.len * L, ft * scale[1] * fl.len * L]
    return at(base, -ca * s0 + sa * t0, s * (sa * s0 + ca * t0))
  }
  const flipper = (s: 1 | -1, scale: Pt): Path2D => {
    const path = new Path2D()
    bez(path, fl.shape.map(([fs, ft]) => flipperPoint(s, fs, ft, scale)) as Bez)
    return path
  }
  const flippers = [flipper(-1, [1, 1]), flipper(1, [1, 1])]

  ctx.save()
  // The fine edge first, round every part, so it shows only outside the whole: the parts are filled over it.
  ctx.lineJoin = 'round'
  ctx.lineWidth = look.line
  ctx.strokeStyle = look.edge
  for (const part of [flukes, ...flippers, body]) ctx.stroke(part)
  // The body first, then the flippers and flukes over its edge: each one's root lies across the side of the body, so
  // it joins with no seam under it.
  ctx.fillStyle = look.skin
  ctx.fill(body)
  look.paint(ctx, { L, body, flukes, pose, strip, patch, blade, fluke })
  // Each flipper shades from the body's own colour at its root to its own colour out at the tip, so the root melts
  // into the side with no dark wedge where they meet.
  for (const s of [-1, 1] as const) {
    const [rx, ry] = flipperPoint(s, 0, 0)
    const [tx, ty] = flipperPoint(s, 0.5, 0)
    const shade = ctx.createLinearGradient(rx, ry, tx, ty)
    shade.addColorStop(0, look.skin)
    shade.addColorStop(0.45, look.rim ?? look.fin)
    ctx.fillStyle = shade
    ctx.fill(flippers[s === -1 ? 0 : 1]!)
  }
  if (look.bumps) {
    // A humpback's knobs sit along the leading edge: the first curve of the flipper's outline, from its root to its tip,
    // a little inside it. Clipped to the flipper, so none can fall outside.
    const [p0, c1, c2, p1] = fl.shape
    const edge = (t: number): Pt => {
      const u = 1 - t
      const at2 = (i: 0 | 1): number => u * u * u * p0[i]! + 3 * u * u * t * c1[i]! + 3 * u * t * t * c2[i]! + t * t * t * p1[i]!
      return [at2(0), at2(1)]
    }
    ctx.fillStyle = '#7c8890'
    for (const s of [-1, 1] as const) {
      ctx.save()
      ctx.clip(flipper(s, [1, 1]))
      for (const t of [0.12, 0.26, 0.4, 0.54, 0.68, 0.82]) {
        const [fs, ft] = edge(t)
        const [x, y] = flipperPoint(s, fs, ft - 0.03)
        ctx.beginPath()
        ctx.arc(x, y, fl.len * L * 0.02, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.restore()
    }
  }
  ctx.fillStyle = look.fin
  ctx.fill(flukes)
  if (look.rim !== undefined) for (const s of [-1, 1] as const) ctx.fill(flipper(s, [0.93, 0.62]))
  ctx.restore()
}
