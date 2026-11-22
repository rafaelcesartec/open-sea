// A green sea turtle from above: a rigid carapace with its scutes, a small head on a short neck, long front flippers it
// flies with (power stroke, glide, recovery), small rear flippers that steer, and a short tail between them. Drawn in
// a frame of (back, side): `back` units behind the head tip, `side` units out from the midline.

import { KINDS, poseOf, strokes, type Animal } from '../sim.ts'
import { EYE, at, type Ctx } from './common.ts'

type Pt = [number, number]

const turtle = KINDS.find(k => k.plan === 'turtle')!
const L = turtle.length
const W = turtle.girth

// Olive-brown shell, lighter at the middle of each scute, dark seams, yellowish growth streaks; dark scaly skin with
// pale yellowish edges to the scales.
const SHELL = { base: '#6b5d3e', centre: '#8a7a50', seam: '#3f3524', ring: '#76684a' }
const STREAK = { pale: 'rgba(160, 140, 85, 0.24)', dark: 'rgba(63, 53, 36, 0.2)' }
const SKIN = { scale: '#5a5143', edge: '#b3a684', seam: 'rgba(179, 166, 132, 0.45)', claw: '#d2c7a5' }

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v))
/** The value of a table of [x, y] at `x`, straight between its points. */
function table(pts: Pt[], x: number): number {
  let i = 1
  while (i < pts.length - 1 && pts[i]![0] < x) i += 1
  const [x0, y0] = pts[i - 1]!
  const [x1, y1] = pts[i]!
  return y0 + (y1 - y0) * clamp((x - x0) / (x1 - x0), 0, 1)
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

type Scute = { pts: Pt[]; c: Pt; r: number; rays: { tri: Pt[]; dark: boolean }[] }
/** A scute from its corners in shell space; every edge is cut short so it follows the curve of the shell. */
function scute(corners: Pt[], n: number): Scute {
  const pts: Pt[] = []
  corners.forEach(([t0, s0], i) => {
    const [t1, s1] = corners[(i + 1) % corners.length]!
    for (let k = 0; k < 5; k += 1) pts.push(shell(t0 + ((t1 - t0) * k) / 5, s0 + ((s1 - s0) * k) / 5))
  })
  const c: Pt = [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length]
  const r = pts.reduce((s, p) => s + Math.hypot(p[0] - c[0], p[1] - c[1]), 0) / pts.length
  // Growth streaks run out from the middle of each scute, darker and yellower in turn, each scute turned a little.
  const rays = Array.from({ length: 12 }, (_, k) => {
    const a = ((k + (n % 3) / 3) / 12) * Math.PI * 2
    const far = r * 1.8
    const tip = (da: number): Pt => [c[0] + Math.cos(a + da) * far, c[1] + Math.sin(a + da) * far]
    return { tri: [c, tip(-0.12), tip(0.12)], dark: k % 2 === 0 }
  })
  return { pts, c, r, rays }
}

// Five vertebral scutes down the midline (hexagons, a little wider than long) and four costals either side; the costal
// seams start at the side points of the vertebrals. In shell space: where each vertebral begins, and its half width
// there and at its middle.
const TV = [0.11, 0.28, 0.44, 0.6, 0.77, 0.93]
const SV = [0.26, 0.21, 0.2, 0.2, 0.2, 0.12]
const SM = [0.3, 0.32, 0.31, 0.3, 0.26]
const scutes: Scute[] = []
for (let i = 0; i < 5; i += 1) {
  const m = (TV[i]! + TV[i + 1]!) / 2
  const [a, b, c, d] = [TV[i]!, TV[i + 1]!, SV[i]!, SV[i + 1]!]
  scutes.push(scute([[a, -c], [m, -SM[i]!], [b, -d], [b, d], [m, SM[i]!], [a, c]], i))
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
    scutes.push(scute(corners.map(([t, s]): Pt => [t, s * side]), 5 + c + 4 * (side > 0 ? 0 : 1)))
  }
}

