// opentype.js 2.0.0 ships no types. Only what Systype uses.
declare module 'opentype.js' {
  type Command =
    | { type: 'M'; x: number; y: number }
    | { type: 'L'; x: number; y: number }
    | { type: 'Q'; x1: number; y1: number; x: number; y: number }
    | { type: 'C'; x1: number; y1: number; x2: number; y2: number; x: number; y: number }
    | { type: 'Z' }
  export interface Glyph {
    name: string
    index: number
    advanceWidth: number
    path: { commands: Command[] }
  }
  type Names = Record<string, { en?: string } | undefined>
  export interface Font {
    unitsPerEm: number
    names: { windows?: Names; macintosh?: Names }
    tables: { os2: Record<string, number> }
    charToGlyph(c: string): Glyph
    charToGlyphIndex(c: string): number
    getKerningValue(a: Glyph, b: Glyph): number
  }
  const opentype: { parse(buf: ArrayBuffer): Font }
  export default opentype
}
