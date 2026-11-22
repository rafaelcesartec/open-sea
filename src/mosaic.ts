// The mosaic's tiles, and the mosaic without a canvas.
//
// THE TILES are shared with the page (index.ts): a 16 by 16 table of shades and glyphs repeated across the sea, so a
// tile keeps its shade and its glyph wherever it is lit.
// WITHOUT A CANVAS (the Claude app's backdrop, backdrop.ts): `RasterCtx` stands in for the part of the canvas the
// drawings use and paints into a grid of samples, two by two a tile; a tile lights where a body covers most of it,
// with the body's colour there, as the page's one-pixel-a-tile canvas does. `createMosaic` turns moments of lit
// tiles into one SVG: the tiles of the first moment, then for each later one only the tiles that changed, shown at
// its time. The shades, the gaps between tiles and the glyphs are one still layer over all of them, made once.

import { SvgPath } from './svg.ts'

export const GLYPHS = '$%tSX8@:;#S%X8tS'
export const SHADES = [1, 0.886, 0.776, 0.659]
export const GLYPH_INK = 0.227
export const GLYPH_LIFT = 0.72
/** The sea's colour by night and by day: the deep blue of the open ocean from above, darker at night. A deep animal fades
 * into it, seen through it from above (see index.ts). */
export const OCEAN_NIGHT = '#0a2034'
export const OCEAN_DAY = '#2f86ad'
export const DEEP_DARK = OCEAN_NIGHT
export const DEEP_LIGHT = OCEAN_DAY
/** The sea in black and white (the page's Sea switch off): the water and the deep it fades into, as before the blue. */
export const MONO_NIGHT = '#191919'
export const MONO_DAY = '#dde6e9'
export const MONO_DEEP_DARK = '#171d24'
export const MONO_DEEP_LIGHT = '#c9d8de'
/** The mosaic: the deepest only tinted toward it a little, and their tiles this much see-through instead. */
export const TINT = 0.3
export const CLEAR = 0.85

export function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** The mosaic's tiles: 16 by 16 of slightly different brightness, most with a glyph, repeated across the sea. */
export function tileTable(): { shade: number[]; glyph: string[] } {
  const rand = rng(7)
  const shade: number[] = []
  const glyph: string[] = []
  for (let i = 0; i < 256; i += 1) {
    const r = rand()
    shade.push(SHADES[r < 0.4 ? 0 : r < 0.7 ? 1 : r < 0.9 ? 2 : 3]!)
    glyph.push(rand() < 0.86 ? GLYPHS[Math.floor(rand() * GLYPHS.length)]! : '')
  }
  return { shade, glyph }
}

type RGBA = [number, number, number, number]

const NAMED: Record<string, RGBA> = { transparent: [0, 0, 0, 0], black: [0, 0, 0, 1], white: [255, 255, 255, 1] }

/** '#rgb', '#rrggbb', 'rgb(...)', 'rgba(...)', or one of the few names in NAMED. Any other colour throws, so a
 * drawing that starts using one fails in the tests instead of painting black. */
export function parseColor(s: string): RGBA {
  if (s.startsWith('#')) {
    const h = s.length === 4 ? [...s.slice(1)].map(c => c + c).join('') : s.slice(1)
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), 1]
  }
  if (/^rgba?\(/.test(s)) {
    const [r = 0, g = 0, b = 0, a = 1] = s.replace(/[^\d.,]/g, '').split(',').map(Number)
    return [r, g, b, a]
  }
  const named = NAMED[s.trim().toLowerCase()]
  if (named === undefined) throw new Error(`mosaic: no colour ${JSON.stringify(s)} here; add it to NAMED`)
  return named
}

class Gradient {
  stops: [number, RGBA][] = []
  readonly at: (x: number, y: number) => number
  constructor(at: (x: number, y: number) => number) {
    this.at = at
  }
  addColorStop(offset: number, color: string): void {
    this.stops.push([offset, parseColor(color)])
    this.stops.sort((p, q) => p[0] - q[0])
  }
  color(x: number, y: number): RGBA {
    const t = Math.max(0, Math.min(1, this.at(x, y)))
    const i = this.stops.findIndex(([o]) => o >= t)
    if (i <= 0) return (this.stops[i === 0 ? 0 : this.stops.length - 1] ?? [0, [0, 0, 0, 0]])[1]
    const [[o0, c0], [o1, c1]] = [this.stops[i - 1]!, this.stops[i]!]
    const f = (t - o0) / (o1 - o0 || 1)
    return c0.map((v, k) => v + (c1[k]! - v) * f) as RGBA
  }
}

