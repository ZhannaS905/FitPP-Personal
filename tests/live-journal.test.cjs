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
  const dialog = new EventTarget();
  dialog.showModal = () => { dialog.open = true; };
  dialog.close = () => { dialog.open = false; };
  const form = new EventTarget();
  const submitBtn = { hidden: false };
  form.querySelector = sel => sel === '[type=submit]' ? submitBtn : null;
  const modalTitle = { textContent: '' };
  const fields = { innerHTML: '' };
  const errorEl = { textContent: '' };
  const closeBtn = { disabled: false };
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
      querySelector: selector => {
        if (selector === '.schedule-tabs') return tabs;
        if (selector === '#dialog') return dialog;
        if (selector === '#form') return form;
        if (selector === '#modal-title') return modalTitle;
        if (selector === '#fields') return fields;
        if (selector === '#error') return errorEl;
        if (selector === '#close') return closeBtn;
        return null;
      },
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
    FitPPStore: {
      availableSubscriptions: () => [],
      debt: () => 0,
      subscriptionTerms: s => ({ name: s.name || 'Абонемент', locations: s.locations || ['zarya', 'pole', 'online'] })
    },
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
    app, click, reads, tick, window, data,
    dialog, modalTitle, fields, submitBtn, closeBtn,
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
  assert.match(journal.app.innerHTML, /Записано<\/span><\/div><div class="journal-stat-value"><strong>1/);

  journal.emit(sub, {}, 3);
  assert.doesNotMatch(journal.app.innerHTML, /Тестовый клиент|data-workout-id="other"/);
  assert.match(journal.app.innerHTML, /id="live-date" type="date" value="2026-11-10"/);
  assert.match(journal.app.innerHTML, /data-id="zarya" data-location="zarya" aria-pressed="true"/);
  assert.match(journal.app.innerHTML, /Записано<\/span><\/div><div class="journal-stat-value"><strong>0/);
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

test('clicking expiring stat card opens dialog with expiring client list', async () => {
  const journal = await openJournal();
  journal.data.clients = [{
    id: 'c1',
    name: 'Иван Иванов',
    phone: '+79991234567',
    subscriptions: [{
      id: 's1',
      name: 'Абонемент 8',
      left: 1,
      expires: '2026-11-20'
    }]
  }];
  journal.tick();
  assert.match(journal.app.innerHTML, /data-action="expiring"/);

  journal.click({ action: 'expiring' });
  assert.equal(journal.dialog.open, true);
  assert.match(journal.modalTitle.textContent, /Истекающие абонементы/);
  assert.match(journal.fields.innerHTML, /Иван Иванов/);
  assert.match(journal.fields.innerHTML, /Остаток: 1 занятие/);
  assert.match(journal.fields.innerHTML, /\+79991234567/);
  assert.equal(journal.submitBtn.hidden, true);
});
