// Fit the test font to the default grid and export it with local Python, without a browser.
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { BASIC_LATIN, exportPayload, fitFont, readFont } from '../src/font.ts'

const b = readFileSync('fonts/IBMPlexSans-Regular.otf')
const src = readFont(b.buffer.slice(b.byteOffset, b.byteOffset + b.length) as ArrayBuffer)
const grid = { col: 20, row: 20, skew: 0 }
const fit = fitFont(src, BASIC_LATIN, grid)
const payload = exportPayload(src, fit, [{ wdth: 100, grid }, { wdth: 150, grid: { ...grid, col: grid.col * 1.5 } }], 0)
mkdirSync('dist/test', { recursive: true })
writeFileSync('dist/test/payload.json', JSON.stringify(payload))
console.log(execFileSync('.venv/bin/python', ['-I', 'src/export.py', 'dist/test/payload.json', 'dist/test/fonts']).toString())
