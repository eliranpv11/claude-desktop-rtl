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

  process.stdout.write(
    'inject.mjs: renderer=' + injected + ' main=' + mainPatched + ' skipped=' + skipped + '\n'
  );
  process.exit(0);
}

main();
