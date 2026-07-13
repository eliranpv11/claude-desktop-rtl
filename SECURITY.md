# Security Policy

## What this tool does to your system — read this first

Adding RTL support means modifying a **digitally signed** Electron application, so
this project deliberately performs operations that are otherwise security-sensitive.
On a Microsoft-Store (MSIX) install it will:

1. **Inject JavaScript** into Claude Desktop's renderer bundles inside `app.asar`.
2. **Turn the Electron ASAR-integrity fuse off** so the modified bundle loads
   (encoding-agnostic, and reversible).
3. Where `cowork-svc.exe` verifies `claude.exe`, **replace Anthropic's embedded
   code-signing certificate with a locally generated self-signed certificate**,
   add that certificate to the **Windows Trusted Root store**, and **re-sign** both
   binaries so the service still trusts the app.

### Trust implications you are accepting

- A self-signed certificate in your Trusted Root store is trusted machine-wide.
  This project generates it locally, uses it only to sign these two binaries, and
  **wipes the private key** immediately (only the public certificate is retained
  for verification). Even so, adding any root certificate widens your trust base.
- **Exactly one** such certificate ever exists at a time. Every install/update
  **purges all prior Claude RTL certificates — and their private-key containers —
  before minting the new one**, so re-installs never accumulate fake
  "Anthropic, PBC" certs in your trust store. (Earlier versions did not purge on a
  successful install; if you patched with one of those, run
  `windows\patch.ps1 -CleanCerts` once to remove the leftovers.)
- These changes are **not authorized by Anthropic** and may violate their Terms of
  Service. Use at your own risk.
- The patch is undone by `windows\patch.ps1 -Restore`, which restores the validated
  original backups and removes the certificate (and its private key) from the store.
  `windows\patch.ps1 -CleanCerts` removes just the certificates; `-Status` shows how
  many are currently present (should be 1 when patched, 0 when restored).

### Safety measures built in

- Originals are backed up with a **validated, atomic copy** before anything changes;
  a corrupt backup is refused rather than used.
- Any failure during patching triggers an **automatic rollback** to the originals.
- **No network calls and no telemetry** at runtime. Your text never leaves the
  machine; copy and Ctrl-F stay byte-for-byte (no invisible Unicode is injected).
- The install downloads **only** from this repository — nothing is fetched from any
  third-party source.

## Supply-chain guidance

`irm https://…/install.ps1 | iex` runs code from this repository with your
privileges. Only run it if you trust this repository at that moment. If you prefer,
clone the repo, read `install.ps1` and `windows/patch.ps1`, and run the patcher
from your local copy.

## Supported versions

Only the latest released version receives fixes. Older versions are superseded by
each Claude Desktop update anyway (an update reverts the patch until re-applied).

| Version | Supported |
| ------- | --------- |
| latest `0.x` | ✅ |
| older | ❌ |

## Reporting a vulnerability

If you find a security issue in this project (for example, a way the injector or
patcher could be abused, or a flaw in the certificate handling), please **do not
open a public issue**. Instead, open a
[private security advisory](https://github.com/eliranpv11/claude-desktop-rtl/security/advisories/new)
on this repository. You can expect an initial response within a reasonable time,
and coordinated disclosure once a fix is available.
