# Open Sea

- The sea is in two versions: the canvas one (`src/`, `open-water.js`, the Claude theme) and the WebGPU one
  (`src/gpu/`, built into `dist/index.html`), a port that does not follow `src/` by itself.
- Any change to `src/sim.ts`, `src/school.ts` or `src/draw/` (a new animal, a new look, a new behaviour) is carried
  into the WebGPU port in the same task, as `src/gpu/README.md` says: copy into `src/gpu/reference/`, port, pass
  `node --test src/gpu/`, then `npm run build:gpu` with no `!!` lines. A change to how `src/index.ts` paints is ported
  by hand into `src/gpu/player.ts`.
- Code in `src/gpu/` that runs each frame allocates nothing: the rules are in `src/gpu/README.md`.
- The WebGPU page is live at https://opensea.rafaelcesar.com (a Cloudflare Worker, `wrangler.jsonc`). Publishing
  is `npm run deploy:gpu`, by hand, only when asked: see "Publishing" in `src/gpu/README.md`.
