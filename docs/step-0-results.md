# Step 0 results

Test font: IBM Plex Sans Regular 1.1.0 (OFL, cubic CFF outlines, 1000 units per em).
Tested 18 Nov 2026 on a Mac with Chrome (Claude browser pane), Node 26.13.1, Pyodide 314.0.8, fontTools 4.62.1.

## 1. Fit 10 letters to a grid, change the grid, see them rebuild: PASS

- Every point snaps to the nearest grid point, curve handles included.
- Points added: when a snapped curve strays more than half a cell from the source at its middle, the source curve is split in two (up to 3 times) and each half snapped.
- Points removed: zero-length segments, curves whose handles land on their ends (become lines), contours with no area left.
- Changing column, row or skew rebuilds every letter from the stored grid positions without refitting. Checked at column 35, row 60, skew 12 after fitting at 50 × 50.
- Fitting all 95 characters takes 6 to 8 ms.
- Unit tests: `src/grid.test.ts`, 5 passing.

Open: at large row spacing the letters grow taller than the preview canvas and get cut off at the top. Display only.

## 2. Export through Pyodide + fontTools, install in Illustrator and Figma: export PASS, install NOT TESTED YET

- Static OTF (CFF), 97 glyphs: `.notdef` first, 95 Basic Latin characters, U+00A0.
- Kerning: 480 source pairs inside the character set, snapped to whole columns, written as GPOS through feaLib.
- Names: family "Systype Test N", version "Version 1.00N", source copyright and OFL license kept, Mac name entries left out. N goes up on every export.
- Chrome loads all three files as web fonts and sets text with them.
- Font Bakery 1.1.0, Universal profile: 0 FAIL, 0 WARN on the static OTF.

Still to do: install in Illustrator and Figma desktop (Ismael).

## 3. Both variable formats: export PASS, install NOT TESTED YET

- Width axis, wdth 100 (default, the fitted grid) to 150 (column spacing × 1.5). Both masters come from the same grid positions.
- Variable TrueType: cubic to quadratic with `cu2qu.curves_to_quadratic` on all masters at once, so the masters keep the same points. Smart dropout `prep` and `gasp` added.
- Variable CFF2: `varLib.build` converts the CFF masters to CFF2.
- STAT table with a Regular (elidable) and an Extra Expanded value; fvar named instance "Regular".
- Font Bakery Universal: 0 FAIL on both. 1 WARN on both: no `avar` table. Fine for a straight Width axis; revisit when axes get uneven steps.

Still to do: install both in Illustrator and Figma desktop (Ismael). Default stays variable TrueType until that's done.

## 4. Export time for all 95 characters in the browser: PASS

| | ms |
| --- | --- |
| Load Pyodide + fontTools (first export; cached by the browser after an earlier run) | 1,200 to 1,300 |
| Static OTF | 27 to 47 |
| Variable TrueType | 103 to 116 |
| Variable CFF2 | 90 to 102 |
| All three, after the first export | about 230 |

First visit download size from the CDN: about 13.4 MB (Pyodide core 12.3 MB, fontTools 1.2 MB). A first visit on a slow connection will take longer than the 1.3 s above. Not measured with an empty cache.

## 5. File downloads inside a Framer Embed: NOT TESTED YET

Needs the page on a public URL (GitHub Pages), then an Embed on the Framer site.

## Fontspector

Not run yet. It isn't installed.
