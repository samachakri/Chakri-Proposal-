'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import emailjs from '@emailjs/browser'
import { Heart, Send, Mail, Sparkles } from 'lucide-react'

// ============== GLOBAL HELPERS ==============
const lerp = (a, b, t) => a + (b - a) * t
const clamp = (v, min, max) => Math.max(min, Math.min(max, v))
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3)
const easeInOut = (t) => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2

// Draw a small filled heart at (x,y) with given size and color
function drawHeart(ctx, x, y, size, color, alpha = 1) {
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(size / 30, size / 30)
  ctx.globalAlpha = alpha
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(0, 6)
  ctx.bezierCurveTo(-14, -8, -22, 8, 0, 22)
  ctx.bezierCurveTo(22, 8, 14, -8, 0, 6)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

// Sample image into target positions { x, y, r, g, b } - background-aware
async function sampleImagePositions(src, targetW, targetH, stride = 4) {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const c = document.createElement('canvas')
      c.width = targetW
      c.height = targetH
      const cx = c.getContext('2d')
      cx.drawImage(img, 0, 0, targetW, targetH)
      const data = cx.getImageData(0, 0, targetW, targetH).data
      // --- Detect background color from corner samples ---
      const cornerPx = []
      const sampleCorners = [
        [2, 2], [targetW - 3, 2], [2, targetH - 3], [targetW - 3, targetH - 3],
        [Math.floor(targetW / 2), 2], [2, Math.floor(targetH / 2)],
        [targetW - 3, Math.floor(targetH / 2)],
      ]
      for (const [x, y] of sampleCorners) {
        const i = (y * targetW + x) * 4
        cornerPx.push([data[i], data[i + 1], data[i + 2]])
      }
      // average corner color = background
      let bgR = 0, bgG = 0, bgB = 0
      cornerPx.forEach(p => { bgR += p[0]; bgG += p[1]; bgB += p[2] })
      bgR /= cornerPx.length; bgG /= cornerPx.length; bgB /= cornerPx.length
      const colorDist = (r, g, b) => Math.sqrt((r - bgR) ** 2 + (g - bgG) ** 2 + (b - bgB) ** 2)
      const bgIsBright = (bgR + bgG + bgB) / 3 > 180

      const pts = []
      for (let y = 0; y < targetH; y += stride) {
        for (let x = 0; x < targetW; x += stride) {
          const i = (y * targetW + x) * 4
          const a = data[i + 3]
          if (a < 60) continue
          const r = data[i], g = data[i + 1], b = data[i + 2]
          const bright = (r + g + b) / 3
          const maxC = Math.max(r, g, b), minC = Math.min(r, g, b)
          const sat = maxC === 0 ? 0 : (maxC - minC) / maxC

          // Always KEEP very dark pixels (hair, eyes, dark clothing) — they're part of the subject
          if (bright < 55) { pts.push({ x, y, r, g, b }); continue }
          // ALWAYS DROP extremely bright pixels (any near-white background)
          if (bright > 220 && sat < 0.22) continue
          // Background-similarity check (only for non-dark pixels)
          const dist = colorDist(r, g, b)
          if (dist < 55) continue
          // For very bright backgrounds, be stricter about bright pixels
          if (bgIsBright && bright > 200) continue
          pts.push({ x, y, r, g, b })
        }
      }
      resolve(pts)
    }
    img.onerror = () => resolve([])
    img.src = src
  })
}

