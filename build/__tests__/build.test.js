'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { buildPayload, buildUserscript, assertParses, MARKER } = require('../build-payload.js');

test('payload builds and parses as valid JS', () => {
  const payload = buildPayload();
  assert.ok(payload.length > 4000, 'payload should be substantial');
  assert.ok(payload.includes(MARKER), 'payload carries the idempotency marker');
  assert.doesNotThrow(() => assertParses(payload));
});

test('payload inlines the CSS and the engine', () => {
  const payload = buildPayload();
  assert.ok(payload.includes('unicode-bidi: plaintext'), 'CSS inlined');
  assert.ok(payload.includes('detectBlockDir'), 'engine inlined');
  assert.ok(!payload.includes('__APPLY_CSS__'), 'CSS placeholder replaced');
  assert.ok(!payload.includes('__PAYLOAD_VERSION__'), 'version placeholder replaced');
});

test('userscript wrapper has a valid metadata block', () => {
  const us = buildUserscript(buildPayload());
  assert.ok(us.includes('// ==UserScript=='));
  assert.ok(us.includes('@match        https://*.claude.ai/*'));
});

// A minimal DOM stub: enough for init() to run end-to-end as a no-op and prove
// the whole bundle boots without throwing in a browser-like environment.
function makeDomSandbox() {
  const de = {
    _attrs: {},
    setAttribute(k, v) {
      this._attrs[k] = v;
    },
    getAttribute(k) {
      return k in this._attrs ? this._attrs[k] : null;
    },
    hasAttribute(k) {
      return k in this._attrs;
    },
    appendChild() {},
  };
  const doc = {
    documentElement: de,
    head: { appendChild() {} },
    body: {},
    readyState: 'complete',
    adoptedStyleSheets: undefined,
    addEventListener() {},
    querySelectorAll() {
      return [];
    },
    querySelector() {
      return null;
    },
    getElementById() {
      return null;
    },
    createElement() {
      return { id: '', style: {}, textContent: '', setAttribute() {}, appendChild() {} };
    },
    createTreeWalker() {
      return { nextNode() { return null; } };
    },
    createDocumentFragment() {
      return { appendChild() {} };
    },
    createTextNode() {
      return {};
    },
  };
  const win = {};
  win.self = win;
  win.top = win;
  class MO {
    observe() {}
    disconnect() {}
  }
  const sandbox = {
    document: doc,
    window: win,
    navigator: { language: 'en-US', languages: ['en-US'] },
    MutationObserver: MO,
    NodeFilter: { SHOW_TEXT: 4 },
    Set,
    setTimeout() {},
    console,
  };
  sandbox.globalThis = sandbox;
  return { sandbox, de };
}

test('payload boots on a stub DOM and stamps the success marker', () => {
  const payload = buildPayload();
  const { sandbox, de } = makeDomSandbox();
  vm.createContext(sandbox);
  assert.doesNotThrow(() => vm.runInContext(payload, sandbox));
  assert.ok(de.getAttribute('data-claude-rtl'), 'sets data-claude-rtl on documentElement');
});

test('payload is a silent no-op with no document (main-process safety)', () => {
  const payload = buildPayload();
  const sandbox = { console };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  assert.doesNotThrow(() => vm.runInContext(payload, sandbox));
});
