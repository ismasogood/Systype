import { expect, test } from 'vitest'
import type { Contour, Pt } from './geom.ts'
import { coverage } from './raster.ts'

const poly = (...p: Pt[]): Contour => ({ start: p[0], segs: p.slice(1).map((q) => [q]) })

test('a rectangle on cell edges covers exactly those cells', () => {
  const cov = coverage([poly([0, 0], [30, 0], [30, 20], [0, 20])], 10, 10)
  expect(cov.at(0, 0)).toBe(1)
  expect(cov.at(2, 1)).toBe(1)
  expect(cov.at(3, 0)).toBe(0)
  expect(cov.at(0, 2)).toBe(0)
  expect(cov.at(-1, 0)).toBe(0)
})

test('half a cell gives half coverage', () => {
  const cov = coverage([poly([0, 0], [15, 0], [15, 10], [0, 10])], 10, 10)
  expect(cov.at(1, 0)).toBe(0.5)
})

test('a counter wound the other way leaves its cell empty', () => {
  const outer = poly([0, 0], [30, 0], [30, 30], [0, 30])
  const inner = poly([10, 10], [10, 20], [20, 20], [20, 10])
  const cov = coverage([outer, inner], 10, 10)
  expect(cov.at(1, 1)).toBe(0)
  expect(cov.at(0, 1)).toBe(1)
})

test('a diagonal half cell is close to half coverage', () => {
  const cov = coverage([poly([0, 0], [10, 0], [0, 10])], 10, 10)
  expect(cov.at(0, 0)).toBeCloseTo(0.5, 1)
})
