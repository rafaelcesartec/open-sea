// Builds the WebGPU page as one file: dist/index.html, the script and its shaders inline, minified.
// `node scripts/build-gpu.mjs`; prints the size, raw and compressed.

import { build } from 'esbuild'
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
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
// The author's photo before the GitHub mark, inline as the rest of the page is: 72 px, sharp at 3× for its 22 px.
const avatar = readFileSync('assets/self.jpg').toString('base64')
const favicon = readFileSync('assets/favicon.svg').toString('base64')
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Open Sea</title><meta name="description" content="A live ocean seen from above: sharks, whales, orcas and fish schools at real scale, each one hunting, fleeing and swimming on its own. Drawn by WebGPU."><meta property="og:type" content="website"><meta property="og:url" content="https://opensea.rafaelcesar.com/"><meta property="og:title" content="Open Sea"><meta property="og:description" content="A live ocean seen from above: sharks, whales, orcas and fish schools at real scale, each one hunting, fleeing and swimming on its own. Drawn by WebGPU."><meta property="og:image" content="https://opensea.rafaelcesar.com/og.png"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:alt" content="A great white shark drawn as a mosaic of lettered tiles, seen from above, beside the Open Sea settings panel"><meta name="twitter:card" content="summary_large_image"><link rel="icon" type="image/svg+xml" href="data:image/svg+xml;base64,${favicon}"><style>html,body{margin:0;height:100%;background:#191919}#sea{position:fixed;inset:0}#gh{position:fixed;top:16px;left:52px;z-index:10;display:grid;place-items:center;width:36px;height:36px;border-radius:12px;color:#fff;opacity:.6;mix-blend-mode:difference;transition:opacity .15s}#gh:hover,#gh:focus-visible{opacity:1}#gh svg{width:22px;height:22px}#me{position:fixed;top:16px;left:16px;z-index:10;display:grid;place-items:center;width:36px;height:36px;border-radius:12px;opacity:.85;transition:opacity .15s}#me:hover,#me:focus-visible{opacity:1}#me img{width:22px;height:22px;border-radius:50%;display:block;box-shadow:0 0 0 1px #000}</style></head><body><div id="sea"></div><a id="me" href="https://rafaelcesar.com" target="_blank" rel="noopener" aria-label="Rafael César" title="rafaelcesar.com"><img src="data:image/jpeg;base64,${avatar}" alt=""></a><a id="gh" href="https://github.com/rafaelcesardev/open-sea" target="_blank" rel="noopener" aria-label="Open Sea on GitHub" title="Open Sea on GitHub"><svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z"/></svg></a><script id="ow-player">${player}</script><script>${site}</script></body></html>`
mkdirSync('dist', { recursive: true })
const file = debug ? 'dist/debug.html' : 'dist/index.html'
writeFileSync(file, html)
// The link preview (X, WhatsApp…): scrapers need a real URL, so it is a file next to the page, not inline.
copyFileSync('assets/og.png', 'dist/og.png')
const kb = n => `${(n / 1024).toFixed(1)} KB`
console.log(`player alone (what Export writes): ${kb(Buffer.byteLength(player))} minified, ${kb(gzipSync(player, { level: 9 }).length)} gzip`)
console.log(`${file}: ${kb(Buffer.byteLength(html))} minified, ${kb(gzipSync(html, { level: 9 }).length)} gzip, ${kb(brotliCompressSync(html).length)} brotli`)
