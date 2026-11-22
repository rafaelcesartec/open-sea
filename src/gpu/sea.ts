// The sea of sim.ts and school.ts, step for step the same (sea.test.ts runs both on one seed and compares), made so
// a step allocates nothing: every animal comes from a pool made at the start, its trail is a ring of numbers, its
// spine and discs are kept in arrays it owns and worked out once per move, and a school's fish are two sets of
// objects swapped each step. Only where the original builds sets and lists to choose, this walks the animals instead.

import { KD } from './kinds.ts'
import { H, hypH } from './hyp.ts'
import { APART, KINDS, depthOf, type Fish, type Frame, type Kind } from './reference/sim.ts'

/**
 * Where the randomness comes from: `next()` puts a new number from 0 to 1 in `v`. Not a function returning it, as
 * sim.ts takes: V8 boxes a number returned from a call it does not inline, and its middle tier inlines little.
 */
export type Rand = { v: number; next: () => void }
/** A Rand drawing from `f` (Math.random, or a seeded one): the same numbers, in the same order. */
export const fromFn = (f: () => number): Rand => ({
  v: 0.5,
  next() {
    this.v = f()
  },
})
const MATH_RANDOM: Rand = {
  v: 0.5,
  next() {
    this.v = Math.random()
  },
}

export type Mode = 'enter' | 'roam' | 'return' | 'chase' | 'leave'

/** The trail's ring: this many points at most (a slow squid's trail is a few thousand). */
const RING = 1 << 14
const MASK = RING - 1
/** Units between two points of a body, as in sim.ts. */
const STEP = 10
const FISH = 160
/** At most this many in one sea: the panel's most. */
export const MAX = 8

const MOST_FRAMES = Math.max(...KINDS.map(k => Math.floor((k.length * k.trunk + 0.01) / (STEP / 2)) + 2))
const MOST_DISCS = Math.max(FISH, Math.ceil(MOST_FRAMES / 4) + 2)

export type Beast = {
  kind: number
  x: number
  y: number
  heading: number
  curve: number
  speed: number
  pace: number
  paceFor: number
  tight: number
  way: number
  wayFrom: number
  mode: Mode
  modeFor: number
  prey: Beast | null
  rest: number
  toX: number
  toY: number
  stay: number
  age: number
  seen: boolean
  swum: number
  /** Strokes swum: swum over the length of one stroke. */
  stroke: number
  depth: number
  dive: number
  /** Where the head has been, the newest first: point i is at (head + i) & MASK. */
  tx: Float64Array
  ty: Float64Array
  head: number
  count: number
  /** A school's fish (`fishN` of them, 0 for any other) and the set the next step is written into. */
  fish: Fish[]
  next: Fish[]
  fishN: number
  /** Counts every move; the spine and the discs are worked out again only for a new one. */
  ver: number
  spine: Frame[]
  spineN: number
  spineVer: number
  /** Discs covering it, (x, y, r) each. */
  discs: Float64Array
  discN: number
  discVer: number
}

export type Sea = {
  w: number
  h: number
  /** The animals in view, `n` of them, in the order sim.ts keeps them. */
  animals: Beast[]
  n: number
  next: number
  gone: number
  atOnce: number
  allowed: Set<number>
  /** Animals not in the sea, to be taken as one comes in. */
  free: Beast[]
}

const fishOf = (): Fish => ({ x: 0.5, y: 0.5, vx: 0.5, vy: 0.5, swum: 0.5, turn: 0.5, deep: 0.5 })

function beast(): Beast {
  return {
    // Numbers that will hold fractions start as fractions, so the object's shape never has to change for them.
    kind: 0, x: 0.5, y: 0.5, heading: 0.5, curve: 0.5, speed: 0.5, pace: 0.5, paceFor: 0.5, tight: 0.5, way: 0, wayFrom: 0.5, mode: 'enter', modeFor: 0.5, prey: null, rest: 0.5, toX: 0.5, toY: 0.5, stay: 0.5, age: 0.5, seen: false, swum: 0.5, stroke: 0.5, depth: 0.5, dive: 0.5,
    tx: new Float64Array(RING), ty: new Float64Array(RING), head: 0, count: 0,
    fish: Array.from({ length: FISH }, fishOf), next: Array.from({ length: FISH }, fishOf), fishN: 0,
    ver: 1, spine: Array.from({ length: MOST_FRAMES }, (): Frame => ({ x: 0.5, y: 0.5, fx: 0.5, fy: 0.5, w: 0.5, u: 0.5 })), spineN: 0, spineVer: 0,
    discs: new Float64Array(MOST_DISCS * 3), discN: 0, discVer: 0,
  }
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v))
/** How far to turn from TT[0] to face TT[1], into TT[2]: as turnTo in sim.ts, passing no numbers through a call. */
const TT = new Float64Array(3)
function turnT(): void {
  let d = (TT[1]! - TT[0]!) % (Math.PI * 2)
  if (d > Math.PI) d -= Math.PI * 2
  if (d < -Math.PI) d += Math.PI * 2
  TT[2] = d
}

