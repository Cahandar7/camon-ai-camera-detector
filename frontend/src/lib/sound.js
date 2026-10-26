// Bundled speech clips make critical alerts available in all supported languages,
// regardless of which voices happen to be installed in the user's browser.
const ALERT_AUDIO = {
  en: '/sounds/garbage-detected.mp3',
  az: '/sounds/garbage-detected-az.mp3',
  ru: '/sounds/garbage-detected-ru.mp3',
  tr: '/sounds/garbage-detected-tr.mp3',
}
const COOLDOWN = { critical: 15000, warning: 1500, info: 1500 }
const CLIP_REPEATS = 2 // each file holds the phrase once: "Litter detected. Litter detected."
const CLIP_GAP = 0.32 // seconds of silence between the repeats

let ctx = null
let master = null
const clips = {}
const clipLoading = {}
const lastPlayed = {}

function audio() {
  if (!ctx) {
    ctx = new AudioContext()
    master = ctx.createGain()
    master.gain.value = 0.78
    const limiter = ctx.createDynamicsCompressor()
    limiter.threshold.value = -10
    limiter.knee.value = 10
    limiter.ratio.value = 8
    master.connect(limiter).connect(ctx.destination)
  }
  return ctx
}

function loadClip(lang = 'en') {
  const code = ALERT_AUDIO[lang] ? lang : 'en'
  clipLoading[code] ??= fetch(ALERT_AUDIO[code])
    .then((res) => {
      if (!res.ok) throw new Error('Could not load alert audio')
      return res.arrayBuffer()
    })
    .then((buf) => audio().decodeAudioData(buf))
    .then((decoded) => (clips[code] = decoded))
    .catch(() => {
      clipLoading[code] = null
    })
  return clipLoading[code]
}

/** Browsers keep audio muted until the user interacts. */
export function unlockAudio() {
  try {
    audio().resume()
    Object.keys(ALERT_AUDIO).forEach(loadClip)
  } catch {
    /* no Web Audio */
  }
}

function tone({ freq, to = freq, start, dur, gain = 0.12, type = 'sine' }) {
  const osc = ctx.createOscillator()
  const env = ctx.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, start)
  if (to !== freq) osc.frequency.exponentialRampToValueAtTime(to, start + dur)
  env.gain.setValueAtTime(0.0001, start)
  env.gain.exponentialRampToValueAtTime(gain, start + 0.018)
  env.gain.exponentialRampToValueAtTime(0.0001, start + dur)
  osc.connect(env).connect(master)
  osc.start(start)
  osc.stop(start + dur + 0.04)
}

function playClip(lang) {
  const code = ALERT_AUDIO[lang] ? lang : 'en'
  const play = () => {
    if (ctx.state !== 'running') return
    const clip = clips[code]
    const start = ctx.currentTime + 0.025
    tone({ freq: 587, to: 659, start, dur: 0.1, gain: 0.07, type: 'triangle' })
    tone({ freq: 880, to: 988, start: start + 0.075, dur: 0.12, gain: 0.07, type: 'triangle' })
    tone({ freq: 1175, to: 1318, start: start + 0.16, dur: 0.15, gain: 0.08 })
    if (!clip) {
      return
    }
    for (let i = 0; i < CLIP_REPEATS; i++) {
      const source = ctx.createBufferSource()
      source.buffer = clip
      source.connect(master)
      source.start(start + 0.27 + i * (clip.duration + CLIP_GAP))
    }
  }
  if (clips[code]) play()
  else loadClip(code).then(play)
}

/** Sound for a new alert: a calm chime when resolved, a two-note warning,
 * or a short intro chime followed by a localized spoken callout. */
export function playAlert(severity = 'warning', { force = false, lang = 'en' } = {}) {
  try {
    audio()
  } catch {
    return
  }
  if (force) unlockAudio()
  else if (ctx.state !== 'running') return
  const wallNow = performance.now()
  if (!force && wallNow - (lastPlayed[severity] ?? -Infinity) < COOLDOWN[severity]) return
  lastPlayed[severity] = wallNow
  const now = ctx.currentTime + 0.025

  if (severity === 'critical') {
    playClip(lang)
  } else if (severity === 'warning') {
    tone({ freq: 784, start: now, dur: 0.16, gain: 0.14 })
    tone({ freq: 1047, start: now + 0.14, dur: 0.25, gain: 0.16 })
  } else {
    tone({ freq: 659, start: now, dur: 0.3, gain: 0.1 })
    tone({ freq: 784, start: now + 0.1, dur: 0.34, gain: 0.1 })
  }
}
