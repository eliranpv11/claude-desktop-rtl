'use strict';

// ---------------------------------------------------------------------------
// apply.js — the DOM runtime. Thin: it does only what CSS cannot decide.
//
// This file is INLINED into the payload IIFE by build/build-payload.js, in the
// same scope as the engine functions (detectBlockDir, arrowFlipOffsets, …) and
// the surfaces helpers (SELECTORS, inEditable, …). The build inlines apply.css
// into the APPLY_CSS constant below.
//
// Everything here is guarded so it is safe to prepend to any renderer bundle,
// including non-DOM (main-process) contexts, where it must be a silent no-op.
// ---------------------------------------------------------------------------

var engine = require('../engine/index.js');
var surfaces = require('./surfaces.js');

var detectBlockDir = engine.detectBlockDir;
var resolvedDir = engine.resolvedDir;
var plaintextOverrideDir = engine.plaintextOverrideDir;
var majority = engine.majority;
var arrowFlipOffsets = engine.arrowFlipOffsets;
var relationRuns = engine.relationRuns;
var signedNumberRuns = engine.signedNumberRuns;
var codeBlockIsProse = engine.codeBlockIsProse;

var SELECTORS = surfaces.SELECTORS;
var inEditable = surfaces.inEditable;
var inNoInject = surfaces.inNoInject;
var inLtrIsland = surfaces.inLtrIsland;

