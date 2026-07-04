# Contributing

Thanks for helping improve Claude Desktop RTL. This project favours **small,
single-purpose changes** with tests.

## Ground rules

- The **engine (`engine/`) is pure and DOM-free.** No `document`, no `window`,
  ever. All bidi intelligence is unit-tested there with `node:test`.
- Every engine input is **validated** (a `null`/`undefined`/non-string must never
  throw) and every scan is **bounded** (no O(n²) path). New code holds this bar.
- Direction is decided **per block from its own content**. Never introduce a global
  container flip.
- **Fidelity is sacred.** Arrows and relations are flipped *visually* only; the
  underlying code points are never changed, so copy and Ctrl-F stay byte-for-byte.

## Development

```bash
npm test        # engine + build unit tests (no browser needed)
npm run build   # regenerate dist/payload.js and dist/claude-rtl.user.js
```

For a real-browser check of the DOM/CSS layer, serve the fixture and inspect it:

```bash
node dev/fixture/serve.js   # http://localhost:5599/  (mimics Claude's markup)
```

The committed `dist/` **must** match a fresh `npm run build` — CI fails if it
drifts. Rebuild and commit `dist/` in the same change as any `engine/`, `dom/`, or
`build/` edit.

## When Claude Desktop changes its markup

The DOM layer is class-agnostic (it targets prose leaf tags, not Claude's class
names), so most Claude updates need no change. If direction stops applying:

1. In the console run `__claudeRtlDiag()` — `booted` set with `rtlBlocks: 0` on a
   Hebrew conversation points at a markup change.
2. Adjust `dom/surfaces.js` (the single source of truth for selectors) and/or the
   guards, add a fixture case under `dev/fixture/`, and re-verify in a real browser.

## Versioning & releases

- [Semantic Versioning](https://semver.org). Bump `package.json` `version` and add
  a `CHANGELOG.md` entry in the same change.
- A maintainer tags `vX.Y.Z` (matching `package.json`); the release workflow tests,
  builds, verifies the tag matches the version, and publishes a GitHub Release with
  the built `dist/` artifacts attached.

## Commit / PR style

- Imperative, scoped commit subjects (e.g. `dom: flip blockquote bar in RTL`).
- Keep the diff focused; explain the *why* in the body.
- Green `npm test` is required. Fill in the PR template.
