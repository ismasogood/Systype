import { expect, test } from 'vitest'
import type { Contour, Pt } from './geom.ts'
import { buildGlyph, fitModules, toggle, type Axes, type GridGlyph, type Module } from './modules.ts'
import type { Coverage } from './raster.ts'

const cov = (m: Record<string, number>): Coverage => ({
  at: (c, r) => m[`${c},${r}`] ?? 0,
  cells: () => Object.entries(m).map(([k, v]) => [...(k.split(',').map(Number) as [number, number]), v]),
})
const base: Axes = { cellW: 10, cellH: 10, size: 1, skew: 0, round: 0 }
const glyph = (modules: Module[]): GridGlyph => ({ name: 'x', unicode: null, advCells: 3, modules })
const points = (c: Contour): Pt[] => [c.start, ...c.segs.flat()]

test('cells at or above the threshold get a square', () => {
  const m = fitModules(cov({ '0,0': 0.5, '1,0': 0.49 }), 0.5, 'off')
  expect(m).toEqual([{ c: 0, r: 0, kind: 'square', corner: 0 }])
})

test('smoothing fills the corner where two filled neighbours meet', () => {
  // filled: left of (1,1) and below it. (1,1) is partly covered.
  const c = cov({ '0,1': 1, '1,0': 1, '1,1': 0.3 })
  expect(fitModules(c, 0.5, 'triangle')).toContainEqual({ c: 1, r: 1, kind: 'triangle', corner: 0 })
  expect(fitModules(c, 0.5, 'quarter')).toContainEqual({ c: 1, r: 1, kind: 'quarter', corner: 0 })
})

test('each corner orientation: BL 0, BR 1, TR 2, TL 3', () => {
  const at = (n: Record<string, number>) => fitModules(cov({ ...n, '1,1': 0.3 }), 0.5, 'triangle').find((m) => m.c === 1 && m.r === 1)?.corner
  expect(at({ '0,1': 1, '1,0': 1 })).toBe(0)
  expect(at({ '2,1': 1, '1,0': 1 })).toBe(1)
  expect(at({ '2,1': 1, '1,2': 1 })).toBe(2)
  expect(at({ '0,1': 1, '1,2': 1 })).toBe(3)
})

test('no smoothing below half the threshold, or when two corners qualify', () => {
  expect(fitModules(cov({ '0,1': 1, '1,0': 1, '1,1': 0.2 }), 0.5, 'triangle')).toHaveLength(2)
  expect(fitModules(cov({ '0,1': 1, '1,0': 1, '2,1': 1, '1,1': 0.3 }), 0.5, 'triangle')).toHaveLength(3)
})

test('a click adds a square or removes whatever module is there', () => {
  const one: Module[] = [{ c: 0, r: 0, kind: 'triangle', corner: 1 }]
  expect(toggle(one, 0, 0)).toEqual([])
  expect(toggle(one, 2, 3)).toContainEqual({ c: 2, r: 3, kind: 'square', corner: 0 })
})

test('a full-size sharp square fills its cell exactly', () => {
  const { contours } = buildGlyph(glyph([{ c: 1, r: 2, kind: 'square', corner: 0 }]), base)
  const ps = points(contours[0])
  expect(Math.min(...ps.map((p) => p[0]))).toBe(10)
  expect(Math.max(...ps.map((p) => p[0]))).toBe(20)
  expect(Math.min(...ps.map((p) => p[1]))).toBe(20)
  expect(Math.max(...ps.map((p) => p[1]))).toBe(30)
})

test('every module keeps the same points on every axis value', () => {
  const g = glyph([
    { c: 0, r: 0, kind: 'square', corner: 0 },
    { c: 1, r: 0, kind: 'triangle', corner: 2 },
    { c: 2, r: 0, kind: 'quarter', corner: 3 },
  ])
  const shape = (a: Axes) => buildGlyph(g, a).contours.map((c) => c.segs.map((s) => s.length))
  const ref = shape(base)
  expect(shape({ cellW: 14, cellH: 9, size: 0.4, skew: 12, round: 1 })).toEqual(ref)
  expect(shape({ ...base, round: 0.5 })).toEqual(ref)
})

test('roundness 100 turns a square into a circle (straight sides collapse)', () => {
  const { contours } = buildGlyph(glyph([{ c: 0, r: 0, kind: 'square', corner: 0 }]), { ...base, round: 1 })
  const c = contours[0]
  let cur = c.start
  for (const s of c.segs) {
    if (s.length === 1) {
      expect(s[0][0]).toBeCloseTo(cur[0])
      expect(s[0][1]).toBeCloseTo(cur[1])
    }
    cur = s[s.length - 1]
  }
})

test('skew moves points by their height, the baseline stays', () => {
  const { contours } = buildGlyph(glyph([{ c: 0, r: 0, kind: 'square', corner: 0 }]), { ...base, skew: 45 })
  const ps = points(contours[0])
  expect(ps.filter((p) => p[1] === 0).every((p) => p[0] === 0 || p[0] === 10)).toBe(true)
  expect(ps.filter((p) => p[1] === 10).map((p) => Math.round(p[0])).sort()).toContain(20)
})
