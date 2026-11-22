// Every plan of body and the function that draws it.

import type { Animal, Plan } from '../sim.ts'
import { drawCetacean } from './cetacean.ts'
import type { Ctx } from './common.ts'
import { drawRay } from './ray.ts'
import { drawSchool } from './school.ts'
import { drawShark } from './shark.ts'
import { drawSquid } from './squid.ts'
import { drawTurtle } from './turtle.ts'

export const DRAW: Record<Plan, (ctx: Ctx, a: Animal, tile: number) => void> = {
  shark: drawShark,
  cetacean: drawCetacean,
  turtle: drawTurtle,
  ray: drawRay,
  squid: drawSquid,
  school: drawSchool,
}
