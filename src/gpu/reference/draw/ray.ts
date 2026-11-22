// The oceanic manta from above: a rigid rhomboid disc whose wings beat slowly, a whip tail behind. The beat is a wave
// that runs out along each wing and back across it, so the tip lags the root and the outline curls; from above, a wing
// raised or lowered is shorter by the cosine of its angle. In a turn it banks: the inner wing dips, the outer rises.
// Dorsal colours: black with two pale shoulder patches, grey toward their ends and along the rear margins.

import { KINDS, poseOf, spineOf, strokes, type Animal, type Frame } from '../sim.ts'
import { EYE, at, type Ctx } from './common.ts'

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

/** A smooth curve through the points (Catmull-Rom), `n` steps between each. */
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

// A white shoulder patch (the right one): a hooked triangle just behind the head, its front edge across the shoulders,
// its hook out toward the wing, its inner edge a narrow dark strip from the midline.
const PATCH = smooth([[10, 50], [40, 48.5], [66, 52.5], [87, 66], [70, 84], [40, 108], [10, 126], [9, 88], [10, 50]], 4)

/** How far a wing is from flat (radians) a share `r` of the way out and `back` units behind the front tips: the wave of
 * the beat, growing toward the tip, later out and back; the body's roll lowers the inner wing and lifts the outer. */
function tilt(r: number, back: number, side: number, phase: number, roll: number): number {
  const wave = Math.cos(2 * Math.PI * (phase - LAG_OUT * r - (LAG_BACK * back) / 200))
  return AMP * Math.min(1, r / 0.25) * (0.5 + 0.5 * r) * wave - side * roll
}

/** How far out a point of the disc (`out` and `back` with the wings flat) lies now: its width foreshortened by the
 * wing's angle all the way out. `side` is +1 for the right wing. */
function reach(out: number, back: number, side: number, phase: number, roll: number): number {
  const steps = Math.max(1, Math.ceil(out / 8))
  const d = out / steps
  let y = 0
  for (let i = 0; i < steps; i += 1) y += d * Math.cos(tilt(((i + 0.5) * d) / HALF, back, side, phase, roll))
  return y
}