/**
 * Where each sample row from `j0` to `j1` (its line at height (j + 0.5) * step) lies inside the outlines, by the
 * canvas's rule (nonzero winding), as [from, to, ...]. Each edge goes only to the rows it crosses.
 */
function rowSpans(polys: number[][], j0: number, j1: number, step: number): number[][] {
  const hits: number[][] = Array.from({ length: Math.max(0, j1 - j0 + 1) }, () => [])
  for (const p of polys) {
    const n = p.length / 2
    for (let i = 0; i < n; i += 1) {
      const e = (i + 1) % n
      const [x0, y0, x1, y1] = [p[i * 2]!, p[i * 2 + 1]!, p[e * 2]!, p[e * 2 + 1]!]
      if (y0 === y1) continue
      const dir = y1 > y0 ? 1 : -1
      const [lo, hi] = y1 > y0 ? [y0, y1] : [y1, y0]
      // The rows whose line is at or past the edge's top and before its bottom.
      for (let j = Math.max(j0, Math.ceil(lo / step - 0.5)); j <= Math.min(j1, Math.ceil(hi / step - 0.5) - 1); j += 1) {
        const y = (j + 0.5) * step
        hits[j - j0]!.push(x0 + ((y - y0) / (y1 - y0)) * (x1 - x0), dir)
      }
    }
  }
  return hits.map(h => {
    const order = Array.from({ length: h.length / 2 }, (_, k) => k).sort((p, q) => h[p * 2]! - h[q * 2]!)
    const out: number[] = []
    let wind = 0
    for (const k of order) {
      const was = wind
      wind += h[k * 2 + 1]!
      if ((was === 0) !== (wind === 0)) out.push(h[k * 2]!)
    }
    return out
  })
}

const within = (s: number[], x: number): boolean => {
  for (let k = 0; k < s.length; k += 2) if (x >= s[k]! && x <= s[k + 1]!) return true
  return false
}

function bounds(polys: number[][], pad: number): [number, number, number, number] {
  let [l, t, r, b] = [Infinity, Infinity, -Infinity, -Infinity]
  for (const p of polys)
    for (let i = 0; i < p.length; i += 2) {
      l = Math.min(l, p[i]!)
      r = Math.max(r, p[i]!)
      t = Math.min(t, p[i + 1]!)
      b = Math.max(b, p[i + 1]!)
    }
  return [l - pad, t - pad, r + pad, b + pad]
}

/** A clip, its spans worked out once a row as samples ask. */
type Clip = { polys: number[][]; rows?: { j0: number; spans: number[][] } }

type Style = string | Gradient
type State = { fillStyle: Style; strokeStyle: Style; lineWidth: number; lineCap: string; lineJoin: string; globalAlpha: number; clips: Clip[] }

/** Samples per tile, each way. */
const S = 2

/** Paints the drawings into samples, `S` by `S` a tile of `tile` units, over a sea `cols` by `rows` tiles. */
export class RasterCtx extends SvgPath {
  fillStyle: Style = '#000'
  strokeStyle: Style = '#000'
  lineWidth = 1
  lineCap = 'butt'
  lineJoin = 'round'
  globalAlpha = 1
  private clips: Clip[] = []
  /** Which samples the stroke being painted has painted already, so a joint is not painted twice. */
  private stamp: Uint32Array
  private stroked = 0
  private stack: State[] = []
  readonly cols: number
  readonly rows: number
  readonly tile: number
  readonly w: number
  readonly h: number
  /** Premultiplied colour and coverage of each sample, and the samples painted since the last clear. */
  readonly r: Float32Array
  readonly g: Float32Array
  readonly b: Float32Array
  readonly a: Float32Array
  box = [Infinity, Infinity, -Infinity, -Infinity]

