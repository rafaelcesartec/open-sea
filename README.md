# Open Water

**English** · [Português](README.pt-BR.md)

![Mosaic animals swimming over a plain background: a giant squid, a turtle, a dolphin, a manta and two sharks](assets/open-water.svg)

**See it live:** https://rafaelcesardev.github.io/open-water/ · **Claude theme:** [install](#claude-theme)

A blue ocean seen from above, live, and the animals that pass through it, each at its real size: sharks (great white, hammerhead, tiger, blacktip and whale shark), blue whale, humpback, orca, dolphin, green turtle, manta, giant squid, a school of bigeye jacks. Drawn as a mosaic of lettered tiles, or as smooth outlines.

- **Live:** nothing is recorded. Each animal decides on the spot, with real randomness, so no minute repeats.
- **Only what is on screen exists:** at most 4 animals at a time (the school counts as one). Each comes in from a random edge, at a random point, stays a while and leaves; once it is fully off screen it stops existing, and soon another one comes in. The new one is never of the species that just left, nor of one already on screen.
- **Real size:** 80 units per metre. The blue whale (24 m) spans almost the width of the screen; the turtle (1.2 m) is small next to it; each jack in the school is 60 cm long. Deeper down, an animal is drawn smaller, a fifth less at the deepest level, so depth reads as distance; it grows or shrinks smoothly as it rises or sinks.
- **Behaviour:**
  - they cruise, dart and glide, each species at its own pace: the dolphin is restless, the whale hardly turns and just crosses;
  - they hunt what they hunt in real life: the orca chases sharks, dolphins and mantas; the tiger shark chases the turtle; the great white chases the blacktip, the dolphin and the turtle; the dolphin, tiger and hammerhead go after the school. The prey flees;
  - when two on the same level are about to cross, each predicts where the other will be and steers a little aside, early, without stopping. One heading into the other's body slows down to pass behind it, and the smaller gives way to the larger. The whale does not change course for a turtle: the small one gets out of the way, fast;
  - the school (160 jacks, the classic silver school of drone footage) moves together, tight and in the same direction. When a large animal swims through it, it opens right in front of its head, the two halves pass along its sides, flashing silver as they turn, and then close up again;
  - each swims at one of three levels: 1, just under the surface; 2, midwater; 3, so deep it almost disappears. Now and then it rises or sinks, slowly, to another of the levels its species uses: whale, orca, dolphin, turtle and manta keep to 1 and 2; the hammerhead and the giant squid to 2 and 3. A hunter goes to its prey's level. Animals on different levels do not avoid each other: the shallower passes over.
- **How each body moves:** the simulation steps 60 times a second, and the body bends along the path its head took.
  - sharks sway from side to side;
  - whale, orca and dolphin beat their tails up and down and barely sway sideways;
  - the turtle's shell and the manta's disc are rigid: the turtle rows with its front flippers and glides, and the manta flaps its wings slowly;
  - the squid goes mantle first, in jets, with its arms and tentacles trailing.
- **Real colours seen from above:** each species' back, darker in the middle and lighter towards the sides. Orca and manta use a slightly lifted black, or they would vanish in the dark sea. The deeper, the more an animal fades into the water: in the smooth style its colour goes towards the water's, a little bluer, and its outline blurs; in the mosaic its tiles turn see-through (half at level 2, almost invisible at 3). A school is spread through depth too: each fish swims a little above or below the school's level, drawn to its own size there and fainter when deeper, and a fish flees only what swims at its own level. Light from above casts a soft shadow, down and to the right, that falls over whatever swims beneath; the deeper the animal, the further and fainter it falls. In the dark sea it barely shows.
- **Surface:** the light the surface ripples focus (caustics) plays over the animals' backs, fixed to the water as they swim beneath it, stronger in the shallows and fainter at night.
- **Mosaic:** each tile lights up whole with the colour of the animal beneath it, a little lighter or darker than its neighbours, with a letter cut into it. The jacks are thinner than a tile, so each lights a short dash of about two and a half tiles through its middle, and the school shows as many parallel dashes, all in the same direction.

## Controls

A floating panel on the right, of see-through frosted glass (the animals show passing behind it). At the top: how many animals are on screen, the theme button (sun for light, moon for dark) and pause. Just below, the two modes:

