'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { looksLikeCode, codeBlockIsProse } = require('../code.js');

test('real code is detected', () => {
  assert.equal(looksLikeCode('function add(a, b) { return a + b; }'), true);
  assert.equal(looksLikeCode('const x = 5'), true);
  assert.equal(looksLikeCode('for i in range(10):'), true);
  assert.equal(looksLikeCode('  indented line'), true);
  assert.equal(looksLikeCode('# a shell comment'), true);
});

test('plain Hebrew prose is not code', () => {
  assert.equal(looksLikeCode('זהו סתם משפט בעברית'), false);
});

test('codeBlockIsProse — mis-fenced Hebrew table reads as prose', () => {
  const table = 'תה ירוק   10\nתה שחור   12\nקפה       8';
  assert.equal(codeBlockIsProse(table), true);
});

test('codeBlockIsProse — real code with Hebrew comment stays code', () => {
  const src = 'function brew() { return 42; } // מכין קפה';
  assert.equal(codeBlockIsProse(src), false);
});

test('codeBlockIsProse — pure English code is not prose', () => {
  assert.equal(codeBlockIsProse('const answer = 42;'), false);
});

test('protection — bad input', () => {
  for (const bad of [null, undefined, 42, {}]) {
    assert.doesNotThrow(() => looksLikeCode(bad));
    assert.doesNotThrow(() => codeBlockIsProse(bad));
    assert.equal(looksLikeCode(bad), false);
    assert.equal(codeBlockIsProse(bad), false);
  }
});
