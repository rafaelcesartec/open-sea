// Sharks from above: a body that sways side to side along its spine, the tall tail fin seen edge on, pectoral and
// pelvic fins, the first dorsal as a dark ridge, the eyes; a hammerhead's cephalofoil, a tiger's bars, a blacktip's
// black fin tips. Colours are the real dorsal colours, dark along the back and paler toward the flanks.

import { KINDS, spineOf, type Animal, type Frame } from '../sim.ts'
import { EYE, at, near as nearest, outline, type Ctx } from './common.ts'

type Look = { fringe: string; flank: string; back: string; bar?: string; tips?: string; spots?: string }

const LOOKS: Record<string, Look> = {
  // Great white: slate grey above, sometimes a little brown.
  white: { fringe: '#474e53', flank: '#7b8388', back: '#5c6469' },
  // Great hammerhead: light grey-brown to olive above.
  hammer: { fringe: '#55544b', flank: '#88877a', back: '#6c6b61' },
  // Tiger: grey-green above with dark bars, fading with age.
  tiger: { fringe: '#4a524d', flank: '#7b8580', back: '#5d6660', bar: '#363d38' },
  // Blacktip: bronze grey above; black tips on the fins.
  blacktip: { fringe: '#57544b', flank: '#8b877b', back: '#6e6a5f', tips: '#1a1b1d' },
  // Whale shark: dark blue-grey, its back and sides dotted with pale spots, paler below.
  whaleshark: { fringe: '#2e3d48', flank: '#6b7d88', back: '#3d4e5a', spots: '#dfe7ea' },
}

/** A pair of fins swept back from frame `f`: `reach` out, rooted along `root` units of the flank. */
function fins(ctx: Ctx, look: Look, f: Frame, reach: number, root: number): void {
  for (const side of [-1, 1]) {
    const w = f.w
    const p = (a: number, b: number): [number, number] => at(f, a, side * b)
    ctx.beginPath()
    ctx.moveTo(...p(root * 0.5, w * 0.8))
    ctx.quadraticCurveTo(...p(-reach * 0.05, w + reach * 0.5), ...p(-reach * 0.62, w + reach * 0.72))
    ctx.quadraticCurveTo(...p(-reach * 0.32, w + reach * 0.3), ...p(-root * 0.5, w * 0.8))
    ctx.closePath()
    ctx.fillStyle = look.back
    ctx.fill()
    if (look.tips !== undefined) {
      ctx.beginPath()
      ctx.arc(...p(-reach * 0.56, w + reach * 0.64), reach * 0.12, 0, Math.PI * 2)
      ctx.fillStyle = look.tips
      ctx.fill()
    }
  }
}

