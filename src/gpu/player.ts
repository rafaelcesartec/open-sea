// Open Sea on WebGPU, the player: the sea of index.ts (same settings, same look) drawn by the GPU into an element,
// and nothing allocated while it runs. The sea steps 60 times a second (sea.ts), each animal is drawn by its port
// (draw/) onto the GPU pen, and gfx.ts draws the frame. No panel here: the site (site.ts) adds it, and exports this
// player alone with the settings chosen (play.ts).

import { KD } from './kinds.ts'
import { CLEAR, DEEP_DARK, DEEP_LIGHT, GLYPHS, GLYPH_INK, GLYPH_LIFT, MONO_DAY, MONO_DEEP_DARK, MONO_DEEP_LIGHT, MONO_NIGHT, OCEAN_DAY, OCEAN_NIGHT, TINT, rng, tileTable } from '../mosaic.ts'
import type { Settings } from '../panel.ts'
import { KINDS, depthOf, sizeOf, type Kind } from './reference/sim.ts'
import { DRAW } from './draw/all.ts'
import { ATLAS_H, ATLAS_W, Gfx } from './gfx.ts'
import { OP_QUAD, OP_SCISSOR, Ops } from './gpen.ts'
import { M, createSea, fromFn, discsOf, middleOf, place, shift, spineOf, stepSea, type Beast, type Rand, type Sea } from './sea.ts'

void CLEAR
const FADE = 0.8
const BLUR = 7
const CAUSTIC_DAY = 0.26
const CAUSTIC_NIGHT = 0.12
const STEP = 1 / 60
/** A change of theme fades the water from one to the other in this many seconds, the animals swimming on. */
const THEME_FADE = 0.6
const MARGIN = 20

/** The panel's names of kinds (src/panel.ts, live): this port's kinds are those of reference/sim.ts. */
export type Names = Settings['species']

const hex = (s: string): [number, number, number] => [parseInt(s.slice(1, 3), 16) / 255, parseInt(s.slice(3, 5), 16) / 255, parseInt(s.slice(5, 7), 16) / 255]

export type App = {
  settings: Settings
  gfx: Gfx
  canvas: HTMLCanvasElement
  /** Lays the sea out again for the canvas's size (call after setting canvas.width/height yourself). */
  relayout: () => void
  /** A new open sea, stepping with `random`. */
  restart: (random: Rand) => void
  /** One step of sea, and one frame, with the camera at (cx, cy) seeing `zoom` times closer than the whole sea. */
  stepAndDraw: (cx: number, cy: number, zoom: number) => void
  sea: () => Sea
  /** How long the JIT warm-up took, in milliseconds. */
  warmed: () => number
  /** Steps the sea on without drawing. */
  warm: (steps: number) => void
  /** Applies a change of settings (already in `settings`) as the sea runs. A new theme fades in (THEME_FADE). */
  apply: (patch: Partial<Settings>) => void
  /** The kinds in view now. */
  inView: () => Names
  /** How much of the host's width (CSS pixels, from the right) something covers: a watched animal is framed in the rest. */
  cover: (covered: () => number) => void
  stop: () => void
}

export type PlayOptions = {
  /** Runs on its own: sized to the host, animated, following its size. Off for the benchmark, which drives it. */
  live: boolean
  /** Asks for GPU timestamps (the benchmark's). */
  timed: boolean
  /** On a page of someone else's: without WebGPU, plain water instead of a message. */
  quiet: boolean
}

