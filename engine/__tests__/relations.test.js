'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  isMirroredMathRel,
  hasMirroredMathRel,
  relationRuns,
} = require('../relations.js');

test('relation classification', () => {
  assert.equal(isMirroredMathRel('<'), true);
  assert.equal(isMirroredMathRel('≤'), true);
  assert.equal(isMirroredMathRel('∈'), true);
  assert.equal(isMirroredMathRel('('), false); // bracket, should mirror naturally
  assert.equal(isMirroredMathRel('+'), false);
});

test('numeric comparison in Hebrew is isolated', () => {
  const s = 'התנאי 3 < 5 מתקיים';
  const runs = relationRuns(s);
  assert.equal(runs.length, 1);
  assert.equal(s.slice(runs[0].start, runs[0].end), '3 < 5');
});

test('chained relation merges into one run', () => {
  const s = 'הטווח 0 < x ≤ 4 חוקי';
  const runs = relationRuns(s);
  assert.equal(runs.length, 1);
  assert.equal(s.slice(runs[0].start, runs[0].end), '0 < x ≤ 4');
});

test('pure-Latin algebra is NOT isolated', () => {
  // x ∈ S renders fine in LTR; no digit, no RTL → left alone.
  assert.equal(relationRuns('the set x ∈ S is closed').length, 0);
});

test('relation inside an HTML tag is ignored', () => {
  assert.equal(hasMirroredMathRel('<div>שלום</div>'), false);
  assert.equal(relationRuns('טקסט <span>x</span> עוד').length, 0);
});

test('performance — long chain does not hang', () => {
  const s = 'סדרה ' + Array.from({ length: 2000 }, (_, i) => `${i} < `).join('') + '0';
  const start = Date.now();
  const runs = relationRuns(s);
  assert.equal(Date.now() - start < 1000, true); // bounded, no O(n^2) blowup
  assert.equal(runs.length >= 1, true);
});

test('protection — bad input', () => {
  for (const bad of [null, undefined, 42, {}]) {
    assert.doesNotThrow(() => relationRuns(bad));
    assert.deepEqual(relationRuns(bad), []);
    assert.equal(hasMirroredMathRel(bad), false);
  }
});
