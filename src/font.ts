import opentype, { type Font, type Glyph } from 'opentype.js'
import type { Contour, Pt } from './geom.ts'
import { buildGlyph, fitModules, notdef, type Axes, type GridGlyph, type Smooth } from './modules.ts'
import { coverage } from './raster.ts'

export const BASIC_LATIN = Array.from({ length: 95 }, (_, i) => String.fromCharCode(0x20 + i))

export type Source = {
  font: Font
  name: (key: string) => string
  isOFL: boolean
  missing: string[]
}

export function readFont(buf: ArrayBuffer): Source {
  const font = opentype.parse(buf)
  const names = font.names.windows ?? font.names.macintosh ?? {}
  const name = (key: string) => names[key]?.en ?? ''
  return {
    font,
    name,
    isOFL: /open font license/i.test(name('license')),
    missing: BASIC_LATIN.filter((c) => font.charToGlyphIndex(c) === 0),
  }
}

// Turn opentype.js path commands into closed contours. Quadratic curves become cubic (exact).
export function sourceContours(glyph: Glyph): Contour[] {
  const out: Contour[] = []
  let cur: Contour | null = null
  let p: Pt = [0, 0]
  for (const c of glyph.path.commands) {
    if (c.type === 'Z') continue
    const end: Pt = [c.x, c.y]
    if (c.type === 'M') out.push((cur = { start: end, segs: [] }))
    else if (c.type === 'L') cur!.segs.push([end])
    else if (c.type === 'C') cur!.segs.push([[c.x1, c.y1], [c.x2, c.y2], end])
    else {
      const q: Pt = [c.x1, c.y1]
      cur!.segs.push([[p[0] + (2 / 3) * (q[0] - p[0]), p[1] + (2 / 3) * (q[1] - p[1])], [end[0] + (2 / 3) * (q[0] - end[0]), end[1] + (2 / 3) * (q[1] - end[1])], end])
    }
    p = end
  }
  return out
}

export type FitSettings = { cellW: number; cellH: number; threshold: number; smooth: Smooth }
export type Fitted = { glyphs: GridGlyph[]; kern: [string, string, number][] } // kern in cells

export function fitFont(src: Source, chars: string[], s: FitSettings): Fitted {
  const f = src.font
  const have = chars.filter((c) => f.charToGlyphIndex(c) !== 0)
  const glyphs = [notdef(s.cellW, s.cellH, f.tables.os2.sCapHeight)]
  for (const ch of have) {
    const gl = f.charToGlyph(ch)
    const modules = fitModules(coverage(sourceContours(gl), s.cellW, s.cellH), s.threshold, s.smooth)
    glyphs.push({ name: gl.name, unicode: ch.codePointAt(0)!, advCells: Math.round(gl.advanceWidth / s.cellW), modules })
  }
  const space = glyphs.find((x) => x.unicode === 0x20)
  if (space) glyphs.push({ name: 'uni00A0', unicode: 0xa0, advCells: space.advCells, modules: [] })

  const kern: Fitted['kern'] = []
  for (const a of have) for (const b of have) {
    const ga = f.charToGlyph(a), gb = f.charToGlyph(b)
    const v = Math.round(f.getKerningValue(ga, gb) / s.cellW)
    if (v !== 0) kern.push([ga.name, gb.name, v])
  }
  return { glyphs, kern }
}

// Axis ranges for export. size: module size at wght 100 and 900. widthMax: cell width factor at the
// widest. slantMax: degrees of right lean at the most slanted. roundMax: 0 to 1.
export type AxisRanges = { size: [number, number]; widthMax: number; slantMax: number; roundMax: number }

type Loc = Record<string, number>

export function axesAt(fit: FitSettings, r: AxisRanges, loc: Loc): Axes {
  return {
    cellW: fit.cellW * ((loc.wdth ?? 100) / 100),
    cellH: fit.cellH,
    size: r.size[0] + (r.size[1] - r.size[0]) * (((loc.wght ?? 100) - 100) / 800),
    skew: -(loc.slnt ?? 0),
    round: (loc.ROND ?? 0) / 100,
  }
}

// Everything the Python export needs. Each master is the same modules with different axis values.
export function exportPayload(src: Source, fit: Fitted, s: FitSettings, r: AxisRanges, n: number) {
  const os2 = src.font.tables.os2
  const axes = [
    { tag: 'wght', name: 'Weight', min: 100, default: 400, max: 900 },
    { tag: 'wdth', name: 'Width', min: 100, default: 100, max: Math.round(100 * r.widthMax) },
    { tag: 'slnt', name: 'Slant', min: -r.slantMax, default: 0, max: 0 },
    { tag: 'ROND', name: 'Roundness', min: 0, default: 0, max: Math.round(100 * r.roundMax) },
  ].filter((a) => a.max > a.min)
  // A master at every combination of each axis's min, default and max, so axes that interact stay exact there.
  let locs: Loc[] = [{}]
  for (const a of axes) locs = locs.flatMap((l) => [...new Set([a.min, a.default, a.max])].map((v) => ({ ...l, [a.tag]: v })))
  const master = (loc: Loc) => {
    const ax = axesAt(s, r, loc)
    return {
      loc,
      glyphs: Object.fromEntries(fit.glyphs.map((g) => [g.name, buildGlyph(g, ax)])),
      kern: fit.kern.map(([a, b, v]) => [a, b, v * ax.cellW]),
    }
  }
  const defaults = Object.fromEntries(axes.map((a) => [a.tag, a.default]))
  const at = (extra: Loc) => ({ ...defaults, ...extra })
  const wghtNames: [number, string][] = [[100, 'Thin'], [400, 'Regular'], [700, 'Bold'], [900, 'Black']]
  // Style names only for Weight and Width: family plus all style names must stay within 31 characters.
  const stat = axes.map((a) => ({
    tag: a.tag,
    name: a.name,
    values:
      a.tag === 'wght' ? wghtNames.map(([value, name]) => ({ value, name, flags: value === 400 ? 2 : 0 }))
      : a.tag === 'wdth' ? [{ value: 100, name: 'Normal', flags: 2 }, { value: a.max, name: 'Wide', flags: 0 }]
      : [{ value: a.default, name: a.tag === 'slnt' ? 'Upright' : 'Sharp', flags: 2 }],
  }))
  return {
    family: `Systype Test ${n}`,
    version: n,
    upm: src.font.unitsPerEm,
    ascender: os2.sTypoAscender,
    descender: os2.sTypoDescender,
    lineGap: os2.sTypoLineGap,
    winAscent: os2.usWinAscent,
    winDescent: os2.usWinDescent,
    xHeight: os2.sxHeight,
    capHeight: os2.sCapHeight,
    copyright: src.name('copyright'),
    license: src.name('license'),
    licenseURL: src.name('licenseURL'),
    glyphs: fit.glyphs.map((x) => ({ name: x.name, unicode: x.unicode })),
    axes,
    masters: locs.map((l) => master(at(l))),
    static: master(at({ wght: 400 })), // the static OTF is the Regular
    instances: wghtNames.map(([v, name]) => ({ name, loc: at({ wght: v }) })),
    stat,
  }
}