/** A manta, its disc rigid and its wings beating, seen from above. */
export function drawRay(ctx: Ctx, a: Animal, tile: number): void {
  void tile
  const k = KINDS[a.kind]!
  const pose = poseOf(a)
  const frames = spineOf(a)
  const phase = strokes(a) % 1
  // Banking: up to about 17 degrees in the tightest turn (a curve of 1 / 197 a unit); the inner wing is on the side
  // the curve is toward.
  const roll = Math.max(-0.3, Math.min(0.3, a.curve * 60))
  const sx = k.girth / HALF
  const sy = k.length / LENGTH
  const place = (out: number, back: number, side: number): P =>
    at(pose, -back * sy, side * reach(out, back, side, phase, roll) * sx)
  const trace = (pts: P[]): void => pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)))
  const right = RIGHT.map(([o, b]) => place(o, b, 1))
  const left = RIGHT.map(([o, b]) => place(o, b, -1))
  const disc = (): void => {
    ctx.beginPath()
    trace([...right, ...[...left].reverse()])
    ctx.closePath()
  }
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'

  // The tail: the trail's shape from the disc's rear on, turned and moved to hang from the disc's axis, so it leaves
  // the rigid disc cleanly even where the trail has bent away; a slight ripple on top of the sim's sway.
  const behind = (f: Frame): number => f.u * k.length
  const tail = frames.filter(f => behind(f) >= ROOT * sy - 0.01)
  const first = tail[0]
  if (first !== undefined && tail.length > 3) {
    const cos = first.fx * pose.fx + first.fy * pose.fy
    const sin = first.fx * pose.fy - first.fy * pose.fx
    const [rx, ry] = at(pose, -ROOT * sy, 0)
    const span = behind(tail[tail.length - 1]!) - behind(first)
    const spine = tail.map((f): [number, number, number] => {
      const [dx, dy] = [f.x - first.x, f.y - first.y]
      const [hx, hy] = [cos * f.fx - sin * f.fy, sin * f.fx + cos * f.fy]
      const t = (behind(f) - behind(first)) / span
      const ripple = 3.5 * Math.pow(t, 1.5) * Math.sin(2 * Math.PI * (phase - 0.6 * t))
      return [rx + cos * dx - sin * dy - hy * ripple, ry + sin * dx + cos * dy + hx * ripple, t]
    })
    // A whip, tapering from the width of the root to a thread.
    const edge = (side: number): P[] =>
      spine.map(([x, y, t], i) => {
        const [x0, y0] = spine[Math.max(0, i - 1)]!
        const [x1, y1] = spine[Math.min(spine.length - 1, i + 1)]!
        const l = Math.hypot(x1 - x0, y1 - y0) || 1
        const w = side * (0.9 + 4.4 * Math.pow(1 - t, 1.1))
        return [x - ((y1 - y0) / l) * w, y + ((x1 - x0) / l) * w]
      })
    ctx.beginPath()
    trace([...edge(1), ...edge(-1).reverse()])
    ctx.closePath()
    ctx.fillStyle = '#272b2f'
    ctx.fill()
  }

  // The disc: black, a little paler along the back where the body is thickest.
  const dome = ctx.createLinearGradient(...at(pose, -90, -HALF * sx), ...at(pose, -90, HALF * sx))
  dome.addColorStop(0, '#202327')
  dome.addColorStop(0.5, '#2a2e33')
  dome.addColorStop(1, '#202327')
  disc()
  ctx.fillStyle = BODY
  ctx.fill()
  ctx.fillStyle = dome
  ctx.fill()

  ctx.save()
  disc()
  ctx.clip()
  // The rear margins are pale grey, fading in.
  for (const [width, alpha] of [[16, 0.12], [8, 0.18], [3.5, 0.3]] as const) {
    ctx.lineWidth = width
    ctx.strokeStyle = `rgba(139, 148, 154, ${alpha})`
    ctx.beginPath()
    trace(right.slice(-TRAIL.length))
    trace(left.slice(-TRAIL.length))
    ctx.stroke()
  }
  // The shoulder patches: pale by the midline, blending to grey toward the hooked ends. Not white: by day, white came
  // out as pale as the water, and as the manta moved its middle tiles flicked between the body and holes in it.
  for (const side of [1, -1]) {
    const grad = ctx.createLinearGradient(...place(10, 60, side), ...place(88, 70, side))
    grad.addColorStop(0, '#b4babb')
    grad.addColorStop(0.55, '#9aa1a3')
    grad.addColorStop(1, '#6d757a')
    ctx.beginPath()
    trace(PATCH.map(([o, b]) => place(o, b, side)))
    ctx.closePath()
    ctx.fillStyle = grad
    ctx.fill()
  }
  // A wing tilted from the flat catches a little more of the light from above: a sheen runs out along each wing as it
  // beats, and lies on the inner wing in a bank.
  for (const side of [1, -1]) {
    const tip = reach(HALF, 90, side, phase, roll)
    const sheen = ctx.createLinearGradient(...at(pose, -90 * sy, 0), ...at(pose, -90 * sy, side * tip * sx))
    for (let i = 0; i <= 8; i += 1) {
      const out = reach((i / 8) * HALF, 90, side, phase, roll)
      const alpha = 0.2 * Math.abs(Math.sin(tilt(i / 8, 90, side, phase, roll)))
      sheen.addColorStop(out / tip, `rgba(150, 168, 184, ${alpha})`)
    }
    ctx.beginPath()
    trace([at(pose, 50, 0), at(pose, -250, 0), at(pose, -250, side * 300), at(pose, 50, side * 300)])
    ctx.closePath()
    ctx.fillStyle = sheen
    ctx.fill()
  }
  // The mouth: a dark line along the flat front, between the cephalic fins.
  ctx.beginPath()
  const front = [...left.slice(0, HEAD.length).reverse(), ...right.slice(1, HEAD.length)]
  trace(front.map(([x, y]): P => [x - pose.fx * 4, y - pose.fy * 4]))
  ctx.lineWidth = 2.2
  ctx.strokeStyle = 'rgba(14, 16, 18, 0.55)'
  ctx.stroke()
  ctx.restore()

  // The edge, a little lighter than the body so the silhouette reads on the dark sea.
  disc()
  ctx.lineWidth = 1.8
  ctx.strokeStyle = EDGE
  ctx.stroke()

  // The small dorsal fin at the tail's base: a dark ridge along the midline.
  ctx.beginPath()
  ctx.moveTo(...at(pose, -172 * sy, 0))
  ctx.quadraticCurveTo(...at(pose, -182 * sy, 3.6), ...at(pose, -198 * sy, 0))
  ctx.quadraticCurveTo(...at(pose, -182 * sy, -3.6), ...at(pose, -172 * sy, 0))
  ctx.fillStyle = '#1b1d20'
  ctx.fill()

  // The eyes: small bumps on the sides of the head, just behind the cephalic fins.
  for (const side of [1, -1]) {
    const [x, y] = place(57, 33, side)
    ctx.beginPath()
    ctx.arc(x, y, 4.6, 0, Math.PI * 2)
    ctx.fillStyle = '#2d3136'
    ctx.fill()
    ctx.lineWidth = 1.2
    ctx.strokeStyle = EDGE
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(x, y, 2, 0, Math.PI * 2)
    ctx.fillStyle = EYE
    ctx.fill()
  }
}