/** The rim, from the front point down one side and back up the other. */
const contour: Pt[] = []
for (let i = 0; i <= 40; i += 1) contour.push(shell((1 - Math.cos((Math.PI * i) / 40)) / 2, 1))
for (let i = 39; i >= 1; i -= 1) contour.push([contour[i]![0], -contour[i]![1]])
// A seam between marginal scutes every few units of rim, running in toward the middle.
const ticks: [Pt, Pt][] = []
let since = 0
contour.forEach(([b, y], i) => {
  const [pb, py] = contour[(i + contour.length - 1) % contour.length]!
  since += Math.hypot(b - pb, y - py)
  if (since < 8) return
  since = 0
  const cb = FRONT + 0.44 * SPAN - b
  const d = Math.hypot(cb, y)
  ticks.push([[b, y], [b + (cb / d) * RING, y - (y / d) * RING]])
})

// THE HEAD: small and rounded with a blunt short snout, widest behind the eyes, then the neck widening under the
// carapace. Half widths by distance behind the tip.
const HEAD: Pt[] = [
  [0, 0], [0.7, 2.4], [2, 4], [4, 5.3], [6.5, 6.1], [9, 6.2], [11.5, 5.4], [13.5, 4.8], [16, 5.4], [19, 7], [22, 8.8],
  [26, 10],
]
/** The seams between the large scales of the crown: two pairs of prefrontals, the frontal, the rest behind. */
const CROWN: Pt[][] = [
  [[3.4, -3.4], [3.4, 3.4]], [[1, 0], [5.8, 0]], [[5.8, 0], [8.8, 3.6]], [[5.8, 0], [8.8, -3.6]],
  [[8.8, -4.8], [8.8, 4.8]],
]
/** Where the neck meets the shoulders: the head swings about here when it leads into a turn. */
const NECK = 26

// THE FLIPPERS. Front: 0.42 L long, rooted at the shoulder just behind the head, under the edge of the shell. Half
// width along them (the leading edge is the thinner side), by share of the length from the root.
const FLIP = 0.42 * L
const SHOULDER: Pt = [27, 24]
const FLIP_W: Pt[] = [[0, 7], [0.12, 8], [0.3, 7.8], [0.55, 6.6], [0.78, 4.9], [0.9, 3.2], [0.97, 1.6], [1, 0.5]]
// Rear: small rounded paddles at the back of the carapace, a fifth of the body long.
const REAR = 0.17 * L
const REAR_ROOT: Pt = [78, 13]
const REAR_W: Pt[] = [[0, 5], [0.25, 6], [0.6, 5], [0.85, 3], [1, 0.8]]

// THE STROKE, for each front flipper, by phase of the stroke: [phase, value, slope per phase]. The sweep is in radians
// from straight out to the side, forward positive; the lift is how far it is raised above (positive) or sunk below the
// plane of the shell. Down and back with power (0 to 0.38, as the sea speeds the turtle up), held swept back along the
// flank to glide (0.38 to 0.62), then up and forward again.
type Key = [number, number, number]
const SWEEP: Key[] = [
  [0, 0.66, 0], [0.18, -0.12, -5], [0.38, -0.7, -0.6], [0.5, -0.78, 0], [0.62, -0.75, 0.5], [0.82, -0.2, 4.5],
]
const LIFT: Key[] = [[0, 0.9, 0], [0.18, 0, -5], [0.38, -0.45, 0], [0.62, -0.12, 0.5], [0.82, 0.5, 3.5]]
/** The pose held in a glide, which the inside flipper in a turn eases toward. */
const GLIDE = { sweep: -0.75, lift: -0.1 }
/** A smooth loop through the keys: a cubic through each pair, with each key's own slope. */
function ride(keys: Key[], phase: number): number {
  const p = phase - Math.floor(phase)
  let i = 0
  while (i + 1 < keys.length && keys[i + 1]![0] <= p) i += 1
  const [t0, v0, m0] = keys[i]!
  const [next, v1, m1] = keys[(i + 1) % keys.length]!
  const h = next + (i + 1 >= keys.length ? 1 : 0) - t0
  const x = (p - t0) / h
  const [x2, x3] = [x * x, x * x * x]
  return (2 * x3 - 3 * x2 + 1) * v0 + (x3 - 2 * x2 + x) * h * m0 + (3 * x2 - 2 * x3) * v1 + (x3 - x2) * h * m1
}

