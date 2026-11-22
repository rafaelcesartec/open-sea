// The pen that draws on the GPU. A drawing's paths are written down as it makes them and flattened, in the target's
// pixels, when it fills or strokes them. Each fill and stroke becomes triangles that count its coverage into the
// stencil (a fan from each subpath's first point: winding, as the canvas's nonzero rule; or a stroke's quads, joins
// and caps, every one counted the same way), then a quad over its box that paints where the stencil says it is in, in
// its colour or gradient, and clears the count.
// The stencil's top bit is the clip: set where drawing may happen, cut down by each clip() and set again on restore.
//
// BATCHES: a fill only waits for the ones before it that it overlaps. Each is put one level above the highest of
// those, so fills that do not touch (a school's fish) share a level, and a level is drawn as one stencil draw and one
// cover draw: a whole school in a handful of draws instead of a thousand.
//
// Nothing here allocates once made: every path, gradient, op and vertex lives in arrays made at the start, reset each
// frame. Running out of room drops what does not fit (counted in `dropped`) rather than growing.

import type { Grad, Pen, Shape, Style } from './pen.ts'

export const OP_SCISSOR = 1
export const OP_FILL = 2
export const OP_STROKE = 3
export const OP_COVER = 4
export const OP_CLIP = 5
export const OP_RESET = 6
export const OP_QUAD = 7

/** Floats a cover instance takes: box (4), straight colour (4), gradient, animal, alpha, extra (4). */
export const COVER = 12
/** Floats a gradient takes: geometry (4), type and stops count (4), 12 colours (48), 12 offsets (12). */
export const GRAD = 68
const STOPS = 12
/** Floats an animal's paint takes: tint and caustics (4), the deep colour (4), pixel to sea (4). */
export const BEAST = 12

const VERTS = 1 << 20
const ITEMS = 1 << 14
const TOL = 0.2

/** Ops for one render pass: [op, a, b, c, d] each. */
export class Ops {
  readonly a = new Int32Array(5 * 32768)
  n = 0
  push(op: number, a: number, b: number, c: number, d: number): void {
    if (this.n * 5 + 5 > this.a.length) return
    const i = this.n * 5
    this.a[i] = op
    this.a[i + 1] = a
    this.a[i + 2] = b
    this.a[i + 3] = c
    this.a[i + 4] = d
    this.n += 1
  }
}

/**
 * A path. Its methods only write down what they are told, in sea units (`cmd`), so they are small enough for V8 to
 * inline into the drawings: a number passed to a call it does not inline is boxed, an allocation. A fill or stroke
 * then flattens it once, here, into subpaths of points in the target's pixels, and its box.
 */
export class Path implements Shape {
  readonly cmd: Float64Array
  cn = 0
  /** cmd changed since it was flattened. */
  dirty = false
  readonly x: Float32Array
  readonly y: Float32Array
  readonly start = new Int32Array(4096)
  readonly closed = new Uint8Array(4096)
  n = 0
  subs = 0
  x0 = Infinity
  y0 = Infinity
  x1 = -Infinity
  y1 = -Infinity
  pen: GpuPen
  // Flattening's state, as fields so its steps pass no numbers.
  private open = false
  private closedLast = false
  private lastX = 0.5
  private lastY = 0.5
  private px = 0.5
  private py = 0.5
  constructor(pen: GpuPen, size: number) {
    this.pen = pen
    this.cmd = new Float64Array(size * 2)
    this.x = new Float32Array(size)
    this.y = new Float32Array(size)
  }
  reset(): void {
    this.cn = 0
    this.dirty = true
  }
  moveTo(x: number, y: number): void {
    const c = this.cmd
    const n = this.cn
    if (n + 9 > c.length) return
    c[n] = 1
    c[n + 1] = x
    c[n + 2] = y
    this.cn = n + 3
    this.dirty = true
  }
  lineTo(x: number, y: number): void {
    const c = this.cmd
    const n = this.cn
    if (n + 9 > c.length) return
    c[n] = 2
    c[n + 1] = x
    c[n + 2] = y
    this.cn = n + 3
    this.dirty = true
  }
  quadraticCurveTo(cx: number, cy: number, x: number, y: number): void {
    const c = this.cmd
    const n = this.cn
    if (n + 9 > c.length) return
    c[n] = 3
    c[n + 1] = cx
    c[n + 2] = cy
    c[n + 3] = x
    c[n + 4] = y
    this.cn = n + 5
    this.dirty = true
  }
  bezierCurveTo(c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number): void {
    const c = this.cmd
    const n = this.cn
    if (n + 9 > c.length) return
    c[n] = 4
    c[n + 1] = c1x
    c[n + 2] = c1y
    c[n + 3] = c2x
    c[n + 4] = c2y
    c[n + 5] = x
    c[n + 6] = y
    this.cn = n + 7
    this.dirty = true
  }
  closePath(): void {
    const n = this.cn
    if (n + 9 > this.cmd.length) return
    this.cmd[n] = 5
    this.cn = n + 1
    this.dirty = true
  }
  arc(x: number, y: number, r: number, a0: number, a1: number, ccw = false): void {
    this.ellipse(x, y, r, r, 0, a0, a1, ccw)
  }
  ellipse(x: number, y: number, rx: number, ry: number, rot: number, a0: number, a1: number, ccw = false): void {
    const c = this.cmd
    const n = this.cn
    if (n + 9 > c.length) return
    c[n] = 6
    c[n + 1] = x
    c[n + 2] = y
    c[n + 3] = rx
    c[n + 4] = ry
    c[n + 5] = rot
    c[n + 6] = a0
    c[n + 7] = a1
    c[n + 8] = ccw ? 1 : 0
    this.cn = n + 9
    this.dirty = true
  }

