"""Systype export: JSON payload in, font files out.
Runs in Pyodide (browser) and in local Python (npm run export:test).
"""
import json, os, shutil, sys, time

from fontTools import varLib
from fontTools.cu2qu import curves_to_quadratic
from fontTools.designspaceLib import AxisDescriptor, DesignSpaceDocument, InstanceDescriptor, SourceDescriptor
from fontTools.feaLib.builder import addOpenTypeFeaturesFromString
from fontTools.fontBuilder import FontBuilder
from fontTools.misc.roundTools import otRound
from fontTools.otlLib.builder import buildStatTable
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.reverseContourPen import ReverseContourPen
from fontTools.pens.t2CharStringPen import T2CharStringPen
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.ttLib import newTable
from fontTools.ttLib.tables import ttProgram


def r(p):
    return (otRound(p[0]), otRound(p[1]))


def draw(pen, contours):
    for c in contours:
        pen.moveTo(r(c["start"]))
        for s in c["segs"]:
            if len(s) == 1:
                pen.lineTo(r(s[0]))
            else:
                pen.curveTo(*map(r, s))
        pen.closePath()


def tt_glyphs(contours_per_master):
    """Quadratic outlines for every master at once, so all masters get the same points."""
    pens = [TTGlyphPen(None) for _ in contours_per_master]
    outs = [ReverseContourPen(p) for p in pens]  # TrueType winds the other way from CFF
    for cs in zip(*contours_per_master):
        cur = [r(c["start"]) for c in cs]
        for o, p in zip(outs, cur):
            o.moveTo(p)
        for segs in zip(*[c["segs"] for c in cs]):
            if len(segs[0]) == 1:
                cur = [r(s[0]) for s in segs]
                for o, p in zip(outs, cur):
                    o.lineTo(p)
            else:
                curves = [[p0] + [r(p) for p in s] for p0, s in zip(cur, segs)]
                for o, q in zip(outs, curves_to_quadratic(curves, [1.0] * len(curves))):
                    o.qCurveTo(*q[1:])
                cur = [c[-1] for c in curves]
        for o in outs:
            o.closePath()
    glyphs = [p.glyph() for p in pens]
    for g in glyphs:
        if g.numberOfContours:
            g.coordinates.toInt()
    return glyphs


def build(d, m, ttf, tt_outlines=None):
    family = d["family"]
    ps = family.replace(" ", "") + "-Regular"
    version = f"Version 1.{d['version']:03d}"
    order = [g["name"] for g in d["glyphs"]]
    fb = FontBuilder(d["upm"], isTTF=ttf)
    fb.setupGlyphOrder(order)
    fb.setupCharacterMap({g["unicode"]: g["name"] for g in d["glyphs"] if g["unicode"] is not None})
    glyphs = m["glyphs"]
    if ttf:
        fb.setupGlyf(dict(zip(order, tt_outlines)))
        glyf = fb.font["glyf"]
        lsb = {n: getattr(glyf[n], "xMin", 0) for n in order}
    else:
        charstrings, lsb = {}, {}
        for n in order:
            pen = T2CharStringPen(glyphs[n]["adv"], None)
            draw(pen, glyphs[n]["contours"])
            charstrings[n] = pen.getCharString()
            bp = BoundsPen(None)
            draw(bp, glyphs[n]["contours"])
            lsb[n] = bp.bounds[0] if bp.bounds else 0
        fb.setupCFF(ps, {"FullName": family + " Regular", "FamilyName": family}, charstrings, {})
    fb.setupHorizontalMetrics({n: (otRound(glyphs[n]["adv"]), lsb[n]) for n in order})
    fb.setupHorizontalHeader(ascent=d["winAscent"], descent=-d["winDescent"], lineGap=0)
    fb.setupNameTable({
        "copyright": d["copyright"],
        "familyName": family,
        "styleName": "Regular",
        "uniqueFontIdentifier": f"{version};{ps}",
        "fullName": family + " Regular",
        "version": version,
        "psName": ps,
        "licenseDescription": d["license"],
        "licenseInfoURL": d["licenseURL"],
    }, mac=False)
    fb.setupOS2(
        # One set of line metrics everywhere, no line gap: same line height as the source's win values.
        sTypoAscender=d["winAscent"], sTypoDescender=-d["winDescent"], sTypoLineGap=0,
        usWinAscent=d["winAscent"], usWinDescent=d["winDescent"],
        sxHeight=d["xHeight"], sCapHeight=d["capHeight"], fsType=0, achVendID="NONE",
        fsSelection=0x40 | 0x80, version=4,  # Regular, use typo metrics (needs OS/2 version 4)
    )
    fb.font["OS/2"].recalcUnicodeRanges(fb.font)
    fb.font["OS/2"].recalcCodePageRanges(fb.font)
    fb.setupPost()
    fb.updateHead(fontRevision=1 + d["version"] / 1000)
    if m["kern"]:
        pairs = "\n".join(f"  pos {a} {b} {otRound(v)};" for a, b, v in m["kern"])
        addOpenTypeFeaturesFromString(fb.font, f"languagesystem DFLT dflt;\nlanguagesystem latn dflt;\nfeature kern {{\n{pairs}\n}} kern;\n")
    return fb.font


