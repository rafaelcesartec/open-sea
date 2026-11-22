// Open Water, live: a dark sea seen from above, on a canvas, and the animals passing through it at their real sizes:
// sharks, a blue whale, orcas, dolphins, a sea turtle, a manta, a giant squid, a school of bigeye trevally.
//
// The sea is simulated as it runs (sim.ts): each animal decides as it goes, with real randomness, so no two minutes
// are alike. At most four are in view; each comes in from beyond an edge, stays a while and swims off, and another
// kind comes in. They wander, burst and glide, give way to each other, and hunters chase what they really hunt.
//
// HOW IT IS DRAWN, every frame: each animal by the drawing for its plan of body (draw/), in sea units.
// With `style: 'mosaic'` (the default) the animals are painted onto a tiny canvas, one pixel a tile, and each lit
// tile is drawn a little brighter or darker than its neighbours, with a glyph cut into it: tiles light up and go dark
// in place as an animal passes. `style: 'smooth'` shows the drawn animals themselves.

import { DRAW } from './draw/all.ts'
import { CLEAR, DEEP_DARK, DEEP_LIGHT, GLYPH_INK, GLYPH_LIFT, MONO_DAY, MONO_DEEP_DARK, MONO_DEEP_LIGHT, MONO_NIGHT, OCEAN_DAY, OCEAN_NIGHT, TINT, rng, tileTable } from './mosaic.ts'
import { mountPanel, type Settings } from './panel.ts'
import { KINDS, createSea, depthOf, discsOf, middleOf, place, shift, sizeOf, spineOf, stepSea, type Animal, type Kind, type Point, type Sea } from './sim.ts'

export type Options = {
  /** 'mosaic' (default): the animals as glyph tiles. 'smooth': the drawn animals themselves. */
  style?: 'mosaic' | 'smooth'
  /** 'dark' (default): a night sea. 'light': pale water. */
  theme?: 'dark' | 'light'
  /** How far off the sea is seen: 1 as designed, more shows a wider sea with smaller animals. Default 1.5. */
  zoomOut?: number
  /** Mosaic only: the tile's size, in units of the sea. Smaller, finer mosaic. Default 10. */
  cell?: number
  /** At most this many animals in view at once (a school counts as one). Default 4. */
  atOnce?: number
  /** The kinds that may come in. Default all. */
  species?: Kind['name'][]
  /** How fast time runs: 1 real time. Default 1. */
  speed?: number
  /** Light from the surface: caustics rippling over the animals, the shallower the brighter. Default true. */
  surface?: boolean
  /** The sea's colour: the blue of the open ocean by day and night, or black and white as before. Default true. */
  colour?: boolean
  /** Mosaic only: the faint grid and the loose dashes over the water. false leaves the water plain, the animals
   * alone on it. Default true. */
  grid?: boolean
  /** The dark theme's water. Default #0a2034 (the night ocean). */
  background?: string
  /** A floating panel on the right to change all of the above as it runs; the viewer's choices are remembered. */
  controls?: boolean
}

const LIGHT = OCEAN_DAY
/** How far the deepest fade into the deep water (DEEP_DARK, DEEP_LIGHT: mosaic.ts), and how blurred they are, in sea
 * units (the smooth style only). */
const FADE = 0.8
const BLUR = 7
/** Caustics: how bright on an animal at the surface, by day and by night; and the two nets of them, each as its
 * scale and its drift in units a second, crossing so the light shimmers. */
const CAUSTIC_DAY = 0.26
const CAUSTIC_NIGHT = 0.12
const NETS: [number, number, number][] = [
  [1, 9, 4],
  [1.37, -6, 7],
]
const SAVED = 'open-water:settings'

/** Seconds of sea a step of the simulation covers: one a frame at 60 frames a second. */
const STEP = 1 / 60
/** Units kept between bodies (the simulation's margin). */
const MARGIN = 20

