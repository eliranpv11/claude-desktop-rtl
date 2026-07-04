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
  // Rendered assistant/user message roots (redundant on purpose).
  messageRoot:
    '.standard-markdown, .font-claude-response, .font-claude-message, [data-testid="user-message"], .prose',

  // Leaf blocks whose base direction the browser decides via unicode-bidi:plaintext.
  leafBlock:
    'p, li, h1, h2, h3, h4, h5, h6, blockquote, dt, dd, figcaption, caption, td, th',

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