  constructor(cols: number, rows: number, tile: number) {
    super()
    ;[this.cols, this.rows, this.tile] = [cols, rows, tile]
    this.w = cols * S
    this.h = rows * S
    const n = this.w * this.h
    ;[this.r, this.g, this.b, this.a] = [new Float32Array(n), new Float32Array(n), new Float32Array(n), new Float32Array(n)]
    this.stamp = new Uint32Array(n)
  }

  beginPath(): void {
    this.reset()
  }
  save(): void {
    const { fillStyle, strokeStyle, lineWidth, lineCap, lineJoin, globalAlpha, clips } = this
    this.stack.push({ fillStyle, strokeStyle, lineWidth, lineCap, lineJoin, globalAlpha, clips })
  }
  restore(): void {
    const s = this.stack.pop()
    if (s !== undefined) Object.assign(this, s)
  }
  clip(path?: SvgPath): void {
    this.clips = [...this.clips, { polys: (path ?? this).polys }]
  }
  createLinearGradient(x1: number, y1: number, x2: number, y2: number): Gradient {
    const [dx, dy] = [x2 - x1, y2 - y1]
    const l2 = dx * dx + dy * dy || 1
    return new Gradient((x, y) => ((x - x1) * dx + (y - y1) * dy) / l2)
  }
  createRadialGradient(_x0: number, _y0: number, _r0: number, x: number, y: number, r: number): Gradient {
    // shortcut: the inner circle is taken as a point at the centre, as every drawing here uses it.
    return new Gradient((px, py) => Math.hypot(px - x, py - y) / (r || 1))
  }
  fill(path?: SvgPath): void {
    const polys = (path ?? this).polys
    const step = this.tile / S
    const [, t, , b] = bounds(polys, 0)
    const paint = this.painter(this.fillStyle)
    const j0 = Math.max(0, Math.ceil(t / step - 0.5))
    const rows = rowSpans(polys, j0, Math.min(this.h - 1, Math.floor(b / step - 0.5)), step)
    for (let j = j0; j < j0 + rows.length; j += 1) {
      const s = rows[j - j0]!
      for (let k = 0; k < s.length; k += 2)
        for (let i = Math.max(0, Math.ceil(s[k]! / step - 0.5)); i <= Math.min(this.w - 1, Math.floor(s[k + 1]! / step - 0.5)); i += 1) paint(i, j)
    }
  }
  /** Each segment paints the samples within half the line's width of it. */
  stroke(path?: SvgPath): void {
    const { polys, closed } = path ?? this
    const step = this.tile / S
    const half = this.lineWidth / 2
    const paint = this.painter(this.strokeStyle)
    this.stroked += 1
    polys.forEach((p, n) => {
      const count = p.length / 2
      for (let s = 0; s < (closed[n] ? count : count - 1); s += 1) {
        const e = (s + 1) % count
        const [x0, y0, x1, y1] = [p[s * 2]!, p[s * 2 + 1]!, p[e * 2]!, p[e * 2 + 1]!]
        const [dx, dy] = [x1 - x0, y1 - y0]
        const l2 = dx * dx + dy * dy || 1
        for (let j = Math.max(0, Math.ceil((Math.min(y0, y1) - half) / step - 0.5)); j <= Math.min(this.h - 1, Math.floor((Math.max(y0, y1) + half) / step - 0.5)); j += 1) {
          for (let i = Math.max(0, Math.ceil((Math.min(x0, x1) - half) / step - 0.5)); i <= Math.min(this.w - 1, Math.floor((Math.max(x0, x1) + half) / step - 0.5)); i += 1) {
            const [x, y] = [(i + 0.5) * step, (j + 0.5) * step]
            const u = Math.max(0, Math.min(1, ((x - x0) * dx + (y - y0) * dy) / l2))
            const [ex, ey] = [x0 + dx * u - x, y0 + dy * u - y]
            const k = j * this.w + i
            if (ex * ex + ey * ey > half * half || this.stamp[k] === this.stroked) continue
            this.stamp[k] = this.stroked
            paint(i, j)
          }
        }
      }
    })
  }

