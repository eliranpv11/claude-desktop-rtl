'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { isMirrorArrow, hasMirrorArrow, arrowFlipOffsets } = require('../arrows.js');

test('arrow classification', () => {
  assert.equal(isMirrorArrow('→'), true);
  assert.equal(isMirrorArrow('←'), true);
  assert.equal(isMirrorArrow('⇒'), true);
  assert.equal(isMirrorArrow('↑'), false); // vertical, no mirror
  assert.equal(isMirrorArrow('A'), false);
  assert.equal(hasMirrorArrow('שלב א → שלב ב'), true);
  assert.equal(hasMirrorArrow('no arrows here'), false);
});

test('arrow in RTL prose flips', () => {
  const s = 'קלט → פלט';
  const offs = arrowFlipOffsets(s);
  assert.equal(offs.length, 1);
  assert.equal(s.slice(offs[0].start, offs[0].end), '→');
});

test('arrow between two English words does NOT flip', () => {
  assert.equal(arrowFlipOffsets('input → output').length, 0);
});

test('arrow inside math run does NOT flip', () => {
  // f: X → Y is math notation; the → sits inside a $...$ run.
  assert.equal(arrowFlipOffsets('הפונקציה $f: X → Y$ ממפה').length, 0);
});

test('protection — bad input', () => {
  for (const bad of [null, undefined, 42, {}]) {
    assert.doesNotThrow(() => arrowFlipOffsets(bad));
    assert.deepEqual(arrowFlipOffsets(bad), []);
    assert.equal(hasMirrorArrow(bad), false);
  }
});
