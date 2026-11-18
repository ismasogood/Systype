// Glyphs are modules in grid cells. The fit decides which cells hold a module;
// the axes only change the modules' size, cell width, skew and corner radius.
import type { Contour, Pt, Seg } from './geom.ts'
import type { Coverage } from './raster.ts'

export type Kind = 'square' | 'triangle' | 'quarter'
export type Smooth = 'off' | 'triangle' | 'quarter'
// corner: where a triangle's right angle or a quarter circle's centre sits. 0 BL, 1 BR, 2 TR, 3 TL.
export type Module = { c: number; r: number; kind: Kind; corner: number }
export type GridGlyph = { name: string; unicode: number | null; advCells: number; modules: Module[] }
// size: module size as a share of the cell. skew: degrees, positive leans right. round: 0 sharp to 1 round.
export type Axes = { cellW: number; cellH: number; size: number; skew: number; round: number }

const key = (c: number, r: number) => `${c},${r}`
// Neighbours that must be filled for each corner: [dc, dr] pairs.
const CORNER_NEIGHBOURS = [[[-1, 0], [0, -1]], [[1, 0], [0, -1]], [[1, 0], [0, 1]], [[-1, 0], [0, 1]]]

export function fitModules(cov: Coverage, threshold: number, smooth: Smooth): Module[] {
  const cells = cov.cells()
  const full = new Set(cells.filter(([, , v]) => v >= threshold).map(([c, r]) => key(c, r)))
  const out: Module[] = [...full].map((k) => {
    const [c, r] = k.split(',').map(Number)
    return { c, r, kind: 'square' as Kind, corner: 0 }
  })
  if (smooth === 'off') return out
  for (const [c, r, v] of cells) {
    if (full.has(key(c, r)) || v < threshold / 2) continue
    const corners = CORNER_NEIGHBOURS.map((ns, q) => (ns.every(([dc, dr]) => full.has(key(c + dc, r + dr))) ? q : -1)).filter((q) => q >= 0)
    if (corners.length === 1) out.push({ c, r, kind: smooth, corner: corners[0] })
  }
  return out
}

export function toggle(modules: Module[], c: number, r: number): Module[] {
  const rest = modules.filter((m) => m.c !== c || m.r !== r)
  return rest.length < modules.length ? rest : [...modules, { c, r, kind: 'square', corner: 0 }]
}

// Unit-cell outlines for corner 0, counter-clockwise (CFF direction). Other corners rotate around the cell centre.
const K = 0.5523 // cubic handle length for a quarter circle
const SHAPES: Record<'square' | 'triangle', Pt[]> = { square: [[0, 0], [1, 0], [1, 1], [0, 1]], triangle: [[0, 0], [1, 0], [0, 1]] }
function rot([x, y]: Pt, q: number): Pt {
  for (let i = 0; i < q; i++) [x, y] = [1 - y, x]
  return [x, y]
}

const sub = (a: Pt, b: Pt): Pt => [a[0] - b[0], a[1] - b[1]]
const len = (a: Pt) => Math.hypot(a[0], a[1])
const unit = (a: Pt): Pt => { const l = len(a); return l ? [a[0] / l, a[1] / l] : [0, 0] }
const along = (p: Pt, d: Pt, t: number): Pt => [p[0] + d[0] * t, p[1] + d[1] * t]

// A polygon with every corner rounded by radius r: line to the corner's entry, curve to its exit.
// At r = 0 entry, handles and exit all sit on the corner, so the points never change in number.
function rounded(P: Pt[], r: number): Contour {
  const n = P.length
  const corner = (i: number) => {
    const din = unit(sub(P[i], P[(i + n - 1) % n])), dout = unit(sub(P[(i + 1) % n], P[i]))
    const theta = Math.acos(Math.max(-1, Math.min(1, -(din[0] * dout[0] + din[1] * dout[1])))) // interior angle
    const t = r / Math.tan(theta / 2), h = (4 / 3) * Math.tan((Math.PI - theta) / 4) * r
    const entry = along(P[i], din, -t), exit = along(P[i], dout, t)
    return { entry, h1: along(entry, din, h), h2: along(exit, dout, -h), exit }
  }
  const cs = P.map((_, i) => corner(i))
  const segs: Seg[] = []
  for (let i = 1; i <= n; i++) {
    const k = cs[i % n]
    segs.push([k.entry], [k.h1, k.h2, k.exit])
  }
  return { start: cs[0].exit, segs }
}

function moduleContour(m: Module, a: Axes): Contour {
  // Cell-unit point to font units, scaled by size around the cell centre (skew comes later).
  const place = ([u, v]: Pt): Pt => [(m.c + 0.5 + (u - 0.5) * a.size) * a.cellW, (m.r + 0.5 + (v - 0.5) * a.size) * a.cellH]
  if (m.kind === 'quarter') {
    const p = (u: number, v: number) => place(rot([u, v], m.corner))
    return { start: p(0, 0), segs: [[p(1, 0)], [p(1, K), p(K, 1), p(0, 1)]] }
  }
  const P = SHAPES[m.kind].map((pt) => place(rot(pt, m.corner)))
  let rmax: number
  if (m.kind === 'square') rmax = Math.min(len(sub(P[1], P[0])), len(sub(P[2], P[1]))) / 2
  else {
    const a1 = len(sub(P[1], P[0])), b1 = len(sub(P[2], P[0]))
    rmax = (a1 + b1 - Math.hypot(a1, b1)) / 2 // incircle radius: roundness 1 makes a circle
  }
  return rounded(P, a.round * rmax)
}

export function buildGlyph(g: GridGlyph, a: Axes): { adv: number; contours: Contour[] } {
  const t = Math.tan((a.skew * Math.PI) / 180)
  const sk = ([x, y]: Pt): Pt => [x + y * t, y]
  return {
    adv: g.advCells * a.cellW,
    contours: g.modules.map((m) => {
      const c = moduleContour(m, a)
      return { start: sk(c.start), segs: c.segs.map((s) => s.map(sk)) }
    }),
  }
}

// .notdef: a ring of square modules.
export function notdef(cellW: number, cellH: number, capHeight: number): GridGlyph {
  const w = Math.max(3, Math.round(500 / cellW)), h = Math.max(3, Math.round(capHeight / cellH))
  const modules: Module[] = []
  for (let c = 0; c < w; c++) for (let r = 0; r < h; r++) {
    if (c === 0 || r === 0 || c === w - 1 || r === h - 1) modules.push({ c: c + 1, r, kind: 'square', corner: 0 })
  }
  return { name: '.notdef', unicode: null, advCells: w + 2, modules }
}