// ============== SECTION 1 — HERO (heart-particle reconstruction) ==============
function Section1Hero({ scrollProgress, onBegin }) {
  const canvasRef = useRef(null)
  const particlesRef = useRef([])
  const targetsRef = useRef({ uma: [], chakri: [], heart: [] })
  const animRef = useRef()
  const [ready, setReady] = useState(false)

  // Build particles — particles orbit/halo around the portrait positions
  useEffect(() => {
    let mounted = true
    function build() {
      const w = typeof window !== 'undefined' ? window.innerWidth : 1280
      const h = typeof window !== 'undefined' ? window.innerHeight : 720
      // Portrait centers
      const cy = h * 0.5
      const lx = w * 0.27
      const rx = w * 0.73
      const portraitR = Math.min(w * 0.13, h * 0.32)

      // Two clusters of particles forming oval frames around each portrait + filling space
      const PER_PORTRAIT = 900
      const targets = []
      for (let p = 0; p < 2; p++) {
        const cx = p === 0 ? lx : rx
        const tint = p === 0 ? 'chakri' : 'uma'
        for (let i = 0; i < PER_PORTRAIT; i++) {
          // distribute around the portrait: r ranges from 0.7R to 1.6R
          const angle = Math.random() * Math.PI * 2
          const dist = portraitR * (0.78 + Math.random() * 0.95)
          // squash vertically slightly to feel like an aura
          const tx = cx + Math.cos(angle) * dist * (1 + (Math.random() - 0.5) * 0.1)
          const ty = cy + Math.sin(angle) * dist * (1.05 + (Math.random() - 0.5) * 0.1)
          targets.push({ x: tx, y: ty, tint })
        }
      }

      // Heart final shape (merge)
      const heartTargets = []
      const heartScale = Math.min(w, h) * 0.36
      for (let i = 0; i < targets.length; i++) {
        const t = Math.random() * Math.PI * 2
        const rr = Math.sqrt(Math.random())
        const hx = 16 * Math.pow(Math.sin(t), 3)
        const hy = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t))
        const sc = heartScale / 32 * (0.78 + rr * 0.32)
        heartTargets.push({ x: w / 2 + hx * sc, y: h / 2 + hy * sc - h * 0.02 })
      }

      const ps = new Array(targets.length)
      for (let i = 0; i < targets.length; i++) {
        const t = targets[i]
        // soft palette per cluster
        const hue = t.tint === 'chakri'
          ? 335 + Math.random() * 25     // rose/pink
          : 305 + Math.random() * 35     // pink/magenta
        const light = 65 + Math.random() * 15
        ps[i] = {
          ix: Math.random() * w,
          iy: Math.random() * h,
          tx: t.x, ty: t.y,
          hx: heartTargets[i].x,
          hy: heartTargets[i].y,
          size: 2.6 + Math.random() * 2.8,
          phase: Math.random() * Math.PI * 2,
          orbit: 8 + Math.random() * 18,
          orbitSpeed: 0.0006 + Math.random() * 0.0008,
          color: `hsl(${hue}, 95%, ${light}%)`,
          mergeHue: 320 + Math.random() * 40,
        }
      }
      particlesRef.current = ps
      targetsRef.current = { heart: heartTargets }
      if (mounted) setReady(true)
    }
    build()
    const onResize = () => build()
    window.addEventListener('resize', onResize)
    return () => { mounted = false; window.removeEventListener('resize', onResize) }
  }, [])

  // Draw loop
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = window.innerWidth * dpr
      canvas.height = window.innerHeight * dpr
      canvas.style.width = window.innerWidth + 'px'
      canvas.style.height = window.innerHeight + 'px'
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    window.addEventListener('resize', resize)

    let lastT = performance.now()
    function draw(now) {
      const dt = (now - lastT) / 1000
      lastT = now
      const w = window.innerWidth, h = window.innerHeight
      ctx.clearRect(0, 0, w, h)

      // bg stars / nebula
      const grad = ctx.createRadialGradient(w * 0.3, h * 0.3, 0, w * 0.5, h * 0.5, Math.max(w, h))
      grad.addColorStop(0, 'rgba(70,30,120,0.4)')
      grad.addColorStop(0.4, 'rgba(40,10,80,0.25)')
      grad.addColorStop(1, 'rgba(2,1,8,1)')
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, w, h)

      // stars
      ctx.fillStyle = 'rgba(255,255,255,0.7)'
      for (let i = 0; i < 80; i++) {
        const sx = (i * 97 + (now * 0.01)) % w
        const sy = (i * 53.3) % h
        const s = (i % 3) * 0.6 + 0.4
        ctx.globalAlpha = 0.3 + (Math.sin(now * 0.001 + i) + 1) * 0.25
        ctx.fillRect(sx, sy, s, s)
      }
      ctx.globalAlpha = 1

      // Progress for hero — clamp 0..1 of the 300vh section
      const p = clamp(scrollProgress.current ?? 0, 0, 1)
      // 0..0.35 = assemble (particles converge into auras + photos fade in)
      // 0.35..0.78 = hold (photos visible, particles orbit around)
      // 0.78..1.0 = merge (photos fade out, particles fly into giant heart)
      let phaseT, mode
      if (p < 0.35) { phaseT = easeOutCubic(p / 0.35); mode = 'assemble' }
      else if (p < 0.78) { phaseT = 1; mode = 'hold' }
      else { phaseT = easeInOut((p - 0.78) / 0.22); mode = 'merge' }

      const cy = h * 0.5
      const lx = w * 0.27
      const rx = w * 0.73
      const portraitR = Math.min(w * 0.13, h * 0.32)

      // Background halos behind portraits
      if (mode === 'hold' || mode === 'assemble') {
        const haloAlpha = mode === 'assemble' ? phaseT * 0.5 : 0.55
        const haloR = portraitR * 2.2
        const drawHalo = (hx, hy, tint) => {
          const grd = ctx.createRadialGradient(hx, hy, portraitR * 0.3, hx, hy, haloR)
          grd.addColorStop(0, `rgba(${tint},${haloAlpha})`)
          grd.addColorStop(0.5, `rgba(${tint},${haloAlpha * 0.4})`)
          grd.addColorStop(1, 'rgba(0,0,0,0)')
          ctx.fillStyle = grd
          ctx.fillRect(hx - haloR, hy - haloR, haloR * 2, haloR * 2)
        }
        drawHalo(lx, cy, '255,120,180')
        drawHalo(rx, cy, '255,180,210')
      } else if (mode === 'merge') {
        // big heart glow
        const fade = 1 - phaseT * 0.3
        const grd = ctx.createRadialGradient(w / 2, h / 2 - h * 0.02, 0, w / 2, h / 2 - h * 0.02, Math.min(w, h) * 0.4)
        grd.addColorStop(0, `rgba(255,120,180,${0.4 * fade})`)
        grd.addColorStop(1, 'rgba(0,0,0,0)')
        ctx.fillStyle = grd
        ctx.fillRect(0, 0, w, h)
      }

      const ps = particlesRef.current
      for (let i = 0; i < ps.length; i++) {
        const part = ps[i]
        let tx, ty
        if (mode === 'merge') {
          tx = lerp(part.tx, part.hx, phaseT)
          ty = lerp(part.ty, part.hy, phaseT)
        } else {
          // orbital wobble around the aura target
          const orb = mode === 'hold' ? 1 : phaseT
          tx = part.tx + Math.cos(now * part.orbitSpeed + part.phase) * part.orbit * orb
          ty = part.ty + Math.sin(now * part.orbitSpeed + part.phase) * part.orbit * 0.7 * orb
        }
        const px = lerp(part.ix, tx, mode === 'assemble' ? phaseT : 1)
        const py = lerp(part.iy, ty, mode === 'assemble' ? phaseT : 1)

        let color = part.color
        let size = part.size
        if (mode === 'merge') {
          color = `hsl(${part.mergeHue}, 95%, 70%)`
          size = part.size + 1.6
        }
        const alpha = mode === 'assemble' ? 0.4 + phaseT * 0.55 : 0.92
        drawHeart(ctx, px, py, size, color, alpha)
      }
      animRef.current = requestAnimationFrame(draw)
    }
    animRef.current = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(animRef.current)
      window.removeEventListener('resize', resize)
    }
  }, [scrollProgress, ready])

  return (
    <section className="relative" style={{ height: '300vh' }}>
      <div className="sticky top-0 h-screen w-full overflow-hidden">
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
        {/* Portrait photos overlay — fade in during assemble, hold visible, fade out during merge */}
        <PortraitOverlay scrollProgress={scrollProgress} />
        {/* Overlay text — appears at end of section 1 */}
        <div className="absolute inset-0 flex flex-col items-center justify-end pb-24 pointer-events-none">
          <ProgressGate scrollProgress={scrollProgress} from={0.82} to={0.94}>
            <h1 className="text-center font-serif text-6xl md:text-8xl font-light tracking-wide glow-pink">
              Chakri <span className="text-pink-400">❤</span> Uma
            </h1>
          </ProgressGate>
          <ProgressGate scrollProgress={scrollProgress} from={0.9} to={1.0}>
            <button
              onClick={onBegin}
              className="mt-10 px-8 py-4 rounded-full bg-gradient-to-r from-pink-500 to-rose-500 text-white text-lg font-medium glow-button pointer-events-auto hover:scale-105 transition-transform"
            >
              Begin Our Story ✨
            </button>
          </ProgressGate>
        </div>
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-white/40 text-xs tracking-[0.4em] uppercase">
          Scroll Slowly
        </div>
      </div>
    </section>
  )
}