  /** Paints one sample in `style`, inside every clip, over what is there. */
  private painter(style: Style): (i: number, j: number) => void {
    const step = this.tile / S
    const flat = typeof style === 'string' ? parseColor(style) : undefined
    const alpha = this.globalAlpha
    const clips = this.clips
    const box = this.box
    return (i, j) => {
      const [x, y] = [(i + 0.5) * step, (j + 0.5) * step]
      for (const c of clips) {
        if (c.rows === undefined) {
          const [, t, , b] = bounds(c.polys, 0)
          const j0 = Math.max(0, Math.ceil(t / step - 0.5))
          c.rows = { j0, spans: rowSpans(c.polys, j0, Math.min(this.h - 1, Math.floor(b / step - 0.5)), step) }
        }
        const s = c.rows.spans[j - c.rows.j0]
        if (s === undefined || !within(s, x)) return
      }
      const [cr, cg, cb, ca] = flat ?? (style as Gradient).color(x, y)
      const al = ca * alpha
      const k = j * this.w + i
      this.r[k] = cr * al + this.r[k]! * (1 - al)
      this.g[k] = cg * al + this.g[k]! * (1 - al)
      this.b[k] = cb * al + this.b[k]! * (1 - al)
      this.a[k] = al + this.a[k]! * (1 - al)
      if (i < box[0]!) box[0] = i
      if (j < box[1]!) box[1] = j
      if (i > box[2]!) box[2] = i
      if (j > box[3]!) box[3] = j
    }
  }

  /** Each tile a body covers most of, with its colour there; then the samples clear for the next body. */
  take(lit: (tile: number, r: number, g: number, b: number) => void): void {
    const [i0, j0, i1, j1] = this.box
    if (i1! < i0!) return
    for (let ty = Math.floor(j0! / S); ty <= Math.floor(j1! / S); ty += 1) {
      for (let tx = Math.floor(i0! / S); tx <= Math.floor(i1! / S); tx += 1) {
        let [r, g, b, a] = [0, 0, 0, 0]
        for (let dy = 0; dy < S; dy += 1)
          for (let dx = 0; dx < S; dx += 1) {
            const k = (ty * S + dy) * this.w + tx * S + dx
            r += this.r[k]!
            g += this.g[k]!
            b += this.b[k]!
            a += this.a[k]!
          }
        if (a / (S * S) >= 0.5) lit(ty * this.cols + tx, r / a, g / a, b / a)
      }
    }
    for (let j = j0!; j <= j1!; j += 1) {
      const k = j * this.w
      for (const buf of [this.r, this.g, this.b, this.a]) buf.fill(0, k + i0!, k + i1! + 1)
    }
    this.box = [Infinity, Infinity, -Infinity, -Infinity]
  }
}

/** How far apart two tiles look: the channel furthest apart, as seen through the more opaque of the two (a deep
 * tile's colour shows only that much over the water), or their see-through levels (a level is about 25 of 255); and
 * how far is still the same to the eye on one tile from one moment to the next. */
function apart(p: number, q: number): number {
  const [lp, lq] = [p >>> 24, q >>> 24]
  const colour = Math.max(Math.abs(((p >> 16) & 255) - ((q >> 16) & 255)), Math.abs(((p >> 8) & 255) - ((q >> 8) & 255)), Math.abs((p & 255) - (q & 255)))
  return Math.max((colour * Math.max(lp, lq)) / LEVELS, Math.abs(lp - lq) * 25)
}
const SAME = 14
/** How see-through a tile can be, in steps: a deep animal's tiles at `level / LEVELS` over the water. */
const LEVELS = 10

/**
 * The water's colours as CSS, the night sea and the pale one, by the viewer's mode: the sea follows the app's light
 * and dark. Classes the mosaic and the backdrop use: `w` filled with water, `ws` stroked with it, `gl` the glyphs'
 * see-through, `ink` the dashes, `grid` the faint grid.
 */
export function waterStyle(dark: string, light: string): string {
  return (
    `<style>.w{fill:${dark}}.ws{stroke:${dark}}.gl{fill-opacity:${1 - GLYPH_INK}}.ink{fill:#fff;fill-opacity:.2}.grid{stroke:#fff;stroke-opacity:.028}` +
    `@media (prefers-color-scheme:light){.w{fill:${light}}.ws{stroke:${light}}.gl{fill-opacity:${GLYPH_LIFT}}.ink{fill:#000;fill-opacity:.12}.grid{stroke:#000;stroke-opacity:.05}}</style>`
  )
}