  /** Adds (px, py). */
  private put(): void {
    const n = this.n
    if (n >= this.x.length) {
      this.pen.dropped += 1
      return
    }
    const x = this.px
    const y = this.py
    this.x[n] = x
    this.y[n] = y
    this.n = n + 1
    if (x < this.x0) this.x0 = x
    if (x > this.x1) this.x1 = x
    if (y < this.y0) this.y0 = y
    if (y > this.y1) this.y1 = y
  }
  /** Starts a subpath at (px, py). */
  private mv(): void {
    this.closedLast = false
    if (this.subs >= this.start.length) {
      this.pen.dropped += 1
      return
    }
    this.start[this.subs] = this.n
    this.closed[this.subs] = 0
    this.subs += 1
    this.open = true
    this.put()
  }
  /** After a closePath, the next segment starts a new subpath where the closed one began, as the canvas does. */
  private reopen(): boolean {
    if (!this.closedLast) return false
    const x = this.px
    const y = this.py
    this.px = this.lastX
    this.py = this.lastY
    this.mv()
    this.px = x
    this.py = y
    return true
  }

  /** The commands as points in the target's pixels, through the pen's transform (the canvas's setTransform(k, 0, 0,
   * k, tx, ty)), as the canvas flattens them; a command with a number that is not finite is left out, as there. */
  flatten(): void {
    if (!this.dirty) return
    this.dirty = false
    this.n = 0
    this.subs = 0
    this.open = false
    this.closedLast = false
    this.x0 = this.y0 = Infinity
    this.x1 = this.y1 = -Infinity
    const c = this.cmd
    const k = this.pen.k
    const tx = this.pen.tx
    const ty = this.pen.ty
    let i = 0
    while (i < this.cn) {
      const op = c[i]!
      if (op === 1 || op === 2) {
        const x = c[i + 1]!
        const y = c[i + 2]!
        i += 3
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue
        this.px = k * x + tx
        this.py = k * y + ty
        if (op === 1) this.mv()
        else if (!this.open && !this.reopen()) this.mv()
        else this.put()
      } else if (op === 3) {
        const qx = k * c[i + 1]! + tx
        const qy = k * c[i + 2]! + ty
        const ex = k * c[i + 3]! + tx
        const ey = k * c[i + 4]! + ty
        i += 5
        if (!Number.isFinite(qx + qy + ex + ey)) continue
        if (!this.open) {
          this.px = qx
          this.py = qy
          if (!this.reopen()) this.mv()
        }
        const sx = this.x[this.n - 1]!
        const sy = this.y[this.n - 1]!
        const ddx = sx - 2 * qx + ex
        const ddy = sy - 2 * qy + ey
        const dd = Math.sqrt(ddx * ddx + ddy * ddy)
        const steps = Math.min(64, Math.max(1, Math.ceil(Math.sqrt(dd / (8 * TOL)))))
        for (let j = 1; j <= steps; j += 1) {
          const t = j / steps
          const u = 1 - t
          this.px = u * u * sx + 2 * u * t * qx + t * t * ex
          this.py = u * u * sy + 2 * u * t * qy + t * t * ey
          this.put()
        }
      } else if (op === 4) {
        const ax = k * c[i + 1]! + tx
        const ay = k * c[i + 2]! + ty
        const bx = k * c[i + 3]! + tx
        const by = k * c[i + 4]! + ty
        const ex = k * c[i + 5]! + tx
        const ey = k * c[i + 6]! + ty
        i += 7
        if (!Number.isFinite(ax + ay + bx + by + ex + ey)) continue
        if (!this.open) {
          this.px = ax
          this.py = ay
          if (!this.reopen()) this.mv()
        }
        const sx = this.x[this.n - 1]!
        const sy = this.y[this.n - 1]!
        const d1x = sx - 2 * ax + bx
        const d1y = sy - 2 * ay + by
        const d2x = ax - 2 * bx + ex
        const d2y = ay - 2 * by + ey
        const dd = Math.sqrt(Math.max(d1x * d1x + d1y * d1y, d2x * d2x + d2y * d2y))
        const steps = Math.min(96, Math.max(1, Math.ceil(Math.sqrt((3 * dd) / (4 * TOL)))))
        for (let j = 1; j <= steps; j += 1) {
          const t = j / steps
          const u = 1 - t
          const a = u * u * u
          const b = 3 * u * u * t
          const cc = 3 * u * t * t
          const d = t * t * t
          this.px = a * sx + b * ax + cc * bx + d * ex
          this.py = a * sy + b * ay + cc * by + d * ey
          this.put()
        }
      } else if (op === 5) {
        i += 1
        if (this.subs === 0) continue
        this.closed[this.subs - 1] = 1
        // A new subpath from where this one began, as the canvas does; empty until something is added to it.
        this.open = false
        const s = this.start[this.subs - 1]!
        this.lastX = this.x[s]!
        this.lastY = this.y[s]!
        this.closedLast = true
      } else {
        const x = c[i + 1]!
        const y = c[i + 2]!
        const rx = c[i + 3]!
        const ry = c[i + 4]!
        const rot = c[i + 5]!
        const a0 = c[i + 6]!
        const a1 = c[i + 7]!
        const ccw = c[i + 8] === 1
        i += 9
        if (!Number.isFinite(x + y + rx + ry + rot + a0 + a1)) continue
        const TAU = Math.PI * 2
        const raw = a1 - a0
        const span = !ccw ? (raw >= TAU ? TAU : ((raw % TAU) + TAU) % TAU) : raw <= -TAU ? -TAU : -(((-raw % TAU) + TAU) % TAU)
        const cr = Math.cos(rot)
        const sr = Math.sin(rot)
        const r = Math.max(rx, ry) * k
        const dt = r > TOL ? 2 * Math.acos(1 - TOL / r) : Math.PI / 2
        const steps = Math.min(256, Math.max(8, Math.ceil(Math.abs(span) / dt)))
        for (let j = 0; j <= steps; j += 1) {
          const t = a0 + (span * j) / steps
          this.px = k * (x + cr * rx * Math.cos(t) - sr * ry * Math.sin(t)) + tx
          this.py = k * (y + sr * rx * Math.cos(t) + cr * ry * Math.sin(t)) + ty
          if (j === 0 && !this.open && !this.reopen()) this.mv()
          else this.put()
        }
      }
    }
  }
}

