import { axesAt, BASIC_LATIN, exportPayload, fitFont, readFont, sourceContours, type AxisRanges, type Fitted, type FitSettings, type Source } from './font.ts'
import type { Contour } from './geom.ts'
import { buildGlyph, toggle, type Smooth } from './modules.ts'

const SHOW = 'HOnoaegRS4'
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
const num = (id: string) => +$<HTMLInputElement>(id).value
const canvas = $<HTMLCanvasElement>('view')
const status = $('status')

let src: Source | null = null
let fit: Fitted | null = null
let layout: { scale: number; ox: number; oy: number; starts: number[] } | null = null

const settings = (): FitSettings => ({ cellW: num('cellW'), cellH: num('cellH'), threshold: num('threshold') / 100, smooth: $<HTMLSelectElement>('smooth').value as Smooth })
const ranges = (): AxisRanges => ({ size: [num('sizeMin') / 100, num('sizeMax') / 100], widthMax: num('widthMax') / 100, slantMax: num('slantMax'), roundMax: num('roundMax') / 100 })
const preview = () => axesAt(settings(), ranges(), { wght: num('wght'), wdth: num('wdth'), slnt: num('slnt'), ROND: num('ROND') })

function open(buf: ArrayBuffer, label: string) {
  src = readFont(buf)
  $('info').textContent = `${label}: ${src.name('fontFamily')} ${src.name('fontSubfamily')}`
  const warn = []
  if (!src.isOFL) warn.push('This font is not under the SIL Open Font License. Use it for reference only.')
  if (src.missing.length) warn.push(`Missing characters: ${src.missing.join(' ')}`)
  $('warn').textContent = warn.join(' ')
  refit()
}

function refit() {
  if (!src) return
  const t = performance.now()
  fit = fitFont(src, BASIC_LATIN, settings())
  const n = fit.glyphs.reduce((a, g) => a + g.modules.length, 0)
  status.textContent = `Fitted ${fit.glyphs.length} glyphs, ${n} modules, in ${(performance.now() - t).toFixed(0)} ms.`
  $<HTMLButtonElement>('export').disabled = !src.isOFL
  draw()
}

function trace(ctx: CanvasRenderingContext2D, contours: Contour[]) {
  for (const c of contours) {
    ctx.moveTo(...c.start)
    for (const s of c.segs) {
      if (s.length === 1) ctx.lineTo(s[0][0], s[0][1])
      else ctx.bezierCurveTo(s[0][0], s[0][1], s[1][0], s[1][1], s[2][0], s[2][1])
    }
    ctx.closePath()
  }
}

const shown = () => [...SHOW].map((ch) => fit!.glyphs.find((x) => x.unicode === ch.codePointAt(0))!).filter(Boolean)

function draw() {
  if (!src || !fit) return
  const a = preview(), os2 = src.font.tables.os2
  const glyphs = shown()
  const built = glyphs.map((g) => buildGlyph(g, a))
  const scale = 0.25, pad = 40
  const top = os2.sTypoAscender + 100, bottom = os2.sTypoDescender - 50
  const w = built.reduce((s, b) => s + b.adv, 0) * scale + pad * 2 + (top * Math.tan((a.skew * Math.PI) / 180)) * scale
  const h = (top - bottom) * scale + pad * 2
  const dpr = devicePixelRatio
  canvas.width = w * dpr; canvas.height = h * dpr
  canvas.style.width = `${w}px`
  const ctx = canvas.getContext('2d')!
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, w, h)
  const oy = pad + top * scale
  ctx.translate(pad, oy)
  ctx.scale(scale, -scale) // font units, y up
  layout = { scale, ox: pad, oy, starts: [] }

  // Grid cells
  const t = Math.tan((a.skew * Math.PI) / 180)
  ctx.beginPath()
  for (let y = Math.ceil(bottom / a.cellH) * a.cellH; y <= top; y += a.cellH) { ctx.moveTo(-pad / scale + y * t, y); ctx.lineTo(w / scale + y * t, y) }
  for (let x = -Math.ceil(top / a.cellW) * a.cellW; x <= w / scale; x += a.cellW) { ctx.moveTo(x + bottom * t, bottom); ctx.lineTo(x + top * t, top) }
  ctx.strokeStyle = '#eee'; ctx.lineWidth = 1 / scale; ctx.stroke()

  let x = 0
  glyphs.forEach((g, i) => {
    layout!.starts.push(x)
    ctx.save(); ctx.translate(x, 0)
    ctx.beginPath(); trace(ctx, built[i].contours)
    ctx.fillStyle = 'rgba(0,0,0,0.8)'; ctx.fill()
    if ($<HTMLInputElement>('orig').checked) {
      ctx.beginPath(); trace(ctx, sourceContours(src!.font.charToGlyph(String.fromCodePoint(g.unicode!))))
      ctx.strokeStyle = '#e33'; ctx.stroke()
    }
    ctx.restore()
    x += built[i].adv
  })
  layout.starts.push(x)
}

