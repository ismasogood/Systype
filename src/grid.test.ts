import { expect, test } from 'vitest'
import { buildGlyph, fitContour, fitGlyph, snap, toUnits, type Contour, type Grid } from './grid.ts'

const g: Grid = { col: 10, row: 10, skew: 0 }

test('snap and toUnits agree, with skew', () => {
  const sk: Grid = { col: 10, row: 20, skew: 12 }
  const p = toUnits([7, 3], sk)
  expect(snap(p, sk)).toEqual([7, 3])
})

test('an off-grid square lands on grid points', () => {
  const sq: Contour = { start: [1, 2], segs: [[[98, -3]], [[103, 99]], [[-2, 101]], [[1, 2]]] }
  expect(fitContour(sq, g)).toEqual({ start: [0, 0], segs: [[[10, 0]], [[10, 10]], [[0, 10]]] })
})

test('a contour smaller than a cell is removed', () => {
  const dot: Contour = { start: [1, 1], segs: [[[3, 1]], [[3, 3]], [[1, 3]]] }
  expect(fitContour(dot, g)).toBeNull()
})

test('a curve whose handles snap onto its ends becomes a line', () => {
  const c: Contour = { start: [0, 0], segs: [[[2, 1], [98, 1], [100, 0]], [[100, 100]], [[0, 100]]] }
  expect(fitContour(c, g)!.segs[0]).toEqual([[10, 0]])
})

test('changing the grid rebuilds from the same grid points', () => {
  const sq: Contour = { start: [0, 0], segs: [[[100, 0]], [[100, 100]], [[0, 100]]] }
  const gg = fitGlyph('sq', null, 120, [sq], g)
  const wide = buildGlyph(gg, { col: 15, row: 10, skew: 0 })
  expect(wide.adv).toBe(180)
  expect(wide.contours[0].segs[0]).toEqual([[150, 0]])
})
