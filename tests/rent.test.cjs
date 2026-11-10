const assert = require('node:assert/strict');
const { test } = require('node:test');

const store = require('../docs/persistence.js');

test('November 2026 rent maintains historical weekday rules (Zarya Mon/Wed, Pole Tue/Thu)', () => {
  const zaryaDates = store.rentDates('2026-11', 'zarya');
  const poleDates = store.rentDates('2026-11', 'pole');

  // Verify Zarya dates are strictly Mondays (1) and Wednesdays (3)
  assert.ok(zaryaDates.length > 0);
  for (const date of zaryaDates) {
    const day = new Date(date + 'T12:00:00Z').getUTCDay();
    assert.ok([1, 3].includes(day), `Date ${date} must be Mon or Wed`);
  }

  // Verify Pole dates are strictly Tuesdays (2) and Thursdays (4)
  assert.ok(poleDates.length > 0);
  for (const date of poleDates) {
    const day = new Date(date + 'T12:00:00Z').getUTCDay();
    assert.ok([2, 4].includes(day), `Date ${date} must be Tue or Thu`);
  }
});

test('December 2026 onwards allows arbitrary days for rent calendar', () => {
  const zaryaDates = store.rentDates('2026-12', 'zarya');
  const poleDates = store.rentDates('2026-12', 'pole');

  // December has 31 days
  assert.equal(zaryaDates.length, 31);
  assert.equal(poleDates.length, 31);
  assert.equal(zaryaDates[0], '2026-12-01');
  assert.equal(zaryaDates[30], '2026-12-31');

  // Any custom days in December can be saved via rentMonth
  const data = store.read({
    clients: [], rentMonths: {}, attendance: {}, attendanceOps: {}, workouts: {}, visits: {}, visitOps: {}, legacyLinks: {}, legacySources: {}, finances: {}
  });

  // Pick a Friday, Saturday and Sunday for Zarya, and custom days for Pole
  const action = {
    type: 'rentMonth',
    month: '2026-12',
    zarya: ['2026-12-04', '2026-12-05', '2026-12-06'], // Fri, Sat, Sun
    pole: ['2026-12-10', '2026-12-11'] // Thu, Fri
  };

  const next = store.reduce(data, action, '2026-12-01');
  assert.deepEqual(next.rentMonths['2026-12'].zarya, ['2026-12-04', '2026-12-05', '2026-12-06']);
  assert.deepEqual(next.rentMonths['2026-12'].pole, ['2026-12-10', '2026-12-11']);

  // Total calculation: 3 * 800 + 2 * 600 = 2400 + 1200 = 3600
  assert.equal(store.rentTotal(next.rentMonths['2026-12']), 3600);
});
