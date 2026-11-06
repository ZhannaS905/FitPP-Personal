const {test} = require('node:test');
const assert = require('node:assert/strict');
const ops = require('../docs/operations');
const groups = require('../docs/group-period-model');
const model = require('../docs/persistence').createProductionPricingModel();

function fixture() {
  const day = ops.today();
  const clientId = 42;
  const workout = id => ({id, location: 'zarya', date: day, originDate: day,
    time: '18:30', cancelled: false, extra: true});
  const meta = {ownerUid: ops.UID, datasetId: 'personal-v1', schemaVersion: 1};
  const docs = new Map([
    [ops.MAIN, {...meta, _fitppRevision: 0, clients: [{id: clientId, name: 'Local',
      locations: ['zarya'], subscriptions: []}], workouts: {zarya_extra_one: workout('zarya_extra_one'), zarya_extra_two: workout('zarya_extra_two')}}],
    ['trainers/' + ops.UID, {groupScheduleV1: groups.empty(ops.UID)}],
    ['fitppWorkspaces/personal-v1/states/bookings', {...meta, entries: {}}]
  ]);
  const snap = path => ({exists: docs.has(path), data: () => structuredClone(docs.get(path))});
  let failCommit = false;
  const db = {
    app: {options: {projectId: 'fitpp-personal'}},
    doc: path => ({path, get: async () => snap(path)}),
    async runTransaction(fn) {
      const writes = new Map();
      const result = await fn({
        get: async ref => snap(ref.path),
        set: (ref, data) => writes.set(ref.path, data),
        update: (ref, patch) => writes.set(ref.path, {...docs.get(ref.path), ...patch})
      });
      if (failCommit) throw Error('offline');
      for (const [path, data] of writes) docs.set(path, structuredClone(data));
      return result;
    }
  };
  const sale = {type: 'subscription', operationId: 'sale-one', clientId, date: day,
    templateId: 'plan-zarya', expectedTemplateRevision: 1, homeGroupId: 'zarya',
    received: 4400, method: 'cash'};
  const visit = {type: 'attendance', operationId: 'visit-one', clientId, workoutId: 'zarya_extra_one',
    date: day, location: 'zarya', status: 'attended'};
  const commit = action => ops.execute({db, uid: ops.UID, action, operationDay: day,
    expectedFingerprint: model.fingerprint(model.read(docs.get(ops.MAIN)))});
  const receipt = (id, collection = 'operations') => docs.get(ops.operationPath(collection, id));
  const events = (id, collection) => JSON.parse(receipt(id, collection).signature).personalNotificationsV1;
  return {sale, visit, commit, receipt, events, docs, fail: () => { failCommit = true; }};
}

test('sale, attendance and forfeiture use the committed receipt and balance, including legacy numeric client IDs', async () => {
  const f = fixture();
  await f.commit(f.sale);
  const payment = f.receipt('sale-one', 'paymentReceipts');
  assert.deepEqual(Object.keys(payment).sort(), ['at', 'clientId', 'entries', 'revision', 'signature', 'type']);
  assert.deepEqual(f.events('sale-one', 'paymentReceipts'), [{
    kind: 'purchase', subscriptionId: 'subscription-sale-one', sessions: 8,
    expires: model.addDays(f.sale.date, 28), remaining: 8
  }]);
  await f.commit(f.visit);
  await f.commit({...f.visit, operationId: 'miss-two', status: 'missed', workoutId: 'zarya_extra_two'});
  assert.equal(f.events('visit-one')[0].remaining, 7);
  assert.equal(f.events('visit-one')[0].kind, 'attended');
  assert.equal(f.events('miss-two')[0].remaining, 6);
  assert.equal(f.events('miss-two')[0].kind, 'missed');
  const revision = f.docs.get(ops.MAIN)._fitppRevision;
  await f.commit(f.sale);
  await f.commit(f.visit);
  await f.commit({...f.visit, operationId: 'same-mark'});
  assert.equal(f.docs.get(ops.MAIN)._fitppRevision, revision);
  assert.equal(f.receipt('same-mark'), undefined);
  await assert.rejects(f.commit({...f.visit, status: 'missed'}), /OPERATION_ID_REUSED/);
  await f.commit({...f.visit, operationId: 'clear-one', status: null});
  assert.equal(f.events('clear-one'), undefined);
});

test('combined sale and visit snapshot both events, and a failed transaction persists neither', async () => {
  const f = fixture();
  const {date, location, workoutId} = f.visit;
  const sale = {...f.sale, visit: {date, location, workoutId, requireAttendance: true}};
  await f.commit(sale);
  assert.deepEqual(f.events('sale-one', 'paymentReceipts').map(e => [e.kind, e.remaining]),
    [['purchase', 7], ['attended', 7]]);
  const other = fixture();
  other.fail();
  await assert.rejects(other.commit(sale), /offline/);
  assert.equal(other.receipt('sale-one', 'paymentReceipts'), undefined);
  assert.equal(other.docs.get(ops.MAIN)._fitppRevision, 0);
});

test('single attendance is distinct from a subscription write-off', async () => {
  const f = fixture();
  await f.commit({...f.visit, singlePayment: true, method: 'cash', received: 700, paymentDate: f.visit.date});
  const [event] = f.events('visit-one', 'paymentReceipts');
  assert.equal(event.kind, 'attended');
  assert.equal(event.price, 700);
  assert.equal(event.remaining, undefined);
});

test('a pre-feature receipt still deduplicates and booking keeps its original signature', async () => {
  const f = fixture();
  await f.commit(f.sale);
  const payment = f.receipt('sale-one', 'paymentReceipts');
  const original = model.fingerprint({action: f.sale, operationDay: f.sale.date});
  payment.signature = original;
  await f.commit(f.sale);
  assert.equal(f.receipt('sale-one', 'paymentReceipts').signature, original);
  const key = JSON.stringify(['42', f.visit.workoutId]);
  const workout = f.docs.get(ops.MAIN).workouts[f.visit.workoutId];
  const action = {type: 'booking', operationId: 'booking-one', key, desired: true,
    expectedVersion: 0, workout};
  const before = structuredClone(f.docs.get(ops.MAIN));
  const after = await f.commit(action);
  assert.equal(f.events('booking-one'), undefined);
  assert.deepEqual(after.clients, before.clients);
  assert.deepEqual(after.visitOps, before.visitOps);
  assert.equal(f.docs.get('fitppWorkspaces/personal-v1/states/bookings').entries[key], true);
});