/** sim.ts's `half`, without taking pairs apart. */
export function half(k: Kind, behind: number): number {
  const u = behind / k.length
  const p = k.profile
  if (p !== undefined) {
    let i = 1
    while (i < p.length - 1 && p[i]![0] < u) i += 1
    const u0 = p[i - 1]![0]
    const w0 = p[i - 1]![1]
    const u1 = p[i]![0]
    const w1 = p[i]![1]
    return Math.max(1, k.girth * (w0 + (w1 - w0) * clamp((u - u0) / (u1 - u0 || 1), 0, 1)))
  }
  if (u < k.widest) {
    const x = u / k.widest
    if (k.hammer === true) return k.girth * (0.62 + 0.38 * Math.sin((x * Math.PI) / 2))
    return k.girth * Math.pow(1 - (1 - x) * (1 - x), k.snout)
  }
  const t = Math.min(1, (u - k.widest) / (k.trunk - k.widest))
  return Math.max(1.5, k.girth * (0.11 + 0.89 * Math.pow(1 - t, 1.6)))
}

/** Strokes swum (a.stroke, kept with a.swum): a function this small is always inlined, so its number is not boxed. */
/** Each kind's half width at every frame of its spine (`half` at 0, 5, 10... units back, exact multiples). */
const HALF = KINDS.map(k => Float64Array.from({ length: Math.floor((k.length * k.trunk + 0.01) / (STEP / 2)) + 2 }, (_, i) => half(k, i * (STEP / 2))))

export const strokes = (a: Beast): number => a.stroke
const stroke = (a: Beast): void => {
  a.stroke = a.swum / (KD[a.kind]!.speed * KD[a.kind]!.beat)
}

/** The head as a frame pointing the way it swims, written into `to`. */
export function poseOf(a: Beast, to: Frame): Frame {
  to.x = a.x
  to.y = a.y
  to.fx = Math.cos(a.heading)
  to.fy = Math.sin(a.heading)
  to.w = HALF[a.kind]![0]!
  to.u = 0
  return to
}

const WALK = new Float64Array(8)

/** The spine as sim.ts's `spineOf` lays it, into `a.spine`; returns how many frames. */
export function spineOf(a: Beast): number {
  if (a.spineVer === a.ver) return a.spineN
  const k = KD[a.kind]!
  const phase = a.stroke
  const spine = k.length * k.trunk
  // The walk's state lives in an array, not in variables: V8's middle tier boxed every number a loop carried this way.
  const S = WALK
  S[0] = a.x
  S[1] = a.y
  let i = 0
  let has = a.count > 0
  S[2] = has ? a.tx[a.head]! : 0
  S[3] = has ? a.ty[a.head]! : 0
  S[4] = has ? (H[0] = S[0]! - S[2]!, H[1] = S[1]! - S[3]!, hypH(), H[2]!) : 0
  S[5] = 0
  let n = 0
  for (let behind = 0; behind <= spine + 0.01; behind += STEP / 2) {
    while (has && S[5]! > S[4]!) {
      S[5] = S[5]! - S[4]!
      S[0] = S[2]!
      S[1] = S[3]!
      i += 1
      has = i < a.count
      if (has) {
        S[2] = a.tx[(a.head + i) & MASK]!
        S[3] = a.ty[(a.head + i) & MASK]!
      }
      S[4] = has ? (H[0] = S[0]! - S[2]!, H[1] = S[1]! - S[3]!, hypH(), H[2]!) : 0
    }
    const span = S[4]!
    if (!has || span === 0) break
    const px = S[0]!
    const py = S[1]!
    const into: number = S[5]!
    const fx = (px - S[2]!) / span
    const fy = (py - S[3]!) / span
    const u = behind / k.length
    const sway = k.length * k.sway * Math.pow(u, 1.7) * Math.sin(2 * Math.PI * (phase - 0.75 * u))
    const f = a.spine[n]!
    f.x = px - fx * into - fy * sway
    f.y = py - fy * into + fx * sway
    f.fx = fx
    f.fy = fy
    f.w = HALF[a.kind]![n]!
    f.u = u
    n += 1
    S[5] = into + STEP / 2
  }
  a.spineN = n
  a.spineVer = a.ver
  return n
}