// Click: find the glyph and the cell under the pointer, turn its module on or off.
canvas.onclick = (e) => {
  if (!fit || !layout) return
  const box = canvas.getBoundingClientRect(), k = canvas.width / devicePixelRatio / box.width
  const px = (e.clientX - box.left) * k, py = (e.clientY - box.top) * k
  const a = preview(), t = Math.tan((a.skew * Math.PI) / 180)
  const fy = (layout.oy - py) / layout.scale, fx = (px - layout.ox) / layout.scale
  const r = Math.floor(fy / a.cellH)
  const i = layout.starts.findIndex((s, j) => j < layout!.starts.length - 1 && fx - fy * t >= s && fx - fy * t < layout!.starts[j + 1])
  if (i < 0) return
  const g = shown()[i]
  const c = Math.floor((fx - fy * t - layout.starts[i]) / a.cellW)
  g.modules = toggle(g.modules, c, r)
  draw()
}

// Every export gets a new test number, so Illustrator and Figma never show a cached copy.
function nextTestNumber() {
  let n = 1
  try { n = +(localStorage.getItem('systype-test') ?? 0) + 1; localStorage.setItem('systype-test', String(n)) } catch {}
  return n
}

let worker: Worker | null = null
function exportFonts() {
  if (!src || !fit) return
  const n = nextTestNumber()
  const payload = exportPayload(src, fit, settings(), ranges(), n)
  worker ??= new Worker(new URL('./export.worker.ts', import.meta.url), { type: 'module' })
  status.textContent = `Exporting Systype Test ${n} (${payload.masters.length} masters). The first export downloads Pyodide and fontTools.`
  $<HTMLButtonElement>('export').disabled = true
  const t = performance.now()
  worker.onmessage = (e) => {
    $<HTMLButtonElement>('export').disabled = false
    if (e.data.error) { status.textContent = `Export failed: ${e.data.error}`; return }
    const ms = e.data.ms as Record<string, number>
    status.textContent = `Systype Test ${n}: ${Math.round(performance.now() - t)} ms in total. ` +
      Object.entries(ms).map(([k, v]) => `${k} ${Math.round(v)} ms`).join(', ')
    $('files').replaceChildren(...e.data.files.map((f: { name: string; data: Uint8Array }) => {
      const a = document.createElement('a')
      a.href = URL.createObjectURL(new Blob([f.data as BlobPart]))
      a.download = f.name
      a.textContent = `${f.name} (${Math.round(f.data.length / 1024)} KB)`
      return a
    }))
  }
  worker.postMessage(payload)
}

$<HTMLInputElement>('file').onchange = async (e) => {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (file) open(await file.arrayBuffer(), file.name)
}
$('sample').onclick = async () => open(await (await fetch('./IBMPlexSans-Regular.otf')).arrayBuffer(), 'IBMPlexSans-Regular.otf')
$('export').onclick = exportFonts
$('orig').onchange = draw
for (const el of document.querySelectorAll<HTMLInputElement | HTMLSelectElement>('.fit, .axis, .range')) {
  const out = el.nextElementSibling instanceof HTMLOutputElement ? el.nextElementSibling : null
  if (out) out.value = el.value
  el.oninput = () => {
    if (out) out.value = el.value
    if (el.classList.contains('fit')) refit() // refit from the original; discards clicks
    else draw() // axes and ranges only move modules
  }
}
