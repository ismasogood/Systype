import { BASIC_LATIN, exportPayload, fitFont, readFont, sourceContours, type Fitted, type Source } from './font.ts'
import { buildGlyph, type Contour, type Grid } from './grid.ts'

const SHOW = 'HOnoaegRS4'
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
const sliders = ['col', 'row', 'skew'].map((id) => $<HTMLInputElement>(id))
const canvas = $<HTMLCanvasElement>('view')
const status = $('status')

let src: Source | null = null
let fit: Fitted | null = null

const grid = (): Grid => ({ col: +sliders[0].value, row: +sliders[1].value, skew: +sliders[2].value })

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
  fit = fitFont(src, BASIC_LATIN, grid())
  status.textContent = `Fitted ${fit.glyphs.length} glyphs in ${(performance.now() - t).toFixed(0)} ms.`
  $<HTMLButtonElement>('export').disabled = !src.isOFL
  draw()
}

function trace(ctx: CanvasRenderingContext2D, contours: Contour[]) {
  for (const c of contours) {
    ctx.moveTo(...c.start)
    for (const s of c.segs) s.length === 1 ? ctx.lineTo(...s[0]) : ctx.bezierCurveTo(...s[0], ...s[1], ...s[2])
    ctx.closePath()
  }
}

function draw() {
  if (!src || !fit) return
  const g = grid(), f = src.font, os2 = f.tables.os2
  const glyphs = [...SHOW].map((ch) => ({ fitted: fit!.glyphs.find((x) => x.unicode === ch.codePointAt(0)), orig: f.charToGlyph(ch) }))
  const built = glyphs.map((x) => (x.fitted ? buildGlyph(x.fitted, g) : { adv: 0, contours: [] }))
  const scale = 0.25, pad = 40
  const top = os2.sTypoAscender, bottom = os2.sTypoDescender
  const w = built.reduce((a, b) => a + b.adv, 0) * scale + pad * 2
  const h = (top - bottom) * scale + pad * 2
  const dpr = devicePixelRatio
  canvas.width = w * dpr; canvas.height = h * dpr
  canvas.style.width = `${w}px`
  const ctx = canvas.getContext('2d')!
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, w, h)
  ctx.translate(pad, pad + top * scale)
  ctx.scale(scale, -scale) // font units, y up

  // Grid
  const t = Math.tan((g.skew * Math.PI) / 180)
  ctx.beginPath()
  for (let y = Math.ceil(bottom / g.row) * g.row; y <= top; y += g.row) { ctx.moveTo(-pad / scale, y); ctx.lineTo(w / scale, y) }
  for (let x = -Math.ceil(top / g.col) * g.col; x <= w / scale + top; x += g.col) { ctx.moveTo(x + bottom * t, bottom); ctx.lineTo(x + top * t, top) }
  ctx.strokeStyle = '#eee'; ctx.lineWidth = 1 / scale; ctx.stroke()

  let x = 0
  glyphs.forEach((gl, i) => {
    ctx.save(); ctx.translate(x, 0)
    if ($<HTMLInputElement>('orig').checked) {
      ctx.beginPath(); trace(ctx, sourceContours(gl.orig))
      ctx.strokeStyle = '#e33'; ctx.stroke()
    }
    ctx.beginPath(); trace(ctx, built[i].contours)
    ctx.fillStyle = 'rgba(0,0,0,0.75)'; ctx.fill()
    ctx.restore()
    x += built[i].adv
  })
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
  const g = grid(), n = nextTestNumber()
  const payload = exportPayload(src, fit, [{ wdth: 100, grid: g }, { wdth: 150, grid: { ...g, col: g.col * 1.5 } }], n)
  worker ??= new Worker(new URL('./export.worker.ts', import.meta.url), { type: 'module' })
  status.textContent = `Exporting Systype Test ${n}. The first export downloads Pyodide and fontTools.`
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
      a.download = a.textContent = f.name
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
$('fit').onclick = refit
$('export').onclick = exportFonts
$('orig').onchange = draw
for (const s of sliders) {
  const out = s.nextElementSibling as HTMLOutputElement
  out.value = s.value
  s.oninput = () => { out.value = s.value; draw() } // rebuild from grid positions, no refit
}
