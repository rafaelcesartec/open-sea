// Builds the WebGPU page as one file: dist/index.html, the script and its shaders inline, minified.
// `node scripts/build-gpu.mjs`; prints the size, raw and compressed.

import { build } from 'esbuild'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { brotliCompressSync, gzipSync } from 'node:zlib'
import { inlinePlugin } from './inline.mjs'

/** WGSL without comments or the spaces it does not need. */
const wgsl = {
  name: 'wgsl',
  setup(b) {
    b.onLoad({ filter: /\.wgsl$/ }, ({ path }) => {
      const code = readFileSync(path, 'utf8')
        .replace(/\/\/[^\n]*/g, '')
        .replace(/\s+/g, ' ')
        .replace(/ ?([{}()[\],;:=<>+\-*/%&|^!?@.]) ?/g, '$1')
        .replace(/->/g, '->')
        .trim()
      return { contents: `export default ${JSON.stringify(code)}`, loader: 'js' }
    })
  },
}

// The WebGPU port follows the canvas sources as they were copied into src/gpu/reference/ (see src/gpu/README.md):
// a source changed since, and the page would be built from the old one. Said loudly, not silently built.
const PORTED = ['sim.ts', 'school.ts', 'draw/all.ts', 'draw/common.ts', 'draw/shark.ts', 'draw/cetacean.ts', 'draw/turtle.ts', 'draw/ray.ts', 'draw/squid.ts', 'draw/school.ts']
const stale = PORTED.filter(f => !existsSync(`src/${f}`) || !existsSync(`src/gpu/reference/${f}`) || readFileSync(`src/${f}`, 'utf8') !== readFileSync(`src/gpu/reference/${f}`, 'utf8'))
const fresh = readdirSync('src/draw').filter(f => f.endsWith('.ts') && !PORTED.includes(`draw/${f}`))
if (stale.length > 0 || fresh.length > 0) {
  console.warn(`\n!! Not yet in the WebGPU port, built without it: ${[...stale.map(f => `src/${f} (changed)`), ...fresh.map(f => `src/draw/${f} (new)`)].join(', ')}`)
  console.warn('!! Port it as src/gpu/README.md says, then build again.\n')
}

// `--debug`: unminified, as dist/debug.html, for profiling by name.
const debug = process.argv.includes('--debug')
// Two scripts: the player alone (play.ts), which the site's Export copies into the file it makes, and the site
// (site.ts: the panel, Export, the benchmark), which runs the player the page already has.
const bundle = async entry => {
  const out = await build({ entryPoints: [entry], bundle: true, minify: !debug, format: 'iife', target: 'es2022', write: false, legalComments: 'none', plugins: [wgsl, inlinePlugin] })
  return out.outputFiles[0].text.replace(/<\/script/g, '<\\/script')
}
const player = await bundle('src/gpu/play.ts')
const site = await bundle('src/gpu/site.ts')
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Open Water</title><style>html,body{margin:0;height:100%;background:#191919}#sea{position:fixed;inset:0}</style></head><body><div id="sea"></div><script id="ow-player">${player}</script><script>${site}</script></body></html>`
mkdirSync('dist', { recursive: true })
const file = debug ? 'dist/debug.html' : 'dist/index.html'
writeFileSync(file, html)
const kb = n => `${(n / 1024).toFixed(1)} KB`
console.log(`player alone (what Export writes): ${kb(Buffer.byteLength(player))} minified, ${kb(gzipSync(player, { level: 9 }).length)} gzip`)
console.log(`${file}: ${kb(Buffer.byteLength(html))} minified, ${kb(gzipSync(html, { level: 9 }).length)} gzip, ${kb(brotliCompressSync(html).length)} brotli`)