class GpuGrad implements Grad {
  type = 0
  g0 = 0
  g1 = 0
  g2 = 0
  g3 = 0
  n = 0
  readonly off = new Float32Array(STOPS)
  readonly col = new Float32Array(STOPS * 4)
  /** Where it is in the frame's gradient buffer, once written; -1 before. */
  slot = -1
  pen: GpuPen
  constructor(pen: GpuPen) {
    this.pen = pen
  }
  addColorStop(offset: number, color: string): void {
    const c = this.pen.colour(color)
    this.put(offset, c[0]!, c[1]!, c[2]!, c[3]!)
  }
  stop(offset: number, r: number, g: number, b: number, a: number): void {
    this.put(offset, r / 255, g / 255, b / 255, a)
  }
  /** Kept in order of offset, as the canvas sorts them (a later stop at the same offset comes after). */
  private put(offset: number, r: number, g: number, b: number, a: number): void {
    if (this.n >= STOPS) return
    let i = this.n
    while (i > 0 && this.off[i - 1]! > offset) {
      this.off[i] = this.off[i - 1]!
      for (let k = 0; k < 4; k += 1) this.col[i * 4 + k] = this.col[(i - 1) * 4 + k]!
      i -= 1
    }
    this.off[i] = offset
    this.col[i * 4] = r
    this.col[i * 4 + 1] = g
    this.col[i * 4 + 2] = b
    this.col[i * 4 + 3] = a
    this.n += 1
  }
}