/** The discs of sim.ts's `discsOf`, into `a.discs`; returns how many. */
export function discsOf(a: Beast): number {
  if (a.discVer === a.ver) return a.discN
  const k = KD[a.kind]!
  const d = a.discs
  let m = 0
  if (k.plan === 'school') {
    for (let i = 0; i < a.fishN; i += 1) {
      d[m * 3] = a.fish[i]!.x
      d[m * 3 + 1] = a.fish[i]!.y
      d[m * 3 + 2] = k.length
      m += 1
    }
  } else {
    const n = spineOf(a)
    const fr = a.spine
    for (let i = 0; i < n; i += 4) {
      d[m * 3] = fr[i]!.x
      d[m * 3 + 1] = fr[i]!.y
      d[m * 3 + 2] = Math.max(4, fr[i]!.w)
      m += 1
    }
    // The widest frame (the first of equals), or the head when there is no spine.
    if (n === 0) {
      d[m * 3] = a.x
      d[m * 3 + 1] = a.y
    } else {
      let best = 0
      for (let i = 1; i < n; i += 1) if (fr[i]!.w > fr[best]!.w) best = i
      d[m * 3] = fr[best]!.x
      d[m * 3 + 1] = fr[best]!.y
    }
    d[m * 3 + 2] = k.reach
    m += 1
    if (n > 0 && k.trunk < 1) {
      const last = fr[n - 1]!
      d[m * 3] = last.x - last.fx * k.length * (1 - k.trunk) * 0.6
      d[m * 3 + 1] = last.y - last.fy * k.length * (1 - k.trunk) * 0.6
      d[m * 3 + 2] = k.length * (1 - k.trunk) * 0.6
      m += 1
    }
  }
  a.discN = m
  a.discVer = a.ver
  return m
}

/** The middle of a school's fish, into M. */
/** A closure's variable would box each new number; an object's field does not. */
export const M = { x: 0, y: 0 }
export function middleOf(a: Beast): void {
  let x = 0
  let y = 0
  for (let i = 0; i < a.fishN; i += 1) {
    x += a.fish[i]!.x
    y += a.fish[i]!.y
  }
  M.x = x / a.fishN
  M.y = y / a.fishN
}

/** Where a chaser makes for (sim.ts's `tailOf`), into M. */
function tailOf(a: Beast): void {
  if (a.fishN > 0) return middleOf(a)
  const k = KD[a.kind]!
  let behind = 0
  let lx = a.x
  let ly = a.y
  for (let i = 0; i < a.count; i += 1) {
    const px = a.tx[(a.head + i) & MASK]!
    const py = a.ty[(a.head + i) & MASK]!
    behind += (H[0] = px - lx, H[1] = py - ly, hypH(), H[2]!)
    lx = px
    ly = py
    if (behind >= k.length * k.trunk) break
  }
  M.x = lx
  M.y = ly
}

export function createSea(w: number, h: number, pool = MAX): Sea {
  return { w, h, animals: new Array<Beast>(MAX).fill(null as unknown as Beast), n: 0, next: 0, gone: -1, atOnce: 4, allowed: new Set(KINDS.map((_, i) => i)), free: Array.from({ length: pool }, beast) }
}

const deepIn = (k: Kind, random: Rand): number => depthOf(k.levels[Math.floor((random.next(), random.v) * k.levels.length)]!)
const apart = (a: Beast, b: Beast): boolean => Math.abs(a.depth - b.depth) >= APART

function make(sea: Sea, kind: number, x: number, y: number, heading: number, toX: number, toY: number, random: Rand): Beast | undefined {
  const a = sea.free.pop()
  if (a === undefined) return undefined
  const k = KD[kind]!
  a.head = 0
  a.count = 0
  for (let back = STEP; back <= k.length * 1.25; back += STEP) {
    a.tx[a.count] = x - Math.cos(heading) * back
    a.ty[a.count] = y - Math.sin(heading) * back
    a.count += 1
  }
  a.kind = kind
  a.x = x
  a.y = y
  a.heading = heading
  a.curve = 0
  a.speed = k.speed
  a.pace = 1
  a.paceFor = 0
  a.tight = 0
  a.way = 0
  a.wayFrom = 0
  a.mode = 'enter'
  a.modeFor = 0
  a.prey = null
  a.rest = 8 + (random.next(), random.v) * 12
  a.toX = toX
  a.toY = toY
  a.stay = k.stay[0] + (random.next(), random.v) * (k.stay[1] - k.stay[0])
  a.age = 0
  a.seen = false
  a.swum = (random.next(), random.v) * 500
  stroke(a)
  a.depth = deepIn(k, random)
  a.dive = deepIn(k, random)
  a.fishN = 0
  a.ver += 1
  if (k.plan === 'school') {
    for (let i = 0; i < FISH; i += 1) {
      const back = Math.sqrt((random.next(), random.v)) * 380
      const side = ((random.next(), random.v) - 0.5) * 320
      const f = a.fish[i]!
      f.x = x - Math.cos(heading) * back - Math.sin(heading) * side
      f.y = y - Math.sin(heading) * back + Math.cos(heading) * side
      f.vx = Math.cos(heading) * k.speed
      f.vy = Math.sin(heading) * k.speed
      f.swum = (random.next(), random.v) * 50
      f.turn = 0
      f.deep = ((random.next(), random.v) * 2 - 1) * 0.3
    }
    a.fishN = FISH
  }
  return a
}

