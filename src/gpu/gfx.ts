// The GPU side: the device, the targets, the pipelines, and the passes a frame is drawn in. What to draw comes as
// ops recorded by the pen (gpen.ts) for each pass; this uploads the frame's arrays and plays the ops back.
//
// PASSES. Mosaic: the bodies into a small target, two samples a tile each way and four per pixel (MSAA), with how
// deep each is beside it; then one triangle over the screen draws the water and the tiles from it. Smooth: animals
// deep enough to blur are drawn into an atlas, smaller the more they blur, and blurred there (two passes); then the
// sea in one MSAA pass: the water, each animal in order, deepest first, a blurred one laid from the atlas.
//
// Every descriptor and array a frame needs is made here once; a frame only fills them.

import { BEAST, COVER, GRAD, GpuPen, OP_CLIP, OP_COVER, OP_FILL, OP_QUAD, OP_RESET, OP_SCISSOR, OP_STROKE, Ops } from './gpen.ts'
import CODE from './sea.wgsl'

export const ATLAS_W = 2048
export const ATLAS_H = 1024
const SAMPLES = 4
// The usage flags as numbers (GPUBufferUsage, GPUTextureUsage, GPUShaderStage: the spec's values), shorter than the names.
/** Benchmarks keep this many frames' GPU times: two minutes at 60 a second, and some. */
export const TIMED = 8192

type Set5 = { fill: GPURenderPipeline; stroke: GPURenderPipeline; cover: GPURenderPipeline; clip: GPURenderPipeline; reset: GPURenderPipeline }

export class Gfx {
  readonly device: GPUDevice
  readonly context: GPUCanvasContext
  readonly format: GPUTextureFormat
  readonly pen = new GpuPen()
  /** The ops of each pass, filled by the caller every frame. */
  readonly lowOps = new Ops()
  readonly atlasOps = new Ops()
  readonly blurOps = new Ops()
  readonly blur2Ops = new Ops()
  readonly mainOps = new Ops()
  /** The water's settings for the full-screen shader (see `Water` in sea.wgsl). */
  readonly water = new Float32Array(32)
  /** Seconds of sea, for the caustics; and whether the surface light is on. */
  clock = 0
  surface = true
  /** GPU times: the start and end of each timed frame, in nanoseconds, read back by `times()`. */
  readonly timed: boolean
  frames = 0

  private vbuf: GPUBuffer
  private cbuf: GPUBuffer
  private gbuf: GPUBuffer
  private bbuf: GPUBuffer
  private ubuf: GPUBuffer
  private wbuf: GPUBuffer
  private tbuf: GPUBuffer
  private layout0: GPUBindGroupLayout
  private layout1: GPUBindGroupLayout
  private main!: Set5
  private atlas!: Set5
  private low!: Set5
  private lay!: GPURenderPipeline
  private waterPipe!: GPURenderPipeline
  private blur!: GPURenderPipeline
  private mosaic!: GPURenderPipeline
  private net: GPUTexture
  private linear: GPUSampler
  private nearest: GPUSampler
  // Targets, made by `resize`.
  private width = 0
  private height = 0
  private mainMS?: GPUTexture
  private mainStencil?: GPUTexture
  private lowMS?: GPUTexture
  private lowTex?: GPUTexture
  private deepMS?: GPUTexture
  private deepTex?: GPUTexture
  private lowStencil?: GPUTexture
  private atlasMS: GPUTexture
  private atlasA: GPUTexture
  private atlasB: GPUTexture
  private atlasStencil: GPUTexture
  private glyphTex?: GPUTexture
  private dashTex?: GPUTexture
  private bgMain!: GPUBindGroup
  private bgMainNearest!: GPUBindGroup
  private bgBlurH!: GPUBindGroup
  private bgBlurV!: GPUBindGroup
  private bgWater?: GPUBindGroup
  // Descriptors, made once and filled each frame.
  private lowPass?: GPURenderPassDescriptor
  private finalPass: GPURenderPassDescriptor
  private atlasPass: GPURenderPassDescriptor
  private blurHPass: GPURenderPassDescriptor
  private blurVPass: GPURenderPassDescriptor
  private mainPass?: GPURenderPassDescriptor
  private finalColour: GPURenderPassColorAttachment
  private mainColour?: GPURenderPassColorAttachment
  private cbs: GPUCommandBuffer[] = []
  private offsets = new Uint32Array(1)
  private passU = new Float32Array(64 * 3)
  private query?: GPUQuerySet
  private resolve?: GPUBuffer
  private stampFirst?: GPURenderPassTimestampWrites
  private stampLast?: GPURenderPassTimestampWrites
  private stampBoth?: GPURenderPassTimestampWrites

