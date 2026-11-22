// The allocation-free sea must be sim.ts's sea, step for step: both run on one seed and are compared all along.

import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as orig from './reference/sim.ts'
import { createSea, discsOf, fromFn, place, spineOf, stepSea, type Beast, type Sea } from './sea.ts'

function seeded(seed: number): () => number {
  let a = seed
  return () => (a = (a * 16807) % 2147483647) / 2147483647
}

function same(o: orig.Animal, b: Beast, where: string): void {
  const fields = ['kind', 'x', 'y', 'heading', 'curve', 'speed', 'pace', 'paceFor', 'tight', 'way', 'wayFrom', 'mode', 'modeFor', 'rest', 'stay', 'age', 'seen', 'swum', 'depth', 'dive'] as const
  for (const f of fields) assert.equal(b[f], o[f], `${where}: ${f}`)
  assert.equal(b.toX, o.to.x, `${where}: to.x`)
  assert.equal(b.count, o.trail.length, `${where}: trail length`)
  for (let i = 0; i < o.trail.length; i += 1) {
    assert.equal(b.tx[(b.head + i) & ((1 << 14) - 1)], o.trail[i]!.x, `${where}: trail ${i}`)
  }
  assert.equal(b.fishN, o.fish.length, `${where}: fish`)
  for (let i = 0; i < o.fish.length; i += 1) {
    assert.equal(b.fish[i]!.x, o.fish[i]!.x, `${where}: fish ${i} x`)
    assert.equal(b.fish[i]!.turn, o.fish[i]!.turn, `${where}: fish ${i} turn`)
  }
  const frames = orig.spineOf(o)
  const n = spineOf(b)
  assert.equal(n, frames.length, `${where}: spine`)
  for (let i = 0; i < n; i += 1) {
    const [p, q] = [frames[i]!, b.spine[i]!]
    assert.ok(p.x === q.x && p.y === q.y && p.w === q.w && p.u === q.u && p.fx === q.fx, `${where}: frame ${i}`)
  }
  const discs = orig.discsOf(o)
  const nd = discsOf(b)
  assert.equal(nd, discs.length, `${where}: discs`)
  for (let i = 0; i < nd; i += 1) assert.ok(discs[i]!.x === b.discs[i * 3] && discs[i]!.r === b.discs[i * 3 + 2], `${where}: disc ${i}`)
}

function compare(a: orig.Sea, b: Sea, where: string): void {
  assert.equal(b.n, a.animals.length, `${where}: count`)
  a.animals.forEach((o, i) => {
    same(o, b.animals[i]!, `${where} #${i}`)
    const prey = o.prey === undefined ? -1 : a.animals.indexOf(o.prey)
    const bp = b.animals[i]!.prey
    assert.equal(bp === null ? -1 : b.animals.indexOf(bp), prey, `${where} #${i}: prey`)
  })
  assert.equal(b.next, a.next, `${where}: next`)
  assert.equal(b.gone, a.gone, `${where}: gone`)
}

// Every kind seen in one of the runs below, the school and the chases among them.
const seen = new Set<number>()
for (const [seed, atOnce, w, h] of [[1, 4, 2400, 1350], [7, 8, 2400, 1350], [42, 8, 1600, 900], [99, 6, 3600, 1500]] as const) {
  test(`the same sea as sim.ts: seed ${seed}, ${atOnce} at once`, () => {
    const a = orig.createSea(w, h)
    const b = createSea(w, h)
    a.atOnce = b.atOnce = atOnce
    const [ra, rb] = [seeded(seed), seeded(seed)]
    const RB = fromFn(rb)
    for (let i = 0; i < 6 * 3600; i += 1) {
      orig.stepSea(a, 1 / 60, 20, ra)
      stepSea(b, 1 / 60, 20, RB)
      for (const o of a.animals) seen.add(o.kind)
      if (i % 7 === 0 || i < 400) compare(a, b, `step ${i}`)
    }
  })
}

test('the runs above saw every kind', () => {
  assert.equal(seen.size, orig.KINDS.length)
})

test('a watched animal: the same as sim.ts', () => {
  for (let kind = 0; kind < orig.KINDS.length; kind += 1) {
    const a = orig.createSea(4000, 2250)
    const b = createSea(4000, 2250, 1)
    const [ra, rb] = [seeded(kind + 3), seeded(kind + 3)]
    const RB = fromFn(rb)
    orig.place(a, kind, ra)
    place(b, kind, RB)
    for (let i = 0; i < 1800; i += 1) {
      orig.stepSea(a, 1 / 60, 20, ra)
      stepSea(b, 1 / 60, 20, RB)
    }
    compare(a, b, `kind ${kind}`)
  }
})

test('hyp is Math.hypot to the bit', async () => {
  const { hyp } = await import('./hyp.ts')
  const r = seeded(3)
  for (let i = 0; i < 200000; i += 1) {
    const a = (r() - 0.5) * 10 ** (r() * 8 - 3)
    const b = i % 5 === 0 ? 0 : (r() - 0.5) * 10 ** (r() * 8 - 3)
    assert.equal(hyp(a, b), Math.hypot(a, b))
  }
})

test('hyp matches Math.hypot on its edges', async () => {
  const { hyp } = await import('./hyp.ts')
  for (const [a, b] of [[0, 0], [Infinity, 1], [1, -Infinity], [NaN, 1], [1, NaN], [-0, 0], [0, -3], [-5, 0], [3, 4], [1e-300, 1e-300], [1e300, 1e300]]) assert.ok(Object.is(hyp(a!, b!), Math.hypot(a!, b!)), `${a}, ${b}`)
})