type Saved = { fill: Style; stroke: Style; width: number; cap: string; join: string; alpha: number; clips: number }

/** The pen is also its own current path (the canvas's): a drawing's `ctx.moveTo` writes straight into it. */
export class GpuPen extends Path implements Pen {
  fillStyle: Style = '#000'
  strokeStyle: Style = '#000'
  lineWidth = 1
  lineCap = 'butt'
  lineJoin = 'round'
  globalAlpha = 1
  /** The transform, world to the target's pixels: x' = k x + tx. */
  k = 1
  tx = 0
  ty = 0
  /** Draws that did not fit. */
  dropped = 0

  /** This frame's vertices (x, y), cover instances, gradients and animals' paint, as uploaded. */
  readonly verts = new Float32Array(VERTS * 2)
  nv = 0
  readonly covers = new Float32Array(ITEMS * 2 * COVER)
  nc = 0
  readonly grads = new Float32Array(1024 * GRAD)
  ng = 0
  readonly beasts = new Float32Array(256 * BEAST)
  nb = 0
  /** Where the ops go: the pass being drawn. */
  ops: Ops = new Ops()

  private shapes: Path[] = []
  private usedShapes = 0
  private gradPool: GpuGrad[] = []
  private usedGrads = 0
  private colours = new Map<string, Float32Array>()
  private stack: Saved[] = []
  private depth = 0
  /** The clips in force: each its vertex range (fan) in `verts`. */
  private clipFirst = new Int32Array(64)
  private clipCount = new Int32Array(64)
  private clips = 0
  /** The animal being drawn: its index in `beasts`, and the box drawing is held to (the scissor). */
  private beast = 0
  private bx0 = 0
  private by0 = 0
  private bx1 = 0
  private by1 = 0
  private boxInst = 0

  // Items waiting to be batched: their kind, vertices in the staging arrays, box and cover instance.
  private sv = new Float32Array(VERTS * 2)
  private snv = 0
  private iKind = new Uint8Array(ITEMS)
  private iFirst = new Int32Array(ITEMS)
  private iCount = new Int32Array(ITEMS)
  private iBox = new Float32Array(ITEMS * 4)
  private iLevel = new Int32Array(ITEMS)
  private iCover = new Float32Array(ITEMS * COVER)
  private ni = 0
  /** Numbers passed between this pen's own steps, as fields and arrays rather than arguments (see Path). */
  private readonly T = new Float64Array(16)
  private strokeW = 0.5
  private pad = 0.5
  private alpha = 0.5

  constructor() {
    super(null as unknown as GpuPen, 1 << 17)
    this.pen = this
    for (let i = 0; i < 96; i += 1) this.shapes.push(new Path(this, 1 << 13))
    for (let i = 0; i < 512; i += 1) this.gradPool.push(new GpuGrad(this))
    for (let i = 0; i < 32; i += 1) this.stack.push({ fill: '#000', stroke: '#000', width: 1, cap: 'butt', join: 'round', alpha: 1, clips: 0 })
  }

  /** A CSS colour as straight r, g, b, a from 0 to 1; each new string parsed once. */
  colour(s: string): Float32Array {
    let c = this.colours.get(s)
    if (c !== undefined) return c
    c = new Float32Array(4)
    if (s.startsWith('#')) {
      const h = s.length === 4 ? s[1]! + s[1]! + s[2]! + s[2]! + s[3]! + s[3]! : s.slice(1)
      c[0] = parseInt(h.slice(0, 2), 16) / 255
      c[1] = parseInt(h.slice(2, 4), 16) / 255
      c[2] = parseInt(h.slice(4, 6), 16) / 255
      c[3] = 1
    } else {
      const v = s.replace(/[^\d.,]/g, '').split(',').map(Number)
      c[0] = (v[0] ?? 0) / 255
      c[1] = (v[1] ?? 0) / 255
      c[2] = (v[2] ?? 0) / 255
      c[3] = v[3] ?? 1
    }
    this.colours.set(s, c)
    return c
  }

