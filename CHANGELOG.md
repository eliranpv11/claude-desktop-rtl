# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.4.6] — 2026-07-10

### Fixed
- **Tables heavy on English terms now flip too.** A Hebrew check/result table
  packed with English technical terms ("package.json", "build", "node", …) was
  character-majority English, so its column ORDER stayed LTR (the first Hebrew
  column stayed on the left and the whole table read the wrong way). The table
  direction is now decided the same context-aware way as lists: the cells' own
  majority, else a per-**column** vote (Hebrew columns vs English columns), else
  the surrounding Hebrew context (a preceding heading / the parent message).
  A table with no Hebrew at all always stays LTR. The context helper
  (`surroundingIsRtl`) is now shared by the list and table passes. Verified in a
  real browser: a Hebrew table whose characters are majority-English now flips
  its column order (the Hebrew label column moves to the right) while a
  pure-English control table stays LTR.

## [0.4.5] — 2026-07-10

### Fixed
- **Hebrew lists that are heavy on English terms now flip too.** 0.4.4 only
  caught lists whose raw character majority was Hebrew; a Hebrew instructional
  list packed with English terms ("Install RTL", "watcher", "mutex", …) is often
  majority-English by character count and stayed LTR. `listIsRtl` now decides
  with several signals, in order: the list's own majority, a per-item vote, the
  direction of the **preceding intro sentence**, and finally the surrounding
  block — so an English-term-heavy list that follows a Hebrew sentence flips RTL.
  A list with **no Hebrew at all** is still always left LTR. Verified in a real
  browser with a 13-Hebrew / 121-English-character list (now uniformly right)
  next to a pure-English control list (stays left).

## [0.4.4] — 2026-07-10

### Fixed
- **Hebrew lists now flip uniformly.** A list item that opened with a number or
  an English term (e.g. "7 (Disable auto re-patch) — …") stayed left-aligned
  while its Hebrew siblings went right, so an ordered list looked half-flipped.
  A list item's direction is now resolved from the **whole list** (a strong-char
  RTL majority across all items), not just the item's own first-strong character,
  so number/English-opener items align RTL with their siblings. English-majority
  lists are left untouched. Because the base `unicode-bidi: plaintext` rule
  otherwise defeats an explicit `dir` on such an item, forced-RTL items get a
  `data-rtl-litem` marker whose CSS (`unicode-bidi: isolate; direction: rtl;
  text-align: right`) makes the RTL actually win while keeping embedded English
  runs readable. Verified in a real browser (Hebrew list uniform right, English
  list stays left, all other surfaces unchanged).

## [0.4.3] — 2026-07-10

### Fixed
- **Concurrency: the patch could end up UNPATCHED even when it "succeeded".** An
  interactive install briefly closes Claude, which wakes the watcher; the two
  then ran at the same time and stepped on each other (one runs
  `Restore-FromBackups`/unpatch while the other injects), so the asar was left
  without the payload despite both reporting success. Diagnosed live on a machine
  that had updated to 1.20186 and kept reverting. Fixes:
  - A **cross-process mutex** (`Global\ClaudeRtlPatchLock`) serializes all patch
    operations — exactly one at a time. The watcher yields immediately if a patch
    is already running (logged as a defer, not a failure); an interactive install
    waits for the other to finish.
  - Under the lock the watcher **re-checks** whether RTL is already present and
    bails if so, so it can never undo a patch another run just applied.
  - An interactive install now **pauses the watcher scheduled task** for the
    duration of the patch as a second layer of protection.

## [0.4.2] — 2026-07-08

### Fixed
- **The auto re-patch no longer interrupts you.** The previous watcher
  force-closed and relaunched Claude to re-apply RTL after an update — and every
  failed attempt closed it too (its own `watcher.log` showed ~5 restarts in one
  day on a daily-update beta channel). It now follows the mature reference
  watcher's discipline and **never force-kills a running Claude**:
  1. a **read-only** marker scan of `app.asar` decides if RTL is already present
     (never opens Claude for write, never stops anything);
  2. if RTL is missing but Claude is **running** the new version, it **defers**
     and retries — RTL re-applies the next time Claude is closed and reopened;
  3. only when Claude is **closed** does it patch, **quietly** (`-NoStop`):
     touching only the background service, never launching the UI.
  Every internal force-kill path (`Stop-ClaudeStack`, the Phase-2 fuse loop, and
  the Phase-3 re-sign loop) is now gated so the quiet path cannot close a Claude
  the user opened mid-patch.

## [0.4.1] — 2026-07-06

### Added
- **RTL for the "ask" question boxes.** The multiple-choice elicitation widgets
  (`<form class="elicit">`) now mirror to RTL when the question is Hebrew: a new
  `processElicit` pass sets `dir="rtl"` on the widget so choice pills flow from
  the right and the question/footer align correctly. The decision is made from
  the question text (not the English button labels), only ever touches a `dir`
  we set, and leaves English question boxes LTR. Verified in a real browser
  (Hebrew box mirrors, pills flow right-to-left; English box unchanged) and that
  the existing message/sidebar/code behaviour is untouched.