/** A green sea turtle, seen from above. */
export function drawTurtle(ctx: Ctx, a: Animal, tile: number): void {
  // In the mosaic a tile is ten units: streaks, ticks and scale lines would only make its colours flicker.
  const fine = tile === 0
  const f = poseOf(a)
  const phase = strokes(a) % 1
  // How hard it is turning, -1 to 1 for the tightest circle it makes; positive toward the clockwise side.
  const turn = clamp(a.curve * L * turtle.turn, -1.3, 1.3)
  const P = (b: number, y: number): Pt => at(f, -b, y)
  const line = (pts: Pt[]): void => {
    pts.forEach(([b, y], i) => (i === 0 ? ctx.moveTo(...P(b, y)) : ctx.lineTo(...P(b, y))))
  }

  /** A smooth closed curve whose corners are `pts`. */
  const blob = (pts: Pt[]): void => {
    const mid = (i: number): Pt => {
      const [b0, y0] = pts[i % pts.length]!
      const [b1, y1] = pts[(i + 1) % pts.length]!
      return [(b0 + b1) / 2, (y0 + y1) / 2]
    }
    ctx.beginPath()
    ctx.moveTo(...P(...mid(pts.length - 1)))
    pts.forEach(([b, y], i) => ctx.quadraticCurveTo(...P(b, y), ...P(...mid(i))))
    ctx.closePath()
  }
  const trace = (pts: Pt[]): void => {
    ctx.beginPath()
    line(pts)
    ctx.closePath()
  }
  /** Fills the path as scaly skin: dark scales, pale edges. */
  const skin = (): void => {
    ctx.fillStyle = SKIN.scale
    ctx.fill()
    ctx.lineWidth = 0.9
    ctx.lineJoin = 'round'
    ctx.strokeStyle = SKIN.edge
    ctx.stroke()
  }

  // The tail, a short stub between the rear flippers.
  blob([[84, 2.6], [89, 2.2], [92.5, 0.9], [92.5, -0.9], [89, -2.2], [84, -2.6]])
  skin()

  // The rear flippers hardly beat; they steer. Turning, the one on the inside of the turn swings out and the other in,
  // both trailing edges to the same side, as a rudder.
  for (const side of [1, -1]) {
    const angle = clamp(0.42 + side * 0.45 * turn + 0.05 * Math.sin(2 * Math.PI * (phase + 0.1)), 0.1, 1)
    const [sin, cos] = [Math.sin(angle), Math.cos(angle)]
    const one: Pt[] = []
    const other: Pt[] = []
    for (let i = 0; i <= 8; i += 1) {
      const s = i / 8
      const h = table(REAR_W, s)
      const b = REAR_ROOT[0] + cos * REAR * s
      const y = side * (REAR_ROOT[1] + sin * REAR * s)
      one.push([b - side * sin * h, y + cos * h])
      other.unshift([b + side * sin * h, y - cos * h])
    }
    blob([...one, ...other])
    skin()
  }

  // The head and neck, swinging into a turn; the neck stretches the head forward as the power stroke pulls.
  const reach = 1.2 * Math.sin(2 * Math.PI * (phase + 0.05))
  const yaw = 0.2 * turn
  const swing = (b: number, y: number): Pt => {
    const ahead = NECK - b + reach
    return [NECK - (ahead * Math.cos(yaw) - y * Math.sin(yaw)), ahead * Math.sin(yaw) + y * Math.cos(yaw)]
  }
  blob([...HEAD.map(([b, h]) => swing(b, h)), ...HEAD.slice(1, -1).reverse().map(([b, h]) => swing(b, -h))])
  skin()
  // The large scales of the crown, and an eye at each side.
  if (fine) {
    ctx.strokeStyle = SKIN.seam
    ctx.lineWidth = 0.8
    ctx.beginPath()
    for (const seam of CROWN) line(seam.map(([b, y]) => swing(b, y)))
    ctx.stroke()
  }
  ctx.fillStyle = EYE
  for (const side of [1, -1]) {
    ctx.beginPath()
    ctx.arc(...P(...swing(6.4, side * 5)), 1.15, 0, Math.PI * 2)
    ctx.fill()
  }

  // The front flippers, the wings it flies with. They beat together; in a turn the one on the inside is held back.
  const rate = (ride(SWEEP, phase + 0.01) - ride(SWEEP, phase - 0.01)) / 0.02
  for (const side of [1, -1]) {
    const hold = side * turn > 0 ? clamp(0.4 * Math.abs(turn), 0, 0.5) : 0
    const sweep = ride(SWEEP, phase) * (1 - hold) + GLIDE.sweep * hold
    const lift = ride(LIFT, phase) * (1 - hold) + GLIDE.lift * hold
    // The tip lags behind the root through the sweep, so the blade bends against the water.
    const bend = -0.06 * rate * (1 - hold)
    // Seen from above, a raised or sunk flipper is shorter, and a little narrower.
    const span = FLIP * Math.cos(lift)
    const chord = 1 - 0.2 * Math.abs(Math.sin(lift))
    const N = 14
    const lead: Pt[] = []
    const trail: Pt[] = []
    const dir: Pt[] = []
    let [b, y] = [SHOULDER[0], side * SHOULDER[1]]
    for (let i = 0; i <= N; i += 1) {
      const s = i / N
      // A blade curved back at the tip even at rest.
      const angle = sweep + bend * (Math.pow(s, 1.5) - 0.4) - 0.25 * Math.pow(s, 1.5)
      const [nb, ny] = [-Math.cos(angle), -side * Math.sin(angle)]
      const h = table(FLIP_W, s) * chord
      lead.push([b + nb * h * 0.82, y + ny * h * 0.82])
      trail.push([b - nb * h * 1.18, y - ny * h * 1.18])
      dir.push([-Math.sin(angle), side * Math.cos(angle)])
      b += (dir[i]![0] * span) / N
      y += (dir[i]![1] * span) / N
    }
    blob([...lead, ...[...trail].reverse()])
    skin()
    if (!fine) continue
    // Large scales across the blade, and the one claw near the leading edge, pointing forward and out.
    ctx.strokeStyle = SKIN.seam
    ctx.lineWidth = 0.8
    ctx.beginPath()
    for (const [i, share] of [[3, 0.7], [6, 0.8], [9, 0.75], [12, 0.7]] as Pt[]) {
      const [lb, ly] = lead[i]!
      const [tb, ty] = trail[i]!
      line([[lb, ly], [lb + (tb - lb) * share, ly + (ty - ly) * share]])
    }
    ctx.stroke()
    const [cb, cy] = lead[10]!
    const out = trail[10]!
    ctx.strokeStyle = SKIN.claw
    ctx.lineWidth = 1.6
    ctx.lineCap = 'round'
    ctx.beginPath()
    line([[cb, cy], [cb + dir[10]![0] * 2.2 + (cb - out[0]) * 0.1, cy + dir[10]![1] * 2.2 + (cy - out[1]) * 0.1]])
    ctx.stroke()
    ctx.lineCap = 'butt'
  }

  // The carapace, over the roots of the flippers and the neck: each scute lighter at its middle with streaks running
  // out from it, the seams, and the marginals in a band round the rim.
  ctx.save()
  trace(contour)
  ctx.clip()
  ctx.fillStyle = SHELL.ring
  ctx.fill()
  for (const s of scutes) {
    trace(s.pts)
    const [cx, cy] = P(...s.c)
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, s.r * 1.1)
    grad.addColorStop(0, SHELL.centre)
    grad.addColorStop(1, SHELL.base)
    ctx.fillStyle = grad
    ctx.fill()
    if (!fine) continue
    ctx.save()
    ctx.clip()
    for (const ray of s.rays) {
      trace(ray.tri)
      ctx.fillStyle = ray.dark ? STREAK.dark : STREAK.pale
      ctx.fill()
    }
    ctx.restore()
  }
  ctx.lineWidth = 0.9
  ctx.lineJoin = 'round'
  ctx.strokeStyle = SHELL.seam
  ctx.beginPath()
  for (const s of scutes) {
    line(s.pts)
    ctx.closePath()
  }
  ctx.stroke()
  // The band of marginals over the ends of the scutes, with a seam along its inner edge.
  trace(contour)
  ctx.lineWidth = RING * 2 + 1.2
  ctx.stroke()
  ctx.lineWidth = RING * 2
  ctx.strokeStyle = SHELL.ring
  ctx.stroke()
  if (fine) {
    ctx.lineWidth = 0.9
    ctx.strokeStyle = SHELL.seam
    ctx.beginPath()
    for (const tick of ticks) line(tick)
    ctx.stroke()
  }
  ctx.restore()
  trace(contour)
  ctx.lineWidth = 1.4
  ctx.strokeStyle = SHELL.seam
  ctx.stroke()
}