/** A shark, swaying side to side, seen from above. */
export function drawShark(ctx: Ctx, s: Animal, tile: number): void {
  void tile
  const k = KINDS[s.kind]!
  const look = LOOKS[k.name]!
  const frames = spineOf(s)
  if (frames.length < 3) return
  const L = k.length
  const near = (u: number): Frame => nearest(frames, u)

  // The tail fin from above: the tall caudal fin seen edge on, a narrow blade swept by the last of the sway. As the
  // tail bends (a beat, a turn) the fin rolls, and a long shark's fin is tall enough to show both lobes apart: the
  // upper one out to one side, the shorter lower one to the other. A small shark's short fin stays a single point.
  const last = frames[frames.length - 1]!
  const stock = last.w
  const blade = L * (1 - k.trunk)
  const before = near(k.trunk - 0.18)
  const bend = Math.atan2(before.fx * last.fy - before.fy * last.fx, before.fx * last.fx + before.fy * last.fy)
  const tall = Math.min(1, Math.max(0, (L - 230) / 120))
  const roll = Math.sin(Math.max(-0.9, Math.min(0.9, bend * 1.6)) * tall)
  const lobe = (along: number, out: number, thick: number): void => {
    const l = Math.hypot(along, out)
    const [da, db] = [along / l, out / l]
    const p = (s: number, w: number): [number, number] => at(last, da * s - db * w, db * s + da * w)
    ctx.beginPath()
    ctx.moveTo(...p(-2, -stock))
    ctx.bezierCurveTo(...p(l * 0.3, -thick * 1.7), ...p(l * 0.75, -thick * 0.9), ...p(l, 0))
    ctx.bezierCurveTo(...p(l * 0.75, thick * 0.9), ...p(l * 0.3, thick * 1.7), ...p(-2, stock))
    ctx.closePath()
    ctx.fillStyle = look.fringe
    ctx.fill()
  }
  lobe(-blade, roll * blade * 0.9, stock)
  if (roll !== 0) lobe(-blade * 0.7, -roll * blade * 0.6, stock * 0.8)

  // Fins under the body: the pectorals at the shoulder, the small pelvics further back.
  fins(ctx, look, near(0.27), k.fin, L * 0.07)
  fins(ctx, look, near(0.6), k.fin * 0.3, L * 0.03)

  // The body: the flank with a fine dark edge, then the darker back along the middle (sharks are countershaded:
  // dark above, paler toward the belly at the sides).
  outline(ctx, frames, 1)
  ctx.fillStyle = look.flank
  ctx.fill()
  ctx.lineWidth = 1.6
  ctx.strokeStyle = look.fringe
  ctx.stroke()
  outline(ctx, frames, 0.6)
  ctx.fillStyle = look.back
  ctx.fill()

  // A whale shark's spots: over the back and the flanks, pale, scattered by a fixed pattern so they stay put.
  if (look.spots !== undefined && tile === 0) {
    ctx.fillStyle = look.spots
    ctx.beginPath()
    for (let i = 0; i < frames.length; i += 1) {
      const f = frames[i]!
      for (let j = 0; j < 5; j += 1) {
        const r = Math.sin(i * 12.9898 + j * 78.233) * 43758.5453
        const u = r - Math.floor(r)
        const [x, y] = at(f, 0, (j % 2 === 0 ? -1 : 1) * f.w * (0.15 + 0.7 * u))
        ctx.moveTo(x + 1.6, y)
        ctx.arc(x, y, 1.1 + u * 0.9, 0, Math.PI * 2)
      }
    }
    ctx.fill()
  }

  // A tiger's bars across the back.
  if (look.bar !== undefined) {
    ctx.strokeStyle = look.bar
    ctx.lineWidth = 3
    ctx.lineCap = 'round'
    ctx.beginPath()
    for (const f of frames) {
      if (f.u < 0.22 || f.u > 0.72 || Math.abs((f.u * L) % 26) > 2.6) continue
      ctx.moveTo(...at(f, 0, f.w * 0.7))
      ctx.lineTo(...at(f, 0, -f.w * 0.7))
    }
    ctx.stroke()
  }

  // The first dorsal fin from above: a dark ridge along the back.
  const dorsal = near(0.4)
  ctx.strokeStyle = look.tips ?? look.fringe
  ctx.lineWidth = Math.max(2, k.girth * 0.13)
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(...at(dorsal, L * 0.04, 0))
  ctx.lineTo(...at(dorsal, -L * 0.07, 0))
  ctx.stroke()

  const head = frames[0]!
  ctx.fillStyle = EYE
  if (k.hammer === true) {
    // The cephalofoil: a flat wing across the head, a quarter of the body long and narrow front to back, its front
    // edge gently curved, its rear edge running almost straight out to the sides, an eye at each rounded end.
    const span = L * 0.13
    const deep = L * 0.028
    const neck = near(0.06).w
    const side: [number, number][] = [
      [1.3 * deep, 0], [1.25 * deep, 0.25 * span], [1.1 * deep, 0.5 * span], [0.85 * deep, 0.75 * span], [0.6 * deep, 0.9 * span],
      [0.3 * deep, 0.98 * span], [-0.1 * deep, span], [-0.5 * deep, 0.99 * span], [-0.8 * deep, 0.93 * span], [-0.95 * deep, 0.82 * span],
      [-1.02 * deep, 0.6 * span], [-1.08 * deep, Math.max(neck * 1.45, 0.38 * span)], [-1.3 * deep, neck * 1.15], [-1.8 * deep, neck * 1.03], [-2.6 * deep, neck],
    ]
    const pts = [...side, ...side.slice(1).reverse().map(([a, b]): [number, number] => [a, -b])]
    ctx.beginPath()
    pts.forEach(([a, b], i) => (i === 0 ? ctx.moveTo(...at(head, a, b)) : ctx.lineTo(...at(head, a, b))))
    ctx.closePath()
    ctx.fillStyle = look.back
    ctx.fill()
    ctx.strokeStyle = look.fringe
    ctx.lineWidth = 1.6
    ctx.stroke()
    ctx.fillStyle = EYE
    for (const b of [-1, 1]) {
      ctx.beginPath()
      ctx.arc(...at(head, -deep * 0.15, b * span * 0.93), 1.8, 0, Math.PI * 2)
      ctx.fill()
    }
  } else {
    // The eyes, just behind the snout on either side.
    const eye = near(0.06)
    for (const b of [-1, 1]) {
      ctx.beginPath()
      ctx.arc(...at(eye, 0, b * eye.w * 0.78), 1.5, 0, Math.PI * 2)
      ctx.fill()
    }
  }
}