function release(sea: Sea, a: Beast): void {
  a.prey = null
  sea.free.push(a)
}

/** One animal of `kind` alone in the middle of the sea, to be watched. */
export function place(sea: Sea, kind: number, random: Rand = MATH_RANDOM): Beast {
  for (let i = 0; i < sea.n; i += 1) release(sea, sea.animals[i]!)
  sea.n = 0
  const heading = (random.next(), random.v) * Math.PI * 2
  const a = make(sea, kind, sea.w / 2, sea.h / 2, heading, sea.w / 2, sea.h / 2, random)!
  a.mode = 'roam'
  a.stay = Infinity
  a.seen = true
  sea.animals[0] = a
  sea.n = 1
  sea.next = Infinity
  return a
}

const kinds = new Int32Array(KINDS.length)

function arrive(sea: Sea, random: Rand): void {
  let open = 0
  for (let i = 0; i < KINDS.length; i += 1) {
    if (!sea.allowed.has(i)) continue
    let here = false
    for (let j = 0; j < sea.n; j += 1) if (sea.animals[j]!.kind === i) here = true
    if (!here) kinds[open++] = i
  }
  let n = open
  if (open > 1) {
    n = 0
    for (let i = 0; i < open; i += 1) if (kinds[i] !== sea.gone) kinds[n++] = kinds[i]!
  }
  const pick = Math.floor((random.next(), random.v) * n)
  if (pick >= n) return
  const kind = kinds[pick]!
  const k = KD[kind]!
  for (let tries = 0; tries < 8; tries += 1) {
    const edge = Math.floor((random.next(), random.v) * 4)
    const along = 0.1 + (random.next(), random.v) * 0.8
    const off = 20 + k.reach + (random.next(), random.v) * 120
    const x = edge === 0 ? -off : edge === 1 ? sea.w + off : along * sea.w
    const y = edge === 2 ? -off : edge === 3 ? sea.h + off : along * sea.h
    const toX = sea.w * (0.2 + (random.next(), random.v) * 0.6)
    const toY = sea.h * (0.2 + (random.next(), random.v) * 0.6)
    const heading = Math.atan2(toY - y, toX - x)
    let clear = true
    for (let j = 0; j < sea.n && clear; j += 1) {
      const o = sea.animals[j]!
      if (KD[o.kind]!.plan === 'school') continue
      const nd = discsOf(o)
      for (let c = 0; c < nd && clear; c += 1) {
        const cx = o.discs[c * 3]!
        const cy = o.discs[c * 3 + 1]!
        const cr = o.discs[c * 3 + 2]!
        for (let d = -k.length; d <= k.length; d += 40) {
          const px = x + Math.cos(heading) * d
          const py = y + Math.sin(heading) * d
          if (!((H[0] = px - cx, H[1] = py - cy, hypH(), H[2]!) > cr + k.reach + KD[o.kind]!.reach * 0.5)) {
            clear = false
            break
          }
        }
      }
    }
    if (!clear) continue
    const a = make(sea, kind, x, y, heading, toX, toY, random)
    if (a === undefined) return
    sea.animals[sea.n++] = a
    sea.next = 2 + (random.next(), random.v) * 5
    return
  }
  sea.next = 0.5
}

/** Moves everything in the sea by (dx, dy). */
export function shift(sea: Sea, dx: number, dy: number): void {
  for (let j = 0; j < sea.n; j += 1) {
    const a = sea.animals[j]!
    a.x += dx
    a.y += dy
    a.toX += dx
    a.toY += dy
    for (let i = 0; i < a.count; i += 1) {
      a.tx[(a.head + i) & MASK]! += dx
      a.ty[(a.head + i) & MASK]! += dy
    }
    for (let i = 0; i < a.fishN; i += 1) {
      a.fish[i]!.x += dx
      a.fish[i]!.y += dy
    }
    a.ver += 1
  }
}


// What the giving way gathers over the others (sim.ts's `held`), in an object: a closure's variables would box each
// new number.
const W = { before: 0.5, lo: 0.5, hi: 0.5, first: 0.5, clearBy: 0.5, intoBody: false, giant: false, hx: 0.5, hy: 0.5, v: 0.5, horizon: 0.5, room: 0.5, pad: 0.5, big: false, kl: 0.5, kol: 0.5, px: 0.5, py: 0.5, from: 0.5, until: 0.5 }
/** The place (W.px, W.py), held from W.from to W.until seconds on, as `held` in sim.ts; the rest of what it needs is in W. */
function held(s: Beast): void {
  const rx = W.px - s.x
  const ry = W.py - s.y
  const along = rx * W.hx + ry * W.hy
  const across = ry * W.hx - rx * W.hy
  const t = Math.max(0, along) / W.v
  const room = W.room
  const pad = W.pad
  if (Math.abs(across) >= room || along < -room || t > W.horizon || t < W.from - pad || t > W.until + pad) return
  W.lo = Math.min(W.lo, across - room)
  W.hi = Math.max(W.hi, across + room)
  W.first = Math.min(W.first, t)
  W.clearBy = Math.max(W.clearBy, W.until + pad)
  if (W.from === 0 && t > 0.3 && W.kol >= W.kl * 0.8) W.intoBody = true
  if (W.big) W.giant = true
}