  /** A new frame: everything recorded is dropped. */
  frame(): void {
    this.nv = 0
    this.nc = 0
    this.ng = 0
    this.nb = 0
    this.usedGrads = 0
    this.dropped = 0
  }

  /**
   * What `begin` and `quad` read, set by the caller (numbers passed as arguments would be boxed, see Path). For
   * begin: the box drawing is held to, (x0, y0)-(x1, y1) in the target's pixels; the transform k, tx, ty; how far
   * tinted toward the deep colour, the caustics' strength and coarseness, how deep it is; a target pixel in sea units
   * (x = pixel * px + ox); and how much of a mosaic tile it must cover to light it.
   */
  readonly B = new Float64Array(16)
  /** For quad: the box (x0, y0, x1, y1), the colour (r, g, b, a), and an extra number. */
  readonly Q = new Float64Array(9)

  /** Starts drawing one animal onto `ops`, as B says, tinted toward `deep`. */
  begin(ops: Ops, deep: Float32Array): void {
    const B = this.B
    this.ops = ops
    this.k = B[4]!
    this.tx = B[5]!
    this.ty = B[6]!
    this.bx0 = B[0]!
    this.by0 = B[1]!
    this.bx1 = B[2]!
    this.by1 = B[3]!
    this.fillStyle = this.strokeStyle = '#000'
    this.lineWidth = 1
    this.lineCap = 'butt'
    this.lineJoin = 'round'
    this.globalAlpha = 1
    this.depth = 0
    this.clips = 0
    this.usedShapes = 0
    this.reset()
    const b = this.nb * BEAST
    const v = this.beasts
    v[b] = B[7]!
    v[b + 1] = B[8]!
    v[b + 2] = B[9]!
    v[b + 3] = B[10]!
    v[b + 4] = deep[0]!
    v[b + 5] = deep[1]!
    v[b + 6] = deep[2]!
    v[b + 7] = 1
    v[b + 8] = B[11]!
    v[b + 9] = B[12]!
    v[b + 10] = B[13]!
    v[b + 11] = B[14]!
    this.beast = this.nb
    this.nb += 1
    ops.push(OP_SCISSOR, Math.floor(this.bx0), Math.floor(this.by0), Math.ceil(this.bx1) - Math.floor(this.bx0), Math.ceil(this.by1) - Math.floor(this.by0))
    // The box as a quad, for setting and clearing the clip.
    const Q = this.Q
    Q[0] = this.bx0
    Q[1] = this.by0
    Q[2] = this.bx1
    Q[3] = this.by1
    Q[4] = Q[5] = Q[6] = Q[7] = 0
    Q[8] = -1
    this.boxInst = this.quad()
  }

  /** Ends the animal: what is waiting is drawn. */
  end(): void {
    this.flush()
    if (this.clips > 0) this.ops.push(OP_RESET, this.boxInst, 0, 0, 0)
    this.clips = 0
  }

  /** A cover instance written straight to the frame (no stencil), as Q says: a box, a colour or an atlas rectangle. */
  quad(): number {
    if (this.nc >= ITEMS * 2) return 0
    const c = this.nc * COVER
    const v = this.covers
    const Q = this.Q
    for (let i = 0; i < 8; i += 1) v[c + i] = Q[i]!
    v[c + 8] = -1
    v[c + 9] = this.beast
    v[c + 10] = 1
    v[c + 11] = Q[8]!
    this.nc += 1
    return this.nc - 1
  }

  beginPath(): void {
    this.reset()
  }
  shape(): Shape {
    const s = this.shapes[this.usedShapes % this.shapes.length]!
    this.usedShapes += 1
    s.reset()
    return s
  }
  createLinearGradient(x0: number, y0: number, x1: number, y1: number): Grad {
    return this.grad(1, this.k * x0 + this.tx, this.k * y0 + this.ty, this.k * x1 + this.tx, this.k * y1 + this.ty)
  }
  createRadialGradient(_x0: number, _y0: number, _r0: number, x1: number, y1: number, r1: number): Grad {
    // shortcut: the inner circle is taken as a point at the centre, as every drawing here uses it.
    return this.grad(2, this.k * x1 + this.tx, this.k * y1 + this.ty, this.k * r1, 0)
  }
  private grad(type: number, a: number, b: number, c: number, d: number): GpuGrad {
    const g = this.gradPool[this.usedGrads % this.gradPool.length]!
    this.usedGrads += 1
    g.type = type
    g.g0 = a
    g.g1 = b
    g.g2 = c
    g.g3 = d
    g.n = 0
    g.slot = -1
    return g
  }

