'use strict';

// ---------------------------------------------------------------------------
// ranges.js — Unicode script classification (pure, astral-safe, input-guarded)
//
// This is the foundation every direction decision stands on: given a single
// Unicode code point, decide whether it is a strong right-to-left letter, a
// strong left-to-right letter, or a digit (and which digit script).
//
// Design guarantees (the two protections neither source engine had):
//   1. INPUT SAFETY — every exported function tolerates null/undefined/non-
//      string/non-number input and returns a benign result instead of throwing.
//   2. ASTRAL SAFETY — iteration is by code point (for..of over a string yields
//      whole code points), so surrogate-pair scripts like Adlam classify
//      correctly and lone surrogates never corrupt a scan.
// ---------------------------------------------------------------------------

// Strong right-to-left blocks (Bidi class R or AL), living + historic.
// Each pair is an inclusive [lo, hi] code-point range.
const RTL_RANGES = [
  [0x0590, 0x05ff], // Hebrew
  [0x0600, 0x06ff], // Arabic
  [0x0700, 0x074f], // Syriac
  [0x0750, 0x077f], // Arabic Supplement
  [0x0780, 0x07bf], // Thaana
  [0x07c0, 0x07ff], // NKo
  [0x0800, 0x083f], // Samaritan
  [0x0840, 0x085f], // Mandaic
  [0x0860, 0x086f], // Syriac Supplement
  [0x0870, 0x089f], // Arabic Extended-B
  [0x08a0, 0x08ff], // Arabic Extended-A
  [0xfb1d, 0xfb4f], // Hebrew presentation forms
  [0xfb50, 0xfdff], // Arabic Presentation Forms-A
  [0xfe70, 0xfeff], // Arabic Presentation Forms-B
  [0x10800, 0x1083f], // Cypriot / Imperial Aramaic vicinity
  [0x10840, 0x1085f], // Imperial Aramaic
  [0x10860, 0x1087f], // Palmyrene
  [0x10880, 0x108af], // Nabataean
  [0x108e0, 0x108ff], // Hatran
  [0x10900, 0x1091f], // Phoenician
  [0x10920, 0x1093f], // Lydian
  [0x10a00, 0x10a5f], // Kharoshthi
  [0x10ac0, 0x10aff], // Manichaean
  [0x10b00, 0x10b3f], // Avestan
  [0x10b40, 0x10b5f], // Inscriptional Parthian
  [0x10b60, 0x10b7f], // Inscriptional Pahlavi
  [0x10c00, 0x10c4f], // Old Turkic
  [0x10c80, 0x10cff], // Old Hungarian (RTL)
  [0x10d00, 0x10d3f], // Hanifi Rohingya
  [0x10ec0, 0x10eff], // Arabic Extended-C
  [0x10f00, 0x10f2f], // Old Sogdian
  [0x10f30, 0x10f6f], // Sogdian
  [0x10f70, 0x10faf], // Old Uyghur
  [0x10fb0, 0x10fdf], // Chorasmian
  [0x10fe0, 0x10fff], // Elymaic
  [0x1e800, 0x1e8df], // Mende Kikakui
  [0x1e900, 0x1e95f], // Adlam
  [0x1ec70, 0x1ecbf], // Indic Siyaq Numbers (Arabic-derived)
  [0x1ed00, 0x1ed4f], // Ottoman Siyaq Numbers
  [0x1ee00, 0x1eeff], // Arabic Mathematical Alphabetic Symbols
];

// Digit blocks that carry Bidi class AN (Arabic Number) — order differently
// from European digits next to RTL text.
const AN_DIGIT_RANGES = [
  [0x0660, 0x0669], // Arabic-Indic
  [0x06f0, 0x06f9], // Extended Arabic-Indic (Persian/Urdu)
];

// Any Unicode letter. Used to define "strong LTR" as "a letter that is not RTL"
// (covers Latin, Greek, Cyrillic, Armenian, CJK, etc. without enumerating them).
const LETTER_RE = /\p{L}/u;

function inRanges(cp, ranges) {
  // Linear scan is fine: the tables are short and each classify call is O(1)-ish
  // in practice. Ranges are sorted, so we can bail early once we pass cp.
  for (let i = 0; i < ranges.length; i++) {
    const r = ranges[i];
    if (cp < r[0]) return false;
    if (cp <= r[1]) return true;
  }
  return false;
}

// Coerce anything into a usable code point, or -1 if it isn't one.
function toCodePoint(cp) {
  if (typeof cp === 'number' && Number.isInteger(cp) && cp >= 0 && cp <= 0x10ffff) {
    return cp;
  }
  if (typeof cp === 'string' && cp.length > 0) {
    const c = cp.codePointAt(0);
    return typeof c === 'number' ? c : -1;
  }
  return -1;
}

/** True if the code point is a strong right-to-left letter. */
function isStrongRTL(cp) {
  const c = toCodePoint(cp);
  if (c < 0) return false;
  return inRanges(c, RTL_RANGES);
}

/** True if the code point is a strong left-to-right letter (any non-RTL letter). */
function isStrongLTR(cp) {
  const c = toCodePoint(cp);
  if (c < 0) return false;
  if (inRanges(c, RTL_RANGES)) return false;
  return LETTER_RE.test(String.fromCodePoint(c));
}

/** True if the code point is an Arabic-Number (AN) digit. */
function isRTLDigit(cp) {
  const c = toCodePoint(cp);
  if (c < 0) return false;
  return inRanges(c, AN_DIGIT_RANGES);
}

/** True if the string contains at least one strong-RTL letter. */
function hasRTL(str) {
  if (typeof str !== 'string' || str.length === 0) return false;
  for (const ch of str) {
    if (isStrongRTL(ch)) return true;
  }
  return false;
}

module.exports = {
  isStrongRTL,
  isStrongLTR,
  isRTLDigit,
  hasRTL,
  // exported for the numbers module + tests; not part of the public surface
  _AN_DIGIT_RANGES: AN_DIGIT_RANGES,
};
