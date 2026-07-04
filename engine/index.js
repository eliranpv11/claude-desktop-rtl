'use strict';

// ---------------------------------------------------------------------------
// index.js — the engine's public API (DOM-FREE)
//
// This module is pure: no `document`, no `window`, nowhere in engine/. It is
// unit-tested directly with node:test and inlined verbatim into the injected
// browser/desktop payload by build/build-payload.js. Everything the DOM layer
// needs to make a bidi decision is exported here and nothing else.
// ---------------------------------------------------------------------------

const ranges = require('./ranges.js');
const numbers = require('./numbers.js');
const detect = require('./detect.js');
const math = require('./math.js');
const arrows = require('./arrows.js');
const relations = require('./relations.js');
const code = require('./code.js');

module.exports = {
  // classification
  isStrongRTL: ranges.isStrongRTL,
  isStrongLTR: ranges.isStrongLTR,
  isRTLDigit: ranges.isRTLDigit,
  hasRTL: ranges.hasRTL,
  // numbers
  isENDigit: numbers.isENDigit,
  isANDigit: numbers.isANDigit,
  isDigit: numbers.isDigit,
  digitScript: numbers.digitScript,
  leadingNumber: numbers.leadingNumber,
  signedNumberRuns: numbers.signedNumberRuns,
  // direction
  firstStrong: detect.firstStrong,
  majority: detect.majority,
  stripLeadingNoise: detect.stripLeadingNoise,
  detectBlockDir: detect.detectBlockDir,
  resolvedDir: detect.resolvedDir,
  plaintextOverrideDir: detect.plaintextOverrideDir,
  // math / arrows / relations
  segmentMath: math.segmentMath,
  mathRuns: math.mathRuns,
  isMirrorArrow: arrows.isMirrorArrow,
  hasMirrorArrow: arrows.hasMirrorArrow,
  arrowFlipOffsets: arrows.arrowFlipOffsets,
  isMirroredMathRel: relations.isMirroredMathRel,
  hasMirroredMathRel: relations.hasMirroredMathRel,
  relationRuns: relations.relationRuns,
  // code
  looksLikeCode: code.looksLikeCode,
  codeBlockIsProse: code.codeBlockIsProse,
};
