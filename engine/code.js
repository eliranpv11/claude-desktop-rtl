'use strict';

// ---------------------------------------------------------------------------
// code.js — real code vs. Hebrew/Arabic prose mis-fenced as code (guarded)
//
// Claude sometimes wraps a plain Hebrew "table" or prose in a ``` fence. Real
// code must stay LTR (RTL scrambles braces/indentation/operators), but a fence
// that is actually RTL prose should read RTL. codeBlockIsProse decides: it is
// prose iff it contains RTL text AND shows no code structure. The code-structure
// test is deliberately CONSERVATIVE — any real code signal keeps the block LTR.
// ---------------------------------------------------------------------------

const { hasRTL } = require('./ranges.js');

function toText(x) {
  return typeof x === 'string' ? x : '';
}

// Any one of these signals is enough to call a block "code" (conservative).
const CODE_KEYWORD =
  /\b(?:function|const|let|var|return|if|else|for|while|switch|case|class|import|export|from|def|print|public|private|static|void|int|string|bool|async|await|yield|lambda|require|module|package|namespace|struct|enum|interface|typedef|#include|using|end|do|then|elif|foreach)\b/;
const CODE_OPERATOR = /(?:=>|->|::|\+\+|--|&&|\|\||==|!=|<=|>=|:=|\/\/|\/\*|\*\/|<\/?[a-z])/;
const CODE_BRACE = /[{};]/;
const CODE_CALL = /[A-Za-z_$][\w$]*\s*\([^)]*\)/; // foo(...)
const CODE_ASSIGN = /[A-Za-z_$][\w$.]*\s*=\s*\S/; // x = y
const CODE_INDENT = /(?:^|\n)[ \t]{2,}\S/; // indented line
const CODE_COMMENT = /(?:^|\n)\s*(?:#|\/\/|--)\s/; // comment line
const CODE_SHELL = /(?:^|\n)\s*[$#]\s+\S/; // shell prompt

/**
 * True if the block shows structural signs of being source code / a shell
 * transcript. Conservative: any single signal returns true.
 */
function looksLikeCode(str) {
  const s = toText(str);
  if (s.length === 0) return false;
  return (
    CODE_KEYWORD.test(s) ||
    CODE_OPERATOR.test(s) ||
    CODE_BRACE.test(s) ||
    CODE_CALL.test(s) ||
    CODE_ASSIGN.test(s) ||
    CODE_INDENT.test(s) ||
    CODE_COMMENT.test(s) ||
    CODE_SHELL.test(s)
  );
}

/**
 * True if a fenced block is really RTL prose (Hebrew/Arabic table or text that
 * Claude wrongly fenced) rather than code: it has RTL text and no code structure.
 */
function codeBlockIsProse(str) {
  const s = toText(str);
  return hasRTL(s) && !looksLikeCode(s);
}

module.exports = { looksLikeCode, codeBlockIsProse };
