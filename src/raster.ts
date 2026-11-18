// How much of each grid cell a glyph covers, from 0 to 1.
// Samples sub × sub points per cell with the nonzero fill rule, one scanline at a time.
import type { Contour, Pt } from './geom.ts'

export type Coverage = { at(c: number, r: number): number; cells(): [number, number, number][] }

type Edge = [number, number, number, number] // x0, y0, x1, y1

function edges(contours: Contour[], steps = 16): Edge[] {
  const out: Edge[] = []
  for (const c of contours) {
    let p = c.start
    const add = (q: Pt) => { out.push([p[0], p[1], q[0], q[1]]); p = q }
    for (const s of c.segs) {
      if (s.length === 1) { add(s[0]); continue }
      const p0 = p, [p1, p2, p3] = s
      for (let i = 1; i <= steps; i++) {
        const t = i / steps, u = 1 - t
        add([
          u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
          u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
        ])
      }
    }
    add(c.start)
  }
  return out
}

export function coverage(contours: Contour[], cw: number, ch: number, sub = 16): Coverage {
  const es = edges(contours)
  const counts = new Map<string, number>()
  if (es.length) {
    const ys = es.flatMap((e) => [e[1], e[3]])
    const k0 = Math.floor((Math.min(...ys) / ch) * sub), k1 = Math.ceil((Math.max(...ys) / ch) * sub)
    for (let k = k0; k <= k1; k++) {
      const y = ((k + 0.5) * ch) / sub
      const xs: [number, number][] = []
      for (const [x0, y0, x1, y1] of es) {
        if ((y0 <= y) !== (y1 <= y)) xs.push([x0 + ((y - y0) / (y1 - y0)) * (x1 - x0), y1 > y0 ? 1 : -1])
      }
      xs.sort((a, b) => a[0] - b[0])
      let wind = 0
      for (let i = 0; i < xs.length - 1; i++) {
        wind += xs[i][1]
        if (wind === 0) continue
        // sample columns j with xs[i] <= (j + 0.5) * cw / sub < xs[i + 1]
        const j0 = Math.ceil((xs[i][0] * sub) / cw - 0.5), j1 = Math.ceil((xs[i + 1][0] * sub) / cw - 0.5)
        const r = Math.floor(k / sub)
        for (let j = j0; j < j1; j++) {
          const key = `${Math.floor(j / sub)},${r}`
          counts.set(key, (counts.get(key) ?? 0) + 1)
        }
      }
    }
  }
  const n = sub * sub
  return {
    at: (c, r) => (counts.get(`${c},${r}`) ?? 0) / n,
    cells: () => [...counts].map(([k, v]) => [...(k.split(',').map(Number) as [number, number]), v / n]),
  }
}
