# Claude Desktop RTL

[![CI](https://github.com/eliranpv11/claude-desktop-rtl/actions/workflows/ci.yml/badge.svg)](https://github.com/eliranpv11/claude-desktop-rtl/actions/workflows/ci.yml)
[![Latest release](https://img.shields.io/github/v/release/eliranpv11/claude-desktop-rtl?sort=semver)](https://github.com/eliranpv11/claude-desktop-rtl/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Platform: Windows · Browser](https://img.shields.io/badge/platform-Windows%20%C2%B7%20Browser-informational)](#install)

**Smooth right-to-left (Hebrew · Arabic · Persian) for Claude Desktop on Windows — and for claude.ai in the browser — from one pure, unit-tested engine.**

Out of the box, Claude writes beautiful Hebrew and then renders it left-to-right: bullets on the wrong side, punctuation jumping across the line, tables flowing backwards, `3 < 5` reading as `5 > 3`. This project fixes all of it **without ever touching your text or your network**.

---

## Why it matters

- 🎯 **Per-block direction, done right.** Every paragraph, list, table and quote decides its *own* direction from its *own* content. English blocks stay LTR and Hebrew blocks flip RTL **in the same document**, with no global flip — the bug every naive tool has.
- 🔒 **Zero network. Zero telemetry.** Nothing leaves your machine. Copy and Ctrl-F stay **byte-for-byte** — no invisible Unicode marks are ever injected. Arrows and comparison operators are flipped *visually*, the underlying characters are untouched.
- 🛡️ **Safe by construction.** Originals are backed up with a validated, atomic copy **before** anything changes, and any failure triggers an **automatic rollback**. One command restores everything.
- 🧪 **A pure, unit-tested core.** All bidi intelligence lives in a DOM-free engine covered by a torture-test corpus, decoupled from how it is delivered (desktop injection or browser userscript).

## Architecture

```
engine/     Pure, DOM-free bidi decision engine (unit-tested, no browser needed)
  ranges    Unicode script classification (astral-safe, 40+ RTL blocks)
  numbers   EN/AN digits, signed-run detection ("-5" vs Hebrew prefix "ל-15")
  detect    first-strong + majority; fallback is ALWAYS null, never forced RTL
  math      LaTeX vs currency ($5.99 stays text, $\frac{}{}$ is math)
  arrows    horizontal arrows needing a visual RTL flip (math/LTR-context aware)
  relations mirrored relations ("3 < 5" isolated so it never reads backwards)
  code      real code vs Hebrew prose mis-fenced as code
dom/        The thin runtime that applies the engine's decisions to Claude's UI
  apply.css ~85% of the work, declarative (unicode-bidi:plaintext per leaf block)
  surfaces  single source of truth for Claude's selectors
  apply.js  streaming-settle observer, input guards, tables, island wrapping
build/      Bundles engine+DOM+CSS into one self-contained IIFE (dist/payload.js)
windows/    The Windows patcher
  inject.mjs byte-exact injector (spares the main entry, keeps native modules)
  patch.ps1  install / restore / status / verify / watch — MSIX + Squirrel
```

**Design guarantees the two source tools I studied didn't both have:** the engine validates every input (null/undefined/non-string never throws) and every scan is bounded (no O(n²) path); integrity is handled by turning the Electron ASAR-integrity **fuse off** (encoding-agnostic) rather than a fragile hash byte-scan; and backups are structure-validated with automatic rollback on failure.

## Install

### 🪟 Windows (Claude Desktop)

One line in **PowerShell** — downloads this repository and launches the patcher (it self-elevates if your install needs admin):

```powershell
irm https://raw.githubusercontent.com/eliranpv11/claude-desktop-rtl/main/install.ps1 | iex
```

Or from a local clone:

```powershell
git clone https://github.com/eliranpv11/claude-desktop-rtl.git
cd claude-desktop-rtl
powershell -ExecutionPolicy Bypass -File .\windows\patch.ps1 -Preflight   # read-only readiness check
powershell -ExecutionPolicy Bypass -File .\windows\patch.ps1              # interactive menu
```

**Requirements:** Windows 10/11, [Node.js](https://nodejs.org/) in PATH (used for `@electron/asar` + `@electron/fuses` via `npx`), and administrator rights for a Microsoft-Store (MSIX) install.

**Menu / flags:** `-Install`, `-Restore`, `-Status`, `-Verify`, `-Preflight`, `-Watch`, `-Unwatch`.

> ⚠️ **Windows only** for the desktop app. 🍎 **Mac users:** try [toboly's mac patch](https://github.com/toboly/claude-desktop-rtl-patch-mac) or [soguy's mac patch](https://github.com/soguy/claude-desktop-rtl-mac) *(not tested here; use at your own risk)*.

### 🌐 Browser (claude.ai, any OS)

1. Install **Tampermonkey** (or Violentmonkey).
2. Build the userscript: `npm run build` → open **`dist/claude-rtl.user.js`** and install it (or paste its contents into a new Tampermonkey script).
3. Reload `claude.ai`. Hebrew/Arabic replies read right-to-left immediately, including inside the Artifacts panel.

## How it works (30 seconds)

The browser already runs a complete Unicode Bidirectional Algorithm. This tool does **not** reimplement it — it makes the **direction & isolation decisions** and lets the renderer reorder. CSS `unicode-bidi: plaintext` on each leaf block is the sole base-direction mechanism for prose, so every block self-determines from its own content and the container is never force-flipped. On the desktop, the same engine is injected into Claude's renderer bundles; the ASAR-integrity fuse is turned off so the modified bundle loads, and where `cowork-svc` guards `claude.exe` the binaries are re-signed with a local certificate.

## Verify & uninstall

```powershell
.\windows\patch.ps1 -Status     # install model, patched?, backup present?, watcher?
.\windows\patch.ps1 -Verify     # asar payload marker + certificate check (read-only)
.\windows\patch.ps1 -Restore    # put the validated backups back, remove the local cert
```

In the browser (or the desktop devtools), run `__claudeRtlDiag()` in the console. It returns the payload `version`, `booted` flag, and counts: `processed` (blocks stamped by the layer) and `rtlBlocks` (blocks currently rendered RTL). `booted` set with `rtlBlocks: 0` on a Hebrew conversation is the signal that a Claude update changed its markup enough to need attention.

## Limitations

- **Real code blocks stay LTR** by design (RTL scrambles braces/indentation/operators). A fence that is actually Hebrew *prose* is detected and rendered RTL.
- **Desktop Artifacts** render in a cross-origin iframe the desktop payload can't enter yet; the **browser userscript** does cover them.
- Integrity fuse-off requires Node (for `npx @electron/fuses`) at install time.

## Development

```bash
npm test      # run the engine + build unit tests (node:test, no browser needed)
npm run build # regenerate dist/payload.js and dist/claude-rtl.user.js
```

The engine is pure and unit-tested — the bar for a change is a green `npm test` and a small, single-purpose diff. See [CONTRIBUTING.md](CONTRIBUTING.md) for the workflow and [CHANGELOG.md](CHANGELOG.md) for the release history. Security-sensitive behaviour (certificate re-signing, fuse changes) is documented in [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE) © eliranpv11
