import opentype, { type Font, type Glyph } from 'opentype.js'
import { buildGlyph, fitGlyph, notdef, type Contour, type Grid, type GridGlyph, type Pt } from './grid.ts'

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

export type Fitted = { glyphs: GridGlyph[]; kern: [string, string, number][] } // kern in columns

export function fitFont(src: Source, chars: string[], g: Grid): Fitted {
  const f = src.font
  const have = chars.filter((c) => f.charToGlyphIndex(c) !== 0)
  const glyphs = [notdef(g, f.tables.os2.sCapHeight)]
  for (const ch of have) {
    const gl = f.charToGlyph(ch)
    glyphs.push(fitGlyph(gl.name, ch.codePointAt(0)!, gl.advanceWidth, sourceContours(gl), g))
  }
  const space = glyphs.find((x) => x.unicode === 0x20)
  if (space) glyphs.push({ name: 'uni00A0', unicode: 0xa0, advCols: space.advCols, contours: [] })

  const kern: Fitted['kern'] = []
  for (const a of have) for (const b of have) {
    const ga = f.charToGlyph(a), gb = f.charToGlyph(b)
    const v = Math.round(f.getKerningValue(ga, gb) / g.col)
    if (v !== 0) kern.push([ga.name, gb.name, v])
  }
  return { glyphs, kern }
}

// Everything the Python export needs. Each master is the same grid positions on a different grid.
export function exportPayload(src: Source, fit: Fitted, masters: { wdth: number; grid: Grid }[], n: number) {
  const os2 = src.font.tables.os2
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
    masters: masters.map(({ wdth, grid }) => ({
      wdth,
      glyphs: Object.fromEntries(fit.glyphs.map((x) => [x.name, buildGlyph(x, grid)])),
      kern: fit.kern.map(([a, b, v]) => [a, b, v * grid.col]),
    })),
  }
}
