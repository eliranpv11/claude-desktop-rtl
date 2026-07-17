// ---------------------------------------------------------------------------
// inject.mjs — byte-exact RTL payload injector for an extracted Claude app.asar
//
// Usage:  node inject.mjs <extractedRoot> <payloadFile>
//
// Responsibilities (why a dedicated Node injector beats an inline PowerShell loop):
//   * Prepend the RTL payload to every RENDERER bundle under .vite/build, but
//     NOT to the main-process entry (package.json "main") — the DOM payload in
//     the main process causes a black-screen launch. The main entry gets ONLY a
//     tiny force-ui-direction=ltr switch so RTL OS locales don't flip the chrome.
//   * Idempotent: files already carrying the payload marker are skipped.
//   * Fails LOUD on any layout surprise (missing .vite/build, missing main), so
//     a Claude restructure can never silently produce a half-patched app.
//   * Byte-exact writes (UTF-8, no BOM) via Buffer.concat — no re-encoding.
// ---------------------------------------------------------------------------

import fs from 'node:fs';
import path from 'node:path';

const MARKER = 'claude-rtl-payload';
const MAIN_SWITCH =
  ";(function(){try{var e=require('electron');e&&e.app&&e.app.commandLine&&" +
  "e.app.commandLine.appendSwitch('force-ui-direction','ltr');}catch(_){}})();\n";

// The sidebar "Claude Design" surface is a bare BrowserWindow that loads a REMOTE
// claude.ai page with NO preload, so none of our renderer bundles run in it -> no
// RTL there. We give that one window OUR preload (= the RTL payload) so its chat
// flips. It is main-frame-only (no nodeIntegrationInSubFrames), so the cross-origin
// design-canvas artwork iframe is left untouched -- exactly "chat, not the canvas".
const DESIGN_PRELOAD_FILE = 'rtlDesignPreload.js';
// Robust locator: the STABLE string literal in the Design-window builder (never a
// minified identifier, which rotates every build). The window's webPreferences sits
// just before it.
const DESIGN_MARKER = 'setDesignWindowNavigationHandlers';
const DESIGN_WEBPREFS = 'webPreferences:{sandbox:!0,contextIsolation:!0,nodeIntegration:!1}';
const DESIGN_PRELOAD_INSERT =
  ',preload:require("path").join(require("electron").app.getAppPath(),".vite/build/' +
  DESIGN_PRELOAD_FILE + '")';

function die(msg) {
  process.stderr.write('inject.mjs: ' + msg + '\n');
  process.exit(2);
}

function listJs(dir) {
  const out = [];
  const walk = (d) => {
    for (const name of fs.readdirSync(d)) {
      const p = path.join(d, name);
      const st = fs.statSync(p);
      if (st.isDirectory()) walk(p);
      else if (name.endsWith('.js')) out.push(p);
    }
  };
  walk(dir);
  return out;
}

// Second pass: inject OUR preload into the sidebar Claude Design window.
// FAIL-SOFT by contract (the deliberate opposite of the .vite/build fail-loud rule):
// a missed anchor on a future Claude build degrades to "no RTL in the Design window"
// and NEVER blocks or breaks the main RTL install.
function patchDesignWindow(buildDir, payload) {
  for (const file of listJs(buildDir)) {
    let src = fs.readFileSync(file, 'utf8');
    const marker = src.indexOf(DESIGN_MARKER);
    if (marker < 0) continue;                       // not the Design chunk
    if (src.indexOf('.vite/build/' + DESIGN_PRELOAD_FILE) >= 0) return 1;  // already done (idempotent)
    // The Design window's webPreferences is the LAST one just before the marker.
    const wp = src.lastIndexOf(DESIGN_WEBPREFS, marker);
    if (wp < 0 || marker - wp > 800) {
      process.stderr.write('inject.mjs: Design webPreferences not found near marker; Design RTL skipped (fail-soft).\n');
      return 0;
    }
    const patched = src.slice(0, wp) +
      DESIGN_WEBPREFS.slice(0, -1) + DESIGN_PRELOAD_INSERT + '}' +
      src.slice(wp + DESIGN_WEBPREFS.length);
    fs.writeFileSync(file, patched);
    fs.writeFileSync(path.join(buildDir, DESIGN_PRELOAD_FILE), payload);  // ship the preload
    return 1;
  }
  process.stderr.write('inject.mjs: Claude Design window marker not found; Design RTL skipped (fail-soft).\n');
  return 0;
}

function main() {
  const [root, payloadFile] = process.argv.slice(2);
  if (!root || !payloadFile) die('usage: node inject.mjs <extractedRoot> <payloadFile>');
  if (!fs.existsSync(root)) die('extracted root not found: ' + root);
  if (!fs.existsSync(payloadFile)) die('payload not found: ' + payloadFile);

  const payload = fs.readFileSync(payloadFile); // Buffer, byte-exact
  const newline = Buffer.from('\n', 'utf8');

  // Resolve the main-process entry from package.json so we never inject the full
  // payload into it.
  const pkgPath = path.join(root, 'package.json');
  let mainRel = null;
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      if (pkg && typeof pkg.main === 'string') mainRel = pkg.main;
    } catch (e) {
      /* fall through — treated as no main */
    }
  }
  const mainAbs = mainRel ? path.resolve(root, mainRel) : null;

  const buildDir = path.join(root, '.vite', 'build');
  if (!fs.existsSync(buildDir)) {
    die('.vite/build not found under ' + root + ' — Claude layout changed; aborting.');
  }

  const files = listJs(buildDir);
  if (files.length === 0) die('no .js files under .vite/build — aborting.');

  let injected = 0;
  let mainPatched = 0;
  let skipped = 0;

  for (const file of files) {
    const original = fs.readFileSync(file);
    const head = original.slice(0, Math.min(original.length, 4096)).toString('utf8');
    const isMain = mainAbs && path.resolve(file) === mainAbs;

    if (isMain) {
      if (head.includes(MARKER) || head.includes('force-ui-direction')) {
        skipped++;
        continue;
      }
      fs.writeFileSync(file, Buffer.concat([Buffer.from(MAIN_SWITCH, 'utf8'), original]));
      mainPatched++;
      continue;
    }

    if (head.includes(MARKER)) {
      skipped++;
      continue;
    }
    fs.writeFileSync(file, Buffer.concat([payload, newline, original]));
    injected++;
  }

  if (injected === 0 && mainPatched === 0 && skipped === 0) {
    die('nothing was processed — aborting.');
  }

  // Second, fail-soft pass: give the sidebar Design window our preload.
  const designPreload = patchDesignWindow(buildDir, payload);

  process.stdout.write(
    'inject.mjs: renderer=' + injected + ' main=' + mainPatched +
    ' skipped=' + skipped + ' design=' + designPreload + '\n'
  );
  process.exit(0);
}

main();
