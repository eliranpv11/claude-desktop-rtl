'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  isENDigit,
  isANDigit,
  isDigit,
  digitScript,
  leadingNumber,
  signedNumberRuns,
} = require('../numbers.js');

test('digit predicates', () => {
  assert.equal(isENDigit('7'), true);
  assert.equal(isENDigit('٧'), false);
  assert.equal(isANDigit('٧'), true);
  assert.equal(isANDigit('۷'), true);
  assert.equal(isANDigit('7'), false);
  assert.equal(isDigit('7'), true);
  assert.equal(isDigit('٧'), true);
  assert.equal(isDigit('x'), false);
});

test('digitScript classification', () => {
  assert.equal(digitScript('room 101'), 'en');
  assert.equal(digitScript('غرفة ١٠١'), 'an');
  assert.equal(digitScript('mix 1 and ١'), 'mixed');
  assert.equal(digitScript('no digits here'), null);
});

test('leadingNumber — number-led lines', () => {
  assert.equal(leadingNumber('2,200 ₪ זה המחיר') > 0, true);
  assert.equal(leadingNumber('  15 items'), '  15'.length);
  assert.equal(leadingNumber('שלום עולם'), 0);
  assert.equal(leadingNumber('-5 degrees'), '-5'.length);
});

test('signedNumberRuns — sign attaches only at a boundary', () => {
  // A real signed number is detected.
  const a = signedNumberRuns('הטמפרטורה -5 מעלות');
  assert.equal(a.length, 1);
  assert.equal('הטמפרטורה -5 מעלות'.slice(a[0].start, a[0].end), '-5');

  // The Hebrew prefix "ל-15" must NOT be read as a minus sign.
  const b = signedNumberRuns('ל-15 אנשים');
  assert.equal(b.length, 0);

  // Plus and unicode minus both recognised.
  assert.equal(signedNumberRuns('gain +12 points').length, 1);
  assert.equal(signedNumberRuns('שינוי −8 יחידות').length, 1);
});

test('protection — bad input yields empty results, never throws', () => {
  for (const bad of [null, undefined, 42, {}, []]) {
    assert.doesNotThrow(() => digitScript(bad));
    assert.doesNotThrow(() => leadingNumber(bad));
    assert.doesNotThrow(() => signedNumberRuns(bad));
    assert.equal(leadingNumber(bad), 0);
    assert.deepEqual(signedNumberRuns(bad), []);
    assert.equal(digitScript(bad), null);
  }
});
