// Every shader of the sea. Pixels are the target's, y down; colours are blended as the canvas blends them, on the
// stored values (no sRGB conversion), premultiplied.

struct Pass {
  size: vec2f,
  clock: f32,
  surface: f32,
}
@group(0) @binding(0) var<uniform> pass_: Pass;
// Cover instances: box, straight colour, (gradient, animal, alpha, extra): 3 vec4 each.
@group(0) @binding(1) var<storage, read> covers: array<vec4f>;
// Gradients: geometry, (type, stops), 12 colours, 3 vec4 of offsets: 17 vec4 each.
@group(0) @binding(2) var<storage, read> grads: array<vec4f>;
// Animals: (tint, caustic, coarse, depth), deep colour, (pixel, ox, oy): 3 vec4 each.
@group(0) @binding(3) var<storage, read> beasts: array<vec4f>;
@group(0) @binding(4) var net: texture_2d<f32>;
@group(0) @binding(5) var netSampler: sampler;
@group(0) @binding(6) var src: texture_2d<f32>;
@group(0) @binding(7) var srcSampler: sampler;

fn clip(p: vec2f) -> vec4f {
  return vec4f(p.x / pass_.size.x * 2.0 - 1.0, 1.0 - p.y / pass_.size.y * 2.0, 0.0, 1.0);
}

// The fans and strokes into the stencil.
@vertex fn vsFan(@location(0) p: vec2f) -> @builtin(position) vec4f {
  return clip(p);
}
@fragment fn fsNone() -> @location(0) vec4f {
  return vec4f(0.0);
}
@fragment fn fsNone2() -> Two {
  return Two(vec4f(0.0), vec4f(0.0));
}

struct Cover {
  @builtin(position) pos: vec4f,
  @location(0) @interpolate(flat) inst: u32,
  @location(1) uv: vec2f,
}

// A quad over the box of instance `i`.
@vertex fn vsCover(@builtin(vertex_index) v: u32, @builtin(instance_index) i: u32) -> Cover {
  let b = covers[i * 3u];
  let corner = array<vec2f, 6>(vec2f(0, 0), vec2f(1, 0), vec2f(0, 1), vec2f(0, 1), vec2f(1, 0), vec2f(1, 1))[v];
  let p = mix(b.xy, b.zw, corner);
  var o: Cover;
  o.pos = clip(p);
  o.inst = i;
  o.uv = corner;
  return o;
}

fn gradient(g: u32, p: vec2f) -> vec4f {
  let o = g * 17u;
  let geo = grads[o];
  let head = grads[o + 1u];
  var t: f32;
  if (head.x < 1.5) {
    let d = geo.zw - geo.xy;
    t = dot(p - geo.xy, d) / max(dot(d, d), 1e-6);
  } else {
    t = length(p - geo.xy) / max(geo.z, 1e-6);
  }
  t = clamp(t, 0.0, 1.0);
  let n = u32(head.y);
  if (n == 0u) {
    return vec4f(0.0);
  }
  var prev = grads[o + 2u];
  var prevAt = grads[o + 14u].x;
  if (t <= prevAt) {
    return prev;
  }
  for (var k = 1u; k < n; k += 1u) {
    let c = grads[o + 2u + k];
    let at = grads[o + 14u + k / 4u][k % 4u];
    if (t <= at) {
      // Interpolated premultiplied, then back.
      let f = (t - prevAt) / max(at - prevAt, 1e-6);
      let m = mix(vec4f(prev.rgb * prev.a, prev.a), vec4f(c.rgb * c.a, c.a), f);
      return vec4f(m.rgb / max(m.a, 1e-6), m.a);
    }
    prev = c;
    prevAt = at;
  }
  return prev;
}

// The caustic nets of index.ts: (scale, drift x, drift y), crossing so the light shimmers.
fn caustics(world: vec2f, coarse: f32) -> vec2f {
  let a = textureSampleLevel(net, netSampler, (world - vec2f(9.0, 4.0) * pass_.clock) / (128.0 * coarse), 0.0).r;
  let b = textureSampleLevel(net, netSampler, (world - vec2f(-6.0, 7.0) * pass_.clock) / (1.37 * 128.0 * coarse), 0.0).r;
  return vec2f(a, b);
}

// The colour of cover `i` at pixel `p`, tinted toward the deep and lit by the caustics, premultiplied.
fn shade(i: u32, p: vec2f) -> vec4f {
  let c1 = covers[i * 3u + 1u];
  let c2 = covers[i * 3u + 2u];
  var c = c1;
  if (c2.x >= 0.0) {
    c = gradient(u32(c2.x), p);
  }
  let b = u32(c2.y) * 3u;
  let paint = beasts[b];
  let deep = beasts[b + 1u];
  let map = beasts[b + 2u];
  // source-atop of the deep colour, then of white through each net: linear, so the same done fill by fill.
  var rgb = mix(c.rgb, deep.rgb, paint.x);
  if (pass_.surface > 0.5 && paint.y > 0.0) {
    let n = caustics(p * map.x + map.yz, paint.z) * paint.y;
    rgb = mix(rgb, vec3f(1.0), n.x);
    rgb = mix(rgb, vec3f(1.0), n.y);
  }
  let a = c.a * c2.z;
  return vec4f(rgb * a, a);
}

