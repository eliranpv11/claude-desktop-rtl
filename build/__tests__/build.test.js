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

// ---------------------------------------------------------------------------
// Regression: assistant messages in current Claude Desktop are NOT wrapped in
// any stable message-root class (only the user bubble has a testid). The DOM
// layer must therefore process block leaves document-wide. This functional
// stub-DOM proves a Hebrew <p> with NO ancestor class still gets processed.
// ---------------------------------------------------------------------------
function tagOf(el) {
  return el.tagName;
}
function selMatchesTag(sel, tag) {
  return sel
    .split(',')
    .map((s) => s.trim())
    .some((s) => /^[a-z0-9]+$/i.test(s) && s.toLowerCase() === tag.toLowerCase());
}
function makeEl(tag, text, children) {
  const el = {
    nodeType: 1,
    tagName: tag.toUpperCase(),
    _attrs: {},
    childNodes: [],
    parentNode: null,
    style: {},
    id: '',
    _text: typeof text === 'string' ? text : null,
    get textContent() {
      if (this._text != null) return this._text;
      return this.childNodes.map((c) => (c.nodeType === 3 ? c.nodeValue : c.textContent)).join('');
    },
    set textContent(v) {
      this._text = v;
      this.childNodes = [];
    },
    setAttribute(k, v) { this._attrs[k] = String(v); },
    getAttribute(k) { return k in this._attrs ? this._attrs[k] : null; },
    hasAttribute(k) { return k in this._attrs; },
    removeAttribute(k) { delete this._attrs[k]; },
    matches(sel) { return selMatchesTag(sel, this.tagName); },
    closest(sel) {
      let n = this;
      while (n) {
        if (n.matches && n.matches(sel)) return n;
        n = n.parentNode;
      }
      return null;
    },
    querySelector() { return null; },
    querySelectorAll(sel) {
      const out = [];
      const walk = (node) => {
        for (const c of node.childNodes) {
          if (c.nodeType === 1) {
            if (selMatchesTag(sel, c.tagName)) out.push(c);
            walk(c);
          }
        }
      };
      walk(this);
      return out;
    },
    appendChild(c) { c.parentNode = this; this.childNodes.push(c); return c; },
    replaceChild(nw, old) {
      const i = this.childNodes.indexOf(old);
      if (i >= 0) { this.childNodes[i] = nw; nw.parentNode = this; }
      return old;
    },
  };
  for (const c of children || []) el.appendChild(c);
  return el;
}
function makeText(value) {
  return { nodeType: 3, nodeValue: value, parentNode: null };
}

test('assistant-style Hebrew <p> with NO message-root class is processed (class-agnostic)', () => {
  const payload = buildPayload();

  // A DOM that mimics Claude's real markup: a plain <div><p>Hebrew…</p></div>
  // with NONE of the old .standard-markdown / .font-claude-response classes.
  const para = makeEl('p', null, [makeText('שלום עולם, זה טקסט בעברית')]);
  const body = makeEl('body', null, [makeEl('div', null, [para])]);

  const de = {
    _attrs: {},
    setAttribute(k, v) { this._attrs[k] = String(v); },
    getAttribute(k) { return k in this._attrs ? this._attrs[k] : null; },
    hasAttribute(k) { return k in this._attrs; },
    appendChild() {},
  };
  const doc = {
    documentElement: de,
    head: { appendChild() {} },
    body,
    readyState: 'complete',
    adoptedStyleSheets: undefined,
    addEventListener() {},
    querySelectorAll(sel) { return body.querySelectorAll(sel); },
    querySelector() { return null; },
    getElementById() { return null; },
    createElement() { return makeEl('span'); },
    createTreeWalker(root) {
      const texts = [];
      const walk = (n) => {
        for (const c of n.childNodes) {
          if (c.nodeType === 3) texts.push(c);
          else walk(c);
        }
      };
      walk(root);
      let i = 0;
      return { nextNode() { return i < texts.length ? texts[i++] : null; } };
    },
    createDocumentFragment() { return makeEl('frag'); },
    createTextNode(v) { return makeText(v); },
  };
  const win = {};
  win.self = win;
  win.top = win;
  class MO { observe() {} disconnect() {} }
  const sandbox = {
    document: doc,
    window: win,
    navigator: { language: 'en-US', languages: ['en-US'] },
    MutationObserver: MO,
    NodeFilter: { SHOW_TEXT: 4 },
    Set,
    setTimeout() {},
    requestAnimationFrame() {},
    console,
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(payload, sandbox);

  // The class-less paragraph must have been reached by the leaf-inline pass —
  // proof the layer no longer depends on a message-root class.
  assert.ok(para.hasAttribute('data-rtl-inl'), 'class-less Hebrew <p> was processed document-wide');
});
