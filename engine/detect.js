'use strict';

// ---------------------------------------------------------------------------
// detect.js — base-direction decision engine (pure, guarded)
//
// The load-bearing module. Given a block of text it decides a base direction
// ('rtl' | 'ltr' | null) using a layered strategy that mirrors the Unicode
// bidi first-strong rule (UAX #9 P2/P3) but is hardened against the openers
// that break naive first-strong tools.
//
// THE CARDINAL RULE: the fallback is always `null` — never a forced 'rtl'.
// Returning null means "leave the browser's own per-block plaintext decision
// alone", which is what keeps an English document from being dragged RTL just
// because it contains some Hebrew somewhere. This is the single most important
// correctness property of the whole engine.
// ---------------------------------------------------------------------------

const { isStrongRTL, isStrongLTR, hasRTL } = require('./ranges.js');
const { leadingNumber } = require('./numbers.js');

function toText(x) {
  return typeof x === 'string' ? x : '';
}

/**
 * First-strong direction: scan by code point and return the direction of the
 * first strong letter. 'rtl' | 'ltr' | null (only neutrals — digits, spaces,
 * punctuation, emoji).
 */
function firstStrong(str) {
  const s = toText(str);
  for (const ch of s) {
    if (isStrongRTL(ch)) return 'rtl';
    if (isStrongLTR(ch)) return 'ltr';
  }
  return null;
}

/**
 * Majority direction: count strong RTL vs strong LTR letters. The safety net
 * for blocks whose first strong char misleads (a Hebrew paragraph opening with
 * a brand name). Tie or no strong letters → null.
 */
function majority(str) {
  const s = toText(str);
  let rtl = 0;
  let ltr = 0;
  for (const ch of s) {
    if (isStrongRTL(ch)) rtl++;
    else if (isStrongLTR(ch)) ltr++;
  }
  if (rtl > ltr) return 'rtl';
  if (ltr > rtl) return 'ltr';
  return null;
}

// Leading tokens that should not decide a block's direction: bullets, list
// markers, backtick code, URLs, paths, dotted identifiers (foo.js, Next.js),
// and a leading emoji/symbol. Applied once, left to right.
const LEADING_BULLET_RE = /^[\s]*[•·▪◦‣*+\-–—]+\s+/;
const LEADING_ORDINAL_RE = /^[\s]*(?:[0-9٠-٩۰-۹]+[.)\]]|[a-z][.)])\s+/i;
const LEADING_BACKTICK_RE = /^[\s]*`[^`]+`\s*/;
const LEADING_URL_RE = /^[\s]*(?:https?:\/\/|www\.)\S+\s*/i;
const LEADING_PATH_RE = /^[\s]*[~./\\]?[\w.\-]+[/\\][\w.\-/\\]+\s*/;
const LEADING_DOTTED_RE = /^[\s]*[A-Za-z][\w-]*(?:\.[A-Za-z][\w-]*)+\s*/; // Next.js, foo.bar
const LEADING_EMOJI_RE =
  /^[\s]*(?:[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}←-⇿⬀-⯿️‍])+\s*/u;

/**
 * Strip leading structural/neutral noise so first-strong sees the real content.
 * Idempotent and bounded (at most one pass of each rule + a leading number).
 * Never strips into the middle of a strong run — it only removes recognised
 * leading tokens.
 */
function stripLeadingNoise(str) {
  let s = toText(str);
  // A small fixed number of peel passes; each pass removes at most one token,
  // and we stop as soon as a pass changes nothing. Bounded => no pathological
  // input can make this loop long.
  for (let pass = 0; pass < 8; pass++) {
    const before = s;
    s = s.replace(LEADING_BULLET_RE, '');
    s = s.replace(LEADING_ORDINAL_RE, '');
    s = s.replace(LEADING_BACKTICK_RE, '');
    s = s.replace(LEADING_URL_RE, '');
    s = s.replace(LEADING_PATH_RE, '');
    s = s.replace(LEADING_DOTTED_RE, '');
    s = s.replace(LEADING_EMOJI_RE, '');
    const n = leadingNumber(s);
    if (n > 0) s = s.slice(n);
    s = s.replace(/^\s+/, '');
    if (s === before) break;
  }
  return s;
}

/**
 * Block direction, first-strong with a majority safety net. Strips leading
 * noise, takes first-strong of what remains, and only if that is null falls
 * back to whole-string majority. Fallback stays null when there is no strong
 * content — never a forced direction.
 */
function detectBlockDir(str) {
  const s = toText(str);
  if (s.length === 0) return null;
  const clean = stripLeadingNoise(s);
  const d = firstStrong(clean);
  if (d !== null) return d;
  return majority(s);
}

/**
 * The direction a browser's `unicode-bidi: plaintext` would actually render for
 * this block: pure first-strong on the RAW text (no noise stripping), because
 * that is exactly what the CSS engine does. The DOM layer compares this against
 * detectBlockDir to know when CSS will misfire and a JS `dir` override is needed.
 */
function resolvedDir(str) {
  return firstStrong(toText(str));
}

/**
 * The one place JS is allowed to stamp `dir` on a prose block. CSS plaintext
 * runs first-strong and misfires when a Hebrew block OPENS with Latin (a marker
 * "8c. בדיקה" or brand "React הוא ספרייה"): first-strong latches on the Latin
 * char and renders LTR though the block is Hebrew. Fire ONLY when first-strong
 * is 'ltr' AND majority is 'rtl'. The majority gate is the safety discriminator:
 * an English sentence that merely contains Hebrew ("The term שלום means peace")
 * is majority-LTR → null, so English is never flipped. Returns 'rtl' or null.
 */
function plaintextOverrideDir(str) {
  const s = toText(str);
  if (!hasRTL(s)) return null;
  if (resolvedDir(s) === 'ltr' && majority(s) === 'rtl') return 'rtl';
  return null;
}

module.exports = {
  firstStrong,
  majority,
  stripLeadingNoise,
  detectBlockDir,
  resolvedDir,
  plaintextOverrideDir,
};
