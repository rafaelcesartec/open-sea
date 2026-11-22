/**
 * Math.hypot of two numbers, as V8 computes it (scaled, Kahan-summed), so the results are the same to the bit; but
 * a plain function the optimiser inlines, where the builtin returns each result as a new heap number.
 */
export function hyp(a0: number, b0: number): number {
  const a = Math.abs(a0)
  const b = Math.abs(b0)
  const m = Math.max(a, b)
  // Infinity, 0 and NaN are what Math.hypot gives for them. (Written without reassigned variables: in that form V8
  // kept the numbers boxed, and every call allocated.)
  if (m === Infinity || m === 0 || m !== m) return m
  const x = a / m
  const y = b / m
  // V8's Kahan summation of the two squares, from a sum and a compensation of 0.
  const s1 = x * x
  const c1 = s1 - 0 - s1
  const s2 = y * y - c1
  return Math.sqrt(s1 + s2) * m
}

/** hyp(H[0], H[1]) into H[2]: for code that must not pass or return numbers through a call (V8 boxes them unless
 * it inlines the call, and its middle tier often does not). Write `(H[0] = a, H[1] = b, hypH(), H[2]!)`. */
export const H = new Float64Array(3)
export function hypH(): void {
  // hyp's own steps, not a call to it: a tier that does not inline it would box what passes through.
  const a = Math.abs(H[0]!)
  const b = Math.abs(H[1]!)
  const m = Math.max(a, b)
  if (m === Infinity || m === 0 || m !== m) {
    H[2] = m
    return
  }
  const x = a / m
  const y = b / m
  const s1 = x * x
  const c1 = s1 - 0 - s1
  const s2 = y * y - c1
  H[2] = Math.sqrt(s1 + s2) * m
}
