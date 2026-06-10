const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeSeedanceDurationSec,
  parseSupportedDurations,
} = require('../src/services/volcengine-ark.service');

test('seedance duration is normalized to supported model values', () => {
  assert.deepEqual(parseSupportedDurations('10,5, bad,0'), [5, 10]);
  assert.equal(normalizeSeedanceDurationSec(1), 5);
  assert.equal(normalizeSeedanceDurationSec(3), 5);
  assert.equal(normalizeSeedanceDurationSec(5), 5);
  assert.equal(normalizeSeedanceDurationSec(6), 10);
  assert.equal(normalizeSeedanceDurationSec(15), 10);
  assert.equal(normalizeSeedanceDurationSec('bad'), 5);
});
