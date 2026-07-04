'use strict';

// ---------------------------------------------------------------------------
// numbers.js — digit classification & numeric-run detection (pure, guarded)
//
// Numbers are "weak" characters in the Unicode bidi algorithm and are where the
// most subtle "looks slightly off" RTL bugs live. This module never tries to
// re-order numbers itself; it only *classifies* them so the direction engine
// (detect.js) can ignore leading numbers and the DOM layer can isolate a signed
// run so its sign doesn't detach in RTL (`-5` rendering as `5-`).
//
// Protection: all inputs are coerced; a non-string yields empty results, never
// a throw. Regex scans are single-pass (linear), so there is no O(n^2) path.
// ---------------------------------------------------------------------------

const EN_DIGITS = /[0-9]/;
const AN_DIGITS = /[٠-٩۰-۹]/; // Arabic-Indic + Persian
const ANY_DIGIT = /[0-9٠-٩۰-۹]/;

// A signed number: a sign that sits at a real boundary (not glued to a letter or
// digit — so the Hebrew prefix in "ל-15" is NOT read as a minus sign) followed by
// a digit run. Handles ASCII and Unicode minus, plus, and plus-minus.
const SIGNED_RUN_RE =
  /(?<![\p{L}\p{N}])[-+±−][0-9٠-٩۰-۹][0-9.,:٠-٩۰-۹]*/gu;

// A leading numeric token (optionally signed) with locale separators.
const LEADING_NUMBER_RE =
  /^[-+±−]?[0-9٠-٩۰-۹][0-9.,:٠-٩۰-۹]*/;

function toText(x) {
  return typeof x === 'string' ? x : '';
}

function isCodePointOf(re, cp) {
  const c =
    typeof cp === 'number' && Number.isInteger(cp) && cp >= 0 && cp <= 0x10ffff
      ? String.fromCodePoint(cp)
      : typeof cp === 'string'
        ? cp
        : '';
  return c.length > 0 && re.test(c);
}

/** True if the code point (number or single-char string) is a European digit. */
function isENDigit(cp) {
  return isCodePointOf(EN_DIGITS, cp);
}

/** True if the code point is an Arabic-Indic / Persian digit. */
function isANDigit(cp) {
  return isCodePointOf(AN_DIGITS, cp);
}

/** True if the code point is any recognised digit. */
function isDigit(cp) {
  return isCodePointOf(ANY_DIGIT, cp);
}

/**
 * Which digit script a string uses: 'en', 'an', 'mixed', or null when it holds
 * no digits at all. Callers use this to avoid "fixing" digits the browser bidi
 * already orders correctly.
 */
function digitScript(str) {
  const s = toText(str);
  let en = false;
  let an = false;
  for (const ch of s) {
    if (EN_DIGITS.test(ch)) en = true;
    else if (AN_DIGITS.test(ch)) an = true;
    if (en && an) return 'mixed';
  }
  if (en) return 'en';
  if (an) return 'an';
  return null;
}

/**
 * Length (in UTF-16 code units) of a leading number token, after ignoring
 * leading whitespace. Returns 0 when the string does not start with a number.
 * Used by detect.stripLeadingNoise so a number-led RTL line ("2,200 ₪ ...") is
 * not forced LTR by its opening digits.
 */
function leadingNumber(str) {
  const s = toText(str);
  const trimmed = s.replace(/^\s+/, '');
  const lead = s.length - trimmed.length;
  const m = LEADING_NUMBER_RE.exec(trimmed);
  return m ? lead + m[0].length : 0;
}

/**
 * All signed-number runs in the string as [start, end) UTF-16 offsets. The DOM
 * layer isolates each so the sign stays attached in RTL. Offsets are exact for
 * astral input because the regex advances by code unit consistently.
 */
function signedNumberRuns(str) {
  const s = toText(str);
  const out = [];
  if (s.length === 0) return out;
  SIGNED_RUN_RE.lastIndex = 0;
  let m;
  while ((m = SIGNED_RUN_RE.exec(s)) !== null) {
    out.push({ start: m.index, end: m.index + m[0].length });
    // Guard against a zero-width match wedging the loop (defensive; the pattern
    // always consumes at least two chars, but never trust a regex with a loop).
    if (m.index === SIGNED_RUN_RE.lastIndex) SIGNED_RUN_RE.lastIndex++;
  }
  return out;
}

module.exports = {
  isENDigit,
  isANDigit,
  isDigit,
  digitScript,
  leadingNumber,
  signedNumberRuns,
};
