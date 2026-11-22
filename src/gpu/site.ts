// The site: the player (play.ts, its own script on the page), the panel to set it up, and Export, which writes a
// single file with the player alone and the settings chosen, to use on another page. `?bench` runs the benchmark.

import { mountPanel, type Settings } from '../panel.ts'
import { bench } from './bench.ts'
import { KINDS } from './reference/sim.ts'
import type { Names, play as Play } from './player.ts'

const SAVED = 'open-water:settings'
const { play } = (globalThis as unknown as { OpenWater: { play: typeof Play } }).OpenWater

function defaults(): Settings {
  return { theme: 'dark', style: 'mosaic', zoomOut: 1.5, cell: 10, atOnce: 4, species: KINDS.map(k => k.name) as Names, speed: 1, paused: false, observe: null, level: 1, surface: true, colour: true, grid: true }
}

/** The viewer's last choices, if this browser kept them; only what makes sense now. */
function load(): Settings {
  const settings = defaults()
  try {
    Object.assign(settings, JSON.parse(localStorage.getItem(SAVED) ?? '{}') as Partial<Settings>, { paused: false })
  } catch {
    // No storage here: the defaults stand.
  }
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
  settings.species = (Array.isArray(settings.species) ? KINDS.map(k => k.name).filter(n => (settings.species as string[]).includes(n)) : KINDS.map(k => k.name)) as Names
  settings.observe = null
  return settings
}

const kb = (n: number): string => `${(n / 1024).toFixed(1)} KB`

/** The page another site takes: the player and these settings, nothing else; always the open sea, and light or dark
 * as the visitor's browser prefers. Downloads it; says how big it is and how to use it. */
async function exportFile(settings: Settings): Promise<string> {
  const player = document.getElementById('ow-player')!.textContent!
  const [night, day] = settings.colour ? ['#0a2034', '#2f86ad'] : ['#191919', '#dde6e9']
  const { atOnce, species, style, surface, colour, zoomOut, cell, grid, speed } = settings
  // Always the open sea; the theme is left out: the file follows the visitor's browser (play.ts).
  const fixed = { atOnce, species, style, surface, colour, zoomOut, cell, grid, speed, paused: false, observe: null, level: 1 }
  // `<` written as \u003c, so nothing in the settings can close the script.
  const config = JSON.stringify(fixed).replace(/</g, '\\u003c')
  const html =
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Open Water</title>` +
    `<style>html,body{margin:0;height:100%;overflow:hidden;background:${night}}@media (prefers-color-scheme:light){html,body{background:${day}}}#sea{position:fixed;inset:0}</style></head>` +
    `<body><div id="sea"></div><script>OPEN_WATER=${config}</script><script>${player}</script></body></html>`
  const blob = new Blob([html], { type: 'text/html' })
  const gzip = await new Response(blob.stream().pipeThrough(new CompressionStream('gzip'))).blob()
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = 'open-water.html'
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  return `open-water.html: ${kb(blob.size)}, ${kb(gzip.size)} gzipped. On your site: <iframe src="open-water.html" style="border:0;width:100%;height:100%"></iframe>`
}

async function start(): Promise<void> {
  const host = document.getElementById('sea')!
  const params = new URLSearchParams(location.search)
  if (params.has('bench')) {
    const app = await play(host, defaults(), { live: false, timed: true, quiet: false })
    if (app !== undefined) await bench(app, params.get('bench') ?? '', Number(params.get('seconds') ?? 60))
    return
  }
  const settings = load()
  const app = await play(host, settings, { live: true, timed: false, quiet: false })
  if (app === undefined) return
  const change = (patch: Partial<Settings>): void => {
    app.apply(patch)
    try {
      localStorage.setItem(SAVED, JSON.stringify(settings))
    } catch {
      // Not remembered: no storage here.
    }
  }
  const panel = mountPanel(host, settings, change, app.inView, () => exportFile(settings))
  app.cover(panel.covered)
}

void start()
