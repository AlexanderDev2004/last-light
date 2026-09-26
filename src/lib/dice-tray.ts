/**
 * Shard-style 2D dice tray: bone dice tumble in, click and bounce off the
 * walls and each other, then settle one by one. No dependencies, no assets —
 * faces are drawn, clicks are synthesized.
 *
 * Final values are decided by the caller; the tray only performs the landing.
 */

export type TrayScheme = 'light' | 'dark' | 'hope'

export interface TraySpec {
  scheme: TrayScheme
  /** Face shown once the die settles. */
  value: number
}

interface Die extends TraySpec {
  id: number
  x: number
  y: number
  vx: number
  vy: number
  angle: number
  va: number
  size: number
  face: number
  settled: boolean
  still: number
  frame: number
}

const SCHEMES: Record<TrayScheme, { body: string; pip: string; edge: string }> = {
  light: { body: '#ECE4D0', pip: '#241708', edge: '#8a744e' },
  dark: { body: '#3a342c', pip: '#ECE4D0', edge: '#141210' },
  hope: { body: '#E08A3C', pip: '#1A1008', edge: '#7c3f06' },
}

// Standard d6 pip layouts in a 3x3 grid (1 = filled).
const PIPS: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
}

class ClickSynth {
  private ctx: AudioContext | null = null
  enabled = true
  private last = 0

  private ensure(): AudioContext | null {
    if (this.ctx) return this.ctx
    try {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      this.ctx = new AC()
      return this.ctx
    } catch {
      return null
    }
  }

  /** Short wooden click; volume follows impact. Throttled. */
  click(strength: number) {
    if (!this.enabled) return
    const now = performance.now()
    if (now - this.last < 45) return
    this.last = now
    const ctx = this.ensure()
    if (!ctx || ctx.state === 'suspended') {
      void ctx?.resume().catch(() => {})
      if (!ctx || ctx.state === 'suspended') return
    }
    const dur = 0.045
    const buf = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * dur)), ctx.sampleRate)
    const data = buf.getChannelData(0)
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / data.length)
    }
    const src = ctx.createBufferSource()
    src.buffer = buf
    const filter = ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.value = 2200
    filter.Q.value = 1.1
    const gain = ctx.createGain()
    gain.gain.value = Math.min(0.5, 0.08 + strength * 0.06)
    src.connect(filter)
    filter.connect(gain)
    gain.connect(ctx.destination)
    src.start()
  }

  /** Soft knock when a die comes to rest. */
  knock() {
    if (!this.enabled) return
    const ctx = this.ensure()
    if (!ctx || ctx.state !== 'running') return
    const osc = ctx.createOscillator()
    osc.type = 'triangle'
    osc.frequency.value = 320
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.12, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.09)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 0.1)
  }
}

