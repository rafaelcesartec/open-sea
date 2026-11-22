// The benchmark: 60 seconds of a fixed camera path over a fixed sea, at 2560 by 1440, once per style. The sea is
// seeded, so every run sees the same animals do the same things; the camera zooms in to almost twice as close and
// out again twice, drifting across the sea. Each frame's GPU time comes from timestamps (gfx.ts), its CPU time from
// the clock round the frame's own work, and the time between frames from requestAnimationFrame.

import type { App } from './player.ts'
import type { Rand } from './sea.ts'

const W = 2560
const H = 1440
const WARM = 120

type Stats = { avg: number; p50: number; p95: number; p99: number; max: number; over: number }
function stats(v: Float64Array, limit: number): Stats {
  const s = Float64Array.from(v).sort()
  const at = (q: number): number => s[Math.min(s.length - 1, Math.floor(q * s.length))] ?? 0
  let sum = 0
  let over = 0
  for (const x of v) {
    sum += x
    if (x > limit) over += 1
  }
  return { avg: sum / Math.max(1, v.length), p50: at(0.5), p95: at(0.95), p99: at(0.99), max: s[s.length - 1] ?? 0, over }
}

/** mosaic.ts's rng, as a Rand (sea.ts): its state in an array and its number in a field, so drawing one boxes
 * nothing. */
const seeded = (seed: number): Rand => {
  const a = new Uint32Array([seed])
  return {
    v: 0.5,
    next() {
      a[0] = a[0]! + 0x6d2b79f5
      let t = a[0]!
      t = Math.imul(t ^ (t >>> 15), t | 1)
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
      this.v = ((t ^ (t >>> 14)) >>> 0) / 4294967296
    },
  }
}

export async function bench(app: App, which: string, SECONDS = 60): Promise<void> {
  const FRAMES = Math.round(SECONDS * 60)
  const { canvas, gfx, settings } = app
  canvas.width = W
  canvas.height = H
  // Shown whole in the window, drawn at its full size.
  canvas.style.cssText = 'position:absolute;inset:0;margin:auto;max-width:100%;max-height:100%;aspect-ratio:16/9;width:100%;height:auto;display:block'
  settings.atOnce = 8
  const styles = which === 'mosaic' || which === 'smooth' ? [which] : ['mosaic', 'smooth']
  const out: Record<string, unknown> = { size: [W, H], seconds: SECONDS, timestamps: gfx.timed, adapter: await adapterInfo(gfx.device), warmupMs: app.warmed() }
  for (const style of styles) {
    settings.style = style as 'mosaic' | 'smooth'
    app.restart(seeded(20261121))
    app.warm(1500)
    const cpu = new Float64Array(FRAMES)
    const gap = new Float64Array(FRAMES)
    const animals = new Float64Array(FRAMES)
    const verts = new Float64Array(FRAMES)
    const mem = performance as Performance & { memory?: { usedJSHeapSize: number } }
    let heap0 = 0
    let f = -WARM
    // An object's field, not a closure's variable: writing a new number to it allocates nothing.
    const at = { last: 0 }
    await new Promise<void>(done => {
      const tick = (now: number): void => {
        if (f === 0) {
          gfx.frames = 0
          heap0 = mem.memory?.usedJSHeapSize ?? 0
        }
        const t = Math.max(0, f) / 60
        const sea = app.sea()
        const zoom = 1 + 0.9 * (0.5 - 0.5 * Math.cos((2 * Math.PI * t) / 30))
        const cx = sea.w / 2 + ((sea.w * (1 - 1 / zoom)) / 2) * Math.sin((2 * Math.PI * t) / 23)
        const cy = sea.h / 2 + ((sea.h * (1 - 1 / zoom)) / 2) * Math.sin((2 * Math.PI * t) / 17 + 1)
        const t0 = performance.now()
        app.stepAndDraw(cx, cy, zoom)
        if (f >= 0) {
          cpu[f] = performance.now() - t0
          gap[f] = f === 0 ? 0 : now - at.last
          animals[f] = sea.n
          verts[f] = gfx.pen.nv
        }
        at.last = now
        f += 1
        if (f < FRAMES) requestAnimationFrame(tick)
        else done()
      }
      requestAnimationFrame(tick)
    })
    const heap1 = mem.memory?.usedJSHeapSize ?? 0
    const gpu = await gfx.times()
    let mean = 0
    let most = 0
    for (let i = 0; i < FRAMES; i += 1) {
      mean += animals[i]! / FRAMES
      most = Math.max(most, verts[i]!)
    }
    const g = gap.subarray(1)
    out[style] = {
      gpu: stats(gpu, 16.7),
      gpuOver11: stats(gpu, 11).over,
      cpu: stats(cpu, 16.7),
      interval: stats(g, 16.7 * 1.5),
      frames: FRAMES,
      gpuFrames: gpu.length,
      animalsMean: mean,
      vertsMax: most,
      dropped: gfx.pen.dropped,
      heapDelta: heap1 - heap0,
    }
  }
  ;(window as unknown as { __bench: unknown }).__bench = out
  const pre = document.createElement('pre')
  pre.style.cssText = 'position:fixed;left:8px;top:8px;margin:0;padding:12px;background:#000c;color:#cfe;font:12px ui-monospace,monospace;z-index:9'
  pre.textContent = JSON.stringify(out, (_, v: unknown) => (typeof v === 'number' ? Math.round(v * 1000) / 1000 : v), 2)
  document.body.appendChild(pre)
  console.log('BENCH', JSON.stringify(out))
  document.title = 'bench done'
}

async function adapterInfo(device: GPUDevice): Promise<string> {
  const info = (device as GPUDevice & { adapterInfo?: GPUAdapterInfo }).adapterInfo
  return info === undefined ? 'unknown' : `${info.vendor} ${info.architecture} ${info.description}`.trim()
}
