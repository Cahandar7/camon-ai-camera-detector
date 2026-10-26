import { HELD_COLOR, PERSON_COLOR, categoryColor } from './constants'
import { clock } from './format'

const LERP_MS = 70 // how fast a box glides to its newest position
const FADE_MS = 220
const FONT = '600 12px Inter, system-ui, -apple-system, Segoe UI, sans-serif'

const rgbaCache = new Map()
function rgba(hex, a) {
  const key = hex + a
  let v = rgbaCache.get(key)
  if (!v) {
    const n = parseInt(hex.slice(1), 16)
    v = `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`
    rgbaCache.set(key, v)
  }
  return v
}

/**
 * Draws detections on a canvas laid over the <img> video.
 *
 * Detections arrive at the AI rate (10–20/s); the canvas repaints at the display
 * rate (60/s) and interpolates each tracked box toward its latest position, so
 * boxes glide smoothly instead of jumping.
 */
export class Overlay {
  constructor(canvas, img) {
    this.canvas = canvas
    this.img = img
    this.ctx = canvas.getContext('2d')
    this.tracks = new Map()
    this.opts = { people: true, litter: true, labels: true }
    this.labels = { category: (key) => key, carried: 'carried' }
    this.resolution = null
    this.last = performance.now()
    this.loop = this.loop.bind(this)
    this.raf = requestAnimationFrame(this.loop)
  }

  destroy() {
    cancelAnimationFrame(this.raf)
  }

  setOptions(opts) {
    Object.assign(this.opts, opts)
  }

  /** Box captions in the UI language: { category: key => name, carried: word } */
  setLabels(labels) {
    this.labels = labels
  }

  clear() {
    this.tracks.clear()
  }

  update(dets, resolution) {
    if (resolution) this.resolution = resolution
    const now = performance.now()
    const seen = new Set()
    dets.forEach((d, i) => {
      const key = d.id != null ? `t${d.id}` : `${d.c}:${i}`
      seen.add(key)
      const t = this.tracks.get(key)
      if (t) {
        t.target = d.b
        t.det = d
        t.dying = 0
      } else {
        this.tracks.set(key, { cur: [...d.b], target: d.b, det: d, born: now, dying: 0 })
      }
    })
    for (const [key, t] of this.tracks) {
      if (!seen.has(key) && !t.dying) t.dying = now
    }
  }

  loop(now) {
    this.raf = requestAnimationFrame(this.loop)
    const dt = Math.min(100, now - this.last)
    this.last = now

    const { canvas, ctx } = this
    const dpr = window.devicePixelRatio || 1
    const cw = canvas.clientWidth
    const ch = canvas.clientHeight
    const pw = Math.round(cw * dpr)
    const ph = Math.round(ch * dpr)
    if (canvas.width !== pw || canvas.height !== ph) {
      canvas.width = pw
      canvas.height = ph
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, cw, ch)
    if (!this.tracks.size) return

    // Where the video actually sits inside the element (object-fit: contain)
    const vw = this.img.naturalWidth || this.resolution?.[0] || 16
    const vh = this.img.naturalHeight || this.resolution?.[1] || 9
    const s = Math.min(cw / vw, ch / vh)
    const w = vw * s
    const h = vh * s
    const ox = (cw - w) / 2
    const oy = (ch - h) / 2
    const k = 1 - Math.exp(-dt / LERP_MS)

    ctx.font = FONT
    ctx.textBaseline = 'middle'
    for (const [key, t] of this.tracks) {
      for (let j = 0; j < 4; j++) t.cur[j] += (t.target[j] - t.cur[j]) * k
      let alpha = Math.min(1, (now - t.born) / FADE_MS)
      if (t.dying) {
        alpha *= 1 - (now - t.dying) / FADE_MS
        if (alpha <= 0) {
          this.tracks.delete(key)
          continue
        }
      }
      const d = t.det
      if (d.st === 'person' ? !this.opts.people : !this.opts.litter) continue
      const [x1, y1, x2, y2] = t.cur
      this.drawBox(ox + x1 * w, oy + y1 * h, (x2 - x1) * w, (y2 - y1) * h, d, alpha, now, cw)
    }
    ctx.globalAlpha = 1
  }

  drawBox(x, y, w, h, d, alpha, now, cw) {
    const { ctx } = this
    const isPerson = d.st === 'person'
    const tentative = d.st === 'pending' || d.st === 'held'
    const color = isPerson ? PERSON_COLOR : d.st === 'held' ? HELD_COLOR : categoryColor(d.c)
    ctx.globalAlpha = alpha

    // Confirmed litter breathes softly so it catches the eye
    if (d.st === 'litter') {
      const p = (Math.sin(now / 260) + 1) / 2
      ctx.beginPath()
      ctx.roundRect(x - 4, y - 4, w + 8, h + 8, 9)
      ctx.lineWidth = 2
      ctx.strokeStyle = rgba(color, 0.12 + 0.28 * p)
      ctx.stroke()
    }

    ctx.beginPath()
    ctx.roundRect(x, y, w, h, 6)
    ctx.fillStyle = rgba(color, isPerson ? 0.06 : tentative ? 0.05 : 0.14)
    ctx.fill()
    ctx.lineWidth = 1.25
    ctx.strokeStyle = rgba(color, tentative ? 0.9 : 0.5)
    ctx.setLineDash(tentative ? [5, 4] : [])
    ctx.stroke()
    ctx.setLineDash([])

    if (!tentative) {
      const c = Math.max(6, Math.min(18, w * 0.28, h * 0.28))
      ctx.beginPath()
      ctx.moveTo(x, y + c); ctx.lineTo(x, y); ctx.lineTo(x + c, y)
      ctx.moveTo(x + w - c, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + c)
      ctx.moveTo(x + w, y + h - c); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w - c, y + h)
      ctx.moveTo(x + c, y + h); ctx.lineTo(x, y + h); ctx.lineTo(x, y + h - c)
      ctx.lineWidth = isPerson ? 2.5 : 3
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.strokeStyle = color
      ctx.stroke()
    }

    if (!this.opts.labels) return
    const text = this.labelFor(d)
    const tw = ctx.measureText(text).width
    const lw = tw + 14
    const lh = 20
    let lx = Math.min(x, cw - lw - 2)
    let ly = y - lh - 5
    if (ly < 2) ly = y + 5
    ctx.beginPath()
    ctx.roundRect(lx, ly, lw, lh, 6)
    if (tentative) {
      ctx.fillStyle = 'rgba(8,11,16,0.82)'
      ctx.fill()
      ctx.fillStyle = color
    } else {
      ctx.fillStyle = color
      ctx.fill()
      ctx.fillStyle = '#081016'
    }
    ctx.fillText(text, lx + 7, ly + lh / 2 + 0.5)
  }

  labelFor(d) {
    const label = this.labels.category(d.c)
    const conf = `${Math.round(d.s * 100)}%`
    switch (d.st) {
      case 'person':
        return `${label} ${conf}`
      case 'held':
        return `${label} · ${this.labels.carried}`
      case 'pending':
        return `${label}? ${conf}`
      default:
        return d.age ? `${label} ${conf} · ${clock(d.age)}` : `${label} ${conf}`
    }
  }
}