## [0.4.0] — 2026-07-06

### Added
- **Global RTL across the whole app.** A new `processContainers` pass extends
  RTL beyond the chat bubble to every generic text container — sidebar chat
  titles, section labels, menu items, buttons, tab labels, dialogs. It tags only
  true text leaves that actually carry RTL, and the CSS applies
  `unicode-bidi: plaintext` + `text-align: start`, which right-aligns Hebrew and
  leaves English LTR **without** changing the CSS `direction`, so icon+label flex
  rows are never reversed. Verified in a real browser (Hebrew titles hug right,
  English stays left, the flex icon stays put).

### Changed
- **Faster install.** `install.ps1` now fetches only the three files the patcher
  needs (`windows/patch.ps1`, `windows/inject.mjs`, `dist/payload.js`, ~100 KB)
  directly from GitHub instead of downloading the whole-repo zip and running the
  slow `Expand-Archive`.

### Fixed
- **Auto re-patch now actually fires after a Claude update.** The watcher never
  ran: its task was registered `-AtLogOn` only (so it missed updates applied
  while you were working) and pointed at the temp clone the installer extracts
  (which Windows later cleaned up). It now stages a durable copy of the runtime
  under `%ProgramData%\ClaudeRtl\app`, triggers at logon **and** every 5 minutes,
  and re-applies only when the installed version actually changed. A failure
  memory (max 3 attempts per version, then a 6-hour back-off, reset on a new
  version) prevents an unpatchable update from restarting Claude every 5 minutes.
  The task is also registered for the real interactive user and targets the
  newest package when versions briefly coexist during an update.
- **Silent watcher.** The auto re-patch check ran as `powershell.exe
  -WindowStyle Hidden`, which still flashed a console window every 5 minutes. It
  now runs through a `wscript` VBScript launcher that starts hidden from creation
  (SW_HIDE) — no window flash on the recurring no-op check, and child processes
  of a real re-patch inherit the hidden console too. Verified: zero visible
  windows when launched via `wscript`.

## [0.3.0] — 2026-07-04

### Added
- **Structural RTL decoration.** A new `processDirBlock` pass mirrors a block's
  actual computed left padding/border to the right side, so blockquote bars and
  list bullets land on the correct side. It is **value-agnostic** — it reads the
  real computed value rather than assuming one — because Claude styles prose with
  physical Tailwind utilities (`border-left`, `padding-left`), verified against
  the live app bundle.
- **Real-browser verification harness** (`dev/fixture/`): a static server and a
  page mimicking Claude's markup under a deliberately non-targeted class, used to
  confirm computed direction/alignment/border/padding in a real Chromium.

### Fixed
- Nested lists now indent from the right; task-list checkboxes sit on the right.

## [0.2.0] — 2026-07-04

### Fixed
- **Assistant messages now flip.** Claude Desktop no longer wraps responses in the
  old `.standard-markdown` / `.font-claude-response` classes (only the user bubble
  has a stable `data-testid`). The DOM layer is now **class-agnostic**: it applies
  `unicode-bidi: plaintext` to prose leaf tags document-wide (safe — direction is
  content-driven, so English stays LTR) and processes blocks document-wide.

### Added
- Interactive install/restore now asks for explicit confirmation ("Claude will
  close") before touching anything.
- `npm test` runs cross-platform via `node --test` auto-discovery.

### Changed
- Clearer single-window install guidance (UAC cannot elevate a window in place;
  the true single-window path is starting an elevated shell).

## [0.1.0] — 2026-07-04

### Added
- **Pure, DOM-free bidi engine** (`engine/`): script ranges, EN/AN digit and
  signed-run detection, first-strong + majority direction, LaTeX-vs-currency math
  segmentation, mirrored arrows and relations, code-vs-prose detection. Every
  input is validated (never throws) and every scan is bounded (no O(n²) path).
- **DOM runtime** (`dom/`): declarative `unicode-bidi: plaintext` core, streaming-
  settle observer, composer input guards, two-layer tables, inline island wrapping.
- **Windows patcher** (`windows/`): byte-exact injector that spares the main entry
  and preserves native modules; ASAR integrity handled by turning the Electron
  fuse **off** (encoding-agnostic); validated atomic backups with automatic
  rollback; MSIX + Squirrel auto-detect; `-Status` / `-Verify` / `-Preflight`.
- **Browser userscript** built from the same engine (`dist/claude-rtl.user.js`).

[Unreleased]: https://github.com/eliranpv11/claude-desktop-rtl/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/eliranpv11/claude-desktop-rtl/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/eliranpv11/claude-desktop-rtl/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/eliranpv11/claude-desktop-rtl/releases/tag/v0.1.0