/** Starts the sea in `host` with `settings` (kept: change them, then `apply`). Undefined without WebGPU. */
export async function play(host: HTMLElement, settings: Settings, opts: PlayOptions): Promise<App | undefined> {
  const water = settings.colour ? (settings.theme === 'light' ? OCEAN_DAY : OCEAN_NIGHT) : settings.theme === 'light' ? MONO_DAY : MONO_NIGHT
  const fail = (text: string): undefined => {
    host.style.background = water
    if (!opts.quiet) host.innerHTML = `<p style="font:16px system-ui;color:#ccd;padding:2em">${text}</p>`
    return undefined
  }
  if (!('gpu' in navigator)) return fail('This page needs WebGPU: a recent Chrome, Edge or Safari.')
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' })
  if (adapter === null) return fail('No WebGPU adapter here.')
  const features: GPUFeatureName[] = opts.timed && adapter.features.has('timestamp-query') ? ['timestamp-query'] : []
  const device = await adapter.requestDevice({ requiredFeatures: features })
  device.lost.then(info => {
    if (info.reason !== 'destroyed') fail(`The GPU was lost: ${info.message}`)
  })
  const canvas = document.createElement('canvas')
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block'
  if (getComputedStyle(host).position === 'static') host.style.position = 'relative'
  host.appendChild(canvas)
  const context = canvas.getContext('webgpu') as unknown as GPUCanvasContext
  const format = navigator.gpu.getPreferredCanvasFormat()
  context.configure({ device, format, alphaMode: 'opaque' })
  return mount(host, canvas, new Gfx(device, context, format, opts.timed), settings, opts.live)
}

