// Glyphs live on the grid as integer [column, row] pairs.
// Changing the grid only changes how those pairs turn into font units.

export type Grid = { col: number; row: number; skew: number } // font units, degrees
export type Pt = [number, number]
export type Seg = Pt[] // 1 point: line to it. 3 points: cubic curve (handle, handle, end).
export type Contour = { start: Pt; segs: Seg[] } // always closed

export type GridGlyph = { name: string; unicode: number | null; advCols: number; contours: Contour[] }

const tan = (g: Grid) => Math.tan((g.skew * Math.PI) / 180)

export function snap([x, y]: Pt, g: Grid): Pt {
  const r = Math.round(y / g.row) + 0 // + 0 turns -0 into 0
  return [Math.round((x - r * g.row * tan(g)) / g.col) + 0, r]
}

export function toUnits([c, r]: Pt, g: Grid): Pt {
  return [c * g.col + r * g.row * tan(g), r * g.row]
}

const eq = (a: Pt, b: Pt) => a[0] === b[0] && a[1] === b[1]
const lerp = (a: Pt, b: Pt, t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]

function split(p0: Pt, [p1, p2, p3]: Seg): [Seg, Seg] {
  const a = lerp(p0, p1, 0.5), b = lerp(p1, p2, 0.5), c = lerp(p2, p3, 0.5)
  const d = lerp(a, b, 0.5), e = lerp(b, c, 0.5), m = lerp(d, e, 0.5)
  return [[a, d, m], [e, c, p3]]
}

const mid = (p0: Pt, [p1, p2, p3]: Seg): Pt => [
  (p0[0] + 3 * p1[0] + 3 * p2[0] + p3[0]) / 8,
  (p0[1] + 3 * p1[1] + 3 * p2[1] + p3[1]) / 8,
]

// Snap a curve. If the snapped curve strays more than half a cell from the
// source at its middle, split the source and snap each half (adds points).
function fitCurve(p0: Pt, seg: Seg, g: Grid, out: Seg[], depth = 0) {
  const s = seg.map((p) => snap(p, g))
  const m = mid(toUnits(snap(p0, g), g), s.map((p) => toUnits(p, g)))
  const want = mid(p0, seg)
  if (depth < 3 && Math.hypot(m[0] - want[0], m[1] - want[1]) > Math.min(g.col, g.row) / 2) {
    const [a, b] = split(p0, seg)
    fitCurve(p0, a, g, out, depth + 1)
    fitCurve(a[2], b, g, out, depth + 1)
  } else out.push(s)
}

// Remove what snapping made redundant. Returns null if nothing with area is left.
function clean(start: Pt, segs: Seg[]): Contour | null {
  const res: Seg[] = []
  let cur = start
  for (let s of segs) {
    const end = s[s.length - 1]
    if (s.length === 3 && eq(s[0], cur) && eq(s[1], end)) s = [end] // handles on the ends: a line
    if (eq(end, cur) && s.every((p) => eq(p, cur))) continue // zero length
    res.push(s)
    cur = end
  }
  const last = res[res.length - 1]
  if (last && last.length === 1 && eq(last[0], start)) res.pop() // closing line is implied
  const pts = [start, ...res.flat()]
  let area = 0
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length]
    area += a[0] * b[1] - b[0] * a[1]
  }
  return area === 0 ? null : { start, segs: res }
}

export function fitContour(src: Contour, g: Grid): Contour | null {
  const segs: Seg[] = []
  let prev = src.start
  for (const seg of src.segs) {
    if (seg.length === 1) segs.push([snap(seg[0], g)])
    else fitCurve(prev, seg, g, segs)
    prev = seg[seg.length - 1]
  }
  return clean(snap(src.start, g), segs)
}

export function fitGlyph(name: string, unicode: number | null, adv: number, src: Contour[], g: Grid): GridGlyph {
  const contours = src.map((c) => fitContour(c, g)).filter((c): c is Contour => c !== null)
  return { name, unicode, advCols: Math.round(adv / g.col), contours }
}

export function buildGlyph(gg: GridGlyph, g: Grid): { adv: number; contours: Contour[] } {
  const u = (p: Pt) => toUnits(p, g)
  return {
    adv: gg.advCols * g.col,
    contours: gg.contours.map((c) => ({ start: u(c.start), segs: c.segs.map((s) => s.map(u)) })),
  }
}

// .notdef: a box with a counter, on the grid. Outer contour counter-clockwise (CFF direction).
export function notdef(g: Grid, capHeight: number): GridGlyph {
  const w = Math.max(4, Math.round(500 / g.col)), h = Math.max(4, Math.round(capHeight / g.row))
  const sc = Math.max(1, Math.round(60 / g.col)), sr = Math.max(1, Math.round(60 / g.row))
  const box = (x0: number, y0: number, x1: number, y1: number, ccw: boolean): Contour => {
    const p: Pt[] = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]
    if (!ccw) p.reverse()
    return { start: p[0], segs: p.slice(1).map((q) => [q]) }
  }
  return {
    name: '.notdef',
    unicode: null,
    advCols: w + 2,
    contours: [box(1, 0, w + 1, h, true), box(1 + sc, sr, w + 1 - sc, h - sr, false)],
  }
}
