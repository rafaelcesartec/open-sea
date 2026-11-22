// Drawing without a canvas: a stand-in for the part of CanvasRenderingContext2D the animals' drawings use (draw/),
// which records each fill and stroke as an SVG element instead of painting it. Then `animate` folds many recorded
// moments of one scene into one SVG whose shapes move between them by SMIL, so a surface that takes an SVG and no
// script (the Claude app's backdrop) plays the sea smoothly between two sends.

export type El = { tag: string; attrs: Record<string, string>; kids: El[] }

// Whole units where it is big (a unit is under a pixel), a tenth where it is small (an eye, a line's width).
const num = (n: number): string => String(Math.abs(n) < 10 ? Math.round(n * 10) / 10 : Math.round(n))
// Hundredths: also for times, as samples come 0.05 s apart.
const finite = (...v: number[]): boolean => v.every(Number.isFinite)
const frac = (n: number): string => String(Math.round(n * 100) / 100)

/** A path being traced, as SVG path data and as flat outlines (each subpath its points, curves cut into lines, for
 * whatever samples it, mosaic.ts): what both the context's own path and a Path2D are here. */
export class SvgPath {
  parts: string[] = []
  /** Each subpath as [x0, y0, x1, y1, ...], and whether it was closed. */
  polys: number[][] = []
  closed: boolean[] = []
  protected open = false
  private k = 1
  private ox = 0
  private oy = 0
  private dx = 0
  private dy = 0

  /** From now on every point is taken `k` times as far from (ox, oy), then moved by (dx, dy): a body deeper down is
   * drawn smaller, and a shadow is its body moved. Called with no arguments, it goes back to the drawing as it is. */
  scaleAbout(k: number, ox = 0, oy = 0, dx = 0, dy = 0): void {
    ;[this.k, this.ox, this.oy, this.dx, this.dy] = [k, ox, oy, dx, dy]
  }
  private map(x: number, y: number): [number, number] {
    return [this.ox + (x - this.ox) * this.k + this.dx, this.oy + (y - this.oy) * this.k + this.dy]
  }

