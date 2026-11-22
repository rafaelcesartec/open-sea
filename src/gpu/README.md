# Open Sea on WebGPU

The page `dist/index.html`: the sea drawn by the GPU, as one file, with the panel and the **Export** button, which
writes `open-water.html` (the player alone, the settings fixed) for anyone to put on their own site. It is a **port**
of the canvas version: its own simulation and drawings, made so a frame allocates nothing. So a change to the canvas
version does not reach it by itself. This file says how to carry one over.

```bash
npm run build:gpu    # builds dist/index.html; warns if a canvas source changed since it was ported
node --test src/gpu/ # the port against the canvas version it follows: must pass before a build
npm run bench:gpu    # 60 s camera path at 2560×1440, both styles: GPU and CPU time per frame
npm run deploy:gpu   # builds, then publishes dist/ to https://opensea.rafaelcesar.com
```

## Publishing

The page is live at **https://opensea.rafaelcesar.com**, served by Cloudflare: `wrangler.jsonc` makes `dist/` the
static assets of a Worker named `open-sea`, with `opensea.rafaelcesar.com` as its custom domain, so Cloudflare keeps
the DNS record and the certificate itself. `npm run deploy:gpu` builds and publishes, with the Cloudflare login of
`wrangler` on this machine (`npx wrangler@4 login` if it has none). It does not run on a push: a GitHub Action would
need a Cloudflare API token in the repository's secrets. `dist/` is not in git; build it before you deploy.

## What follows what

| Canvas version (`src/`) | Copy it follows (`src/gpu/reference/`) | Port (`src/gpu/`) |
|---|---|---|
| `sim.ts`, `school.ts` | `sim.ts`, `school.ts` | `sea.ts` (the kinds themselves: `kinds.ts`, read from the copy) |
| `draw/*.ts` | `draw/*.ts` | `draw/*.ts` |
| `index.ts` (how the sea is laid out and painted) | none | `player.ts`, `gfx.ts`, `gpen.ts`, `sea.wgsl` |
| `panel.ts`, `mosaic.ts` (colours, tiles, glyphs) | none: used as they are | |

`reference/` holds the canvas sources exactly as they were when last ported. The tests compare the port with it,
and the build compares it with `src/`: `npm run build:gpu` lists every file that has changed since, and every new file
in `src/draw/`, with `!!` before the build sizes. Built that way, the page is the old sea.

## Carrying a change over

1. Make the change in the canvas version (`src/`) and see it there (`index.html`).
2. Copy each changed file into `src/gpu/reference/`, as it is.
3. Make the same change in the port (`src/gpu/sea.ts`, `src/gpu/draw/…`), following the rules below.
4. `node --test src/gpu/` until it passes. It prints the first thing that differs: a sea that is not the same step for
   step, or a drawing that makes a different call or number, with the original's and the port's side by side.
5. `npm run build:gpu`: no `!!` lines left.
6. If drawing got heavier (a new big animal, many new shapes), `npm run bench:gpu`: no frame over 16.7 ms.

A change only to `index.ts` (how things are painted: colours, depth, light) has no copy and no test against it: port
it by hand into `player.ts` (and `sea.wgsl` if it is in the shader), then look at both pages side by side.

## A new animal

- **A new kind of an existing body** (another shark, another whale): its entry in `KINDS` (`sim.ts`), its look in the
  drawing of its body (`LOOKS` in `draw/shark.ts`, `draw/cetacean.ts`), its label and group in `panel.ts`. In the port:
  copy `sim.ts` and the drawing to `reference/`, add the same look to `src/gpu/draw/<body>.ts` with any new code it
  draws, and `sea.ts` needs nothing (it takes the kinds from the copy).
- **A new body** (a plan that is not shark, cetacean, turtle, ray, squid or school): its `Plan` in `sim.ts`, a new
  `src/draw/<body>.ts` and its line in `src/draw/all.ts`. In the port: the same files in `reference/`, a new
  `src/gpu/draw/<body>.ts` and its line in `src/gpu/draw/all.ts`; then add the file to `PORTED` in
  `scripts/build-gpu.mjs`, so the build watches it too. If it moves in a new way, `sea.ts` too.

The tests check every kind in `KINDS`: a new one is drawn and stepped against its original from the start.

## The rules of the port

A frame must allocate nothing in JavaScript, or the garbage collector runs while the sea swims. V8 allocates for a
number passed to, or returned from, a call it does not inline (and its first tiers inline little), and for every new
object, array or closure. So in anything that runs each frame (`sea.ts`, `draw/`, `gpen.ts`, `player.ts`'s paint):

- No `[...]`, `{...}`, spread, `.map/.filter/.slice/.forEach`, `for…of` over arrays, destructuring of arrays, closures
  made per call, template strings, `new Path2D()`. Index loops; arrays made once at the module's start, sized for the
  most; `ctx.shape()` for a path.
- Numbers between helpers go through an object's fields or a `Float64Array`, not arguments or return values: each
  file keeps its own (`$`, `W`, `H`, `TT`, `BL`…). A helper takes objects and whole numbers, and writes its result.
  `X(f, a, b)` and `Y(…)` (a point on a frame), one-line `const f = (…) => expression` helpers and the path calls
  (`moveTo`, `arc`…) are fine as they are: the build writes them out in place (`scripts/inline.mjs`).
- `hyp(a, b)` (`hyp.ts`) instead of `Math.hypot`, which boxes its result; in a loop, `(H[0] = a, H[1] = b, hypH(),
  H[2]!)`.
- A colour whose alpha changes (`rgba(…, ${a})`) is a fixed colour and `globalAlpha`; a gradient stop with a changing
  alpha is `grad.stop(offset, r, g, b, a)`.
- Keep every sum in the original's order: the tests compare numbers to nine digits, and the sea step for step, to the
  bit.
- A number stored at the module's level is a field of `$` (a `let` there would box it at every write); start it as a
  fraction (`0.5`) if it will hold fractions.

## Files

- `play.ts`: the player's script, on its own: what Export copies into the file it writes.
- `player.ts`: the player: the sea laid out, stepped and painted into an element; light or dark as told.
- `site.ts`: the page: the panel, the saved settings, Export, `?bench`.
- `sea.ts`: the simulation (`sim.ts` and `school.ts`) without allocating; `kinds.ts`: the kinds in one shape.
- `draw/`: each body's drawing, the same calls as `src/draw/`; `draw/rec.ts` records them for the tests.
- `gpen.ts`: the pen the drawings draw with: paths into stencil and cover draws, batched.
- `gfx.ts`, `sea.wgsl`: the GPU's targets, pipelines, passes and shaders.
- `bench.ts`: the benchmark; `hyp.ts`: `Math.hypot` that does not box.
- `reference/`: the canvas sources the port follows.
- `scripts/build-gpu.mjs`, `scripts/inline.mjs` (the build), `scripts/bench.mjs` and `scripts/chrome.mjs` (headless
  Chrome).