// Portrait photos overlay — circular cropped, glowing, fades with scroll
function PortraitOverlay({ scrollProgress }) {
  const [opacity, setOpacity] = useState(0)
  const [scale, setScale] = useState(0.7)
  useEffect(() => {
    let raf
    const tick = () => {
      const p = scrollProgress.current ?? 0
      // 0..0.35 fade in, 0.35..0.78 hold at 1, 0.78..1 fade out
      let o = 0, s = 0.85
      if (p < 0.35) {
        const t = easeOutCubic(p / 0.35)
        o = t
        s = 0.7 + 0.3 * t
      } else if (p < 0.78) {
        o = 1; s = 1
      } else {
        const t = easeInOut((p - 0.78) / 0.22)
        o = 1 - t
        s = 1 - 0.15 * t
      }
      setOpacity(o)
      setScale(s)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [scrollProgress])

  return (
    <div className="absolute inset-0 pointer-events-none flex items-center justify-around px-4" style={{ opacity }}>
      {/* Chakri */}
      <div
        className="relative aspect-square rounded-full overflow-hidden border-2 border-pink-300/50 pulse-glow"
        style={{
          width: 'min(26vw, 52vh)',
          transform: `scale(${scale})`,
          boxShadow: '0 0 60px 8px rgba(255,120,180,0.7), 0 0 140px 20px rgba(255,120,180,0.4), inset 0 0 40px rgba(255,200,220,0.25)',
        }}
      >
        <img src="/Chakri.png?v=2" alt="Chakri" className="w-full h-full object-cover" />
        <div className="absolute inset-0 rounded-full" style={{
          background: 'radial-gradient(circle at 50% 50%, transparent 55%, rgba(255,120,180,0.35) 90%)',
        }} />
      </div>
      {/* Uma */}
      <div
        className="relative aspect-square rounded-full overflow-hidden border-2 border-pink-200/50 pulse-glow"
        style={{
          width: 'min(26vw, 52vh)',
          transform: `scale(${scale})`,
          boxShadow: '0 0 60px 8px rgba(255,180,210,0.7), 0 0 140px 20px rgba(255,180,210,0.4), inset 0 0 40px rgba(255,220,230,0.25)',
        }}
      >
        <img src="/Uma.png" alt="Uma" className="w-full h-full object-cover" />
        <div className="absolute inset-0 rounded-full" style={{
          background: 'radial-gradient(circle at 50% 50%, transparent 55%, rgba(255,180,210,0.35) 90%)',
        }} />
      </div>
    </div>
  )
}

// Helper that gates children visibility based on progress range
function ProgressGate({ scrollProgress, from, to, children }) {
  const [opacity, setOpacity] = useState(0)
  const [y, setY] = useState(20)
  useEffect(() => {
    let raf
    function tick() {
      const p = scrollProgress.current ?? 0
      const t = clamp((p - from) / (to - from), 0, 1)
      setOpacity(t)
      setY(20 - 20 * t)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [from, to, scrollProgress])
  return <div style={{ opacity, transform: `translateY(${y}px)`, transition: 'opacity 0.15s linear' }}>{children}</div>
}

// ============== SECTION 2 — OUR JOURNEY ==============
function Section2Journey({ scrollProgress }) {
  return (
    <section className="relative bg-aurora" style={{ height: '400vh' }}>
      <div className="sticky top-0 h-screen w-full overflow-hidden">
        <JourneyScene scrollProgress={scrollProgress} />
      </div>
    </section>
  )
}

function JourneyScene({ scrollProgress }) {
  const canvasRef = useRef(null)
  useEffect(() => {
    const c = canvasRef.current
    if (!c) return
    const ctx = c.getContext('2d')
    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      c.width = window.innerWidth * dpr; c.height = window.innerHeight * dpr
      c.style.width = window.innerWidth + 'px'; c.style.height = window.innerHeight + 'px'
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize(); window.addEventListener('resize', resize)
    let raf
    function draw(now) {
      const w = window.innerWidth, h = window.innerHeight
      ctx.clearRect(0, 0, w, h)
      const p = clamp(scrollProgress.current ?? 0, 0, 1)

      // Stars
      ctx.fillStyle = 'rgba(255,255,255,0.6)'
      for (let i = 0; i < 120; i++) {
        const sx = (i * 113 + now * 0.01) % w
        const sy = (i * 67) % h
        const tw = 0.4 + (Math.sin(now * 0.001 + i) + 1) * 0.3
        ctx.globalAlpha = tw
        ctx.fillRect(sx, sy, 1.3, 1.3)
      }
      ctx.globalAlpha = 1

      // Two planets
      // Stage progress
      // 0..0.35 = planets drift closer
      // 0.35..0.7 = chat bubbles + lightning
      // 0.7..1.0 = red thread + quote
      const planetSep = lerp(w * 0.36, w * 0.18, easeInOut(clamp(p / 0.7, 0, 1)))
      const cy = h * 0.5
      const lx = w * 0.5 - planetSep
      const rx = w * 0.5 + planetSep

      // planet glow
      drawPlanet(ctx, lx, cy, 70, ['#7a3bff', '#ff67b1'], 'Chakri', now * 0.0008)
      drawPlanet(ctx, rx, cy, 70, ['#ff67b1', '#ffd1a4'], 'Uma', -now * 0.0008)

      // chat bubbles
      if (p > 0.3 && p < 0.8) {
        const t = clamp((p - 0.3) / 0.4, 0, 1)
        for (let i = 0; i < 8; i++) {
          const bx = lerp(lx + 90, rx - 90, (i + 0.5) / 8) + Math.sin(now * 0.001 + i) * 8
          const by = cy + Math.sin(now * 0.0007 + i * 1.7) * 60 + (i % 2 === 0 ? -50 : 50)
          ctx.globalAlpha = 0.65 * t
          ctx.fillStyle = i % 3 === 0 ? 'rgba(255,120,180,0.9)' : 'rgba(255,255,255,0.85)'
          roundRect(ctx, bx - 30, by - 14, 60, 28, 14)
          ctx.fill()
          // blurry text dots
          ctx.fillStyle = 'rgba(0,0,0,0.4)'
          for (let d = 0; d < 3; d++) ctx.fillRect(bx - 10 + d * 7, by - 1, 4, 2)
        }
        // lightning
        if (Math.sin(now * 0.005) > 0.85) {
          ctx.strokeStyle = `rgba(255,200,255,${0.4 * t})`
          ctx.lineWidth = 1.5
          ctx.beginPath()
          ctx.moveTo(lx, cy - 80)
          ctx.lineTo(w * 0.45, cy - 110)
          ctx.lineTo(w * 0.55, cy - 60)
          ctx.lineTo(rx, cy - 100)
          ctx.stroke()
        }
        ctx.globalAlpha = 1
      }

      // Red thread
      if (p > 0.55) {
        const t = clamp((p - 0.55) / 0.35, 0, 1)
        ctx.save()
        ctx.shadowColor = 'rgba(255,40,90,0.9)'
        ctx.shadowBlur = 18
        ctx.strokeStyle = `rgba(255,30,80,${0.85 * t})`
        ctx.lineWidth = 2.2
        ctx.beginPath()
        ctx.moveTo(lx + 60, cy)
        const wave = Math.sin(now * 0.002) * 40 * (1 - t * 0.5)
        ctx.bezierCurveTo(w * 0.4, cy - 80 + wave, w * 0.6, cy + 80 - wave, rx - 60, cy)
        ctx.stroke()
        ctx.restore()
      }

      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize) }
  }, [scrollProgress])

  return (
    <>
      <canvas ref={canvasRef} className="absolute inset-0" />
      <div className="absolute inset-x-0 top-12 text-center px-6 pointer-events-none">
        <ProgressGate scrollProgress={scrollProgress} from={0.02} to={0.15}>
          <h2 className="font-serif text-4xl md:text-6xl text-white/90 glow-pink">Our Journey</h2>
          <p className="mt-3 text-white/60 tracking-widest text-xs uppercase">Two worlds, one orbit</p>
        </ProgressGate>
      </div>
      <div className="absolute inset-x-0 bottom-20 text-center px-6 pointer-events-none">
        <ProgressGate scrollProgress={scrollProgress} from={0.72} to={0.95}>
          <p className="font-serif text-xl md:text-3xl text-white/95 italic max-w-2xl mx-auto leading-relaxed glow-pink">
            "We fought. We argued. We misunderstood. Yet every fight became another reason to stay."
          </p>
        </ProgressGate>
      </div>
    </>
  )
}

function drawPlanet(ctx, x, y, r, colors, label, rot) {
  const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r)
  g.addColorStop(0, colors[1])
  g.addColorStop(1, colors[0])
  ctx.save()
  ctx.shadowColor = colors[0]
  ctx.shadowBlur = 40
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fill()
  // ring
  ctx.shadowBlur = 0
  ctx.strokeStyle = 'rgba(255,255,255,0.15)'
  ctx.lineWidth = 1.4
  ctx.beginPath()
  ctx.ellipse(x, y, r * 1.55, r * 0.4, rot, 0, Math.PI * 2)
  ctx.stroke()
  ctx.restore()
  // label
  ctx.fillStyle = 'rgba(255,255,255,0.85)'
  ctx.font = '300 18px Cormorant Garamond, serif'
  ctx.textAlign = 'center'
  ctx.fillText(label, x, y + r + 28)
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

// ============== SECTION 3 — MY FEELINGS (split layout, mascot + cards) ==============
const FEELINGS = [
  { mood: 'Thinking', text: "I know we both have strong egos. Sometimes we argue. Sometimes we disagree." },
  { mood: 'Emotional', text: "Sometimes we make each other's day feel like heaven. Sometimes like chaos." },
  { mood: 'Joyful', text: 'Yet every misunderstanding somehow brings us closer.\nEvery fight reminds me how much we care.' },
  { mood: 'Shy', text: "I don't want to count how many times we've met or how many hours we've talked. Love isn't something I want to measure." },
  { mood: 'Happy', text: "Before you came into my life, I was comfortable being alone. I loved my own company.\nThen you arrived." },
  { mood: 'Embarrassed', text: 'You changed my understanding of happiness. You changed my perspective on life.' },
  { mood: 'Thinking', text: "Some feelings are difficult to express through text. Even when we're together, words sometimes fail me." },
  { mood: 'Emotional', text: "But I believe beautiful things take time. One day we'll discover new smiles, new memories, and a deeper love than we imagined." },
  { mood: 'Joyful', text: 'I worry every day. Not because I doubt us — but because I fear losing someone so important to me.' },
  { mood: 'Happy', text: 'And so I make one promise. I will always choose you. Support you. Stand beside you. Wait for you. Believe in you.\nBecause for me, it has always been you.' },
]

function Section3Feelings({ scrollProgress }) {
  const moodGlow = {
    Happy: 'from-yellow-300 to-pink-400',
    Thinking: 'from-indigo-400 to-purple-500',
    Embarrassed: 'from-rose-300 to-pink-500',
    Shy: 'from-pink-300 to-rose-400',
    Joyful: 'from-amber-300 to-pink-400',
    Emotional: 'from-purple-400 to-rose-500',
  }
  const [active, setActive] = useState(0)
  useEffect(() => {
    let raf
    const tick = () => {
      const p = scrollProgress.current ?? 0
      const idx = Math.min(FEELINGS.length - 1, Math.floor(p * FEELINGS.length * 0.98))
      setActive(idx)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [scrollProgress])

  const mood = FEELINGS[active]?.mood || 'Happy'

  return (
    <section className="relative bg-aurora" style={{ height: `${FEELINGS.length * 90}vh` }}>
      <div className="sticky top-0 h-screen w-full overflow-hidden flex items-center">
        <div className="absolute inset-0 bg-galaxy opacity-70" />
        {/* tiny floating hearts */}
        <FloatingHearts count={20} />
        <div className="relative z-10 grid md:grid-cols-2 w-full max-w-6xl mx-auto px-6 gap-6 items-center">
          {/* Mascot */}
          <div className="flex justify-center">
            <div className={`relative w-64 h-64 md:w-80 md:h-80 rounded-full bg-gradient-to-br ${moodGlow[mood]} p-1 pulse-glow`}>
              <div className="w-full h-full rounded-full overflow-hidden bg-black/40 backdrop-blur-md flex items-center justify-center">
                <img src="/Chakri.png?v=2" alt="Chakri mascot" className="w-full h-full object-cover" style={{
                  filter: mood === 'Embarrassed' ? 'hue-rotate(330deg) saturate(1.4)' :
                          mood === 'Thinking' ? 'brightness(0.8) saturate(0.7)' :
                          mood === 'Joyful' ? 'brightness(1.15) saturate(1.3)' :
                          mood === 'Shy' ? 'hue-rotate(340deg) brightness(1.05)' :
                          mood === 'Emotional' ? 'sepia(0.2) saturate(1.2)' : 'none'
                }} />
              </div>
              <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 bg-black/70 px-4 py-1 rounded-full text-sm text-pink-300 font-serif">{mood}</div>
            </div>
          </div>
          {/* Story card */}
          <div className="relative h-72">
            <AnimatePresence mode="wait">
              <motion.div
                key={active}
                initial={{ opacity: 0, y: 40 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -30 }}
                transition={{ duration: 0.6 }}
                className="absolute inset-0 bg-glass border border-white/10 rounded-2xl p-6 md:p-8 flex items-center"
              >
                <p className="font-serif text-xl md:text-2xl leading-relaxed text-white/95 whitespace-pre-line">
                  {FEELINGS[active]?.text}
                </p>
              </motion.div>
            </AnimatePresence>
            <div className="absolute -bottom-8 left-0 right-0 flex justify-center gap-1.5">
              {FEELINGS.map((_, i) => (
                <div key={i} className={`h-1 rounded-full transition-all duration-500 ${i === active ? 'w-8 bg-pink-400' : 'w-2 bg-white/30'}`} />
              ))}
            </div>
          </div>
        </div>
        <div className="absolute top-10 left-1/2 -translate-x-1/2 text-center">
          <h2 className="font-serif text-3xl md:text-5xl text-white/90 glow-pink">My Feelings</h2>
        </div>
      </div>
    </section>
  )
}

function FloatingHearts({ count = 14 }) {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {Array.from({ length: count }).map((_, i) => {
        const left = (i * 7.3) % 100
        const delay = (i % 8) * 0.5
        const dur = 8 + (i % 5) * 2
        const size = 12 + (i % 4) * 6
        return (
          <div
            key={i}
            className="absolute text-pink-400/60"
            style={{
              left: `${left}%`,
              bottom: '-40px',
              fontSize: size,
              animation: `floatUp ${dur}s ${delay}s linear infinite`,
            }}
          >❤</div>
        )
      })}
      <style jsx>{`
        @keyframes floatUp {
          0% { transform: translateY(0) rotate(0); opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 0.6; }
          100% { transform: translateY(-110vh) rotate(360deg); opacity: 0; }
        }
      `}</style>
    </div>
  )
}

// ============== SECTION 4 — OUR MEMORIES (video scrubbed by scroll) ==============
function Section4Memories({ scrollProgress }) {
  const videoRef = useRef(null)
  const [duration, setDuration] = useState(0)

  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    const onMeta = () => setDuration(v.duration || 0)
    v.addEventListener('loadedmetadata', onMeta)
    if (v.readyState >= 1) setDuration(v.duration || 0)
    return () => v.removeEventListener('loadedmetadata', onMeta)
  }, [])

  useEffect(() => {
    let raf
    const tick = () => {
      const v = videoRef.current
      if (v && duration > 0) {
        const p = clamp(scrollProgress.current ?? 0, 0, 1)
        const target = p * duration
        // Smoothly lerp currentTime toward target to avoid jitter
        const cur = v.currentTime
        const delta = target - cur
        if (Math.abs(delta) > 0.01) {
          v.currentTime = cur + delta * 0.35
        }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [duration, scrollProgress])

  return (
    <section className="relative" style={{ height: '500vh' }}>
      <div className="sticky top-0 h-screen w-full overflow-hidden bg-black">
        <video
          ref={videoRef}
          src="/WE.mp4?v=2"
          muted
          playsInline
          preload="auto"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/70 pointer-events-none" />
        <FloatingHearts count={28} />
        <SakuraPetals />
        <div className="absolute inset-x-0 top-20 text-center px-6">
          <ProgressGate scrollProgress={scrollProgress} from={0.05} to={0.25}>
            <p className="font-script text-3xl md:text-5xl text-white glow-pink">Every moment became a memory.</p>
          </ProgressGate>
        </div>
        <div className="absolute inset-x-0 bottom-24 text-center px-6">
          <ProgressGate scrollProgress={scrollProgress} from={0.55} to={0.85}>
            <p className="font-script text-3xl md:text-5xl text-white glow-pink">And every memory brought me closer to you.</p>
          </ProgressGate>
        </div>
        <div className="absolute top-6 left-1/2 -translate-x-1/2 text-white/40 text-xs tracking-[0.4em] uppercase">Our Memories</div>
      </div>
    </section>
  )
}

function SakuraPetals() {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {Array.from({ length: 24 }).map((_, i) => {
        const left = (i * 11.3) % 100
        const delay = (i % 10) * 0.4
        const dur = 9 + (i % 6) * 2.5
        const size = 10 + (i % 4) * 4
        return (
          <div key={i} className="absolute" style={{
            left: `${left}%`, top: '-30px',
            fontSize: size, opacity: 0.7,
            animation: `petalFall ${dur}s ${delay}s linear infinite`,
          }}>🌸</div>
        )
      })}
      <style jsx>{`
        @keyframes petalFall {
          0% { transform: translateY(0) translateX(0) rotate(0); opacity: 0; }
          10% { opacity: 0.7; }
          100% { transform: translateY(110vh) translateX(40px) rotate(360deg); opacity: 0.2; }
        }
      `}</style>
    </div>
  )
}

// ============== SECTION 5 — FIRST GLANCE (envelopes) ==============
const ENVELOPE_MESSAGES = [
  { title: 'The First Hello', msg: 'A message that became the start of everything.' },
  { title: 'Late Night Talks', msg: 'Hours felt like minutes when I spoke to you.' },
  { title: 'Your Laugh', msg: 'The sound that turned ordinary days into magic.' },
  { title: 'Our First Fight', msg: 'And the realization that I never want to lose you.' },
  { title: 'Coffee & You', msg: 'Every cup tastes better when shared with you.' },
  { title: 'Rainy Days', msg: 'I want to be your umbrella forever.' },
  { title: 'Your Eyes', msg: 'I see my entire future when I look into them.' },
  { title: 'Tiny Gestures', msg: 'The smallest things you do mean the world.' },
  { title: 'Our Songs', msg: 'Lyrics that remind me only of you.' },
  { title: 'Forehead Kisses', msg: 'A promise sealed without words.' },
  { title: 'Silly Arguments', msg: 'Even our fights end in smiles.' },
  { title: 'Your Smile', msg: 'My favorite view in this universe.' },
  { title: 'Hand in Hand', msg: 'Wherever, whenever — just like this.' },
  { title: 'You & Me', msg: 'A story still being written, beautifully.' },
  { title: 'Your Voice', msg: 'My favorite melody on repeat.' },
  { title: 'Quiet Moments', msg: 'Silence with you feels like a song.' },
  { title: 'First Sight', msg: 'I think I knew before I knew.' },
  { title: 'My Promise', msg: 'I will always choose you.' },
  { title: 'Forever', msg: 'A word that finally makes sense — because of you.' },
]

function Section5FirstGlance({ scrollProgress }) {
  const [open, setOpen] = useState(null)
  const ref = useRef(null)
  const [cursor, setCursor] = useState({ x: -100, y: -100 })

  return (
    <section ref={ref} className="relative" style={{ height: '180vh' }} onMouseMove={(e) => {
      const r = ref.current?.getBoundingClientRect()
      if (r) setCursor({ x: e.clientX - r.left, y: e.clientY - r.top })
    }}>
      <div className="sticky top-0 h-screen w-full overflow-hidden bg-gradient-to-b from-[#1a0410] via-[#2a0820] to-[#1a0410]">
        {/* Heart field background */}
        <div className="absolute inset-0 opacity-30">
          {Array.from({ length: 60 }).map((_, i) => (
            <div key={i} className="absolute text-pink-400" style={{
              left: `${(i * 17.3) % 100}%`,
              top: `${(i * 23.7) % 100}%`,
              fontSize: 8 + (i % 5) * 4,
              opacity: 0.25 + (i % 5) * 0.1,
            }}>❤</div>
          ))}
        </div>
        <SakuraPetals />
        {/* cursor follower hearts */}
        <CursorHearts x={cursor.x} y={cursor.y} />

        <div className="relative z-10 max-w-6xl mx-auto px-6 pt-16 h-full">
          <div className="text-center mb-8">
            <h2 className="font-serif text-4xl md:text-6xl text-white glow-pink">The First Glance</h2>
            <p className="text-white/60 mt-2 text-sm tracking-widest uppercase">19 little letters · tap to open</p>
          </div>
          <div className="grid grid-cols-3 md:grid-cols-5 lg:grid-cols-7 gap-3 md:gap-4 max-h-[70vh] overflow-y-auto pb-12">
            {ENVELOPE_MESSAGES.map((e, i) => (
              <button
                key={i}
                onClick={() => setOpen(i)}
                className="group relative aspect-[5/4] rounded-lg bg-gradient-to-br from-rose-500/30 to-pink-700/30 border border-white/10 hover:border-pink-300/70 hover:scale-105 transition-all duration-300 overflow-hidden float-soft"
                style={{ animationDelay: `${i * 0.15}s` }}
              >
                <div className="absolute inset-0 flex items-center justify-center">
                  <Mail className="w-7 h-7 text-pink-200 group-hover:scale-110 transition-transform" />
                </div>
                <div className="absolute bottom-1 left-1 right-1 text-[9px] text-pink-100/80 text-center truncate">#{i + 1}</div>
              </button>
            ))}
          </div>
        </div>

        <AnimatePresence>
          {open !== null && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 z-30 bg-black/70 backdrop-blur-sm flex items-center justify-center p-6"
              onClick={() => setOpen(null)}
            >
              <motion.div
                initial={{ scale: 0.6, rotateX: 90, opacity: 0 }}
                animate={{ scale: 1, rotateX: 0, opacity: 1 }}
                exit={{ scale: 0.6, rotateX: -90, opacity: 0 }}
                transition={{ duration: 0.6, type: 'spring' }}
                className="relative max-w-md w-full bg-gradient-to-br from-rose-100 to-pink-50 text-rose-900 rounded-2xl p-8 shadow-2xl"
                style={{ boxShadow: '0 0 80px rgba(255,90,160,0.6)' }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 text-pink-500 text-3xl">❤</div>
                <h3 className="font-serif text-3xl mb-4 text-rose-700">{ENVELOPE_MESSAGES[open].title}</h3>
                <p className="font-serif text-lg leading-relaxed">{ENVELOPE_MESSAGES[open].msg}</p>
                <p className="mt-6 text-right font-script text-2xl text-rose-600">— Chakri</p>
                <button onClick={() => setOpen(null)} className="absolute top-3 right-4 text-rose-700/60 hover:text-rose-700">✕</button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  )
}

function CursorHearts({ x, y }) {
  const [trail, setTrail] = useState([])
  useEffect(() => {
    if (x < 0) return
    setTrail((t) => [...t.slice(-12), { x, y, id: Math.random() }])
  }, [x, y])
  return (
    <div className="absolute inset-0 pointer-events-none z-20">
      {trail.map((p, i) => (
        <div key={p.id} className="absolute text-pink-400"
          style={{
            left: p.x, top: p.y,
            transform: `translate(-50%,-50%) scale(${(i + 1) / trail.length})`,
            opacity: (i + 1) / trail.length * 0.7,
            fontSize: 14 + i,
            transition: 'all 0.4s',
          }}>❤</div>
      ))}
    </div>
  )
}

// ============== SECTION 6 — FLOATING LOVE LETTER ==============
function Section6Letter({ scrollProgress }) {
  return (
    <section className="relative bg-aurora" style={{ height: '180vh' }}>
      <div className="sticky top-0 h-screen w-full overflow-hidden flex items-center justify-center px-6">
        <div className="absolute inset-0 bg-galaxy opacity-80" />
        <FloatingHearts count={16} />
        <SakuraPetals />
        <motion.div
          initial={{ rotateY: -20, y: 50, opacity: 0 }}
          whileInView={{ rotateY: 0, y: 0, opacity: 1 }}
          transition={{ duration: 1.4, ease: 'easeOut' }}
          viewport={{ once: true, amount: 0.3 }}
          className="relative z-10 max-w-2xl w-full float-soft"
          style={{ perspective: 1200 }}
        >
          <div
            className="relative bg-gradient-to-br from-[#fff8ee] to-[#ffe4ea] text-[#5a1a2e] rounded-lg p-8 md:p-12 shadow-2xl"
            style={{
              boxShadow: '0 30px 100px rgba(255,90,160,0.4), 0 0 80px rgba(255,200,220,0.35)',
              transform: 'rotateZ(-1deg)',
              backgroundImage: 'radial-gradient(circle at 10% 10%, rgba(255,200,220,0.4), transparent 40%), radial-gradient(circle at 90% 90%, rgba(255,180,200,0.3), transparent 40%)',
            }}
          >
            {/* Folded corners */}
            <div className="absolute top-0 left-0 w-10 h-10 bg-gradient-to-br from-rose-300 to-transparent" style={{ clipPath: 'polygon(0 0, 100% 0, 0 100%)' }} />
            <div className="absolute bottom-0 right-0 w-10 h-10 bg-gradient-to-tl from-rose-300 to-transparent" style={{ clipPath: 'polygon(100% 100%, 0 100%, 100% 0)' }} />
            {/* Rose decorations */}
            <div className="absolute -top-6 -left-6 text-5xl">🌹</div>
            <div className="absolute -bottom-6 -right-6 text-5xl">🌹</div>

            <h3 className="font-script text-5xl text-rose-700 mb-6">Uma,</h3>
            <div className="font-serif text-base md:text-lg leading-relaxed space-y-4">
              <p>You walked into my life quietly and slowly became one of the most important parts of it.</p>
              <p>You taught me that love is not about counting days, measuring conversations, or keeping score of memories. It is about feeling understood, supported, and cared for.</p>
              <p>You brought meaning to ordinary moments. You brought warmth to lonely days. You brought hope to uncertain ones.</p>
              <p>No matter what challenges come our way, I want you to know that I will continue choosing you, supporting you, and believing in us.</p>
              <p className="italic">Thank you for being my favorite chapter.</p>
            </div>
            <p className="mt-8 text-right font-script text-3xl text-rose-700">With all my heart,<br/>Chakri ❤</p>
          </div>
        </motion.div>
      </div>
    </section>
  )
}

// ============== SECTION 7 — FINAL PROPOSAL SCENE ==============
function Section7Proposal({ scrollProgress, onPropose }) {
  const fireworksRef = useRef(null)
  const [exploded, setExploded] = useState(false)

  // Stage progress: 0..0.2 far apart, 0.2..0.5 walking, 0.5..0.7 hands touch, 0.7..0.85 hug, 0.85..1 fireworks + text
  const [stage, setStage] = useState({ p: 0 })
  useEffect(() => {
    let raf
    const tick = () => {
      setStage({ p: clamp(scrollProgress.current ?? 0, 0, 1) })
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [scrollProgress])

  // Fireworks canvas
  useEffect(() => {
    const c = fireworksRef.current
    if (!c) return
    const ctx = c.getContext('2d')
    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      c.width = window.innerWidth * dpr; c.height = window.innerHeight * dpr
      c.style.width = window.innerWidth + 'px'; c.style.height = window.innerHeight + 'px'
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize(); window.addEventListener('resize', resize)
    let particles = []
    let lastSpawn = 0

    function spawnFirework(cx, cy, color) {
      const count = 60
      for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2
        const speed = 3 + Math.random() * 4
        particles.push({
          x: cx, y: cy,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 1.0,
          color,
          isHeart: true,
        })
      }
    }

    let raf
    function tick(now) {
      const w = window.innerWidth, h = window.innerHeight
      // trail fade
      ctx.fillStyle = 'rgba(0,0,0,0.15)'
      ctx.fillRect(0, 0, w, h)

      const p = scrollProgress.current ?? 0
      // Trigger fireworks when hug happens
      if (p > 0.7 && now - lastSpawn > 350) {
        lastSpawn = now
        const cx = w / 2 + (Math.random() - 0.5) * w * 0.5
        const cy = h * 0.45 + (Math.random() - 0.5) * h * 0.3
        const colors = ['#ff5aa0', '#ffd56b', '#ff8acb', '#ff3a7a', '#ffc28a']
        spawnFirework(cx, cy, colors[Math.floor(Math.random() * colors.length)])
        if (!exploded) setExploded(true)
      }

      particles = particles.filter(p => p.life > 0)
      particles.forEach(part => {
        part.x += part.vx
        part.y += part.vy
        part.vy += 0.05 // gravity
        part.vx *= 0.985
        part.vy *= 0.985
        part.life -= 0.012
        drawHeart(ctx, part.x, part.y, 7 * part.life + 3, part.color, part.life)
      })
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize) }
  }, [scrollProgress, exploded])

  // Character positions
  const p = stage.p
  const walkT = clamp((p - 0.1) / 0.5, 0, 1)
  const chakriX = lerp(-35, -8, easeInOut(walkT))
  const umaX = lerp(35, 8, easeInOut(walkT))
  const hugT = clamp((p - 0.55) / 0.2, 0, 1)
  const merged = clamp((p - 0.7) / 0.15, 0, 1)
  const couplePower = merged // 0..1

  return (
    <section className="relative" style={{ height: '600vh' }}>
      <div className="sticky top-0 h-screen w-full overflow-hidden bg-aurora">
        {/* Galaxy background */}
        <div className="absolute inset-0 bg-galaxy" />
        <FloatingHearts count={22} />
        <SakuraPetals />
        {/* Aurora glow */}
        <div className="absolute inset-x-0 top-0 h-2/3 opacity-50 pointer-events-none" style={{
          background: 'radial-gradient(ellipse at 50% 30%, rgba(255,120,180,0.4), transparent 60%), radial-gradient(ellipse at 30% 50%, rgba(120,80,255,0.3), transparent 50%)'
        }} />

        {/* Stars */}
        <div className="absolute inset-0">
          {Array.from({ length: 80 }).map((_, i) => (
            <div key={i} className="absolute bg-white rounded-full" style={{
              left: `${(i * 13.7) % 100}%`, top: `${(i * 7.3) % 100}%`,
              width: 1 + (i % 3), height: 1 + (i % 3),
              opacity: 0.3 + (i % 5) * 0.12,
            }} />
          ))}
        </div>

        {/* Characters layer */}
        <div className="absolute inset-0 flex items-end justify-center">
          {/* Show couple image when merged, otherwise individual */}
          {merged < 0.6 ? (
            <>
              <div className="absolute bottom-[12%] transition-all duration-300" style={{
                left: `calc(50% + ${chakriX}%)`,
                transform: `translateX(-50%) scale(${0.7 + walkT * 0.3})`,
              }}>
                <div className="relative w-40 h-52 md:w-56 md:h-72 rounded-2xl overflow-hidden pulse-glow"
                  style={{ boxShadow: '0 0 50px rgba(255,120,180,0.5)' }}>
                  <img src="/Chakri.png?v=2" alt="Chakri" className="w-full h-full object-cover" />
                </div>
                <p className="text-center mt-3 font-script text-2xl text-pink-200">Chakri</p>
              </div>
              <div className="absolute bottom-[12%] transition-all duration-300" style={{
                left: `calc(50% + ${umaX}%)`,
                transform: `translateX(-50%) scale(${0.7 + walkT * 0.3})`,
              }}>
                <div className="relative w-40 h-52 md:w-56 md:h-72 rounded-2xl overflow-hidden pulse-glow"
                  style={{ boxShadow: '0 0 50px rgba(255,180,200,0.6)' }}>
                  <img src="/Uma.png" alt="Uma" className="w-full h-full object-cover" />
                </div>
                <p className="text-center mt-3 font-script text-2xl text-pink-200">Uma</p>
              </div>
              {/* hand touch sparkle when hugT > 0 */}
              {hugT > 0 && (
                <div className="absolute bottom-[40%] left-1/2 -translate-x-1/2" style={{ opacity: hugT }}>
                  <Sparkles className="w-12 h-12 text-yellow-200" style={{ filter: 'drop-shadow(0 0 12px rgba(255,220,140,0.9))' }} />
                </div>
              )}
            </>
          ) : (
            <div className="absolute bottom-[8%] left-1/2 -translate-x-1/2" style={{ opacity: couplePower, transform: `translateX(-50%) scale(${0.85 + couplePower * 0.15})` }}>
              <div className="relative w-[70vw] max-w-[640px] aspect-square rounded-3xl overflow-hidden"
                style={{ boxShadow: '0 0 120px rgba(255,120,180,0.7), 0 0 60px rgba(255,200,140,0.5)' }}>
                <img src="/couple.png" alt="Chakri and Uma together" className="w-full h-full object-cover" />
                {/* halo */}
                <div className="absolute inset-0 pointer-events-none" style={{
                  boxShadow: 'inset 0 0 80px rgba(255,180,220,0.4)'
                }} />
              </div>
            </div>
          )}
        </div>

        {/* Fireworks canvas overlay */}
        <canvas ref={fireworksRef} className="absolute inset-0 pointer-events-none mix-blend-screen" />

        {/* Top title */}
        <div className="absolute top-12 left-1/2 -translate-x-1/2 text-center px-6">
          <ProgressGate scrollProgress={scrollProgress} from={0} to={0.1}>
            <p className="text-white/50 text-xs tracking-[0.5em] uppercase">The Final Scene</p>
          </ProgressGate>
        </div>

        {/* Final text */}
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 text-center px-6 pointer-events-none">
          <ProgressGate scrollProgress={scrollProgress} from={0.78} to={0.92}>
            <h2 className="font-script text-5xl md:text-7xl text-white glow-pink mb-6">I Love You, Uma</h2>
            <p className="font-serif text-lg md:text-2xl text-white/95 italic max-w-2xl mx-auto leading-relaxed">
              Across galaxies, beneath sakura,<br/>through every beat of this borrowed heart —<br/>
              it is, and was, and always will be you.
            </p>
          </ProgressGate>
        </div>

        {/* Proposal button */}
        <div className="absolute inset-x-0 bottom-10 flex justify-center px-6">
          <ProgressGate scrollProgress={scrollProgress} from={0.88} to={1.0}>
            <button
              onClick={onPropose}
              className="pointer-events-auto px-10 py-5 rounded-full bg-gradient-to-r from-pink-500 via-rose-500 to-fuchsia-500 text-white text-xl md:text-2xl font-serif glow-button hover:scale-110 transition-transform"
            >
              Will You Be Mine Forever? ❤
            </button>
          </ProgressGate>
        </div>
      </div>
    </section>
  )
}

// ============== SECTION 8 — REPLY FORM ==============
function Section8Reply() {
  const [name, setName] = useState('')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  const onSubmit = async (e) => {
    e.preventDefault()
    if (!name.trim() || !message.trim()) return
    setSending(true); setError('')
    const svc = process.env.NEXT_PUBLIC_EMAILJS_SERVICE_ID
    const tpl = process.env.NEXT_PUBLIC_EMAILJS_TEMPLATE_ID
    const key = process.env.NEXT_PUBLIC_EMAILJS_PUBLIC_KEY
    const toEmail = process.env.NEXT_PUBLIC_PROPOSAL_TO_EMAIL || 'samachakriofficial@gmail.com'
    let emailSent = false
    try {
      if (svc && tpl && key) {
        await emailjs.send(svc, tpl, {
          from_name: name,
          message,
          to_email: toEmail,
          reply_to: toEmail,
        }, { publicKey: key })
        emailSent = true
      }
    } catch (err) {
      // We'll still try to save to backend
      console.warn('EmailJS error:', err)
    }
    try {
      await fetch('/api/replies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, message, sentViaEmail: emailSent, userAgent: navigator.userAgent }),
      })
    } catch (err) {
      console.warn('backend save error', err)
    }
    setSending(false)
    setSent(true)
  }

  return (
    <section className="relative bg-aurora py-32 px-6">
      <div className="absolute inset-0 bg-galaxy opacity-70" />
      <FloatingHearts count={20} />
      <div className="relative max-w-xl mx-auto">
        <div className="text-center mb-10">
          <h2 className="font-serif text-4xl md:text-6xl text-white glow-pink">Your Reply</h2>
          <p className="text-white/70 mt-3 font-script text-2xl">Tell me what's in your heart, Uma…</p>
        </div>
        <AnimatePresence mode="wait">
          {!sent ? (
            <motion.form
              key="form"
              initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -30 }}
              onSubmit={onSubmit}
              className="bg-glass border border-pink-300/20 rounded-3xl p-8 md:p-10 shadow-2xl"
              style={{ boxShadow: '0 0 80px rgba(255,90,160,0.35)' }}
            >
              <label className="block text-pink-200/90 text-sm tracking-widest uppercase mb-2">Your Name</label>
              <input
                value={name} onChange={(e) => setName(e.target.value)}
                placeholder="Uma"
                className="w-full bg-black/40 border border-pink-300/20 rounded-xl px-4 py-3 mb-6 text-white placeholder-white/30 focus:outline-none focus:border-pink-400/70 focus:ring-2 focus:ring-pink-400/30 font-serif text-lg"
                required
              />
              <label className="block text-pink-200/90 text-sm tracking-widest uppercase mb-2">Your Message</label>
              <textarea
                value={message} onChange={(e) => setMessage(e.target.value)}
                placeholder="Write from your heart…"
                rows={6}
                className="w-full bg-black/40 border border-pink-300/20 rounded-xl px-4 py-3 mb-6 text-white placeholder-white/30 focus:outline-none focus:border-pink-400/70 focus:ring-2 focus:ring-pink-400/30 font-serif text-lg resize-none"
                required
              />
              {error && <p className="text-rose-300 text-sm mb-3">{error}</p>}
              <button
                type="submit" disabled={sending}
                className="w-full py-4 rounded-xl bg-gradient-to-r from-pink-500 to-rose-500 text-white font-serif text-xl glow-button hover:scale-[1.02] transition disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {sending ? 'Sending…' : (<><Send className="w-5 h-5" /> Send My Reply ❤</>)}
              </button>
              <p className="text-center text-white/40 text-xs mt-4">Your message reaches Chakri privately.</p>
            </motion.form>
          ) : (
            <motion.div
              key="thanks"
              initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
              className="bg-glass border border-pink-300/30 rounded-3xl p-10 text-center"
              style={{ boxShadow: '0 0 80px rgba(255,90,160,0.5)' }}
            >
              <div className="text-6xl mb-4">💌</div>
              <h3 className="font-serif text-3xl text-pink-200 glow-pink mb-3">Your reply is on its way…</h3>
              <p className="font-script text-2xl text-white/90">Thank you for reading every word. ❤</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <p className="text-center text-white/30 text-xs mt-16 tracking-widest">crafted with ❤ for Uma · by Chakri</p>
    </section>
  )
}

// ============== BACKGROUND MUSIC (floating control) ==============
function BackgroundMusic() {
  const audioRef = useRef(null)
  const [playing, setPlaying] = useState(false)
  const [shown, setShown] = useState(true)

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    audio.volume = 0.32
    audio.loop = true

    // Try to start playing on the FIRST user interaction (browsers block autoplay)
    const startOnInteract = async () => {
      try {
        await audio.play()
        setPlaying(true)
      } catch (e) {
        // user can still click the button
      }
      window.removeEventListener('pointerdown', startOnInteract)
      window.removeEventListener('keydown', startOnInteract)
      window.removeEventListener('wheel', startOnInteract)
      window.removeEventListener('touchstart', startOnInteract)
    }
    window.addEventListener('pointerdown', startOnInteract, { once: true })
    window.addEventListener('keydown', startOnInteract, { once: true })
    window.addEventListener('wheel', startOnInteract, { once: true })
    window.addEventListener('touchstart', startOnInteract, { once: true })

    return () => {
      window.removeEventListener('pointerdown', startOnInteract)
      window.removeEventListener('keydown', startOnInteract)
      window.removeEventListener('wheel', startOnInteract)
      window.removeEventListener('touchstart', startOnInteract)
    }
  }, [])

  const toggle = async () => {
    const audio = audioRef.current
    if (!audio) return
    if (audio.paused) {
      try { await audio.play(); setPlaying(true) } catch (e) {}
    } else {
      audio.pause(); setPlaying(false)
    }
  }

  return (
    <>
      <audio ref={audioRef} src="/music.mp3" preload="auto" />
      <button
        onClick={toggle}
        aria-label={playing ? 'Pause music' : 'Play music'}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-black/60 backdrop-blur border border-pink-300/40 text-pink-200 hover:text-white hover:bg-pink-500/60 transition-all shadow-[0_0_25px_rgba(255,90,160,0.45)] flex items-center justify-center"
      >
        {playing ? (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></svg>
        ) : (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
        )}
        {playing && (
          <span className="absolute -top-1 -right-1 flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-pink-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-pink-500"></span>
          </span>
        )}
      </button>
    </>
  )
}

// ============== APP ROOT ==============
function App() {
  // Refs to track scroll progress within each section (0..1)
  const heroRef = useRef(null), s1p = useRef(0)
  const journeyRef = useRef(null), s2p = useRef(0)
  const feelRef = useRef(null), s3p = useRef(0)
  const memRef = useRef(null), s4p = useRef(0)
  const firstRef = useRef(null), s5p = useRef(0)
  const letterRef = useRef(null), s6p = useRef(0)
  const propRef = useRef(null), s7p = useRef(0)
  const beginBtnRef = useRef(null)

  // Lenis smooth scroll + progress tracking
  useEffect(() => {
    let lenis
    let raf
    const init = async () => {
      const Lenis = (await import('@studio-freight/lenis')).default
      lenis = new Lenis({ duration: 1.4, smoothWheel: true, smoothTouch: false, lerp: 0.08 })
      function loop(time) {
        lenis.raf(time)
        // update each section's progress
        const updates = [
          [heroRef, s1p], [journeyRef, s2p], [feelRef, s3p],
          [memRef, s4p], [firstRef, s5p], [letterRef, s6p], [propRef, s7p]
        ]
        const winH = window.innerHeight
        for (const [r, p] of updates) {
          const el = r.current
          if (!el) continue
          const rect = el.getBoundingClientRect()
          const total = rect.height - winH
          // progress: from when section top hits top (0) to when section bottom hits bottom (1)
          const scrolled = -rect.top
          p.current = clamp(scrolled / Math.max(total, 1), 0, 1)
        }
        raf = requestAnimationFrame(loop)
      }
      raf = requestAnimationFrame(loop)
    }
    init()
    return () => {
      if (raf) cancelAnimationFrame(raf)
      if (lenis) lenis.destroy()
    }
  }, [])

  const beginStory = () => {
    const target = journeyRef.current
    if (!target) return
    target.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  const onPropose = () => {
    // Big heart explosion overlay
    const overlay = document.createElement('div')
    overlay.style.cssText = 'position:fixed;inset:0;z-index:99;pointer-events:none;background:radial-gradient(circle at 50% 50%, rgba(255,120,180,0.85), rgba(255,180,210,0.4) 30%, transparent 70%);animation:propPulse 1.4s ease-out forwards;'
    const style = document.createElement('style')
    style.textContent = '@keyframes propPulse{0%{opacity:0;transform:scale(0.6)}30%{opacity:1;transform:scale(1.05)}100%{opacity:0;transform:scale(1.3)}}'
    document.head.appendChild(style)
    document.body.appendChild(overlay)
    // petal rain
    for (let i = 0; i < 60; i++) {
      const petal = document.createElement('div')
      petal.textContent = ['🌹', '❤', '💖', '🌸'][i % 4]
      petal.style.cssText = `position:fixed;top:-40px;left:${Math.random() * 100}vw;font-size:${16 + Math.random() * 30}px;z-index:100;pointer-events:none;animation:rainDown ${3 + Math.random() * 3}s linear forwards;`
      document.body.appendChild(petal)
      setTimeout(() => petal.remove(), 6000)
    }
    const rainStyle = document.createElement('style')
    rainStyle.textContent = '@keyframes rainDown{0%{transform:translateY(0) rotate(0);opacity:1}100%{transform:translateY(110vh) rotate(720deg);opacity:0.2}}'
    document.head.appendChild(rainStyle)
    setTimeout(() => overlay.remove(), 1500)
    // smooth scroll to form
    setTimeout(() => {
      document.getElementById('reply-form')?.scrollIntoView({ behavior: 'smooth' })
    }, 900)
  }

  return (
    <main className="relative">
      <BackgroundMusic />
      <div ref={heroRef}><Section1Hero scrollProgress={s1p} onBegin={beginStory} /></div>
      <div ref={journeyRef}><Section2Journey scrollProgress={s2p} /></div>
      <div ref={feelRef}><Section3Feelings scrollProgress={s3p} /></div>
      <div ref={memRef}><Section4Memories scrollProgress={s4p} /></div>
      <div ref={firstRef}><Section5FirstGlance scrollProgress={s5p} /></div>
      <div ref={letterRef}><Section6Letter scrollProgress={s6p} /></div>
      <div ref={propRef}><Section7Proposal scrollProgress={s7p} onPropose={onPropose} /></div>
      <div id="reply-form"><Section8Reply /></div>
    </main>
  )
}

export default App