/** A colour in whole numbers: what the browser would round to anyway, and far quicker for it to write and read. */
const rgb = (r: number, g: number, b: number): string => `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`

/**
 * Caustic light, as the surface's ripples focus the sun or the moon on whatever lies below: a net of bright lines
 * round cells about half a metre across, tiling seamlessly, one pixel a unit of the sea. Made once.
 */
function causticNet(): ImageData {
  const n = 128
  const rand = rng(5)
  const seeds = Array.from({ length: 10 }, () => [rand() * n, rand() * n] as const)
  const img = new ImageData(n, n)
  for (let y = 0; y < n; y += 1) {
    for (let x = 0; x < n; x += 1) {
      // Bright where two cells meet: the nearest seed and the next are about as far. The water bends them into
      // wavering lines (waves whole times across, so it still tiles).
      const wx = x + 5 * Math.sin((4 * Math.PI * y) / n) + 3 * Math.sin((6 * Math.PI * (x + y)) / n)
      const wy = y + 5 * Math.sin((4 * Math.PI * x) / n) + 3 * Math.sin((6 * Math.PI * (x - y)) / n)
      let d1 = Infinity
      let d2 = Infinity
      for (const [sx, sy] of seeds) {
        for (let ox = -n; ox <= n; ox += n) {
          for (let oy = -n; oy <= n; oy += n) {
            const d = Math.hypot(wx - sx - ox, wy - sy - oy)
            if (d < d1) [d1, d2] = [d, d1]
            else if (d < d2) d2 = d
          }
        }
      }
      const i = (y * n + x) * 4
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255
      img.data[i + 3] = Math.max(0, 1 - (d2 - d1) / 10) ** 3 * 255
    }
  }
  return img
}

