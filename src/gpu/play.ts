// The player's script on its own (scripts/build-gpu.mjs builds it apart from the site): `OpenWater.play` for the
// site, and, in a file the site exported, the sea itself, at once, into its `#sea` element, with the settings
// written into it (`OPEN_WATER`, before this script). Those are fixed but for light or dark: that follows the
// browser's preference, as it changes.

import type { Settings } from '../panel.ts'
import { play } from './player.ts'

const g = globalThis as { OpenWater?: { play: typeof play }; OPEN_WATER?: Settings }
g.OpenWater = { play }
const settings = g.OPEN_WATER
if (settings !== undefined) {
  const dark = matchMedia('(prefers-color-scheme: dark)')
  settings.theme = dark.matches ? 'dark' : 'light'
  void play(document.getElementById('sea') ?? document.body, settings, { live: true, timed: false, quiet: true }).then(app => {
    dark.addEventListener('change', () => {
      settings.theme = dark.matches ? 'dark' : 'light'
      app?.apply({ theme: settings.theme })
    })
  })
}
