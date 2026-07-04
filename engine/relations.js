'use strict';

// ---------------------------------------------------------------------------
// relations.js — mirrored math relations that read backwards in RTL (guarded)
//
// Symbols like < > ≤ ≥ ∈ ∋ ⊂ ⊃ ≠ ≈ are Bidi_Mirrored. When flanked by digits
// or RTL text, the Unicode algorithm gives them an RTL level and rule L4 both
// mirrors the glyph AND reorders the operands, so a Hebrew line "3 < 5" renders
// "5 > 3" — false. The fix is to isolate the whole relational expression as one
// LTR run so glyph and operand order are both preserved. Visual only; the code
// points are untouched (copy / Ctrl-F stay exact).
//
// Two guards keep this from firing where it shouldn't:
//   * relations inside an HTML tag (`<div>`, `</p>`) are never treated as math.
//   * a relation flanked only by Latin letters (`x ∈ S`) renders fine and is
//     left alone; we isolate only runs that contain a digit or RTL char, i.e.
//     the contexts where the browser actually mirrors.
//
// Performance: a single left-to-right pass; each operand scan is bounded by a
// small step cap, and seed runs are merged in one linear sweep. No O(n^2) path.
// ---------------------------------------------------------------------------

const { isStrongRTL } = require('./ranges.js');

function toText(x) {
  return typeof x === 'string' ? x : '';
}

// Mirrored relation symbols (Sm ∧ Bidi_Mirrored). Brackets (Ps/Pe) and arrows
// are deliberately excluded — brackets SHOULD mirror in RTL, arrows are handled
// separately (arrows.js).
const REL = new Set(
  [
    '<', '>',
    '≤', '≥', // ≤ ≥
    '≠', '≈', '≅', '≡', // ≠ ≈ ≅ ≡
    '∈', '∉', '∋', // ∈ ∉ ∋
    '⊂', '⊃', '⊆', '⊇', // ⊂ ⊃ ⊆ ⊇
    '≺', '≻', '⪯', '⪰', // ≺ ≻ ⪯ ⪰
    '≪', '≫', // ≪ ≫
    '≐', '≃', '≉', // ≐ ≃ ≉
  ].map((c) => c),
);

const OPERAND_CH = /[A-Za-z0-9_.,%°+±−٠-٩۰-۹]/;
const DIGIT_CH = /[0-9٠-٩۰-۹]/;
const MAX_TERM = 64; // operand scan cap — bounds the per-symbol work

function isRel(ch) {
  return typeof ch === 'string' && REL.has(ch);
}

// Ranges occupied by HTML-ish tags, so a '<'/'>' inside one is never a relation.
function tagRanges(s) {
  const out = [];
  const re = /<\/?[A-Za-z][^<>]*>/g;
  let m;
  while ((m = re.exec(s)) !== null) {
    out.push([m.index, m.index + m[0].length]);
    if (m.index === re.lastIndex) re.lastIndex++;
  }
  return out;
}

function inRanges(ranges, i) {
  for (let k = 0; k < ranges.length; k++) {
    if (i >= ranges[k][0] && i < ranges[k][1]) return true;
  }
  return false;
}

// Consume an operand leftward from just-before the operator; returns the run
// start index. Skips one run of spaces, then operand chars (bounded), and a
// balanced trailing bracket group `)`/`]`.
function termStartLeft(s, from) {
  let i = from;
  while (i >= 0 && s[i] === ' ') i--;
  if (i >= 0 && (s[i] === ')' || s[i] === ']')) {
    const open = s[i] === ')' ? '(' : '[';
    const close = s[i];
    let depth = 0;
    let steps = 0;
    while (i >= 0 && steps++ < MAX_TERM) {
      if (s[i] === close) depth++;
      else if (s[i] === open) {
        depth--;
        if (depth === 0) {
          i--;
          break;
        }
      }
      i--;
    }
  }
  let steps = 0;
  while (i >= 0 && OPERAND_CH.test(s[i]) && steps++ < MAX_TERM) i--;
  return i + 1;
}

// Consume an operand rightward from just-after the operator; returns the run
// end index (exclusive). Mirror of termStartLeft.
function termEndRight(s, from) {
  const n = s.length;
  let i = from;
  while (i < n && s[i] === ' ') i++;
  let steps = 0;
  while (i < n && OPERAND_CH.test(s[i]) && steps++ < MAX_TERM) i++;
  if (i < n && (s[i] === '(' || s[i] === '[')) {
    const open = s[i];
    const close = open === '(' ? ')' : ']';
    let depth = 0;
    steps = 0;
    while (i < n && steps++ < MAX_TERM) {
      if (s[i] === open) depth++;
      else if (s[i] === close) {
        depth--;
        if (depth === 0) {
          i++;
          break;
        }
      }
      i++;
    }
  }
  return i;
}

/** True if the code point is a mirrored math relation symbol. */
function isMirroredMathRel(cp) {
  const c =
    typeof cp === 'number' && cp >= 0
      ? String.fromCodePoint(cp)
      : typeof cp === 'string'
        ? cp
        : '';
  return c.length > 0 && REL.has(c[0]);
}

/** True if the string contains any mirrored relation symbol (outside tags). */
function hasMirroredMathRel(str) {
  const s = toText(str);
  if (s.length === 0) return false;
  const tags = tagRanges(s);
  for (let i = 0; i < s.length; i++) {
    if (isRel(s[i]) && !inRanges(tags, i)) return true;
  }
  return false;
}

/**
 * Relational expression runs to isolate, as [{ start, end }] in ascending,
 * non-overlapping order. Chained relations (`0 < x ≤ 4`) merge into one run.
 * A run is kept only if it contains a digit or an RTL char — the contexts where
 * the browser actually mirrors; pure-Latin algebra (`x ∈ S`) is left alone.
 */
function relationRuns(str) {
  const s = toText(str);
  if (s.length === 0) return [];
  const tags = tagRanges(s);
  const seeds = [];

  for (let i = 0; i < s.length; i++) {
    if (!isRel(s[i]) || inRanges(tags, i)) continue;
    const start = termStartLeft(s, i - 1);
    const end = termEndRight(s, i + 1);
    if (end > start) seeds.push([start, end]);
  }
  if (seeds.length === 0) return [];

  // Merge overlapping/adjacent seeds (sorted by construction).
  const merged = [];
  let [cs, ce] = seeds[0];
  for (let k = 1; k < seeds.length; k++) {
    const [ns, ne] = seeds[k];
    if (ns <= ce) {
      if (ne > ce) ce = ne;
    } else {
      merged.push([cs, ce]);
      [cs, ce] = [ns, ne];
    }
  }
  merged.push([cs, ce]);

  // Gate: keep only runs with a digit or RTL char.
  const out = [];
  for (let k = 0; k < merged.length; k++) {
    const run = s.slice(merged[k][0], merged[k][1]);
    if (DIGIT_CH.test(run) || isRtlIn(run)) {
      out.push({ start: merged[k][0], end: merged[k][1] });
    }
  }
  return out;
}

function isRtlIn(run) {
  for (const ch of run) {
    if (isStrongRTL(ch)) return true;
  }
  return false;
}

module.exports = {
  isMirroredMathRel,
  hasMirroredMathRel,
  relationRuns,
};