/** Starts Open Water in `host` (any element; the canvas fills it). Returns a function that stops it. */
export function mountOpenWater(host: HTMLElement, options: Options = {}): () => void {
  const settings: Settings = {
    theme: options.theme ?? 'dark',
    style: options.style ?? 'mosaic',
    zoomOut: options.zoomOut ?? 1.5,
    cell: options.cell ?? 10,
    atOnce: options.atOnce ?? 4,
    species: options.species ?? KINDS.map(k => k.name),
    speed: options.speed ?? 1,
    paused: false,
    observe: null,
    level: 1,
    surface: options.surface ?? true,
    colour: options.colour ?? true,
    grid: options.grid ?? true,
  }
  if (options.controls === true) {
    // The viewer's last choices, if this browser kept them.
    try {
      Object.assign(settings, JSON.parse(localStorage.getItem(SAVED) ?? '{}') as Partial<Settings>, { paused: false })
    } catch {
      // No storage here: the defaults stand.
    }
    // What was kept may be from an older version or tampered with: only what makes sense now.
    const number = (v: unknown, lo: number, hi: number, fallback: number): number => (typeof v === 'number' && v >= lo && v <= hi ? v : fallback)
    settings.theme = settings.theme === 'light' ? 'light' : 'dark'
    settings.style = settings.style === 'smooth' ? 'smooth' : 'mosaic'
    settings.zoomOut = number(settings.zoomOut, 0.6, 3, 1.5)
    settings.cell = number(settings.cell, 6, 20, 10)
    settings.atOnce = number(settings.atOnce, 1, 8, 4)
    settings.speed = [0.5, 1, 2].includes(settings.speed) ? settings.speed : 1
    settings.surface = settings.surface !== false
    settings.colour = settings.colour !== false
    settings.grid = settings.grid !== false
    settings.level = [1, 2, 3].includes(settings.level) ? settings.level : 1
    settings.species = Array.isArray(settings.species) ? KINDS.map(k => k.name).filter(n => settings.species.includes(n)) : KINDS.map(k => k.name)
    // Watching one animal is for now, not for next time.
    settings.observe = null
  }
  const darkWater = options.background ?? OCEAN_NIGHT
  /** The open sea's width in units at the distance chosen: 1600 as designed. */
  const normalWidth = (): number => 1600 * Math.max(0.5, settings.zoomOut)
  const tiles = tileTable()

  const canvas = document.createElement('canvas')
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block'
  if (getComputedStyle(host).position === 'static') host.style.position = 'relative'
  host.appendChild(canvas)
  const ctx = canvas.getContext('2d')!
  // Mosaic: one pixel a tile; the bodies painted here are sampled at each tile's centre.
  const low = document.createElement('canvas')
  const lctx = low.getContext('2d', { willReadFrequently: true })!
  // The still water: in the mosaic, a faint grid and a few loose dashes; drawn once.
  const still = document.createElement('canvas')
  // Each animal is drawn alone on one of these, faded as deep as it swims, then laid on the rest: one the window's
  // size, one the mosaic's (kept apart, as the mosaic's is read back).
  const layer = document.createElement('canvas')
  const lowLayer = document.createElement('canvas')
  const lowLayerCtx = lowLayer.getContext('2d', { willReadFrequently: true })!
  const net = causticNet()
  // Its pattern for each layer, from a canvas of the same kind (the mosaic's works in memory, the other on the GPU):
  // crossing between the two every frame would cost more than all the rest.
  const nets = new Map<CanvasRenderingContext2D, CanvasPattern>()
  /** Seconds of sea gone by, for the light at the surface: it stops when time does. */
  let clock = 0

  // Set by layout(), which runs before anything reads it.
  let sea!: Sea
  let scale = 1
  let cols = 0
  let rows = 0
  /** Mosaic: how deep the body lighting each tile swims. */
  let deep = new Float32Array(0)
  /**
   * Watching one animal: a sea of its own, far wider than the view, with only that animal in it, and a camera that
   * follows it, framed by its size. It swims, turns and bursts as ever; it just never leaves the middle of the view.
   */
  let watch: { sea: Sea; kind: Kind; view: number; x: number; y: number } | undefined
  let panel: ReturnType<typeof mountPanel> | undefined

  /** The sea's settings that the simulation reads: how many at once, which kinds. */
  function rules(): void {
    sea.atOnce = settings.atOnce
    sea.allowed = new Set(KINDS.flatMap((k, i) => (settings.species.includes(k.name) ? [i] : [])))
  }

  /** A new sea the size of the window, at the start. */
  function layout(): void {
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    canvas.width = Math.round(Math.max(1, host.clientWidth) * dpr)
    canvas.height = Math.round(Math.max(1, host.clientHeight) * dpr)
    // The sea spans the window's width; as deep as the window is tall, at that scale.
    const width = normalWidth()
    scale = canvas.width / width
    sea = createSea(width, Math.round(canvas.height / scale))
    rules()
    water()
  }

  /**
   * The window changed size: the sea keeps its width in units, and only gains or loses water above and below, about
   * its middle; every animal stays where it was. Nothing starts over. A watched animal's camera just frames the new
   * shape.
   */
  function resize(): void {
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const width = Math.round(Math.max(1, host.clientWidth) * dpr)
    const height = Math.round(Math.max(1, host.clientHeight) * dpr)
    if (width === canvas.width && height === canvas.height) return
    canvas.width = width
    canvas.height = height
    scale = width / sea.w
    const depth = Math.round(height / scale)
    shift(sea, 0, (depth - sea.h) / 2)
    sea.h = depth
    water()
  }

  /**
   * The open sea seen from a new distance, without starting it over: it grows or shrinks about its middle and every
   * animal stays where it was. Nearer in, one left wholly out of view is gone, as anything that leaves the view is;
   * further off, the new water at the edges fills as animals come in.
   */
  function rezoom(): void {
    const width = normalWidth()
    const depth = Math.round((canvas.height * width) / canvas.width)
    shift(sea, (width - sea.w) / 2, (depth - sea.h) / 2)
    sea.w = width
    sea.h = depth
    scale = canvas.width / width
    water()
  }

  /** Where the camera looks when watching: the middle of the body, or of the school. */
  function focusOf(a: Animal): Point {
    if (a.fish.length > 0) return middleOf(a.fish)
    const frames = spineOf(a)
    return frames[Math.floor(frames.length * 0.45)] ?? a
  }

  /** Starts watching an animal of kind `name`, or stops (null): the open sea carries on where it was. */
  function observe(name: Kind['name'] | null): void {
    if (name === null) {
      watch = undefined
      // The distance may have changed while watching.
      if (sea.w !== normalWidth()) {
        rezoom()
        return
      }
    } else {
      const kind = KINDS.findIndex(k => k.name === name)
      const k = KINDS[kind]!
      // Its own sea, wide enough that it roams freely even seen from furthest off.
      const world = Math.max(framing(k, 3) * 4, 4000)
      const own = createSea(world, Math.round((world * canvas.height) / canvas.width))
      const a = place(own, kind)
      a.depth = a.dive = depthOf(settings.level)
      const focus = focusOf(a)
      watch = { sea: own, kind: k, view: framing(k, settings.zoomOut), x: focus.x, y: focus.y }
    }
    water()
  }

  /** How wide a view frames a watched animal: at the default distance it takes a little under half the width (a
   * school, its whole shoal); the distance setting moves the camera in or out from there. */
  function framing(k: Kind, zoomOut: number): number {
    return (k.plan === 'school' ? 1500 : Math.max(320, k.length * 2.2)) * (zoomOut / 1.5)
  }

  /** What is drawn and from where: the open sea from its corner, or the watched animal from the camera. */
  function view(): { animals: Animal[]; left: number; top: number; s: number } {
    if (watch === undefined) return { animals: sea.animals, left: 0, top: 0, s: scale }
    const s = canvas.width / watch.view
    // In the middle of the water left free: the open panel covers the right of it.
    const free = canvas.width - (panel?.covered() ?? 0) * (canvas.width / Math.max(1, host.clientWidth))
    return { animals: watch.sea.animals, left: watch.x - free / 2 / s, top: watch.y - canvas.height / s / 2, s }
  }

  /**
   * Specks drifting in the water while watching, fixed in the sea: as the camera follows the animal they stream past,
   * so its own speed shows. Scattered by a hash of where they are, so the same water always holds the same specks.
   */
  function specks(v: ReturnType<typeof view>): void {
    const g = watch!.view / 6
    const dpr = canvas.width / Math.max(1, host.clientWidth)
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.fillStyle = settings.theme === 'light' ? 'rgba(0,0,0,.14)' : 'rgba(255,255,255,.18)'
    const right = v.left + canvas.width / v.s
    const bottom = v.top + canvas.height / v.s
    for (let gx = Math.floor(v.left / g); gx * g < right; gx += 1) {
      for (let gy = Math.floor(v.top / g); gy * g < bottom; gy += 1) {
        const rand = rng(Math.imul(gx, 73856093) ^ Math.imul(gy, 19349663))
        for (let i = 0; i < 3; i += 1) {
          const x = ((gx + rand()) * g - v.left) * v.s
          const y = ((gy + rand()) * g - v.top) * v.s
          ctx.fillRect(x, y, 3 * dpr, 1.2 * dpr)
        }
      }
    }
  }

  /** The still water, drawn once for each theme, style, tile and grid: in the mosaic, a faint grid and a few dashes. */
  function water(): void {
    const cell = settings.cell
    const light = settings.theme === 'light'
    // As many tiles as fit the window at the open sea's scale (the sea's width may be a watched animal's world).
    cols = Math.ceil(canvas.width / (cell * scale))
    rows = Math.ceil(canvas.height / (cell * scale))
    low.width = cols
    low.height = rows
    deep = new Float32Array(cols * rows)
    still.width = canvas.width
    still.height = canvas.height
    const sctx = still.getContext('2d')!
    sctx.fillStyle = settings.colour ? (light ? LIGHT : darkWater) : light ? MONO_DAY : MONO_NIGHT
    sctx.fillRect(0, 0, still.width, still.height)
    if (settings.style === 'mosaic' && settings.grid) {
      sctx.strokeStyle = light ? 'rgba(0,0,0,.05)' : 'rgba(255,255,255,.028)'
      sctx.lineWidth = 1
      sctx.beginPath()
      for (let c = 0; c <= cols; c += 1) {
        const x = Math.round(c * cell * scale) + 0.5
        sctx.moveTo(x, 0)
        sctx.lineTo(x, still.height)
      }
      for (let r = 0; r <= rows; r += 1) {
        const y = Math.round(r * cell * scale) + 0.5
        sctx.moveTo(0, y)
        sctx.lineTo(still.width, y)
      }
      sctx.stroke()
    }
    // The fixed dashes only in the open sea: while watching, drifting specks show the water instead.
    if (settings.style === 'mosaic' && settings.grid && watch === undefined) {
      const rand = rng(99)
      sctx.fillStyle = light ? 'rgba(0,0,0,.12)' : 'rgba(255,255,255,.2)'
      for (let i = 0; i < 120; i += 1) {
        const x = Math.floor(rand() * cols) * cell
        const y = Math.floor(rand() * rows) * cell
        sctx.fillRect((x + cell * 0.3) * scale, (y + cell * 0.45) * scale, cell * 0.4 * scale, cell * 0.1 * scale)
      }
    }
  }

  /**
   * Draws `a` alone on `c` (sized as `onto`), seen at scale `s` from (`left`, `top`), fades it toward the deep water as
   * deep as it swims, lights it with the caustics, and lays it on `onto`, blurred by `blur` pixels.
   */
  function lay(onto: CanvasRenderingContext2D, c: CanvasRenderingContext2D, a: Animal, tile: number, s: number, left: number, top: number, blur: number): [number, number, number, number] | undefined {
    const { width, height } = onto.canvas
    if (c.canvas.width !== width || c.canvas.height !== height) {
      c.canvas.width = width
      c.canvas.height = height
    }
    // Only the water round it is worked: its body, all it sweeps, and the blur's spread.
    const k = KINDS[a.kind]!
    const discs = discsOf(a)
    const pad = (k.reach + 20) * s + blur * 2 + 2
    let [l, t, r, b] = [Infinity, Infinity, -Infinity, -Infinity]
    for (const d of discs) {
      l = Math.min(l, d.x - d.r)
      t = Math.min(t, d.y - d.r)
      r = Math.max(r, d.x + d.r)
      b = Math.max(b, d.y + d.r)
    }
    const x0 = Math.max(0, Math.floor((l - left) * s - pad))
    const y0 = Math.max(0, Math.floor((t - top) * s - pad))
    const x1 = Math.min(width, Math.ceil((r - left) * s + pad))
    const y1 = Math.min(height, Math.ceil((b - top) * s + pad))
    if (x1 <= x0 || y1 <= y0) return undefined
    const [w, h] = [x1 - x0, y1 - y0]
    c.setTransform(1, 0, 0, 1, 0, 0)
    c.clearRect(x0, y0, w, h)
    // Drawn about its own middle, a size by depth: the same as the scaleAbout of the backdrop's drawing.
    const z = sizeOf(a.depth)
    c.setTransform(s * z, 0, 0, s * z, s * (1 - z) * a.x - left * s, s * (1 - z) * a.y - top * s)
    // A mosaic tile takes one sample: smoothing the caustics there would only cost.
    c.imageSmoothingEnabled = tile === 0
    c.lineJoin = 'round'
    DRAW[k.plan](c, a, tile)
    c.setTransform(1, 0, 0, 1, 0, 0)
    c.globalCompositeOperation = 'source-atop'
    c.globalAlpha = a.depth * (tile > 0 ? TINT : FADE)
    c.fillStyle = settings.colour ? (settings.theme === 'light' ? DEEP_LIGHT : DEEP_DARK) : settings.theme === 'light' ? MONO_DEEP_LIGHT : MONO_DEEP_DARK
    c.fillRect(x0, y0, w, h)
    if (settings.surface) {
      // The caustics play over its back, fixed in the water as it swims under them, faint as it goes deeper. The
      // mosaic's tile is coarser than their lines: there they are drawn larger, so they still read.
      const coarse = tile > 0 ? 2.5 : 1
      c.globalAlpha = (1 - a.depth) ** 1.5 * (settings.theme === 'light' ? CAUSTIC_DAY : CAUSTIC_NIGHT)
      let pattern = nets.get(c)
      if (pattern === undefined) {
        const source = document.createElement('canvas')
        source.width = net.width
        source.height = net.height
        source.getContext('2d', { willReadFrequently: c === lowLayerCtx })!.putImageData(net, 0, 0)
        pattern = c.createPattern(source, 'repeat')!
        nets.set(c, pattern)
      }
      for (const [u, dx, dy] of NETS) {
        const q = u * coarse * s
        pattern.setTransform(new DOMMatrix([q, 0, 0, q, (dx * clock - left) * s, (dy * clock - top) * s]))
        c.fillStyle = pattern
        c.fillRect(x0, y0, w, h)
      }
    }
    c.globalAlpha = 1
    c.globalCompositeOperation = 'source-over'
    onto.setTransform(1, 0, 0, 1, 0, 0)
    if (blur >= 0.5) onto.filter = `blur(${blur.toFixed(1)}px)`
    onto.drawImage(c.canvas, x0, y0, w, h, x0, y0, w, h)
    onto.filter = 'none'
    return [x0, y0, w, h]
  }

  function paint(): void {
    const cell = settings.cell
    const v = view()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.drawImage(still, 0, 0)
    if (watch !== undefined) specks(v)
    // The deepest first: one nearer the surface passes over it.
    const animals = [...v.animals].sort((a, b) => b.depth - a.depth)
    if (settings.style === 'smooth') {
      const c = layer.getContext('2d')!
      for (const a of animals) lay(ctx, c, a, 0, v.s, v.left, v.top, Math.max(0, a.depth - 0.25) * BLUR * v.s)
      return
    }
    // The tiles keep their size on screen whatever the framing: closer in, a tile covers less of the animal.
    const tu = (cell * scale) / v.s
    lctx.setTransform(1, 0, 0, 1, 0, 0)
    lctx.clearRect(0, 0, cols, rows)
    // How deep the body lighting each tile swims: the shallowest over it, as it is drawn last.
    deep.fill(0)
    for (const a of animals) {
      const box = lay(lctx, lowLayerCtx, a, tu, 1 / tu, v.left, v.top, 0)
      if (box === undefined) continue
      const [x0, y0, w, h] = box
      const body = lowLayerCtx.getImageData(x0, y0, w, h).data
      for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) if (body[(y * w + x) * 4 + 3]! >= 128) deep[(y0 + y) * cols + x0 + x] = a.depth
    }
    const px = lctx.getImageData(0, 0, cols, rows).data
    const size = cell * scale
    const light = settings.theme === 'light'
    const inset = Math.max(0.5, size * 0.06)
    ctx.font = `700 ${Math.max(4, Math.round(size * 0.72))}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        const i = (r * cols + c) * 4
        // A tile lights only where a body covers most of it.
        if (px[i + 3]! < 128) continue
        const tile = (r % 16) * 16 + (c % 16)
        const shade = tiles.shade[tile]!
        const [cr, cg, cb] = [px[i]!, px[i + 1]!, px[i + 2]!]
        const x = c * size
        const y = r * size
        ctx.globalAlpha = 1 - deep[r * cols + c]! * CLEAR
        ctx.fillStyle = rgb(cr * shade, cg * shade, cb * shade)
        ctx.fillRect(x + inset, y + inset, size - 2 * inset, size - 2 * inset)
        const g = tiles.glyph[tile]!
        if (g !== '' && size >= 6) {
          // The glyph cut into the tile: a darker shade of it on the night sea, a lighter one in pale water.
          ctx.fillStyle = light
            ? rgb(cr + (255 - cr) * GLYPH_LIFT, cg + (255 - cg) * GLYPH_LIFT, cb + (255 - cb) * GLYPH_LIFT)
            : rgb(cr * GLYPH_INK, cg * GLYPH_INK, cb * GLYPH_INK)
          ctx.fillText(g, x + size / 2, y + size / 2 + size * 0.04)
        }
      }
    }
    ctx.globalAlpha = 1
  }

  layout()

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')
  let frame = 0
  let last = performance.now()
  let owed = 0
  const tick = (now: number): void => {
    // A step of sea for every sixtieth of a second gone by; a long pause (a hidden tab) is not caught up.
    owed += settings.paused ? 0 : Math.min(0.25, (now - last) / 1000) * settings.speed
    last = now
    let stepped = false
    while (owed >= STEP) {
      if (watch === undefined) {
        stepSea(sea, STEP, MARGIN)
      } else {
        stepSea(watch.sea, STEP, MARGIN)
        // The camera eases after the animal, so a burst or a turn shows as the animal moving in the frame.
        const a = watch.sea.animals[0]
        if (a !== undefined) {
          // At the level chosen: it rises or sinks there, slowly, as it would.
          a.dive = depthOf(settings.level)
          const f = focusOf(a)
          watch.x += (f.x - watch.x) * 0.04
          watch.y += (f.y - watch.y) * 0.04
        }
      }
      owed -= STEP
      clock += STEP
      stepped = true
    }
    if (stepped) paint()
    frame = requestAnimationFrame(tick)
  }
  if (reduced.matches) {
    // Still: some seconds in, so a few animals are in view, and no motion.
    for (let i = 0; i < 1500; i += 1) stepSea(sea, STEP, MARGIN)
    paint()
  } else {
    paint()
    frame = requestAnimationFrame(tick)
  }

  const observer = new ResizeObserver(() => {
    resize()
    paint()
  })
  observer.observe(host)

  /** A change from the panel, applied as the sea runs. */
  function apply(patch: Partial<Settings>): void {
    if (patch.zoomOut !== undefined) {
      if (watch !== undefined) {
        // Watching: only the camera moves in or out; the open sea follows on going back to it.
        watch.view = framing(watch.kind, settings.zoomOut)
      } else {
        rezoom()
      }
    }
    if (patch.observe !== undefined) observe(patch.observe)
    if (patch.theme !== undefined || patch.style !== undefined || patch.cell !== undefined || patch.grid !== undefined || patch.colour !== undefined) water()
    if (patch.species !== undefined || patch.atOnce !== undefined) {
      rules()
      // Nothing vanishes: a kind no longer wanted, and the oldest beyond the new count, swim off.
      const oldest = [...sea.animals].sort((a, b) => b.age - a.age)
      oldest.forEach((a, i) => {
        if (!sea.allowed.has(a.kind) || i < sea.animals.length - sea.atOnce) a.stay = 0
      })
    }
    paint()
    try {
      localStorage.setItem(SAVED, JSON.stringify(settings))
    } catch {
      // Not remembered: no storage here.
    }
  }
  panel = options.controls === true ? mountPanel(host, settings, apply, () => [...new Set(sea.animals.map(a => KINDS[a.kind]!.name))]) : undefined

  return () => {
    cancelAnimationFrame(frame)
    observer.disconnect()
    canvas.remove()
    panel?.remove()
  }
}