/** Turns toward (W.px, W.py) over half a body length. */
function steer(s: Beast, k: Kind): void {
  const tightest = k.length * k.turn
  s.curve = (TT[0] = s.heading, TT[1] = Math.atan2(W.py - s.y, W.px - s.x), turnT(), TT[2]!) / Math.max(k.length * 0.5, tightest * 0.5)
}

/** Moves the sea on by `dt` seconds, as sim.ts's `stepSea`. */
export function stepSea(sea: Sea, dt: number, tile: number, random: Rand = MATH_RANDOM): void {
  // What has wholly left the view is gone; and what never came in, after a while. In order, as `filter` does.
  const total = sea.n
  let kept = 0
  for (let j = 0; j < total; j += 1) {
    const a = sea.animals[j]!
    a.age += dt
    const nd = discsOf(a)
    const d = a.discs
    if (!a.seen) {
      for (let c = 0; c < nd; c += 1) {
        if (((d[c * 3]!) > -(-d[c * 3 + 2]! * 0.5) && (d[c * 3]!) < sea.w + (-d[c * 3 + 2]! * 0.5) && (d[c * 3 + 1]!) > -(-d[c * 3 + 2]! * 0.5) && (d[c * 3 + 1]!) < sea.h + (-d[c * 3 + 2]! * 0.5))) {
          a.seen = true
          break
        }
      }
    }
    let gone = false
    if (a.stay < Infinity) {
      if (a.seen) {
        gone = true
        for (let c = 0; c < nd; c += 1) {
          if (((d[c * 3]!) > -(d[c * 3 + 2]! + tile) && (d[c * 3]!) < sea.w + (d[c * 3 + 2]! + tile) && (d[c * 3 + 1]!) > -(d[c * 3 + 2]! + tile) && (d[c * 3 + 1]!) < sea.h + (d[c * 3 + 2]! + tile))) {
            gone = false
            break
          }
        }
      } else gone = a.age > 40
    }
    if (gone) {
      sea.gone = a.kind
      for (let o = 0; o < total; o += 1) if (sea.animals[o]!.prey === a) sea.animals[o]!.prey = null
      // Freed once the rest are kept, so it is not handed out again this step.
      sea.free.push(a)
    } else sea.animals[kept++] = a
  }
  for (let j = kept; j < total; j += 1) sea.animals[j] = null as unknown as Beast
  sea.n = kept
  for (let i = 0; i < sea.free.length; i += 1) sea.free[i]!.prey = null
  sea.next -= dt
  if (sea.n < sea.atOnce && sea.next <= 0) arrive(sea, random)

  for (let j = 0; j < sea.n; j += 1) {
    const s = sea.animals[j]!
    W.before = s.curve
    const chaser = behave(sea, s, dt, random)
    giveWay(sea, s, tile, chaser)
    move(sea, s, dt, random)
  }
}

