// Open Sea as the Claude app's look: the sea behind the conversation, live, at night or by day as the app is. The
// sea is simulated here, a few seconds at a time, and each stretch is sent to the app as one SVG that plays itself
// (backdrop.js, bundled from src/backdrop.ts by `npm run theme`).
// ONE SEA, WHATEVER THE CHAT: each chat is a session of its own, running this module by itself, and the app shows the
// backdrop of the chat in view. So the sea runs on the clock, and the session that shows it leaves it in the store
// every few seconds: a chat opened or shown again carries on the same animals from where they are by now.

import type { Register, ThemeSetArgs } from 'claude-code'

import { createBackdrop } from './backdrop.js'
import { makeColors } from './make-colors.js'

// The water at night, a little bluer in the panels, as the deep fades into it; by day the page's pale water, the
// cards lighter than it. The page's own accents, its night ones for the hue.
const { problems } = makeColors({
  label: 'Open Sea',
  roles: { accent: '#8fd3e8', danger: '#e07a6e', success: '#7ee0a1', warning: '#e0b86e', pro: '#b9a3e8' },
  light: {
    gray: {
      anchors: {
        'surface-0': '#e3eaed',
        'surface-1': '#edf2f4',
        'surface-2': '#f6f9fa',
        'text-primary': '#1a2024',
        'text-secondary': '#3d4a51',
        'text-muted': '#55626a',
      },
    },
  },
  dark: {
    gray: {
      anchors: {
        'surface-0': '#15191e',
        'surface-1': '#1a1f25',
        'surface-2': '#1f252c',
        'surface-3': '#242b33',
        'text-primary': '#eef1f2',
        'text-secondary': '#c3ccd1',
        'text-muted': '#95a1a8',
      },
    },
  },
})

const SCENE = 'open-water'
// A stretch of sea a send; two seconds fits the app's limit at ten samples a second.
const SECONDS = 2
/** Samples of sea a second, as backdrop.ts counts them from the Unix epoch, and samples a send. */
const RATE = 10
const SAMPLES = SECONDS * RATE
/** Milliseconds before a stretch is due that it is worked out: more than that takes, so it is sent on time. */
const AHEAD = 500
/** Stretches with nobody asking for the backdrop after which the sea stops: the chat is out of view. */
const UNASKED = 3
/** Where the sea is left for the other sessions. */
const KEPT = 'sea'
/** Up to three animals at once, and not the blue whale or the school: they light the most tiles, so the app has the
 * least to redraw. */
const AT_ONCE = 3
const SPECIES = ['white', 'hammer', 'tiger', 'blacktip', 'orca', 'dolphin', 'turtle', 'manta', 'squid', 'whaleshark', 'humpback']
// A switch for the sea, set here: the mod has no settings panel of its own, so change it and reload the app.
// SEA_COLOUR: the blue of the open ocean seen from above, deep blue by day and near black at night, as the app's mode;
// off, the sea is black and white, as before the blue. The blue is the same as the page's (mosaic.ts).
const SEA_COLOUR = true
const [WATER, LIGHT_WATER] = SEA_COLOUR ? ['#0a2034', '#2f86ad'] : ['#191919', '#dde6e9']
// Only the sea is ours: the app's own colours stay as they are, in both modes. No veil on the panels: even of the
// water's own colour, the app mixes its soft edge a level off here and there, faint vertical lines at the sides of
// the text; and no blur, which it would redo at every change of a sea that moves.
const LOOK: ThemeSetArgs = { backdrop: { scene: SCENE, glass: { blur: 0, opacity: 0 } } }

export const register: Register = on => {
  const sea = createBackdrop({
    seconds: SECONDS,
    atOnce: AT_ONCE,
    species: SPECIES,
    water: WATER,
    lightWater: LIGHT_WATER,
    // Nothing still of ours over the water: only the animals move over the app's background.
    texture: false,
  })
  // The stretch playing. One frame, not two: the one before kept under the new one, so the animals would not blink
  // out while the app makes the new frame, stood still between sends in the app's own window (0.3.0, 0.3.1).
  let svg = ''
  /** The sea is going: a stretch is due. Not in the terminal, where nothing draws it, nor in a chat out of view. */
  let going: Promise<void> | undefined
  /** When the backdrop was last asked for: the app asks at every send while the chat is in view, and not out of it. */
  let asked = 0
  let timer: { cancel: () => void } | undefined
  let run = 0
  const stop = (): void => {
    run += 1
    timer?.cancel()
    going = undefined
  }

  on('session.start', async ($, e, next) => {
    const unpainted = problems.find(line => line.startsWith("Desktop won't paint"))
    if (unpainted !== undefined) $.ui.toast(unpainted)
    // Not drawn in the terminal and editors, and that is fine: the backdrop is only for the app.
    await $.theme.set(LOOK)
    return next(e)
  })

  // A /clear ends the session and no other starts: the chat goes on, and so does its sea.
  on('session.end', ($, e, next) => {
    if (e.reason !== 'clear') stop()
    return next(e)
  })

  on('ui.render', { component: 'Backdrop' }, async ($, e, next) => {
    if ((e.surface !== 'desktop' && e.surface !== 'mobile') || e.props.scene !== SCENE) return next(e)
    // Asked with no sea going (the chat just opened, or shown again): from this moment, carrying on the sea the last
    // session to show it left. From then on each stretch is worked out ahead and sent when it is due: the clock's
    // own callbacks, as a hook that waits is cut off.
    asked = await $.clock.now()
    going ??= (async () => {
      const mine = (run += 1)
      let from = Math.floor(asked / (1000 / RATE)) + 1
      let left = -1
      svg = sea.at(from, await $.store.get(KEPT))
      const ahead = async (): Promise<void> => {
        if (mine !== run) return
        const ms = await $.clock.now()
        // Out of view: no sea is worked out for it, and what the app kept of it is let go, so that shown again it
        // asks, and gets the sea as it is by then instead of the stretch it left at, played again.
        if (ms - asked > UNASKED * SECONDS * 1000) {
          stop()
          $.ui.invalidate('ui.render')
          return
        }
        // Late by a stretch or more (the computer slept): from now, not from where it should have been.
        const now = Math.floor(ms / (1000 / RATE))
        from = Math.max(from + SAMPLES, now + 1)
        const due = sea.at(from, await $.store.get(KEPT))
        const saved = sea.saved(now)
        if (saved !== undefined && saved.at !== left) {
          left = saved.at
          await $.store.set(KEPT, saved)
        }
        timer = $.clock.after(Math.max(0, from * (1000 / RATE) - (await $.clock.now())), () => {
          if (mine !== run) return
          svg = due
          $.ui.invalidate('ui.render')
          timer = $.clock.after(SECONDS * 1000 - AHEAD, ahead)
        })
      }
      timer = $.clock.after(SECONDS * 1000 - AHEAD, ahead)
    })()
    await going
    const { Svg } = $.ui.resolve(e)
    return <Svg source={svg} alt="Sea animals swimming past, seen from above, as a mosaic" isInteractive />
  })
}