  reset(): void {
    this.parts = []
    this.polys = []
    this.closed = []
    this.open = false
  }
  private start(x: number, y: number): void {
    this.polys.push([x, y])
    this.closed.push(false)
  }
  private to(x: number, y: number): void {
    this.polys[this.polys.length - 1]!.push(x, y)
  }
  private get here(): [number, number] {
    const p = this.polys[this.polys.length - 1]!
    return [p[p.length - 2]!, p[p.length - 1]!]
  }
  // As the canvas does, a call with a point that is not a number is left out: one NaN must not blank the shape.
  // The points are mapped once here; the private steps take them as they are.
  moveTo(x: number, y: number): void {
    if (!finite(x, y)) return
    this.mv(...this.map(x, y))
  }
  lineTo(x: number, y: number): void {
    if (!finite(x, y)) return
    const [px, py] = this.map(x, y)
    if (!this.open) return this.mv(px, py)
    this.ln(px, py)
  }
  // A curve with no point to start from starts at its first control point, as the canvas does.
  quadraticCurveTo(cx: number, cy: number, x: number, y: number): void {
    if (!finite(cx, cy, x, y)) return
    const [qx, qy] = this.map(cx, cy)
    const [px, py] = this.map(x, y)
    if (!this.open) this.mv(qx, qy)
    this.qd(qx, qy, px, py)
  }
  bezierCurveTo(c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number): void {
    if (!finite(c1x, c1y, c2x, c2y, x, y)) return
    const [ax, ay] = this.map(c1x, c1y)
    const [bx, by] = this.map(c2x, c2y)
    const [px, py] = this.map(x, y)
    if (!this.open) this.mv(ax, ay)
    this.bz(ax, ay, bx, by, px, py)
  }
  private mv(x: number, y: number): void {
    this.parts.push(`M${num(x)} ${num(y)}`)
    this.start(x, y)
    this.open = true
  }
  private ln(x: number, y: number): void {
    this.parts.push(`L${num(x)} ${num(y)}`)
    this.to(x, y)
  }
  private qd(cx: number, cy: number, x: number, y: number): void {
    this.parts.push(`Q${num(cx)} ${num(cy)} ${num(x)} ${num(y)}`)
    const [x0, y0] = this.here
    for (let i = 1; i <= 6; i += 1) {
      const t = i / 6
      const u = 1 - t
      this.to(u * u * x0 + 2 * u * t * cx + t * t * x, u * u * y0 + 2 * u * t * cy + t * t * y)
    }
  }
  private bz(c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number): void {
    this.parts.push(`C${num(c1x)} ${num(c1y)} ${num(c2x)} ${num(c2y)} ${num(x)} ${num(y)}`)
    const [x0, y0] = this.here
    for (let i = 1; i <= 8; i += 1) {
      const t = i / 8
      const u = 1 - t
      const [a, b, c, d] = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t]
      this.to(a * x0 + b * c1x + c * c2x + d * x, a * y0 + b * c1y + c * c2y + d * y)
    }
  }
  /** As the canvas does: closed, and a new subpath from where this one began. */
  closePath(): void {
    this.parts.push('Z')
    if (this.polys.length === 0) return
    this.closed[this.closed.length - 1] = true
    const p = this.polys[this.polys.length - 1]!
    this.start(p[0]!, p[1]!)
  }
  arc(x: number, y: number, r: number, a0: number, a1: number, ccw = false): void {
    this.ellipse(x, y, r, r, 0, a0, a1, ccw)
  }
  /** As the canvas does: a line to its start (or a move, on a new path), then cubic curves, a quarter turn at most
   * each, so the same call always makes the same commands and a shape can move between two moments. */
  ellipse(x: number, y: number, rx: number, ry: number, rot: number, a0: number, a1: number, ccw = false): void {
    if (!finite(x, y, rx, ry, rot, a0, a1)) return
    const TAU = Math.PI * 2
    let span = a1 - a0
    if (!ccw) span = span >= TAU ? TAU : ((span % TAU) + TAU) % TAU
    else span = span <= -TAU ? -TAU : -((((-span) % TAU) + TAU) % TAU)
    const [c, s] = [Math.cos(rot), Math.sin(rot)]
    const p = (t: number): [number, number] => [x + c * rx * Math.cos(t) - s * ry * Math.sin(t), y + s * rx * Math.cos(t) + c * ry * Math.sin(t)]
    const dp = (t: number): [number, number] => [-c * rx * Math.sin(t) - s * ry * Math.cos(t), -s * rx * Math.sin(t) + c * ry * Math.cos(t)]
    this.lineTo(...p(a0))
    const n = Math.max(1, Math.ceil(Math.abs(span) / (Math.PI / 2) - 1e-9))
    const dt = span / n
    const k = (4 / 3) * Math.tan(dt / 4)
    for (let i = 0; i < n; i += 1) {
      const [t0, t1] = [a0 + dt * i, a0 + dt * (i + 1)]
      const [p0, p1, d0, d1] = [p(t0), p(t1), dp(t0), dp(t1)]
      this.bezierCurveTo(p0[0] + k * d0[0], p0[1] + k * d0[1], p1[0] - k * d1[0], p1[1] - k * d1[1], ...p1)
    }
  }
  get d(): string {
    return this.parts.join('')
  }
}

type Gradient = { el: El; addColorStop: (offset: number, color: string) => void }
type Style = string | Gradient
type State = { fillStyle: Style; strokeStyle: Style; lineWidth: number; lineCap: string; lineJoin: string; globalAlpha: number; into: El }

/** Records the drawing into `root`. Ids count up within one context, so the same drawing gives the same ids. */
export class SvgCtx extends SvgPath {
  fillStyle: Style = '#000'
  strokeStyle: Style = '#000'
  lineWidth = 1
  lineCap = 'butt'
  lineJoin = 'round'
  globalAlpha = 1
  into: El
  private stack: State[] = []
  private ids = 0

  constructor(root: El) {
    super()
    this.into = root
  }