  constructor(device: GPUDevice, context: GPUCanvasContext, format: GPUTextureFormat, timed: boolean) {
    this.device = device
    this.context = context
    this.format = format
    this.timed = timed && device.features.has('timestamp-query')
    const d = device
    const S = 128 | 8
    this.vbuf = d.createBuffer({ size: this.pen.verts.byteLength, usage: 32 | 8 })
    this.cbuf = d.createBuffer({ size: this.pen.covers.byteLength, usage: S })
    this.gbuf = d.createBuffer({ size: this.pen.grads.byteLength, usage: S })
    this.bbuf = d.createBuffer({ size: this.pen.beasts.byteLength, usage: S })
    // Three passes' uniforms, 256 bytes apart: the screen, the atlas, the mosaic's small target.
    this.ubuf = d.createBuffer({ size: 768, usage: 64 | 8 })
    this.wbuf = d.createBuffer({ size: this.water.byteLength, usage: 64 | 8 })
    this.tbuf = d.createBuffer({ size: 256 * 8, usage: S })

    const F = 2
    const VF = 1 | F
    this.layout0 = d.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: VF, buffer: { type: 'uniform', hasDynamicOffset: true } },
        { binding: 1, visibility: VF, buffer: { type: 'read-only-storage' } },
        { binding: 2, visibility: F, buffer: { type: 'read-only-storage' } },
        { binding: 3, visibility: F, buffer: { type: 'read-only-storage' } },
        { binding: 4, visibility: F, texture: {} },
        { binding: 5, visibility: F, sampler: {} },
        { binding: 6, visibility: F, texture: {} },
        { binding: 7, visibility: F, sampler: {} },
      ],
    })
    this.layout1 = d.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: F, buffer: { type: 'uniform' } },
        { binding: 1, visibility: F, texture: {} },
        { binding: 2, visibility: F, texture: {} },
        { binding: 3, visibility: F, texture: {} },
        { binding: 4, visibility: F, texture: {} },
        { binding: 5, visibility: F, buffer: { type: 'read-only-storage' } },
      ],
    })
    this.linear = d.createSampler({ magFilter: 'linear', minFilter: 'linear', addressModeU: 'repeat', addressModeV: 'repeat' })
    this.nearest = d.createSampler({ magFilter: 'nearest', minFilter: 'nearest', addressModeU: 'repeat', addressModeV: 'repeat' })
    this.net = this.netTexture()
    const tex = (w: number, h: number, format: GPUTextureFormat, ms: boolean, bind = true): GPUTexture =>
      d.createTexture({ size: [w, h], format, sampleCount: ms ? SAMPLES : 1, usage: 16 | (bind ? 4 : 0) })
    this.atlasMS = tex(ATLAS_W, ATLAS_H, 'rgba8unorm', true, false)
    this.atlasA = tex(ATLAS_W, ATLAS_H, 'rgba8unorm', false)
    this.atlasB = tex(ATLAS_W, ATLAS_H, 'rgba8unorm', false)
    this.atlasStencil = tex(ATLAS_W, ATLAS_H, 'stencil8', true, false)
    this.pipelines()

    const stencil = (view: GPUTextureView): GPURenderPassDepthStencilAttachment => ({ view, stencilLoadOp: 'clear', stencilStoreOp: 'discard', stencilClearValue: 0x80 })
    const clear = { r: 0, g: 0, b: 0, a: 0 }
    this.atlasPass = { colorAttachments: [{ view: this.atlasMS.createView(), resolveTarget: this.atlasA.createView(), loadOp: 'clear', storeOp: 'discard', clearValue: clear }], depthStencilAttachment: stencil(this.atlasStencil.createView()) }
    this.blurHPass = { colorAttachments: [{ view: this.atlasB.createView(), loadOp: 'clear', storeOp: 'store', clearValue: clear }] }
    this.blurVPass = { colorAttachments: [{ view: this.atlasA.createView(), loadOp: 'load', storeOp: 'store' }] }
    this.finalColour = { view: undefined as unknown as GPUTextureView, loadOp: 'clear', storeOp: 'store', clearValue: clear }
    this.finalPass = { colorAttachments: [this.finalColour] }

    if (this.timed) {
      this.query = d.createQuerySet({ type: 'timestamp', count: 2 })
      this.resolve = d.createBuffer({ size: TIMED * 256, usage: 512 | 4 })
      this.stampFirst = { querySet: this.query, beginningOfPassWriteIndex: 0 }
      this.stampLast = { querySet: this.query, endOfPassWriteIndex: 1 }
      this.stampBoth = { querySet: this.query, beginningOfPassWriteIndex: 0, endOfPassWriteIndex: 1 }
    }
  }

  /** index.ts's caustic net: bright where two cells meet, wavering, tiling; 128 pixels a side, one a sea unit. */
  private netTexture(): GPUTexture {
    const n = 128
    let a = 5
    // mosaic.ts's rng(5), inline.
    const rand = (): number => {
      a = (a + 0x6d2b79f5) >>> 0
      let t = a
      t = Math.imul(t ^ (t >>> 15), t | 1)
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
    const seeds: number[] = []
    for (let i = 0; i < 10; i += 1) seeds.push(rand() * n, rand() * n)
    const data = new Uint8Array(n * n)
    for (let y = 0; y < n; y += 1) {
      for (let x = 0; x < n; x += 1) {
        const wx = x + 5 * Math.sin((4 * Math.PI * y) / n) + 3 * Math.sin((6 * Math.PI * (x + y)) / n)
        const wy = y + 5 * Math.sin((4 * Math.PI * x) / n) + 3 * Math.sin((6 * Math.PI * (x - y)) / n)
        let d1 = Infinity
        let d2 = Infinity
        for (let s = 0; s < 10; s += 1) {
          for (let ox = -n; ox <= n; ox += n) {
            for (let oy = -n; oy <= n; oy += n) {
              const d = Math.hypot(wx - seeds[s * 2]! - ox, wy - seeds[s * 2 + 1]! - oy)
              if (d < d1) [d1, d2] = [d, d1]
              else if (d < d2) d2 = d
            }
          }
        }
        data[y * n + x] = Math.round(Math.max(0, 1 - (d2 - d1) / 10) ** 3 * 255)
      }
    }
    const t = this.device.createTexture({ size: [n, n], format: 'r8unorm', usage: 4 | 2 })
    this.device.queue.writeTexture({ texture: t }, data, { bytesPerRow: n }, [n, n])
    return t
  }

  private pipelines(): void {
    const d = this.device
    const module = d.createShaderModule({ code: CODE })
    const l0 = d.createPipelineLayout({ bindGroupLayouts: [this.layout0] })
    const l1 = d.createPipelineLayout({ bindGroupLayouts: [this.layout0, this.layout1] })
    const blend: GPUBlendState = { color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' }, alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' } }
    const keep: GPUStencilFaceState = { compare: 'always', passOp: 'keep' }
    type St = { front: GPUStencilFaceState; back: GPUStencilFaceState; write: number }
    const ST: Record<string, St> = {
      fill: { front: { compare: 'always', passOp: 'increment-wrap' }, back: { compare: 'always', passOp: 'decrement-wrap' }, write: 0x7f },
      stroke: { front: { compare: 'always', passOp: 'increment-wrap' }, back: { compare: 'always', passOp: 'increment-wrap' }, write: 0x7f },
      // Inside the clip (top bit) and counted in (lower bits): stencil above 0x80. Either way the count is cleared.
      cover: { front: { compare: 'less', passOp: 'zero', failOp: 'zero' }, back: { compare: 'less', passOp: 'zero', failOp: 'zero' }, write: 0x7f },
      clip: { front: { compare: 'less', passOp: 'replace', failOp: 'zero' }, back: { compare: 'less', passOp: 'replace', failOp: 'zero' }, write: 0xff },
      reset: { front: { compare: 'always', passOp: 'replace' }, back: { compare: 'always', passOp: 'replace' }, write: 0xff },
      none: { front: keep, back: keep, write: 0 },
    }
    const make = (formats: GPUTextureFormat[], ms: boolean, vs: string, fs: string, st: string | null, colour: boolean, fan: boolean, layout = l0): GPURenderPipeline => {
      const s = st === null ? undefined : ST[st]!
      return d.createRenderPipeline({
        layout,
        vertex: { module, entryPoint: vs, buffers: fan ? [{ arrayStride: 8, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x2' }] }] : [] },
        fragment: { module, entryPoint: fs, targets: formats.map((format, i) => ({ format, blend: colour && i === 0 ? blend : undefined, writeMask: colour ? 15 : 0 })) },
        primitive: { topology: 'triangle-list', cullMode: 'none' },
        depthStencil: s === undefined ? undefined : { format: 'stencil8', depthWriteEnabled: false, depthCompare: 'always', stencilFront: s.front, stencilBack: s.back, stencilReadMask: 0xff, stencilWriteMask: s.write },
        multisample: { count: ms ? SAMPLES : 1 },
      })
    }
    const set = (formats: GPUTextureFormat[], cover: string, none: string): Set5 => ({
      fill: make(formats, true, 'vsFan', none, 'fill', false, true),
      stroke: make(formats, true, 'vsFan', none, 'stroke', false, true),
      cover: make(formats, true, 'vsCover', cover, 'cover', true, false),
      clip: make(formats, true, 'vsCover', none, 'clip', false, false),
      reset: make(formats, true, 'vsCover', none, 'reset', false, false),
    })
    this.main = set([this.format], 'fsCover', 'fsNone')
    this.atlas = set(['rgba8unorm'], 'fsCover', 'fsNone')
    this.low = set(['rgba8unorm', 'rg8unorm'], 'fsCover2', 'fsNone2')
    this.lay = make([this.format], true, 'vsCover', 'fsLay', 'none', true, false)
    this.waterPipe = make([this.format], true, 'vsFull', 'fsWater', 'none', true, false, l1)
    this.blur = make(['rgba8unorm'], false, 'vsCover', 'fsBlur', null, true, false)
    this.mosaic = make([this.format], false, 'vsFull', 'fsMosaic', null, true, false, l1)
  }

  private group(src: GPUTexture, netSampler: GPUSampler): GPUBindGroup {
    return this.device.createBindGroup({
      layout: this.layout0,
      entries: [
        { binding: 0, resource: { buffer: this.ubuf, size: 16 } },
        { binding: 1, resource: { buffer: this.cbuf } },
        { binding: 2, resource: { buffer: this.gbuf } },
        { binding: 3, resource: { buffer: this.bbuf } },
        { binding: 4, resource: this.net.createView() },
        { binding: 5, resource: netSampler },
        { binding: 6, resource: src.createView() },
        { binding: 7, resource: this.linear },
      ],
    })
  }

  /**
   * New targets for a screen `width` by `height` and a mosaic of `cols` by `rows` tiles (`mosaic` false: smooth),
   * and the mosaic's glyphs and dashes. Only on a change of size or of settings, never in a frame.
   */
  resize(width: number, height: number, mosaic: boolean, cols: number, rows: number, glyphs: OffscreenCanvas | HTMLCanvasElement, dashes: Uint8Array, table: Float32Array): void {
    const d = this.device
    for (const t of [this.mainMS, this.mainStencil, this.lowMS, this.lowTex, this.deepMS, this.deepTex, this.lowStencil, this.glyphTex, this.dashTex]) t?.destroy()
    this.mainMS = this.mainStencil = this.lowMS = this.lowTex = this.deepMS = this.deepTex = this.lowStencil = undefined
    this.width = width
    this.height = height
    const usage = 16
    const stencil = (view: GPUTextureView): GPURenderPassDepthStencilAttachment => ({ view, stencilLoadOp: 'clear', stencilStoreOp: 'discard', stencilClearValue: 0x80 })
    if (mosaic) {
      const [w, h] = [Math.max(1, cols * 2), Math.max(1, rows * 2)]
      this.lowMS = d.createTexture({ size: [w, h], format: 'rgba8unorm', sampleCount: SAMPLES, usage })
      this.deepMS = d.createTexture({ size: [w, h], format: 'rg8unorm', sampleCount: SAMPLES, usage })
      this.lowStencil = d.createTexture({ size: [w, h], format: 'stencil8', sampleCount: SAMPLES, usage })
      this.lowTex = d.createTexture({ size: [w, h], format: 'rgba8unorm', usage: usage | 4 })
      this.deepTex = d.createTexture({ size: [w, h], format: 'rg8unorm', usage: usage | 4 })
      const clear = { r: 0, g: 0, b: 0, a: 0 }
      this.lowPass = {
        colorAttachments: [
          { view: this.lowMS.createView(), resolveTarget: this.lowTex.createView(), loadOp: 'clear', storeOp: 'discard', clearValue: clear },
          { view: this.deepMS.createView(), resolveTarget: this.deepTex.createView(), loadOp: 'clear', storeOp: 'discard', clearValue: clear },
        ],
        depthStencilAttachment: stencil(this.lowStencil.createView()),
      }
      this.setPass(2, w, h)
    } else {
      this.mainMS = d.createTexture({ size: [width, height], format: this.format, sampleCount: SAMPLES, usage })
      this.mainStencil = d.createTexture({ size: [width, height], format: 'stencil8', sampleCount: SAMPLES, usage })
      this.mainColour = { view: this.mainMS.createView(), resolveTarget: undefined, loadOp: 'clear', storeOp: 'discard', clearValue: { r: 0, g: 0, b: 0, a: 1 } }
      this.mainPass = { colorAttachments: [this.mainColour], depthStencilAttachment: stencil(this.mainStencil.createView()) }
    }
    this.setPass(0, width, height)
    this.setPass(1, ATLAS_W, ATLAS_H)
    // The glyphs, four times as fine as drawn (a box of 4 by 4 samples a pixel); the dashes, a count a tile.
    this.glyphTex = d.createTexture({ size: [glyphs.width, glyphs.height], format: 'rgba8unorm', usage: 4 | 2 | 16 })
    d.queue.copyExternalImageToTexture({ source: glyphs }, { texture: this.glyphTex }, [glyphs.width, glyphs.height])
    const [dw, dh] = [Math.max(1, cols), Math.max(1, rows)]
    this.dashTex = d.createTexture({ size: [dw, dh], format: 'r8unorm', usage: 4 | 2 })
    d.queue.writeTexture({ texture: this.dashTex }, dashes, { bytesPerRow: dw }, [dw, dh])
    d.queue.writeBuffer(this.tbuf, 0, table)
    this.bgMain = this.group(this.atlasA, this.linear)
    this.bgMainNearest = this.group(this.atlasA, this.nearest)
    this.bgBlurH = this.group(this.atlasA, this.linear)
    this.bgBlurV = this.group(this.atlasB, this.linear)
    this.bgWater = d.createBindGroup({
      layout: this.layout1,
      entries: [
        { binding: 0, resource: { buffer: this.wbuf } },
        { binding: 1, resource: (this.lowTex ?? this.atlasA).createView() },
        { binding: 2, resource: (this.deepTex ?? this.atlasA).createView() },
        { binding: 3, resource: this.glyphTex.createView() },
        { binding: 4, resource: this.dashTex.createView() },
        { binding: 5, resource: { buffer: this.tbuf } },
      ],
    })
  }

  private setPass(i: number, w: number, h: number): void {
    this.passU[i * 64] = w
    this.passU[i * 64 + 1] = h
  }

  /** Uploads the frame and draws it: the mosaic's passes, or the smooth one's. */
  draw(mosaic: boolean, watching: boolean, water: [number, number, number]): void {
    const d = this.device
    const pen = this.pen
    if (pen.nv > 0) d.queue.writeBuffer(this.vbuf, 0, pen.verts, 0, pen.nv * 2)
    if (pen.nc > 0) d.queue.writeBuffer(this.cbuf, 0, pen.covers, 0, pen.nc * COVER)
    if (pen.ng > 0) d.queue.writeBuffer(this.gbuf, 0, pen.grads, 0, pen.ng * GRAD)
    if (pen.nb > 0) d.queue.writeBuffer(this.bbuf, 0, pen.beasts, 0, pen.nb * BEAST)
    for (let i = 0; i < 3; i += 1) {
      this.passU[i * 64 + 2] = this.clock
      this.passU[i * 64 + 3] = this.surface ? 1 : 0
    }
    d.queue.writeBuffer(this.ubuf, 0, this.passU)
    d.queue.writeBuffer(this.wbuf, 0, this.water)

    const view = this.context.getCurrentTexture().createView()
    const enc = d.createCommandEncoder()
    this.first = true
    if (mosaic && this.lowPass !== undefined) {
      const p = enc.beginRenderPass(this.stamp(this.lowPass, false))
      this.play(p, this.lowOps, this.low, 2, this.bgMainNearest)
      p.end()
      this.finalColour.view = view
      const q = enc.beginRenderPass(this.stamp(this.finalPass, true))
      q.setPipeline(this.mosaic)
      this.offsets[0] = 0
      q.setBindGroup(0, this.bgMain, this.offsets, 0, 1)
      q.setBindGroup(1, this.bgWater!)
      q.draw(3)
      q.end()
    } else if (this.mainPass !== undefined && this.mainColour !== undefined) {
      if (this.atlasOps.n > 0) {
        const p = enc.beginRenderPass(this.stamp(this.atlasPass, false))
        // Bound with the other half of the atlas as its source: the half it draws into cannot be read in the same pass.
        this.play(p, this.atlasOps, this.atlas, 1, this.bgBlurV)
        p.end()
        const h = enc.beginRenderPass(this.stamp(this.blurHPass, false))
        this.play(h, this.blurOps, this.atlas, 1, this.bgBlurH)
        h.end()
        const v = enc.beginRenderPass(this.stamp(this.blurVPass, false))
        this.play(v, this.blur2Ops, this.atlas, 1, this.bgBlurV)
        v.end()
      }
      this.mainColour.resolveTarget = view
      this.mainColour.clearValue = this.clearColour
      this.clearColour.r = water[0]
      this.clearColour.g = water[1]
      this.clearColour.b = water[2]
      const p = enc.beginRenderPass(this.stamp(this.mainPass, true))
      if (watching) {
        p.setPipeline(this.waterPipe)
        this.offsets[0] = 0
        p.setBindGroup(0, this.bgMain, this.offsets, 0, 1)
        p.setBindGroup(1, this.bgWater!)
        p.draw(3)
      }
      this.play(p, this.mainOps, this.main, 0, this.bgMain)
      p.end()
    }
    if (this.timed && this.frames < TIMED) {
      enc.resolveQuerySet(this.query!, 0, 2, this.resolve!, this.frames * 256)
      this.frames += 1
    }
    this.cbs[0] = enc.finish()
    d.queue.submit(this.cbs)
  }
  private clearColour = { r: 0, g: 0, b: 0, a: 1 }
  private first = true
  private current: GPURenderPipeline | undefined

  /** Which pass gets the timestamps: the first its start, the last its end. A method, not a closure: none is made. */
  private stamp(desc: GPURenderPassDescriptor, last: boolean): GPURenderPassDescriptor {
    if (this.timed) desc.timestampWrites = this.first && last ? this.stampBoth : this.first ? this.stampFirst : last ? this.stampLast : undefined
    this.first = false
    return desc
  }
  private use(p: GPURenderPassEncoder, pipe: GPURenderPipeline): void {
    if (pipe === this.current) return
    p.setPipeline(pipe)
    this.current = pipe
  }

  /** Plays `ops` into pass `p`: its uniforms are slot `slot`. */
  private play(p: GPURenderPassEncoder, ops: Ops, set: Set5, slot: number, group: GPUBindGroup): void {
    this.offsets[0] = slot * 256
    p.setBindGroup(0, group, this.offsets, 0, 1)
    p.setVertexBuffer(0, this.vbuf)
    p.setStencilReference(0x80)
    this.current = undefined
    const a = ops.a
    const tw = slot === 0 ? this.width : slot === 1 ? ATLAS_W : (this.lowTex?.width ?? 1)
    const th = slot === 0 ? this.height : slot === 1 ? ATLAS_H : (this.lowTex?.height ?? 1)
    for (let i = 0; i < ops.n; i += 1) {
      const o = i * 5
      const op = a[o]!
      if (op === OP_SCISSOR) {
        const x = Math.max(0, Math.min(tw, a[o + 1]!))
        const y = Math.max(0, Math.min(th, a[o + 2]!))
        const w = Math.max(0, Math.min(tw - x, a[o + 3]! - (x - a[o + 1]!)))
        const h = Math.max(0, Math.min(th - y, a[o + 4]! - (y - a[o + 2]!)))
        p.setScissorRect(x, y, w, h)
      } else if (op === OP_FILL) {
        this.use(p, set.fill)
        p.draw(a[o + 2]!, 1, a[o + 1]!, 0)
      } else if (op === OP_STROKE) {
        this.use(p, set.stroke)
        p.draw(a[o + 2]!, 1, a[o + 1]!, 0)
      } else if (op === OP_COVER) {
        this.use(p, set.cover)
        p.draw(6, a[o + 2]!, 0, a[o + 1]!)
      } else if (op === OP_CLIP) {
        this.use(p, set.fill)
        p.draw(a[o + 2]!, 1, a[o + 1]!, 0)
        this.use(p, set.clip)
        p.draw(6, 1, 0, a[o + 3]!)
      } else if (op === OP_RESET) {
        this.use(p, set.reset)
        p.draw(6, 1, 0, a[o + 1]!)
      } else if (op === OP_QUAD) {
        // The atlas laid on the sea, or a blur's box.
        this.use(p, slot === 0 ? this.lay : this.blur)
        p.draw(6, 1, 0, a[o + 1]!)
      }
    }
  }

  /** After a benchmark: the GPU time of each timed frame, in milliseconds. */
  async times(): Promise<Float64Array> {
    const out = new Float64Array(this.frames)
    if (!this.timed || this.frames === 0) return out
    const read = this.device.createBuffer({ size: this.frames * 256, usage: 8 | 1 })
    const enc = this.device.createCommandEncoder()
    enc.copyBufferToBuffer(this.resolve!, 0, read, 0, this.frames * 256)
    this.device.queue.submit([enc.finish()])
    await read.mapAsync(1)
    const v = new BigUint64Array(read.getMappedRange())
    for (let i = 0; i < this.frames; i += 1) out[i] = Number(v[i * 32 + 1]! - v[i * 32]!) / 1e6
    read.unmap()
    return out
  }
}