(function initApplyLayer() {
  if (typeof document === 'undefined' || !document) return; // non-DOM context: no-op

  var APPLY_CSS = '__APPLY_CSS__';
  var STYLE_ID = 'claude-rtl-style';
  var DONE = 'data-rtl-done';
  var ODIR = 'data-rtl-odir'; // marks a dir WE set on a prose block
  var TDIR = 'data-rtl-tdir'; // marks a dir WE set on a table
  var SETTLE_MS = 200;
  var MAX_NODES_PER_PASS = 400;

  function fp(text) {
    // Cheap, decision-relevant fingerprint: only the length can change a decision
    // during streaming (more text arrived). Avoids hashing on every mutation.
    return String((text || '').length);
  }

  // ---- CSS injection (survives React clearing a <style> node) --------------
  function injectCss() {
    try {
      if (
        document.adoptedStyleSheets &&
        typeof CSSStyleSheet === 'function' &&
        'replaceSync' in CSSStyleSheet.prototype
      ) {
        for (var i = 0; i < document.adoptedStyleSheets.length; i++) {
          if (document.adoptedStyleSheets[i].__claudeRtl) return;
        }
        var sheet = new CSSStyleSheet();
        sheet.replaceSync(APPLY_CSS);
        sheet.__claudeRtl = true;
        document.adoptedStyleSheets = document.adoptedStyleSheets.concat(sheet);
        return;
      }
    } catch (e) {
      /* fall through to <style> */
    }
    if (document.getElementById(STYLE_ID)) return;
    var el = document.createElement('style');
    el.id = STYLE_ID;
    el.textContent = APPLY_CSS;
    (document.head || document.documentElement).appendChild(el);
  }

  // ---- Inputs: dir="auto" only, never mutate contents ----------------------
  function setInputDir(el) {
    if (el && el.getAttribute && el.getAttribute('dir') !== 'auto') {
      el.setAttribute('dir', 'auto');
    }
  }
  function sweepInputs(root) {
    var scope = root && root.querySelectorAll ? root : document;
    try {
      var list = scope.querySelectorAll(SELECTORS.composer + ',' + SELECTORS.editBox);
      for (var i = 0; i < list.length; i++) setInputDir(list[i]);
      if (root && root.matches && root.matches(SELECTORS.composer + ',' + SELECTORS.editBox)) {
        setInputDir(root);
      }
    } catch (e) {
      /* ignore */
    }
  }

  // ---- Code fences: tag Hebrew-prose fences so CSS reads them per-line ------
  function processCodeBlock(pre) {
    if (!pre || inEditable(pre)) return false;
    var t = pre.textContent || '';
    if (pre.getAttribute(DONE) === fp(t)) return false;
    if (codeBlockIsProse(t)) pre.setAttribute('data-rtl-text', '');
    else pre.removeAttribute('data-rtl-text');
    pre.setAttribute(DONE, fp(t));
    return true;
  }

  // ---- Tables: majority column-order + per-column alignment + cell override -
  function tableCells(table) {
    var rows = table.rows ? table.rows : [];
    var grid = [];
    for (var r = 0; r < rows.length; r++) {
      var cells = rows[r].cells;
      var row = [];
      for (var c = 0; c < cells.length; c++) row.push(cells[c]);
      grid.push(row);
    }
    return grid;
  }
  function processTable(table) {
    if (!table || inEditable(table)) return false;
    var t = table.textContent || '';
    if (table.getAttribute(DONE) === fp(t)) return false;

    var grid = tableCells(table);
    var all = '';
    var cols = [];
    for (var r = 0; r < grid.length; r++) {
      for (var c = 0; c < grid[r].length; c++) {
        var ct = grid[r][c].textContent || '';
        all += ct + '\n';
        cols[c] = (cols[c] || '') + ct + '\n';
      }
    }

    // Layer 1: table column ORDER follows the majority direction of all cells.
    var td = majority(all);
    if (td === 'rtl') {
      table.setAttribute('dir', 'rtl');
      table.setAttribute(TDIR, '1');
    } else if (table.getAttribute(TDIR) === '1') {
      table.removeAttribute('dir');
      table.removeAttribute(TDIR);
    }

    // Layer 2b: per-column ALIGNMENT follows each column's own majority.
    for (var cc = 0; cc < cols.length; cc++) {
      var cdir = majority(cols[cc] || '');
      for (var rr = 0; rr < grid.length; rr++) {
        var cell = grid[rr][cc];
        if (!cell) continue;
        if (cdir === 'rtl' || cdir === 'ltr') cell.setAttribute('data-rtl-col', cdir);
        else if (cell.getAttribute('data-rtl-col')) cell.removeAttribute('data-rtl-col');
        // Layer 2a override: a Latin-opener majority-RTL cell needs an explicit dir.
        if (plaintextOverrideDir(cell.textContent || '') === 'rtl') {
          cell.setAttribute('dir', 'rtl');
        } else if (cell.getAttribute('dir') === 'rtl' && !cell.hasAttribute('data-author-dir')) {
          // only clear a dir we would have set (never an author's) — cells aren't
          // author-dir'd in practice, but guard anyway.
          if (resolvedDir(cell.textContent || '') !== 'rtl') cell.removeAttribute('dir');
        }
      }
    }
    table.setAttribute(DONE, fp(t));
    return true;
  }

  // ---- Prose override: the one place JS stamps dir on a paragraph -----------
  function processProse(block) {
    if (!block || inEditable(block)) return false;
    var t = block.textContent || '';
    if (plaintextOverrideDir(t) === 'rtl') {
      block.setAttribute('dir', 'rtl');
      block.setAttribute(ODIR, '1');
    } else if (block.getAttribute(ODIR) === '1') {
      block.removeAttribute('dir');
      block.removeAttribute(ODIR);
    }
    return true;
  }

  // ---- Inline islands: wrap arrows / relations / signed numbers -------------
  function makeSpan(kind, text) {
    var span = document.createElement('span');
    if (kind === 'arrow') span.setAttribute('data-rtl-arrow', '');
    else if (kind === 'relation') span.setAttribute('data-rtl-relation', '');
    else span.setAttribute('data-rtl-num', '');
    span.textContent = text;
    return span;
  }
  // Resolve overlaps: relation > arrow > num; keep sorted, non-overlapping.
  function resolveWraps(list) {
    list.sort(function (a, b) {
      return a.start - b.start || b.priority - a.priority;
    });
    var out = [];
    var lastEnd = -1;
    for (var i = 0; i < list.length; i++) {
      if (list[i].start >= lastEnd) {
        out.push(list[i]);
        lastEnd = list[i].end;
      }
    }
    return out;
  }
  function wrapTextNode(node, isRtl) {
    if (!node || !node.nodeValue) return false;
    var parent = node.parentNode;
    if (!parent) return false;
    if (inEditable(parent) || inNoInject(parent) || inLtrIsland(parent)) return false;
    if (parent.hasAttribute && (parent.hasAttribute('data-rtl-arrow') ||
        parent.hasAttribute('data-rtl-relation') || parent.hasAttribute('data-rtl-num'))) {
      return false;
    }
    var text = node.nodeValue;
    var wraps = [];
    var i, rr;
    // Relations are direction-independent (browser mirrors them in RTL levels).
    rr = relationRuns(text);
    for (i = 0; i < rr.length; i++) wraps.push({ start: rr[i].start, end: rr[i].end, kind: 'relation', priority: 3 });
    if (isRtl) {
      rr = arrowFlipOffsets(text);
      for (i = 0; i < rr.length; i++) wraps.push({ start: rr[i].start, end: rr[i].end, kind: 'arrow', priority: 2 });
      rr = signedNumberRuns(text);
      for (i = 0; i < rr.length; i++) wraps.push({ start: rr[i].start, end: rr[i].end, kind: 'num', priority: 1 });
    }
    if (wraps.length === 0) return false;
    wraps = resolveWraps(wraps);

    var frag = document.createDocumentFragment();
    var cursor = 0;
    for (i = 0; i < wraps.length; i++) {
      var w = wraps[i];
      if (w.start > cursor) frag.appendChild(document.createTextNode(text.slice(cursor, w.start)));
      frag.appendChild(makeSpan(w.kind, text.slice(w.start, w.end)));
      cursor = w.end;
    }
    if (cursor < text.length) frag.appendChild(document.createTextNode(text.slice(cursor)));
    parent.replaceChild(frag, node);
    return true;
  }
  function processLeafInlines(block) {
    if (!block || inEditable(block) || inNoInject(block)) return false;
    var t = block.textContent || '';
    var stampNode = block;
    if (stampNode.getAttribute && stampNode.getAttribute('data-rtl-inl') === fp(t)) return false;

    var dir = block.getAttribute('dir') || detectBlockDir(t);
    var isRtl = dir === 'rtl';
    // Snapshot text nodes first (wrapping mutates the tree).
    var walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT, null);
    var nodes = [];
    var n;
    while ((n = walker.nextNode())) nodes.push(n);
    for (var i = 0; i < nodes.length; i++) wrapTextNode(nodes[i], isRtl);
    if (stampNode.setAttribute) stampNode.setAttribute('data-rtl-inl', fp(t));
    return true;
  }

  // ---- Orchestrate one root, with a work cap -------------------------------
  function processRoot(root) {
    if (!root || root.nodeType !== 1) return { work: 0, truncated: false };
    if (inEditable(root)) {
      sweepInputs(root);
      return { work: 0, truncated: false };
    }
    var work = 0;
    var truncated = false;

    function each(sel, fn) {
      if (truncated) return;
      var list;
      try {
        list = root.querySelectorAll(sel);
      } catch (e) {
        return;
      }
      // include root itself if it matches
      var items = Array.prototype.slice.call(list);
      if (root.matches && root.matches(sel)) items.unshift(root);
      for (var i = 0; i < items.length; i++) {
        if (work >= MAX_NODES_PER_PASS) {
          truncated = true;
          return;
        }
        if (fn(items[i])) work++;
      }
    }

    each(SELECTORS.code, processCodeBlock);
    each(SELECTORS.table, processTable);
    each(SELECTORS.proseDir, processProse);
    each(SELECTORS.leafBlock, processLeafInlines);
    sweepInputs(root);
    return { work: work, truncated: truncated };
  }

  function processAll() {
    var roots;
    try {
      roots = document.querySelectorAll(SELECTORS.messageRoot);
    } catch (e) {
      return;
    }
    var any = false;
    for (var i = 0; i < roots.length; i++) {
      var res = processRoot(roots[i]);
      if (res.truncated) any = true;
    }
    if (document.documentElement && document.documentElement.hasAttribute &&
        document.documentElement.getAttribute('data-rtl-artifact') === '1') {
      // Artifact iframe: content isn't under a messageRoot — process the body.
      processRoot(document.body);
    }
    return any;
  }

  // ---- Streaming-settle observer -------------------------------------------
  var pending = new Set();
  var timer = null;
  function schedule() {
    if (timer) return;
    timer = setTimeout(flush, SETTLE_MS);
  }
  function flush() {
    timer = null;
    var roots = pending;
    pending = new Set();
    var requeue = false;
    roots.forEach(function (node) {
      if (!node || !node.isConnected) return;
      var res = processRoot(node);
      if (res.truncated) {
        requeue = true;
        pending.add(node);
      }
    });
    if (requeue) schedule();
  }
  function nearestRoot(node) {
    var el = node.nodeType === 1 ? node : node.parentElement;
    if (!el) return null;
    var root = el.closest ? el.closest(SELECTORS.messageRoot) : null;
    return root || el;
  }
  function makeObserver() {
    var obs = new MutationObserver(function (muts) {
      var touched = false;
      for (var i = 0; i < muts.length; i++) {
        var m = muts[i];
        if (m.type === 'characterData') {
          var r = nearestRoot(m.target);
          if (r) {
            pending.add(r);
            touched = true;
          }
        } else {
          for (var j = 0; j < m.addedNodes.length; j++) {
            var an = m.addedNodes[j];
            if (an.nodeType !== 1 && an.nodeType !== 3) continue;
            var rr = nearestRoot(an);
            if (rr) {
              pending.add(rr);
              touched = true;
            }
            if (an.nodeType === 1 && an.matches && an.matches(SELECTORS.composer + ',' + SELECTORS.editBox)) {
              setInputDir(an);
            }
          }
        }
      }
      if (touched) schedule();
    });
    obs.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    return obs;
  }

  // ---- Window-controls-overlay: keep title-bar controls sane on RTL locales -
  // (Improvement carried from the Windows side: on an RTL OS locale Chromium can
  // flip the title-bar; we pad the drag region so buttons don't overlap content.)
  function wcoFix() {
    try {
      var nav = typeof navigator !== 'undefined' ? navigator : null;
      if (!nav) return;
      var locale = ((nav.language || '') + ',' + (nav.languages || []).join(',')).toLowerCase();
      var rtlLocale = /\b(he|iw|ar|fa|ur|yi|ps|sd)\b/.test(locale);
      var wco = 'windowControlsOverlay' in nav ? nav.windowControlsOverlay : null;
      if (!wco && !rtlLocale) return;
      var apply = function () {
        var bar = document.querySelector('.draggable:not(.draggable-none)');
        if (!bar) return;
        var pad = 0;
        if (wco && wco.visible && typeof wco.getTitlebarAreaRect === 'function') {
          var rect = wco.getTitlebarAreaRect();
          if (rect && rect.x > 0) pad = Math.round(rect.x);
        } else if (rtlLocale) {
          pad = 140;
        }
        if (pad > 0) bar.style.paddingInlineStart = pad + 'px';
      };
      apply();
      if (wco && wco.addEventListener) wco.addEventListener('geometrychange', apply);
    } catch (e) {
      /* non-fatal */
    }
  }

  // ---- Init ----------------------------------------------------------------
  function init() {
    if (!document.documentElement) return;
    // Artifact iframe detection: content lives outside a messageRoot.
    try {
      if (window.self !== window.top) {
        document.documentElement.setAttribute('data-rtl-artifact', '1');
      }
    } catch (e) {
      document.documentElement.setAttribute('data-rtl-artifact', '1'); // cross-origin
    }
    injectCss();
    processAll();
    makeObserver();
    wcoFix();

    // Re-assert input dir as the user types (React strips dir on re-render).
    document.addEventListener(
      'input',
      function (e) {
        var t = e.target;
        if (t && t.matches && t.matches(SELECTORS.composer + ',' + SELECTORS.editBox)) {
          setInputDir(t);
        }
      },
      true
    );

    document.documentElement.setAttribute('data-claude-rtl', '__PAYLOAD_VERSION__');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
