// The kinds of the canvas version this port matches (reference/sim.ts: src/sim.ts as it was when ported), each the
// same shape of object. sim.ts builds them by spreading different templates, so they
// come in several shapes, and V8 then reads a number off one by a path that boxes it anew each time: an allocation
// for every `k.length`. Here every kind has the same fields in the same order.

import { KINDS, type Kind } from './reference/sim.ts'

export const KD: Kind[] = KINDS.map(k => ({
  name: k.name,
  plan: k.plan,
  length: k.length,
  girth: k.girth,
  widest: k.widest,
  snout: k.snout,
  profile: k.profile,
  reach: k.reach,
  fin: k.fin,
  hammer: k.hammer ?? false,
  speed: k.speed,
  beat: k.beat,
  turn: k.turn,
  trunk: k.trunk,
  sway: k.sway,
  surge: k.surge,
  sprint: k.sprint,
  whim: k.whim,
  stay: k.stay,
  prey: k.prey,
  levels: k.levels,
}))