/** One moment of the mosaic: each tile packed as its see-through level (bits 24 up) and colour 0xRRGGBB, or -1 for
 * water. */
export type Shot = Int32Array

/**
 * The mosaic of a sea `width` by `height` units in tiles of `tile` units: `ctx` to draw each body into, `take` to
 * light its tiles at its depth, and `animate` for the SVG of moments `step` seconds apart. The water is the
 * `waterStyle` classes, so one SVG serves both modes: a deep tile is see-through over whichever water is there.
 * shortcut: no tint toward the deep water's colour (the page tints by mode); add it per mode if the deep looks flat.
 */
export function createMosaic(width: number, height: number, tile: number, texture = true) {
  const cols = Math.ceil(width / tile)
  const rows = Math.ceil(height / tile)
  const ctx = new RasterCtx(cols, rows, tile)
  /** Colours a little coarser than the eye tells apart, so fewer tiles change and more share a path: coarser still
   * the more see-through the tile, as less of its colour shows. */
  const Q = 6
  const q = (v: number, step: number): number => Math.max(0, Math.min(255, Math.round(v / step) * step))

  // The still water, made once: a few dashes under the tiles, and over them each tile's shade, its glyph cut into it
  // and the gap round it, all in the water's colour, so they show only on a lit tile; and the faint grid. Laid over
  // the tiles rather than masking them, so the app repaints only where tiles change. On the pale sea the shades and
  // glyphs come out lighter than the tile, as the page's glyphs do there.
  const table = tileTable()
  const span = 16 * tile
  let shades = ''
  let glyphs = ''
  for (const shade of SHADES) {
    let d = ''
    table.shade.forEach((s, i) => {
      if (s === shade) d += `M${(i % 16) * tile} ${Math.floor(i / 16) * tile}h${tile}v${tile}h${-tile}z`
    })
    if (shade < 1) shades += `<path fill-opacity="${Math.round((1 - shade) * 1000) / 1000}" d="${d}"/>`
  }
  // One text for all the glyphs, each at its own place: a tenth of the elements for the app to check at every send.
  const [xs, ys]: [number[], number[]] = [[], []]
  table.glyph.forEach((g, i) => {
    if (g === '') return
    xs.push((i % 16) * tile + tile / 2)
    ys.push(Math.floor(i / 16) * tile + tile * 0.54)
    glyphs += g
  })
  let gaps = ''
  for (let k = 0; k <= 16; k += 1) gaps += `M${k * tile} 0V${span}M0 ${k * tile}H${span}`
  const rand = rng(99)
  let dashes = ''
  for (let i = 0; i < 120; i += 1) dashes += `M${Math.floor(rand() * cols) * tile + tile * 0.3} ${Math.floor(rand() * rows) * tile + tile * 0.45}h${tile * 0.4}v${tile * 0.1}h${-tile * 0.4}z`
  const under =
    `<defs><pattern id="p" class="w" width="${span}" height="${span}" patternUnits="userSpaceOnUse">${shades}` +
    `<text class="gl" font-family="ui-monospace,SFMono-Regular,Menlo,Consolas,monospace" font-weight="700" font-size="${tile * 0.72}" text-anchor="middle" dominant-baseline="middle" x="${xs.join(' ')}" y="${ys.join(' ')}">${glyphs}</text>` +
    `<path class="ws" d="${gaps}" stroke-width="${tile * 0.12}"/></pattern>` +
    `<pattern id="grid" width="${tile}" height="${tile}" patternUnits="userSpaceOnUse"><path class="grid" d="M0 0H${tile}M0 0V${tile}" fill="none"/></pattern></defs>` +
    (texture ? `<path class="ink" d="${dashes}"/>` : '')
  // Without `texture`, no dashes or grid: the water is nothing but its colour, where no tile is lit. The shades and
  // glyphs are then laid only over the squares of the pattern that hold a lit tile: over bare water they paint water
  // on water, and the app worked the whole window's worth of pattern at every change (a third more, measured).
  const whole = `<rect width="${width}" height="${height}" fill="url(#p)"/><rect width="${width}" height="${height}" fill="url(#grid)"/>`
  const over = (lit: Set<number>): string => {
    if (texture) return whole
    let d = ''
    for (const c of lit) d += `M${(c % 1024) * span} ${Math.floor(c / 1024) * span}h${span}v${span}h${-span}z`
    return d === '' ? '' : `<path fill="url(#p)" d="${d}"/>`
  }

  /** Paths of the tiles given, a path a colour, each row's neighbours of one colour one run, drawn as a line a tile
   * thick along the row's middle (shorter to write than its outline); in tile units. */
  const paths = (tiles: Map<number, number>): string => {
    const byColour = new Map<number, number[]>()
    for (const [t, c] of tiles) (byColour.get(c) ?? byColour.set(c, []).get(c)!).push(t)
    let out = ''
    for (const [c, ts] of byColour) {
      ts.sort((p, n) => p - n)
      // Each run moved to from where the last one ended: shorter numbers than where it is.
      let d = ''
      let [px, py] = [0, 0]
      for (let k = 0; k < ts.length; ) {
        let n = 1
        while (k + n < ts.length && ts[k + n] === ts[k]! + n && (ts[k]! % cols) + n < cols) n += 1
        const [x, y] = [ts[k]! % cols, Math.floor(ts[k]! / cols)]
        d += `${k === 0 ? `M${x} ${y}` : `m${x - px} ${y - py}`}h${n}`
        ;[px, py] = [x + n, y]
        k += n
      }
      const level = c >>> 24
      const paint = c < 0 ? 'class="ws"' : `stroke="#${(c & 0xffffff).toString(16).padStart(6, '0')}"${level < LEVELS ? ` opacity="${level / LEVELS}"` : ''}`
      out += `<path ${paint} d="${d}"/>`
    }
    return out
  }

  return {
    ctx,
    /** A new moment, all water. */
    shot: (): Shot => new Int32Array(cols * rows).fill(-1),
    /** Lights the tiles of the body just drawn into `ctx`, `depth` deep (0 at the surface to 1), over `shot`. A shadow
     * (`shadow` a level above 0) darkens the tiles it falls on instead: black, that see-through, whatever is there. */
    take(shot: Shot, depth: number, shadow = 0): void {
      if (shadow > 0) {
        ctx.take(t => {
          shot[t] = shadow << 24
        })
        return
      }
      // As see-through as it is deep.
      const level = Math.max(1, Math.round((1 - depth * CLEAR) * LEVELS))
      const step = (Q * LEVELS) / level
      ctx.take((t, r, g, b) => {
        shot[t] = (level << 24) | (q(r, step) << 16) | (q(g, step) << 8) | q(b, step)
      })
    },
    /** The moments as SVG markup inside the sea's `<svg>`: the first whole, each later one as what changed. */
    animate(shots: Shot[], step: number): string {
      const first = new Map<number, number>()
      /** The pattern's squares, 16 tiles a side, that hold a tile lit at some moment: row * 1024 + column. */
      const lit = new Set<number>()
      const light = (t: number): void => void lit.add(Math.floor(t / cols / 16) * 1024 + Math.floor((t % cols) / 16))
      shots[0]!.forEach((c, t) => {
        if (c === -1) return
        first.set(t, c)
        light(t)
      })
      let body = paths(first)
      // What each tile shows: a lit tile keeps its colour until the body's there differs by more than a little, so
      // a body sliding along changes few tiles but where it begins and ends.
      const shown = Int32Array.from(shots[0]!)
      for (let k = 1; k < shots.length; k += 1) {
        const changed = new Map<number, number>()
        // A see-through tile goes over water, not over what the tile showed before.
        const clear = new Map<number, number>()
        shots[k]!.forEach((c, t) => {
          const was = shown[t]!
          if (c === was || (c !== -1 && was !== -1 && apart(c, was) <= SAME)) return
          shown[t] = c
          changed.set(t, c)
          if (c !== -1) light(t)
          if (c !== -1 && was !== -1 && c >>> 24 < LEVELS) clear.set(t, -1)
        })
        if (changed.size > 0) body += `<g visibility="hidden"><set attributeName="visibility" to="visible" begin="${Math.round(k * step * 100) / 100}s"/>${paths(clear)}${paths(changed)}</g>`
      }
      return `${under}<g transform="scale(${tile}) translate(0 .5)" stroke-width="1" fill="none">${body}</g>${over(lit)}`
    },
  }
}