/** What it does now: flee, chase, come in, roam, leave (sim.ts). Returns what chases it, if anything. */
function behave(sea: Sea, s: Beast, dt: number, random: Rand): Beast | null {
  const k = KD[s.kind]!
  const step = Math.max(1, s.speed * dt)
  const tightest = k.length * k.turn
  s.modeFor -= dt
  s.paceFor -= dt
  s.rest -= dt
  s.stay -= dt
  if (s.paceFor <= 0) s.pace = 1
  let chaser: Beast | null = null
  for (let o = 0; o < sea.n; o += 1) {
    const c = sea.animals[o]!
    if (c.mode === 'chase' && c.prey === s) {
      chaser = c
      break
    }
  }

  if (chaser !== null) {
    const away = Math.atan2(s.y - chaser.y, s.x - chaser.x)
    W.px = s.x + Math.cos(away) * 300
    W.py = s.y + Math.sin(away) * 300
    steer(s, k)
    s.pace = k.sprint
    s.paceFor = 0.6
    if (s.mode === 'chase') s.prey = null
    if (s.mode !== 'leave') s.mode = 'roam'
  } else if (s.mode === 'chase') {
    const prey = s.prey
    let far = Infinity
    if (prey !== null) {
      tailOf(prey)
      far = (H[0] = M.x - s.x, H[1] = M.y - s.y, hypH(), H[2]!)
    }
    if (prey === null || s.modeFor <= 0 || far > 760 || !((prey.x) > -(60) && (prey.x) < sea.w + (60) && (prey.y) > -(60) && (prey.y) < sea.h + (60))) {
      s.mode = 'roam'
      s.prey = null
      s.rest = 18 + (random.next(), random.v) * 17
      s.pace = 0.65
      s.paceFor = 3
    } else {
      W.px = M.x
      W.py = M.y
      steer(s, k)
      const top = 1 + (k.sprint - 1) * 0.6
      s.pace = far < k.length * 0.5 + 60 ? Math.min(top, (prey.speed / k.speed) * 0.97) : top
      s.paceFor = 0.3
    }
  } else if (s.mode === 'leave') {
    s.curve *= 0.98
  } else if (s.mode === 'enter' || s.mode === 'return') {
    W.px = s.toX
    W.py = s.toY
    steer(s, k)
    if (s.x > 160 && s.x < sea.w - 160 && s.y > 140 && s.y < sea.h - 140) s.mode = 'roam'
  } else if (s.stay <= 0) {
    s.mode = 'leave'
  } else if (!((s.x) > -(110) && (s.x) < sea.w + (110) && (s.y) > -(110) && (s.y) < sea.h + (110))) {
    s.mode = 'return'
    s.toX = sea.w * (0.15 + (random.next(), random.v) * 0.7)
    s.toY = sea.h * (0.2 + (random.next(), random.v) * 0.6)
  } else {
    if (s.tight > 0) {
      s.tight -= step
    } else {
      const scale = step / 20
      s.curve = Math.max(-0.8 / tightest, Math.min(0.8 / tightest, s.curve * Math.pow(0.9, scale) + (((random.next(), random.v) - 0.5) * 0.65 * Math.sqrt(scale)) / tightest))
      if ((random.next(), random.v) < 0.007 * scale * k.whim) {
        s.curve = ((random.next(), random.v) < 0.5 ? -1 : 1) / tightest
        s.tight = k.length * (0.5 + (random.next(), random.v))
      }
    }
    if (s.paceFor <= 0) {
      const roll = (random.next(), random.v)
      if (roll < 0.07 * dt * k.whim) {
        s.pace = 1 + (k.sprint - 1) * (0.5 + (random.next(), random.v) * 0.5)
        s.paceFor = 1.5 + (random.next(), random.v) * 1.5
      } else if (roll < 0.1 * dt * k.whim) {
        s.pace = 0.65
        s.paceFor = 3 + (random.next(), random.v) * 2
      }
    }
    if (s.rest <= 0 && ((s.x) > -(0) && (s.x) < sea.w + (0) && (s.y) > -(0) && (s.y) < sea.h + (0))) {
      for (let o = 0; o < sea.n; o += 1) {
        const prey = sea.animals[o]!
        if (!k.prey.includes(KD[prey.kind]!.name)) continue
        const far = (H[0] = prey.x - s.x, H[1] = prey.y - s.y, hypH(), H[2]!)
        const off = Math.abs((TT[0] = s.heading, TT[1] = Math.atan2(prey.y - s.y, prey.x - s.x), turnT(), TT[2]!))
        if (far < 560 && far > k.length * 0.5 + 100 && off < 1 && Math.abs((TT[0] = s.heading, TT[1] = prey.heading, turnT(), TT[2]!)) < 1 && ((prey.x) > -(-40) && (prey.x) < sea.w + (-40) && (prey.y) > -(-40) && (prey.y) < sea.h + (-40)) && !chased(sea, prey) && (random.next(), random.v) < 0.8 * dt) {
          s.mode = 'chase'
          s.prey = prey
          s.modeFor = 4 + (random.next(), random.v) * 3
          break
        }
      }
    }
  }
  return chaser
}

