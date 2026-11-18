---
name: verify
description: Run Systype's checks before a commit. Typecheck, tests, build, and Font Bakery on the test font when the change affects font output.
---

Run these in order from the repo root. Stop at the first failure and report it.

1. `npm run typecheck`
2. `npm test`
3. `npm run build`
4. Only if the change touches import, grid fitting, axes, spacing or export: run `npm run export:test`, then `fontbakery check-universal` on each exported font. Zero FAILs required. List any WARN that wasn't there before.

If a script doesn't exist yet, say so and skip it. Don't create it as part of this skill.

Report one line per check: name, pass or fail, and the failing message if any. No full logs.
