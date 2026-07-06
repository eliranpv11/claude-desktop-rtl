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
// Match an element against a selector list supporting bare tags ("div, p"),
// classes (".elicit"), and tag.class ("form.elicit") — enough for the surfaces.
function elMatchesSel(el, sel) {
  const classes = (el._attrs && el._attrs.class) ? el._attrs.class.split(/\s+/) : [];
  return sel
    .split(',')
    .map((s) => s.trim())
    .some((tok) => {
      const m = tok.match(/^([a-z0-9]+)?(?:\.([a-z0-9_-]+))?$/i);
      if (!m || (!m[1] && !m[2])) return false;
      if (m[1] && m[1].toLowerCase() !== el.tagName.toLowerCase()) return false;
      if (m[2] && classes.indexOf(m[2]) === -1) return false;
      return true;
    });
}
function makeEl(tag, text, children, cls) {
  const el = {
    nodeType: 1,
    tagName: tag.toUpperCase(),
    _attrs: cls ? { class: cls } : {},
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
    matches(sel) { return elMatchesSel(this, sel); },
    closest(sel) {
      let n = this;
      while (n) {
        if (n.matches && n.matches(sel)) return n;
        n = n.parentNode;
      }
      return null;
    },
    querySelector(sel) { return this.querySelectorAll(sel)[0] || null; },
    querySelectorAll(sel) {
      const out = [];
      const walk = (node) => {
        for (const c of node.childNodes) {
          if (c.nodeType === 1) {
            if (elMatchesSel(c, sel)) out.push(c);
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

  // A DOM that mimics Claude's real markup: a plain <div>…</div> with NONE of the
  // old .standard-markdown / .font-claude-response classes, holding a Hebrew
  // paragraph and a Hebrew blockquote (a structural dir-block).
  const para = makeEl('p', null, [makeText('שלום עולם, זה טקסט בעברית')]);
  const quote = makeEl('blockquote', null, [makeEl('p', null, [makeText('ציטוט בעברית')])]);
  const body = makeEl('body', null, [makeEl('div', null, [para, quote])]);

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
  // The Hebrew blockquote must be marked RTL by the structural dir-block pass so
  // CSS/JS can move its bar and padding to the right (box flip itself needs a
  // real browser's getComputedStyle; here we assert the direction decision).
  assert.equal(quote.getAttribute('dir'), 'rtl', 'Hebrew blockquote marked dir=rtl');
});

test('global RTL: class-less sidebar containers (div/span/button) are tagged by content', () => {
  const payload = buildPayload();

  // A sidebar OUTSIDE any message prose: Hebrew + English leaves, plus a
  // non-leaf wrapper that has element children (must NOT be tagged).
  const heTitle = makeEl('div', null, [makeText('שיחה על עברית')]); // leaf, RTL -> tag
  const enTitle = makeEl('div', null, [makeText('New chat')]); // leaf, LTR -> no tag
  const heBtn = makeEl('button', null, [makeText('צ׳אט חדש')]); // leaf, RTL -> tag
  const sidebar = makeEl('div', null, [heTitle, enTitle, heBtn]); // has div children -> NOT leaf
  const body = makeEl('body', null, [sidebar]);

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
      const walk = (n) => { for (const c of n.childNodes) { if (c.nodeType === 3) texts.push(c); else walk(c); } };
      walk(root);
      let i = 0;
      return { nextNode() { return i < texts.length ? texts[i++] : null; } };
    },
    createDocumentFragment() { return makeEl('frag'); },
    createTextNode(v) { return makeText(v); },
  };
  const win = {}; win.self = win; win.top = win;
  class MO { observe() {} disconnect() {} }
  const sandbox = {
    document: doc, window: win,
    navigator: { language: 'en-US', languages: ['en-US'] },
    MutationObserver: MO, NodeFilter: { SHOW_TEXT: 4 },
    Set, setTimeout() {}, requestAnimationFrame() {}, console,
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(payload, sandbox);

  assert.ok(heTitle.hasAttribute('data-rtl-c'), 'Hebrew sidebar title tagged for RTL');
  assert.ok(heBtn.hasAttribute('data-rtl-c'), 'Hebrew sidebar button tagged for RTL');
  assert.ok(!enTitle.hasAttribute('data-rtl-c'), 'English sidebar title left untagged (stays LTR)');
  assert.ok(!sidebar.hasAttribute('data-rtl-c'), 'non-leaf wrapper (has block children) not tagged');
});

test('ask/elicit widget: Hebrew question box gets dir=rtl, English stays LTR', () => {
  const payload = buildPayload();

  const heQ = makeEl('div', 'לאיזה כיוון לפנות?', null, 'elicit-question');
  const heForm = makeEl('form', null, [heQ], 'elicit');
  const enQ = makeEl('div', 'Which direction?', null, 'elicit-question');
  const enForm = makeEl('form', null, [enQ], 'elicit');
  const body = makeEl('body', null, [heForm, enForm]);

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
      const walk = (n) => { for (const c of n.childNodes) { if (c.nodeType === 3) texts.push(c); else walk(c); } };
      walk(root);
      let i = 0;
      return { nextNode() { return i < texts.length ? texts[i++] : null; } };
    },
    createDocumentFragment() { return makeEl('frag'); },
    createTextNode(v) { return makeText(v); },
  };
  const win = {}; win.self = win; win.top = win;
  class MO { observe() {} disconnect() {} }
  const sandbox = {
    document: doc, window: win,
    navigator: { language: 'en-US', languages: ['en-US'] },
    MutationObserver: MO, NodeFilter: { SHOW_TEXT: 4 },
    Set, setTimeout() {}, requestAnimationFrame() {}, console,
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(payload, sandbox);

  assert.equal(heForm.getAttribute('dir'), 'rtl', 'Hebrew elicit form mirrored (dir=rtl)');
  assert.ok(!enForm.getAttribute('dir'), 'English elicit form stays LTR (no dir set)');
});
