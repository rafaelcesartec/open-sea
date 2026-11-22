// For the tests: a pen that writes down what it is told, as text, and stands in for the canvas (and Path2D) under the
// original drawings too, so a port and its original can be compared op by op. Colours are written as the canvas
// would paint them: a colour's own alpha and the global alpha as one.

import type { Grad, Pen, Shape, Style } from '../pen.ts'

const n = (v: number): string => (Math.abs(v) < 1e-9 ? '0' : v.toPrecision(9))

export function rgba(s: string): [number, number, number, number] {
  if (s.startsWith('#')) {
    const h = s.length === 4 ? [...s.slice(1)].map(c => c + c).join('') : s.slice(1)
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), 1]
  }
  const m = s.match(/rgba?\(([^)]*)\)/)
  if (m === null) throw new Error(`no colour ${s}`)
  const [r = 0, g = 0, b = 0, a = 1] = m[1]!.split(',').map(Number)
  return [r, g, b, a]
}

class RecGrad implements Grad {
  stops: string[] = []
  readonly head: string
  constructor(head: string) {
    this.head = head
  }
  addColorStop(o: number, color: string): void {
    const [r, g, b, a] = rgba(color)
    this.stop(o, r, g, b, a)
  }
  stop(o: number, r: number, g: number, b: number, a: number): void {
    this.stops.push(`${n(o)}:${r},${g},${b},${n(a)}`)
  }
  toString(): string {
    return `${this.head}[${this.stops.join(' ')}]`
  }
}

/** A path written down as the GPU pen's is (`cmd`, `cn`: see gpen.ts's Path), so drawings whose calls the build turns
 * into writes to it (scripts/inline.mjs) are recorded too; read back as text by `ops`. */
export class RecPath implements Shape {
  cmd = new Float64Array(1 << 18)
  cn = 0
  dirty = false
  get ops(): string[] {
    const c = this.cmd
    const out: string[] = []
    for (let i = 0; i < this.cn; ) {
      const op = c[i]!
      const a = (k: number): string => n(c[i + k]!)
      if (op === 1) out.push(`M ${a(1)} ${a(2)}`), (i += 3)
      else if (op === 2) out.push(`L ${a(1)} ${a(2)}`), (i += 3)
      else if (op === 3) out.push(`Q ${a(1)} ${a(2)} ${a(3)} ${a(4)}`), (i += 5)
      else if (op === 4) out.push(`C ${a(1)} ${a(2)} ${a(3)} ${a(4)} ${a(5)} ${a(6)}`), (i += 7)
      else if (op === 5) out.push('Z'), (i += 1)
      else {
        // An arc is an ellipse whose radii are the same and that is not turned.
        out.push(c[i + 3] === c[i + 4] && c[i + 5] === 0 ? `A ${a(1)} ${a(2)} ${a(3)} ${a(6)} ${a(7)} ${c[i + 8] === 1}` : `E ${a(1)} ${a(2)} ${a(3)} ${a(4)} ${a(5)} ${a(6)} ${a(7)} ${c[i + 8] === 1}`)
        i += 9
      }
    }
    return out
  }
  private put(op: number, ...v: number[]): void {
    this.cmd[this.cn] = op
    v.forEach((x, k) => (this.cmd[this.cn + 1 + k] = x))
    this.cn += 1 + v.length
  }
  moveTo(x: number, y: number): void {
    this.put(1, x, y)
  }
  lineTo(x: number, y: number): void {
    this.put(2, x, y)
  }
  quadraticCurveTo(a: number, b: number, x: number, y: number): void {
    this.put(3, a, b, x, y)
  }
  bezierCurveTo(a: number, b: number, c: number, d: number, x: number, y: number): void {
    this.put(4, a, b, c, d, x, y)
  }
  closePath(): void {
    this.put(5)
  }
  arc(x: number, y: number, r: number, a0: number, a1: number, ccw = false): void {
    this.put(6, x, y, r, r, 0, a0, a1, ccw ? 1 : 0)
  }
  ellipse(x: number, y: number, rx: number, ry: number, rot: number, a0: number, a1: number, ccw = false): void {
    this.put(6, x, y, rx, ry, rot, a0, a1, ccw ? 1 : 0)
  }
}

export class Rec extends RecPath implements Pen {
  log: string[] = []
  fillStyle: Style = '#000'
  strokeStyle: Style = '#000'
  lineWidth = 1
  lineCap = 'butt'
  lineJoin = 'miter'
  globalAlpha = 1
  private stack: [Style, Style, number, string, string, number][] = []
  private paint(s: Style): string {
    if (typeof s !== 'string') return `${s} *${n(this.globalAlpha)}`
    const [r, g, b, a] = rgba(s)
    return `${r},${g},${b},${n(a * this.globalAlpha)}`
  }
  private path(p?: Shape): string {
    return ((p as RecPath | undefined) ?? this).ops.join(' ')
  }
  beginPath(): void {
    this.cn = 0
  }
  fill(p?: Shape): void {
    this.log.push(`fill ${this.paint(this.fillStyle)} | ${this.path(p)}`)
  }
  stroke(p?: Shape): void {
    this.log.push(`stroke ${this.paint(this.strokeStyle)} w${n(this.lineWidth)} ${this.lineCap} ${this.lineJoin} | ${this.path(p)}`)
  }
  clip(p?: Shape): void {
    this.log.push(`clip | ${this.path(p)}`)
  }
  save(): void {
    this.stack.push([this.fillStyle, this.strokeStyle, this.lineWidth, this.lineCap, this.lineJoin, this.globalAlpha])
    this.log.push('save')
  }
  restore(): void {
    const s = this.stack.pop()
    if (s !== undefined) [this.fillStyle, this.strokeStyle, this.lineWidth, this.lineCap, this.lineJoin, this.globalAlpha] = s
    this.log.push('restore')
  }
  createLinearGradient(x0: number, y0: number, x1: number, y1: number): Grad {
    return new RecGrad(`lin ${n(x0)} ${n(y0)} ${n(x1)} ${n(y1)}`)
  }
  createRadialGradient(x0: number, y0: number, r0: number, x1: number, y1: number, r1: number): Grad {
    return new RecGrad(`rad ${n(x0)} ${n(y0)} ${n(r0)} ${n(x1)} ${n(y1)} ${n(r1)}`)
  }
  shape(): Shape {
    return new RecPath()
  }
}

/** Under the original drawings, `new Path2D()` is one of these. */
;(globalThis as { Path2D?: unknown }).Path2D = RecPath