  beginPath(): void {
    this.reset()
  }
  save(): void {
    const { fillStyle, strokeStyle, lineWidth, lineCap, lineJoin, globalAlpha, into } = this
    this.stack.push({ fillStyle, strokeStyle, lineWidth, lineCap, lineJoin, globalAlpha, into })
  }
  restore(): void {
    const s = this.stack.pop()
    if (s !== undefined) Object.assign(this, s)
  }
  private id(): string {
    this.ids += 1
    return `i${this.ids}`
  }
  private paint(style: Style): string {
    if (typeof style === 'string') return style
    const id = this.id()
    this.into.kids.push({ ...style.el, attrs: { ...style.el.attrs, id } })
    return `url(#${id})`
  }
  private shape(path: SvgPath | undefined, attrs: Record<string, string>): void {
    const d = (path ?? this).d
    if (d === '') return
    if (this.globalAlpha < 1) attrs.opacity = frac(this.globalAlpha)
    this.into.kids.push({ tag: 'path', attrs: { d, ...attrs }, kids: [] })
  }
  fill(path?: SvgPath): void {
    this.shape(path, { fill: this.paint(this.fillStyle) })
  }
  stroke(path?: SvgPath): void {
    const attrs: Record<string, string> = { fill: 'none', stroke: this.paint(this.strokeStyle), 'stroke-width': num(this.lineWidth) }
    if (this.lineCap !== 'butt') attrs['stroke-linecap'] = this.lineCap
    if (this.lineJoin !== 'miter') attrs['stroke-linejoin'] = this.lineJoin
    this.shape(path, attrs)
  }
  /** What follows, until the restore, is drawn inside this path: a group clipped by it. */
  clip(path?: SvgPath): void {
    const id = this.id()
    this.into.kids.push({ tag: 'clipPath', attrs: { id }, kids: [{ tag: 'path', attrs: { d: (path ?? this).d }, kids: [] }] })
    const g: El = { tag: 'g', attrs: { 'clip-path': `url(#${id})` }, kids: [] }
    this.into.kids.push(g)
    this.into = g
  }
  private gradient(tag: string, attrs: Record<string, string>): Gradient {
    const el: El = { tag, attrs: { gradientUnits: 'userSpaceOnUse', ...attrs }, kids: [] }
    return { el, addColorStop: (offset, color) => el.kids.push({ tag: 'stop', attrs: { offset: frac(offset), 'stop-color': color }, kids: [] }) }
  }
  createLinearGradient(x1: number, y1: number, x2: number, y2: number): Gradient {
    return this.gradient('linearGradient', { x1: num(x1), y1: num(y1), x2: num(x2), y2: num(y2) })
  }
  createRadialGradient(_x0: number, _y0: number, _r0: number, x: number, y: number, r: number): Gradient {
    // shortcut: the inner circle is taken as a point at the centre, as every drawing here uses it.
    return this.gradient('radialGradient', { cx: num(x), cy: num(y), r: num(r) })
  }
}

/** An attribute that must match for two moments to be one shape moving: which element it points to. */
const fixed = (k: string, v: string): boolean => k === 'id' || v.includes('url(')
/** What must stay the same for a shape to move between two moments: its tags, its pointers, its path commands. */
function signature(el: El): string {
  const keys = Object.keys(el.attrs)
    .sort()
    .map(k => (fixed(k, el.attrs[k]!) ? `${k}=${el.attrs[k]}` : k === 'd' ? `d:${el.attrs.d!.replace(/[^A-Z]/g, '')}` : k))
  return `${el.tag}(${keys.join(',')})[${el.kids.map(signature).join('')}]`
}

const esc = (v: string): string => v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')

/**
 * Many moments of one element, each with the same signature, as one element whose changing attributes move from
 * moment to moment over `dur` seconds from `begin`. `ids` makes ids unique to the run.
 */
function merge(els: El[], begin: number, dur: number, ids: string): string {
  const first = els[0]!
  const rename = (v: string): string => v.replace(/url\(#/g, `url(#${ids}`)
  let attrs = ''
  let moves = ''
  for (const [k, v] of Object.entries(first.attrs)) {
    attrs += ` ${k}="${esc(k === 'id' ? ids + v : rename(v))}"`
    const values = els.map(e => e.attrs[k]!)
    if (values.some(x => x !== v)) moves += `<animate attributeName="${k}" values="${esc(values.join(';'))}" begin="${frac(begin)}s" dur="${frac(dur)}s" fill="freeze"/>`
  }
  const kids = first.kids.map((_, i) => merge(els.map(e => e.kids[i]!), begin, dur, ids)).join('')
  return `<${first.tag}${attrs}>${moves}${kids}</${first.tag}>`
}

/**
 * Moments of one scene, `step` seconds apart, as SVG markup for inside an `<svg>`: each run of moments that share a
 * signature is one group that moves smoothly through them and shows only in its own time. A change of signature (a
 * shape that appears, one passing over another) is a cut from one run to the next.
 */
export function animate(moments: El[], step: number): string {
  const runs: [number, number][] = []
  moments.forEach((m, i) => {
    const last = runs[runs.length - 1]
    if (last !== undefined && signature(moments[last[0]]!) === signature(m)) last[1] = i
    else runs.push([i, i])
  })
  return runs
    .map(([a, b], r) => {
      const body = merge(moments.slice(a, b + 1), a * step, Math.max(step, (b - a) * step), `r${r}`)
      if (runs.length === 1) return body
      const next = runs[r + 1]
      const show = r === 0 ? '' : `<set attributeName="visibility" to="visible" begin="${frac(a * step)}s"${next ? ` end="${frac(next[0] * step)}s"` : ''}/>`
      const hide = r === 0 && next ? `<set attributeName="visibility" to="hidden" begin="${frac(next[0] * step)}s"/>` : ''
      return `<g${r === 0 ? '' : ' visibility="hidden"'}>${show}${hide}${body}</g>`
    })
    .join('')
}
