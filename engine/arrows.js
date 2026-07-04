'use strict';

// ---------------------------------------------------------------------------
// arrows.js — directional arrows that need a visual flip in RTL (pure, guarded)
//
// Horizontal arrows (→ ← ⇒ ⟶ ➜ …) are NOT bidi-mirrored by the Unicode
// algorithm, so inside a Hebrew sentence a "→" keeps pointing right when it
// should point left. We classify such arrows and report their offsets; the DOM
// layer flips each with `transform: scaleX(-1)` — a VISUAL flip only, so the
// underlying code point is untouched and copy / Ctrl-F stay byte-for-byte.
//
// Two exclusions the DOM layer applies with our help:
//   * an arrow inside a math run (`a → b`, `f: X → Y`) is universal LTR notation
//     and must NOT flip — segmentMath (math.js) provides those ranges.
//   * an arrow whose immediate strong-char context is LTR (an English clause in
//     otherwise-Hebrew prose) reads left-to-right and should not flip.
// ---------------------------------------------------------------------------

const { isStrongRTL, isStrongLTR } = require('./ranges.js');
const { mathRuns, inMathRuns } = require('./math.js');

function toText(x) {
  return typeof x === 'string' ? x : '';
}

// Horizontal, direction-bearing arrows. Deliberately excludes vertical (↑ ↓)
// and diagonal arrows, which have no left/right meaning to mirror.
const MIRROR_ARROWS = new Set([
  0x2190, 0x2192, // ← →
  0x21a0, 0x21a4, 0x21a6, // ↠ ↤ ↦
  0x21aa, 0x21a9, // ↪ ↩
  0x21d0, 0x21d2, // ⇐ ⇒
  0x21e6, 0x21e8, // ⇦ ⇨
  0x21fd, 0x21fe, // ⇽ ⇾
  0x27f5, 0x27f6, 0x27f7, // ⟵ ⟶ ⟷
  0x27f8, 0x27f9, 0x27fa, // ⟸ ⟹ ⟺
  0x27fc, // ⟼
  0x2900, 0x2901, 0x2902, 0x2903, 0x2905, 0x2907,
  0x2794, // ➔
  0x2798, 0x2799, 0x279a, 0x279b, 0x279c, 0x279d, 0x279e, 0x279f,
  0x27a0, 0x27a1, // ➡
  0x2b05, 0x2b95, // ⬅ ⭕-range right arrow
]);

/** True if the code point is a horizontal arrow that should mirror in RTL. */
function isMirrorArrow(cp) {
  const c =
    typeof cp === 'number'
      ? cp
      : typeof cp === 'string' && cp.length
        ? cp.codePointAt(0)
        : -1;
  return MIRROR_ARROWS.has(c);
}

/** True if the string contains any mirrorable arrow. */
function hasMirrorArrow(str) {
  const s = toText(str);
  for (const ch of s) {
    if (isMirrorArrow(ch)) return true;
  }
  return false;
}

// Nearest strong-char direction scanning outward from an index; used to gate a
// flip so an arrow between two English words does not mirror.
function neighbourDir(s, idx, step) {
  for (let i = idx; i >= 0 && i < s.length; i += step) {
    const ch = s[i];
    if (isStrongRTL(ch)) return 'rtl';
    if (isStrongLTR(ch)) return 'ltr';
  }
  return null;
}

/**
 * Offsets of arrows that should be flipped, given the whole block text. An arrow
 * flips when it is NOT inside a math run and its local context is not clearly
 * LTR on both sides. Returns [{ start, end }] in ascending order.
 */
function arrowFlipOffsets(str) {
  const s = toText(str);
  const out = [];
  if (s.length === 0) return out;
  const math = mathRuns(s);

  for (let i = 0; i < s.length; i++) {
    const cp = s.codePointAt(i);
    const width = cp > 0xffff ? 2 : 1;
    if (isMirrorArrow(cp)) {
      if (!inMathRuns(math, i)) {
        const left = neighbourDir(s, i - 1, -1);
        const right = neighbourDir(s, i + width, 1);
        // Flip unless BOTH sides are strong-LTR (a purely English run). If either
        // side is RTL, or a side has no strong char, the arrow lives in RTL prose.
        if (!(left === 'ltr' && right === 'ltr')) {
          out.push({ start: i, end: i + width });
        }
      }
    }
    if (width === 2) i++; // advance past the low surrogate
  }
  return out;
}

module.exports = { isMirrorArrow, hasMirrorArrow, arrowFlipOffsets };