  save(): void {
    if (this.depth >= this.stack.length) return
    const s = this.stack[this.depth]!
    s.fill = this.fillStyle
    s.stroke = this.strokeStyle
    s.width = this.lineWidth
    s.cap = this.lineCap
    s.join = this.lineJoin
    s.alpha = this.globalAlpha
    s.clips = this.clips
    this.depth += 1
  }
  restore(): void {
    if (this.depth === 0) return
    this.depth -= 1
    const s = this.stack[this.depth]!
    this.fillStyle = s.fill
    this.strokeStyle = s.stroke
    this.lineWidth = s.width
    this.lineCap = s.cap
    this.lineJoin = s.join
    this.globalAlpha = s.alpha
    if (s.clips !== this.clips) {
      // Back to the clips that were in force: clear them all, and cut again by those that remain.
      this.flush()
      this.ops.push(OP_RESET, this.boxInst, 0, 0, 0)
      this.clips = s.clips
      for (let i = 0; i < this.clips; i += 1) this.ops.push(OP_CLIP, this.clipFirst[i]!, this.clipCount[i]!, this.boxInst, 0)
    }
  }

  clip(path?: Shape): void {
    const p = (path as Path | undefined) ?? this
    p.flatten()
    this.flush()
    if (this.clips >= this.clipFirst.length) return
    const first = this.nv
    this.fan(p, this.verts, true)
    this.clipFirst[this.clips] = first
    this.clipCount[this.clips] = this.nv - first
    this.clips += 1
    this.ops.push(OP_CLIP, first, this.nv - first, this.boxInst, 0)
  }

  /** The fan of every subpath of `p` into `into` (the frame's vertices, or the staging ones). */
  private fan(p: Path, into: Float32Array, direct: boolean): void {
    let n = direct ? this.nv : this.snv
    for (let s = 0; s < p.subs; s += 1) {
      const a = p.start[s]!
      const b = s + 1 < p.subs ? p.start[s + 1]! : p.n
      if (b - a < 3) continue
      if (n * 2 + (b - a) * 6 > into.length) {
        this.dropped += 1
        break
      }
      const x0 = p.x[a]!
      const y0 = p.y[a]!
      for (let i = a + 1; i < b - 1; i += 1) {
        into[n * 2] = x0
        into[n * 2 + 1] = y0
        into[n * 2 + 2] = p.x[i]!
        into[n * 2 + 3] = p.y[i]!
        into[n * 2 + 4] = p.x[i + 1]!
        into[n * 2 + 5] = p.y[i + 1]!
        n += 3
      }
    }
    if (direct) this.nv = n
    else this.snv = n
  }

  /** The triangle T[0..5] into the staging vertices. */
  private tri(): void {
    const n = this.snv
    if (n * 2 + 6 > this.sv.length) {
      this.dropped += 1
      return
    }
    const v = this.sv
    const t = this.T
    for (let i = 0; i < 6; i += 1) v[n * 2 + i] = t[i]!
    this.snv = n + 3
  }

  /** A pie slice round (T[6], T[7]), radius T[8], from angle T[9] through T[10] radians. */
  private pie(): void {
    const t = this.T
    const x = t[6]!
    const y = t[7]!
    const r = t[8]!
    const a0 = t[9]!
    const sweep = t[10]!
    const dt = r > TOL ? 2 * Math.acos(1 - TOL / r) : Math.PI / 2
    const steps = Math.max(1, Math.ceil(Math.abs(sweep) / dt))
    t[0] = x
    t[1] = y
    t[2] = x + Math.cos(a0) * r
    t[3] = y + Math.sin(a0) * r
    for (let i = 1; i <= steps; i += 1) {
      const a = a0 + (sweep * i) / steps
      t[4] = x + Math.cos(a) * r
      t[5] = y + Math.sin(a) * r
      this.tri()
      t[2] = t[4]!
      t[3] = t[5]!
    }
  }

  /**
   * A round join at (T[6], T[7]), radius T[8], between a segment going (T[11], T[12]) and the next going (T[13],
   * T[14]): the outer wedge.
   */
  private join(): void {
    const t = this.T
    const ax = t[11]!
    const ay = t[12]!
    const bx = t[13]!
    const by = t[14]!
    const cross = ax * by - ay * bx
    const dot = ax * bx + ay * by
    if (Math.abs(cross) < 1e-6 && dot > 0) return
    // The outer side is the one the path turns away from: the right of a left turn.
    t[9] = cross > 0 ? Math.atan2(-ax, ay) : Math.atan2(ax, -ay)
    t[10] = Math.atan2(cross, dot)
    this.pie()
  }

