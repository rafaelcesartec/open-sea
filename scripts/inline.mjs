// A build step for the drawings (src/gpu/draw/): each path call and each X/Y becomes the writes it stands for, in
// place. V8 boxes a number passed to a call it does not inline, and its middle tier inlines little: written out like
// this, a drawing passes no numbers through calls at all. The source stays readable; draw.test.ts checks that the
// drawings built this way draw the same, op for op.
//
//   p.moveTo(x, y)  ->  writes op 1, x, y into p.cmd (gpen.ts's Path: what the pen and its shapes record into)
//   X(f, a, b)      ->  (f.x + f.fx * (a) - f.fy * (b)), as pen.ts's X; Y likewise

const OPS = { moveTo: [1, 2], lineTo: [2, 2], quadraticCurveTo: [3, 4], bezierCurveTo: [4, 6], ellipse: [6, 8], arc: [6, 6] }

/** The arguments of the call whose '(' is at `open`, and where it ends. */
function args(src, open) {
  const out = []
  let depth = 0
  let from = open + 1
  for (let i = open; i < src.length; i += 1) {
    const c = src[i]
    if (c === '(' || c === '[' || c === '{') depth += 1
    else if (c === ')' || c === ']' || c === '}') {
      depth -= 1
      if (depth === 0) {
        if (src.slice(from, i).trim() !== '') out.push(src.slice(from, i).trim())
        return { out, end: i + 1 }
      }
    } else if (c === ',' && depth === 1) {
      out.push(src.slice(from, i).trim())
      from = i + 1
    } else if (c === "'" || c === '"' || c === '`') {
      const q = c
      for (i += 1; src[i] !== q; i += 1) if (src[i] === '\\') i += 1
    }
  }
  throw new Error('inline: unbalanced call')
}

const simple = s => /^[\w$]+(\.[\w$]+|\[[\w$ +\-*%]+\]!?)*!?$/.test(s)

function rewrite(src) {
  let out = ''
  let i = 0
  const re = /\b([\w$]+)\.(moveTo|lineTo|quadraticCurveTo|bezierCurveTo|ellipse|arc)\(|(?<![\w$.])([XY])\(/g
  for (let m; (m = re.exec(src)) !== null; ) {
    if (m.index < i) continue
    // Not in a comment.
    const line = src.slice(src.lastIndexOf('\n', m.index) + 1, m.index)
    if (/\/\/|^\s*\*/.test(line)) continue
    const open = m.index + m[0].length - 1
    const { out: a, end } = args(src, open)
    const v = a.map(rewrite)
    let rep
    if (m[3] !== undefined) {
      if (v.length !== 3 || !simple(v[0])) throw new Error(`inline: ${m[3]}(${a.join(', ')}): the frame must be a plain name`)
      const f = v[0]
      rep = m[3] === 'X' ? `(${f}.x + ${f}.fx * (${v[1]}) - ${f}.fy * (${v[2]}))` : `(${f}.y + ${f}.fy * (${v[1]}) + ${f}.fx * (${v[2]}))`
    } else {
      const [op, count] = OPS[m[2]]
      let vals = v
      if (m[2] === 'arc') vals = [v[0], v[1], v[2], null, '0', v[3], v[4], v[5] ?? 'false']
      else if (m[2] === 'ellipse') vals = [...v.slice(0, 7), v[7] ?? 'false']
      if (vals.length !== (m[2] === 'arc' ? 8 : count)) throw new Error(`inline: ${m[0]}${a.join(', ')}): ${vals.length} arguments`)
      // The radius of an arc is written twice: worked out once, into a scratch array (a variable would box it).
      const writes = vals.map((x, k) => {
        const at = `_c[_i + ${k + 1}]`
        if (m[2] === 'arc' && k === 2) return `${at} = _c[_i + 4] = ${x}`
        if (x === null) return null
        if (k === 7) return `${at} = (${x}) ? 1 : 0`
        return `${at} = ${x}`
      })
      // `void` first: a statement can begin with this without joining the line before it.
      rep = `void ((_q = ${m[1]}), (_c = _q.cmd), (_i = _q.cn), _i + 9 <= _c.length && ((_c[_i] = ${op}), ${writes.filter(w => w !== null).join(', ')}, (_q.cn = _i + ${1 + vals.length}), (_q.dirty = true)))`
    }
    out += src.slice(i, m.index) + rep
    i = end
    re.lastIndex = end
  }
  return out + src.slice(i)
}

/** One-line helpers `const name = (a: T, b: T): R => expression` of the file, written out where they are called:
 * each parameter becomes its argument, in parentheses. The arguments must be plain expressions (no calls that do
 * something): they may be written out more than once. */
function macros(src) {
  const defs = new Map()
  for (const m of src.matchAll(/^const ([\w$]+) = \(([^)]*)\)(?::\s*number)? => ([^\n{][^\n]*)$/gm)) {
    const params = m[2].split(',').map(p => p.split(':')[0].trim()).filter(Boolean)
    if (params.length === 0 || m[3].includes('=>') || m[3].trim().startsWith('[')) continue
    defs.set(m[1], { params, body: m[3].trim() })
  }
  if (defs.size === 0) return src
  const names = [...defs.keys()].join('|')
  const re = new RegExp(`(?<![\\w$.])(${names})\\(`, 'g')
  for (let pass = 0; pass < 8; pass += 1) {
    let out = ''
    let i = 0
    let changed = false
    for (let m; (m = re.exec(src)) !== null; ) {
      if (m.index < i) continue
      const line = src.slice(src.lastIndexOf('\n', m.index) + 1, m.index)
      // Not its own definition, nor in a comment.
      if (/^const [\w$]+ = $/.test(line) || /\/\/|^\s*\*/.test(line)) continue
      const { out: a, end } = args(src, m.index + m[0].length - 1)
      const { params, body } = defs.get(m[1])
      if (a.length !== params.length) throw new Error(`inline: ${m[1]} takes ${params.length} arguments`)
      let rep = body
      params.forEach((p, k) => (rep = rep.replace(new RegExp(`(?<![\\w$.])${p.replace('$', '\\$')}(?![\\w$])`, 'g'), () => `(${a[k]})`)))
      out += src.slice(i, m.index) + `(${rep})`
      i = end
      re.lastIndex = end
      changed = true
    }
    src = out + src.slice(i)
    if (!changed) break
  }
  return src
}

export function inline(src) {
  const out = rewrite(macros(src))
  if (out === src) return src
  // The scratch the writes use: the path, its array, and where in it (whole numbers and objects: none is boxed).
  return out + '\n// eslint-disable-next-line\nlet _q: { cmd: Float64Array; cn: number; dirty: boolean }, _c: Float64Array, _i: number\n'
}

/** For esbuild: the drawings, inlined. */
export const inlinePlugin = {
  name: 'inline-draw',
  setup(b) {
    b.onLoad({ filter: /src\/gpu\/draw\/\w+\.ts$/ }, async ({ path }) => {
      if (/\/(rec|all|draw\.test)\.ts$/.test(path)) return undefined
      const { readFile } = await import('node:fs/promises')
      return { contents: inline(await readFile(path, 'utf8')), loader: 'ts' }
    })
  },
}
