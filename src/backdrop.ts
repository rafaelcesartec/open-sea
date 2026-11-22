// The sea as a backdrop for a surface that takes an SVG and runs no script (the Claude app's): the same simulation and
// drawings as the page, sent a few seconds at a time. Each send is a stretch of the sea, sampled up to ten times a
// second: in the mosaic, the tiles that change at each sample (mosaic.ts); in the smooth style, the shapes moved
// between samples by SMIL (svg.ts).
// ONE SEA FOR EVERY SESSION: the sea runs on the clock. Its samples are counted from the Unix epoch, so `at(from)` is
// the stretch that starts at a moment every session agrees on; its randomness is seeded at its birth and kept with
// it, so the same steps give the same sea; and `saved` hands it on, for a session that starts later to carry on the
// very same animals instead of a sea of its own.
// shortcut: no caustics, no blur of the deep; upgrade if the app takes it well.

import { DRAW } from './draw/all.ts'
import type { Ctx } from './draw/common.ts'
import { OCEAN_DAY, OCEAN_NIGHT, createMosaic, waterStyle, type Shot } from './mosaic.ts'
import { KINDS, createSea, sizeOf, stepSea, type Animal, type Kind, type Sea } from './sim.ts'
import { SvgCtx, SvgPath, animate, type El } from './svg.ts'

// The drawings make Path2D for shapes they reuse; outside a browser there is none.
;(globalThis as { Path2D?: unknown }).Path2D ??= SvgPath

export type BackdropOptions = {
  /** 'mosaic' (default) or 'smooth', as on the page. */
  style?: 'mosaic' | 'smooth'
  /** The sea in units, as the page sees it at `zoomOut: 1.5`; the surface crops what its window does not show. */
  width?: number
  height?: number
  /** The mosaic's tile, in units. */
  cell?: number
  /** Seconds of sea in one send. Shorter sends more often: more room a second for tiles that change. */
  seconds?: number
  atOnce?: number
  species?: Kind['name'][]
  /** The water at night and by day: the sea follows the app's dark and light mode. */
  water?: string
  lightWater?: string
  /** The mosaic's dashes and faint grid over the water, still between the animals. Default true. */
  texture?: boolean
  /** The most characters one send may be (the app takes 131072). */
  limit?: number
}

/** A sea as it was at sample `at`, born (empty) at sample `born`, for another session to carry on: see `saved`. */
export type Saved = { v: number; born: number; at: number; random: number; sea: Pick<Sea, 'next' | 'gone'> & { animals: unknown[] } }

const STEP = 1 / 60
const MARGIN = 20
/** Samples a second at most; fewer when a stretch would not fit the limit. Ten, not twenty: twenty sent twice the
 * sea a second for the app to check and paint, and in the app it stuttered. */
const RATE = 10
/** Seconds of sea past its stretch each send carries (see stream). */
const SPARE = 0.3
/** Seconds a sea is carried on after its last sample: past that nobody was watching, and a new one is born empty. */
const FRESH = 30
/** The sea is kept for `saved` every so many samples: five seconds. */
const KEEP = 50
/** The shape of a saved sea: one saved by other code is not carried on. */
const VERSION = 2
/** How far the deepest fade into the water (the page's smooth style). */
const FADE = 0.8

/** The kinds whose smooth drawing fits the limit at two samples a second or more. shortcut: the blue whale's
 * mottling, the turtle's scutes, the squid's suckers and the school's 160 fish are too many shapes; the mosaic takes
 * them all. */
const SMOOTH_FITS: Kind['name'][] = ['white', 'hammer', 'tiger', 'blacktip', 'orca', 'dolphin', 'manta']

export type Backdrop = {
  sea: Sea
  /** The send for the stretch of sea that starts at sample `from` (`Date.now() / 100`, whole). `shared` is what
   * another session `saved`, if anything: carried on from when it is the older sea, or this one has none going. */
  at: (from: number, shared?: unknown) => string
  /** The sea as it was at some sample no later than `by`, to hand to another session's `at`. */
  saved: (by: number) => Saved | undefined
}