  /** The stroke of every subpath of `p`, `strokeW` pixels wide: a quad a segment, round joins (every drawing asks for
   * them), and round caps if `round` (else butt: none). */
  private strokeGeometry(p: Path, round: boolean): void {
    const h = this.strokeW / 2
    const t = this.T
    t[8] = h
    for (let s = 0; s < p.subs; s += 1) {
      const a = p.start[s]!
      const end = s + 1 < p.subs ? p.start[s + 1]! : p.n
      const closed = p.closed[s] === 1
      // The points that are not where the last one is.
      let count = 0
      let fx = 0.5
      let fy = 0.5
      let lx = 0.5
      let ly = 0.5
      // Directions of the first and of the previous segment.
      let d0x = 0.5
      let d0y = 0.5
      let pdx = 0.5
      let pdy = 0.5
      for (let i = a; i <= end; i += 1) {
        let x = fx
        let y = fy
        if (i < end) {
          x = p.x[i]!
          y = p.y[i]!
        } else if (!closed) break
        if (count > 0 && Math.abs(x - lx) < 1e-4 && Math.abs(y - ly) < 1e-4) continue
        if (count === 0) {
          fx = x
          fy = y
        } else {
          const len = Math.sqrt((x - lx) * (x - lx) + (y - ly) * (y - ly))
          const dx = (x - lx) / len
          const dy = (y - ly) / len
          const nx = -dy * h
          const ny = dx * h
          t[0] = lx + nx
          t[1] = ly + ny
          t[2] = x + nx
          t[3] = y + ny
          t[4] = x - nx
          t[5] = y - ny
          this.tri()
          t[0] = lx + nx
          t[1] = ly + ny
          t[2] = x - nx
          t[3] = y - ny
          t[4] = lx - nx
          t[5] = ly - ny
          this.tri()
          if (count >= 2) {
            t[6] = lx
            t[7] = ly
            t[11] = pdx
            t[12] = pdy
            t[13] = dx
            t[14] = dy
            this.join()
          } else {
            d0x = dx
            d0y = dy
          }
          pdx = dx
          pdy = dy
        }
        lx = x
        ly = y
        count += 1
      }
      if (count < 2) {
        // A lone point: a round cap draws a dot.
        if (count === 1 && round && !closed) {
          t[6] = fx
          t[7] = fy
          t[9] = 0
          t[10] = Math.PI * 2
          this.pie()
        }
        continue
      }
      if (closed) {
        t[6] = fx
        t[7] = fy
        t[11] = pdx
        t[12] = pdy
        t[13] = d0x
        t[14] = d0y
        this.join()
      } else if (round) {
        t[6] = fx
        t[7] = fy
        t[9] = Math.atan2(d0x, -d0y)
        t[10] = Math.PI
        this.pie()
        t[6] = lx
        t[7] = ly
        t[9] = Math.atan2(-pdx, pdy)
        t[10] = Math.PI
        this.pie()
      }
    }
  }

  /** The style as a cover instance's colour, or its gradient's slot; the alpha is `alpha`. */
  private paint(style: Style, at: number): void {
    const c = this.iCover
    if (typeof style === 'string') {
      const col = this.colour(style)
      c[at + 4] = col[0]!
      c[at + 5] = col[1]!
      c[at + 6] = col[2]!
      c[at + 7] = col[3]!
      c[at + 8] = -1
    } else {
      const g = style as GpuGrad
      if (g.slot < 0 && this.ng < this.grads.length / GRAD) {
        const o = this.ng * GRAD
        const v = this.grads
        v[o] = g.g0
        v[o + 1] = g.g1
        v[o + 2] = g.g2
        v[o + 3] = g.g3
        v[o + 4] = g.type
        v[o + 5] = g.n
        for (let i = 0; i < STOPS * 4; i += 1) v[o + 8 + i] = g.col[i]!
        for (let i = 0; i < STOPS; i += 1) v[o + 56 + i] = g.off[i]!
        g.slot = this.ng
        this.ng += 1
      }
      c[at + 4] = c[at + 5] = c[at + 6] = c[at + 7] = 1
      c[at + 8] = g.slot
    }
    c[at + 9] = this.beast
    c[at + 10] = this.alpha
    c[at + 11] = 0
  }

