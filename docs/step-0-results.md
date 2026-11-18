# Step 0 results

Test font: IBM Plex Sans Regular 1.1.0 (OFL, cubic CFF outlines, 1000 units per em).
Tested 18 Nov 2026 on a Mac: Chrome (Claude browser pane), Illustrator 2027, Figma desktop, Node 26.13.1, Pyodide 314.0.8, fontTools 4.62.1.

This branch (`step-0-modules`) uses the module model. The earlier point-snapping results are on `step-0-grid-fit`.

## 0. Touching and overlapping modules in variable fonts: PASS

Probe fonts, one contour per module, Weight = module size (Bold = exactly touching, Black = 10 % overlap), in variable TrueType, variable TrueType with Apple's overlap flag, and CFF2.

| App | Exactly touching | Overlapping |
| --- | --- | --- |
| Illustrator: export at 1×, 3.33×, 4×, odd size and position, after Create Outlines, on screen | solid, 0 light pixels, all three formats | solid |
| Figma: on screen at 300 px and 37 px | clean, TT and CFF2 | clean, TT |
| Chrome: canvas at 17 to 333 px | clean, apart from one faint CFF2 seam at 41 px (13/255) | clean |

The overlap flag made no difference. Modules may touch at 100 % and overlap slightly.

## 1. Fit to modules, change the grid, move the axes: PASS

- Coverage per cell: 16 × 16 samples per cell, nonzero fill rule. Cells at or above the threshold get a square.
- Smoothing: an empty cell where two filled neighbours meet at one corner, with coverage at least half the threshold, gets a triangle or quarter circle there.
- Fit time for all 95 characters: 30 to 100 ms in Chrome (1,465 modules at 90-unit cells, 4,533 at 50-unit cells).
- Cell size, threshold and smoothing refit. Weight, Width, Slant and Roundness only move modules.
- Clicking a cell adds or removes its module; a second click undoes it.
- Unit tests: `src/raster.test.ts` (4), `src/modules.test.ts` (9).

## 2. Export through Pyodide + fontTools: export PASS, install of exported fonts NOT TESTED YET

- Static OTF: the Regular (Weight 400), 97 glyphs, kerning through feaLib, OFL names. Font Bakery Universal: 0 FAIL, 0 WARN.
- Chrome loads all three exported files and sets text with them.
- Found: CFF masters must be built with `getCharString(optimize=False)`. Otherwise a corner curve that collapses at roundness 0 is stored as a line in one master and a curve in another, and varLib refuses to merge them.

Still to do: install an export in Illustrator and Figma (the probe fonts were installed and tested, see 0).

## 3. Both variable formats: TrueType PASS, CFF2 FAIL (OTS)

- Four axes: `wght` 100 to 900 (default 400), `wdth` 100 to 150, `slnt` -12 to 0, `ROND` 0 to 100. A master at every combination of each axis's min, default and max: 24 masters, so axes that interact (all of them interact with module size) are exact at those points.
- Variable TrueType: Font Bakery 0 FAIL. WARNs reviewed: large font (1.2 MB); no `avar`; overlapping path segments (expected, touching modules); interpolation "contour order differs" in `at` and `.notdef` (false alarm: identical square modules matched in a different order).
- Variable CFF2: Font Bakery FAIL from OTS (the sanitizer browsers use): the charstrings of `at` (70.9 KB) and `W` (67.5 KB) are over 64 KB. With 12 or 16 masters it passed. Chrome still loaded this file. Fix later if CFF2 is wanted: fewer masters, or subroutines. Font Bakery's `duplexed_axis_reflow` check crashes on CFF2 (it expects a `gvar` table): a Font Bakery bug.
- Default stays variable TrueType.

## 4. Export time for all 95 characters in the browser: PASS, but slow

50-unit cells, 4,533 modules, 24 masters:

| | ms |
| --- | --- |
| Load Pyodide + fontTools (cached) | 1,166 |
| Static OTF | 301 |
| Variable TrueType | 17,014 |
| Variable CFF2 | 12,107 |
| All three | 32,665 |

The same export in local Python takes about 13 s. The payload sent to the worker is about 45 MB of JSON, since every master carries full outlines. Ways to cut it later: send modules and axis values and build the masters in Python, or export only the axes the user turns on.

## 5. File downloads inside a Framer Embed: NOT TESTED YET

Needs the page on a public URL (GitHub Pages), then an Embed on the Framer site.

## Fontspector

Not run yet. It isn't installed.
