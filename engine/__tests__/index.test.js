'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const engine = require('../index.js');

// The engine's public API is the contract the DOM layer and the built payload
// depend on. This guards it: every documented symbol must stay exported as a
// callable function, and nothing undocumented may leak in.
const PUBLIC_API = [
  // classification
  'isStrongRTL',
  'isStrongLTR',
  'isRTLDigit',
  'hasRTL',
  // numbers
  'isENDigit',
  'isANDigit',
  'isDigit',
  'digitScript',
  'leadingNumber',
  'signedNumberRuns',
  // direction
  'firstStrong',
  'majority',
  'stripLeadingNoise',
  'detectBlockDir',
  'resolvedDir',
  'plaintextOverrideDir',
  // math / arrows / relations
  'segmentMath',
  'mathRuns',
  'isMirrorArrow',
  'hasMirrorArrow',
  'arrowFlipOffsets',
  'isMirroredMathRel',
  'hasMirroredMathRel',
  'relationRuns',
  // code
  'looksLikeCode',
  'codeBlockIsProse',
];

test('engine exports every documented symbol as a function', () => {
  for (const name of PUBLIC_API) {
    assert.equal(
      typeof engine[name],
      'function',
      `engine.${name} must be exported as a function`
    );
  }
});

test('engine exports nothing beyond the documented public API', () => {
  const exported = Object.keys(engine).sort();
  assert.deepEqual(exported, [...PUBLIC_API].sort());
});
