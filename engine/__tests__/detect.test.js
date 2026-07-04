'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  firstStrong,
  majority,
  stripLeadingNoise,
  detectBlockDir,
  resolvedDir,
  plaintextOverrideDir,
} = require('../detect.js');

test('firstStrong', () => {
  assert.equal(firstStrong('שלום world'), 'rtl');
  assert.equal(firstStrong('hello עולם'), 'ltr');
  assert.equal(firstStrong('123 !@# '), null);
  assert.equal(firstStrong('  →  שלום'), 'rtl'); // leading neutrals skipped
});

test('majority', () => {
  assert.equal(majority('שלום עולם hello'), 'rtl');
  assert.equal(majority('the term שלום here now'), 'ltr');
  assert.equal(majority('12345 ...'), null);
});

test('stripLeadingNoise exposes the real first strong char', () => {
  assert.equal(firstStrong(stripLeadingNoise('1. שלום')), 'rtl');
  assert.equal(firstStrong(stripLeadingNoise('- שלום')), 'rtl');
  assert.equal(firstStrong(stripLeadingNoise('`code` שלום')), 'rtl');
  assert.equal(firstStrong(stripLeadingNoise('https://x.com שלום')), 'rtl');
  assert.equal(firstStrong(stripLeadingNoise('2,200 ₪ עולה')), 'rtl');
});

test('detectBlockDir — core cases', () => {
  assert.equal(detectBlockDir('שלום עולם'), 'rtl');
  assert.equal(detectBlockDir('pure english sentence'), 'ltr');
  assert.equal(detectBlockDir('1. שלום עולם'), 'rtl'); // ordinal-led Hebrew
  assert.equal(detectBlockDir('12345'), null); // no strong content → null
  assert.equal(detectBlockDir(''), null);
});

test('§8.K — English doc with embedded Hebrew is NEVER forced RTL', () => {
  // The cardinal rule: a majority-English block stays LTR even though it holds Hebrew.
  assert.equal(detectBlockDir('The term שלום means peace in Hebrew'), 'ltr');
  assert.equal(plaintextOverrideDir('The term שלום means peace'), null);
});

test('plaintextOverrideDir — Latin-opener Hebrew block flips, English does not', () => {
  // Hebrew block that opens with Latin → CSS plaintext would misfire → override to rtl.
  assert.equal(plaintextOverrideDir('React הוא ספרייה מצוינת לבניית ממשקים'), 'rtl');
  assert.equal(resolvedDir('React הוא ספרייה מצוינת לבניית ממשקים'), 'ltr'); // what CSS would do
  // Pure/majority English → never overridden.
  assert.equal(plaintextOverrideDir('React is a UI library'), null);
});

test('protection — bad input yields null, never throws', () => {
  for (const bad of [null, undefined, 42, {}, []]) {
    assert.doesNotThrow(() => detectBlockDir(bad));
    assert.doesNotThrow(() => plaintextOverrideDir(bad));
    assert.equal(detectBlockDir(bad), null);
    assert.equal(plaintextOverrideDir(bad), null);
    assert.equal(firstStrong(bad), null);
  }
});
