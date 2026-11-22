// Every plan of body and the allocation-free function that draws it.

import type { Plan } from '../reference/sim.ts'
import type { Pen } from '../pen.ts'
import type { Beast } from '../sea.ts'
import { drawCetacean } from './cetacean.ts'
import { drawRay } from './ray.ts'
import { drawSchool } from './school.ts'
import { drawShark } from './shark.ts'
import { drawSquid } from './squid.ts'
import { drawTurtle } from './turtle.ts'

export const DRAW: Record<Plan, (ctx: Pen, a: Beast, tile: number) => void> = {
  shark: drawShark,
  cetacean: drawCetacean,
  turtle: drawTurtle,
  ray: drawRay,
  squid: drawSquid,
  school: drawSchool,
}
