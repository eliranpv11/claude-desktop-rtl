'use strict';

// ---------------------------------------------------------------------------
// surfaces.js — the single source of truth for Claude's DOM selectors
//
// Everything the DOM layer touches is named here, so when Claude changes its
// markup only this file needs updating (see docs runbook). Selectors are kept
// deliberately BROAD and REDUNDANT: if one class disappears, the others keep the
// fix alive without a code change. This module is inlined into the payload; at
// runtime SELECTORS is just an in-scope constant.
// ---------------------------------------------------------------------------

const SELECTORS = {
  // The only DOM-stable message anchor in current Claude Desktop is the user
  // bubble's testid; assistant responses have no stable class/testid, so the DOM
  // layer no longer scopes work to a message root — it processes block leaves
  // document-wide (guarded), and this selector is kept only for the diagnostic
  // hook and the input-locality climb.
  messageRoot: '[data-testid="user-message"]',

  // Block-level containers, used to climb from a mutated node to the smallest
  // enclosing block so streaming re-processing stays local and cheap.
  block:
    'p, li, h1, h2, h3, h4, h5, h6, blockquote, dt, dd, figcaption, caption, td, th, ul, ol, table, pre',

  // Leaf blocks whose base direction the browser decides via unicode-bidi:plaintext.
  leafBlock:
    'p, li, h1, h2, h3, h4, h5, h6, blockquote, dt, dd, figcaption, caption, td, th',

  // Generic text containers OUTSIDE markdown prose — sidebar chat titles, menu
  // items, buttons, tab labels, dialogs. These carry the app's Hebrew that the
  // prose pass never sees, which is why RTL used to stop at the chat bubble.
  container: 'div, span, button, a, label, summary',

  // If a container has any of these as a descendant it is NOT a text leaf; its
  // own leaves get processed individually instead (prevents flipping a whole
  // layout region off one stray RTL string).
  containerHasBlock:
    'div, p, ul, ol, h1, h2, h3, h4, h5, h6, pre, table, section, article, header, footer, nav, main, form, textarea, input',

  // Prose blocks eligible for the JS plaintext-override (Latin-opener Hebrew).
  proseDir: 'p, h1, h2, h3, h4, h5, h6, li, blockquote',

  // Direction-decorated blocks (marker/indent side follows content).
  dirBlock: 'ul, ol, li, blockquote',

  // Composer + in-place edit box. We only ever set dir="auto" on these and NEVER
  // mutate their contents (ProseMirror manages its own DOM; wrapping freezes typing).
  composer: '[contenteditable="true"], [contenteditable=""], .ProseMirror',
  editBox: 'textarea',

  // Any editable host — a hard no-mutate boundary for content passes.
  editableHost:
    '[contenteditable="true"], [contenteditable=""], [contenteditable="plaintext-only"], .ProseMirror, textarea',

  // Code (kept LTR + isolated) and rendered math (kept LTR + isolated).
  code: 'pre, code, .code-block__code',
  math: '.katex, .katex-display, mjx-container, .MathJax, math',

  // Tables.
  table: 'table',
  cell: 'td, th',

  // The "ask" / elicitation widget (multiple-choice question boxes). Claude
  // renders these as <form class="elicit"> with .elicit-question / .elicit-pills
  // / .elicit-footer children. Unlike generic chrome, this is a self-contained
  // structured region where FULL layout mirroring (dir=rtl) is the correct RTL
  // behaviour: choice pills should flow from the right and the submit/skip row
  // should mirror. Scoped to just the widget, so blast radius is tiny.
  elicit: 'form.elicit, .elicit',
  elicitQuestion: '.elicit-question, .elicit-header',

  // Zones we must never inject markup into (would break the app or fidelity).
  noInject:
    'style, script, textarea, [contenteditable="true"], [contenteditable=""], [contenteditable="plaintext-only"], .ProseMirror',
};

// True if the node is inside an editable host (composer / edit box).
function inEditable(el) {
  return !!(el && el.closest && el.closest(SELECTORS.editableHost));
}

// True if the node is inside a zone we must not inject into.
function inNoInject(el) {
  return !!(el && el.closest && el.closest(SELECTORS.noInject));
}

// True if the node sits inside an already-LTR-isolated island (rendered math or
// real code, or a relation span we created). Arrows/relations skip these.
function inLtrIsland(el) {
  if (!el || !el.closest) return false;
  if (el.closest('[data-rtl-relation]')) return true;
  const island = el.closest(SELECTORS.math + ', ' + SELECTORS.code);
  if (!island) return false;
  // A fence that is really Hebrew prose (data-rtl-text) is NOT an LTR island.
  if (island.closest && island.closest('pre[data-rtl-text]')) return false;
  return true;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { SELECTORS, inEditable, inNoInject, inLtrIsland };
}
