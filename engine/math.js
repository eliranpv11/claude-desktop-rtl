'use strict';

// ---------------------------------------------------------------------------
// math.js — LaTeX / math segmentation vs. currency (pure, guarded)
//
// A single `$...$` is ambiguous: it could be inline math ($\frac{a}{b}$) or a
// price ($5.99, "$5 to $10"). Getting this wrong matters doubly for Hebrew and
// Arabic financial text. We segment a string into 'text' and 'math' runs so the
// DOM layer can isolate the math runs LTR and leave currency alone.
//
// Rule:
//   * $$...$$, \[...\], \(...\)  → always math (unambiguous delimiters).
//   * single $...$               → math ONLY if it contains a real LaTeX signal
//                                  (a backslash command, ^ _ { }, or a known
//                                  macro). Otherwise it stays text (currency).
// ---------------------------------------------------------------------------

function toText(x) {
  return typeof x === 'string' ? x : '';
}

// A known-macro / structural LaTeX signal inside a single-dollar span.
const LATEX_SIGNAL_RE =
  /\\[A-Za-z]+|[\^_{}]|\b(?:frac|sqrt|sum|int|prod|lim|sin|cos|tan|log|ln|alpha|beta|gamma|delta|theta|pi|sigma|omega|infty|cdot|times|div|leq|geq|neq|approx|equiv|forall|exists|in|subset|cup|cap|nabla|partial|vec|hat|bar|matrix|begin|end)\b/;

// Push a run, merging nothing (runs are contiguous and ordered by construction).
function pushRun(runs, kind, text, start) {
  if (text.length === 0) return;
  runs.push({ kind, text, start, end: start + text.length });
}

/**
 * Segment text into ordered runs: [{ kind:'text'|'math', text, start, end }].
 * Concatenating run.text in order reproduces the input exactly (lossless).
 */
function segmentMath(str) {
  const s = toText(str);
  const runs = [];
  if (s.length === 0) return runs;

  let i = 0;
  let textStart = 0;

  const flushText = (upto) => {
    pushRun(runs, 'text', s.slice(textStart, upto), textStart);
  };

  while (i < s.length) {
    const c = s[i];

    // Escaped dollar — not a delimiter.
    if (c === '\\' && s[i + 1] === '$') {
      i += 2;
      continue;
    }

    // \[ ... \] and \( ... \) display/inline math.
    if (c === '\\' && (s[i + 1] === '[' || s[i + 1] === '(')) {
      const closeOpen = s[i + 1] === '[' ? '\\]' : '\\)';
      const close = s.indexOf(closeOpen, i + 2);
      if (close !== -1) {
        flushText(i);
        const end = close + 2;
        pushRun(runs, 'math', s.slice(i, end), i);
        i = end;
        textStart = i;
        continue;
      }
    }

    // $$ ... $$ display math (check before single $).
    if (c === '$' && s[i + 1] === '$') {
      const close = s.indexOf('$$', i + 2);
      if (close !== -1) {
        flushText(i);
        const end = close + 2;
        pushRun(runs, 'math', s.slice(i, end), i);
        i = end;
        textStart = i;
        continue;
      }
    }

    // $ ... $ single-dollar: math only with a LaTeX signal, else currency (text).
    if (c === '$') {
      const close = s.indexOf('$', i + 1);
      if (close !== -1) {
        const inner = s.slice(i + 1, close);
        if (LATEX_SIGNAL_RE.test(inner)) {
          flushText(i);
          const end = close + 1;
          pushRun(runs, 'math', s.slice(i, end), i);
          i = end;
          textStart = i;
          continue;
        }
        // else: currency; leave the whole $...$ as text, skip past the closing $
        // so we don't re-scan the inside.
        i = close + 1;
        continue;
      }
    }

    i++;
  }

  flushText(s.length);
  return runs;
}

/** Offset ranges of the math runs only — convenience for the DOM/arrow layer. */
function mathRuns(str) {
  return segmentMath(str)
    .filter((r) => r.kind === 'math')
    .map((r) => ({ start: r.start, end: r.end }));
}

/** True if any offset falls inside a math run. */
function inMathRuns(runs, offset) {
  if (!Array.isArray(runs)) return false;
  for (let i = 0; i < runs.length; i++) {
    if (offset >= runs[i].start && offset < runs[i].end) return true;
  }
  return false;
}

module.exports = { segmentMath, mathRuns, inMathRuns };
