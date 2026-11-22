// A school of fish: many fish that move as one. The school itself (an Animal of plan 'school') is only where they mean
// to go; each fish keeps to three rules with its near neighbours, as real schools do: not too close, the same way,
// not too far. And above them all, one: clear of anything big. A fish that sees a body coming darts off at once; the
// school bursts open round it and, once it has passed, the fish draw together again.

import { APART, KINDS, discsOf, fishDepth, middleOf, turnTo, type Animal, type Fish, type Point } from './sim.ts'

/** Turning, in radians a second, at the most: quick, but a fish still swings through a turn. */
const TURN = 7

/** Moves the fish of school `s` on by `dt` seconds, among `animals`. */
export function stepSchool(s: Animal, animals: Animal[], dt: number, random: () => number): void {
  const k = KINDS[s.kind]!
  const fish = s.fish
  if (fish.length === 0) return
  const bl = k.length
  // Real schools pack close: about a body length between neighbours.
  const near = bl * 0.8
  const along = bl * 2.5
  const around = bl * 3

  // The bodies close enough to matter, each as discs, and where each head will be in a moment.
  const { x: cx, y: cy } = middleOf(fish)
  const threats: (Point & { r: number; depth: number })[] = []
  for (const o of animals) {
    if (o === s || KINDS[o.kind]!.plan === 'school') continue
    const ko = KINDS[o.kind]!
    if (Math.hypot(o.x - cx, o.y - cy) > ko.length * 1.3 + 500) continue
    for (const c of discsOf(o)) threats.push({ x: c.x, y: c.y, r: c.r + bl * 1.5, depth: o.depth })
    // A head coming on is feared from further off than a body passing.
    threats.push({ x: o.x + Math.cos(o.heading) * o.speed * 0.5, y: o.y + Math.sin(o.heading) * o.speed * 0.5, r: ko.reach * 0.7 + bl * 2, depth: o.depth })
  }

  // The school waits for its fish: a head far ahead of them slows.
  if (Math.hypot(s.x - cx, s.y - cy) > bl * 5) {
    s.pace = Math.min(s.pace, 0.6)
    s.paceFor = 0.3
  }

  const cruise = Math.max(s.speed, k.speed * 0.6)
  const next = fish.map((f): Fish => {
    let sx = 0
    let sy = 0
    let ax = 0
    let ay = 0
    let n = 0
    let mx = 0
    let my = 0
    let m = 0
    for (const g of fish) {
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
    // Where it would go: its neighbours' way, toward their middle, off any too close, and with the school.
    let wx = 0
    let wy = 0
    if (n > 0) {
      const a = Math.hypot(ax, ay) || 1
      wx += (ax / a) * 1
      wy += (ay / a) * 1
    }
    if (m > 0) {
      const tx = mx / m - f.x
      const ty = my / m - f.y
      const t = Math.hypot(tx, ty) || 1
      wx += (tx / t) * 0.35
      wy += (ty / t) * 0.35
    }
    wx += sx * 2.2
    wy += sy * 2.2
    // The school's way, and its place: the further a fish has strayed, the harder it makes back.
    const lx = s.x - f.x
    const ly = s.y - f.y
    const l = Math.hypot(lx, ly) || 1
    const stray = Math.min(1.6, Math.max(0, (l - bl * 1.2) / (bl * 3)))
    wx += Math.cos(s.heading) * 0.45 + (lx / l) * stray
    wy += Math.sin(s.heading) * 0.45 + (ly / l) * stray
    // Fear: straight away from anything big that comes too near, the nearer the harder; and faster. Only from what
    // swims at this fish's depth: one passing over or under it is no threat to it.
    let fear = 0
    const fd = fishDepth(s, f)
    for (const c of threats) {
      if (Math.abs(fd - c.depth) >= APART) continue
      const dx = f.x - c.x
      const dy = f.y - c.y
      const d = Math.hypot(dx, dy) || 1
      if (d >= c.r) continue
      const push = 1 - d / c.r
      wx += (dx / d) * push * 6
      wy += (dy / d) * push * 6
      fear = Math.max(fear, push)
    }

    // Turn toward that way, no faster than a fish can; speed up when afraid.
    const heading = Math.atan2(f.vy, f.vx)
    const want = Math.atan2(wy, wx)
    const turn = Math.max(-TURN * dt, Math.min(TURN * dt, turnTo(heading, want)))
    const target = cruise * (1 + fear * (k.sprint - 1)) * (0.95 + random() * 0.1)
    const was = Math.hypot(f.vx, f.vy)
    const speed = was + (target - was) * Math.min(1, dt * (target > was ? 6 : 1.5))
    const h = heading + turn
    const vx = Math.cos(h) * speed
    const vy = Math.sin(h) * speed
    return { x: f.x + vx * dt, y: f.y + vy * dt, vx, vy, swum: f.swum + speed * dt, turn: turn / dt, deep: f.deep }
  })
  s.fish = next
}