export function createBackdrop(o: BackdropOptions = {}): Backdrop {
  const mosaic = (o.style ?? 'mosaic') === 'mosaic'
  const [width, height, seconds, limit] = [o.width ?? 2400, o.height ?? 1500, o.seconds ?? 1.5, o.limit ?? 131072]
  const [water, lightWater] = [o.water ?? OCEAN_NIGHT, o.lightWater ?? OCEAN_DAY]
  const sea = createSea(width, height)
  sea.atOnce = o.atOnce ?? (mosaic ? 4 : 1)
  const names = o.species ?? (mosaic ? KINDS.map(k => k.name) : SMOOTH_FITS)
  sea.allowed = new Set(KINDS.map((k, i) => (names.includes(k.name) ? i : -1)).filter(i => i >= 0))
  // Empty at its birth: the first animal comes in from beyond an edge at once, as every one after it does.

  // mosaic.ts's `rng`, its state here so it is kept and handed on with the sea.
  let seed = 0
  const random = (): number => {
    seed = (seed + 0x6d2b79f5) >>> 0
    let t = seed
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  /** The sample the sea was born at and the one it has been stepped to. */
  let born = -Infinity
  let now = -Infinity
  const kept: Saved[] = []
  const keep = (): void => {
    // A copy: the sea goes on. Its prey by where it is in the list, as a copy cannot point at it.
    const animals = sea.animals.map(a => ({ ...a, prey: a.prey === undefined ? -1 : sea.animals.indexOf(a.prey) }))
    kept.push(JSON.parse(JSON.stringify({ v: VERSION, born, at: now, random: seed, sea: { next: sea.next, gone: sea.gone, animals } })) as Saved)
    if (kept.length > 2) kept.shift()
  }
  const begin = (at: number): void => {
    ;[born, now, seed] = [at, at, at >>> 0]
    Object.assign(sea, { animals: [], next: 0, gone: -1 })
    kept.length = 0
    keep()
  }
  const carryOn = (s: Saved): void => {
    ;[born, now, seed] = [s.born, s.at, s.random]
    // A copy again: what was saved stays as it was, to be handed on in turn.
    const saved = JSON.parse(JSON.stringify(s.sea.animals)) as (Omit<Animal, 'prey'> & { prey: number })[]
    const animals: Animal[] = saved.map(a => ({ ...a, prey: undefined }))
    saved.forEach((a, i) => (animals[i]!.prey = animals[a.prey]))
    Object.assign(sea, { animals, next: s.sea.next, gone: s.sea.gone })
    kept.length = 0
    kept.push(s)
  }
  const usable = (s: unknown, from: number): s is Saved => typeof s === 'object' && s !== null && (s as Saved).v === VERSION && (s as Saved).at <= from && from - (s as Saved).at <= FRESH * RATE

  // The deepest first: one nearer the surface passes over it.
  const inOrder = () => [...sea.animals].sort((p, q) => q.depth - p.depth)

  const tiles = createMosaic(width, height, o.cell ?? 10, o.texture ?? true)
  const shoot = (): Shot => {
    const shot = tiles.shot()
    const ctx = tiles.ctx
    for (const a of inOrder()) {
      const z = sizeOf(a.depth)
      const d = ctx.tile * (0.5 + a.depth)
      // Its shadow first, moved down and to the right, the further down the body: over the water and over whatever
      // swims deeper, which is drawn already. Its body then covers the shadow where they meet.
      ctx.scaleAbout(z, a.x, a.y, d, d)
      DRAW[KINDS[a.kind]!.plan](ctx as unknown as Ctx, a, ctx.tile)
      tiles.take(shot, a.depth, a.depth < 0.5 ? 3 : 2)
      ctx.scaleAbout(z, a.x, a.y)
      DRAW[KINDS[a.kind]!.plan](ctx as unknown as Ctx, a, ctx.tile)
      tiles.take(shot, a.depth)
    }
    ctx.scaleAbout(1)
    return shot
  }

  const moment = (): El => {
    const root: El = { tag: 'g', attrs: {}, kids: [] }
    const ctx = new SvgCtx(root)
    for (const a of inOrder()) {
      const g: El = { tag: 'g', attrs: { opacity: String(Math.round((1 - a.depth * FADE) * 100) / 100) }, kids: [] }
      root.kids.push(g)
      ctx.into = g
      ctx.scaleAbout(sizeOf(a.depth), a.x, a.y)
      DRAW[KINDS[a.kind]!.plan](ctx as unknown as Ctx, a, 0)
    }
    ctx.scaleAbout(1)
    return root
  }

  // The app writes a colour and a font on the root when it has none, and a new frame when its own colour changes.
  const wrap = (body: string): string =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid slice" color="#000" font-family="monospace">${waterStyle(water, lightWater)}<rect class="w" width="${width}" height="${height}"/>${body}</svg>`

  /**
   * The sea as a stream of moments, `RATE` a second, and a send the `seconds` of it from sample `from`, with `SPARE`
   * seconds past its end, so a send shown a little late plays on instead of standing still. Fewer samples a second
   * when a send would not fit; at worst its first moment, still. The moments already worked out are kept, so two
   * sends that overlap show the same sea. A clock set back does not take the sea back: it waits.
   */
  function stream<M>(take: () => M, draw: (moments: M[], step: number) => string): Backdrop['at'] {
    const queue: M[] = []
    /** The sample of the queue's first moment. */
    let head = 0
    const [n, spare] = [Math.round(seconds * RATE), Math.round(SPARE * RATE)]
    return (from, shared) => {
      const stale = from - now > FRESH * RATE
      if (usable(shared, from) && (stale || shared.born < born || (shared.born === born && shared.at > now))) {
        carryOn(shared)
        queue.length = 0
      } else if (stale) {
        begin(from)
        queue.length = 0
      }
      from = Math.max(from, queue.length > 0 ? head : now)
      queue.splice(0, from - head)
      head = from
      while (queue.length <= n + spare) {
        for (const sample = head + queue.length; now < sample; ) {
          for (let t = 0; t < 1 / RATE - 1e-9; t += STEP) stepSea(sea, STEP, MARGIN, random)
          now += 1
          if (now % KEEP === 0) keep()
        }
        queue.push(take())
      }
      for (const every of [1, 2, 3, 4, 5, 6, 10]) {
        const svg = wrap(draw(queue.filter((_, i) => i % every === 0), every / RATE))
        if (svg.length <= limit) return svg
      }
      return wrap(draw([queue[0]!], 1))
    }
  }

  return { sea, at: mosaic ? stream(shoot, tiles.animate) : stream(moment, animate), saved: by => kept.filter(k => k.at <= by).pop() }
}
