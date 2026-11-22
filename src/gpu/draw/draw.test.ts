// Each ported drawing against its original: the same sea on one seed (sea.test.ts shows the two seas agree), each
// animal drawn by both onto a recording pen, now and then for an hour of sea, in both styles. They must match op for op.

import './rec.ts'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DRAW as ORIG } from '../reference/draw/all.ts'
import * as orig from '../reference/sim.ts'
import { createSea, fromFn, place, stepSea } from '../sea.ts'
import { DRAW as SOURCE } from './all.ts'
import { Rec } from './rec.ts'

// The drawings as the page gets them: built with their path calls written out (scripts/inline.mjs), so the test
// checks that step too. Each source module is bundled on its own, sharing sim.ts and sea.ts with this test.
const { build } = await import('esbuild')
const { inlinePlugin } = (await import(new URL('../../../scripts/inline.mjs', import.meta.url).href)) as { inlinePlugin: import('esbuild').Plugin }
const here = new URL('.', import.meta.url).pathname
const bundled = await build({
  stdin: { contents: `export { DRAW } from './all.ts'`, resolveDir: here, loader: 'ts' },
  bundle: true, format: 'esm', write: false, plugins: [inlinePlugin], logLevel: 'silent',
  external: ['../reference/sim.ts', '../sea.ts', '../kinds.ts', '../hyp.ts', '../pen.ts'],
})
const file = new URL('./.inlined.test-build.mjs', import.meta.url)
const { writeFileSync, rmSync } = await import('node:fs')
writeFileSync(file, bundled.outputFiles[0]!.text.replaceAll(/from "\.\.\/([\w./]+)"/g, (_, p: string) => `from "${new URL(`../${p}`, import.meta.url).href}"`))
const DRAW = ((await import(file.href)) as { DRAW: typeof SOURCE }).DRAW
rmSync(file)

function seeded(seed: number): () => number {
  let a = seed
  return () => (a = (a * 16807) % 2147483647) / 2147483647
}

function check(a: orig.Animal, b: Parameters<(typeof DRAW)['shark']>[1], tile: number, where: string): void {
  const plan = orig.KINDS[a.kind]!.plan
  const [p, q] = [new Rec(), new Rec()]
  ORIG[plan](p as unknown as CanvasRenderingContext2D, a, tile)
  DRAW[plan](q, b, tile)
  const n = Math.max(p.log.length, q.log.length)
  for (let i = 0; i < n; i += 1) {
    if (p.log[i] !== q.log[i]) assert.fail(`${where} ${orig.KINDS[a.kind]!.name} tile ${tile}, op ${i}:\n  original ${p.log[i]?.slice(0, 600)}\n  port     ${q.log[i]?.slice(0, 600)}`)
  }
}

const only = process.env.KIND
test('every drawing as the original, in the open sea', () => {
  const sea = orig.createSea(2400, 1350)
  const mine = createSea(2400, 1350)
  sea.atOnce = mine.atOnce = 8
  const [ra, rb] = [seeded(5), seeded(5)]
  const RB = fromFn(rb)
  const seen = new Set<string>()
  for (let i = 0; i < 3600 * 4; i += 1) {
    orig.stepSea(sea, 1 / 60, 20, ra)
    stepSea(mine, 1 / 60, 20, RB)
    if (i % 37 !== 0) continue
    sea.animals.forEach((a, j) => {
      const name = orig.KINDS[a.kind]!.name
      if (only !== undefined && !only.split(',').includes(name)) return
      seen.add(name)
      for (const tile of [0, 7.5]) check(a, mine.animals[j]!, tile, `step ${i}`)
    })
  }
  if (only === undefined) assert.equal(seen.size, orig.KINDS.length)
})

test('every drawing as the original, watched at every level', () => {
  for (let kind = 0; kind < orig.KINDS.length; kind += 1) {
    if (only !== undefined && !only.split(',').includes(orig.KINDS[kind]!.name)) continue
    const a = orig.createSea(4000, 2250)
    const b = createSea(4000, 2250, 1)
    const [ra, rb] = [seeded(kind + 1), seeded(kind + 1)]
    const RB = fromFn(rb)
    orig.place(a, kind, ra)
    place(b, kind, RB)
    for (let i = 0; i < 1200; i += 1) {
      orig.stepSea(a, 1 / 60, 20, ra)
      stepSea(b, 1 / 60, 20, RB)
      if (i % 11 === 0) for (const tile of [0, 12]) check(a.animals[0]!, b.animals[0]!, tile, `watch ${i}`)
    }
  }
})