- **Open sea:** animals come and go. Choose how many may appear at once (− 1 to 8 +) and which species may come in, in grouped buttons (Sharks, Mammals, Others), with a green dot on the ones on screen now. Turning a species off, or lowering the number, makes the ones left over swim away, never vanishing all at once.
- **Watch:** one animal alone, to look at its shape and movement. It keeps swimming, turning and speeding up as always, but the camera follows it and keeps it in the middle of the free area. Specks in the water stream past it and show how it moves. The cards show each one's real size, and the ‹ › arrows go to the next animal. Depth (Shallow, Mid, Deep) picks its level; on a change it rises or sinks there, slowly.

For both modes: mosaic or smooth, surface light on or off, the sea blue or black and white, distance (near or far), mosaic tile size, a grid over the water or plain water (mosaic only) and speed (0.5×, 1×, 2×).

Shortcuts: `Space` pauses, `H` hides the panel, `←` `→` change the watched animal, `Esc` goes back to the open sea.

The panel folds into a button. On a narrow screen it starts folded. Choices are saved in the browser (except the watched animal).

## Use

Open `index.html` through a server (modules do not load straight from a file):

```bash
npx serve .   # or: bunx serve .
```

On a site, all it takes is `open-water.js` and an element to fill:

```html
<div id="sea" style="position:fixed;inset:0"></div>
<script type="module">
  import { mountOpenWater } from './open-water.js'
  const stop = mountOpenWater(document.getElementById('sea'), { style: 'mosaic', zoomOut: 1.5, cell: 10, controls: true })
  // stop() to remove it
</script>
```

Options:

- `style`: `'mosaic'` (default), the animals as lettered tiles; or `'smooth'`, the smooth outline.
- `zoomOut`: how far off the sea is seen. `1` is the original size; more shows more sea and smaller animals. Default `1.5`.
- `cell`: the mosaic's tile size, in sea units (1600 wide at `zoomOut: 1`). Default `10`. Smaller makes a finer mosaic.
- `theme`: `'dark'` (default), the sea at night; or `'light'`, pale water.
- `atOnce`: the most animals at once (the school counts as one). Default `4`.
- `species`: the species that may come in, by name (`'white'`, `'hammer'`, `'tiger'`, `'blacktip'`, `'blue'`, `'orca'`, `'dolphin'`, `'turtle'`, `'manta'`, `'squid'`, `'jacks'`, `'whaleshark'`, `'humpback'`). Default: all.
- `speed`: how fast time runs. `1` is real time. Default `1`.
- `surface`: `true` (default) turns the surface light on (caustics over the animals); `false` turns it off.
- `colour`: `true` (default) paints the sea in the blue of the open ocean; `false` leaves it black and white, as before.
- `grid`: mosaic only. `true` (default) shows the faint grid and the small dashes over the water; `false` leaves the water plain, with only the animals.
- `background`: the water's colour in the dark theme. Default `#0a2034` (the night ocean); the day ocean is `#2f86ad`.
- `controls`: `true` shows the control panel. Default `false`, so a site that embeds it does not get a panel it did not ask for. `index.html` turns it on.

With "reduce motion" on in the system, it shows a still scene.

## Claude theme

Open Water's animals swimming live behind the conversation in the Claude desktop app and on mobile, as a mosaic. The sea is the app's background in each mode: the open ocean's blue by day, darker at night, plain, with the animals moving over it. This is a change from earlier versions, where the water was the app's own panel colour; the theme still changes none of the app's colours. In the terminal and in editors (VS Code, JetBrains) the theme draws nothing.

### Install

Needs Claude Code 2.1.275 or newer.

In the desktop app: click **+** next to the message box, then **Plugins**, **Add marketplace**, type `rafaelcesardev/open-water`, and then **Add plugin** on Open Water.

In the terminal, inside a Claude Code session:

```
/plugin install open-water --marketplace rafaelcesardev/open-water
```

It asks whether it may add the marketplace (answer `y`) and where to install (for you, in all projects, or in this one only).

Or straight from the shell:

```bash
claude plugin install open-water --marketplace rafaelcesardev/open-water
```

After installing, open a new session in the app: the theme comes in when the session starts.

### Update and remove