/** Giving way (sim.ts). */
function giveWay(sea: Sea, s: Beast, tile: number, chaser: Beast | null): void {
  const k = KD[s.kind]!
  const tightest = k.length * k.turn
  // Giving way (sim.ts).
  const hx = Math.cos(s.heading)
  const hy = Math.sin(s.heading)
  const v = Math.max(s.speed, 1)
  const horizon = Math.max(4, (k.length * 1.5) / v)
  W.lo = Infinity
  W.hi = -Infinity
  W.first = Infinity
  W.clearBy = 0
  W.intoBody = false
  W.giant = false
  for (let o = 0; o < sea.n; o += 1) {
    const other = sea.animals[o]!
    const ko = KD[other.kind]!
    if (other === s || k.plan === 'school' || ko.plan === 'school' || (s.mode === 'chase' && s.prey === other) || ko.length < k.length * 0.3 || apart(s, other)) continue
    const big = ko.length > k.length * 2.5
    const room = k.reach + ko.reach + tile
    const vo = Math.max(other.speed, 1)
    const pad = room / v
    W.hx = hx
    W.hy = hy
    W.v = v
    W.horizon = horizon
    W.room = room
    W.pad = pad
    W.big = big
    W.kl = k.length
    W.kol = ko.length
    for (let ahead = 20; ahead <= vo * horizon; ahead += 20) {
      W.px = other.x + Math.cos(other.heading) * ahead
      W.py = other.y + Math.sin(other.heading) * ahead
      W.from = ahead / vo
      W.until = (ahead + ko.length) / vo
      held(s)
    }
    W.px = other.x
    W.py = other.y
    W.from = 0
    W.until = ko.length / vo
    held(s)
    let behind = 0
    let since = 0
    let lx = other.x
    let ly = other.y
    for (let i = 0; i < other.count; i += 1) {
      const px = other.tx[(other.head + i) & MASK]!
      const py = other.ty[(other.head + i) & MASK]!
      const d = (H[0] = px - lx, H[1] = py - ly, hypH(), H[2]!)
      behind += d
      since += d
      lx = px
      ly = py
      if (behind > ko.length) break
      if (since < 20) continue
      since = 0
      W.px = px
      W.py = py
      W.from = 0
      W.until = (ko.length - behind) / vo
      held(s)
    }
  }
  if (W.lo < 0 && W.hi > 0) {
    if (s.way === 0) {
      s.way = W.hi < -W.lo ? 1 : -1
      s.wayFrom = s.heading
    }
    const shiftBy = s.way > 0 ? W.hi : W.lo
    const swerve = Math.atan2(shiftBy / Math.max(W.first, 0.8), v)
    const fair = W.giant ? 1.4 : 0.8
    const off = (TT[0] = s.wayFrom, TT[1] = s.heading, turnT(), TT[2]!) * s.way
    s.curve = off > fair ? 0 : Math.max(-0.6, Math.min(0.6, swerve)) / Math.max(k.length * 0.35, tightest * 0.6)
    s.tight = 0
    if (W.giant && chaser === null) {
      s.pace = Math.max(s.pace, Math.min(k.sprint, 1.8))
      s.paceFor = 0.5
    } else if ((Math.abs(swerve) > 0.6 || off > fair) && W.intoBody && chaser === null && s.mode !== 'chase') {
      s.pace = Math.max(0.35, Math.min(1, W.first / W.clearBy))
      s.paceFor = 0.3
    }
  } else {
    s.way = 0
  }
}

/** Up and down, the pace, the bend, and the move along its curve (sim.ts). */
function move(sea: Sea, s: Beast, dt: number, random: Rand): void {
  const k = KD[s.kind]!
  const tightest = k.length * k.turn
  const before = W.before
  if ((random.next(), random.v) < 0.04 * dt) s.dive = deepIn(k, random)
  if (s.mode === 'chase' && s.prey !== null) s.dive = s.prey.depth
  s.depth += Math.max(-0.1 * dt, Math.min(0.1 * dt, s.dive - s.depth))

  const want = k.speed * s.pace
  s.speed += (want - s.speed) * (1 - Math.exp(-dt / (want > s.speed ? 0.3 : 1)))
  const ease = (s.speed * dt) / (tightest * Math.max(k.length * 0.15, tightest * 0.3))
  s.curve = Math.max(-1 / tightest, Math.min(1 / tightest, before + Math.max(-ease, Math.min(ease, s.curve - before))))

  const go = s.speed * dt * (1 + k.surge * Math.sin(2 * Math.PI * s.stroke))
  // unshift: the head's place becomes the trail's newest point. A full ring forgets its oldest.
  s.head = (s.head - 1) & MASK
  s.tx[s.head] = s.x
  s.ty[s.head] = s.y
  if (s.count < RING) s.count += 1
  s.heading += s.curve * go
  s.x += Math.cos(s.heading) * go
  s.y += Math.sin(s.heading) * go
  s.swum += go
  stroke(s)
  let length = 0
  for (let i = 1; i < s.count; i += 1) {
    const a = (s.head + i) & MASK
    const b = (s.head + i - 1) & MASK
    length += (H[0] = s.tx[a]! - s.tx[b]!, H[1] = s.ty[a]! - s.ty[b]!, hypH(), H[2]!)
    if (length > k.length * 1.25) {
      s.count = i + 1
      break
    }
  }
  s.ver += 1
  if (k.plan === 'school') stepSchool(s, sea, dt, random)
}

function chased(sea: Sea, prey: Beast): boolean {
  for (let o = 0; o < sea.n; o += 1) if (sea.animals[o]!.mode === 'chase' && sea.animals[o]!.prey === prey) return true
  return false
}

const TURN = 7
// The bodies a school keeps clear of: x, y, r, depth each.
const threats = new Float64Array(4 * (MAX * (MOST_DISCS + 1)))