@fragment fn fsCover(v: Cover) -> @location(0) vec4f {
  return shade(v.inst, v.pos.xy);
}

struct Two {
  @location(0) colour: vec4f,
  @location(1) deep: vec4f,
}
// The mosaic's: also how deep the body is, wherever it covers.
@fragment fn fsCover2(v: Cover) -> Two {
  let b = u32(covers[v.inst * 3u + 2u].y) * 3u;
  // A tile lights where a body covers half of it. The canvas's antialiased edges add up where its shapes overlap, so
  // it lights a whole body's edge tiles at what MSAA counts as 0.4 (see paint() in main.ts): beasts[b + 2].w.
  return Two(shade(v.inst, v.pos.xy), vec4f(beasts[b].w, beasts[b + 2u].w, 0.0, 0.0));
}

// A plain quad in the instance's colour (premultiplied by the shader).
@fragment fn fsQuad(v: Cover) -> @location(0) vec4f {
  let c = covers[v.inst * 3u + 1u];
  return vec4f(c.rgb * c.a, c.a);
}

// An animal drawn in the atlas, laid on the sea: the instance's colour holds its rectangle in the atlas, in pixels.
@fragment fn fsLay(v: Cover) -> @location(0) vec4f {
  let r = covers[v.inst * 3u + 1u];
  let size = vec2f(textureDimensions(src));
  return textureSampleLevel(src, srcSampler, mix(r.xy, r.zw, v.uv) / size, 0.0);
}

// One way of a Gaussian blur, inside the instance's box: sigma and the direction in its colour.
@fragment fn fsBlur(v: Cover) -> @location(0) vec4f {
  let b = covers[v.inst * 3u];
  let c = covers[v.inst * 3u + 1u];
  let sigma = c.x;
  let dir = vec2i(i32(c.y), i32(c.z));
  let n = i32(min(ceil(sigma * 3.0), 24.0));
  let p = vec2i(v.pos.xy);
  let lo = vec2i(b.xy);
  let hi = vec2i(b.zw) - 1;
  var sum = vec4f(0.0);
  var weight = 0.0;
  for (var k = -n; k <= n; k += 1) {
    let w = exp(-f32(k * k) / (2.0 * sigma * sigma));
    let q = clamp(p + dir * k, lo, hi);
    sum += textureLoad(src, q, 0) * w;
    weight += w;
  }
  return sum / weight;
}

// THE WATER and, in the mosaic, the tiles: one triangle over the whole target.
struct Water {
  // The tile in pixels, the tiles across and down, the mosaic on (1) or not.
  tile: vec4f,
  water: vec4f,
  grid: vec4f,
  dash: vec4f,
  speck: vec4f,
  // Watching: the view's left and top (sea units), its scale (pixels a unit), the specks' cell (units).
  view: vec4f,
  // The speck's size in pixels; glyphs on; light (glyphs lifted) or dark (inked); the glyph's atlas cell.
  extra: vec4f,
  ink: vec4f,
}
@group(1) @binding(0) var<uniform> water: Water;
@group(1) @binding(1) var low: texture_2d<f32>;
@group(1) @binding(2) var deepTex: texture_2d<f32>;
@group(1) @binding(3) var glyphs: texture_2d<f32>;
@group(1) @binding(4) var dashes: texture_2d<f32>;
// Each of the 16 by 16 tiles: shade (0 to 1) and glyph (its index, or -1).
@group(1) @binding(5) var<storage, read> table: array<vec2f, 256>;

@vertex fn vsFull(@builtin(vertex_index) v: u32) -> @builtin(position) vec4f {
  let p = array<vec2f, 3>(vec2f(-1, -1), vec2f(3, -1), vec2f(-1, 3))[v];
  return vec4f(p, 0.0, 1.0);
}

fn over(dst: vec4f, rgb: vec3f, a: f32) -> vec4f {
  return vec4f(rgb * a + dst.rgb * (1.0 - a), a + dst.a * (1.0 - a));
}

// How much of the pixel at `p` (its corner) the rectangle lo..hi covers.
fn cover(p: vec2f, lo: vec2f, hi: vec2f) -> f32 {
  let d = clamp(min(p + 1.0, hi) - max(p, lo), vec2f(0.0), vec2f(1.0));
  return d.x * d.y;
}

fn mulberry(a: ptr<function, u32>) -> f32 {
  *a = *a + 0x6d2b79f5u;
  var t = *a;
  t = (t ^ (t >> 15u)) * (t | 1u);
  t = t ^ (t + (t ^ (t >> 7u)) * (t | 61u));
  return f32(t ^ (t >> 14u)) / 4294967296.0;
}

