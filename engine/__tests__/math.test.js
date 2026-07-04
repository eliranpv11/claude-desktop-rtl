'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { segmentMath, mathRuns } = require('../math.js');

function kinds(str) {
  return segmentMath(str).map((r) => r.kind);
}
function lossless(str) {
  return segmentMath(str)
    .map((r) => r.text)
    .join('');
}

test('currency stays text', () => {
  assert.deepEqual(kinds('it costs $5.99 today'), ['text']);
  assert.deepEqual(kinds('$5 to $10 range'), ['text']);
  assert.equal(mathRuns('the price is $20').length, 0);
});

test('real inline math is detected', () => {
  const r = segmentMath('the value $\\frac{a}{b}$ here');
  assert.deepEqual(r.map((x) => x.kind), ['text', 'math', 'text']);
  assert.equal(r[1].text, '$\\frac{a}{b}$');
});

test('display and bracket delimiters are always math', () => {
  assert.equal(mathRuns('x $$a^2+b^2$$ y').length, 1);
  assert.equal(mathRuns('see \\[E=mc^2\\] end').length, 1);
  assert.equal(mathRuns('inline \\(a+b\\) done').length, 1);
});

test('segmentation is lossless', () => {
  for (const s of [
    'plain text',
    'price $5 and math $x^2$ mixed',
    '$$block$$ then $9.99 currency',
    'עברית עם $\\sum_{i}$ באמצע',
    '',
  ]) {
    assert.equal(lossless(s), s);
  }
});

test('protection — bad input', () => {
  for (const bad of [null, undefined, 42, {}]) {
    assert.doesNotThrow(() => segmentMath(bad));
    assert.deepEqual(segmentMath(bad), []);
    assert.deepEqual(mathRuns(bad), []);
  }
});
