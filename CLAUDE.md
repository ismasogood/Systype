# Systype

Browser-based type design tool. Any font goes in, gets fitted to a grid and stays live on that grid. Exports a working static OTF and a variable font. Portfolio project for Ismael Djaló; it will be public, linked from his Framer site.

Full spec: Claude Doc "Portfolio projects", tab "5 Type tool", section "Agreed plan" (https://claude.ai/artifact/Xj1cyYfEv6d4Q9Sh2CxCiy). This file is the build reference.

## Working rules

- List your assumptions first. If something is unclear, stop and ask.
- Before changing files, explain the plan and the options. Agree on one, then act.
- Write the minimum. Nothing that wasn't asked for. If 200 lines can be 50, rewrite them. Touch only the lines that need to change.
- Bugs: first write a test that reproduces the bug, then make it pass.
- Never guess. Check library behavior against current official docs or by running code. Say plainly when something isn't verified.
- Plain, direct language in UI text, comments and messages. No em dashes.
- Ismael is on a Mac: use Cmd/Option shortcuts and Mac menu paths.

## Location and sync

- Repo lives in Dropbox: `/Users/ismaeldjalo/Library/CloudStorage/Dropbox/DESIGN/06_TOOLS/Systype` (Dropbox for macOS on File Provider).
- After every `npm install` or build, mark generated folders as not synced, so Dropbox doesn't sync hundreds of package files:
  `xattr -w 'com.apple.fileprovider.ignore#P' 1 node_modules dist`
  A deleted and recreated folder loses the mark, so run it again.
- GitHub is the backup and the deploy source. Commit small, commit often, push at the end of each session.

## What the tool does

1. Import: OTF, TTF or WOFF, one weight. Read the license field; warn if not OFL. Exports from an OFL source stay OFL: add the license and the source copyright, require a new family name.
2. Character set: Basic Latin only, U+0020 to U+007E (95 characters), whatever else the font has. Add `.notdef` (a box on the grid, first glyph) and U+00A0 (same width as space). List missing characters so they can be drawn on the grid.
3. Fit to grid: make one copy where every point sits on a grid point, adding and removing points as needed. That copy is the working font. The original is reference only.
4. Edit: points move between grid points. Glyphs are stored as grid positions, so changing the grid rebuilds every letter.
5. Axes (min and max set by the user):

   | Axis | Tag | Driven by |
   | --- | --- | --- |
   | Weight | `wght` | points pushed along the stroke, then aligned to the grid; max stops before counters close |
   | Width | `wdth` | grid column spacing |
   | Slant | `slnt` | grid skew; right lean is a negative value (OpenType spec) |
   | Roundness | `ROND` | corner radius: 0 = sharp, max = arcs; Google Fonts registry range 0 to 100, default 0 |

   Every master is made by moving the points of the one fitted copy, never by fitting again. Keep corner curve points at roundness 0 and keep collapsed points, so all masters have the same points.
6. Spacing: monospace (one advance width, `post.isFixedPitch` = 1, OS/2 PANOSE proportion = 9) or proportional (sidebearings from the grid; source kerning kept only for pairs inside the character set, snapped, then corrected).
7. Export: static OTF, variable font, proof page.

Grid in version 1: regular, separate column and row spacing, plus skew. No uneven or radial grids, no Mosaic-style cell mode.

## Stack

Static web app, no server. Fonts never leave the user's browser.

- Editor: TypeScript + Vite, Canvas/SVG.
- Import: opentype.js (reading only; its export writes no kerning and no valid variable font).
- Export: Pyodide + fontTools in a Web Worker, loaded only on export. Kerning as GPOS via feaLib, variable font via varLib.
- Overlap removal in JavaScript (Pyodide has no skia-pathops or ufo2ft).
- Saving: project file download/upload + browser storage.
- Hosting: GitHub Pages or another static host. On GitHub Free, Pages needs a public repo.

Checked 18 Nov 2026 (recheck before relying on them): opentype.js 2.0.0, Pyodide npm 314.0.8 with fontTools 4.62.1 in its lock file, Vite 8, TypeScript 7.

## Step 0 (current task)

Prove the risky parts before building the editor:

1. Import one OFL font, fit 10 letters (H O n o a e g R S 4) to a grid, change the grid, see the letters rebuild.
2. Export through Pyodide + fontTools. Install in Illustrator and Figma desktop. Raise the version number on every test install.
3. Export both variable formats (CFF2 and variable TrueType) and test both in Illustrator and Figma. Default until proven: variable TrueType.
4. Time the export for all 95 characters in the browser.
5. Test whether file downloads work inside a Framer Embed. If not, the site links to the tool with a button.

Done when: the test font installs and sets text in both apps, and each check has a written result.

## QA for every release

- Font Bakery Universal profile and Fontspector: no FAILs. Review WARNs.
- Installs and works in Illustrator and Figma desktop.
- Proof page prints correctly.
