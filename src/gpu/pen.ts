// What the drawings (gpu/draw/) draw with: the part of the 2D canvas they use, made so a drawing need not allocate.
// A Pen is the canvas's context; a Shape its Path2D, taken from the pen (`pen.shape()`) instead of `new Path2D()`, so
// the GPU pen hands out the same few, reset each frame. A Grad's `stop` takes a colour as numbers: no string is built
// for a colour that changes (`rgba(…, ${alpha})`). A gradient's points are where they are when it is made.
//
// X and Y are `at` of draw/common.ts split in two: a point `along` the frame and `out` to its left, without the pair.

import type { Frame } from './reference/sim.ts'

export interface Shape {
  moveTo(x: number, y: number): void
  lineTo(x: number, y: number): void
  quadraticCurveTo(cx: number, cy: number, x: number, y: number): void
  bezierCurveTo(c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number): void
  closePath(): void
  arc(x: number, y: number, r: number, a0: number, a1: number, ccw?: boolean): void
  ellipse(x: number, y: number, rx: number, ry: number, rot: number, a0: number, a1: number, ccw?: boolean): void
}

export interface Grad {
  addColorStop(offset: number, color: string): void
  /** A stop in numbers: r, g, b 0 to 255, a 0 to 1. */
  stop(offset: number, r: number, g: number, b: number, a: number): void
}

export type Style = string | Grad

export interface Pen extends Shape {
  fillStyle: Style
  strokeStyle: Style
  lineWidth: number
  lineCap: string
  lineJoin: string
  globalAlpha: number
  beginPath(): void
  fill(path?: Shape): void
  stroke(path?: Shape): void
  clip(path?: Shape): void
  save(): void
  restore(): void
  createLinearGradient(x0: number, y0: number, x1: number, y1: number): Grad
  createRadialGradient(x0: number, y0: number, r0: number, x1: number, y1: number, r1: number): Grad
  /** An empty path, good until the frame ends. */
  shape(): Shape
}

export const TAU = Math.PI * 2
export const X = (f: Frame, along: number, out: number): number => f.x + f.fx * along - f.fy * out
export const Y = (f: Frame, along: number, out: number): number => f.y + f.fy * along + f.fx * out
export const EYE = '#1d1f22'

/** A frame to write into and pass around: a drawing keeps a few of its own instead of making new ones. */
export const frame = (): Frame => ({ x: 0.5, y: 0.5, fx: 0.5, fy: 0.5, w: 0.5, u: 0.5 })
export function copyFrame(to: Frame, from: Frame): Frame {
  to.x = from.x
  to.y = from.y
  to.fx = from.fx
  to.fy = from.fy
  to.w = from.w
  to.u = from.u
  return to
}
