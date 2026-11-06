const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { test } = require('node:test');
const { createContext, runInContext } = require('node:vm');

const calendar = require('../docs/calendar-model.js');
const bookingPath = 'fitppWorkspaces/personal-v1/states/bookings';
const owner = { uid: 'owner' };
const day = '2026-11-10';
const key = JSON.stringify(['client', 'lesson']);
const flush = () => new Promise(resolve => setImmediate(resolve));

async function openJournal() {
  const subscriptions = [];
  const reads = [];
  const window = new EventTarget();
  const app = new EventTarget();
  const tabs = new EventTarget();
  const click = dataset => {
    const event = new Event('click');
    Object.defineProperty(event, 'target', { value: { closest: () => ({ dataset }) } });
    app.dispatchEvent(event);
  };
  const data = {
    currentUser: owner,
    dataReady: true,
    canEdit: () => true,
    clients: [{ id: 'client', name: 'Тестовый клиент' }],
    workouts: {
      lesson: { id: 'lesson', date: day, originDate: day, time: '18:00', location: 'zarya' },
      other: { id: 'other', date: day, originDate: day, time: '19:00', location: 'pole' }
    }
  };
  const main = 'fitppWorkspaces/personal-v1/states/main';
  const snapshot = (value, metadata = {}) => ({ exists: true, data: () => value, metadata });
  let authChanged;
  let tick;
  const auth = {
    setPersistence: async () => {},
    onAuthStateChanged: fn => { authChanged = fn; }
  };
  const firestore = {
    doc: path => ({
      get: async () => {
        reads.push(path);
        return snapshot(path === main ? data : {});
      },
      onSnapshot: (options, next) => {
        const sub = { path, options, next, stops: 0 };
        subscriptions.push(sub);
        return () => { sub.stops++; };
      }
    })
  };
  const env = createContext({
    window,
    document: {
      body: {},
      getElementById: id => id === 'app' ? app : null,
      createElement: () => ({ setAttribute() {} }),
      querySelector: selector => selector === '.schedule-tabs' ? tabs : null,
      querySelectorAll: () => []
    },
    firebase: {
      initializeApp: () => ({ auth: () => auth, firestore: () => firestore }),
      auth: { Auth: { Persistence: { LOCAL: 'local' } } }
    },
    FitPPFirebaseConfig: {},
    FitPPEnvironment: {},
    FitPPWorkspace: { ...owner, ownerUid: owner.uid, datasetId: 'personal-v1', path: main, bookingPath, validate() {} },
    FitPPGroupsPanel: {
      reset() {},
      view: () => ({ groups: [{ id: 'zarya', name: 'Заря' }, { id: 'pole', name: 'Поле чудес' }] })
    },
    FitPPCalendar: calendar,
    FitPPStore: { availableSubscriptions: () => [], debt: () => 0 },
    FitPPOperations: { today: calendar.today },
    FitPPAccountingUI: { canManage: () => true },
    Alpine: { $data: () => data },
    setInterval: fn => { tick = fn; }
  });
  const load = name => runInContext(readFileSync(join(__dirname, '../docs', name), 'utf8'), env);
  load('cloud.js');
  env.FitPPApplication = { workspace: env.FitPPCloud.start() };
  await flush();
  authChanged(owner);
  load('live-journal.js');
  await flush();
  return {
    app, click, reads, tick, window,
    bookings: () => subscriptions.filter(sub => sub.path === bookingPath),
    setUser: user => { data.currentUser = user; authChanged(user); tick(); },
    emit: (sub, entries, version, metadata) => sub.next(snapshot({
      ownerUid: owner.uid, datasetId: 'personal-v1', entries, versions: { [key]: version }
    }, metadata))
  };
}

test('external snapshots add and remove one client while preserving the date and group', async () => {
  const journal = await openJournal();
  const [sub] = journal.bookings();
  assert.equal(sub.options.includeMetadataChanges, true);
  journal.click({ action: 'date', date: day });
  journal.click({ action: 'hall', id: 'zarya' });

  journal.emit(sub, { [key]: true }, 1, { fromCache: true });
  journal.emit(sub, { [key]: true }, 1, { hasPendingWrites: true });
  assert.doesNotMatch(journal.app.innerHTML, /Тестовый клиент/);

  const legacyKey = JSON.stringify(['client', day, 'zarya']);
  journal.emit(sub, { [legacyKey]: true, [key]: true }, 2);
  journal.emit(sub, { [legacyKey]: true, [key]: true }, 2);
  assert.equal(journal.app.innerHTML.match(/Тестовый клиент/g)?.length, 1);
  assert.match(journal.app.innerHTML, /data-version="2"/);
  assert.match(journal.app.innerHTML, /Записано<\/span><strong>1/);

  journal.emit(sub, {}, 3);
  assert.doesNotMatch(journal.app.innerHTML, /Тестовый клиент|data-workout-id="other"/);
  assert.match(journal.app.innerHTML, /id="live-date" type="date" value="2026-11-10"/);
  assert.match(journal.app.innerHTML, /data-id="zarya" data-location="zarya" aria-pressed="true"/);
  assert.match(journal.app.innerHTML, /Записано<\/span><strong>0/);
  journal.tick();
  assert.equal(journal.bookings().length, 1);
  assert.equal(journal.reads.includes(bookingPath), false);
});

test('sign-out and page hide unsubscribe once and discard stale callbacks', async () => {
  const journal = await openJournal();
  const [first] = journal.bookings();
  journal.setUser(null);
  journal.emit(first, { [key]: true }, 1);
  assert.equal(first.stops, 1);
  assert.match(journal.app.innerHTML, /Войдите в Firebase/);

  journal.setUser(owner);
  await flush();
  const [, second] = journal.bookings();
  journal.window.dispatchEvent(new Event('pagehide'));
  journal.window.dispatchEvent(new Event('pagehide'));
  journal.tick();
  assert.equal(second.stops, 1);
  assert.equal(journal.bookings().length, 2);

  journal.window.dispatchEvent(new Event('pageshow'));
  journal.window.dispatchEvent(new Event('pageshow'));
  await flush();
  journal.click({ action: 'date', date: day });
  journal.emit(second, { [key]: true }, 2);
  assert.doesNotMatch(journal.app.innerHTML, /Тестовый клиент/);
  assert.deepEqual(journal.bookings().map(sub => sub.stops), [1, 1, 0]);
});