fn still(p: vec2f) -> vec4f {
  var c = vec4f(water.water.rgb, 1.0);
  let t = water.tile.x;
  let px = floor(p);
  if (water.tile.w > 0.5 && water.grid.a > 0.0) {
    // The faint grid: lines a pixel wide where index.ts strokes them, at round(c * tile) + 0.5.
    let near = round(px / t);
    let on = (px == round(near * t)) & (near >= vec2f(0.0)) & (near <= water.tile.yz);
    if (on.x || on.y) {
      c = over(c, water.grid.rgb, water.grid.a);
    }
    let n = textureLoad(dashes, vec2i(floor(px / t)), 0).r * 255.0;
    if (n > 0.5) {
      let o = floor(px / t) * t;
      let k = cover(px, o + vec2f(0.3, 0.45) * t, o + vec2f(0.7, 0.55) * t);
      c = over(c, water.dash.rgb, (1.0 - pow(1.0 - water.dash.a, n)) * k);
    }
  }
  if (water.view.w > 0.0) {
    // Specks fixed in the water, as index.ts scatters them: three to a cell, by a hash of the cell.
    let g = water.view.w;
    let s = water.view.z;
    let world = water.view.xy + px / s;
    let cell = floor(world / g);
    for (var dy = -1; dy <= 0; dy += 1) {
      for (var dx = -1; dx <= 0; dx += 1) {
        let gx = i32(cell.x) + dx;
        let gy = i32(cell.y) + dy;
        var seed = (bitcast<u32>(gx) * 73856093u) ^ (bitcast<u32>(gy) * 19349663u);
        for (var k = 0; k < 3; k += 1) {
          let x = ((f32(gx) + mulberry(&seed)) * g - water.view.x) * s;
          let y = ((f32(gy) + mulberry(&seed)) * g - water.view.y) * s;
          let a = cover(px, vec2f(x, y), vec2f(x, y) + water.extra.xy);
          if (a > 0.0) {
            c = over(c, water.speck.rgb, water.speck.a * a);
          }
        }
      }
    }
  }
  return c;
}

@fragment fn fsWater(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  return still(pos.xy);
}

@fragment fn fsMosaic(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  var c = still(pos.xy);
  let t = water.tile.x;
  let px = floor(pos.xy);
  let tile = floor((px + 0.5) / t);
  if (any(tile >= water.tile.yz)) {
    return c;
  }
  // The tile's colour: the four samples of the bodies under it, two by two.
  let q = vec2i(tile) * 2;
  let lit = (textureLoad(low, q, 0) + textureLoad(low, q + vec2i(1, 0), 0) + textureLoad(low, q + vec2i(0, 1), 0) + textureLoad(low, q + vec2i(1, 1), 0)) * 0.25;
  // How deep the bodies there are, and how much of the tile lights it (deepTex.g, below).
  let d0 = textureLoad(deepTex, q, 0).rg;
  let d1 = textureLoad(deepTex, q + vec2i(1, 0), 0).rg;
  let d2 = textureLoad(deepTex, q + vec2i(0, 1), 0).rg;
  let d3 = textureLoad(deepTex, q + vec2i(1, 1), 0).rg;
  let dg = (d0 + d1 + d2 + d3) * 0.25;
  if (lit.a <= 0.0 || lit.a < dg.y / lit.a) {
    return c;
  }
  let d = dg.x;
  let deep = clamp(d / lit.a, 0.0, 1.0);
  let rgb = lit.rgb / lit.a;
  let entry = table[(i32(tile.y) % 16) * 16 + i32(tile.x) % 16];
  let alpha = 1.0 - deep * 0.85;
  let o = tile * t;
  let inset = max(0.5, t * 0.06);
  let k = cover(px, o + inset, o + t - inset);
  c = over(c, rgb * entry.x, alpha * k);
  if (entry.y >= 0.0 && water.extra.z > 0.5 && k > 0.0) {
    // The glyph cut into the tile, from the atlas drawn four times as fine: the pixel's 4 by 4 samples there.
    let cell = water.extra.w;
    let at = (px - (o + vec2f(t * 0.5, t * 0.54))) * 4.0 + cell * 0.5;
    var g = 0.0;
    for (var y = 0; y < 4; y += 1) {
      for (var x = 0; x < 4; x += 1) {
        let s = at + vec2f(f32(x), f32(y));
        if (all(s >= vec2f(0.0)) && all(s < vec2f(cell))) {
          g += textureLoad(glyphs, vec2i(s + vec2f(entry.y * cell, 0.0)), 0).a;
        }
      }
    }
    g = g / 16.0;
    // ink.z: 0 inked (dark theme), 1 lifted (light), in between while a theme fades in.
    let ink = mix(rgb * water.ink.x, rgb + (1.0 - rgb) * water.ink.y, water.ink.z);
    c = over(c, ink, alpha * g);
  }
  return c;
}