  /** A fill or stroke of `p` whose vertices begin at `first` in the staging arrays: its box is p's, `pad` wider. */
  private item(kind: number, first: number, p: Path, style: Style): void {
    const count = this.snv - first
    if (count === 0) return
    const pad = this.pad
    const x0 = Math.max(p.x0 - pad, this.bx0)
    const y0 = Math.max(p.y0 - pad, this.by0)
    const x1 = Math.min(p.x1 + pad, this.bx1)
    const y1 = Math.min(p.y1 + pad, this.by1)
    // Off the animal's box: nothing to draw.
    if (x1 < x0 || y1 < y0) {
      this.snv = first
      return
    }
    if (this.ni >= ITEMS) this.flush()
    const i = this.ni
    this.iKind[i] = kind
    this.iFirst[i] = first
    this.iCount[i] = count
    this.iBox[i * 4] = x0
    this.iBox[i * 4 + 1] = y0
    this.iBox[i * 4 + 2] = x1
    this.iBox[i * 4 + 3] = y1
    const c = i * COVER
    this.iCover[c] = x0
    this.iCover[c + 1] = y0
    this.iCover[c + 2] = x1
    this.iCover[c + 3] = y1
    this.paint(style, c)
    this.ni += 1
  }

  fill(path?: Shape): void {
    const p = (path as Path | undefined) ?? this
    p.flatten()
    if (p.n < 3) return
    const first = this.snv
    this.fan(p, this.sv, false)
    this.pad = 1
    this.alpha = this.globalAlpha
    this.item(OP_FILL, first, p, this.fillStyle)
  }

  stroke(path?: Shape): void {
    const p = (path as Path | undefined) ?? this
    p.flatten()
    if (p.n < 1) return
    this.strokeW = this.lineWidth * this.k
    this.alpha = this.globalAlpha
    // Thinner than a pixel: a pixel wide and fainter, as the canvas's coverage would show it.
    if (this.strokeW < 1) {
      this.alpha *= this.strokeW
      this.strokeW = 1
    }
    const first = this.snv
    this.strokeGeometry(p, this.lineCap === 'round')
    this.pad = this.strokeW / 2 + 1
    this.item(OP_STROKE, first, p, this.strokeStyle)
  }

  /** Draws what is waiting, level by level. */
  private flush(): void {
    const n = this.ni
    if (n === 0) return
    const box = this.iBox
    const level = this.iLevel
    let top = 0
    for (let i = 0; i < n; i += 1) {
      let l = 0
      const x0 = box[i * 4]!
      const y0 = box[i * 4 + 1]!
      const x1 = box[i * 4 + 2]!
      const y1 = box[i * 4 + 3]!
      for (let j = i - 1; j >= 0; j -= 1) {
        if (level[j]! < l) continue
        if (box[j * 4]! > x1 || box[j * 4 + 2]! < x0 || box[j * 4 + 1]! > y1 || box[j * 4 + 3]! < y0) continue
        l = level[j]! + 1
      }
      level[i] = l
      if (l > top) top = l
    }
    const v = this.verts
    const s = this.sv
    for (let l = 0; l <= top; l += 1) {
      for (let kind = OP_FILL; kind <= OP_STROKE; kind += 1) {
        const first = this.nv
        for (let i = 0; i < n; i += 1) {
          if (level[i] !== l || this.iKind[i] !== kind) continue
          const a = this.iFirst[i]! * 2
          const b = a + this.iCount[i]! * 2
          if (this.nv * 2 + (b - a) > v.length) {
            this.dropped += 1
            continue
          }
          let o = this.nv * 2
          for (let k = a; k < b; k += 1) v[o++] = s[k]!
          this.nv += this.iCount[i]!
        }
        if (this.nv > first) this.ops.push(kind, first, this.nv - first, 0, 0)
      }
      const firstCover = this.nc
      for (let i = 0; i < n; i += 1) {
        if (level[i] !== l || this.nc >= ITEMS * 2) continue
        const from = i * COVER
        const to = this.nc * COVER
        for (let k = 0; k < COVER; k += 1) this.covers[to + k] = this.iCover[from + k]!
        this.nc += 1
      }
      if (this.nc > firstCover) this.ops.push(OP_COVER, firstCover, this.nc - firstCover, 0, 0)
    }
    this.ni = 0
    this.snv = 0
  }
}