```bash
claude plugin marketplace update open-water   # brings the newest version
claude plugin uninstall open-water            # removes the theme; the app goes back to its own look
```

### What to expect

- Up to 3 animals at once: the four sharks, orca, dolphin, turtle, manta and giant squid. The blue whale and the school are left out, as they weigh the most on the app.
- The mod runs the simulation on your computer: about 5% of one core, on average.
- No surface light (caustics), no grid and no dashes of the page. The app has no settings panel: `SEA_COLOUR`, at the top of `theme/hooks/register.tsx`, switches the blue off.
- The sea follows the light or dark mode the app passes to the background (`prefers-color-scheme`): the night ocean (`#0a2034`) in dark mode, the day ocean (`#2f86ad`) in light. The panels have no veil and no blur, so the screen is one even tone.

### How it works

The app takes as a background an SVG with no script, redrawn at most 10 times a second. So the mod (`theme/`) runs the simulation itself and, every 2 seconds, sends the next stretch of sea as an SVG that animates itself, with 0.3 seconds more at its end, to keep swimming if the next one is late.

**One sea, whatever the chat.** Each chat is a session of its own, and the app shows the background of the chat in view. So the sea runs on the clock: a stretch starts at a moment counted from the Unix epoch, its randomness is seeded at its birth, and the session showing it leaves it in the mod's store every few seconds. A chat opened or shown again carries on the same animals from where they are by now. A chat out of view works nothing out once the app has not asked for its background for a few seconds; after 30 seconds with nobody watching, a new sea starts, empty.

- **Mosaic** (default): with no canvas, each body is painted into a grid of samples (`src/mosaic.ts`), two by two per tile, and the tile lights up where the body covers most of it, as on the page. The SVG holds the tiles of the first moment and, up to 10 times a second, only the ones that changed. The shades, letters and gaps are a still layer on top, in the water's colour, so they show only over a lit tile, and the app redraws only where tiles change. A deep animal is a half see-through tile over the water, so the same picture serves both modes. When a stretch goes over the app's limit (131,072 characters), it sends fewer moments per second.
- **Smooth** (`style: 'smooth'`): the drawn body, moved between samples by SMIL. One animal at a time, and only those that fit the limit (the four sharks, orca, dolphin and manta).

### Develop

```bash
npm run theme                       # builds theme/hooks/backdrop.js from src/backdrop.ts
claude --plugin-dir theme           # a session with the theme from this folder; or CLAUDE_CODE_PLUGIN_DIRS=theme
```

`theme/hooks/backdrop.js` is committed already built: whoever installs needs neither Node nor Bun.

## Code

- `src/sim.ts`: the simulation: species with real size and pace, coming in and leaving, chasing, fleeing, avoiding. It does not touch the browser: each sea keeps its own width, so two can run on the same page.
- `src/sim.test.ts`: the simulation's tests, with no canvas.
- `src/school.ts`: the school, fish by fish.
- `src/draw/`: how each kind of body is drawn (`shark`, `cetacean`, `turtle`, `ray`, `squid`, `school`).
- `src/index.ts`: the canvas (outline and mosaic) and `mountOpenWater`.
- `src/panel.ts`: the control panel.
- `open-water.js`: all of it bundled, ready for the browser.
- `src/svg.ts`: a drawing context that writes SVG instead of painting, and joins several moments into one animated SVG.
- `src/mosaic.ts`: the mosaic's tiles (the same as the page's) and the mosaic with no canvas.
- `src/backdrop.ts`: the sea as the Claude app's background; `theme/` is the mod that uses it.
- `src/gpu/`: the same sea on WebGPU, as one file (`npm run build:gpu`, into `dist/index.html`), with an Export button that writes it for another site. A port: a change to the simulation or the drawings is carried over as [src/gpu/README.md](src/gpu/README.md) says.

Everything is TypeScript; the only JavaScript is what is built (`open-water.js` and `theme/hooks/backdrop.js`) and `theme/hooks/make-colors.js`, copied as it came from the Claude Code mod kit. It works the same with Node or Bun:

```bash
npm install      # or: bun install
npm run check    # checks the types (or: bun run check)
npm test         # tests the simulation (or: bun test)
npm run build    # builds open-water.js again (or: bun run build)
```

Imports carry the `.ts` extension, so Node runs the source straight, with no compiling.