export class DiceTray {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private dice: Die[] = []
  private raf = 0
  private running = false
  private nextId = 1
  private settleWaiters: Array<() => void> = []
  private failsafe = 0
  readonly sound = new ClickSynth()
  private w = 300
  private h = 300

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('2d canvas unavailable')
    this.ctx = ctx
    this.resize()
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect()
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    this.w = Math.max(200, rect.width)
    this.h = Math.max(220, rect.height)
    this.canvas.width = Math.floor(this.w * dpr)
    this.canvas.height = Math.floor(this.h * dpr)
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    this.draw()
  }

  setSound(on: boolean) {
    this.sound.enabled = on
  }

  clear() {
    this.dice = []
    this.settleWaiters = []
    this.draw()
  }

  destroy() {
    this.running = false
    cancelAnimationFrame(this.raf)
    this.dice = []
    this.settleWaiters = []
  }

  /** Throw dice in with staggered drops. Resolves when every die rests. */
  roll(specs: TraySpec[]): Promise<void> {
    this.clear()
    const size = this.dieSize(specs.length)
    specs.forEach((spec, i) => {
      window.setTimeout(() => this.spawn(spec, size, i), i * 90)
    })
    this.start()
    return this.whenSettled(7000 + specs.length * 400)
  }

  /** Re-toss specific dice by id with new final faces. Resolves at rest. */
  retoss(ids: number[], values: number[]): Promise<void> {
    const targets = this.dice.filter((d) => ids.includes(d.id))
    targets.forEach((d, i) => {
      d.value = values[i] ?? d.value
      d.settled = false
      d.still = 0
      d.vx = (Math.random() * 2 - 1) * 5
      d.vy = -(3 + Math.random() * 4)
      d.va = (Math.random() * 2 - 1) * 0.35
      d.y = Math.min(d.y, this.h * 0.4)
    })
    if (targets.length === 0) return Promise.resolve()
    this.start()
    return this.whenSettled(6000)
  }

  idsOfSettled(scheme: TrayScheme, value: number): number[] {
    return this.dice.filter((d) => d.settled && d.scheme === scheme && d.value === value).map((d) => d.id)
  }

  private dieSize(count: number): number {
    const area = (this.w * this.h) / Math.max(1, count)
    return Math.max(34, Math.min(52, Math.sqrt(area) * 0.32))
  }

  private spawn(spec: TraySpec, size: number, i: number) {
    const r = size / 2
    this.dice.push({
      ...spec,
      id: this.nextId++,
      x: r + 10 + Math.random() * Math.max(10, this.w - size - 20),
      y: -size - i * 14,
      vx: (Math.random() * 2 - 1) * 3.2,
      vy: 1 + Math.random() * 2,
      angle: Math.random() * Math.PI * 2,
      va: (Math.random() * 2 - 1) * 0.3,
      size,
      face: 1 + Math.floor(Math.random() * 6),
      settled: false,
      still: 0,
      frame: 0,
    })
    this.start()
  }

  private whenSettled(timeoutMs: number): Promise<void> {
    if (this.dice.length === 0) return Promise.resolve()
    if (this.allSettled()) return Promise.resolve()
    return new Promise((resolve) => {
      this.settleWaiters.push(resolve)
      window.clearTimeout(this.failsafe)
      this.failsafe = window.setTimeout(() => {
        this.dice.forEach((d) => {
          d.settled = true
          d.face = d.value
        })
        this.flushSettled()
      }, timeoutMs)
    })
  }

  private allSettled(): boolean {
    return this.dice.length > 0 && this.dice.every((d) => d.settled)
  }

  private flushSettled() {
    const waiters = this.settleWaiters
    this.settleWaiters = []
    waiters.forEach((fn) => fn())
  }

  private start() {
    if (this.running) return
    this.running = true
    const step = () => {
      if (!this.running) return
      this.tick()
      this.draw()
      if (this.allSettled()) {
        this.running = false
        this.flushSettled()
        return
      }
      this.raf = requestAnimationFrame(step)
    }
    this.raf = requestAnimationFrame(step)
  }

  private tick() {
    const g = 0.55
    for (const d of this.dice) {
      if (d.settled) continue
      d.frame++
      d.vy += g
      d.x += d.vx
      d.y += d.vy
      d.angle += d.va
      const r = d.size / 2
      // walls
      if (d.x < r) {
        d.x = r
        if (Math.abs(d.vx) > 0.8) this.sound.click(Math.abs(d.vx))
        d.vx = Math.abs(d.vx) * 0.62
        d.va *= 0.8
      } else if (d.x > this.w - r) {
        d.x = this.w - r
        if (Math.abs(d.vx) > 0.8) this.sound.click(Math.abs(d.vx))
        d.vx = -Math.abs(d.vx) * 0.62
        d.va *= 0.8
      }
      if (d.y < r) {
        d.y = r
        d.vy = Math.abs(d.vy) * 0.5
      }
      // floor
      const floor = this.h - r - 4
      if (d.y >= floor) {
        d.y = floor
        if (Math.abs(d.vy) > 1.4) this.sound.click(Math.abs(d.vy))
        d.vy = -Math.abs(d.vy) * 0.52
        if (Math.abs(d.vy) < 1.1) d.vy = 0
        d.vx *= 0.965
        d.va *= 0.88
      } else {
        d.va *= 0.995
      }
      // tumble faces while moving
      if (d.frame % 5 === 0 && (Math.abs(d.vx) + Math.abs(d.vy) > 0.6)) {
        d.face = 1 + Math.floor(Math.random() * 6)
      }
      // rest detection
      if (d.vy === 0 && Math.abs(d.vx) < 0.35 && Math.abs(d.va) < 0.02) {
        d.still++
        if (d.still > 14) {
          d.settled = true
          d.face = d.value
          d.angle = Math.round(d.angle / (Math.PI / 2)) * (Math.PI / 2)
          this.sound.knock()
        }
      } else {
        d.still = 0
      }
    }
    // die-vs-die shoves
    const ds = this.dice
    for (let i = 0; i < ds.length; i++) {
      for (let j = i + 1; j < ds.length; j++) {
        const a = ds[i]
        const b = ds[j]
        if (a.settled && b.settled) continue
        const dx = b.x - a.x
        const dy = b.y - a.y
        const min = (a.size + b.size) / 2 - 2
        const dist = Math.hypot(dx, dy)
        if (dist > 0.01 && dist < min) {
          const nx = dx / dist
          const ny = dy / dist
          const overlap = (min - dist) / 2
          a.x -= nx * overlap
          a.y -= ny * overlap
          b.x += nx * overlap
          b.y += ny * overlap
          const impact = Math.abs(a.vx - b.vx) + Math.abs(a.vy - b.vy)
          const push = impact * 0.28
          a.vx -= nx * push
          a.vy -= ny * push
          b.vx += nx * push
          b.vy += ny * push
          if (impact > 2.4) this.sound.click(impact * 0.7)
          a.still = 0
          b.still = 0
        }
      }
    }
  }

  private draw() {
    const { ctx, w, h } = this
    ctx.clearRect(0, 0, w, h)
    for (const d of this.dice) {
      const scheme = SCHEMES[d.scheme]
      const r = d.size / 2
      // shadow grows as the die nears the floor
      const floor = h - 4
      const heightFrac = Math.min(1, Math.max(0, (floor - d.y) / h))
      ctx.save()
      ctx.globalAlpha = 0.35 * (1 - heightFrac * 0.7)
      ctx.fillStyle = '#000'
      ctx.beginPath()
      ctx.ellipse(d.x, floor + 6, r * (0.9 + heightFrac * 0.25), 5, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()

      ctx.save()
      ctx.translate(d.x, d.y)
      ctx.rotate(d.angle)
      const rad = 7
      const s = d.size
      ctx.fillStyle = scheme.body
      ctx.strokeStyle = scheme.edge
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.roundRect(-r, -r, s, s, rad)
      ctx.fill()
      ctx.stroke()
      // pips
      const cell = s / 3
      ctx.fillStyle = scheme.pip
      for (const p of PIPS[d.face] ?? PIPS[1]) {
        const cx = -r + cell * ((p % 3) + 0.5)
        const cy = -r + cell * (Math.floor(p / 3) + 0.5)
        ctx.beginPath()
        ctx.arc(cx, cy, Math.max(2.2, s * 0.055), 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.restore()
    }
  }
}
