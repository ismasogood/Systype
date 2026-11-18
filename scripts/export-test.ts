// Fit the test font with default settings and export it with local Python, without a browser.
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { BASIC_LATIN, exportPayload, fitFont, readFont, type AxisRanges, type FitSettings } from '../src/font.ts'

const b = readFileSync('fonts/IBMPlexSans-Regular.otf')
const src = readFont(b.buffer.slice(b.byteOffset, b.byteOffset + b.length) as ArrayBuffer)
const settings: FitSettings = { cellW: 50, cellH: 50, threshold: 0.5, smooth: 'triangle' }
const ranges: AxisRanges = { size: [0.4, 1], widthMax: 1.5, slantMax: 12, roundMax: 1 }
let t = performance.now()
const fit = fitFont(src, BASIC_LATIN, settings)
const fitMs = performance.now() - t
const payload = exportPayload(src, fit, settings, ranges, 0)
mkdirSync('dist/test', { recursive: true })
writeFileSync('dist/test/payload.json', JSON.stringify(payload))
const modules = fit.glyphs.reduce((n, g) => n + g.modules.length, 0)
console.log(`fit ${Math.round(fitMs)} ms, ${fit.glyphs.length} glyphs, ${modules} modules, ${payload.masters.length} masters`)
console.log(execFileSync('.venv/bin/python', ['-I', 'src/export.py', 'dist/test/payload.json', 'dist/test/fonts']).toString())