function mount(host: HTMLElement, canvas: HTMLCanvasElement, gfx: Gfx, settings: Settings, live: boolean): App {
  const normalWidth = (): number => 1600 * Math.max(0.5, settings.zoomOut)
  const tiles = tileTable()
  const table = new Float32Array(512)
  const unique = [...new Set(GLYPHS)]
  tiles.shade.forEach((s, i) => {
    table[i * 2] = s
    table[i * 2 + 1] = tiles.glyph[i] === '' ? -1 : unique.indexOf(tiles.glyph[i]!)
  })
  let random: Rand = fromFn(Math.random)
  let sea!: Sea
  // Numbers that change every frame live in this object: a closure's variable would box each new value.
  // light: how far the water is from the dark theme to the light one (0 to 1, eased when used); lightTo: where it goes.
  const V = { clock: 0, vl: 0, vt: 0, vs: 1, camZoom: 0, camX: 0, camY: 0, last: performance.now(), owed: 0, light: 0, lightTo: 0 }
  let scale = 1
  let cols = 0
  let rows = 0
  let watch: { sea: Sea; kind: Kind; view: number; x: number; y: number } | undefined
  let covered = (): number => 0
  const deep = new Float32Array(3)
  const waterRGB: [number, number, number] = [0, 0, 0]
  // Everything that differs between the themes, dark then light, as `tint` mixes it: water, deep, then gfx.water's
  // slots 8 to 19 (grid, dashes, specks), the glyphs' ink (lifted or inked) and the caustics. Set by `water`.
  const ENDS = 20
  const ends = new Float32Array(ENDS * 2)
  let caustic = CAUSTIC_NIGHT
  // The order animals are drawn in, deepest first.
  const order = new Int32Array(16)

  function rules(): void {
    sea.atOnce = settings.atOnce
    sea.allowed = new Set(KINDS.flatMap((k, i) => ((settings.species as string[]).includes(k.name) ? [i] : [])))
  }
  function size(): void {
    if (!live) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    canvas.width = Math.round(Math.max(1, host.clientWidth) * dpr)
    canvas.height = Math.round(Math.max(1, host.clientHeight) * dpr)
  }
  function layout(): void {
    const width = normalWidth()
    scale = canvas.width / width
    sea = createSea(width, Math.round(canvas.height / scale))
    rules()
    water()
  }
  function resize(): void {
    const [w, h] = [canvas.width, canvas.height]
    size()
    if (w === canvas.width && h === canvas.height) return
    scale = canvas.width / sea.w
    const depth = Math.round(canvas.height / scale)
    shift(sea, 0, (depth - sea.h) / 2)
    sea.h = depth
    water()
  }
  function rezoom(): void {
    const width = normalWidth()
    const depth = Math.round((canvas.height * width) / canvas.width)
    shift(sea, (width - sea.w) / 2, (depth - sea.h) / 2)
    sea.w = width
    sea.h = depth
    scale = canvas.width / width
    water()
  }
  // Where the camera looks when watching: the middle of the body, or of the school (into M.x, M.y).
  function focusOf(a: Beast): void {
    if (a.fishN > 0) return middleOf(a)
    const n = spineOf(a)
    const f = n > 0 ? a.spine[Math.floor(n * 0.45)]! : a
    ;(focus.x = f.x), (focus.y = f.y)
  }
  const focus = { x: 0, y: 0 }
  /** A name the panel offers that this port does not have (a kind added to src/ since) leaves the open sea as it is. */
  function observe(name: string | null): void {
    if (name === null) {
      watch = undefined
      if (sea.w !== normalWidth()) return rezoom()
    } else {
      const kind = KINDS.findIndex(k => k.name === name)
      if (kind < 0) return
      const k = KD[kind]!
      const world = Math.max(framing(k, 3) * 4, 4000)
      const own = createSea(world, Math.round((world * canvas.height) / canvas.width), 1)
      const a = place(own, kind, random)
      a.depth = a.dive = depthOf(settings.level)
      focusOf(a)
      const [x, y] = a.fishN > 0 ? [M.x, M.y] : [focus.x, focus.y]
      watch = { sea: own, kind: k, view: framing(k, settings.zoomOut), x, y }
    }
    water()
  }
  function framing(k: Kind, zoomOut: number): number {
    return (k.plan === 'school' ? 1500 : Math.max(320, k.length * 2.2)) * (zoomOut / 1.5)
  }

  /** The still water and the mosaic's tiles: new targets, glyphs and dashes. Only on a change, never in a frame. */
  function water(): void {
    const cell = settings.cell
    const mosaic = settings.style === 'mosaic'
    cols = Math.ceil(canvas.width / (cell * scale))
    rows = Math.ceil(canvas.height / (cell * scale))
    const t = cell * scale
    // The glyphs four times as fine, one cell each, drawn as index.ts draws them on its tiles.
    const g = Math.max(4, Math.ceil(t * 4))
    const glyphs = document.createElement('canvas')
    glyphs.width = g * unique.length
    glyphs.height = g
    const gc = glyphs.getContext('2d')!
    gc.font = `700 ${Math.max(4, Math.round(t * 0.72)) * 4}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`
    gc.textAlign = 'center'
    gc.textBaseline = 'middle'
    gc.fillStyle = '#fff'
    unique.forEach((c, i) => gc.fillText(c, i * g + g / 2, g / 2))
    const dashes = new Uint8Array(Math.max(1, cols) * Math.max(1, rows))
    const rand = rng(99)
    for (let i = 0; i < 120; i += 1) {
      const x = Math.floor(rand() * cols)
      const y = Math.floor(rand() * rows)
      dashes[y * cols + x] = Math.min(255, dashes[y * cols + x]! + 1)
    }
    gfx.resize(canvas.width, canvas.height, mosaic, cols, rows, glyphs, dashes, table)
    const w = gfx.water
    const grid = mosaic && settings.grid
    const dashed = grid && watch === undefined
    const dpr = canvas.width / Math.max(1, host.clientWidth || canvas.width)
    const c = settings.colour
    ends.set([...hex(c ? OCEAN_NIGHT : MONO_NIGHT), ...hex(c ? DEEP_DARK : MONO_DEEP_DARK), 1, 1, 1, grid ? 0.028 : 0, 1, 1, 1, dashed ? 0.2 : 0, 1, 1, 1, 0.18, 0, CAUSTIC_NIGHT], 0)
    ends.set([...hex(c ? OCEAN_DAY : MONO_DAY), ...hex(c ? DEEP_LIGHT : MONO_DEEP_LIGHT), 0, 0, 0, grid ? 0.05 : 0, 0, 0, 0, dashed ? 0.12 : 0, 0, 0, 0, 0.14, 1, CAUSTIC_DAY], ENDS)
    w.set([t, cols, rows, mosaic ? 1 : 0], 0)
    w[7] = 1
    w.set([3 * dpr, 1.2 * dpr, t >= 6 ? 1 : 0, g], 24)
    w.set([GLYPH_INK, GLYPH_LIFT], 28)
    tint()
  }

  /** The theme's colours, mixed V.light of the way from dark to light: in a frame of a fade, so it allocates nothing. */
  function tint(): void {
    const p = V.light
    const k = p * p * (3 - 2 * p)
    const w = gfx.water
    for (let i = 0; i < 3; i += 1) {
      waterRGB[i] = ends[i]! + (ends[ENDS + i]! - ends[i]!) * k
      w[4 + i] = waterRGB[i]!
      deep[i] = ends[3 + i]! + (ends[ENDS + 3 + i]! - ends[3 + i]!) * k
    }
    for (let i = 0; i < 12; i += 1) w[8 + i] = ends[6 + i]! + (ends[ENDS + 6 + i]! - ends[6 + i]!) * k
    w[30] = ends[18]! + (ends[ENDS + 18]! - ends[18]!) * k
    caustic = ends[19]! + (ends[ENDS + 19]! - ends[19]!) * k
  }

  // The view, as index.ts's `view()`: from where, at what scale.
  /** Bench: a camera of its own over the open sea, at (cx, cy), `zoom` times closer. 0: none. */
  function view(): Sea {
    if (watch === undefined) {
      if (V.camZoom > 0) {
        V.vs = scale * V.camZoom
        V.vl = V.camX - canvas.width / V.vs / 2
        V.vt = V.camY - canvas.height / V.vs / 2
      } else {
        V.vl = 0
        V.vt = 0
        V.vs = scale
      }
      gfx.water[23] = 0
      return sea
    }
    V.vs = canvas.width / watch.view
    const free = canvas.width - covered() * (canvas.width / Math.max(1, host.clientWidth))
    V.vl = watch.x - free / 2 / V.vs
    V.vt = watch.y - canvas.height / V.vs / 2
    gfx.water[20] = V.vl
    gfx.water[21] = V.vt
    gfx.water[22] = V.vs
    gfx.water[23] = watch.view / 6
    return watch.sea
  }

  /** The box round `a` in sea units, from its discs: into BOX. */
  const BOX = new Float64Array(4)
  function box(a: Beast): void {
    const n = discsOf(a)
    let l = Infinity
    let t = Infinity
    let r = -Infinity
    let b = -Infinity
    for (let i = 0; i < n; i += 1) {
      const x = a.discs[i * 3]!
      const y = a.discs[i * 3 + 1]!
      const d = a.discs[i * 3 + 2]!
      l = Math.min(l, x - d)
      t = Math.min(t, y - d)
      r = Math.max(r, x + d)
      b = Math.max(b, y + d)
    }
    BOX[0] = l
    BOX[1] = t
    BOX[2] = r
    BOX[3] = b
  }

  function paint(): void {
    const pen = gfx.pen
    const P = pen.B
    const Q = pen.Q
    const s = view()
    pen.frame()
    gfx.lowOps.n = gfx.atlasOps.n = gfx.blurOps.n = gfx.blur2Ops.n = gfx.mainOps.n = 0
    gfx.clock = V.clock
    gfx.surface = settings.surface
    const n = s.n
    for (let i = 0; i < n; i += 1) {
      let j = i
      while (j > 0 && s.animals[order[j - 1]!]!.depth < s.animals[i]!.depth) {
        order[j] = order[j - 1]!
        j -= 1
      }
      order[j] = i
    }
    const mosaic = settings.style === 'mosaic'
    // Smooth: the atlas is filled shelf by shelf.
    let ax = 0
    let ay = 0
    let shelf = 0
    for (let o = 0; o < n; o += 1) {
      const a = s.animals[order[o]!]!
      const k = KD[a.kind]!
      box(a)
      const z = sizeOf(a.depth)
      const light1 = settings.surface ? (1 - a.depth) ** 1.5 * caustic : 0
      if (mosaic) {
        const t = settings.cell * scale
        const tu = t / V.vs
        const ls = 2 / tu
        const pad = ((k.reach + 20) / tu + 2) * 2
        const x0 = Math.max(0, Math.floor((BOX[0]! - V.vl) * ls - pad))
        const y0 = Math.max(0, Math.floor((BOX[1]! - V.vt) * ls - pad))
        const x1 = Math.min(cols * 2, Math.ceil((BOX[2]! - V.vl) * ls + pad))
        const y1 = Math.min(rows * 2, Math.ceil((BOX[3]! - V.vt) * ls + pad))
        if (x1 <= x0 || y1 <= y0) continue
        P[0] = x0
        P[1] = y0
        P[2] = x1
        P[3] = y1
        P[4] = ls * z
        P[5] = ls * (1 - z) * a.x - V.vl * ls
        P[6] = ls * (1 - z) * a.y - V.vt * ls
        P[7] = a.depth * TINT
        P[8] = light1
        P[9] = 2.5
        P[10] = a.depth
        P[11] = 1 / ls
        P[12] = V.vl
        P[13] = V.vt
        P[14] = k.plan === 'school' ? 0.5 : 0.4
        pen.begin(gfx.lowOps, deep)
        DRAW[k.plan](pen, a, tu)
        pen.end()
        continue
      }
      const blur = Math.max(0, a.depth - 0.25) * BLUR * V.vs
      const pad = (k.reach + 20) * V.vs + blur * 2 + 2
      const x0 = Math.max(0, Math.floor((BOX[0]! - V.vl) * V.vs - pad))
      const y0 = Math.max(0, Math.floor((BOX[1]! - V.vt) * V.vs - pad))
      const x1 = Math.min(canvas.width, Math.ceil((BOX[2]! - V.vl) * V.vs + pad))
      const y1 = Math.min(canvas.height, Math.ceil((BOX[3]! - V.vt) * V.vs + pad))
      if (x1 <= x0 || y1 <= y0) continue
      const tx = V.vs * (1 - z) * a.x - V.vl * V.vs
      const ty = V.vs * (1 - z) * a.y - V.vt * V.vs
      let q = blur >= 0.5 ? Math.min(0.5, 2 / blur) : 0
      // A place in the atlas, smaller if it will not fit.
      let rx = 0
      let ry = 0
      for (let tries = 0; q > 0 && tries < 3; tries += 1) {
        const w = Math.ceil((x1 - x0) * q) + 2
        const h = Math.ceil((y1 - y0) * q) + 2
        let px = ax
        let py = ay
        let ph = shelf
        if (px + w > ATLAS_W) {
          px = 0
          py += ph
          ph = 0
        }
        if (w <= ATLAS_W && py + h <= ATLAS_H) {
          rx = px
          ry = py
          ax = px + w
          ay = py
          shelf = Math.max(ph, h)
          break
        }
        q *= 0.5
        if (tries === 2) q = 0
      }
      if (q === 0) {
        P[0] = x0
        P[1] = y0
        P[2] = x1
        P[3] = y1
        P[4] = V.vs * z
        P[5] = tx
        P[6] = ty
        P[7] = a.depth * FADE
        P[8] = light1
        P[9] = 1
        P[10] = a.depth
        P[11] = 1 / V.vs
        P[12] = V.vl
        P[13] = V.vt
        P[14] = 0.5
        pen.begin(gfx.mainOps, deep)
        DRAW[k.plan](pen, a, 0)
        pen.end()
        continue
      }
      const w = Math.ceil((x1 - x0) * q) + 2
      const h = Math.ceil((y1 - y0) * q) + 2
      const px = 1 / (q * V.vs)
      P[0] = rx
      P[1] = ry
      P[2] = rx + w
      P[3] = ry + h
      P[4] = V.vs * z * q
      P[5] = (tx - x0) * q + rx + 1
      P[6] = (ty - y0) * q + ry + 1
      P[7] = a.depth * FADE
      P[8] = light1
      P[9] = 1
      P[10] = a.depth
      P[11] = px
      P[12] = V.vl + x0 / V.vs - (rx + 1) * px
      P[13] = V.vt + y0 / V.vs - (ry + 1) * px
      P[14] = 0.5
      pen.begin(gfx.atlasOps, deep)
      DRAW[k.plan](pen, a, 0)
      pen.end()
      const sigma = blur * q
      Q[0] = rx
      Q[1] = ry
      Q[2] = rx + w
      Q[3] = ry + h
      Q[4] = sigma
      Q[5] = 1
      Q[6] = 0
      Q[7] = 0
      Q[8] = 0
      gfx.blurOps.push(OP_QUAD, pen.quad(), 0, 0, 0)
      Q[0] = rx
      Q[1] = ry
      Q[2] = rx + w
      Q[3] = ry + h
      Q[4] = sigma
      Q[5] = 0
      Q[6] = 1
      Q[7] = 0
      Q[8] = 0
      gfx.blur2Ops.push(OP_QUAD, pen.quad(), 0, 0, 0)
      gfx.mainOps.push(OP_SCISSOR, 0, 0, canvas.width, canvas.height)
      Q[0] = x0
      Q[1] = y0
      Q[2] = x1
      Q[3] = y1
      Q[4] = rx + 1
      Q[5] = ry + 1
      Q[6] = rx + 1 + (x1 - x0) * q
      Q[7] = ry + 1 + (y1 - y0) * q
      Q[8] = 0
      gfx.mainOps.push(OP_QUAD, pen.quad(), 0, 0, 0)
    }
    gfx.draw(mosaic, watch !== undefined, waterRGB)
  }

  function stepOnce(): void {
    if (watch === undefined) {
      stepSea(sea, STEP, MARGIN, random)
    } else {
      stepSea(watch.sea, STEP, MARGIN, random)
      const a = watch.sea.n > 0 ? watch.sea.animals[0]! : undefined
      if (a !== undefined) {
        a.dive = depthOf(settings.level)
        focusOf(a)
        const fx = a.fishN > 0 ? M.x : focus.x
        const fy = a.fishN > 0 ? M.y : focus.y
        watch.x += (fx - watch.x) * 0.04
        watch.y += (fy - watch.y) * 0.04
      }
    }
    V.clock += STEP
  }

  /**
   * Before the first frame, every drawing and the sea's every path, run for a moment off screen: V8 first runs code in
   * tiers that box every number (allocations) and drops back to them when it meets a path it has not seen. Warmed
   * up, they are optimized before the sea is shown. Takes a fraction of a second.
   */
  function warmJit(): void {
    const t0 = performance.now()
    // Its own randomness: the sea's own (Math.random, or the benchmark's seed) is left as it was.
    const random = fromFn(rng(1))
    const pen = gfx.pen
    const ops = new Ops()
    const B = pen.B
    const kinds = KINDS.length
    for (let kind = 0; kind < kinds; kind += 1) {
      const own = createSea(4000, 2250, 1)
      const a = place(own, kind, random)
      for (let i = 0; i < 120; i += 1) {
        stepSea(own, STEP, MARGIN, random)
        pen.frame()
        ops.n = 0
        for (let style = 0; style < 2; style += 1) {
          B.set([0, 0, 4096, 4096, 0.5, -a.x * 0.5 + 2048, -a.y * 0.5 + 2048, 0.3, 0.2, style === 0 ? 1 : 2.5, 0.5, 2, 0, 0, 0.5])
          pen.begin(ops, deep)
          DRAW[KD[kind]!.plan](pen, a, style === 0 ? 0 : 7.5)
          pen.end()
        }
      }
    }
    // The open sea, and a school among its hunters: arrivals, chases, flight, giving way, the school parting.
    for (let pass = 0; pass < 2; pass += 1) {
      const open = createSea(2400, 1350)
      open.atOnce = 8
      if (pass === 1) open.allowed = new Set(KINDS.flatMap((k, i) => (['jacks', 'dolphin', 'tiger', 'hammer', 'blue'].includes(k.name) ? [i] : [])))
      for (let i = 0; i < 1800; i += 1) stepSea(open, STEP, MARGIN, random)
    }
    pen.frame()
    warmed = performance.now() - t0
  }
  let warmed = 0

  V.light = V.lightTo = settings.theme === 'light' ? 1 : 0
  size()
  warmJit()
  layout()
  if (settings.observe !== null) observe(settings.observe)

  let frame = 0
  const tick = (now: number): void => {
    const dt = Math.min(0.25, (now - V.last) / 1000)
    V.owed += settings.paused ? 0 : dt * settings.speed
    V.last = now
    // A step for every sixtieth of a second; a quarter step of slack so a frame that comes a hair early or late
    // still takes one step, and never two then none.
    let stepped = false
    while (V.owed >= STEP * 0.75) {
      stepOnce()
      V.owed -= STEP
      stepped = true
    }
    // A theme fading in: its colours move on every frame, the sea paused or not.
    const fading = V.light !== V.lightTo
    if (fading) {
      const d = dt / THEME_FADE
      V.light = V.light < V.lightTo ? Math.min(V.lightTo, V.light + d) : Math.max(V.lightTo, V.light - d)
      tint()
    }
    if (stepped || fading) paint()
    frame = requestAnimationFrame(tick)
  }

  const apply = (patch: Partial<Settings>): void => {
    if (patch.zoomOut !== undefined) {
      if (watch !== undefined) watch.view = framing(watch.kind, settings.zoomOut)
      else rezoom()
    }
    if (patch.observe !== undefined) observe(patch.observe)
    // A theme alone is no new water: its colours fade there in `tick` (at once with nothing running, or reduced motion).
    if (patch.theme !== undefined) {
      V.lightTo = settings.theme === 'light' ? 1 : 0
      if (!live || frame === 0 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        V.light = V.lightTo
        tint()
      }
    }
    if (patch.style !== undefined || patch.cell !== undefined || patch.grid !== undefined || patch.colour !== undefined) water()
    if (patch.species !== undefined || patch.atOnce !== undefined) {
      rules()
      // Nothing vanishes: a kind no longer wanted, and the oldest beyond the new count, swim off.
      const oldest = sea.animals.slice(0, sea.n).sort((a, b) => b.age - a.age)
      oldest.forEach((a, i) => {
        if (!sea.allowed.has(a.kind) || i < sea.n - sea.atOnce) a.stay = 0
      })
    }
    paint()
  }

  let observer: ResizeObserver | undefined
  if (live) {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')
    if (reduced.matches) {
      for (let i = 0; i < 1500; i += 1) stepSea(sea, STEP, MARGIN, random)
      paint()
    } else {
      paint()
      frame = requestAnimationFrame(tick)
    }
    observer = new ResizeObserver(() => {
      resize()
      paint()
    })
    observer.observe(host)
  }

  return {
    settings,
    gfx,
    canvas,
    relayout: layout,
    restart: r => {
      random = r
      V.clock = 0
      layout()
    },
    stepAndDraw: (cx, cy, zoom) => {
      V.camX = cx
      V.camY = cy
      V.camZoom = zoom
      stepOnce()
      paint()
    },
    sea: () => sea,
    warmed: () => warmed,
    warm: steps => {
      for (let i = 0; i < steps; i += 1) stepOnce()
    },
    apply,
    inView: () => [...new Set(sea.animals.slice(0, sea.n).map(a => KD[a.kind]!.name))] as Names,
    cover: c => {
      covered = c
    },
    stop: () => {
      cancelAnimationFrame(frame)
      observer?.disconnect()
      canvas.remove()
    },
  }
}