/** school.ts's `stepSchool`. */
function stepSchool(s: Beast, sea: Sea, dt: number, random: Rand): void {
  const k = KD[s.kind]!
  const fish = s.fish
  const count = s.fishN
  if (count === 0) return
  const bl = k.length
  const near = bl * 0.8
  const along = bl * 2.5
  const around = bl * 3

  middleOf(s)
  const cx = M.x
  const cy = M.y
  let nt = 0
  for (let o = 0; o < sea.n; o += 1) {
    const other = sea.animals[o]!
    if (other === s || KD[other.kind]!.plan === 'school') continue
    const ko = KD[other.kind]!
    if ((H[0] = other.x - cx, H[1] = other.y - cy, hypH(), H[2]!) > ko.length * 1.3 + 500) continue
    const nd = discsOf(other)
    for (let c = 0; c < nd; c += 1) {
      threats[nt * 4] = other.discs[c * 3]!
      threats[nt * 4 + 1] = other.discs[c * 3 + 1]!
      threats[nt * 4 + 2] = other.discs[c * 3 + 2]! + bl * 1.5
      threats[nt * 4 + 3] = other.depth
      nt += 1
    }
    threats[nt * 4] = other.x + Math.cos(other.heading) * other.speed * 0.5
    threats[nt * 4 + 1] = other.y + Math.sin(other.heading) * other.speed * 0.5
    threats[nt * 4 + 2] = ko.reach * 0.7 + bl * 2
    threats[nt * 4 + 3] = other.depth
    nt += 1
  }

  if ((H[0] = s.x - cx, H[1] = s.y - cy, hypH(), H[2]!) > bl * 5) {
    s.pace = Math.min(s.pace, 0.6)
    s.paceFor = 0.3
  }

  const cruise = Math.max(s.speed, k.speed * 0.6)
  const next = s.next
  for (let fi = 0; fi < count; fi += 1) {
    const f = fish[fi]!
    let sx = 0
    let sy = 0
    let ax = 0
    let ay = 0
    let n = 0
    let mx = 0
    let my = 0
    let m = 0
    for (let gi = 0; gi < count; gi += 1) {
      const g = fish[gi]!
      if (g === f) continue
      const dx = g.x - f.x
      const dy = g.y - f.y
      const d2 = dx * dx + dy * dy
      if (d2 > around * around) continue
      mx += g.x
      my += g.y
      m += 1
      if (d2 > along * along) continue
      ax += g.vx
      ay += g.vy
      n += 1
      if (d2 > near * near || d2 === 0) continue
      const d = Math.sqrt(d2)
      sx -= (dx / d) * (1 - d / near)
      sy -= (dy / d) * (1 - d / near)
    }
    let wx = 0
    let wy = 0
    if (n > 0) {
      const a = (H[0] = ax, H[1] = ay, hypH(), H[2]!) || 1
      wx += (ax / a) * 1
      wy += (ay / a) * 1
    }
    if (m > 0) {
      const tx = mx / m - f.x
      const ty = my / m - f.y
      const t = (H[0] = tx, H[1] = ty, hypH(), H[2]!) || 1
      wx += (tx / t) * 0.35
      wy += (ty / t) * 0.35
    }
    wx += sx * 2.2
    wy += sy * 2.2
    const lx = s.x - f.x
    const ly = s.y - f.y
    const l = (H[0] = lx, H[1] = ly, hypH(), H[2]!) || 1
    const stray = Math.min(1.6, Math.max(0, (l - bl * 1.2) / (bl * 3)))
    wx += Math.cos(s.heading) * 0.45 + (lx / l) * stray
    wy += Math.sin(s.heading) * 0.45 + (ly / l) * stray
    let fear = 0
    const fd = Math.min(1, Math.max(0, s.depth + f.deep))
    for (let c = 0; c < nt; c += 1) {
      if (Math.abs(fd - threats[c * 4 + 3]!) >= APART) continue
      const dx = f.x - threats[c * 4]!
      const dy = f.y - threats[c * 4 + 1]!
      const d = (H[0] = dx, H[1] = dy, hypH(), H[2]!) || 1
      const r = threats[c * 4 + 2]!
      if (d >= r) continue
      const push = 1 - d / r
      wx += (dx / d) * push * 6
      wy += (dy / d) * push * 6
      fear = Math.max(fear, push)
    }
    const heading = Math.atan2(f.vy, f.vx)
    const want = Math.atan2(wy, wx)
    const turn = Math.max(-TURN * dt, Math.min(TURN * dt, (TT[0] = heading, TT[1] = want, turnT(), TT[2]!)))
    const target = cruise * (1 + fear * (k.sprint - 1)) * (0.95 + (random.next(), random.v) * 0.1)
    const was = (H[0] = f.vx, H[1] = f.vy, hypH(), H[2]!)
    const speed = was + (target - was) * Math.min(1, dt * (target > was ? 6 : 1.5))
    const h = heading + turn
    const vx = Math.cos(h) * speed
    const vy = Math.sin(h) * speed
    const o = next[fi]!
    o.x = f.x + vx * dt
    o.y = f.y + vy * dt
    o.vx = vx
    o.vy = vy
    o.swum = f.swum + speed * dt
    o.turn = turn / dt
    o.deep = f.deep
  }
  s.next = fish
  s.fish = next
  s.ver += 1
}
