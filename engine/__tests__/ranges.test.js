'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { isStrongRTL, isStrongLTR, isRTLDigit, hasRTL } = require('../ranges.js');

test('isStrongRTL — Hebrew and Arabic letters', () => {
  assert.equal(isStrongRTL('א'), true);
  assert.equal(isStrongRTL('ת'), true);
  assert.equal(isStrongRTL('ع'), true);
  assert.equal(isStrongRTL('ب'), true);
});

test('isStrongRTL — astral RTL (Adlam) via code point and char', () => {
  assert.equal(isStrongRTL(0x1e900), true);
  assert.equal(isStrongRTL('𞤀'), true); // Adlam, surrogate pair
});

test('isStrongRTL — Latin/digits/punct are not RTL', () => {
  assert.equal(isStrongRTL('A'), false);
  assert.equal(isStrongRTL('5'), false);
  assert.equal(isStrongRTL('.'), false);
  assert.equal(isStrongRTL(' '), false);
});

test('isStrongLTR — Latin/Greek/Cyrillic/CJK are strong LTR', () => {
  assert.equal(isStrongLTR('A'), true);
  assert.equal(isStrongLTR('Ω'), true);
  assert.equal(isStrongLTR('Я'), true);
  assert.equal(isStrongLTR('中'), true);
});

test('isStrongLTR — RTL letters, digits, neutrals are not LTR', () => {
  assert.equal(isStrongLTR('א'), false);
  assert.equal(isStrongLTR('5'), false);
  assert.equal(isStrongLTR('!'), false);
});

test('isRTLDigit — Arabic-Indic and Persian digits', () => {
  assert.equal(isRTLDigit('٥'), true); // Arabic-Indic 5
  assert.equal(isRTLDigit('۵'), true); // Persian 5
  assert.equal(isRTLDigit('5'), false); // European
});

test('hasRTL — presence of any strong RTL', () => {
  assert.equal(hasRTL('hello שלום'), true);
  assert.equal(hasRTL('pure english 123'), false);
  assert.equal(hasRTL(''), false);
});

test('protection — bad input never throws', () => {
  for (const bad of [null, undefined, 42, {}, [], NaN, -1, 0x110000]) {
    assert.doesNotThrow(() => isStrongRTL(bad));
    assert.doesNotThrow(() => isStrongLTR(bad));
    assert.doesNotThrow(() => isRTLDigit(bad));
    assert.doesNotThrow(() => hasRTL(bad));
  }
  assert.equal(hasRTL(null), false);
  assert.equal(isStrongRTL(undefined), false);
});