def variable(d, fonts):
    ds = DesignSpaceDocument()
    a = AxisDescriptor()
    a.tag, a.name = "wdth", "Width"
    ws = [m["wdth"] for m in d["masters"]]
    a.minimum, a.default, a.maximum = min(ws), ws[0], max(ws)
    ds.addAxis(a)
    for i, (m, f) in enumerate(zip(d["masters"], fonts)):
        s = SourceDescriptor()
        s.name, s.font, s.location = f"m{i}", f, {"Width": m["wdth"]}
        ds.addSource(s)
    i = InstanceDescriptor()
    i.familyName, i.styleName, i.location = d["family"], "Regular", {"Width": a.default}
    ds.addInstance(i)
    vf = varLib.build(ds)[0]
    names = {75: "Condensed", 87.5: "Semi Condensed", 112.5: "Semi Expanded", 125: "Expanded", 150: "Extra Expanded"}
    values = [{"value": w, "name": names.get(w, f"Width {w}")} for w in ws if w != a.default]
    values.append({"value": a.default, "name": "Regular", "flags": 0x2})  # 0x2: elidable
    buildStatTable(vf, [{"tag": "wdth", "name": "Width", "values": values}], macNames=False)
    return vf


def smart_dropout(font):
    """Unhinted TrueType: turn on smart dropout control and smooth rendering at all sizes."""
    font["prep"] = newTable("prep")
    font["prep"].program = ttProgram.Program()
    font["prep"].program.fromAssembly(["PUSHW[]", "511", "SCANCTRL[]", "PUSHB[]", "4", "SCANTYPE[]"])
    font["gasp"] = newTable("gasp")
    font["gasp"].gaspRange = {0xFFFF: 0x000F}


def export_files(inp, out):
    """Write the static OTF and both variable fonts. Returns timings in ms as JSON."""
    d = json.load(open(inp))
    shutil.rmtree(out, ignore_errors=True)
    os.makedirs(out)
    stem = d["family"].replace(" ", "")
    ms = {}

    t = time.perf_counter()
    build(d, d["masters"][0], False).save(f"{out}/{stem}-Regular.otf")
    ms["static_otf"] = (time.perf_counter() - t) * 1000

    t = time.perf_counter()
    order = [g["name"] for g in d["glyphs"]]
    per_glyph = [tt_glyphs([m["glyphs"][n]["contours"] for m in d["masters"]]) for n in order]
    tts = [build(d, m, True, [g[i] for g in per_glyph]) for i, m in enumerate(d["masters"])]
    vf = variable(d, tts)
    smart_dropout(vf)
    vf.save(f"{out}/{stem}-VF.ttf")
    ms["vf_ttf"] = (time.perf_counter() - t) * 1000

    t = time.perf_counter()
    variable(d, [build(d, m, False) for m in d["masters"]]).save(f"{out}/{stem}-VF-CFF2.otf")
    ms["vf_cff2"] = (time.perf_counter() - t) * 1000
    return json.dumps(ms)


if __name__ == "__main__" and sys.platform != "emscripten":  # Pyodide also runs this as __main__
    print(export_files(sys.argv[1], sys.argv[2]))
