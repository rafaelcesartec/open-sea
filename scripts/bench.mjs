// Runs the 60-second benchmark of dist/index.html in headless Chrome, both styles, and prints the report as JSON:
// GPU time per frame (timestamp queries), CPU time, frame intervals. ALLOC=1 also samples the JS allocations (by
// function) and GC=1 traces the garbage collections, both from AFTER seconds in (default 8: past the warm-up); each
// slows the page a little, so time without them.
// `node scripts/bench.mjs [mosaic|smooth] [seconds] [index|debug]`

import { open } from './chrome.mjs'

const [style = '', seconds = '60', page = 'index'] = process.argv.slice(2)
const c = await open(`?bench=${style}&seconds=${seconds}`, { width: 1280, height: 720, page: new URL(`../dist/${page}.html`, import.meta.url) })
await c.send('HeapProfiler.enable')
let profile
let tracing = false
const started = Date.now()
let sampling = false
for (;;) {
  await new Promise(r => setTimeout(r, 1000))
  const title = await c.evaluate('document.title')
  // Sample allocations once the sea is warm and frames are being drawn.
  if (process.env.ALLOC !== undefined && !sampling && Date.now() - started > Number(process.env.AFTER ?? 8) * 1000) {
    await c.send('HeapProfiler.startSampling', { samplingInterval: 8192, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true })
    sampling = true
  }
  // The garbage collections, from V8's own trace events (its log does not reach us from a headless renderer).
  if (process.env.GC !== undefined && !tracing && Date.now() - started > Number(process.env.AFTER ?? 8) * 1000) {
    await c.send('Tracing.start', { traceConfig: { includedCategories: ['v8', 'devtools.timeline', 'disabled-by-default-v8.gc'] }, transferMode: 'ReportEvents' })
    tracing = true
  }
  if (title === 'bench done') break
  if (Date.now() - started > (Number(seconds) * 2 + 120) * 1000) throw new Error('timed out\n' + c.logs.join('\n'))
}
profile = sampling ? (await c.send('HeapProfiler.stopSampling')).result.profile : { head: { callFrame: { functionName: '', url: '', lineNumber: 0, columnNumber: 0 }, selfSize: 0, children: [] } }
const result = await c.evaluate('window.__bench')
const trace = tracing ? await c.endTrace() : []
const gcEvents = trace.filter(e => e.ph === 'X' && /^(MinorGC|MajorGC|V8\.GC_SCAVENGER|V8\.GC_MARK_COMPACTOR|V8\.GC_MC_)/.test(e.name) && e.dur !== undefined)
const gcSum = {}
for (const e of gcEvents) {
  const g = (gcSum[e.name] ??= { count: 0, maxMs: 0, totalMs: 0 })
  g.count += 1
  g.maxMs = Math.max(g.maxMs, e.dur / 1000)
  g.totalMs += e.dur / 1000
}
// Allocations by function, the self size of each node.
const by = new Map()
const walk = (n, path) => {
  const name = `${n.callFrame.functionName || '(anonymous)'} ${n.callFrame.url.split('/').pop()}:${n.callFrame.lineNumber}:${n.callFrame.columnNumber}`
  if (n.selfSize > 0) by.set(name, (by.get(name) ?? 0) + n.selfSize)
  for (const k of n.children) walk(k, path)
}
walk(profile.head, '')
const top = [...by].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => `${(v / 1024).toFixed(1)} KB  ${k}`)
const total = [...by.values()].reduce((a, b) => a + b, 0)
console.log(JSON.stringify({ result, sampledAllocations: sampling ? { totalKB: Math.round(total / 1024), top } : 'not sampled', gc: tracing ? gcSum : 'not traced', logs: c.logs.filter(l => !l.startsWith('BENCH')).slice(0, 10) }, null, 1))
c.close()
